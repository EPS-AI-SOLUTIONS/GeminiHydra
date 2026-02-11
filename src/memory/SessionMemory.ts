/**
 * Session Memory System (Features 1-5)
 * Agent: Jaskier (Documentation/UX)
 *
 * 1. Session Snapshots - Auto-save state every N minutes
 * 2. Session Resume - Continue last session with full context
 * 3. Named Sessions - Named sessions for later return
 * 4. Session Branching - Fork sessions for experimentation
 * 5. Session Export - Export to markdown/JSON
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { SESSION_DIR } from '../config/paths.config.js';
import { loadFromFile, saveToFile } from '../native/persistence.js';
import {
  BaseMemory,
  estimateSize,
  generateId,
  type MemoryOptions,
  type MemoryStats,
  reviveDates,
} from './BaseMemory.js';

const SESSIONS_DIR = SESSION_DIR;

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agent?: string;
}

export interface SessionSnapshot {
  id: string;
  name: string;
  created: Date;
  updated: Date;
  messages: Message[];
  context: Record<string, unknown>;
  parentId?: string; // For branching
  tags: string[];
}

interface SessionMemoryOptions extends MemoryOptions {
  autoSaveMinutes?: number;
}

export class SessionMemory extends BaseMemory<SessionSnapshot> {
  private currentSession: SessionSnapshot | null = null;
  private autoSaveInterval: NodeJS.Timeout | null = null;
  private autoSaveMinutes: number;

  // Session-specific date fields
  protected override dateFields = ['created', 'updated', 'timestamp'];

  constructor(options: SessionMemoryOptions = {}) {
    super({
      ...options,
      persistPath: options.persistPath || SESSIONS_DIR,
    });
    this.autoSaveMinutes = options.autoSaveMinutes || 5;
  }

  // ============================================================================
  // BaseMemory Abstract Methods Implementation
  // ============================================================================

  serialize(): string {
    return this.currentSession ? this.serializeData(this.currentSession) : '{}';
  }

  deserialize(data: string): void {
    const parsed = this.deserializeData<SessionSnapshot & Record<string, unknown>>(data, [
      'created',
      'updated',
    ]);
    if (parsed?.id) {
      this.currentSession = {
        ...parsed,
        messages: (parsed.messages || []).map(
          (m: Message) =>
            reviveDates(m as unknown as Record<string, unknown>, [
              'timestamp',
            ]) as unknown as Message,
        ),
      } as SessionSnapshot;
    } else {
      this.currentSession = null;
    }
  }

  protected initializeEmpty(): void {
    this.currentSession = null;
  }

  getStats(): MemoryStats {
    const messages = this.currentSession?.messages || [];
    const timestamps = messages.map((m) => m.timestamp).sort((a, b) => a.getTime() - b.getTime());

    return {
      entries: messages.length,
      size: estimateSize(this.currentSession),
      oldestEntry: timestamps[0],
      newestEntry: timestamps[timestamps.length - 1],
    };
  }

  getEntryCount(): number {
    return this.currentSession?.messages.length || 0;
  }

  clear(): void {
    this.currentSession = null;
    this.scheduleSave();
  }

  // ============================================================================
  // Lifecycle Overrides
  // ============================================================================

  async init(): Promise<void> {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
    this.initialized = true;
  }

  async load(): Promise<void> {
    // SessionMemory loads individual session files, not a single file
    // This is handled by loadSession()
  }

  async save(): Promise<void> {
    await this.saveSnapshot();
  }

  protected async ensureDir(): Promise<void> {
    await fs.mkdir(SESSIONS_DIR, { recursive: true });
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Start a new session
   */
  async startSession(name?: string): Promise<string> {
    const id = generateId();

    this.currentSession = {
      id,
      name: name || `session-${new Date().toISOString().split('T')[0]}`,
      created: new Date(),
      updated: new Date(),
      messages: [],
      context: {},
      tags: [],
    };

    await this.saveSnapshot();
    this.startAutoSave();

    console.log(chalk.green(`Session started: ${this.currentSession.name} (${id})`));
    return id;
  }

  /**
   * Resume a previous session (Feature 2)
   */
  async resumeSession(sessionId?: string): Promise<SessionSnapshot | null> {
    if (sessionId) {
      return this.loadSession(sessionId);
    }

    // Resume last session
    const sessions = await this.listSessions();
    if (sessions.length === 0) {
      console.log(chalk.yellow('No previous sessions found'));
      return null;
    }

    const lastSession = sessions[0]; // Already sorted by updated
    return this.loadSession(lastSession.id);
  }

  /**
   * Load a specific session
   */
  async loadSession(sessionId: string): Promise<SessionSnapshot | null> {
    const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
    const data = await loadFromFile<Record<string, unknown>>(filePath);

    if (data) {
      this.deserialize(JSON.stringify(data));
      this.startAutoSave();
      console.log(chalk.green(`Session resumed: ${this.currentSession?.name}`));
      return this.currentSession;
    } else {
      console.log(chalk.red(`Session not found: ${sessionId}`));
      return null;
    }
  }

  /**
   * Branch current session (Feature 4)
   */
  async branchSession(branchName: string): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active session to branch');
    }

    const parentId = this.currentSession.id;
    const newId = generateId();

    this.currentSession = {
      ...this.currentSession,
      id: newId,
      name: branchName,
      parentId,
      created: new Date(),
      updated: new Date(),
    };

    await this.saveSnapshot();
    console.log(chalk.cyan(`Session branched: ${branchName} (from ${parentId})`));
    return newId;
  }

  /**
   * Add message to current session
   */
  async addMessage(
    role: 'user' | 'assistant' | 'system',
    content: string,
    agent?: string,
  ): Promise<void> {
    if (!this.currentSession) {
      await this.startSession();
    }

    this.currentSession?.messages.push({
      role,
      content,
      timestamp: new Date(),
      agent,
    });

    if (this.currentSession) {
      this.currentSession.updated = new Date();
    }
    this.scheduleSave();
  }

  /**
   * Set context value
   */
  setContext(key: string, value: unknown): void {
    if (this.currentSession) {
      this.currentSession.context[key] = value;
      this.scheduleSave();
    }
  }

  /**
   * Get context value
   */
  getContext(key: string): unknown {
    return this.currentSession?.context[key];
  }

  /**
   * Get recent messages for context
   */
  getRecentMessages(count: number = 10): Message[] {
    return this.currentSession?.messages.slice(-count) || [];
  }

  /**
   * Save snapshot (Feature 1)
   */
  async saveSnapshot(): Promise<void> {
    if (!this.currentSession) return;

    const filePath = path.join(SESSIONS_DIR, `${this.currentSession.id}.json`);
    await saveToFile(filePath, this.currentSession);
    this.dirty = false;
  }

  /**
   * Start auto-save interval
   */
  private startAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
    }

    this.autoSaveInterval = setInterval(
      async () => {
        await this.saveSnapshot();
        console.log(chalk.gray(`[Auto-save] Session saved`));
      },
      this.autoSaveMinutes * 60 * 1000,
    );
  }

  /**
   * Stop auto-save
   */
  stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  /**
   * List all sessions (Feature 3)
   */
  async listSessions(): Promise<
    Array<{ id: string; name: string; updated: Date; messageCount: number }>
  > {
    try {
      const files = await fs.readdir(SESSIONS_DIR);
      const sessions: Array<{ id: string; name: string; updated: Date; messageCount: number }> = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(SESSIONS_DIR, file);
          const data = await loadFromFile<Record<string, unknown>>(filePath);
          if (data) {
            sessions.push({
              id: data.id as string,
              name: data.name as string,
              updated: new Date(data.updated as string | number),
              messageCount: (data.messages as unknown[] | undefined)?.length || 0,
            });
          }
        }
      }

      // Sort by updated (most recent first)
      return sessions.sort((a, b) => b.updated.getTime() - a.updated.getTime());
    } catch {
      return [];
    }
  }

  /**
   * Export session (Feature 5)
   */
  async exportSession(format: 'markdown' | 'json' = 'markdown'): Promise<string> {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    if (format === 'json') {
      return JSON.stringify(this.currentSession, null, 2);
    }

    // Markdown format
    let md = `# Session: ${this.currentSession.name}\n\n`;
    md += `**ID:** ${this.currentSession.id}\n`;
    md += `**Created:** ${this.currentSession.created.toISOString()}\n`;
    md += `**Updated:** ${this.currentSession.updated.toISOString()}\n`;

    if (this.currentSession.parentId) {
      md += `**Branched from:** ${this.currentSession.parentId}\n`;
    }

    if (this.currentSession.tags.length > 0) {
      md += `**Tags:** ${this.currentSession.tags.join(', ')}\n`;
    }

    md += `\n## Conversation\n\n`;

    for (const msg of this.currentSession.messages) {
      const roleLabel =
        msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System';
      const agentInfo = msg.agent ? ` (${msg.agent})` : '';
      md += `### ${roleLabel}${agentInfo}\n`;
      md += `*${msg.timestamp.toISOString()}*\n\n`;
      md += `${msg.content}\n\n---\n\n`;
    }

    return md;
  }

  /**
   * Export to file
   */
  async exportToFile(filepath: string, format: 'markdown' | 'json' = 'markdown'): Promise<void> {
    const content = await this.exportSession(format);
    if (format === 'json') {
      await saveToFile(filepath, JSON.parse(content));
    } else {
      await fs.writeFile(filepath, content, 'utf-8');
    }
    console.log(chalk.green(`Session exported to: ${filepath}`));
  }

  /**
   * Add tag to session
   */
  addTag(tag: string): void {
    if (this.currentSession && !this.currentSession.tags.includes(tag)) {
      this.currentSession.tags.push(tag);
      this.scheduleSave();
    }
  }

  /**
   * Get current session
   */
  getCurrentSession(): SessionSnapshot | null {
    return this.currentSession;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
      await fs.unlink(filePath);
      console.log(chalk.yellow(`Session deleted: ${sessionId}`));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Search sessions by content
   */
  async searchSessions(query: string): Promise<Array<{ session: string; matches: string[] }>> {
    const sessions = await this.listSessions();
    const results: Array<{ session: string; matches: string[] }> = [];

    for (const session of sessions) {
      const filePath = path.join(SESSIONS_DIR, `${session.id}.json`);
      const parsed = await loadFromFile<SessionSnapshot>(filePath);

      if (parsed) {
        const matches: string[] = [];

        for (const msg of parsed.messages) {
          if (msg.content.toLowerCase().includes(query.toLowerCase())) {
            matches.push(`${msg.content.substring(0, 100)}...`);
          }
        }

        if (matches.length > 0) {
          results.push({ session: session.name, matches });
        }
      }
    }

    return results;
  }

  /**
   * Close and cleanup
   */
  async close(): Promise<void> {
    this.stopAutoSave();
    await this.flush();
    this.initialized = false;
  }
}

export const sessionMemory = new SessionMemory();

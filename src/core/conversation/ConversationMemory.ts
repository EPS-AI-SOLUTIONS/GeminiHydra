/**
 * ConversationMemory.ts - Feature #21: Conversation Memory
 *
 * Maintains context across multiple interactions.
 * Provides session management, turn tracking, and context persistence.
 *
 * Part of ConversationLayer refactoring - extracted from lines 27-156
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

// ============================================================
// Types & Interfaces
// ============================================================

export interface ConversationTurn {
  id: string;
  timestamp: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  intent?: string;
  entities?: Record<string, string>;
  importance: number; // 0-1 for pruning
}

export interface ConversationSession {
  id: string;
  startTime: number;
  lastActivity: number;
  turns: ConversationTurn[];
  context: Record<string, unknown>;
  topics: string[];
}

// ============================================================
// ConversationMemory Class
// ============================================================

export class ConversationMemory {
  private sessions: Map<string, ConversationSession> = new Map();
  private currentSessionId: string | null = null;
  private maxTurns: number = 50;
  private persistPath: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath || path.join(process.cwd(), '.gemini', 'conversations.json');
  }

  async initialize(): Promise<void> {
    try {
      const dir = path.dirname(this.persistPath);
      await fs.mkdir(dir, { recursive: true });

      const data = await fs.readFile(this.persistPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.sessions = new Map(Object.entries(parsed.sessions || {}));
      console.log(chalk.gray(`[ConversationMemory] Loaded ${this.sessions.size} sessions`));
    } catch {
      // Fresh start
    }
  }

  startSession(): string {
    const sessionId = crypto.randomUUID();
    const session: ConversationSession = {
      id: sessionId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      turns: [],
      context: {},
      topics: [],
    };
    this.sessions.set(sessionId, session);
    this.currentSessionId = sessionId;
    console.log(chalk.cyan(`[ConversationMemory] Started session: ${sessionId.slice(0, 8)}...`));
    return sessionId;
  }

  addTurn(
    role: 'user' | 'assistant' | 'system',
    content: string,
    importance: number = 0.5,
  ): ConversationTurn {
    if (!this.currentSessionId) {
      this.startSession();
    }

    const sessionId = this.currentSessionId;
    if (!sessionId) return undefined as unknown as ConversationTurn;
    const session = this.sessions.get(sessionId);
    if (!session) return undefined as unknown as ConversationTurn;
    const turn: ConversationTurn = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      role,
      content,
      importance,
    };

    session.turns.push(turn);
    session.lastActivity = Date.now();

    // Prune if needed
    if (session.turns.length > this.maxTurns) {
      this.pruneSession(session);
    }

    return turn;
  }

  private pruneSession(session: ConversationSession): void {
    // Keep high-importance turns, prune low-importance ones
    const sorted = [...session.turns].sort((a, b) => b.importance - a.importance);
    const keep = sorted.slice(0, this.maxTurns * 0.7);
    session.turns = keep.sort((a, b) => a.timestamp - b.timestamp);
    console.log(chalk.gray(`[ConversationMemory] Pruned session to ${session.turns.length} turns`));
  }

  getContext(maxTurns: number = 10): string {
    if (!this.currentSessionId) return '';

    const session = this.sessions.get(this.currentSessionId);
    if (!session) return '';

    const recentTurns = session.turns.slice(-maxTurns);
    return recentTurns.map((t) => `[${t.role}]: ${t.content}`).join('\n');
  }

  getCurrentSession(): ConversationSession | undefined {
    if (!this.currentSessionId) return undefined;
    return this.sessions.get(this.currentSessionId);
  }

  async persist(): Promise<void> {
    try {
      const data = {
        sessions: Object.fromEntries(this.sessions),
        lastSaved: Date.now(),
      };
      await fs.writeFile(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`[ConversationMemory] Persist failed: ${msg}`));
    }
  }

  getSessionStats(): { sessions: number; totalTurns: number; currentTurns: number } {
    let totalTurns = 0;
    for (const [, s] of this.sessions) totalTurns += s.turns.length;
    const currentTurns = this.currentSessionId
      ? this.sessions.get(this.currentSessionId)?.turns.length || 0
      : 0;
    return { sessions: this.sessions.size, totalTurns, currentTurns };
  }
}

// ============================================================
// Default Instance
// ============================================================

export const conversationMemory = new ConversationMemory();

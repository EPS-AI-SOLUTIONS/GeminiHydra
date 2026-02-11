/**
 * VectorStore - Memory storage for agent swarm
 * Extended with per-agent JSONL support (ported from AgentSwarm.psm1 lines 145-193)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getErrorCodeSafe } from '../core/errors.js';
import { loadFromFile, saveToFile } from '../native/persistence.js';
import { type AgentRole, resolveAgentRoleSafe, type SwarmMemory } from '../types/index.js';

/**
 * Memory entry for JSONL storage
 */
interface AgentMemoryEntry {
  id: string;
  timestamp: string;
  agent: string;
  type: string;
  content: string;
  tags: string;
}

/**
 * VectorStore - Original JSON-based memory
 */
export class VectorStore {
  private memoryPath: string;
  private memories: SwarmMemory[] = [];

  constructor(basePath: string) {
    this.memoryPath = path.join(basePath, 'memories.json');
  }

  async load() {
    const data = await loadFromFile<SwarmMemory[]>(this.memoryPath);
    if (data) {
      this.memories = data;
    } else {
      this.memories = [];
    }
  }

  async save() {
    await saveToFile(this.memoryPath, this.memories);
  }

  async add(
    agent: AgentRole | string,
    type: SwarmMemory['type'],
    content: string,
    tags: string[] = [],
  ) {
    const memory: SwarmMemory = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agent: resolveAgentRoleSafe(agent as string),
      type,
      content,
      tags,
    };
    this.memories.push(memory);
    await this.save();
  }

  // Simple keyword search replacing Vector Search for Phase 1
  // Real embeddings can be added later via 'ollama.embeddings'
  async search(query: string, limit: number = 5): Promise<SwarmMemory[]> {
    const terms = query.toLowerCase().split(' ');

    const scored = this.memories.map((mem) => {
      let score = 0;
      const text = `${mem.content} ${mem.tags.join(' ')}`.toLowerCase();
      terms.forEach((term) => {
        if (text.includes(term)) score++;
      });
      return { mem, score };
    });

    return scored
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.mem);
  }
}

/**
 * AgentVectorMemory - Per-agent JSONL storage
 * Ported from AgentSwarm.psm1 Get-VectorMemory and Add-VectorMemory
 */
export class AgentVectorMemory {
  private basePath: string;

  constructor(basePath: string = '.serena/memories/vectordb') {
    this.basePath = path.join(process.cwd(), basePath);
  }

  /**
   * Get file path for agent's memory
   */
  private getFilePath(agentName: string): string {
    return path.join(this.basePath, `${agentName}.jsonl`);
  }

  /**
   * Add memory entry (append-only JSONL)
   * Ported from PS1 lines 145-165
   */
  async add(agentName: string, type: string, content: string, tags: string = ''): Promise<void> {
    // Ensure directory exists
    await fs.mkdir(this.basePath, { recursive: true });

    const entry: AgentMemoryEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      agent: agentName,
      type,
      content,
      tags,
    };

    const filePath = this.getFilePath(agentName);
    await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`);
  }

  /**
   * Search agent's memories
   * Ported from PS1 Get-VectorMemory (lines 167-193)
   */
  async search(
    agentName: string,
    query: string,
    topK: number = 5,
    typeFilter?: string,
    excludeType?: string,
  ): Promise<AgentMemoryEntry[]> {
    const filePath = this.getFilePath(agentName);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      let memories = content
        .trim()
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as AgentMemoryEntry);

      // Apply type filters
      if (typeFilter) {
        memories = memories.filter((m) => m.type === typeFilter);
      }
      if (excludeType) {
        memories = memories.filter((m) => m.type !== excludeType);
      }

      // If no query, return latest
      if (!query) {
        return memories.slice(-topK).reverse();
      }

      // Keyword scoring (PS1 style)
      const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((k) => k.length > 2);

      const scored = memories.map((m) => {
        let score = 0;
        const text = `${m.content} ${m.tags}`.toLowerCase();

        for (const keyword of keywords) {
          if (text.includes(keyword)) score++;
        }

        // Type boost (PS1 behavior)
        if (m.type === 'error' && score > 0) score += 10;
        if (m.type === 'LessonLearned' && score > 0) score += 5;
        if (m.type === 'WorkflowPattern' && score > 0) score += 3;

        return { memory: m, score };
      });

      return scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map((s) => s.memory);
    } catch (error: unknown) {
      if (getErrorCodeSafe(error) === 'ENOENT') {
        return []; // File doesn't exist yet
      }
      throw error;
    }
  }

  /**
   * Get contextual memories with token limit
   * Ported from PS1 Get-ContextualMemories (lines 176-193)
   */
  async getContextual(
    agentName: string,
    query: string,
    tokenLimit: number = 8192,
  ): Promise<string> {
    const memories: { type: string; content: string; timestamp: string }[] = [];
    let tokenCount = 0;

    // Get related memories
    const related = await this.search(agentName, query, 10);

    for (const mem of related) {
      // Rough token estimate (1 token ≈ 4 chars)
      const memTokens = mem.content.length / 4;

      if (tokenCount + memTokens < tokenLimit) {
        memories.push({
          type: mem.type,
          content: mem.content.substring(0, 500), // Truncate long content
          timestamp: mem.timestamp,
        });
        tokenCount += memTokens;
      }
    }

    if (memories.length === 0) {
      return '';
    }

    return JSON.stringify(memories, null, 2);
  }

  /**
   * Get all memories for an agent
   */
  async getAll(agentName: string): Promise<AgentMemoryEntry[]> {
    const filePath = this.getFilePath(agentName);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content
        .trim()
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as AgentMemoryEntry);
    } catch {
      return [];
    }
  }

  /**
   * Clear agent's memories
   */
  async clear(agentName: string): Promise<void> {
    const filePath = this.getFilePath(agentName);
    try {
      await fs.unlink(filePath);
    } catch {
      // File might not exist
    }
  }

  /**
   * List all agents with memories
   */
  async listAgents(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.basePath);
      return files.filter((f) => f.endsWith('.jsonl')).map((f) => f.replace('.jsonl', ''));
    } catch {
      return [];
    }
  }

  /**
   * Get memory stats
   */
  async getStats(agentName?: string): Promise<Record<string, number>> {
    const stats: Record<string, number> = {};

    if (agentName) {
      const memories = await this.getAll(agentName);
      stats[agentName] = memories.length;
    } else {
      const agents = await this.listAgents();
      for (const agent of agents) {
        const memories = await this.getAll(agent);
        stats[agent] = memories.length;
      }
    }

    return stats;
  }
}

// Export singleton for convenience
export const agentVectorMemory = new AgentVectorMemory();

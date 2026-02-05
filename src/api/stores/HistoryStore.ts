/**
 * History Store
 * In-memory message history management
 */

import type { Message, MessageRole, MessageMetadata } from '../types/index.js';
import { API_CONFIG } from '../config/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// ID Generation
// ═══════════════════════════════════════════════════════════════════════════

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Store Class
// ═══════════════════════════════════════════════════════════════════════════

export interface AddMessageInput {
  role: MessageRole;
  content: string;
  agent?: string;
  tier?: string;
  metadata?: MessageMetadata;
}

export class HistoryStore {
  private messages: Message[] = [];
  private readonly maxSize: number;
  private readonly defaultLimit: number;

  constructor(
    maxSize: number = API_CONFIG.history.maxSize,
    defaultLimit: number = API_CONFIG.history.defaultLimit
  ) {
    this.maxSize = maxSize;
    this.defaultLimit = defaultLimit;
  }

  /**
   * Add a message to history
   */
  add(input: AddMessageInput): Message {
    const message: Message = {
      id: generateId(),
      role: input.role,
      content: input.content,
      timestamp: new Date().toISOString(),
      agent: input.agent,
      tier: input.tier,
      metadata: input.metadata,
    };

    this.messages.push(message);

    // Trim if exceeds max
    if (this.messages.length > this.maxSize) {
      this.messages = this.messages.slice(-this.maxSize);
    }

    return message;
  }

  /**
   * Get messages with optional limit
   */
  get(limit?: number): Message[] {
    const effectiveLimit = limit ?? this.defaultLimit;
    const validLimit = Math.min(Math.max(1, effectiveLimit), this.maxSize);
    return this.messages.slice(-validLimit);
  }

  /**
   * Get all messages
   */
  getAll(): Message[] {
    return [...this.messages];
  }

  /**
   * Get total count
   */
  count(): number {
    return this.messages.length;
  }

  /**
   * Clear all messages
   */
  clear(): number {
    const count = this.messages.length;
    this.messages = [];
    return count;
  }

  /**
   * Get message by ID
   */
  getById(id: string): Message | undefined {
    return this.messages.find((m) => m.id === id);
  }

  /**
   * Delete message by ID
   */
  delete(id: string): boolean {
    const index = this.messages.findIndex((m) => m.id === id);
    if (index === -1) return false;
    this.messages.splice(index, 1);
    return true;
  }

  /**
   * Search messages by content
   */
  search(query: string): Message[] {
    const lowerQuery = query.toLowerCase();
    return this.messages.filter((m) =>
      m.content.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get messages by role
   */
  getByRole(role: MessageRole): Message[] {
    return this.messages.filter((m) => m.role === role);
  }

  /**
   * Get messages by agent
   */
  getByAgent(agent: string): Message[] {
    return this.messages.filter((m) => m.agent === agent);
  }

  /**
   * Get messages in time range
   */
  getByTimeRange(startTime: Date, endTime: Date): Message[] {
    return this.messages.filter((m) => {
      const timestamp = new Date(m.timestamp);
      return timestamp >= startTime && timestamp <= endTime;
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════

export const historyStore = new HistoryStore();

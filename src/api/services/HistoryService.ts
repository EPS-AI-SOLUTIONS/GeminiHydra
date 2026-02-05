/**
 * History Service
 * Business logic layer for message history management
 */

import { historyStore } from '../stores/index.js';
import type { Message, ExecutePlan, MessageMetadata, ExecutionMode } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Service Class
// ═══════════════════════════════════════════════════════════════════════════

export class HistoryService {
  /**
   * Add a user message to history
   */
  addUserMessage(content: string): Message {
    return historyStore.add({
      role: 'user',
      content,
    });
  }

  /**
   * Add an assistant message to history
   */
  addAssistantMessage(
    content: string,
    plan: ExecutePlan,
    options: {
      duration: number;
      mode: ExecutionMode;
      streaming?: boolean;
    }
  ): Message {
    return historyStore.add({
      role: 'assistant',
      content,
      agent: plan.agent,
      tier: plan.tier,
      metadata: {
        duration: options.duration,
        mode: options.mode,
        streaming: options.streaming,
      },
    });
  }

  /**
   * Add a system message to history
   */
  addSystemMessage(content: string, metadata?: MessageMetadata): Message {
    return historyStore.add({
      role: 'system',
      content,
      metadata,
    });
  }

  /**
   * Add an error message to history
   */
  addErrorMessage(error: string): Message {
    return historyStore.add({
      role: 'system',
      content: `Error: ${error}`,
      metadata: { error: true },
    });
  }

  /**
   * Get messages with optional limit
   */
  getMessages(limit?: number): Message[] {
    return historyStore.get(limit);
  }

  /**
   * Get total message count
   */
  getCount(): number {
    return historyStore.count();
  }

  /**
   * Clear all messages
   */
  clear(): number {
    return historyStore.clear();
  }

  /**
   * Search messages by content
   */
  search(query: string): Message[] {
    return historyStore.search(query);
  }

  /**
   * Get message by ID
   */
  getById(id: string): Message | undefined {
    return historyStore.getById(id);
  }

  /**
   * Delete message by ID
   */
  delete(id: string): boolean {
    return historyStore.delete(id);
  }

  /**
   * Get messages by role
   */
  getByRole(role: 'user' | 'assistant' | 'system'): Message[] {
    return historyStore.getByRole(role);
  }

  /**
   * Get messages by agent
   */
  getByAgent(agent: string): Message[] {
    return historyStore.getByAgent(agent);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════

export const historyService = new HistoryService();

/**
 * Message Filters
 * Utilities for filtering and transforming message history
 */

import type { Message, MessageRole } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface MessageFilter {
  role?: MessageRole;
  agent?: string;
  search?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface MessageGroup {
  date: string;
  messages: Message[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Filter Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Filter messages by role
 */
export function filterByRole(messages: Message[], role: MessageRole): Message[] {
  return messages.filter((m) => m.role === role);
}

/**
 * Filter messages by agent
 */
export function filterByAgent(messages: Message[], agent: string): Message[] {
  return messages.filter((m) => m.agent === agent);
}

/**
 * Filter messages by search query (case-insensitive)
 */
export function filterBySearch(messages: Message[], query: string): Message[] {
  const lowerQuery = query.toLowerCase();
  return messages.filter((m) => m.content.toLowerCase().includes(lowerQuery));
}

/**
 * Filter messages by date range
 */
export function filterByDateRange(
  messages: Message[],
  startDate?: Date,
  endDate?: Date
): Message[] {
  return messages.filter((m) => {
    const timestamp = new Date(m.timestamp);
    if (startDate && timestamp < startDate) return false;
    if (endDate && timestamp > endDate) return false;
    return true;
  });
}

/**
 * Apply multiple filters to messages
 */
export function applyFilters(messages: Message[], filter: MessageFilter): Message[] {
  let result = messages;

  if (filter.role) {
    result = filterByRole(result, filter.role);
  }

  if (filter.agent) {
    result = filterByAgent(result, filter.agent);
  }

  if (filter.search) {
    result = filterBySearch(result, filter.search);
  }

  if (filter.startDate || filter.endDate) {
    result = filterByDateRange(result, filter.startDate, filter.endDate);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Grouping Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Group messages by date
 */
export function groupByDate(messages: Message[]): MessageGroup[] {
  const groups = new Map<string, Message[]>();

  for (const message of messages) {
    const date = new Date(message.timestamp).toISOString().split('T')[0];
    const existing = groups.get(date) || [];
    existing.push(message);
    groups.set(date, existing);
  }

  return Array.from(groups.entries())
    .map(([date, messages]) => ({ date, messages }))
    .sort((a, b) => b.date.localeCompare(a.date)); // Newest first
}

/**
 * Group messages by agent
 */
export function groupByAgent(messages: Message[]): Map<string, Message[]> {
  const groups = new Map<string, Message[]>();

  for (const message of messages) {
    const agent = message.agent || 'unknown';
    const existing = groups.get(agent) || [];
    existing.push(message);
    groups.set(agent, existing);
  }

  return groups;
}

// ═══════════════════════════════════════════════════════════════════════════
// Transformation Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get last N messages
 */
export function getLastN(messages: Message[], n: number): Message[] {
  return messages.slice(-n);
}

/**
 * Get first N messages
 */
export function getFirstN(messages: Message[], n: number): Message[] {
  return messages.slice(0, n);
}

/**
 * Sort messages by timestamp
 */
export function sortByTimestamp(messages: Message[], ascending = true): Message[] {
  const sorted = [...messages].sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return ascending ? timeA - timeB : timeB - timeA;
  });
  return sorted;
}

/**
 * Get unique agents from messages
 */
export function getUniqueAgents(messages: Message[]): string[] {
  const agents = new Set<string>();
  for (const message of messages) {
    if (message.agent) {
      agents.add(message.agent);
    }
  }
  return Array.from(agents);
}

/**
 * Count messages by role
 */
export function countByRole(messages: Message[]): Record<MessageRole, number> {
  const counts: Record<string, number> = {
    user: 0,
    assistant: 0,
    system: 0,
  };

  for (const message of messages) {
    counts[message.role] = (counts[message.role] || 0) + 1;
  }

  return counts as Record<MessageRole, number>;
}

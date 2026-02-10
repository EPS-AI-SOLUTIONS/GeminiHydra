/**
 * Help Meta Registry - Registry for extended command help metadata
 *
 * @module help/HelpMetaRegistry
 */

import type { CommandHelpMeta, CategoryConfig } from './types.js';

/**
 * Registry for extended command help metadata (examples, notes, etc.)
 */
class HelpMetaRegistry {
  private meta: Map<string, CommandHelpMeta> = new Map();

  register(commandName: string, meta: Partial<CommandHelpMeta>): void {
    const existing = this.meta.get(commandName) || { name: commandName };
    this.meta.set(commandName, { ...existing, ...meta });
  }

  get(commandName: string): CommandHelpMeta | undefined {
    return this.meta.get(commandName);
  }

  has(commandName: string): boolean {
    return this.meta.has(commandName);
  }

  getAll(): Map<string, CommandHelpMeta> {
    return new Map(this.meta);
  }
}

export const helpMetaRegistry = new HelpMetaRegistry();

// ============================================================
// Category Configuration
// ============================================================

export const categoryConfig: Map<string, CategoryConfig> = new Map([
  ['general', {
    name: 'general',
    displayName: 'General',
    description: 'General purpose commands',
    icon: '\u{1F4CC}',
    order: 1
  }],
  ['session', {
    name: 'session',
    displayName: 'Session Management',
    description: 'Commands for managing chat sessions and history',
    icon: '\u{1F4AC}',
    order: 2
  }],
  ['codebase', {
    name: 'codebase',
    displayName: 'Codebase Analysis',
    description: 'Commands for analyzing and understanding code',
    icon: '\u{1F50D}',
    order: 3
  }],
  ['filesystem', {
    name: 'filesystem',
    displayName: 'File System',
    description: 'File and directory operations',
    icon: '\u{1F4C1}',
    order: 4
  }],
  ['shell', {
    name: 'shell',
    displayName: 'Shell & Processes',
    description: 'Shell commands and process management',
    icon: '\u26A1',
    order: 5
  }],
  ['search', {
    name: 'search',
    displayName: 'Search',
    description: 'Search and find operations',
    icon: '\u{1F50E}',
    order: 6
  }],
  ['memory', {
    name: 'memory',
    displayName: 'Memory & Knowledge',
    description: 'Knowledge graph and memory operations',
    icon: '\u{1F9E0}',
    order: 7
  }],
  ['ai', {
    name: 'ai',
    displayName: 'AI & Models',
    description: 'AI model management and interactions',
    icon: '\u{1F916}',
    order: 8
  }],
  ['mcp', {
    name: 'mcp',
    displayName: 'MCP Integration',
    description: 'Model Context Protocol servers',
    icon: '\u{1F50C}',
    order: 9
  }],
  ['serena', {
    name: 'serena',
    displayName: 'Code Intelligence',
    description: 'LSP-powered code analysis (Serena)',
    icon: '\u{1F3AF}',
    order: 10
  }],
  ['git', {
    name: 'git',
    displayName: 'Git & Version Control',
    description: 'Git operations and version control',
    icon: '\u{1F4DA}',
    order: 11
  }]
]);

/**
 * Get category display info
 */
export function getCategoryDisplay(categoryName: string): CategoryConfig {
  return categoryConfig.get(categoryName) || {
    name: categoryName,
    displayName: categoryName.charAt(0).toUpperCase() + categoryName.slice(1),
    description: '',
    icon: '\u{1F4CB}',
    order: 99
  };
}

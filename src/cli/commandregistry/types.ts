/**
 * CommandRegistry - Type definitions, interfaces and enums
 *
 * All types used by the command registry system.
 *
 * @module cli/commandregistry/types
 */

// Import and re-export types from EnhancedArgParser to ensure compatibility
import type { FlagDefinition, ParsedArgs } from '../EnhancedArgParser.js';
export type { FlagDefinition, ParsedArgs };

// ============================================================================
// Command Priority Types
// ============================================================================

/**
 * Command priority levels
 * Higher values = higher priority
 */
export enum CommandPriority {
  PLUGIN = 0,
  USER = 1,
  BUILTIN = 2
}

// ============================================================================
// Conflict Detection Types
// ============================================================================
/**
 * Information about a command registration conflict
 */
export interface ConflictInfo {
  identifier: string;
  type: 'name' | 'alias';
  existingCommand: string;
  newCommand: string;
  existingPriority: CommandPriority;
  newPriority: CommandPriority;
  wouldOverwrite: boolean;
  timestamp: number;
}

/**
 * Options for command registration
 */
export interface RegisterOptions {
  /** Overwrite existing command regardless of priority */
  overwrite?: boolean;
  /** Silent mode - don't log conflict warnings */
  silent?: boolean;
}

/**
 * Logger interface for conflict detection
 */
export interface ConflictLogger {
  warn: (msg: string) => void;
  info: (msg: string) => void;
  debug: (msg: string) => void;
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

/**
 * Global rate limit configuration
 */
export interface RateLimitConfig {
  maxCommandsPerSecond: number;
  maxCommandsPerMinute: number;
  enabled: boolean;
}

/**
 * Per-command rate limit configuration
 */
export interface CommandRateLimitConfig {
  maxPerSecond?: number;
  maxPerMinute?: number;
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  enabled: boolean;
  tokensPerSecond: number;
  tokensPerMinute: number;
  maxTokensPerSecond: number;
  maxTokensPerMinute: number;
  lastRefillTime: number;
  whitelistedCommands: string[];
  perCommandLimits: Record<string, CommandRateLimitConfig>;
  recentCommands: { command: string; timestamp: number }[];
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitExceededError extends Error {
  public readonly limitType: 'second' | 'minute';
  public readonly retryAfterMs: number;

  constructor(limitType: 'second' | 'minute', retryAfterMs: number) {
    const message = `Rate limit exceeded (per-${limitType}). Retry after ${retryAfterMs}ms.`;
    super(message);
    this.name = 'RateLimitExceededError';
    this.limitType = limitType;
    this.retryAfterMs = retryAfterMs;
  }
}

// ============================================================================
// Subcommand Types
// ============================================================================

/**
 * Subcommand info for display
 */
export interface SubcommandInfo {
  name: string;
  description: string;
  usage?: string;
  aliases?: string[];
}

/**
 * Options for creating a subcommand
 */
export interface SubcommandOptions {
  description: string;
  usage?: string;
  aliases?: string[];
  handler: CommandHandler;
}

/**
 * Subcommand definition
 */
export interface Subcommand {
  name: string;
  description: string;
  usage?: string;
  aliases?: string[];
  handler: CommandHandler;
}

// ============================================================================
// CWD Management Types
// ============================================================================

/**
 * CWD history entry
 */
export interface CwdHistoryEntry {
  path: string;
  timestamp: number;
  source?: string;
}

/**
 * CWD Manager options
 */
export interface CwdManagerOptions {
  maxHistory?: number;
  autoSave?: boolean;
  savePath?: string;
}

/**
 * CWD change event
 */
export interface CwdChangeEvent {
  oldPath: string;
  newPath: string;
  source?: string;
  timestamp: number;
}

/**
 * CWD change listener
 */
export type CwdChangeListener = (event: CwdChangeEvent) => void;

/**
 * CWD validation result
 */
export interface CwdValidationResult {
  valid: boolean;
  error?: string;
  resolvedPath?: string;
}

// ============================================================================
// Command Types
// ============================================================================

/**
 * Command information for listing
 */
export interface CommandInfo {
  name: string;
  aliases: string[];
  description: string;
  category: string;
  usage?: string;
  args?: CommandArg[];
  hidden: boolean;
  hasSubcommands: boolean;
  namespace?: string;
  priority?: CommandPriority;
}

/** Argument types */
export type ArgType = 'string' | 'number' | 'boolean' | 'path';

/**
 * Command argument definition
 */
export interface CommandArg {
  name: string;
  description: string;
  required?: boolean;
  type?: ArgType;
  default?: string | number | boolean;
  choices?: string[];
  validate?: (value: string) => boolean | string;
}

/**
 * Argument validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  parsedArgs: Record<string, string | number | boolean>;
}

/**
 * Command execution result
 */
export interface CommandResult {
  success: boolean;
  data?: unknown;
  message?: string;
  error?: string;
}

/**
 * Context for command execution
 */
export interface CommandContext {
  args: string[];
  flags: Record<string, string | boolean>;
  cwd: string;
  rawInput?: string;
  rawArgs?: string;
  [key: string]: unknown;
}

/**
 * Command handler function
 */
export type CommandHandler = (ctx: CommandContext) => Promise<CommandResult> | CommandResult;

/**
 * Command definition
 */
export interface Command {
  name: string;
  aliases: string[];
  description: string;
  usage?: string;
  args?: CommandArg[];
  /** Flag definitions for this command */
  flags?: FlagDefinition[];
  handler: CommandHandler;
  subcommands?: Map<string, Command>;
  category?: string;
  hidden?: boolean;
  /** Namespace for the command (e.g., 'fs', 'mcp') */
  namespace?: string;
  /** Priority level for conflict resolution */
  priority?: CommandPriority;
}
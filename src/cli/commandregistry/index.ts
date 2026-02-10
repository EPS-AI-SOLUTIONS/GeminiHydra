/**
 * CommandRegistry - Module index
 *
 * Re-exports all command registry components.
 *
 * Original CommandRegistry.ts (2196 lines) has been split into:
 * - types.ts              - Enums, interfaces, type definitions
 * - CommandRegistry.ts    - CommandRegistry class, singleton, helpers
 *
 * @module cli/commandregistry/index
 */

// Types and enums
export {
  CommandPriority,
  RateLimitExceededError,
} from './types.js';
export type {
  ConflictInfo,
  RegisterOptions,
  ConflictLogger,
  RateLimitConfig,
  CommandRateLimitConfig,
  RateLimitStatus,
  SubcommandInfo,
  SubcommandOptions,
  Subcommand,  CwdHistoryEntry,
  CwdManagerOptions,
  CwdChangeEvent,
  CwdChangeListener,
  CwdValidationResult,
  CommandInfo,
  ArgType,
  CommandArg,
  ValidationResult,
  FlagDefinition,
  ParsedArgs,
  CommandResult,
  CommandContext,
  CommandHandler,
  Command,
} from './types.js';

// Main class, singleton and helpers
export {
  CommandRegistry,
  commandRegistry,
  success,
  error,
} from './CommandRegistry.js';
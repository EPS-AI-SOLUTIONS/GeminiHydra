/**
 * CommandRegistry - Backward-compatible re-export shim
 *
 * Original file (2196 lines) has been split into:
 * - commandregistry/types.ts          - All type definitions
 * - commandregistry/CommandRegistry.ts - Main class and singleton
 * - commandregistry/index.ts          - Re-exports
 *
 * @module cli/CommandRegistry
 */

// Re-export async utilities for convenience
export {
  CancellationTokenSource,
  CancellationError,
  TimeoutError,
  ProgressReporter,
  isAsyncFunction,
  wrapHandler,
  withCancellation,
  withProgress,
  withCancellationAndProgress,
  executeWithTimeout,
  executeWithCancellation,
  executeWithTimeoutAndCancellation,
  delay,
  retry,
  OperationTracker,
  globalOperationTracker,
} from './AsyncUtils.js';export type {
  CancellationToken,
  ProgressInfo,
  ProgressCallback,
  SyncCommandHandler,
  AsyncCommandHandler,
  AnyCommandHandler,
  ExtendedCommandContext,
  ExtendedCommandHandler,
  ExecuteOptions
} from './AsyncUtils.js';

// Re-export error handling
export {
  CommandErrorCode,
  ERROR_SUGGESTIONS,
  isRetryableError,
  detectErrorCode,
  CommandError,
  ValidationError,
  ExecutionError,
  CommandTimeoutError,
  TemporaryError,
  ErrorLogger,
  globalErrorLogger
} from './CommandErrors.js';
export type {
  ErrorHandler,
  ErrorLogEntry,
} from './CommandErrors.js';

// Re-export all from commandregistry module
export {
  // Enums and classes
  CommandPriority,
  RateLimitExceededError,
  CommandRegistry,
  commandRegistry,
  success,
  error,
} from './commandregistry/index.js';

export type {
  // Conflict types
  ConflictInfo,
  RegisterOptions,
  ConflictLogger,
  // Rate limiting types
  RateLimitConfig,
  CommandRateLimitConfig,
  RateLimitStatus,
  // Subcommand types
  SubcommandInfo,
  SubcommandOptions,
  Subcommand,
  // CWD types
  CwdHistoryEntry,
  CwdManagerOptions,
  CwdChangeEvent,  CwdChangeListener,
  CwdValidationResult,
  // Command types
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
} from './commandregistry/index.js';

// Default export for backward compatibility
import { commandRegistry as _commandRegistry } from './commandregistry/index.js';
export default _commandRegistry;
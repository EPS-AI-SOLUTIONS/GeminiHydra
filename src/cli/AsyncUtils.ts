/**
 * AsyncUtils - Asynchronous utilities for command handlers
 *
 * Provides cancellation tokens, timeout handling, progress callbacks,
 * and handler wrappers for normalizing sync/async behavior.
 */

import type { CommandContext, CommandHandler, CommandResult } from './CommandRegistry.js';

// ============================================================================
// Cancellation Token System
// ============================================================================

/**
 * Cancellation token for aborting long-running operations
 */
export interface CancellationToken {
  readonly isCancelled: boolean;
  readonly reason?: string;
  onCancel(callback: (reason?: string) => void): void;
  throwIfCancelled(): void;
}

/**
 * Cancellation token source - creates and controls cancellation tokens
 */
export class CancellationTokenSource {
  private _isCancelled = false;
  private _reason?: string;
  private _callbacks: Array<(reason?: string) => void> = [];

  /**
   * Get the cancellation token
   */
  get token(): CancellationToken {
    const self = this;
    return {
      get isCancelled() {
        return self._isCancelled;
      },
      get reason() {
        return self._reason;
      },
      onCancel: (callback: (reason?: string) => void) => {
        if (this._isCancelled) {
          callback(this._reason);
        } else {
          this._callbacks.push(callback);
        }
      },
      throwIfCancelled: () => {
        if (this._isCancelled) {
          throw new CancellationError(this._reason);
        }
      },
    };
  }

  /**
   * Cancel the operation
   */
  cancel(reason?: string): void {
    if (this._isCancelled) return;

    this._isCancelled = true;
    this._reason = reason;

    for (const callback of this._callbacks) {
      try {
        callback(reason);
      } catch {
        // Ignore callback errors
      }
    }
    this._callbacks = [];
  }

  /**
   * Check if cancelled
   */
  get isCancelled(): boolean {
    return this._isCancelled;
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this._callbacks = [];
  }
}

/**
 * Error thrown when operation is cancelled
 */
export class CancellationError extends Error {
  readonly isCancellation = true;

  constructor(reason?: string) {
    super(reason || 'Operation was cancelled');
    this.name = 'CancellationError';
  }

  /**
   * Type guard for CancellationError
   */
  static isCancellationError(err: unknown): err is CancellationError {
    return (
      err instanceof CancellationError ||
      (err instanceof Error &&
        'isCancellation' in err &&
        (err as CancellationError).isCancellation === true)
    );
  }
}

/**
 * Error thrown when operation times out
 */
export class TimeoutError extends Error {
  readonly isTimeout = true;
  readonly timeoutMs: number;

  constructor(timeoutMs: number, command?: string) {
    super(`Command${command ? ` '${command}'` : ''} timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }

  /**
   * Type guard for TimeoutError
   */
  static isTimeoutError(err: unknown): err is TimeoutError {
    return (
      err instanceof TimeoutError ||
      (err instanceof Error && 'isTimeout' in err && (err as TimeoutError).isTimeout === true)
    );
  }
}

// ============================================================================
// Progress Callback System
// ============================================================================

/**
 * Progress information for long-running operations
 */
export interface ProgressInfo {
  /** Current step/item number */
  current: number;
  /** Total steps/items (if known) */
  total?: number;
  /** Human-readable progress message */
  message?: string;
  /** Calculated percentage (0-100) */
  percentage?: number;
  /** Estimated time remaining in ms */
  estimatedTimeRemaining?: number;
}

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: ProgressInfo) => void;

/**
 * Progress reporter helper for handlers
 */
export class ProgressReporter {
  private callback?: ProgressCallback;
  private startTime: number;
  private _current = 0;
  private _total?: number;

  constructor(callback?: ProgressCallback, total?: number) {
    this.callback = callback;
    this._total = total;
    this.startTime = Date.now();
  }

  /**
   * Report progress
   */
  report(current: number, message?: string): void {
    this._current = current;
    if (!this.callback) return;

    const elapsed = Date.now() - this.startTime;
    const percentage = this._total ? Math.round((current / this._total) * 100) : undefined;

    let estimatedTimeRemaining: number | undefined;
    if (this._total && current > 0) {
      const rate = elapsed / current;
      estimatedTimeRemaining = Math.round(rate * (this._total - current));
    }

    this.callback({
      current,
      total: this._total,
      message,
      percentage,
      estimatedTimeRemaining,
    });
  }

  /**
   * Increment and report
   */
  increment(message?: string): void {
    this.report(this._current + 1, message);
  }

  /**
   * Set total count
   */
  setTotal(total: number): void {
    this._total = total;
  }

  /**
   * Report completion
   */
  complete(message?: string): void {
    if (this._total) {
      this.report(this._total, message || 'Complete');
    }
  }

  /**
   * Get current progress
   */
  get current(): number {
    return this._current;
  }

  /**
   * Get total
   */
  get total(): number | undefined {
    return this._total;
  }

  /**
   * Get elapsed time in ms
   */
  get elapsed(): number {
    return Date.now() - this.startTime;
  }
}

// ============================================================================
// Handler Utilities
// ============================================================================

/**
 * Check if a function is async (returns a Promise)
 */
export function isAsyncFunction(fn: (...args: never[]) => unknown): boolean {
  // Check for async function constructor
  if (fn.constructor.name === 'AsyncFunction') {
    return true;
  }
  // Check function string for async keyword
  const fnStr = fn.toString();
  if (fnStr.startsWith('async ') || fnStr.includes('async function')) {
    return true;
  }
  return false;
}

/**
 * Sync command handler type
 */
export type SyncCommandHandler = (ctx: CommandContext) => CommandResult;

/**
 * Async command handler type
 */
export type AsyncCommandHandler = (ctx: CommandContext) => Promise<CommandResult>;

/**
 * Extended command handler that can be sync or async
 */
export type AnyCommandHandler = SyncCommandHandler | AsyncCommandHandler;

/**
 * Extended command context with cancellation and progress support
 */
export interface ExtendedCommandContext extends CommandContext {
  /** Cancellation token for aborting operation */
  cancellationToken?: CancellationToken;
  /** Progress callback for reporting progress */
  onProgress?: ProgressCallback;
}

/**
 * Extended command handler with cancellation and progress support
 */
export type ExtendedCommandHandler = (ctx: ExtendedCommandContext) => Promise<CommandResult>;

/**
 * Wrap a handler (sync or async) to always return a Promise
 * Handles Promise rejection and normalizes error handling
 */
export function wrapHandler(handler: AnyCommandHandler): CommandHandler {
  return async (ctx: CommandContext): Promise<CommandResult> => {
    try {
      const result = handler(ctx);

      // If result is a Promise, await it with proper error handling
      if (result && typeof result === 'object' && 'then' in result) {
        return await (result as Promise<CommandResult>).catch((err: unknown) => {
          // Handle Promise rejection
          if (CancellationError.isCancellationError(err)) {
            return {
              success: false,
              error: `Operation cancelled: ${err.message}`,
            };
          }
          if (TimeoutError.isTimeoutError(err)) {
            return {
              success: false,
              error: err.message,
            };
          }
          const errorMessage = err instanceof Error ? err.message : String(err);
          return {
            success: false,
            error: errorMessage,
          };
        });
      }

      // Sync result
      return result as CommandResult;
    } catch (err) {
      // Handle sync throws
      if (CancellationError.isCancellationError(err)) {
        return {
          success: false,
          error: `Operation cancelled: ${err.message}`,
        };
      }
      if (TimeoutError.isTimeoutError(err)) {
        return {
          success: false,
          error: err.message,
        };
      }
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: errorMessage,
      };
    }
  };
}

/**
 * Create a handler that supports cancellation
 */
export function withCancellation(
  handler: (ctx: CommandContext, token: CancellationToken) => Promise<CommandResult>,
): ExtendedCommandHandler {
  return async (ctx: ExtendedCommandContext): Promise<CommandResult> => {
    const token = ctx.cancellationToken || new CancellationTokenSource().token;
    return handler(ctx, token);
  };
}

/**
 * Create a handler that supports progress reporting
 */
export function withProgress(
  handler: (ctx: CommandContext, progress: ProgressReporter) => Promise<CommandResult>,
  totalSteps?: number,
): ExtendedCommandHandler {
  return async (ctx: ExtendedCommandContext): Promise<CommandResult> => {
    const reporter = new ProgressReporter(ctx.onProgress, totalSteps);
    return handler(ctx, reporter);
  };
}

/**
 * Create a handler with both cancellation and progress support
 */
export function withCancellationAndProgress(
  handler: (
    ctx: CommandContext,
    token: CancellationToken,
    progress: ProgressReporter,
  ) => Promise<CommandResult>,
  totalSteps?: number,
): ExtendedCommandHandler {
  return async (ctx: ExtendedCommandContext): Promise<CommandResult> => {
    const token = ctx.cancellationToken || new CancellationTokenSource().token;
    const reporter = new ProgressReporter(ctx.onProgress, totalSteps);
    return handler(ctx, token, reporter);
  };
}

// ============================================================================
// Execution Utilities
// ============================================================================

/**
 * Execute options for commands with timeout and cancellation
 */
export interface ExecuteOptions {
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Cancellation token source for aborting */
  cancellationToken?: CancellationToken;
  /** Progress callback for long-running operations */
  onProgress?: ProgressCallback;
}

/**
 * Execute a handler with timeout
 */
export async function executeWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName?: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let isResolved = false;
    let timeoutId: NodeJS.Timeout | undefined;

    // Set timeout
    timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        reject(new TimeoutError(timeoutMs, operationName));
      }
    }, timeoutMs);

    // Execute operation
    operation()
      .then((result) => {
        if (!isResolved) {
          isResolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          resolve(result);
        }
      })
      .catch((err) => {
        if (!isResolved) {
          isResolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          reject(err);
        }
      });
  });
}

/**
 * Execute a handler with cancellation support
 */
export async function executeWithCancellation<T>(
  operation: (token: CancellationToken) => Promise<T>,
  token: CancellationToken,
): Promise<T> {
  // Check if already cancelled
  token.throwIfCancelled();

  // Execute operation
  return operation(token);
}

/**
 * Execute a handler with both timeout and cancellation
 */
export async function executeWithTimeoutAndCancellation<T>(
  operation: (token: CancellationToken) => Promise<T>,
  token: CancellationToken,
  timeoutMs: number,
  operationName?: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let isResolved = false;
    let timeoutId: NodeJS.Timeout | undefined;

    // Create timeout cancellation
    const timeoutCancellation = new CancellationTokenSource();

    // Merge cancellation tokens
    const mergedToken: CancellationToken = {
      get isCancelled() {
        return timeoutCancellation.isCancelled || token.isCancelled;
      },
      get reason() {
        return timeoutCancellation.token.reason || token.reason;
      },
      onCancel: (callback) => {
        timeoutCancellation.token.onCancel(callback);
        token.onCancel(callback);
      },
      throwIfCancelled: () => {
        if (timeoutCancellation.isCancelled) {
          throw new TimeoutError(timeoutMs, operationName);
        }
        token.throwIfCancelled();
      },
    };

    // Listen for external cancellation
    token.onCancel((reason) => {
      if (!isResolved) {
        isResolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        reject(new CancellationError(reason));
      }
    });

    // Set timeout
    timeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        timeoutCancellation.cancel(`Timeout after ${timeoutMs}ms`);
        reject(new TimeoutError(timeoutMs, operationName));
      }
    }, timeoutMs);

    // Execute operation
    operation(mergedToken)
      .then((result) => {
        if (!isResolved) {
          isResolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          resolve(result);
        }
      })
      .catch((err) => {
        if (!isResolved) {
          isResolved = true;
          if (timeoutId) clearTimeout(timeoutId);
          reject(err);
        }
      });
  });
}

/**
 * Delay execution with cancellation support
 */
export async function delay(ms: number, token?: CancellationToken): Promise<void> {
  return new Promise((resolve, reject) => {
    token?.throwIfCancelled();

    const timeoutId = setTimeout(() => {
      resolve();
    }, ms);

    token?.onCancel((reason) => {
      clearTimeout(timeoutId);
      reject(new CancellationError(reason));
    });
  });
}

/**
 * Retry an operation with cancellation support
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoffMultiplier?: number;
    token?: CancellationToken;
    onRetry?: (attempt: number, error: Error) => void;
  } = {},
): Promise<T> {
  const { maxAttempts = 3, delayMs = 1000, backoffMultiplier = 2, token, onRetry } = options;

  let lastError: Error | undefined;
  let currentDelay = delayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    token?.throwIfCancelled();

    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry cancellation or timeout errors
      if (CancellationError.isCancellationError(err) || TimeoutError.isTimeoutError(err)) {
        throw err;
      }

      if (attempt < maxAttempts) {
        onRetry?.(attempt, lastError);
        await delay(currentDelay, token);
        currentDelay *= backoffMultiplier;
      }
    }
  }

  throw lastError || new Error('Operation failed after retries');
}

// ============================================================================
// Active Operations Tracker
// ============================================================================

/**
 * Tracks active operations for management and cancellation
 */
export class OperationTracker {
  private operations: Map<string, CancellationTokenSource> = new Map();
  private idCounter = 0;

  /**
   * Start tracking an operation
   */
  startOperation(name?: string): { id: string; token: CancellationToken; cancel: () => void } {
    const id = `op-${++this.idCounter}-${name || 'unnamed'}`;
    const source = new CancellationTokenSource();
    this.operations.set(id, source);

    return {
      id,
      token: source.token,
      cancel: () => {
        source.cancel();
        this.operations.delete(id);
      },
    };
  }

  /**
   * Complete an operation (remove from tracking)
   */
  completeOperation(id: string): void {
    const source = this.operations.get(id);
    if (source) {
      source.dispose();
      this.operations.delete(id);
    }
  }

  /**
   * Cancel a specific operation
   */
  cancelOperation(id: string, reason?: string): boolean {
    const source = this.operations.get(id);
    if (source) {
      source.cancel(reason);
      this.operations.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Cancel all operations
   */
  cancelAll(reason?: string): number {
    let count = 0;
    for (const [_id, source] of this.operations) {
      source.cancel(reason);
      count++;
    }
    this.operations.clear();
    return count;
  }

  /**
   * Get count of active operations
   */
  get activeCount(): number {
    return this.operations.size;
  }

  /**
   * Get list of active operation IDs
   */
  getActiveOperations(): string[] {
    return Array.from(this.operations.keys());
  }

  /**
   * Check if operation is active
   */
  isActive(id: string): boolean {
    return this.operations.has(id);
  }
}

// ============================================================================
// Global Operation Tracker Instance
// ============================================================================

/**
 * Global operation tracker for the CLI
 */
export const globalOperationTracker = new OperationTracker();

export default {
  CancellationTokenSource,
  CancellationError,
  TimeoutError,
  ProgressReporter,
  OperationTracker,
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
  globalOperationTracker,
};

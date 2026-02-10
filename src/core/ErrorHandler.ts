/**
 * ErrorHandler - Centralized error handling for GeminiHydra
 *
 * Provides a unified error handler class and related types
 * for categorizing and handling errors across the application.
 *
 * @module core/ErrorHandler
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Error categories for classification
 */
export type ErrorCategory =
  | 'network'
  | 'api'
  | 'validation'
  | 'filesystem'
  | 'process'
  | 'timeout'
  | 'auth'
  | 'config'
  | 'unknown';

/**
 * Custom error interface for GeminiHydra errors
 */
export interface GeminiHydraError extends Error {
  category: ErrorCategory;
  code?: string;
  retryable?: boolean;
  context?: Record<string, unknown>;
}

/**
 * Result of error handling
 */
export interface ErrorHandleResult {
  handled: boolean;
  action: 'retry' | 'skip' | 'abort' | 'fallback';
  message?: string;
}

// ============================================================================
// ErrorHandler Class
// ============================================================================

/**
 * Centralized error handler for the application
 */
export class ErrorHandler {
  private handlers: Map<ErrorCategory, (error: GeminiHydraError) => ErrorHandleResult> = new Map();
  private errorLog: Array<{ error: Error; timestamp: Date; category: ErrorCategory }> = [];

  /**
   * Register a handler for a specific error category
   */
  registerHandler(
    category: ErrorCategory,
    handler: (error: GeminiHydraError) => ErrorHandleResult
  ): void {
    this.handlers.set(category, handler);
  }

  /**
   * Handle an error by routing to appropriate handler
   */
  handle(error: Error, category: ErrorCategory = 'unknown'): ErrorHandleResult {
    this.errorLog.push({ error, timestamp: new Date(), category });

    const handler = this.handlers.get(category);
    if (handler) {
      const hydraError = error as GeminiHydraError;
      hydraError.category = category;
      return handler(hydraError);
    }

    // Default handling
    return {
      handled: false,
      action: 'abort',
      message: error.message
    };
  }

  /**
   * Get error log
   */
  getLog(): Array<{ error: Error; timestamp: Date; category: ErrorCategory }> {
    return [...this.errorLog];
  }

  /**
   * Clear error log
   */
  clear(): void {
    this.errorLog = [];
  }

  /**
   * Categorize an error automatically
   */
  static categorize(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();

    if (message.includes('network') || message.includes('fetch') || message.includes('econnrefused')) {
      return 'network';
    }
    if (message.includes('api') || message.includes('rate limit') || message.includes('quota')) {
      return 'api';
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden')) {
      return 'auth';
    }
    if (message.includes('enoent') || message.includes('permission denied') || message.includes('file')) {
      return 'filesystem';
    }
    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return 'validation';
    }
    if (message.includes('config') || message.includes('missing key')) {
      return 'config';
    }
    if (message.includes('process') || message.includes('spawn') || message.includes('killed')) {
      return 'process';
    }

    return 'unknown';
  }
}

/**
 * GeminiHydra - Error Hierarchy
 * Comprehensive error classes for the system
 */

/**
 * Error options for HydraError
 */
export interface HydraErrorOptions {
  code?: string;
  recoverable?: boolean;
  retryable?: boolean;
  context?: Record<string, unknown>;
  cause?: Error;
}

/**
 * Serialized error format
 */
export interface SerializedError {
  name: string;
  message: string;
  code: string;
  recoverable: boolean;
  retryable: boolean;
  context: Record<string, unknown>;
  timestamp: string;
  stack?: string;
}

/**
 * Base error class for all Hydra errors
 */
export class HydraError extends Error {
  code: string;
  recoverable: boolean;
  retryable: boolean;
  context: Record<string, unknown>;
  timestamp: Date;

  constructor(message: string, options: HydraErrorOptions = {}) {
    super(message);
    this.name = 'HydraError';
    this.code = options.code ?? 'HYDRA_ERROR';
    this.recoverable = options.recoverable ?? false;
    this.retryable = options.retryable ?? false;
    this.context = options.context ?? {};
    this.timestamp = new Date();

    if (options.cause) {
      this.cause = options.cause;
    }

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error for logging/transport
   */
  toJSON(): SerializedError {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      recoverable: this.recoverable,
      retryable: this.retryable,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack
    };
  }

  /**
   * Create error with additional context
   */
  withContext(context: Record<string, unknown>): this {
    this.context = { ...this.context, ...context };
    return this;
  }
}

/**
 * Provider-related errors
 */
export class ProviderError extends HydraError {
  provider: string;

  constructor(message: string, provider: string, options: HydraErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'PROVIDER_ERROR',
      retryable: options.retryable ?? true,
      ...options
    });
    this.name = 'ProviderError';
    this.provider = provider;
    this.context.provider = provider;
  }
}

/**
 * Gemini-specific errors
 */
export class GeminiError extends ProviderError {
  constructor(message: string, options: HydraErrorOptions = {}) {
    super(message, 'gemini', {
      code: options.code ?? 'GEMINI_ERROR',
      ...options
    });
    this.name = 'GeminiError';
  }
}

/**
 * LlamaCpp-specific errors
 */
export class LlamaCppError extends ProviderError {
  constructor(message: string, options: HydraErrorOptions = {}) {
    super(message, 'llamacpp', {
      code: options.code ?? 'LLAMACPP_ERROR',
      ...options
    });
    this.name = 'LlamaCppError';
  }
}

/**
 * Ollama-specific errors
 */
export class OllamaError extends ProviderError {
  constructor(message: string, options: HydraErrorOptions = {}) {
    super(message, 'ollama', {
      code: options.code ?? 'OLLAMA_ERROR',
      ...options
    });
    this.name = 'OllamaError';
  }
}

/**
 * Network-related errors
 */
export class NetworkError extends HydraError {
  constructor(message: string, options: HydraErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'NETWORK_ERROR',
      retryable: options.retryable ?? true,
      ...options
    });
    this.name = 'NetworkError';
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends HydraError {
  timeoutMs: number;

  constructor(message: string, timeoutMs: number, options: HydraErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'TIMEOUT_ERROR',
      retryable: options.retryable ?? true,
      ...options
    });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
    this.context.timeoutMs = timeoutMs;
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends HydraError {
  constructor(message: string, options: HydraErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'CONFIG_ERROR',
      recoverable: false,
      retryable: false,
      ...options
    });
    this.name = 'ConfigurationError';
  }
}

/**
 * Routing errors
 */
export class RoutingError extends HydraError {
  constructor(message: string, options: HydraErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'ROUTING_ERROR',
      retryable: options.retryable ?? true,
      ...options
    });
    this.name = 'RoutingError';
  }
}

/**
 * Pipeline errors
 */
export class PipelineError extends HydraError {
  stage?: string;

  constructor(message: string, stage?: string, options: HydraErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'PIPELINE_ERROR',
      ...options
    });
    this.name = 'PipelineError';
    this.stage = stage;
    if (stage) {
      this.context.stage = stage;
    }
  }
}

/**
 * Rate limit errors
 */
export class RateLimitError extends HydraError {
  retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number, options: HydraErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'RATE_LIMIT_ERROR',
      retryable: true,
      ...options
    });
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
    if (retryAfterMs) {
      this.context.retryAfterMs = retryAfterMs;
    }
  }
}

/**
 * Circuit breaker open error
 */
export class CircuitOpenError extends HydraError {
  nextAttemptAt?: Date;

  constructor(message: string, nextAttemptAt?: Date, options: HydraErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'CIRCUIT_OPEN',
      retryable: true,
      ...options
    });
    this.name = 'CircuitOpenError';
    this.nextAttemptAt = nextAttemptAt;
    if (nextAttemptAt) {
      this.context.nextAttemptAt = nextAttemptAt.toISOString();
    }
  }
}

/**
 * Validation errors
 */
export class ValidationError extends HydraError {
  field?: string;

  constructor(message: string, field?: string, options: HydraErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'VALIDATION_ERROR',
      recoverable: false,
      retryable: false,
      ...options
    });
    this.name = 'ValidationError';
    this.field = field;
    if (field) {
      this.context.field = field;
    }
  }
}

/**
 * Pool exhausted error
 */
export class PoolExhaustedError extends HydraError {
  queueSize?: number;

  constructor(message: string, queueSize?: number, options: HydraErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'POOL_EXHAUSTED',
      retryable: true,
      ...options
    });
    this.name = 'PoolExhaustedError';
    this.queueSize = queueSize;
    if (queueSize !== undefined) {
      this.context.queueSize = queueSize;
    }
  }
}

/**
 * Aggregate error for multiple failures
 */
export class AggregateHydraError extends HydraError {
  errors: Error[];

  constructor(message: string, errors: Error[], options: HydraErrorOptions = {}) {
    super(message, {
      code: options.code ?? 'AGGREGATE_ERROR',
      ...options
    });
    this.name = 'AggregateHydraError';
    this.errors = errors;
    this.context.errorCount = errors.length;
    this.context.errorTypes = [...new Set(errors.map(e => e.name))];
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize any error source to HydraError
 */
export function normalizeError(source: unknown, defaultCode = 'UNKNOWN_ERROR'): HydraError {
  if (source instanceof HydraError) {
    return source;
  }

  if (source instanceof Error) {
    return new HydraError(source.message, {
      code: defaultCode,
      cause: source
    });
  }

  if (typeof source === 'string') {
    return new HydraError(source, { code: defaultCode });
  }

  return new HydraError('Unknown error', {
    code: defaultCode,
    context: { originalError: source }
  });
}

/**
 * Check if error is retryable
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof HydraError) {
    return error.retryable;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('rate limit') ||
      message.includes('503') ||
      message.includes('502') ||
      message.includes('429')
    );
  }

  return false;
}

/**
 * Check if error is recoverable
 */
export function isRecoverable(error: unknown): boolean {
  if (error instanceof HydraError) {
    return error.recoverable;
  }
  return false;
}

/**
 * Get error code
 */
export function getErrorCode(error: unknown): string {
  if (error instanceof HydraError) {
    return error.code;
  }
  if (error instanceof Error) {
    return error.name;
  }
  return 'UNKNOWN_ERROR';
}

/**
 * Add retry context to error
 */
export function withRetryContext(
  error: Error,
  attempt: number,
  maxAttempts: number
): Error {
  if (error instanceof HydraError) {
    error.context.attempt = attempt;
    error.context.maxAttempts = maxAttempts;
    error.context.remainingAttempts = maxAttempts - attempt;
  }
  return error;
}

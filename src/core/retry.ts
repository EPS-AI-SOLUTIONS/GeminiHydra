/**
 * GeminiHydra - Retry Logic & Circuit Breaker
 * Standardized retry mechanism with exponential backoff
 */

import type { RetryConfig, CircuitBreakerConfig } from '../types/provider.js';
import { CircuitOpenError, TimeoutError } from './errors.js';

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
  retryableErrors: []
};

/**
 * Default circuit breaker configuration
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: Required<CircuitBreakerConfig> = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  halfOpenMaxCalls: 3
};

/**
 * Retryable error codes
 */
export const RETRYABLE_ERROR_CODES = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EPIPE',
  'ENOTFOUND',
  'ENETUNREACH',
  'EAI_AGAIN',
  'AbortError',
  'TimeoutError'
];

/**
 * Retryable HTTP status codes
 */
export const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Retry attempt info
 */
export interface RetryAttemptInfo {
  attempt: number;
  maxRetries: number;
  error: Error;
  delay: number;
  willRetry: boolean;
}

/**
 * Extended retry options
 */
export interface RetryOptions extends RetryConfig {
  shouldRetry?: (error: Error) => boolean;
  onRetry?: (info: RetryAttemptInfo) => void;
  retryableErrors?: string[];
  retryableStatusCodes?: number[];
}

/**
 * Determines if an error is retryable
 */
export function isRetryableError(error: unknown, options: Partial<RetryOptions> = {}): boolean {
  const retryableErrors = options.retryableErrors ?? RETRYABLE_ERROR_CODES;
  const retryableStatusCodes = options.retryableStatusCodes ?? RETRYABLE_STATUS_CODES;

  // Check custom shouldRetry function
  if (options.shouldRetry && error instanceof Error) {
    return options.shouldRetry(error);
  }

  if (!(error instanceof Error)) {
    return false;
  }

  // Check error code
  const errorWithCode = error as Error & { code?: string };
  if (errorWithCode.code && retryableErrors.includes(errorWithCode.code)) {
    return true;
  }

  // Check error name
  if (error.name && retryableErrors.includes(error.name)) {
    return true;
  }

  // Check for timeout
  if (error.message && error.message.toLowerCase().includes('timeout')) {
    return true;
  }

  // Check HTTP status codes
  const errorWithStatus = error as Error & { status?: number };
  if (errorWithStatus.status && retryableStatusCodes.includes(errorWithStatus.status)) {
    return true;
  }

  // Check for rate limiting
  if (error.message && (
    error.message.includes('rate limit') ||
    error.message.includes('too many requests') ||
    error.message.includes('429')
  )) {
    return true;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and optional jitter
 */
export function calculateDelay(attempt: number, options: Partial<RetryConfig> = {}): number {
  const config = { ...DEFAULT_RETRY_CONFIG, ...options };
  const { baseDelay, maxDelay, backoffMultiplier, jitter } = config;

  // Calculate exponential delay
  let delay = baseDelay * Math.pow(backoffMultiplier, attempt);

  // Apply jitter (random factor between 0.5 and 1.5)
  if (jitter) {
    const jitterFactor = 0.5 + Math.random();
    delay *= jitterFactor;
  }

  // Cap at max delay
  return Math.min(delay, maxDelay);
}

/**
 * Sleep for specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...options };
  const { maxRetries, onRetry } = config;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt === maxRetries || !isRetryableError(error, config)) {
        throw lastError;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, config);

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry({
          attempt: attempt + 1,
          maxRetries,
          error: lastError,
          delay,
          willRetry: true
        });
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  throw lastError ?? new Error('Retry failed');
}

/**
 * Create a retryable wrapper for a function
 */
export function createRetryable<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): (overrides?: Partial<RetryOptions>) => Promise<T> {
  return (overrides = {}) => withRetry(fn, { ...options, ...overrides });
}

/**
 * Execute with timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new TimeoutError(message, timeoutMs)), timeoutMs);
    })
  ]);
}

/**
 * Execute with both retry and timeout
 */
export async function withRetryAndTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  retryOptions: Partial<RetryOptions> = {}
): Promise<T> {
  return withRetry(
    () => withTimeout(fn, timeoutMs),
    retryOptions
  );
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker status
 */
export interface CircuitBreakerStatus {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: Date | null;
  nextAttemptAt: Date | null;
  halfOpenCalls: number;
}

/**
 * Circuit Breaker implementation
 * Prevents cascading failures by temporarily blocking requests to a failing service
 */
export class CircuitBreaker {
  private config: Required<CircuitBreakerConfig>;
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: Date | null = null;
  private nextAttemptAt: Date | null = null;
  private halfOpenCalls = 0;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  /**
   * Execute function through circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'open') {
      if (this.nextAttemptAt && Date.now() < this.nextAttemptAt.getTime()) {
        throw new CircuitOpenError(
          `Circuit breaker is OPEN`,
          this.nextAttemptAt
        );
      }
      // Move to half-open state
      this.state = 'half-open';
      this.successCount = 0;
      this.halfOpenCalls = 0;
    }

    // Check half-open call limit
    if (this.state === 'half-open') {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        throw new CircuitOpenError(
          'Circuit breaker half-open call limit reached',
          this.nextAttemptAt ?? undefined
        );
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.reset();
      }
    } else {
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = 'open';
      this.nextAttemptAt = new Date(Date.now() + this.config.timeout);
    }
  }

  /**
   * Reset circuit breaker to closed state
   */
  private reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptAt = null;
    this.halfOpenCalls = 0;
  }

  /**
   * Force open the circuit
   */
  forceOpen(): void {
    this.state = 'open';
    this.nextAttemptAt = new Date(Date.now() + this.config.timeout);
  }

  /**
   * Force close the circuit
   */
  forceClose(): void {
    this.reset();
  }

  /**
   * Check if circuit allows execution
   */
  isAvailable(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      return this.nextAttemptAt !== null && Date.now() >= this.nextAttemptAt.getTime();
    }
    // half-open
    return this.halfOpenCalls < this.config.halfOpenMaxCalls;
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit breaker status
   */
  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      nextAttemptAt: this.nextAttemptAt,
      halfOpenCalls: this.halfOpenCalls
    };
  }
}

// ============================================================================
// Circuit Breaker Registry
// ============================================================================

/**
 * Registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private defaultConfig: Partial<CircuitBreakerConfig>;

  constructor(defaultConfig: Partial<CircuitBreakerConfig> = {}) {
    this.defaultConfig = defaultConfig;
  }

  /**
   * Get or create circuit breaker for a key
   */
  get(key: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(key);

    if (!breaker) {
      breaker = new CircuitBreaker({ ...this.defaultConfig, ...config });
      this.breakers.set(key, breaker);
    }

    return breaker;
  }

  /**
   * Execute through a specific circuit breaker
   */
  async execute<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const breaker = this.get(key);
    return breaker.execute(fn);
  }

  /**
   * Get all circuit breaker statuses
   */
  getStatuses(): Map<string, CircuitBreakerStatus> {
    const statuses = new Map<string, CircuitBreakerStatus>();
    for (const [key, breaker] of this.breakers) {
      statuses.set(key, breaker.getStatus());
    }
    return statuses;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceClose();
    }
  }

  /**
   * Clear all circuit breakers
   */
  clear(): void {
    this.breakers.clear();
  }

  /**
   * Get available breakers (those that can accept requests)
   */
  getAvailable(): string[] {
    const available: string[] = [];
    for (const [key, breaker] of this.breakers) {
      if (breaker.isAvailable()) {
        available.push(key);
      }
    }
    return available;
  }
}

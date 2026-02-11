/**
 * TrafficControl - Semaphore for controlling concurrent LLM requests
 */

/**
 * Semaphore implementation for async concurrency control
 */
export class Semaphore {
  private permits: number;
  private maxPermits: number;
  private waiting: Array<() => void> = [];

  constructor(maxPermits: number = 3) {
    this.permits = maxPermits;
    this.maxPermits = maxPermits;
  }

  /**
   * Acquire a permit (blocks if none available)
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    // Wait for a permit to become available
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  /**
   * Release a permit
   */
  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (next) next();
    } else if (this.permits < this.maxPermits) {
      this.permits++;
    } else {
      // Defensive: double-release detected, silently ignore
      console.warn('[Semaphore] Warning: release() called but permits already at max');
    }
  }

  /**
   * Execute a function with a permit (auto-release)
   */
  async withPermit<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Try to acquire a permit without waiting
   * Returns true if acquired, false otherwise
   */
  tryAcquire(): boolean {
    if (this.permits > 0) {
      this.permits--;
      return true;
    }
    return false;
  }

  /**
   * Get current status
   */
  getStatus(): { available: number; waiting: number; max: number } {
    return {
      available: this.permits,
      waiting: this.waiting.length,
      max: this.maxPermits,
    };
  }
}

/**
 * Rate limiter with time-based throttling
 */
export class RateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per second
  private lastRefill: number;

  constructor(maxTokens: number = 10, refillRate: number = 1) {
    this.tokens = maxTokens;
    this.maxTokens = maxTokens;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }

  async acquire(tokens: number = 1): Promise<void> {
    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return;
    }

    // Wait for tokens to become available
    const waitTime = ((tokens - this.tokens) / this.refillRate) * 1000;
    await new Promise((resolve) => setTimeout(resolve, waitTime));

    this.refill();
    this.tokens -= tokens;
  }
}

/**
 * Retry helper with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {},
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 30000, onRetry } = options;

  let lastError: Error = new Error('All retries exhausted');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, 8s, ...
        const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);

        if (onRetry) {
          onRetry(attempt + 1, lastError);
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error('All retries exhausted');
}

// Pre-configured semaphores for different services

// Llama.cpp: max 1 concurrent (single model loaded at a time)
// Note: llama.cpp handles one request at a time per loaded model
export const llamaSemaphore = new Semaphore(1);

// Ollama: max 4 concurrent (local inference with parallel slots)
export const ollamaSemaphore = new Semaphore(4);

// Gemini: max 5 concurrent (API rate limiting)
export const geminiSemaphore = new Semaphore(5);

// Export everything
export default {
  Semaphore,
  RateLimiter,
  withRetry,
  llamaSemaphore,
  ollamaSemaphore,
  geminiSemaphore,
};

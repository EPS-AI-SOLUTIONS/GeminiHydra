/**
 * GeminiHydra - Connection Pool & Rate Limiter
 * Manages concurrent execution and rate limiting
 */

import type { PoolConfig, RateLimitConfig } from '../types/provider.js';
import { PoolExhaustedError, TimeoutError } from './errors.js';

/**
 * Default pool configuration
 */
export const DEFAULT_POOL_CONFIG: Required<PoolConfig> = {
  maxConcurrent: 5,
  maxQueueSize: 100,
  acquireTimeout: 30000,
  idleTimeout: 60000,
  fifo: true
};

/**
 * Default rate limit configuration
 */
export const DEFAULT_RATE_LIMIT_CONFIG: Required<RateLimitConfig> = {
  enabled: true,
  tokensPerInterval: 10,
  interval: 1000,
  maxBurst: 20
};

/**
 * Queued request
 */
interface QueuedRequest<T> {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  enqueuedAt: number;
  timeout?: ReturnType<typeof setTimeout>;
}

/**
 * Pool status
 */
export interface PoolStatus {
  active: number;
  idle: number;
  pending: number;
  queued: number;
  maxConcurrent: number;
  maxQueueSize: number;
  totalExecuted: number;
  totalFailed: number;
}

/**
 * Pool statistics
 */
export interface PoolStats {
  totalExecuted: number;
  totalFailed: number;
  totalTimeout: number;
  averageWaitTime: number;
  averageExecutionTime: number;
  peakConcurrent: number;
  peakQueueSize: number;
}

/**
 * Connection Pool for managing concurrent execution
 */
export class ConnectionPool {
  private config: Required<PoolConfig>;
  private active = 0;
  private queue: QueuedRequest<unknown>[] = [];
  private stats: PoolStats = {
    totalExecuted: 0,
    totalFailed: 0,
    totalTimeout: 0,
    averageWaitTime: 0,
    averageExecutionTime: 0,
    peakConcurrent: 0,
    peakQueueSize: 0
  };
  private totalWaitTime = 0;
  private totalExecutionTime = 0;

  constructor(config: PoolConfig = {}) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
  }

  /**
   * Execute function with pool management
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we can execute immediately
    if (this.active < this.config.maxConcurrent) {
      return this.executeImmediate(fn);
    }

    // Check queue capacity
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new PoolExhaustedError(
        `Pool queue full (${this.queue.length}/${this.config.maxQueueSize})`,
        this.queue.length
      );
    }

    // Queue the request
    return this.enqueue(fn);
  }

  /**
   * Check if pool has capacity
   */
  hasCapacity(): boolean {
    return this.active < this.config.maxConcurrent ||
           this.queue.length < this.config.maxQueueSize;
  }

  /**
   * Get pool status
   */
  getStatus(): PoolStatus {
    return {
      active: this.active,
      idle: this.config.maxConcurrent - this.active,
      pending: this.queue.length,
      queued: this.queue.length,
      maxConcurrent: this.config.maxConcurrent,
      maxQueueSize: this.config.maxQueueSize,
      totalExecuted: this.stats.totalExecuted,
      totalFailed: this.stats.totalFailed
    };
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return {
      ...this.stats,
      averageWaitTime: this.stats.totalExecuted > 0
        ? this.totalWaitTime / this.stats.totalExecuted
        : 0,
      averageExecutionTime: this.stats.totalExecuted > 0
        ? this.totalExecutionTime / this.stats.totalExecuted
        : 0
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalExecuted: 0,
      totalFailed: 0,
      totalTimeout: 0,
      averageWaitTime: 0,
      averageExecutionTime: 0,
      peakConcurrent: 0,
      peakQueueSize: 0
    };
    this.totalWaitTime = 0;
    this.totalExecutionTime = 0;
  }

  /**
   * Drain the pool (reject all queued requests)
   */
  drain(): number {
    const drained = this.queue.length;

    for (const request of this.queue) {
      if (request.timeout) {
        clearTimeout(request.timeout);
      }
      request.reject(new Error('Pool drained'));
    }

    this.queue = [];
    return drained;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async executeImmediate<T>(fn: () => Promise<T>): Promise<T> {
    this.active++;
    this.updatePeakConcurrent();

    const startTime = Date.now();

    try {
      const result = await fn();
      this.stats.totalExecuted++;
      this.totalExecutionTime += Date.now() - startTime;
      return result;
    } catch (error) {
      this.stats.totalFailed++;
      throw error;
    } finally {
      this.active--;
      this.processQueue();
    }
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest<T> = {
        execute: fn,
        resolve,
        reject,
        enqueuedAt: Date.now()
      };

      // Set timeout
      if (this.config.acquireTimeout > 0) {
        request.timeout = setTimeout(() => {
          const index = this.queue.indexOf(request as QueuedRequest<unknown>);
          if (index !== -1) {
            this.queue.splice(index, 1);
            this.stats.totalTimeout++;
            reject(new TimeoutError(
              `Pool acquire timeout (${this.config.acquireTimeout}ms)`,
              this.config.acquireTimeout
            ));
          }
        }, this.config.acquireTimeout);
      }

      // Add to queue (FIFO or LIFO)
      if (this.config.fifo) {
        this.queue.push(request as QueuedRequest<unknown>);
      } else {
        this.queue.unshift(request as QueuedRequest<unknown>);
      }

      this.updatePeakQueueSize();
    });
  }

  private processQueue(): void {
    if (this.queue.length === 0 || this.active >= this.config.maxConcurrent) {
      return;
    }

    const request = this.queue.shift()!;

    if (request.timeout) {
      clearTimeout(request.timeout);
    }

    const waitTime = Date.now() - request.enqueuedAt;
    this.totalWaitTime += waitTime;

    this.executeImmediate(request.execute)
      .then(request.resolve)
      .catch(request.reject);
  }

  private updatePeakConcurrent(): void {
    if (this.active > this.stats.peakConcurrent) {
      this.stats.peakConcurrent = this.active;
    }
  }

  private updatePeakQueueSize(): void {
    if (this.queue.length > this.stats.peakQueueSize) {
      this.stats.peakQueueSize = this.queue.length;
    }
  }
}

/**
 * Token Bucket Rate Limiter
 */
export class RateLimiter {
  private config: Required<RateLimitConfig>;
  private tokens: number;
  private lastRefill: number;

  constructor(config: RateLimitConfig = {}) {
    this.config = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
    this.tokens = this.config.maxBurst;
    this.lastRefill = Date.now();
  }

  /**
   * Try to acquire a token (non-blocking)
   */
  tryAcquire(): boolean {
    if (!this.config.enabled) {
      return true;
    }

    this.refill();

    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }

    return false;
  }

  /**
   * Acquire a token (blocking)
   */
  async acquire(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    while (!this.tryAcquire()) {
      // Wait for next refill
      const waitTime = Math.ceil(
        this.config.interval / this.config.tokensPerInterval
      );
      await this.sleep(waitTime);
    }
  }

  /**
   * Execute function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    return fn();
  }

  /**
   * Get current token count
   */
  getTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Get rate limiter status
   */
  getStatus(): { tokens: number; maxBurst: number; enabled: boolean } {
    return {
      tokens: this.getTokens(),
      maxBurst: this.config.maxBurst,
      enabled: this.config.enabled
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(
      (elapsed / this.config.interval) * this.config.tokensPerInterval
    );

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.tokens + tokensToAdd, this.config.maxBurst);
      this.lastRefill = now;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Managed Pool - combines ConnectionPool with RateLimiter
 */
export class ManagedPool {
  private pool: ConnectionPool;
  private rateLimiter: RateLimiter;

  constructor(poolConfig: PoolConfig = {}, rateLimitConfig: RateLimitConfig = {}) {
    this.pool = new ConnectionPool(poolConfig);
    this.rateLimiter = new RateLimiter(rateLimitConfig);
  }

  /**
   * Execute with both pool and rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // First acquire rate limit token
    await this.rateLimiter.acquire();

    // Then execute through pool
    return this.pool.execute(fn);
  }

  /**
   * Get combined status
   */
  getStatus(): {
    pool: PoolStatus;
    rateLimit: { tokens: number; maxBurst: number; enabled: boolean };
  } {
    return {
      pool: this.pool.getStatus(),
      rateLimit: this.rateLimiter.getStatus()
    };
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return this.pool.getStats();
  }

  /**
   * Drain the pool
   */
  drain(): number {
    return this.pool.drain();
  }
}

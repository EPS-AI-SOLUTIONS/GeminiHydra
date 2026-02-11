/**
 * RequestCache - Deduplication and caching for identical requests
 * Feature #9: Request Deduplication
 */

import crypto from 'node:crypto';
import chalk from 'chalk';

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  hits: number;
}

export interface CacheOptions {
  ttl?: number; // Time to live in ms (default: 5 minutes)
  maxSize?: number; // Max entries (default: 100)
  onHit?: (key: string) => void;
  onMiss?: (key: string) => void;
}

const DEFAULT_OPTIONS: CacheOptions = {
  ttl: 5 * 60 * 1000, // 5 minutes
  maxSize: 100,
};

/**
 * LRU Cache with TTL for request deduplication
 */
export class RequestCache<T = string> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private options: Required<CacheOptions>;
  private stats = { hits: 0, misses: 0 };

  constructor(options: CacheOptions = {}) {
    this.options = {
      ttl: options.ttl ?? DEFAULT_OPTIONS.ttl ?? 300000,
      maxSize: options.maxSize ?? DEFAULT_OPTIONS.maxSize ?? 100,
      onHit: options.onHit ?? (() => {}),
      onMiss: options.onMiss ?? (() => {}),
    };
  }

  /**
   * Generate cache key from request parameters
   */
  private generateKey(params: unknown): string {
    const serialized = JSON.stringify(params);
    return crypto.createHash('sha256').update(serialized).digest('hex').substring(0, 16);
  }

  /**
   * Get value from cache
   */
  get(params: unknown): T | undefined {
    const key = this.generateKey(params);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.options.onMiss(key);
      return undefined;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.options.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.options.onMiss(key);
      return undefined;
    }

    // Cache hit
    entry.hits++;
    this.stats.hits++;
    this.options.onHit(key);

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(params: unknown, value: T): void {
    const key = this.generateKey(params);

    // Evict oldest if at capacity
    if (this.cache.size >= this.options.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0,
    });
  }

  /**
   * Get or compute value
   */
  async getOrCompute(params: unknown, compute: () => Promise<T>): Promise<T> {
    const cached = this.get(params);
    if (cached !== undefined) {
      return cached;
    }

    const value = await compute();
    this.set(params, value);
    return value;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Clear expired entries
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.options.ttl) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }
}

/**
 * In-flight request deduplication
 * Prevents duplicate concurrent requests for the same data
 */
export class RequestDeduplicator<T = string> {
  private inFlight: Map<string, Promise<T>> = new Map();

  private generateKey(params: unknown): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(params))
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Execute request with deduplication
   * If same request is in-flight, return existing promise
   */
  async execute(params: unknown, fn: () => Promise<T>, timeoutMs: number = 120000): Promise<T> {
    const key = this.generateKey(params);

    // Check if request already in flight
    const existing = this.inFlight.get(key);
    if (existing) {
      console.log(chalk.gray(`[Dedup] Reusing in-flight request: ${key}`));
      return existing;
    }

    // Create new request with timeout protection
    const promise = Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`[Dedup] Request timeout after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]).finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  getInFlightCount(): number {
    return this.inFlight.size;
  }
}

// Global instances
export const requestCache = new RequestCache<string>();
export const requestDeduplicator = new RequestDeduplicator<string>();

export default {
  RequestCache,
  RequestDeduplicator,
  requestCache,
  requestDeduplicator,
};

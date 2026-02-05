/**
 * GeminiHydra - Cache System
 * TTL-based caching with LRU eviction
 */

import type { CacheConfig, CacheEntry } from '../types/provider.js';

/**
 * Eviction policy type
 */
export type EvictionPolicy = 'lru' | 'lfu' | 'fifo';

/**
 * Extended cache config for constructor
 */
interface ExtendedCacheConfig extends CacheConfig {
  ttl?: number;
  staleTtl?: number;
}

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG = {
  ttl: 60000,
  defaultTTL: 60000,           // 1 minute
  maxSize: 1000,               // Max entries
  evictionPolicy: 'lru' as EvictionPolicy,
  staleWhileRevalidate: true
};

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  hitRate: number;
}

/**
 * TTL Cache with LRU eviction
 */
export class TTLCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private config: typeof DEFAULT_CACHE_CONFIG;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
    hitRate: 0
  };
  private getNow: () => number;

  constructor(config: ExtendedCacheConfig = {}) {
    // Support both 'ttl' and 'defaultTTL' config options
    const ttl = config.ttl ?? config.defaultTTL ?? DEFAULT_CACHE_CONFIG.defaultTTL;
    this.config = {
      ...DEFAULT_CACHE_CONFIG,
      ...config,
      ttl,
      defaultTTL: ttl
    };
    // Use Date.now() by default, can be overridden for testing
    this.getNow = () => Date.now();
  }

  /**
   * Get value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    const now = this.getNow();

    // Check if expired
    if (entry.expiresAt < now) {
      this.cache.delete(key);
      this.stats.size = this.cache.size;
      this.stats.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Update access tracking for LRU
    entry.accessCount++;
    entry.lastAccessedAt = now;

    this.stats.hits++;
    this.updateHitRate();
    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    const now = this.getNow();
    const effectiveTTL = ttl ?? this.config.defaultTTL;

    // Evict if at capacity
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evict();
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt: now + effectiveTTL,
      createdAt: now,
      accessCount: 1,
      lastAccessedAt: now
    };

    this.cache.set(key, entry);
    this.stats.size = this.cache.size;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (entry.expiresAt < this.getNow()) {
      this.cache.delete(key);
      this.stats.size = this.cache.size;
      return false;
    }

    return true;
  }

  /**
   * Delete key from cache
   */
  delete(key: string): boolean {
    const result = this.cache.delete(key);
    this.stats.size = this.cache.size;
    return result;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  /**
   * Get or fetch value
   */
  async getOrFetch(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Check cache first
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    // Fetch and cache
    const value = await fetcher();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Get or fetch with stale-while-revalidate
   */
  async getOrFetchSWR(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const entry = this.cache.get(key);
    const now = this.getNow();

    // If we have an entry (even if stale) and SWR is enabled
    if (entry && this.config.staleWhileRevalidate) {
      // Return stale value immediately, refresh in background
      if (entry.expiresAt < now) {
        // Async refresh without blocking
        fetcher().then(value => {
          this.set(key, value, ttl);
        }).catch(() => {
          // Silently fail, keep stale data
        });
      }

      entry.accessCount++;
      entry.lastAccessedAt = now;
      this.stats.hits++;
      this.updateHitRate();
      return entry.value;
    }

    // No entry or SWR disabled, fetch synchronously
    return this.getOrFetch(key, fetcher, ttl);
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    const now = this.getNow();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      if (entry.expiresAt < now) {
        this.cache.delete(key);
        pruned++;
      }
    }

    this.stats.size = this.cache.size;
    return pruned;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: this.cache.size,
      hitRate: 0
    };
  }

  /**
   * Set time function (for testing with fake timers)
   */
  setTimeFunction(fn: () => number): void {
    this.getNow = fn;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private evict(): void {
    if (this.cache.size === 0) return;

    let keyToEvict: string | undefined;

    switch (this.config.evictionPolicy) {
      case 'lru':
        keyToEvict = this.findLRU();
        break;
      case 'lfu':
        keyToEvict = this.findLFU();
        break;
      case 'fifo':
        keyToEvict = this.findFIFO();
        break;
    }

    if (keyToEvict) {
      this.cache.delete(keyToEvict);
      this.stats.evictions++;
    }
  }

  private findLRU(): string | undefined {
    let oldest = Infinity;
    let oldestKey: string | undefined;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessedAt < oldest) {
        oldest = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  private findLFU(): string | undefined {
    let leastAccessed = Infinity;
    let leastKey: string | undefined;

    for (const [key, entry] of this.cache) {
      if (entry.accessCount < leastAccessed) {
        leastAccessed = entry.accessCount;
        leastKey = key;
      }
    }

    return leastKey;
  }

  private findFIFO(): string | undefined {
    let oldest = Infinity;
    let oldestKey: string | undefined;

    for (const [key, entry] of this.cache) {
      if (entry.createdAt < oldest) {
        oldest = entry.createdAt;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    if (total > 0) {
      this.stats.hitRate = this.stats.hits / total;
    }
  }
}

/**
 * Health check cache config
 */
interface HealthCheckCacheConfig {
  ttl?: number;
  staleTtl?: number;
}

/**
 * Stale result wrapper
 */
interface StaleResult<T> {
  data: T;
  isStale: boolean;
}

/**
 * Health Check Cache - specialized for provider health checks
 * Supports stale-while-revalidate pattern
 */
export class HealthCheckCache<T = unknown> {
  private cache: Map<string, { value: T; expiresAt: number; createdAt: number }> = new Map();
  private defaultTTL: number;
  private staleTTL: number;
  private refreshCallbacks: Map<string, () => Promise<T>> = new Map();
  private refreshInterval?: ReturnType<typeof setInterval>;
  private getNow: () => number;

  constructor(config: HealthCheckCacheConfig | number = 30000) {
    if (typeof config === 'number') {
      this.defaultTTL = config;
      this.staleTTL = config * 5; // Default stale TTL is 5x normal TTL
    } else {
      this.defaultTTL = config.ttl ?? 30000;
      this.staleTTL = config.staleTtl ?? this.defaultTTL * 5;
    }
    this.getNow = () => Date.now();
  }

  /**
   * Set a value directly
   */
  set(key: string, value: T, ttl?: number): void {
    const now = this.getNow();
    this.cache.set(key, {
      value,
      expiresAt: now + (ttl ?? this.defaultTTL),
      createdAt: now
    });
  }

  /**
   * Get value synchronously (returns undefined if expired)
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const now = this.getNow();
    if (entry.expiresAt > now) {
      return entry.value;
    }

    return undefined;
  }

  /**
   * Get value with stale handling
   */
  getWithStale(key: string): StaleResult<T> | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    const now = this.getNow();
    const isExpired = entry.expiresAt < now;
    const isPastStale = entry.createdAt + this.staleTTL < now;

    // If past stale TTL, return undefined
    if (isPastStale) {
      this.cache.delete(key);
      return undefined;
    }

    return {
      data: entry.value,
      isStale: isExpired
    };
  }

  /**
   * Register a provider with its refresh callback
   */
  register(key: string, refreshFn: () => Promise<T>): void {
    this.refreshCallbacks.set(key, refreshFn);
  }

  /**
   * Get cached value or refresh (async)
   */
  async getOrRefresh(key: string): Promise<T | undefined> {
    const entry = this.cache.get(key);
    const now = this.getNow();

    if (entry && entry.expiresAt > now) {
      return entry.value;
    }

    // Try to refresh
    const refreshFn = this.refreshCallbacks.get(key);
    if (refreshFn) {
      try {
        const value = await refreshFn();
        this.set(key, value);
        return value;
      } catch {
        // Return stale if available and within stale TTL
        if (entry && entry.createdAt + this.staleTTL > now) {
          return entry.value;
        }
      }
    }

    return undefined;
  }

  /**
   * Get cached value without refresh
   */
  getCached(key: string): T | undefined {
    const entry = this.cache.get(key);
    return entry?.value;
  }

  /**
   * Refresh all registered providers
   */
  async refreshAll(): Promise<Map<string, T>> {
    const results = new Map<string, T>();

    const promises = Array.from(this.refreshCallbacks.entries()).map(
      async ([key, refreshFn]) => {
        try {
          const value = await refreshFn();
          this.set(key, value);
          results.set(key, value);
        } catch {
          // Keep existing value if refresh fails
        }
      }
    );

    await Promise.all(promises);
    return results;
  }

  /**
   * Get all cached values
   */
  getAll(): Map<string, T> {
    const results = new Map<string, T>();
    for (const [key, entry] of this.cache) {
      results.set(key, entry.value);
    }
    return results;
  }

  /**
   * Start auto-refresh
   */
  startAutoRefresh(intervalMs = 30000): void {
    this.stopAutoRefresh();
    this.refreshInterval = setInterval(() => {
      this.refreshAll().catch(() => {});
    }, intervalMs);
  }

  /**
   * Stop auto-refresh
   */
  stopAutoRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = undefined;
    }
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Clear all (including callbacks)
   */
  clearAll(): void {
    this.cache.clear();
    this.refreshCallbacks.clear();
    this.stopAutoRefresh();
  }

  /**
   * Set time function (for testing)
   */
  setTimeFunction(fn: () => number): void {
    this.getNow = fn;
  }
}

/**
 * Memoize function with TTL cache
 */
export function memoize<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: { ttl?: number; keyFn?: (...args: Parameters<T>) => string } = {}
): T {
  const cache = new TTLCache<Awaited<ReturnType<T>>>({ defaultTTL: options.ttl ?? 60000 });
  const keyFn = options.keyFn ?? ((...args) => JSON.stringify(args));

  return (async (...args: Parameters<T>) => {
    const key = keyFn(...args);
    return cache.getOrFetch(key, () => fn(...args) as Promise<Awaited<ReturnType<T>>>);
  }) as T;
}

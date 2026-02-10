/**
 * Swarm - BoundedResultStore utility class
 *
 * Bounded result store with oldest-first eviction and TTL (Fix #14).
 * Prevents unbounded memory growth from accumulated task results.
 *
 * @module core/swarm/BoundedResultStore
 */

// ============================================================================
// BOUNDED RESULT STORE
// ============================================================================

export class BoundedResultStore<T> {
  private entries: Map<string, { value: T; timestamp: number }> = new Map();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number = 500, ttlMs: number = 60 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  set(key: string, value: T): void {
    // Evict expired entries first
    this.evictExpired();

    // If still at capacity, evict oldest entries
    while (this.entries.size >= this.maxSize) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      } else {
        break;
      }
    }

    this.entries.set(key, { value, timestamp: Date.now() });
  }

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  getAll(): T[] {
    this.evictExpired();
    return Array.from(this.entries.values()).map(e => e.value);
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (now - entry.timestamp > this.ttlMs) {
        this.entries.delete(key);
      }
    }
  }
}

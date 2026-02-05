/**
 * GeminiHydra - Cache Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TTLCache, HealthCheckCache, type EvictionPolicy } from '../../src/core/cache.js';

describe('TTLCache', () => {
  let cache: TTLCache<string>;
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1000000; // Start at a fixed time
    cache = new TTLCache<string>({ ttl: 1000, maxSize: 5 });
    cache.setTimeFunction(() => currentTime);
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should delete values', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should return false when deleting non-existent key', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should clear all values', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it('should return correct size', () => {
      expect(cache.size).toBe(0);
      cache.set('key1', 'value1');
      expect(cache.size).toBe(1);
      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      // Advance time past TTL
      currentTime += 1001;

      expect(cache.get('key1')).toBeUndefined();
    });

    it('should support custom TTL per entry', () => {
      cache.set('short', 'value1', 500);
      cache.set('long', 'value2', 2000);

      currentTime += 600;
      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe('value2');

      currentTime += 1500;
      expect(cache.get('long')).toBeUndefined();
    });

    it('should prune expired entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      currentTime += 1001;
      cache.prune();

      expect(cache.size).toBe(0);
    });
  });

  describe('max size and eviction', () => {
    it('should evict oldest entry when max size reached (LRU)', () => {
      const lruCache = new TTLCache<string>({ ttl: 10000, maxSize: 3, evictionPolicy: 'lru' });
      let lruTime = 1000000;
      lruCache.setTimeFunction(() => lruTime);

      lruCache.set('key1', 'value1');
      lruTime += 10;
      lruCache.set('key2', 'value2');
      lruTime += 10;
      lruCache.set('key3', 'value3');
      lruTime += 10;

      // Access key1 to make it recently used
      lruCache.get('key1');
      lruTime += 10;

      // Add new entry, should evict key2 (least recently used)
      lruCache.set('key4', 'value4');

      expect(lruCache.get('key1')).toBe('value1');
      expect(lruCache.get('key2')).toBeUndefined();
      expect(lruCache.get('key3')).toBe('value3');
      expect(lruCache.get('key4')).toBe('value4');
    });

    it('should evict first inserted entry (FIFO)', () => {
      const fifoCache = new TTLCache<string>({ ttl: 10000, maxSize: 3, evictionPolicy: 'fifo' });
      let fifoTime = 1000000;
      fifoCache.setTimeFunction(() => fifoTime);

      fifoCache.set('key1', 'value1');
      fifoTime += 10;
      fifoCache.set('key2', 'value2');
      fifoTime += 10;
      fifoCache.set('key3', 'value3');
      fifoTime += 10;

      // Access key1 (should not affect FIFO order)
      fifoCache.get('key1');
      fifoTime += 10;

      // Add new entry, should evict key1 (first inserted)
      fifoCache.set('key4', 'value4');

      expect(fifoCache.get('key1')).toBeUndefined();
      expect(fifoCache.get('key2')).toBe('value2');
    });
  });

  describe('getOrFetch', () => {
    it('should return cached value if exists', async () => {
      cache.set('key1', 'cached');
      const fetcher = vi.fn().mockResolvedValue('fetched');

      const result = await cache.getOrFetch('key1', fetcher);

      expect(result).toBe('cached');
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should fetch and cache value if not exists', async () => {
      const fetcher = vi.fn().mockResolvedValue('fetched');

      const result = await cache.getOrFetch('key1', fetcher);

      expect(result).toBe('fetched');
      expect(fetcher).toHaveBeenCalledOnce();
      expect(cache.get('key1')).toBe('fetched');
    });

    it('should not cache fetch errors', async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error('fetch failed'));

      await expect(cache.getOrFetch('key1', fetcher)).rejects.toThrow('fetch failed');
      expect(cache.get('key1')).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('nonexistent'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 2);
    });
  });
});

describe('HealthCheckCache', () => {
  let cache: HealthCheckCache<{ healthy: boolean; latency: number }>;
  let currentTime: number;

  beforeEach(() => {
    currentTime = 1000000;
    cache = new HealthCheckCache({ ttl: 1000, staleTtl: 5000 });
    cache.setTimeFunction(() => currentTime);
  });

  it('should cache health check results', () => {
    cache.set('provider1', { healthy: true, latency: 100 });
    const result = cache.get('provider1');

    expect(result?.healthy).toBe(true);
    expect(result?.latency).toBe(100);
  });

  it('should return stale data when entry is expired but within staleTtl', () => {
    cache.set('provider1', { healthy: true, latency: 100 });

    // Advance past TTL but within staleTtl
    currentTime += 2000;

    const result = cache.getWithStale('provider1');
    expect(result?.data.healthy).toBe(true);
    expect(result?.isStale).toBe(true);
  });

  it('should return undefined when past staleTtl', () => {
    cache.set('provider1', { healthy: true, latency: 100 });

    // Advance past staleTtl
    currentTime += 6000;

    const result = cache.getWithStale('provider1');
    expect(result).toBeUndefined();
  });
});

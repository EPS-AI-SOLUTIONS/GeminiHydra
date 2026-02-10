/**
 * Tests for Connection Pool and Rate Limiter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ConnectionPool,
  RateLimiter,
  ManagedPool,
  DEFAULT_POOL_CONFIG,
  DEFAULT_RATE_LIMIT_CONFIG,
} from '../../src/core/pool.js';
import { PoolExhaustedError, TimeoutError } from '../../src/core/errors.js';

describe('ConnectionPool', () => {
  let pool: ConnectionPool;
  // Track promises that need cleanup to prevent unhandled rejection warnings
  let pendingPromises: Promise<any>[];

  beforeEach(() => {
    pendingPromises = [];
  });

  afterEach(async () => {
    pool?.drain();
    // Wait for all tracked promises to settle (they may reject from drain)
    await Promise.allSettled(pendingPromises);
  });

  describe('constructor', () => {
    it('should use default config', () => {
      pool = new ConnectionPool();
      const status = pool.getStatus();

      expect(status.maxConcurrent).toBe(DEFAULT_POOL_CONFIG.maxConcurrent);
      expect(status.maxQueueSize).toBe(DEFAULT_POOL_CONFIG.maxQueueSize);
    });

    it('should merge custom config', () => {
      pool = new ConnectionPool({ maxConcurrent: 3, maxQueueSize: 10 });
      const status = pool.getStatus();

      expect(status.maxConcurrent).toBe(3);
      expect(status.maxQueueSize).toBe(10);
    });
  });

  describe('execute', () => {
    it('should execute function immediately when pool has capacity', async () => {
      pool = new ConnectionPool({ maxConcurrent: 2 });

      const result = await pool.execute(async () => 'result');

      expect(result).toBe('result');
    });

    it('should track active count during execution', async () => {
      pool = new ConnectionPool({ maxConcurrent: 2 });

      const slowFn = async () => {
        expect(pool.getStatus().active).toBe(1);
        return 'done';
      };

      await pool.execute(slowFn);
      expect(pool.getStatus().active).toBe(0);
    });

    it('should queue requests when at capacity', async () => {
      pool = new ConnectionPool({ maxConcurrent: 1, acquireTimeout: 5000 });

      let resolve1: () => void;
      const promise1 = new Promise<void>(r => { resolve1 = r; });

      const exec1 = pool.execute(async () => {
        await promise1;
        return 1;
      });
      pendingPromises.push(exec1);

      const exec2 = pool.execute(async () => 2);
      pendingPromises.push(exec2);

      // First should be executing, second should be queued
      expect(pool.getStatus().active).toBe(1);
      expect(pool.getStatus().queued).toBe(1);

      // Resolve first
      resolve1!();
      await exec1;

      // Second should complete
      const result2 = await exec2;
      expect(result2).toBe(2);
    });

    it('should throw PoolExhaustedError when queue is full', async () => {
      pool = new ConnectionPool({ maxConcurrent: 1, maxQueueSize: 1, acquireTimeout: 5000 });

      // Fill capacity
      const blocking = pool.execute(async () => {
        await new Promise(r => setTimeout(r, 100));
        return 'blocking';
      });
      pendingPromises.push(blocking);

      // Fill queue
      const queued = pool.execute(async () => 'queued');
      pendingPromises.push(queued);

      // Third should fail
      await expect(pool.execute(async () => 'overflow'))
        .rejects.toThrow(PoolExhaustedError);
    });

    it('should handle execution errors', async () => {
      pool = new ConnectionPool();

      await expect(pool.execute(async () => {
        throw new Error('Test error');
      })).rejects.toThrow('Test error');

      // Pool should still work after error
      const result = await pool.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('should timeout queued requests', async () => {
      vi.useFakeTimers();

      const localPool = new ConnectionPool({ maxConcurrent: 1, acquireTimeout: 1000 });

      // Block the pool with a long-running task
      const blockingPromise = localPool.execute(async () => {
        await new Promise(r => setTimeout(r, 5000));
        return 'blocking';
      });

      // Queue a request that will timeout waiting in queue
      const timeoutPromise = localPool.execute(async () => 'should timeout');
      // Attach a no-op catch to prevent unhandled rejection warning during timer advancement
      timeoutPromise.catch(() => {});

      // Advance time past timeout for queued request
      await vi.advanceTimersByTimeAsync(1100);

      // timeoutPromise should reject with TimeoutError
      await expect(timeoutPromise).rejects.toThrow(TimeoutError);

      // Drain pool and advance remaining timers to settle everything
      localPool.drain();
      await vi.advanceTimersByTimeAsync(10000);

      // Clean up
      vi.useRealTimers();

      // Settle the blocking promise
      await blockingPromise.catch(() => {});
    });
  });

  describe('hasCapacity', () => {
    it('should return true when not at capacity', () => {
      pool = new ConnectionPool({ maxConcurrent: 2 });
      expect(pool.hasCapacity()).toBe(true);
    });

    it('should return true when queue has space', async () => {
      pool = new ConnectionPool({ maxConcurrent: 1, maxQueueSize: 5, acquireTimeout: 5000 });

      // Fill active slots
      const blocking = pool.execute(async () => {
        await new Promise(r => setTimeout(r, 100));
      });
      pendingPromises.push(blocking);

      expect(pool.hasCapacity()).toBe(true);
    });

    it('should return false when fully exhausted', async () => {
      pool = new ConnectionPool({ maxConcurrent: 1, maxQueueSize: 1, acquireTimeout: 5000 });

      // Fill active slots
      const exec1 = pool.execute(async () => {
        await new Promise(r => setTimeout(r, 100));
      });
      pendingPromises.push(exec1);

      // Fill queue
      const exec2 = pool.execute(async () => {});
      pendingPromises.push(exec2);

      expect(pool.hasCapacity()).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('should return correct initial status', () => {
      pool = new ConnectionPool({ maxConcurrent: 5, maxQueueSize: 10 });
      const status = pool.getStatus();

      expect(status.active).toBe(0);
      expect(status.idle).toBe(5);
      expect(status.pending).toBe(0);
      expect(status.queued).toBe(0);
      expect(status.totalExecuted).toBe(0);
      expect(status.totalFailed).toBe(0);
    });

    it('should track execution counts', async () => {
      pool = new ConnectionPool();

      await pool.execute(async () => 'success');
      await pool.execute(async () => 'success');
      await expect(pool.execute(async () => { throw new Error('fail'); })).rejects.toThrow();

      const status = pool.getStatus();
      expect(status.totalExecuted).toBe(2);
      expect(status.totalFailed).toBe(1);
    });
  });

  describe('getStats', () => {
    it('should return statistics', async () => {
      pool = new ConnectionPool();

      await pool.execute(async () => 'result');

      const stats = pool.getStats();
      expect(stats.totalExecuted).toBe(1);
      expect(stats.averageExecutionTime).toBeGreaterThanOrEqual(0);
    });

    it('should track peak concurrent', async () => {
      pool = new ConnectionPool({ maxConcurrent: 3 });

      const promises = [
        pool.execute(async () => { await new Promise(r => setTimeout(r, 50)); }),
        pool.execute(async () => { await new Promise(r => setTimeout(r, 50)); }),
        pool.execute(async () => { await new Promise(r => setTimeout(r, 50)); }),
      ];

      await Promise.all(promises);

      const stats = pool.getStats();
      expect(stats.peakConcurrent).toBe(3);
    });
  });

  describe('resetStats', () => {
    it('should reset all statistics', async () => {
      pool = new ConnectionPool();

      await pool.execute(async () => 'result');
      pool.resetStats();

      const stats = pool.getStats();
      expect(stats.totalExecuted).toBe(0);
      expect(stats.totalFailed).toBe(0);
      expect(stats.peakConcurrent).toBe(0);
    });
  });

  describe('drain', () => {
    it('should reject all queued requests', async () => {
      pool = new ConnectionPool({ maxConcurrent: 1, acquireTimeout: 5000 });

      // Block the pool
      const blocking = pool.execute(async () => {
        await new Promise(r => setTimeout(r, 1000));
      });
      pendingPromises.push(blocking);

      // Queue some requests
      const queued1 = pool.execute(async () => 1);
      pendingPromises.push(queued1);
      const queued2 = pool.execute(async () => 2);
      pendingPromises.push(queued2);

      // Drain
      const drained = pool.drain();

      expect(drained).toBe(2);

      await expect(queued1).rejects.toThrow('Pool drained');
      await expect(queued2).rejects.toThrow('Pool drained');
    });

    it('should return count of drained requests', () => {
      pool = new ConnectionPool();
      expect(pool.drain()).toBe(0);
    });
  });

  describe('FIFO vs LIFO', () => {
    it('should process queue in FIFO order by default', async () => {
      pool = new ConnectionPool({ maxConcurrent: 1, fifo: true, acquireTimeout: 5000 });

      const order: number[] = [];
      let resolve1: () => void;
      const promise1 = new Promise<void>(r => { resolve1 = r; });

      const exec1 = pool.execute(async () => {
        await promise1;
        order.push(1);
      });
      pendingPromises.push(exec1);

      const exec2 = pool.execute(async () => { order.push(2); });
      pendingPromises.push(exec2);
      const exec3 = pool.execute(async () => { order.push(3); });
      pendingPromises.push(exec3);

      resolve1!();
      await Promise.all([exec1, exec2, exec3]);

      expect(order).toEqual([1, 2, 3]);
    });

    it('should process queue in LIFO order when configured', async () => {
      pool = new ConnectionPool({ maxConcurrent: 1, fifo: false, acquireTimeout: 5000 });

      const order: number[] = [];
      let resolve1: () => void;
      const promise1 = new Promise<void>(r => { resolve1 = r; });

      const exec1 = pool.execute(async () => {
        await promise1;
        order.push(1);
      });
      pendingPromises.push(exec1);

      const exec2 = pool.execute(async () => { order.push(2); });
      pendingPromises.push(exec2);
      const exec3 = pool.execute(async () => { order.push(3); });
      pendingPromises.push(exec3);

      resolve1!();
      await Promise.all([exec1, exec2, exec3]);

      expect(order).toEqual([1, 3, 2]);
    });
  });
});

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  describe('constructor', () => {
    it('should use default config', () => {
      limiter = new RateLimiter();
      const status = limiter.getStatus();

      expect(status.maxBurst).toBe(DEFAULT_RATE_LIMIT_CONFIG.maxBurst);
      expect(status.enabled).toBe(true);
    });

    it('should merge custom config', () => {
      limiter = new RateLimiter({ maxBurst: 5, enabled: false });
      const status = limiter.getStatus();

      expect(status.maxBurst).toBe(5);
      expect(status.enabled).toBe(false);
    });

    it('should start with maxBurst tokens', () => {
      limiter = new RateLimiter({ maxBurst: 10 });
      expect(limiter.getTokens()).toBe(10);
    });
  });

  describe('tryAcquire', () => {
    it('should return true and consume token when available', () => {
      limiter = new RateLimiter({ maxBurst: 5 });

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.getTokens()).toBe(4);
    });

    it('should return false when no tokens available', () => {
      limiter = new RateLimiter({ maxBurst: 1 });

      expect(limiter.tryAcquire()).toBe(true); // Consume the only token
      expect(limiter.tryAcquire()).toBe(false);
    });

    it('should always return true when disabled', () => {
      limiter = new RateLimiter({ enabled: false, maxBurst: 0 });

      expect(limiter.tryAcquire()).toBe(true);
      expect(limiter.tryAcquire()).toBe(true);
    });
  });

  describe('acquire', () => {
    it('should resolve immediately when tokens available', async () => {
      limiter = new RateLimiter({ maxBurst: 5 });

      await limiter.acquire();
      expect(limiter.getTokens()).toBe(4);
    });

    it('should wait for token when none available', async () => {
      vi.useFakeTimers();
      limiter = new RateLimiter({
        maxBurst: 1,
        tokensPerInterval: 1,
        interval: 100
      });

      // Consume the token
      limiter.tryAcquire();

      const acquirePromise = limiter.acquire();

      // Advance time to refill tokens
      await vi.advanceTimersByTimeAsync(150);

      await acquirePromise;
      // Should have acquired successfully
      vi.useRealTimers();
    });

    it('should resolve immediately when disabled', async () => {
      limiter = new RateLimiter({ enabled: false });
      await limiter.acquire(); // Should not wait
    });
  });

  describe('execute', () => {
    it('should execute function after acquiring token', async () => {
      limiter = new RateLimiter({ maxBurst: 5 });

      const result = await limiter.execute(async () => 'result');

      expect(result).toBe('result');
      expect(limiter.getTokens()).toBe(4);
    });
  });

  describe('getTokens', () => {
    it('should refill tokens over time', async () => {
      vi.useFakeTimers();
      limiter = new RateLimiter({
        maxBurst: 10,
        tokensPerInterval: 2,
        interval: 100
      });

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        limiter.tryAcquire();
      }
      expect(limiter.getTokens()).toBe(0);

      // Advance time
      await vi.advanceTimersByTimeAsync(200);

      // Should have refilled some tokens
      expect(limiter.getTokens()).toBeGreaterThan(0);

      vi.useRealTimers();
    });

    it('should not exceed maxBurst', async () => {
      vi.useFakeTimers();
      limiter = new RateLimiter({
        maxBurst: 5,
        tokensPerInterval: 10,
        interval: 100
      });

      // Advance time significantly
      await vi.advanceTimersByTimeAsync(10000);

      expect(limiter.getTokens()).toBe(5);

      vi.useRealTimers();
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      limiter = new RateLimiter({ maxBurst: 10, enabled: true });

      const status = limiter.getStatus();

      expect(status.tokens).toBe(10);
      expect(status.maxBurst).toBe(10);
      expect(status.enabled).toBe(true);
    });
  });
});

describe('ManagedPool', () => {
  let managedPool: ManagedPool;
  let managedPendingPromises: Promise<any>[];

  beforeEach(() => {
    managedPendingPromises = [];
  });

  afterEach(async () => {
    managedPool?.drain();
    await Promise.allSettled(managedPendingPromises);
  });

  describe('constructor', () => {
    it('should create pool and rate limiter', () => {
      managedPool = new ManagedPool(
        { maxConcurrent: 3 },
        { maxBurst: 10 }
      );

      const status = managedPool.getStatus();
      expect(status.pool.maxConcurrent).toBe(3);
      expect(status.rateLimit.maxBurst).toBe(10);
    });
  });

  describe('execute', () => {
    it('should apply both rate limiting and pooling', async () => {
      managedPool = new ManagedPool(
        { maxConcurrent: 2 },
        { maxBurst: 5, enabled: true }
      );

      const result = await managedPool.execute(async () => 'result');
      expect(result).toBe('result');

      // Check rate limit was consumed
      expect(managedPool.getStatus().rateLimit.tokens).toBe(4);
    });
  });

  describe('getStatus', () => {
    it('should return combined status', () => {
      managedPool = new ManagedPool(
        { maxConcurrent: 3, maxQueueSize: 50 },
        { maxBurst: 10, enabled: true }
      );

      const status = managedPool.getStatus();

      expect(status.pool).toBeDefined();
      expect(status.pool.maxConcurrent).toBe(3);
      expect(status.rateLimit).toBeDefined();
      expect(status.rateLimit.maxBurst).toBe(10);
    });
  });

  describe('getStats', () => {
    it('should return pool statistics', async () => {
      managedPool = new ManagedPool();

      await managedPool.execute(async () => 'result');

      const stats = managedPool.getStats();
      expect(stats.totalExecuted).toBe(1);
    });
  });

  describe('drain', () => {
    it('should drain the pool', async () => {
      managedPool = new ManagedPool({ maxConcurrent: 1, acquireTimeout: 5000 });

      // Fill the pool with a blocking task
      const blocking = managedPool.execute(async () => {
        await new Promise(r => setTimeout(r, 1000));
      });
      managedPendingPromises.push(blocking);

      // Queue a second task (will be queued since pool is busy)
      const queued = managedPool.execute(async () => {});
      managedPendingPromises.push(queued);

      // Small delay to ensure the second task gets queued
      await new Promise(r => setTimeout(r, 10));

      const drained = managedPool.drain();
      expect(drained).toBe(1);

      await expect(queued).rejects.toThrow('Pool drained');
    });
  });
});

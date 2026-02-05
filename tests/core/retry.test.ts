/**
 * GeminiHydra - Retry Logic & Circuit Breaker Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  withRetry,
  withTimeout,
  withRetryAndTimeout,
  isRetryableError,
  calculateDelay,
  CircuitBreaker,
  CircuitBreakerRegistry,
  RETRYABLE_ERROR_CODES,
  RETRYABLE_STATUS_CODES
} from '../../src/core/retry.js';
import { CircuitOpenError, TimeoutError } from '../../src/core/errors.js';

describe('isRetryableError', () => {
  it('should return true for retryable error codes', () => {
    for (const code of RETRYABLE_ERROR_CODES) {
      const error = new Error('test') as Error & { code: string };
      error.code = code;
      expect(isRetryableError(error)).toBe(true);
    }
  });

  it('should return true for retryable status codes', () => {
    for (const status of RETRYABLE_STATUS_CODES) {
      const error = new Error('test') as Error & { status: number };
      error.status = status;
      expect(isRetryableError(error)).toBe(true);
    }
  });

  it('should return true for timeout messages', () => {
    expect(isRetryableError(new Error('Connection timeout'))).toBe(true);
    expect(isRetryableError(new Error('Request TIMEOUT'))).toBe(true);
  });

  it('should return true for rate limit errors', () => {
    expect(isRetryableError(new Error('rate limit exceeded'))).toBe(true);
    expect(isRetryableError(new Error('too many requests'))).toBe(true);
    expect(isRetryableError(new Error('Error 429'))).toBe(true);
  });

  it('should return false for non-retryable errors', () => {
    expect(isRetryableError(new Error('Invalid input'))).toBe(false);
    expect(isRetryableError(new Error('Authentication failed'))).toBe(false);
  });

  it('should return false for non-Error values', () => {
    expect(isRetryableError('string error')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });

  it('should use custom shouldRetry function', () => {
    const error = new Error('custom error');
    const shouldRetry = vi.fn().mockReturnValue(true);

    expect(isRetryableError(error, { shouldRetry })).toBe(true);
    expect(shouldRetry).toHaveBeenCalledWith(error);
  });
});

describe('calculateDelay', () => {
  it('should calculate exponential delay', () => {
    const delay0 = calculateDelay(0, { baseDelay: 1000, backoffMultiplier: 2, jitter: false });
    const delay1 = calculateDelay(1, { baseDelay: 1000, backoffMultiplier: 2, jitter: false });
    const delay2 = calculateDelay(2, { baseDelay: 1000, backoffMultiplier: 2, jitter: false });

    expect(delay0).toBe(1000);
    expect(delay1).toBe(2000);
    expect(delay2).toBe(4000);
  });

  it('should cap at maxDelay', () => {
    const delay = calculateDelay(10, { baseDelay: 1000, backoffMultiplier: 2, maxDelay: 5000, jitter: false });
    expect(delay).toBe(5000);
  });

  it('should apply jitter when enabled', () => {
    const delays = new Set<number>();
    for (let i = 0; i < 10; i++) {
      delays.add(calculateDelay(0, { baseDelay: 1000, jitter: true }));
    }
    // With jitter, we should get some variety
    expect(delays.size).toBeGreaterThan(1);
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('should retry on retryable errors', async () => {
    const error = new Error('timeout');
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');

    const resultPromise = withRetry(fn, { maxRetries: 3, baseDelay: 100, jitter: false });

    // Fast-forward through delays
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    const result = await resultPromise;
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max retries', async () => {
    const error = new Error('timeout');
    const fn = vi.fn().mockRejectedValue(error);

    const resultPromise = withRetry(fn, { maxRetries: 2, baseDelay: 100, jitter: false });

    // Fast-forward through all delays
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(200);

    await expect(resultPromise).rejects.toThrow('timeout');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should not retry non-retryable errors', async () => {
    const error = new Error('Authentication failed');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { maxRetries: 3 })).rejects.toThrow('Authentication failed');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('should call onRetry callback', async () => {
    const error = new Error('timeout');
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('success');
    const onRetry = vi.fn();

    const resultPromise = withRetry(fn, { maxRetries: 3, baseDelay: 100, jitter: false, onRetry });

    await vi.advanceTimersByTimeAsync(100);
    await resultPromise;

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({
      attempt: 1,
      error,
      willRetry: true
    }));
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should return result if function completes before timeout', async () => {
    const fn = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'success';
    });

    const resultPromise = withTimeout(fn, 500);
    await vi.advanceTimersByTimeAsync(100);

    const result = await resultPromise;
    expect(result).toBe('success');
  });

  it('should throw TimeoutError if function takes too long', async () => {
    const fn = vi.fn().mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return 'success';
    });

    const resultPromise = withTimeout(fn, 500, 'Custom timeout message');
    await vi.advanceTimersByTimeAsync(500);

    await expect(resultPromise).rejects.toThrow(TimeoutError);
    await expect(resultPromise).rejects.toThrow('Custom timeout message');

    // Clear remaining timers to prevent unhandled rejections
    vi.clearAllTimers();
  });
});

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    cb = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 5000,
      halfOpenMaxCalls: 2
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should start in closed state', () => {
    expect(cb.getState()).toBe('closed');
    expect(cb.isAvailable()).toBe(true);
  });

  it('should open after failure threshold', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fn)).rejects.toThrow('fail');
    }

    expect(cb.getState()).toBe('open');
    expect(cb.isAvailable()).toBe(false);
  });

  it('should throw CircuitOpenError when open', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fn)).rejects.toThrow('fail');
    }

    // Now circuit is open
    await expect(cb.execute(fn)).rejects.toThrow(CircuitOpenError);
  });

  it('should transition to half-open after timeout', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fn)).rejects.toThrow('fail');
    }

    expect(cb.getState()).toBe('open');

    // Advance past timeout
    vi.advanceTimersByTime(5001);

    expect(cb.isAvailable()).toBe(true);

    // Next call should transition to half-open
    fn.mockResolvedValue('success');
    await cb.execute(fn);
    expect(cb.getState()).toBe('half-open');
  });

  it('should close after success threshold in half-open', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fn)).rejects.toThrow('fail');
    }

    vi.advanceTimersByTime(5001);

    // Recover
    fn.mockResolvedValue('success');
    await cb.execute(fn);
    expect(cb.getState()).toBe('half-open');

    await cb.execute(fn);
    expect(cb.getState()).toBe('closed');
  });

  it('should reopen on failure in half-open', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(fn)).rejects.toThrow('fail');
    }

    vi.advanceTimersByTime(5001);

    // Try in half-open but fail
    await expect(cb.execute(fn)).rejects.toThrow('fail');

    expect(cb.getState()).toBe('open');
  });

  it('should respect halfOpenMaxCalls', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce('success1')
      .mockResolvedValueOnce('success2')
      .mockResolvedValueOnce('success3');

    // Trip the circuit
    const failFn = vi.fn().mockRejectedValue(new Error('fail'));
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(failFn)).rejects.toThrow('fail');
    }

    vi.advanceTimersByTime(5001);

    // First two calls should succeed
    await cb.execute(fn);
    await cb.execute(fn);

    // Circuit should now be closed, third call should work
    expect(cb.getState()).toBe('closed');
  });

  it('should provide status information', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    await expect(cb.execute(fn)).rejects.toThrow();

    const status = cb.getStatus();
    expect(status.state).toBe('closed');
    expect(status.failureCount).toBe(1);
    expect(status.lastFailureTime).toBeInstanceOf(Date);
  });

  it('should support forceOpen and forceClose', () => {
    cb.forceOpen();
    expect(cb.getState()).toBe('open');

    cb.forceClose();
    expect(cb.getState()).toBe('closed');
    expect(cb.getStatus().failureCount).toBe(0);
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry({ failureThreshold: 5 });
  });

  it('should create breakers on demand', () => {
    const breaker1 = registry.get('service1');
    const breaker2 = registry.get('service2');

    expect(breaker1).toBeInstanceOf(CircuitBreaker);
    expect(breaker2).toBeInstanceOf(CircuitBreaker);
    expect(breaker1).not.toBe(breaker2);
  });

  it('should return same breaker for same key', () => {
    const breaker1 = registry.get('service1');
    const breaker2 = registry.get('service1');

    expect(breaker1).toBe(breaker2);
  });

  it('should execute through specific breaker', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await registry.execute('service1', fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalled();
  });

  it('should track statuses for all breakers', () => {
    registry.get('service1');
    registry.get('service2');

    const statuses = registry.getStatuses();

    expect(statuses.size).toBe(2);
    expect(statuses.has('service1')).toBe(true);
    expect(statuses.has('service2')).toBe(true);
  });

  it('should reset all breakers', () => {
    const breaker = registry.get('service1');
    breaker.forceOpen();

    registry.resetAll();

    expect(breaker.getState()).toBe('closed');
  });

  it('should clear all breakers', () => {
    registry.get('service1');
    registry.get('service2');

    registry.clear();

    const statuses = registry.getStatuses();
    expect(statuses.size).toBe(0);
  });

  it('should list available breakers', async () => {
    const breaker1 = registry.get('service1');
    const breaker2 = registry.get('service2');

    breaker2.forceOpen();

    const available = registry.getAvailable();

    expect(available).toContain('service1');
    expect(available).not.toContain('service2');
  });
});

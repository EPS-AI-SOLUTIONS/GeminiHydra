/**
 * Tests for error hierarchy
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HydraError,
  ProviderError,
  GeminiError,
  LlamaCppError,
  OllamaError,
  NetworkError,
  TimeoutError,
  ConfigurationError,
  RoutingError,
  PipelineError,
  RateLimitError,
  CircuitOpenError,
  ValidationError,
  PoolExhaustedError,
  AggregateHydraError,
  normalizeError,
  isRetryable,
  isRecoverable,
  getErrorCode,
  withRetryContext,
} from '../../src/core/errors.js';

describe('Error Hierarchy', () => {
  describe('HydraError', () => {
    it('should create error with default options', () => {
      const error = new HydraError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.name).toBe('HydraError');
      expect(error.code).toBe('HYDRA_ERROR');
      expect(error.recoverable).toBe(false);
      expect(error.retryable).toBe(false);
      expect(error.context).toEqual({});
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    it('should create error with custom options', () => {
      const error = new HydraError('Test error', {
        code: 'CUSTOM_CODE',
        recoverable: true,
        retryable: true,
        context: { key: 'value' },
      });

      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.recoverable).toBe(true);
      expect(error.retryable).toBe(true);
      expect(error.context).toEqual({ key: 'value' });
    });

    it('should set cause if provided', () => {
      const cause = new Error('Original error');
      const error = new HydraError('Wrapped error', { cause });

      expect(error.cause).toBe(cause);
    });

    it('should serialize to JSON', () => {
      const error = new HydraError('Test error', {
        code: 'TEST_CODE',
        recoverable: true,
        retryable: false,
        context: { foo: 'bar' },
      });

      const json = error.toJSON();

      expect(json.name).toBe('HydraError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('TEST_CODE');
      expect(json.recoverable).toBe(true);
      expect(json.retryable).toBe(false);
      expect(json.context).toEqual({ foo: 'bar' });
      expect(json.timestamp).toBeDefined();
      expect(json.stack).toBeDefined();
    });

    it('should add context with withContext', () => {
      const error = new HydraError('Test error', {
        context: { existing: 'value' },
      });

      const result = error.withContext({ new: 'context' });

      expect(result).toBe(error); // Returns same instance
      expect(error.context).toEqual({ existing: 'value', new: 'context' });
    });

    it('should override context values with withContext', () => {
      const error = new HydraError('Test error', {
        context: { key: 'old' },
      });

      error.withContext({ key: 'new' });

      expect(error.context.key).toBe('new');
    });
  });

  describe('ProviderError', () => {
    it('should set provider name', () => {
      const error = new ProviderError('Provider failed', 'test-provider');

      expect(error.name).toBe('ProviderError');
      expect(error.provider).toBe('test-provider');
      expect(error.context.provider).toBe('test-provider');
      expect(error.code).toBe('PROVIDER_ERROR');
      expect(error.retryable).toBe(true); // Default for provider errors
    });

    it('should allow custom options', () => {
      const error = new ProviderError('Provider failed', 'test-provider', {
        code: 'CUSTOM_PROVIDER_ERROR',
        retryable: false,
      });

      expect(error.code).toBe('CUSTOM_PROVIDER_ERROR');
      expect(error.retryable).toBe(false);
    });
  });

  describe('GeminiError', () => {
    it('should set correct defaults', () => {
      const error = new GeminiError('Gemini API failed');

      expect(error.name).toBe('GeminiError');
      expect(error.provider).toBe('gemini');
      expect(error.code).toBe('GEMINI_ERROR');
    });

    it('should inherit from ProviderError', () => {
      const error = new GeminiError('Gemini API failed');
      expect(error instanceof ProviderError).toBe(true);
      expect(error instanceof HydraError).toBe(true);
    });
  });

  describe('LlamaCppError', () => {
    it('should set correct defaults', () => {
      const error = new LlamaCppError('LlamaCpp failed');

      expect(error.name).toBe('LlamaCppError');
      expect(error.provider).toBe('llamacpp');
      expect(error.code).toBe('LLAMACPP_ERROR');
    });
  });

  describe('OllamaError', () => {
    it('should set correct defaults', () => {
      const error = new OllamaError('Ollama failed');

      expect(error.name).toBe('OllamaError');
      expect(error.provider).toBe('ollama');
      expect(error.code).toBe('OLLAMA_ERROR');
    });
  });

  describe('NetworkError', () => {
    it('should set retryable to true by default', () => {
      const error = new NetworkError('Connection failed');

      expect(error.name).toBe('NetworkError');
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.retryable).toBe(true);
    });
  });

  describe('TimeoutError', () => {
    it('should store timeout value', () => {
      const error = new TimeoutError('Operation timed out', 5000);

      expect(error.name).toBe('TimeoutError');
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.timeoutMs).toBe(5000);
      expect(error.context.timeoutMs).toBe(5000);
      expect(error.retryable).toBe(true);
    });
  });

  describe('ConfigurationError', () => {
    it('should be non-recoverable and non-retryable', () => {
      const error = new ConfigurationError('Invalid config');

      expect(error.name).toBe('ConfigurationError');
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.recoverable).toBe(false);
      expect(error.retryable).toBe(false);
    });
  });

  describe('RoutingError', () => {
    it('should be retryable by default', () => {
      const error = new RoutingError('No route found');

      expect(error.name).toBe('RoutingError');
      expect(error.code).toBe('ROUTING_ERROR');
      expect(error.retryable).toBe(true);
    });
  });

  describe('PipelineError', () => {
    it('should store stage if provided', () => {
      const error = new PipelineError('Pipeline failed', 'execution');

      expect(error.name).toBe('PipelineError');
      expect(error.code).toBe('PIPELINE_ERROR');
      expect(error.stage).toBe('execution');
      expect(error.context.stage).toBe('execution');
    });

    it('should work without stage', () => {
      const error = new PipelineError('Pipeline failed');

      expect(error.stage).toBeUndefined();
      expect(error.context.stage).toBeUndefined();
    });
  });

  describe('RateLimitError', () => {
    it('should be retryable and store retry info', () => {
      const error = new RateLimitError('Rate limit exceeded', 1000);

      expect(error.name).toBe('RateLimitError');
      expect(error.code).toBe('RATE_LIMIT_ERROR');
      expect(error.retryable).toBe(true);
      expect(error.retryAfterMs).toBe(1000);
      expect(error.context.retryAfterMs).toBe(1000);
    });

    it('should work without retryAfterMs', () => {
      const error = new RateLimitError('Rate limit exceeded');

      expect(error.retryAfterMs).toBeUndefined();
      expect(error.context.retryAfterMs).toBeUndefined();
    });
  });

  describe('CircuitOpenError', () => {
    it('should be retryable and store next attempt time', () => {
      const nextAttempt = new Date();
      const error = new CircuitOpenError('Circuit is open', nextAttempt);

      expect(error.name).toBe('CircuitOpenError');
      expect(error.code).toBe('CIRCUIT_OPEN');
      expect(error.retryable).toBe(true);
      expect(error.nextAttemptAt).toBe(nextAttempt);
      expect(error.context.nextAttemptAt).toBe(nextAttempt.toISOString());
    });

    it('should work without nextAttemptAt', () => {
      const error = new CircuitOpenError('Circuit is open');

      expect(error.nextAttemptAt).toBeUndefined();
      expect(error.context.nextAttemptAt).toBeUndefined();
    });
  });

  describe('ValidationError', () => {
    it('should be non-recoverable and non-retryable', () => {
      const error = new ValidationError('Invalid input', 'email');

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.recoverable).toBe(false);
      expect(error.retryable).toBe(false);
      expect(error.field).toBe('email');
      expect(error.context.field).toBe('email');
    });

    it('should work without field', () => {
      const error = new ValidationError('Invalid input');

      expect(error.field).toBeUndefined();
      expect(error.context.field).toBeUndefined();
    });
  });

  describe('PoolExhaustedError', () => {
    it('should be retryable and store queue size', () => {
      const error = new PoolExhaustedError('Pool exhausted', 50);

      expect(error.name).toBe('PoolExhaustedError');
      expect(error.code).toBe('POOL_EXHAUSTED');
      expect(error.retryable).toBe(true);
      expect(error.queueSize).toBe(50);
      expect(error.context.queueSize).toBe(50);
    });

    it('should work without queue size', () => {
      const error = new PoolExhaustedError('Pool exhausted');

      expect(error.queueSize).toBeUndefined();
      expect(error.context.queueSize).toBeUndefined();
    });
  });

  describe('AggregateHydraError', () => {
    it('should aggregate multiple errors', () => {
      const errors = [
        new Error('Error 1'),
        new HydraError('Error 2'),
        new NetworkError('Error 3'),
      ];

      const aggregate = new AggregateHydraError('Multiple errors', errors);

      expect(aggregate.name).toBe('AggregateHydraError');
      expect(aggregate.code).toBe('AGGREGATE_ERROR');
      expect(aggregate.errors).toBe(errors);
      expect(aggregate.context.errorCount).toBe(3);
      expect(aggregate.context.errorTypes).toContain('Error');
      expect(aggregate.context.errorTypes).toContain('HydraError');
      expect(aggregate.context.errorTypes).toContain('NetworkError');
    });
  });

  describe('normalizeError', () => {
    it('should return HydraError unchanged', () => {
      const original = new HydraError('Original');
      const normalized = normalizeError(original);

      expect(normalized).toBe(original);
    });

    it('should wrap standard Error', () => {
      const original = new Error('Standard error');
      const normalized = normalizeError(original, 'WRAPPED_ERROR');

      expect(normalized).toBeInstanceOf(HydraError);
      expect(normalized.message).toBe('Standard error');
      expect(normalized.code).toBe('WRAPPED_ERROR');
      expect(normalized.cause).toBe(original);
    });

    it('should create HydraError from string', () => {
      const normalized = normalizeError('String error');

      expect(normalized).toBeInstanceOf(HydraError);
      expect(normalized.message).toBe('String error');
      expect(normalized.code).toBe('UNKNOWN_ERROR');
    });

    it('should create HydraError from unknown', () => {
      const normalized = normalizeError({ weird: 'object' });

      expect(normalized).toBeInstanceOf(HydraError);
      expect(normalized.message).toBe('Unknown error');
      expect(normalized.context.originalError).toEqual({ weird: 'object' });
    });

    it('should use default code', () => {
      const normalized = normalizeError('Error');
      expect(normalized.code).toBe('UNKNOWN_ERROR');
    });

    it('should use custom default code', () => {
      const normalized = normalizeError('Error', 'CUSTOM_DEFAULT');
      expect(normalized.code).toBe('CUSTOM_DEFAULT');
    });
  });

  describe('isRetryable', () => {
    it('should return true for retryable HydraError', () => {
      const error = new HydraError('Error', { retryable: true });
      expect(isRetryable(error)).toBe(true);
    });

    it('should return false for non-retryable HydraError', () => {
      const error = new HydraError('Error', { retryable: false });
      expect(isRetryable(error)).toBe(false);
    });

    it('should detect timeout in standard Error', () => {
      const error = new Error('Connection timeout');
      expect(isRetryable(error)).toBe(true);
    });

    it('should detect ECONNRESET in standard Error', () => {
      const error = new Error('ECONNRESET');
      expect(isRetryable(error)).toBe(true);
    });

    it('should detect ECONNREFUSED in standard Error', () => {
      const error = new Error('ECONNREFUSED');
      expect(isRetryable(error)).toBe(true);
    });

    it('should detect rate limit in standard Error', () => {
      const error = new Error('Rate limit exceeded');
      expect(isRetryable(error)).toBe(true);
    });

    it('should detect 429 status in standard Error', () => {
      const error = new Error('HTTP 429 Too Many Requests');
      expect(isRetryable(error)).toBe(true);
    });

    it('should detect 502/503 status in standard Error', () => {
      expect(isRetryable(new Error('502 Bad Gateway'))).toBe(true);
      expect(isRetryable(new Error('503 Service Unavailable'))).toBe(true);
    });

    it('should return false for unknown error type', () => {
      expect(isRetryable('string')).toBe(false);
      expect(isRetryable(null)).toBe(false);
      expect(isRetryable(undefined)).toBe(false);
    });

    it('should return false for non-retryable standard Error', () => {
      const error = new Error('Some other error');
      expect(isRetryable(error)).toBe(false);
    });
  });

  describe('isRecoverable', () => {
    it('should return true for recoverable HydraError', () => {
      const error = new HydraError('Error', { recoverable: true });
      expect(isRecoverable(error)).toBe(true);
    });

    it('should return false for non-recoverable HydraError', () => {
      const error = new HydraError('Error', { recoverable: false });
      expect(isRecoverable(error)).toBe(false);
    });

    it('should return false for standard Error', () => {
      const error = new Error('Standard error');
      expect(isRecoverable(error)).toBe(false);
    });

    it('should return false for non-Error values', () => {
      expect(isRecoverable('string')).toBe(false);
      expect(isRecoverable(null)).toBe(false);
    });
  });

  describe('getErrorCode', () => {
    it('should return code from HydraError', () => {
      const error = new HydraError('Error', { code: 'CUSTOM_CODE' });
      expect(getErrorCode(error)).toBe('CUSTOM_CODE');
    });

    it('should return name from standard Error', () => {
      const error = new TypeError('Type error');
      expect(getErrorCode(error)).toBe('TypeError');
    });

    it('should return UNKNOWN_ERROR for non-Error values', () => {
      expect(getErrorCode('string')).toBe('UNKNOWN_ERROR');
      expect(getErrorCode(null)).toBe('UNKNOWN_ERROR');
      expect(getErrorCode({})).toBe('UNKNOWN_ERROR');
    });
  });

  describe('withRetryContext', () => {
    it('should add retry context to HydraError', () => {
      const error = new HydraError('Error');
      const result = withRetryContext(error, 2, 5);

      expect(result).toBe(error);
      expect(error.context.attempt).toBe(2);
      expect(error.context.maxAttempts).toBe(5);
      expect(error.context.remainingAttempts).toBe(3);
    });

    it('should not modify standard Error', () => {
      const error = new Error('Standard error');
      const result = withRetryContext(error, 2, 5);

      expect(result).toBe(error);
      // Standard Error doesn't have context
    });
  });
});

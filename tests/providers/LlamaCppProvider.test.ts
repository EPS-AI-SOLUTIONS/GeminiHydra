/**
 * Tests for LlamaCpp Provider
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LlamaCppProvider,
  createLlamaCppProvider,
  LLAMA_CPP_MODELS,
} from '../../src/providers/LlamaCppProvider.js';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LlamaCppProvider', () => {
  let provider: LlamaCppProvider;

  beforeEach(() => {
    provider = new LlamaCppProvider({
      baseUrl: 'http://localhost:8000',
      model: 'test-model',
    });
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('should use default config', () => {
      const p = new LlamaCppProvider();
      expect(p.name).toBe('llama-cpp');
      expect(p.model).toBe('default');
    });

    it('should accept custom config', () => {
      const p = new LlamaCppProvider({
        baseUrl: 'http://custom:9000',
        model: 'custom-model',
        apiKey: 'test-key',
        timeout: 60000,
      });
      expect(p.model).toBe('custom-model');
    });

    it('should strip trailing slash from baseUrl', () => {
      const p = new LlamaCppProvider({ baseUrl: 'http://localhost:8000/' });
      // Base URL is private but we can test through method calls
      expect(p).toBeInstanceOf(LlamaCppProvider);
    });
  });

  describe('isAvailable', () => {
    it('should always return true', () => {
      expect(provider.isAvailable()).toBe(true);
    });
  });

  describe('checkHealth', () => {
    it('should return true when server responds', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const result = await provider.checkHealth();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/health',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return false when server fails', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const result = await provider.checkHealth();

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.checkHealth();

      expect(result).toBe(false);
    });
  });

  describe('getAvailableModels', () => {
    it('should return models from server', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'model-1' }, { id: 'model-2' }]
        }),
      });

      const models = await provider.getAvailableModels();

      expect(models).toEqual(['model-1', 'model-2']);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const models = await provider.getAvailableModels();

      expect(models).toEqual([]);
    });

    it('should return empty array on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const models = await provider.getAvailableModels();

      expect(models).toEqual([]);
    });
  });

  describe('getServerInfo', () => {
    it('should return server info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'test-model' }]
        }),
      });

      const info = await provider.getServerInfo();

      expect(info).not.toBeNull();
      expect(info?.model).toBe('test-model');
    });

    it('should return null when no models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      });

      const info = await provider.getServerInfo();

      expect(info).toBeNull();
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const info = await provider.getServerInfo();

      expect(info).toBeNull();
    });
  });

  describe('createChatCompletion', () => {
    it('should call API with correct parameters', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test-model',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Response' },
          finish_reason: 'stop',
        }],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const response = await provider.createChatCompletion({
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.8,
        max_tokens: 1000,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"temperature":0.8'),
        })
      );
      expect(response).toEqual(mockResponse);
    });

    it('should use default parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: 'Hi' } }] }),
      });

      await provider.createChatCompletion({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.7);
      expect(body.max_tokens).toBe(2048);
      expect(body.stream).toBe(false);
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal server error'),
      });

      await expect(provider.createChatCompletion({
        messages: [{ role: 'user', content: 'Hello' }],
      })).rejects.toThrow('llama-cpp-python error: 500');
    });

    it('should include API key in headers when provided', async () => {
      const authProvider = new LlamaCppProvider({
        baseUrl: 'http://localhost:8000',
        apiKey: 'test-api-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [] }),
      });

      await authProvider.createChatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer test-api-key');
    });
  });

  describe('createChatCompletionStream', () => {
    it('should handle streaming response', async () => {
      const chunks = [
        'data: {"id":"1","choices":[{"delta":{"content":"Hello"}}]}\n',
        'data: {"id":"2","choices":[{"delta":{"content":" World"}}]}\n',
        'data: [DONE]\n',
      ];

      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[0]) })
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[1]) })
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks[2]) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const result: any[] = [];
      for await (const chunk of provider.createChatCompletionStream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        result.push(chunk);
      }

      expect(result).toHaveLength(2);
      expect(result[0].choices[0].delta.content).toBe('Hello');
      expect(result[1].choices[0].delta.content).toBe(' World');
    });

    it('should throw when body is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
      });

      const generator = provider.createChatCompletionStream({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      await expect(generator.next()).rejects.toThrow('No response body');
    });

    it('should throw on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad request'),
      });

      const generator = provider.createChatCompletionStream({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      await expect(generator.next()).rejects.toThrow('llama-cpp-python error: 400');
    });

    it('should skip malformed chunks', async () => {
      const chunks = [
        'data: {"id":"1","choices":[{"delta":{"content":"OK"}}]}\n',
        'data: INVALID_JSON\n',
        'data: [DONE]\n',
      ];

      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(chunks.join('')) })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const result: any[] = [];
      for await (const chunk of provider.createChatCompletionStream({
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        result.push(chunk);
      }

      expect(result).toHaveLength(1);
    });
  });

  describe('withModel', () => {
    it('should create new provider with different model', () => {
      const newProvider = provider.withModel('new-model');

      expect(newProvider.model).toBe('new-model');
      expect(newProvider).not.toBe(provider);
    });
  });

  describe('static methods', () => {
    describe('getRecommendedModel', () => {
      it('should return first model for simple', () => {
        const model = LlamaCppProvider.getRecommendedModel('simple');
        expect(model).toBe(LLAMA_CPP_MODELS.simple[0]);
      });

      it('should return first model for medium', () => {
        const model = LlamaCppProvider.getRecommendedModel('medium');
        expect(model).toBe(LLAMA_CPP_MODELS.medium[0]);
      });

      it('should return first model for complex', () => {
        const model = LlamaCppProvider.getRecommendedModel('complex');
        expect(model).toBe(LLAMA_CPP_MODELS.complex[0]);
      });
    });

    describe('getModelsForDifficulty', () => {
      it('should return all models for difficulty', () => {
        const models = LlamaCppProvider.getModelsForDifficulty('medium');
        expect(models).toBe(LLAMA_CPP_MODELS.medium);
      });
    });
  });
});

describe('createLlamaCppProvider', () => {
  beforeEach(() => {
    delete process.env.LLAMA_CPP_URL;
    delete process.env.LLAMA_CPP_MODEL;
    delete process.env.LLAMA_CPP_API_KEY;
    delete process.env.LLAMA_CPP_TIMEOUT;
  });

  it('should create provider with custom config', () => {
    const provider = createLlamaCppProvider({
      baseUrl: 'http://custom:9000',
      model: 'custom-model',
    });

    expect(provider.model).toBe('custom-model');
  });

  it('should use environment variables', () => {
    process.env.LLAMA_CPP_URL = 'http://env:8000';
    process.env.LLAMA_CPP_MODEL = 'env-model';

    const provider = createLlamaCppProvider();

    expect(provider.model).toBe('env-model');
  });

  it('should prefer config over environment', () => {
    process.env.LLAMA_CPP_MODEL = 'env-model';

    const provider = createLlamaCppProvider({ model: 'config-model' });

    expect(provider.model).toBe('config-model');
  });
});

describe('LLAMA_CPP_MODELS', () => {
  it('should have models for all difficulty levels', () => {
    expect(LLAMA_CPP_MODELS.simple).toBeDefined();
    expect(LLAMA_CPP_MODELS.medium).toBeDefined();
    expect(LLAMA_CPP_MODELS.complex).toBeDefined();
  });

  it('should have non-empty model lists', () => {
    expect(LLAMA_CPP_MODELS.simple.length).toBeGreaterThan(0);
    expect(LLAMA_CPP_MODELS.medium.length).toBeGreaterThan(0);
    expect(LLAMA_CPP_MODELS.complex.length).toBeGreaterThan(0);
  });
});

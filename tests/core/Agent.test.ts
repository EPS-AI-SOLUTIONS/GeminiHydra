/**
 * Tests for Agent class
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Agent } from '../../src/core/Agent.js';
import type { LLMProvider, ChatCompletionResponse, ChatCompletionRequest } from '../../src/types/index.js';

// Mock logger
vi.mock('../../src/services/Logger.js', () => ({
  logger: {
    agentThinking: vi.fn(),
    agentDone: vi.fn(),
    agentError: vi.fn(),
  },
}));

// Helper to create mock provider
function createMockProvider(response: string = 'Test response'): LLMProvider {
  return {
    createChatCompletion: vi.fn().mockResolvedValue({
      id: 'test-id',
      object: 'chat.completion',
      created: Date.now(),
      model: 'test-model',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: response },
        finish_reason: 'stop',
      }],
    } satisfies ChatCompletionResponse),
  };
}

function createStreamingProvider(chunks: string[]): LLMProvider {
  return {
    createChatCompletion: vi.fn().mockResolvedValue({
      id: 'test-id',
      object: 'chat.completion',
      created: Date.now(),
      model: 'test-model',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: chunks.join('') },
        finish_reason: 'stop',
      }],
    }),
    createChatCompletionStream: vi.fn().mockImplementation(async function* () {
      for (const chunk of chunks) {
        yield {
          id: 'test-id',
          object: 'chat.completion.chunk',
          created: Date.now(),
          model: 'test-model',
          choices: [{
            index: 0,
            delta: { content: chunk },
            finish_reason: null,
          }],
        };
      }
    }),
  };
}

describe('Agent', () => {
  let provider: LLMProvider;

  beforeEach(() => {
    provider = createMockProvider();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create agent with role', () => {
      const agent = new Agent('geralt', provider);
      expect(agent.getName()).toBe('geralt');
    });

    it('should accept different agent roles', () => {
      const roles = ['dijkstra', 'yennefer', 'regis', 'triss', 'vesemir'] as const;

      for (const role of roles) {
        const agent = new Agent(role, provider);
        expect(agent.getName()).toBe(role);
      }
    });
  });

  describe('getName', () => {
    it('should return agent name', () => {
      const agent = new Agent('dijkstra', provider);
      expect(agent.getName()).toBe('dijkstra');
    });
  });

  describe('think', () => {
    it('should call provider with messages', async () => {
      const agent = new Agent('geralt', provider);

      await agent.think('Test prompt');

      expect(provider.createChatCompletion).toHaveBeenCalled();
      const call = (provider.createChatCompletion as any).mock.calls[0][0] as ChatCompletionRequest;
      expect(call.messages.some(m => m.role === 'user' && m.content === 'Test prompt')).toBe(true);
    });

    it('should include user message', async () => {
      const agent = new Agent('geralt', provider);

      await agent.think('Test prompt');

      const call = (provider.createChatCompletion as any).mock.calls[0][0] as ChatCompletionRequest;
      // Agent always includes user message with prompt
      expect(call.messages.some(m => m.role === 'user' && m.content === 'Test prompt')).toBe(true);
      // System message is only included if persona has systemPrompt defined
      // Current AGENT_PERSONAS don't have systemPrompt field
    });

    it('should include context as assistant message', async () => {
      const agent = new Agent('geralt', provider);

      await agent.think('Test prompt', 'Previous context');

      const call = (provider.createChatCompletion as any).mock.calls[0][0] as ChatCompletionRequest;
      expect(call.messages.some(m => m.role === 'assistant' && m.content === 'Previous context')).toBe(true);
    });

    it('should return provider response', async () => {
      const expectedResponse = 'Test agent response';
      provider = createMockProvider(expectedResponse);
      const agent = new Agent('geralt', provider);

      const result = await agent.think('Test prompt');

      expect(result).toBe(expectedResponse);
    });

    it('should handle empty response', async () => {
      provider = {
        createChatCompletion: vi.fn().mockResolvedValue({
          id: 'test-id',
          object: 'chat.completion',
          created: Date.now(),
          model: 'test-model',
          choices: [{
            index: 0,
            message: { role: 'assistant', content: '' },
            finish_reason: 'stop',
          }],
        }),
      };
      const agent = new Agent('geralt', provider);

      const result = await agent.think('Test prompt');

      expect(result).toBe('');
    });

    it('should handle missing content in response', async () => {
      provider = {
        createChatCompletion: vi.fn().mockResolvedValue({
          id: 'test-id',
          object: 'chat.completion',
          created: Date.now(),
          model: 'test-model',
          choices: [{
            index: 0,
            message: { role: 'assistant' },
            finish_reason: 'stop',
          }],
        }),
      };
      const agent = new Agent('geralt', provider);

      const result = await agent.think('Test prompt');

      expect(result).toBe('');
    });

    it('should throw on provider error', async () => {
      provider = {
        createChatCompletion: vi.fn().mockRejectedValue(new Error('Provider error')),
      };
      const agent = new Agent('geralt', provider);

      await expect(agent.think('Test prompt')).rejects.toThrow('Provider error');
    });

    it('should handle non-Error throws', async () => {
      provider = {
        createChatCompletion: vi.fn().mockRejectedValue('String error'),
      };
      const agent = new Agent('geralt', provider);

      await expect(agent.think('Test prompt')).rejects.toBe('String error');
    });
  });

  describe('thinkStream', () => {
    it('should yield chunks from streaming provider', async () => {
      const chunks = ['Hello', ' ', 'World', '!'];
      provider = createStreamingProvider(chunks);
      const agent = new Agent('geralt', provider);

      const result: string[] = [];
      for await (const chunk of agent.thinkStream('Test prompt')) {
        result.push(chunk);
      }

      expect(result).toEqual(chunks);
    });

    it('should fallback to non-streaming when stream not available', async () => {
      const response = 'Full response';
      provider = createMockProvider(response);
      const agent = new Agent('geralt', provider);

      const result: string[] = [];
      for await (const chunk of agent.thinkStream('Test prompt')) {
        result.push(chunk);
      }

      expect(result).toEqual([response]);
    });

    it('should include context in streaming mode', async () => {
      const chunks = ['Response'];
      provider = createStreamingProvider(chunks);
      const agent = new Agent('geralt', provider);

      const result: string[] = [];
      for await (const chunk of agent.thinkStream('Test prompt', 'Context')) {
        result.push(chunk);
      }

      const call = (provider.createChatCompletionStream as any).mock.calls[0][0] as ChatCompletionRequest;
      expect(call.messages.some(m => m.role === 'assistant' && m.content === 'Context')).toBe(true);
    });

    it('should filter out empty chunks', async () => {
      provider = {
        createChatCompletion: vi.fn(),
        createChatCompletionStream: vi.fn().mockImplementation(async function* () {
          yield {
            id: 'test-id',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'test-model',
            choices: [{
              index: 0,
              delta: { content: 'Hello' },
              finish_reason: null,
            }],
          };
          yield {
            id: 'test-id',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'test-model',
            choices: [{
              index: 0,
              delta: {}, // No content
              finish_reason: null,
            }],
          };
          yield {
            id: 'test-id',
            object: 'chat.completion.chunk',
            created: Date.now(),
            model: 'test-model',
            choices: [{
              index: 0,
              delta: { content: 'World' },
              finish_reason: 'stop',
            }],
          };
        }),
      };
      const agent = new Agent('geralt', provider);

      const result: string[] = [];
      for await (const chunk of agent.thinkStream('Test')) {
        result.push(chunk);
      }

      expect(result).toEqual(['Hello', 'World']);
    });
  });
});

/**
 * Tests for MCP Llama Provider
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  McpLlamaProvider,
  setMcpToolCaller,
  getMcpToolCaller,
  createMcpLlamaProvider,
  createMcpLlamaProviders,
  getRecommendedModel,
  type McpToolCaller,
} from '../../src/providers/McpLlamaProvider.js';

// Create mock MCP caller
function createMockMcpCaller(): McpToolCaller {
  return {
    llama_chat: vi.fn().mockResolvedValue({ content: 'Chat response', model: 'test' }),
    llama_generate: vi.fn().mockResolvedValue({ text: 'Generated text', model: 'test' }),
    llama_generate_fast: vi.fn().mockResolvedValue({ text: 'Fast generated text', model: 'test' }),
    llama_json: vi.fn().mockResolvedValue({ result: 'json' }),
    llama_analyze: vi.fn().mockResolvedValue({ sentiment: { label: 'positive', score: 0.9 } }),
    llama_code: vi.fn().mockResolvedValue({ code: 'function test() {}' }),
    llama_vision: vi.fn().mockResolvedValue({ description: 'Image description' }),
    llama_embed: vi.fn().mockResolvedValue({ embeddings: [[0.1, 0.2], [0.3, 0.4]] }),
  };
}

describe('McpLlamaProvider', () => {
  let provider: McpLlamaProvider;
  let mockCaller: McpToolCaller;

  beforeEach(() => {
    mockCaller = createMockMcpCaller();
    setMcpToolCaller(mockCaller);
    provider = new McpLlamaProvider();
  });

  afterEach(() => {
    // Reset global caller
    (setMcpToolCaller as any)(null);
  });

  describe('constructor', () => {
    it('should use default config', () => {
      const p = new McpLlamaProvider();
      expect(p.name).toBe('mcp-llama');
      expect(p.model).toBe('main');
    });

    it('should accept custom config', () => {
      const p = new McpLlamaProvider({
        defaultModel: 'functionary',
        temperature: 0.5,
        maxTokens: 1024,
      });
      expect(p.model).toBe('functionary');
    });
  });

  describe('isAvailable', () => {
    it('should return true when caller is set', () => {
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when caller is not set', () => {
      (setMcpToolCaller as any)(null);
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('healthCheck', () => {
    it('should return true when MCP is healthy', async () => {
      const result = await provider.healthCheck();
      expect(result).toBe(true);
      expect(mockCaller.llama_generate).toHaveBeenCalled();
    });

    it('should return false on error', async () => {
      mockCaller.llama_generate = vi.fn().mockRejectedValue(new Error('Connection failed'));
      const result = await provider.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('createChatCompletion', () => {
    it('should call llama_chat with messages', async () => {
      const response = await provider.createChatCompletion({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(mockCaller.llama_chat).toHaveBeenCalledWith(expect.objectContaining({
        messages: [{ role: 'user', content: 'Hello' }],
      }));
      expect(response.choices[0].message.content).toBe('Chat response');
    });

    it('should use custom temperature and max_tokens', async () => {
      await provider.createChatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        temperature: 0.9,
        max_tokens: 500,
      });

      expect(mockCaller.llama_chat).toHaveBeenCalledWith(expect.objectContaining({
        temperature: 0.9,
        max_tokens: 500,
      }));
    });

    it('should format response correctly', async () => {
      const response = await provider.createChatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(response.object).toBe('chat.completion');
      expect(response.choices).toHaveLength(1);
      expect(response.choices[0].message.role).toBe('assistant');
      expect(response.choices[0].finish_reason).toBe('stop');
    });
  });

  describe('createChatCompletionStream', () => {
    it('should yield chunks from llama_generate', async () => {
      const chunks: any[] = [];
      for await (const chunk of provider.createChatCompletionStream({
        messages: [{ role: 'user', content: 'Test' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBe(2); // Content chunk + finish chunk
      expect(chunks[0].choices[0].delta.content).toBe('Generated text');
      expect(chunks[1].choices[0].finish_reason).toBe('stop');
    });

    it('should use fast generation when enabled', async () => {
      const fastProvider = new McpLlamaProvider({ useFastGeneration: true });

      const chunks: any[] = [];
      for await (const chunk of fastProvider.createChatCompletionStream({
        messages: [{ role: 'user', content: 'Test' }],
      })) {
        chunks.push(chunk);
      }

      expect(mockCaller.llama_generate_fast).toHaveBeenCalled();
      expect(chunks[0].choices[0].delta.content).toBe('Fast generated text');
    });
  });

  describe('generateJson', () => {
    it('should call llama_json with schema', async () => {
      const schema = { type: 'object', properties: { name: { type: 'string' } } };

      await provider.generateJson('Generate JSON', schema);

      expect(mockCaller.llama_json).toHaveBeenCalledWith(expect.objectContaining({
        prompt: 'Generate JSON',
        schema,
      }));
    });
  });

  describe('analyzeText', () => {
    it('should call llama_analyze for sentiment', async () => {
      const result = await provider.analyzeText('Great product!', 'sentiment');

      expect(mockCaller.llama_analyze).toHaveBeenCalledWith(expect.objectContaining({
        text: 'Great product!',
        task: 'sentiment',
      }));
      expect(result.sentiment).toBeDefined();
    });

    it('should pass options', async () => {
      await provider.analyzeText('Text', 'translation', {
        targetLanguage: 'pl',
      });

      expect(mockCaller.llama_analyze).toHaveBeenCalledWith(expect.objectContaining({
        target_language: 'pl',
      }));
    });
  });

  describe('analyzeCode', () => {
    it('should call llama_code for generation', async () => {
      mockCaller.llama_code = vi.fn().mockResolvedValue({ code: 'const x = 1;' });

      const result = await provider.analyzeCode('generate', 'Create a variable', 'typescript');

      expect(mockCaller.llama_code).toHaveBeenCalledWith(expect.objectContaining({
        task: 'generate',
        description: 'Create a variable',
        language: 'typescript',
      }));
      expect(result).toBe('const x = 1;');
    });

    it('should call llama_code for explanation', async () => {
      mockCaller.llama_code = vi.fn().mockResolvedValue({ explanation: 'This code does X' });

      const result = await provider.analyzeCode('explain', 'const x = 1;');

      expect(mockCaller.llama_code).toHaveBeenCalledWith(expect.objectContaining({
        task: 'explain',
        code: 'const x = 1;',
      }));
      expect(result).toBe('This code does X');
    });

    it('should handle suggestions', async () => {
      mockCaller.llama_code = vi.fn().mockResolvedValue({ suggestions: ['Use const', 'Add types'] });

      const result = await provider.analyzeCode('refactor', 'code');
      expect(result).toContain('Use const');
    });

    it('should handle review', async () => {
      mockCaller.llama_code = vi.fn().mockResolvedValue({
        review: { issues: ['Issue 1'], improvements: ['Improvement 1'] }
      });

      const result = await provider.analyzeCode('review', 'code');
      expect(result).toContain('Issues');
      expect(result).toContain('Improvements');
    });

    it('should fallback to JSON for unknown response', async () => {
      mockCaller.llama_code = vi.fn().mockResolvedValue({ unknown: 'data' });

      const result = await provider.analyzeCode('fix', 'code');
      expect(result).toContain('unknown');
    });
  });

  describe('analyzeImage', () => {
    it('should call llama_vision', async () => {
      const result = await provider.analyzeImage('/path/to/image.jpg');

      expect(mockCaller.llama_vision).toHaveBeenCalledWith(expect.objectContaining({
        image: '/path/to/image.jpg',
      }));
      expect(result).toBe('Image description');
    });

    it('should use custom prompt', async () => {
      await provider.analyzeImage('/path/to/image.jpg', 'What objects are visible?');

      expect(mockCaller.llama_vision).toHaveBeenCalledWith(expect.objectContaining({
        prompt: 'What objects are visible?',
      }));
    });
  });

  describe('getEmbeddings', () => {
    it('should call llama_embed', async () => {
      const result = await provider.getEmbeddings(['text1', 'text2']);

      expect(mockCaller.llama_embed).toHaveBeenCalledWith({ texts: ['text1', 'text2'] });
      expect(result).toHaveLength(2);
    });
  });

  describe('withModel', () => {
    it('should create new provider with different model', () => {
      const newProvider = provider.withModel('functionary');

      expect(newProvider.model).toBe('functionary');
      expect(newProvider).not.toBe(provider);
    });
  });

  describe('withFastGeneration', () => {
    it('should create new provider with fast generation enabled', async () => {
      const fastProvider = provider.withFastGeneration();

      await fastProvider.createChatCompletionStream({
        messages: [{ role: 'user', content: 'Test' }],
      }).next();

      expect(mockCaller.llama_generate_fast).toHaveBeenCalled();
    });
  });
});

describe('MCP Tool Caller Management', () => {
  afterEach(() => {
    (setMcpToolCaller as any)(null);
  });

  describe('setMcpToolCaller', () => {
    it('should set global caller', () => {
      const caller = createMockMcpCaller();
      setMcpToolCaller(caller);
      expect(getMcpToolCaller()).toBe(caller);
    });
  });

  describe('getMcpToolCaller', () => {
    it('should throw when caller not set', () => {
      expect(() => getMcpToolCaller()).toThrow('MCP tool caller not initialized');
    });

    it('should return caller when set', () => {
      const caller = createMockMcpCaller();
      setMcpToolCaller(caller);
      expect(() => getMcpToolCaller()).not.toThrow();
    });
  });
});

describe('Factory Functions', () => {
  beforeEach(() => {
    setMcpToolCaller(createMockMcpCaller());
  });

  afterEach(() => {
    (setMcpToolCaller as any)(null);
  });

  describe('createMcpLlamaProvider', () => {
    it('should create provider with default config', () => {
      const provider = createMcpLlamaProvider();
      expect(provider).toBeInstanceOf(McpLlamaProvider);
    });

    it('should create provider with custom config', () => {
      const provider = createMcpLlamaProvider({ defaultModel: 'functionary' });
      expect(provider.model).toBe('functionary');
    });
  });

  describe('createMcpLlamaProviders', () => {
    it('should create providers for all phases', () => {
      const providers = createMcpLlamaProviders();

      expect(providers.phaseA).toBeInstanceOf(McpLlamaProvider);
      expect(providers.phaseBA).toBeInstanceOf(McpLlamaProvider);
      expect(providers.phaseB).toBeInstanceOf(McpLlamaProvider);
      expect(providers.phaseC).toBeInstanceOf(McpLlamaProvider);
      expect(providers.phaseD).toBeInstanceOf(McpLlamaProvider);
    });

    it('should use functionary for planning', () => {
      const providers = createMcpLlamaProviders();
      expect(providers.phaseA.model).toBe('functionary');
    });

    it('should use main for other phases', () => {
      const providers = createMcpLlamaProviders();
      expect(providers.phaseBA.model).toBe('main');
      expect(providers.phaseB.model).toBe('main');
      expect(providers.phaseC.model).toBe('main');
      expect(providers.phaseD.model).toBe('main');
    });
  });

  describe('getRecommendedModel', () => {
    it('should return main for simple tasks', () => {
      expect(getRecommendedModel('simple')).toBe('main');
    });

    it('should return main for moderate tasks', () => {
      expect(getRecommendedModel('moderate')).toBe('main');
    });

    it('should return functionary for complex tasks', () => {
      expect(getRecommendedModel('complex')).toBe('functionary');
    });
  });
});

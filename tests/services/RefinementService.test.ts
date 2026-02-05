/**
 * Tests for Refinement Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RefinementService, getRefinementService } from '../../src/services/RefinementService.js';
import type { LLMProvider, ChatCompletionResponse } from '../../src/types/index.js';

// Mock LlamaCppProvider
vi.mock('../../src/providers/LlamaCppProvider.js', () => ({
  LlamaCppProvider: {
    getRecommendedModel: vi.fn((difficulty: string) => {
      const models: Record<string, string> = {
        simple: 'llama-3.2-1b',
        moderate: 'llama-3.2-3b',
        complex: 'llama-3.1-8b',
      };
      return models[difficulty] || 'llama-3.2-3b';
    }),
  },
}));

function createMockProvider(response: string): LLMProvider {
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

function createFailingProvider(): LLMProvider {
  return {
    createChatCompletion: vi.fn().mockRejectedValue(new Error('Provider error')),
  };
}

describe('RefinementService', () => {
  let service: RefinementService;
  let provider: LLMProvider;

  beforeEach(() => {
    provider = createMockProvider('{}');
    service = new RefinementService(provider);
    vi.clearAllMocks();
  });

  describe('refine', () => {
    it('should parse valid JSON response', async () => {
      const response = JSON.stringify({
        originalObjective: 'Napisz hello world',
        translatedObjective: 'Write hello world',
        language: 'pl',
        difficulty: 'simple',
        recommendedModel: 'llama-3.2-1b',
        context: 'Basic programming task',
      });
      provider = createMockProvider(response);
      service = new RefinementService(provider);

      const result = await service.refine('Napisz hello world');

      expect(result.originalObjective).toBe('Napisz hello world');
      expect(result.translatedObjective).toBe('Write hello world');
      expect(result.language).toBe('pl');
      expect(result.difficulty).toBe('simple');
    });

    it('should handle JSON embedded in text', async () => {
      const response = `Here is the analysis:
{
  "originalObjective": "Test",
  "translatedObjective": "Test",
  "language": "en",
  "difficulty": "moderate",
  "recommendedModel": "llama-3.2-3b"
}
That's my analysis.`;
      provider = createMockProvider(response);
      service = new RefinementService(provider);

      const result = await service.refine('Test');

      expect(result.translatedObjective).toBe('Test');
      expect(result.difficulty).toBe('moderate');
    });

    it('should return fallback on invalid JSON', async () => {
      provider = createMockProvider('Not valid JSON');
      service = new RefinementService(provider);

      const result = await service.refine('Test objective');

      expect(result.originalObjective).toBe('Test objective');
      expect(result.translatedObjective).toBe('Test objective');
      expect(result.language).toBe('en');
      expect(result.difficulty).toBe('moderate');
    });

    it('should return fallback on provider error', async () => {
      provider = createFailingProvider();
      service = new RefinementService(provider);

      const result = await service.refine('Test objective');

      expect(result.originalObjective).toBe('Test objective');
      expect(result.context).toContain('Fallback');
    });

    it('should fill in missing fields', async () => {
      const response = JSON.stringify({
        difficulty: 'complex',
      });
      provider = createMockProvider(response);
      service = new RefinementService(provider);

      const result = await service.refine('Objective');

      expect(result.originalObjective).toBe('Objective');
      expect(result.translatedObjective).toBe('Objective');
      expect(result.language).toBe('en');
      expect(result.difficulty).toBe('complex');
    });

    it('should normalize difficulty - simple', async () => {
      const response = JSON.stringify({ difficulty: 'easy' });
      provider = createMockProvider(response);
      service = new RefinementService(provider);

      const result = await service.refine('Test');
      expect(result.difficulty).toBe('simple');
    });

    it('should normalize difficulty - complex', async () => {
      const response = JSON.stringify({ difficulty: 'hard' });
      provider = createMockProvider(response);
      service = new RefinementService(provider);

      const result = await service.refine('Test');
      expect(result.difficulty).toBe('complex');
    });

    it('should normalize difficulty - difficult', async () => {
      const response = JSON.stringify({ difficulty: 'difficult' });
      provider = createMockProvider(response);
      service = new RefinementService(provider);

      const result = await service.refine('Test');
      expect(result.difficulty).toBe('complex');
    });

    it('should default to moderate for unknown difficulty', async () => {
      const response = JSON.stringify({ difficulty: 'unknown' });
      provider = createMockProvider(response);
      service = new RefinementService(provider);

      const result = await service.refine('Test');
      expect(result.difficulty).toBe('moderate');
    });
  });

  describe('detectLanguage', () => {
    it('should detect language from response', async () => {
      provider = createMockProvider('pl');
      service = new RefinementService(provider);

      const result = await service.detectLanguage('Cześć, jak się masz?');

      expect(result).toBe('pl');
    });

    it('should handle language code with extra text', async () => {
      provider = createMockProvider('  EN  ');
      service = new RefinementService(provider);

      const result = await service.detectLanguage('Hello');

      expect(result).toBe('en');
    });

    it('should truncate long codes', async () => {
      provider = createMockProvider('english');
      service = new RefinementService(provider);

      const result = await service.detectLanguage('Hello');

      expect(result).toBe('en');
    });

    it('should return en on error', async () => {
      provider = createFailingProvider();
      service = new RefinementService(provider);

      const result = await service.detectLanguage('Test');

      expect(result).toBe('en');
    });
  });

  describe('classifyDifficulty', () => {
    it('should classify simple tasks', async () => {
      provider = createMockProvider('simple');
      service = new RefinementService(provider);

      const result = await service.classifyDifficulty('Print hello world');

      expect(result).toBe('simple');
    });

    it('should classify complex tasks', async () => {
      provider = createMockProvider('complex');
      service = new RefinementService(provider);

      const result = await service.classifyDifficulty('Design distributed system');

      expect(result).toBe('complex');
    });

    it('should default to moderate on error', async () => {
      provider = createFailingProvider();
      service = new RefinementService(provider);

      const result = await service.classifyDifficulty('Test');

      expect(result).toBe('moderate');
    });

    it('should normalize response', async () => {
      provider = createMockProvider('  EASY  ');
      service = new RefinementService(provider);

      const result = await service.classifyDifficulty('Test');

      expect(result).toBe('simple');
    });
  });

  describe('getRefinementService', () => {
    it('should return singleton instance', () => {
      // Reset singleton for test
      const instance1 = getRefinementService(provider);
      const instance2 = getRefinementService(provider);

      expect(instance1).toBe(instance2);
    });
  });
});

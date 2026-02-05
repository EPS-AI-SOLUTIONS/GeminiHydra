/**
 * Tests for Healing Service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealingService, getHealingService } from '../../src/services/HealingService.js';
import type { LLMProvider, ChatCompletionResponse, SwarmTask, ExecutionResult } from '../../src/types/index.js';

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

function createTask(id: number, agent: string = 'geralt', task: string = 'Task'): SwarmTask {
  return {
    id,
    agent,
    task,
    dependencies: [],
    status: 'pending',
  };
}

function createResult(id: number, success: boolean, error?: string): ExecutionResult {
  return {
    id,
    agent: 'geralt',
    success,
    content: success ? 'Result content' : '',
    error,
    duration: 100,
  };
}

describe('HealingService', () => {
  let service: HealingService;
  let provider: LLMProvider;

  beforeEach(() => {
    provider = createMockProvider('{}');
    service = new HealingService(provider, 3);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default maxRetries', () => {
      const defaultService = new HealingService(provider);
      // Default is 3, test indirectly
      expect(defaultService).toBeInstanceOf(HealingService);
    });

    it('should accept custom maxRetries', () => {
      const customService = new HealingService(provider, 5);
      expect(customService).toBeInstanceOf(HealingService);
    });
  });

  describe('evaluate', () => {
    it('should return success for all successful results', async () => {
      const tasks = [createTask(1), createTask(2)];
      const results = [
        createResult(1, true),
        createResult(2, true),
      ];

      const evaluation = await service.evaluate(tasks, results, 0);

      expect(evaluation.success).toBe(true);
      expect(evaluation.failedTasks).toEqual([]);
      expect(evaluation.repairTasks).toEqual([]);
      expect(evaluation.maxRetriesReached).toBe(false);
    });

    it('should detect failed tasks', async () => {
      const response = JSON.stringify({
        success: false,
        failedTasks: [2],
        repairTasks: [{
          failedTaskId: 2,
          reason: 'Timeout',
          repairStrategy: 'retry',
          repairPrompt: 'Try again',
        }],
        maxRetriesReached: false,
      });
      provider = createMockProvider(response);
      service = new HealingService(provider, 3);

      const tasks = [createTask(1), createTask(2)];
      const results = [
        createResult(1, true),
        createResult(2, false, 'Timeout'),
      ];

      const evaluation = await service.evaluate(tasks, results, 0);

      expect(evaluation.success).toBe(false);
      expect(evaluation.repairTasks.length).toBeGreaterThan(0);
    });

    it('should return maxRetriesReached when at limit', async () => {
      const tasks = [createTask(1)];
      const results = [createResult(1, false, 'Error')];

      const evaluation = await service.evaluate(tasks, results, 3);

      expect(evaluation.maxRetriesReached).toBe(true);
      expect(evaluation.repairTasks).toEqual([]);
    });

    it('should handle provider error with fallback', async () => {
      provider = createFailingProvider();
      service = new HealingService(provider, 3);

      const tasks = [createTask(1)];
      const results = [createResult(1, false, 'Some error')];

      const evaluation = await service.evaluate(tasks, results, 0);

      expect(evaluation.success).toBe(false);
      expect(evaluation.failedTasks).toContain(1);
    });

    it('should handle invalid JSON response', async () => {
      provider = createMockProvider('Not valid JSON');
      service = new HealingService(provider, 3);

      const tasks = [createTask(1)];
      const results = [createResult(1, false, 'Error')];

      const evaluation = await service.evaluate(tasks, results, 0);

      expect(evaluation.success).toBe(false);
      expect(evaluation.failedTasks).toContain(1);
    });

    it('should validate repair tasks against original tasks', async () => {
      const response = JSON.stringify({
        success: false,
        failedTasks: [999], // Non-existent task
        repairTasks: [{
          failedTaskId: 999, // Non-existent
          reason: 'Error',
          repairStrategy: 'retry',
          repairPrompt: 'Try again',
        }],
      });
      provider = createMockProvider(response);
      service = new HealingService(provider, 3);

      const tasks = [createTask(1)];
      const results = [createResult(1, false, 'Error')];

      const evaluation = await service.evaluate(tasks, results, 0);

      // Invalid repair task should be filtered out
      expect(evaluation.repairTasks.every(r => r.failedTaskId === 1 || tasks.some(t => t.id === r.failedTaskId))).toBe(true);
    });

    it('should normalize invalid repair strategies', async () => {
      const response = JSON.stringify({
        success: false,
        failedTasks: [1],
        repairTasks: [{
          failedTaskId: 1,
          reason: 'Error',
          repairStrategy: 'invalid_strategy',
          repairPrompt: 'Try',
        }],
      });
      provider = createMockProvider(response);
      service = new HealingService(provider, 3);

      const tasks = [createTask(1)];
      const results = [createResult(1, false, 'Error')];

      const evaluation = await service.evaluate(tasks, results, 0);

      // Should default to 'retry'
      const repairTask = evaluation.repairTasks.find(r => r.failedTaskId === 1);
      expect(repairTask?.repairStrategy).toBe('retry');
    });

    it('should set repair prompt to original task when empty', async () => {
      const response = JSON.stringify({
        success: false,
        failedTasks: [1],
        repairTasks: [{
          failedTaskId: 1,
          reason: 'Error',
          repairStrategy: 'retry',
          repairPrompt: '', // Empty
        }],
      });
      provider = createMockProvider(response);
      service = new HealingService(provider, 3);

      const tasks = [createTask(1, 'geralt', 'Original task prompt')];
      const results = [createResult(1, false, 'Error')];

      const evaluation = await service.evaluate(tasks, results, 0);

      const repairTask = evaluation.repairTasks.find(r => r.failedTaskId === 1);
      expect(repairTask?.repairPrompt).toBe('Original task prompt');
    });
  });

  describe('generateRepairPrompt', () => {
    it('should generate simplified prompt', async () => {
      provider = createMockProvider('Simplified: Do the simple thing');
      service = new HealingService(provider, 3);

      const task = createTask(1, 'geralt', 'Complex task');
      const result = await service.generateRepairPrompt(task, 'Timeout', 1);

      expect(result).toContain('Simplified');
    });

    it('should return original task on error', async () => {
      provider = createFailingProvider();
      service = new HealingService(provider, 3);

      const task = createTask(1, 'geralt', 'Original task');
      const result = await service.generateRepairPrompt(task, 'Error', 1);

      expect(result).toBe('Original task');
    });
  });

  describe('isRecoverable', () => {
    it('should return false for successful result', () => {
      const result = createResult(1, true);
      expect(service.isRecoverable(result)).toBe(false);
    });

    it('should return true for generic errors', () => {
      const result = createResult(1, false, 'Connection timeout');
      expect(service.isRecoverable(result)).toBe(true);
    });

    it('should return false for API key errors', () => {
      const result = createResult(1, false, 'Invalid API key');
      expect(service.isRecoverable(result)).toBe(false);
    });

    it('should return false for authentication errors', () => {
      const result = createResult(1, false, 'Authentication failed');
      expect(service.isRecoverable(result)).toBe(false);
    });

    it('should return false for authorization errors', () => {
      const result = createResult(1, false, 'Authorization denied');
      expect(service.isRecoverable(result)).toBe(false);
    });

    it('should return false for rate limit errors', () => {
      const result = createResult(1, false, 'Rate limit exceeded');
      expect(service.isRecoverable(result)).toBe(false);
    });

    it('should return false for quota errors', () => {
      const result = createResult(1, false, 'Quota exceeded');
      expect(service.isRecoverable(result)).toBe(false);
    });

    it('should return false for model not found', () => {
      const result = createResult(1, false, 'Model not found');
      expect(service.isRecoverable(result)).toBe(false);
    });

    it('should handle missing error message', () => {
      const result = createResult(1, false);
      expect(service.isRecoverable(result)).toBe(true);
    });
  });

  describe('getHealingService', () => {
    it('should return singleton instance', () => {
      const instance1 = getHealingService(provider);
      const instance2 = getHealingService(provider);
      expect(instance1).toBe(instance2);
    });
  });
});

/**
 * Tests for GraphProcessor
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GraphProcessor } from '../../src/core/GraphProcessor.js';
import type { LLMProvider, SwarmTask, ChatCompletionResponse } from '../../src/types/index.js';

// Mock logger
vi.mock('../../src/services/Logger.js', () => ({
  logger: {
    task: vi.fn(),
    taskComplete: vi.fn(),
    taskFailed: vi.fn(),
    agentThinking: vi.fn(),
    agentDone: vi.fn(),
    agentError: vi.fn(),
  },
}));

// Helper to create mock provider
function createMockProvider(responses: Map<string, string> = new Map()): LLMProvider {
  let callCount = 0;
  const defaultResponses = ['Response 1', 'Response 2', 'Response 3', 'Response 4', 'Response 5'];

  return {
    createChatCompletion: vi.fn().mockImplementation(async (request) => {
      const userMessage = request.messages.find((m: any) => m.role === 'user')?.content || '';
      const response = responses.get(userMessage) || defaultResponses[callCount++ % defaultResponses.length];

      return {
        id: `test-${callCount}`,
        object: 'chat.completion',
        created: Date.now(),
        model: 'test-model',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: response },
          finish_reason: 'stop',
        }],
      } satisfies ChatCompletionResponse;
    }),
  };
}

function createFailingProvider(failOnTask?: number): LLMProvider {
  let callCount = 0;

  return {
    createChatCompletion: vi.fn().mockImplementation(async () => {
      callCount++;
      if (failOnTask === undefined || callCount === failOnTask) {
        throw new Error(`Task ${callCount} failed`);
      }

      return {
        id: `test-${callCount}`,
        object: 'chat.completion',
        created: Date.now(),
        model: 'test-model',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: `Response ${callCount}` },
          finish_reason: 'stop',
        }],
      };
    }),
  };
}

describe('GraphProcessor', () => {
  let provider: LLMProvider;
  let processor: GraphProcessor;

  beforeEach(() => {
    provider = createMockProvider();
    processor = new GraphProcessor(provider);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create processor with provider', () => {
      const proc = new GraphProcessor(provider);
      expect(proc).toBeInstanceOf(GraphProcessor);
    });
  });

  describe('execute', () => {
    it('should execute empty task list', async () => {
      const results = await processor.execute([]);
      expect(results).toEqual([]);
    });

    it('should execute single task', async () => {
      const tasks: SwarmTask[] = [{
        id: 1,
        agent: 'geralt',
        task: 'Test task',
        dependencies: [],
        status: 'pending',
      }];

      const results = await processor.execute(tasks);

      expect(results.length).toBe(1);
      expect(results[0].id).toBe(1);
      expect(results[0].success).toBe(true);
      expect(results[0].content).toBeDefined();
    });

    it('should execute tasks in dependency order', async () => {
      const executionOrder: number[] = [];
      provider = {
        createChatCompletion: vi.fn().mockImplementation(async (request) => {
          const userMessage = request.messages.find((m: any) => m.role === 'user')?.content || '';
          const taskMatch = userMessage.match(/Task (\d+)/);
          if (taskMatch) {
            executionOrder.push(parseInt(taskMatch[1]));
          }
          return {
            id: 'test',
            object: 'chat.completion',
            created: Date.now(),
            model: 'test',
            choices: [{ index: 0, message: { role: 'assistant', content: 'Done' }, finish_reason: 'stop' }],
          };
        }),
      };
      processor = new GraphProcessor(provider);

      const tasks: SwarmTask[] = [
        { id: 3, agent: 'geralt', task: 'Task 3', dependencies: [2], status: 'pending' },
        { id: 2, agent: 'yennefer', task: 'Task 2', dependencies: [1], status: 'pending' },
        { id: 1, agent: 'dijkstra', task: 'Task 1', dependencies: [], status: 'pending' },
      ];

      await processor.execute(tasks);

      // Should execute in dependency order: 1, 2, 3
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    it('should pass context from dependencies', async () => {
      const responseMap = new Map([
        ['Task 1', 'Result from task 1'],
        ['Task 2', 'Result from task 2'],
      ]);
      provider = createMockProvider(responseMap);
      processor = new GraphProcessor(provider);

      const tasks: SwarmTask[] = [
        { id: 1, agent: 'geralt', task: 'Task 1', dependencies: [], status: 'pending' },
        { id: 2, agent: 'yennefer', task: 'Task 2', dependencies: [1], status: 'pending' },
      ];

      await processor.execute(tasks);

      // Second call should have context from first task
      const calls = (provider.createChatCompletion as any).mock.calls;
      expect(calls.length).toBe(2);

      // The second call should have an assistant message with context
      const secondCallMessages = calls[1][0].messages;
      const assistantMessage = secondCallMessages.find((m: any) =>
        m.role === 'assistant' && m.content.includes('Result from task 1')
      );
      expect(assistantMessage).toBeDefined();
    });

    it('should handle task execution errors', async () => {
      provider = createFailingProvider(1);
      processor = new GraphProcessor(provider);

      const tasks: SwarmTask[] = [{
        id: 1,
        agent: 'geralt',
        task: 'Test task',
        dependencies: [],
        status: 'pending',
      }];

      const results = await processor.execute(tasks);

      expect(results.length).toBe(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBeDefined();
    });

    it('should continue after task failure', async () => {
      provider = createFailingProvider(1);
      processor = new GraphProcessor(provider);

      const tasks: SwarmTask[] = [
        { id: 1, agent: 'geralt', task: 'Task 1', dependencies: [], status: 'pending' },
        { id: 2, agent: 'yennefer', task: 'Task 2', dependencies: [], status: 'pending' },
      ];

      const results = await processor.execute(tasks);

      expect(results.length).toBe(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });

    it('should track duration for each task', async () => {
      const tasks: SwarmTask[] = [{
        id: 1,
        agent: 'geralt',
        task: 'Test task',
        dependencies: [],
        status: 'pending',
      }];

      const results = await processor.execute(tasks);

      expect(results[0].duration).toBeGreaterThanOrEqual(0);
    });

    it('should not include failed dependency results in context', async () => {
      let contextReceived = '';
      provider = {
        createChatCompletion: vi.fn().mockImplementation(async (request) => {
          const assistantMessages = request.messages.filter((m: any) => m.role === 'assistant');
          if (assistantMessages.length > 0) {
            contextReceived = assistantMessages.map((m: any) => m.content).join('');
          }

          // First call fails
          if ((provider.createChatCompletion as any).mock.calls.length === 1) {
            throw new Error('Failed');
          }

          return {
            id: 'test',
            object: 'chat.completion',
            created: Date.now(),
            model: 'test',
            choices: [{ index: 0, message: { role: 'assistant', content: 'Success' }, finish_reason: 'stop' }],
          };
        }),
      };
      processor = new GraphProcessor(provider);

      const tasks: SwarmTask[] = [
        { id: 1, agent: 'geralt', task: 'Task 1', dependencies: [], status: 'pending' },
        { id: 2, agent: 'yennefer', task: 'Task 2', dependencies: [1], status: 'pending' },
      ];

      await processor.execute(tasks);

      // Context should not include failed task result
      expect(contextReceived).not.toContain('Wynik zadania #1');
    });

    it('should handle multiple dependencies', async () => {
      const responses = new Map([
        ['Task 1', 'Result 1'],
        ['Task 2', 'Result 2'],
        ['Task 3', 'Final result'],
      ]);
      provider = createMockProvider(responses);
      processor = new GraphProcessor(provider);

      const tasks: SwarmTask[] = [
        { id: 1, agent: 'geralt', task: 'Task 1', dependencies: [], status: 'pending' },
        { id: 2, agent: 'yennefer', task: 'Task 2', dependencies: [], status: 'pending' },
        { id: 3, agent: 'triss', task: 'Task 3', dependencies: [1, 2], status: 'pending' },
      ];

      await processor.execute(tasks);

      // Third call should have context from both dependencies
      const calls = (provider.createChatCompletion as any).mock.calls;
      const thirdCallMessages = calls[2][0].messages;
      const assistantMessage = thirdCallMessages.find((m: any) => m.role === 'assistant');

      expect(assistantMessage?.content).toContain('Result 1');
      expect(assistantMessage?.content).toContain('Result 2');
    });

    it('should handle different agent roles', async () => {
      const tasks: SwarmTask[] = [
        { id: 1, agent: 'dijkstra', task: 'Planning', dependencies: [], status: 'pending' },
        { id: 2, agent: 'regis', task: 'Analysis', dependencies: [], status: 'pending' },
        { id: 3, agent: 'vesemir', task: 'Review', dependencies: [], status: 'pending' },
      ];

      const results = await processor.execute(tasks);

      expect(results.length).toBe(3);
      expect(results[0].agent).toBe('dijkstra');
      expect(results[1].agent).toBe('regis');
      expect(results[2].agent).toBe('vesemir');
    });

    it('should handle diamond dependency pattern', async () => {
      const executionOrder: number[] = [];
      provider = {
        createChatCompletion: vi.fn().mockImplementation(async () => {
          executionOrder.push(executionOrder.length + 1);
          return {
            id: 'test',
            object: 'chat.completion',
            created: Date.now(),
            model: 'test',
            choices: [{ index: 0, message: { role: 'assistant', content: 'Done' }, finish_reason: 'stop' }],
          };
        }),
      };
      processor = new GraphProcessor(provider);

      //     1
      //    / \
      //   2   3
      //    \ /
      //     4
      const tasks: SwarmTask[] = [
        { id: 4, agent: 'geralt', task: 'Task 4', dependencies: [2, 3], status: 'pending' },
        { id: 3, agent: 'triss', task: 'Task 3', dependencies: [1], status: 'pending' },
        { id: 2, agent: 'yennefer', task: 'Task 2', dependencies: [1], status: 'pending' },
        { id: 1, agent: 'dijkstra', task: 'Task 1', dependencies: [], status: 'pending' },
      ];

      const results = await processor.execute(tasks);

      expect(results.length).toBe(4);
      // Task 1 must come first, task 4 must come last
      const task1Index = results.findIndex(r => r.id === 1);
      const task4Index = results.findIndex(r => r.id === 4);
      expect(task1Index).toBeLessThan(task4Index);
    });
  });
});

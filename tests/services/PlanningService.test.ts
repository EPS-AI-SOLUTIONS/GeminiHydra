/**
 * Tests for Planning Service
 */

import { describe, it, expect, vi } from 'vitest';
import { PlanningService, planningService } from '../../src/services/PlanningService.js';

// Mock logger
vi.mock('../../src/services/Logger.js', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe('PlanningService', () => {
  let service: PlanningService;

  beforeEach(() => {
    service = new PlanningService();
    vi.clearAllMocks();
  });

  describe('parseResponse', () => {
    it('should parse valid JSON response', () => {
      const response = `{
        "objective": "Test objective",
        "tasks": [
          {"id": 1, "agent": "geralt", "task": "Task 1", "dependencies": []}
        ]
      }`;

      const result = service.parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.objective).toBe('Test objective');
      expect(result?.tasks).toHaveLength(1);
    });

    it('should handle JSON wrapped in markdown code blocks', () => {
      const response = `\`\`\`json
{
  "objective": "Test",
  "tasks": []
}
\`\`\``;

      const result = service.parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.objective).toBe('Test');
    });

    it('should handle JSON with text before and after', () => {
      const response = `Here is the plan:
{
  "objective": "Test",
  "tasks": []
}
That's the plan!`;

      const result = service.parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.objective).toBe('Test');
    });

    it('should return null for invalid JSON', () => {
      const response = 'Not valid JSON at all';
      const result = service.parseResponse(response);
      expect(result).toBeNull();
    });

    it('should return null for no JSON object', () => {
      const response = '[1, 2, 3]';
      const result = service.parseResponse(response);
      expect(result).toBeNull();
    });

    it('should return null for empty response', () => {
      const result = service.parseResponse('');
      expect(result).toBeNull();
    });

    it('should handle case-insensitive json markers', () => {
      const response = `\`\`\`JSON
{"objective": "Test", "tasks": []}
\`\`\``;

      const result = service.parseResponse(response);
      expect(result).not.toBeNull();
    });
  });

  describe('validateTasks', () => {
    it('should validate complete tasks', () => {
      const tasks = [
        { id: 1, agent: 'geralt', task: 'Task 1', dependencies: [] },
        { id: 2, agent: 'yennefer', task: 'Task 2', dependencies: [1] },
      ];

      const result = service.validateTasks(tasks);

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('pending');
      expect(result[1].dependencies).toEqual([1]);
    });

    it('should fill in missing properties with defaults', () => {
      const tasks = [
        { task: 'Task with minimal props' },
      ];

      const result = service.validateTasks(tasks);

      expect(result[0].id).toBe(1);
      expect(result[0].agent).toBe('geralt');
      expect(result[0].dependencies).toEqual([]);
      expect(result[0].status).toBe('pending');
    });

    it('should limit number of tasks to MAX_TASKS', () => {
      const tasks = Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        agent: 'geralt',
        task: `Task ${i + 1}`,
        dependencies: [],
      }));

      const result = service.validateTasks(tasks);

      // MAX_TASKS is 10
      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should handle empty task list', () => {
      const result = service.validateTasks([]);
      expect(result).toEqual([]);
    });

    it('should assign sequential IDs when missing', () => {
      const tasks = [
        { agent: 'geralt', task: 'Task A' },
        { agent: 'yennefer', task: 'Task B' },
        { agent: 'triss', task: 'Task C' },
      ];

      const result = service.validateTasks(tasks);

      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
      expect(result[2].id).toBe(3);
    });
  });

  describe('createFallbackPlan', () => {
    it('should create single-task fallback plan', () => {
      const objective = 'Simple objective';
      const result = service.createFallbackPlan(objective);

      expect(result.objective).toBe(objective);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe(1);
      expect(result.tasks[0].agent).toBe('geralt');
      expect(result.tasks[0].task).toBe(objective);
      expect(result.tasks[0].dependencies).toEqual([]);
      expect(result.tasks[0].status).toBe('pending');
    });
  });

  describe('buildPrompt', () => {
    it('should build planning prompt with objective', () => {
      const objective = 'Create a web application';
      const prompt = service.buildPrompt(objective);

      expect(prompt).toContain(objective);
      expect(prompt).toContain('JSON');
      expect(prompt).toContain('dijkstra');
      expect(prompt).toContain('geralt');
      expect(prompt).toContain('philippa');
      expect(prompt).toContain('regis');
    });

    it('should include format example', () => {
      const prompt = service.buildPrompt('Test');

      expect(prompt).toContain('"objective"');
      expect(prompt).toContain('"tasks"');
      expect(prompt).toContain('"id"');
      expect(prompt).toContain('"agent"');
      expect(prompt).toContain('"dependencies"');
    });
  });

  describe('singleton export', () => {
    it('should export planningService instance', () => {
      expect(planningService).toBeInstanceOf(PlanningService);
    });
  });
});

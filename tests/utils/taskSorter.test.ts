/**
 * Tests for task sorter utilities
 */

import { describe, it, expect } from 'vitest';
import {
  topologicalSort,
  validateDependencies,
  hasCircularDependency,
} from '../../src/utils/taskSorter.js';
import type { SwarmTask } from '../../src/types/swarm.js';

// Helper to create a task
function createTask(id: number, dependencies: number[] = []): SwarmTask {
  return {
    id,
    agent: 'geralt',
    task: `Task ${id}`,
    dependencies,
    status: 'pending',
  };
}

describe('Task Sorter Utilities', () => {
  describe('topologicalSort', () => {
    it('should sort tasks with no dependencies in original order', () => {
      const tasks = [
        createTask(1),
        createTask(2),
        createTask(3),
      ];

      const sorted = topologicalSort(tasks);

      expect(sorted.map(t => t.id)).toEqual([1, 2, 3]);
    });

    it('should sort tasks with linear dependencies', () => {
      const tasks = [
        createTask(3, [2]),
        createTask(2, [1]),
        createTask(1),
      ];

      const sorted = topologicalSort(tasks);
      const ids = sorted.map(t => t.id);

      // Task 1 should come before 2, and 2 before 3
      expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(2));
      expect(ids.indexOf(2)).toBeLessThan(ids.indexOf(3));
    });

    it('should handle diamond dependencies', () => {
      // Task 4 depends on 2 and 3, both depend on 1
      const tasks = [
        createTask(4, [2, 3]),
        createTask(3, [1]),
        createTask(2, [1]),
        createTask(1),
      ];

      const sorted = topologicalSort(tasks);
      const ids = sorted.map(t => t.id);

      // Task 1 should come first
      expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(2));
      expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(3));
      // Tasks 2 and 3 should come before 4
      expect(ids.indexOf(2)).toBeLessThan(ids.indexOf(4));
      expect(ids.indexOf(3)).toBeLessThan(ids.indexOf(4));
    });

    it('should handle multiple independent chains', () => {
      const tasks = [
        createTask(1),
        createTask(2, [1]),
        createTask(3),
        createTask(4, [3]),
      ];

      const sorted = topologicalSort(tasks);
      const ids = sorted.map(t => t.id);

      expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(2));
      expect(ids.indexOf(3)).toBeLessThan(ids.indexOf(4));
    });

    it('should handle empty task list', () => {
      const sorted = topologicalSort([]);
      expect(sorted).toEqual([]);
    });

    it('should handle single task', () => {
      const tasks = [createTask(1)];
      const sorted = topologicalSort(tasks);
      expect(sorted).toEqual(tasks);
    });

    it('should ignore missing dependencies', () => {
      const tasks = [
        createTask(2, [1, 999]), // 999 doesn't exist
        createTask(1),
      ];

      const sorted = topologicalSort(tasks);
      const ids = sorted.map(t => t.id);

      expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(2));
    });

    it('should handle complex dependency graph', () => {
      // Complex graph:
      // 1 -> 2 -> 4
      // 1 -> 3 -> 4
      // 2 -> 3
      const tasks = [
        createTask(4, [2, 3]),
        createTask(3, [1, 2]),
        createTask(2, [1]),
        createTask(1),
      ];

      const sorted = topologicalSort(tasks);
      const ids = sorted.map(t => t.id);

      expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(2));
      expect(ids.indexOf(1)).toBeLessThan(ids.indexOf(3));
      expect(ids.indexOf(2)).toBeLessThan(ids.indexOf(3));
      expect(ids.indexOf(2)).toBeLessThan(ids.indexOf(4));
      expect(ids.indexOf(3)).toBeLessThan(ids.indexOf(4));
    });
  });

  describe('validateDependencies', () => {
    it('should return empty array for valid dependencies', () => {
      const tasks = [
        createTask(1),
        createTask(2, [1]),
        createTask(3, [1, 2]),
      ];

      expect(validateDependencies(tasks)).toEqual([]);
    });

    it('should return missing dependency IDs', () => {
      const tasks = [
        createTask(1),
        createTask(2, [1, 999]),
        createTask(3, [888]),
      ];

      const missing = validateDependencies(tasks);
      expect(missing).toContain(999);
      expect(missing).toContain(888);
      expect(missing.length).toBe(2);
    });

    it('should handle empty task list', () => {
      expect(validateDependencies([])).toEqual([]);
    });

    it('should handle tasks with no dependencies', () => {
      const tasks = [
        createTask(1),
        createTask(2),
        createTask(3),
      ];

      expect(validateDependencies(tasks)).toEqual([]);
    });

    it('should report duplicate missing dependencies once each', () => {
      const tasks = [
        createTask(1, [999]),
        createTask(2, [999]),
      ];

      const missing = validateDependencies(tasks);
      // Each occurrence is reported
      expect(missing.filter(id => id === 999).length).toBe(2);
    });
  });

  describe('hasCircularDependency', () => {
    it('should return false for tasks with no dependencies', () => {
      const tasks = [
        createTask(1),
        createTask(2),
        createTask(3),
      ];

      expect(hasCircularDependency(tasks)).toBe(false);
    });

    it('should return false for valid DAG', () => {
      const tasks = [
        createTask(1),
        createTask(2, [1]),
        createTask(3, [1, 2]),
      ];

      expect(hasCircularDependency(tasks)).toBe(false);
    });

    it('should detect simple cycle (A -> B -> A)', () => {
      const tasks = [
        createTask(1, [2]),
        createTask(2, [1]),
      ];

      expect(hasCircularDependency(tasks)).toBe(true);
    });

    it('should detect self-referencing task', () => {
      const tasks = [
        createTask(1, [1]),
      ];

      expect(hasCircularDependency(tasks)).toBe(true);
    });

    it('should detect longer cycles (A -> B -> C -> A)', () => {
      const tasks = [
        createTask(1, [3]),
        createTask(2, [1]),
        createTask(3, [2]),
      ];

      expect(hasCircularDependency(tasks)).toBe(true);
    });

    it('should detect cycle in complex graph', () => {
      // 1 -> 2 -> 3, but also 3 -> 1 (cycle)
      const tasks = [
        createTask(1, [3]),
        createTask(2, [1]),
        createTask(3, [2]),
        createTask(4, [3]), // Independent task depending on cycle
      ];

      expect(hasCircularDependency(tasks)).toBe(true);
    });

    it('should return false for diamond dependency (no cycle)', () => {
      const tasks = [
        createTask(1),
        createTask(2, [1]),
        createTask(3, [1]),
        createTask(4, [2, 3]),
      ];

      expect(hasCircularDependency(tasks)).toBe(false);
    });

    it('should handle empty task list', () => {
      expect(hasCircularDependency([])).toBe(false);
    });

    it('should handle single task without dependencies', () => {
      const tasks = [createTask(1)];
      expect(hasCircularDependency(tasks)).toBe(false);
    });

    it('should handle missing dependency references (no cycle)', () => {
      const tasks = [
        createTask(1, [999]), // 999 doesn't exist
        createTask(2, [1]),
      ];

      expect(hasCircularDependency(tasks)).toBe(false);
    });
  });
});

/**
 * GeminiHydra - Task Sorter Utility
 * Topological sort for task dependencies
 */

import { SwarmTask } from '../types/index.js';

/**
 * Topological sort for task execution order
 * Respects dependencies - tasks with dependencies run after their dependencies
 */
export function topologicalSort(tasks: SwarmTask[]): SwarmTask[] {
  const result: SwarmTask[] = [];
  const visited = new Set<number>();
  
  // Build task map for O(1) lookup
  const taskMap = new Map<number, SwarmTask>();
  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  const visit = (task: SwarmTask): void => {
    if (visited.has(task.id)) return;
    visited.add(task.id);

    // Visit dependencies first
    for (const depId of task.dependencies) {
      const dep = taskMap.get(depId);
      if (dep) {
        visit(dep);
      }
    }

    result.push(task);
  };

  for (const task of tasks) {
    visit(task);
  }

  return result;
}

/**
 * Validate task dependencies
 * Returns list of missing dependency IDs
 */
export function validateDependencies(tasks: SwarmTask[]): number[] {
  const taskIds = new Set(tasks.map(t => t.id));
  const missing: number[] = [];

  for (const task of tasks) {
    for (const depId of task.dependencies) {
      if (!taskIds.has(depId)) {
        missing.push(depId);
      }
    }
  }

  return missing;
}

/**
 * Check for circular dependencies
 */
export function hasCircularDependency(tasks: SwarmTask[]): boolean {
  const taskMap = new Map<number, SwarmTask>();
  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  const visited = new Set<number>();
  const recStack = new Set<number>();

  const hasCycle = (taskId: number): boolean => {
    if (recStack.has(taskId)) return true;
    if (visited.has(taskId)) return false;

    visited.add(taskId);
    recStack.add(taskId);

    const task = taskMap.get(taskId);
    if (task) {
      for (const depId of task.dependencies) {
        if (hasCycle(depId)) return true;
      }
    }

    recStack.delete(taskId);
    return false;
  };

  for (const task of tasks) {
    if (hasCycle(task.id)) return true;
  }

  return false;
}

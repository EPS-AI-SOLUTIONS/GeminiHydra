/**
 * ParallelExecution - Feature #13: Parallel Sub-Task Execution
 *
 * Enables parallel execution of independent sub-tasks within a mission.
 * Automatically detects which tasks can run concurrently based on
 * their dependencies, groups them for optimal execution, and manages
 * concurrency limits to prevent resource exhaustion.
 *
 * Part of GeminiHydra ExecutionEngine
 */

import chalk from 'chalk';
import pLimit from 'p-limit';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface SubTask {
  id: string;
  description: string;
  dependencies: string[];
  priority: number;
  estimatedDuration?: number;
}

export interface ParallelExecutionResult {
  subTaskId: string;
  success: boolean;
  output: string;
  duration: number;
}

// =============================================================================
// PARALLEL GROUP DETECTION
// =============================================================================

/**
 * Detect sub-tasks that can run in parallel
 * Groups tasks by their dependency levels - tasks in the same group
 * have all dependencies satisfied and can run concurrently
 */
export function detectParallelGroups(subTasks: SubTask[]): SubTask[][] {
  const groups: SubTask[][] = [];
  const completed = new Set<string>();
  const remaining = [...subTasks];

  while (remaining.length > 0) {
    // Find tasks whose dependencies are all completed
    const executable = remaining.filter((task) =>
      task.dependencies.every((dep) => completed.has(dep)),
    );

    if (executable.length === 0 && remaining.length > 0) {
      // Deadlock - force first remaining task
      executable.push(remaining[0]);
    }

    // Sort by priority (higher first)
    executable.sort((a, b) => b.priority - a.priority);

    groups.push(executable);

    // Mark as completed and remove from remaining
    for (const task of executable) {
      completed.add(task.id);
      const idx = remaining.findIndex((t) => t.id === task.id);
      if (idx >= 0) remaining.splice(idx, 1);
    }
  }

  return groups;
}

// =============================================================================
// PARALLEL GROUP EXECUTION
// =============================================================================

/**
 * Execute sub-tasks in parallel groups
 * Respects dependency order by executing groups sequentially,
 * while running tasks within each group in parallel
 */
export async function executeParallelGroups(
  groups: SubTask[][],
  executor: (subTask: SubTask) => Promise<string>,
  options: {
    maxConcurrency?: number;
    onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<Map<string, ParallelExecutionResult>> {
  const results = new Map<string, ParallelExecutionResult>();
  const totalTasks = groups.reduce((sum, g) => sum + g.length, 0);
  let completedCount = 0;

  const concurrency = options.maxConcurrency || 6;

  console.log(
    chalk.cyan(`[Parallel] Executing ${totalTasks} sub-tasks in ${groups.length} groups`),
  );

  // Create p-limit instance for concurrency control (replaces busy-wait)
  const limit = pLimit(concurrency);

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    console.log(chalk.gray(`[Parallel] Group ${i + 1}/${groups.length}: ${group.length} tasks`));

    // Execute group in parallel using p-limit for proper concurrency control
    const groupPromises = group.map((task) =>
      limit(async () => {
        const startTime = Date.now();
        try {
          const output = await executor(task);
          results.set(task.id, {
            subTaskId: task.id,
            success: true,
            output,
            duration: Date.now() - startTime,
          });
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          results.set(task.id, {
            subTaskId: task.id,
            success: false,
            output: msg,
            duration: Date.now() - startTime,
          });
        } finally {
          completedCount++;
          if (options.onProgress) {
            options.onProgress(completedCount, totalTasks);
          }
        }
      }),
    );

    // Wait for group to complete
    await Promise.all(groupPromises);
  }

  console.log(chalk.green(`[Parallel] All ${totalTasks} sub-tasks completed`));
  return results;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate estimated total duration for parallel execution
 */
export function estimateParallelDuration(groups: SubTask[][]): number {
  let totalDuration = 0;

  for (const group of groups) {
    // Group duration is the max of all task durations in the group
    const maxDuration = Math.max(...group.map((t) => t.estimatedDuration || 1000));
    totalDuration += maxDuration;
  }

  return totalDuration;
}

/**
 * Get parallelization efficiency
 * Returns a ratio of parallel vs sequential execution time
 */
export function getParallelizationEfficiency(groups: SubTask[][]): number {
  const sequentialTime = groups.flat().reduce((sum, t) => sum + (t.estimatedDuration || 1000), 0);
  const parallelTime = estimateParallelDuration(groups);

  return sequentialTime / parallelTime;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  detectParallelGroups,
  executeParallelGroups,
  estimateParallelDuration,
  getParallelizationEfficiency,
};

/**
 * TaskPrioritization - Feature #16 from ExecutionEngine
 *
 * Handles task priority detection, scoring, and sorting.
 */

import { SwarmTask } from '../../types/index.js';
import type { TaskPriority } from '../../types/task.js';

export type { TaskPriority };

export interface PrioritizedTask extends SwarmTask {
  priority: TaskPriority;
  priorityScore: number;
  deadline?: Date;
  estimatedDuration?: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 100,
  high: 75,
  medium: 50,
  low: 25,
  background: 10
};

/**
 * Keywords for priority detection
 */
export const PRIORITY_KEYWORDS: Record<TaskPriority, string[]> = {
  critical: ['urgent', 'critical', 'emergency', 'pilne', 'krytyczne', 'natychmiast', 'asap', 'blocker'],
  high: ['important', 'high', 'soon', 'ważne', 'priorytet', 'szybko', 'priority'],
  medium: ['normal', 'standard', 'regular', 'normalne', 'standardowe', 'medium'],
  low: ['low', 'minor', 'later', 'niskie', 'później', 'when possible'],
  background: ['background', 'whenever', 'optional', 'w tle', 'opcjonalne', 'nice to have']
};

// =============================================================================
// FUNCTIONS
// =============================================================================

/**
 * Auto-detect task priority from description
 */
export function detectTaskPriority(taskDescription: string): TaskPriority {
  const lower = taskDescription.toLowerCase();

  for (const [priority, keywords] of Object.entries(PRIORITY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) {
      return priority as TaskPriority;
    }
  }

  // Default heuristics
  if (lower.includes('security') || lower.includes('bezpieczeństwo')) return 'critical';
  if (lower.includes('bug') || lower.includes('error') || lower.includes('błąd')) return 'high';
  if (lower.includes('refactor') || lower.includes('cleanup')) return 'low';
  if (lower.includes('documentation') || lower.includes('dokumentacja')) return 'background';

  return 'medium';
}

/**
 * Calculate priority score with deadline consideration
 */
export function calculatePriorityScore(task: PrioritizedTask): number {
  let score = PRIORITY_WEIGHTS[task.priority];

  // Boost for approaching deadlines
  if (task.deadline) {
    const hoursUntilDeadline = (task.deadline.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilDeadline < 1) score += 50;
    else if (hoursUntilDeadline < 4) score += 30;
    else if (hoursUntilDeadline < 24) score += 15;
  }

  // Boost for short tasks (quick wins)
  if (task.estimatedDuration && task.estimatedDuration < 60000) {
    score += 10;
  }

  // Boost for tasks with no dependencies
  if (task.dependencies.length === 0) {
    score += 5;
  }

  return score;
}

/**
 * Sort tasks by priority
 */
export function sortByPriority(tasks: PrioritizedTask[]): PrioritizedTask[] {
  return [...tasks].sort((a, b) => {
    const scoreA = calculatePriorityScore(a);
    const scoreB = calculatePriorityScore(b);
    return scoreB - scoreA;
  });
}

/**
 * Create a prioritized task from a regular task
 */
export function createPrioritizedTask(
  task: SwarmTask,
  options: {
    priority?: TaskPriority;
    deadline?: Date;
    estimatedDuration?: number;
  } = {}
): PrioritizedTask {
  const priority = options.priority ?? detectTaskPriority(task.task);

  const prioritizedTask: PrioritizedTask = {
    ...task,
    priority,
    priorityScore: PRIORITY_WEIGHTS[priority],
    deadline: options.deadline,
    estimatedDuration: options.estimatedDuration
  };

  prioritizedTask.priorityScore = calculatePriorityScore(prioritizedTask);

  return prioritizedTask;
}

/**
 * Get priority label with color hint
 */
export function getPriorityLabel(priority: TaskPriority): { label: string; color: string } {
  const labels: Record<TaskPriority, { label: string; color: string }> = {
    critical: { label: 'CRITICAL', color: 'red' },
    high: { label: 'HIGH', color: 'yellow' },
    medium: { label: 'MEDIUM', color: 'blue' },
    low: { label: 'LOW', color: 'gray' },
    background: { label: 'BACKGROUND', color: 'dim' }
  };

  return labels[priority];
}

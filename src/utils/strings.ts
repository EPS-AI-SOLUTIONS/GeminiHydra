/**
 * GeminiHydra - String Utilities
 * Common string manipulation functions
 */

import { 
  OBJECTIVE_TRUNCATION, 
  TASK_TRUNCATION,
  TASK_DISPLAY_TRUNCATION,
  CONTEXT_TRUNCATION 
} from '../config/constants.js';

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

/**
 * Truncate objective for display
 */
export function truncateObjective(objective: string): string {
  return truncate(objective, OBJECTIVE_TRUNCATION);
}

/**
 * Truncate task for plan display
 */
export function truncateTask(task: string): string {
  return truncate(task, TASK_TRUNCATION);
}

/**
 * Truncate task for execution display
 */
export function truncateTaskDisplay(task: string): string {
  return truncate(task, TASK_DISPLAY_TRUNCATION);
}

/**
 * Truncate context content
 */
export function truncateContext(content: string): string {
  return truncate(content, CONTEXT_TRUNCATION);
}

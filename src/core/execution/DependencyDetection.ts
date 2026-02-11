/**
 * DependencyDetection - Feature #14: Dependency Auto-Detection
 *
 * Automatically detects dependencies between tasks based on content analysis.
 * Analyzes task descriptions to identify output/input relationships,
 * file operations, and entity references to build a dependency graph
 * without requiring explicit dependency specifications.
 *
 * Part of GeminiHydra ExecutionEngine
 */

import chalk from 'chalk';

// =============================================================================
// KEYWORD DEFINITIONS
// =============================================================================

// Keywords that suggest output/input relationships
const OUTPUT_KEYWORDS = ['wygeneruj', 'stworz', 'napisz', 'create', 'generate', 'build', 'produce'];
const INPUT_KEYWORDS = ['uzyj', 'wykorzystaj', 'na podstawie', 'based on', 'using', 'with'];

// File operation keywords
const FILE_WRITE_KEYWORDS = ['zapisz', 'write', 'save', 'create file'];
const FILE_READ_KEYWORDS = ['przeczytaj', 'read', 'load', 'pobierz'];

// Entity extraction pattern
const ENTITY_PATTERN =
  /(?:plik(?:i|u|ow)?|file(?:s)?|funkcj[aei]|function|klas[aey]|class|modul|module|komponent|component)\s+["`']?(\w+)["`']?/gi;

// =============================================================================
// DEPENDENCY DETECTION
// =============================================================================

/**
 * Auto-detect dependencies between tasks based on content analysis
 *
 * @param tasks - Array of tasks with id and task description
 * @returns Map of task IDs to their dependency IDs
 */
export async function autoDetectDependencies(
  tasks: Array<{ id: number; task: string }>,
): Promise<Map<number, number[]>> {
  console.log(chalk.magenta('[AutoDep] Analyzing task dependencies...'));

  const dependencies = new Map<number, number[]>();

  // Initialize all tasks with empty dependencies
  for (const task of tasks) {
    dependencies.set(task.id, []);
  }

  // Extract entities from each task
  const taskEntities: Map<number, Set<string>> = new Map();

  for (const task of tasks) {
    const entities = new Set<string>();
    // Reset regex lastIndex for each task
    const pattern = new RegExp(ENTITY_PATTERN.source, 'gi');
    for (let match = pattern.exec(task.task); match !== null; match = pattern.exec(task.task)) {
      entities.add(match[1].toLowerCase());
    }
    taskEntities.set(task.id, entities);
  }

  // Detect dependencies based on entity overlap and keyword analysis
  for (let i = 0; i < tasks.length; i++) {
    const currentTask = tasks[i];
    const currentEntities = taskEntities.get(currentTask.id) ?? new Set<string>();
    const currentLower = currentTask.task.toLowerCase();

    // Check if this task references outputs from previous tasks
    for (let j = 0; j < i; j++) {
      const previousTask = tasks[j];
      const previousEntities = taskEntities.get(previousTask.id) ?? new Set<string>();
      const previousLower = previousTask.task.toLowerCase();

      // Check entity overlap
      const overlap = [...currentEntities].filter((e) => previousEntities.has(e));

      // Check if previous task produces something current task needs
      const previousProduces = OUTPUT_KEYWORDS.some((k) => previousLower.includes(k));
      const currentConsumes = INPUT_KEYWORDS.some((k) => currentLower.includes(k));

      // Check file write -> read relationship
      const previousWrites = FILE_WRITE_KEYWORDS.some((k) => previousLower.includes(k));
      const currentReads = FILE_READ_KEYWORDS.some((k) => currentLower.includes(k));

      // Add dependency if relationship detected
      if (
        (overlap.length > 0 && previousProduces && currentConsumes) ||
        (previousWrites && currentReads && overlap.length > 0)
      ) {
        const deps = dependencies.get(currentTask.id) ?? [];
        if (!deps.includes(previousTask.id)) {
          deps.push(previousTask.id);
          console.log(
            chalk.gray(`[AutoDep] Task #${currentTask.id} depends on #${previousTask.id}`),
          );
        }
      }
    }
  }

  return dependencies;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Extract entities from a task description
 */
export function extractEntities(taskDescription: string): Set<string> {
  const entities = new Set<string>();
  const pattern = new RegExp(ENTITY_PATTERN.source, 'gi');
  for (
    let match = pattern.exec(taskDescription);
    match !== null;
    match = pattern.exec(taskDescription)
  ) {
    entities.add(match[1].toLowerCase());
  }
  return entities;
}

/**
 * Check if task produces output
 */
export function taskProducesOutput(taskDescription: string): boolean {
  const lower = taskDescription.toLowerCase();
  return (
    OUTPUT_KEYWORDS.some((k) => lower.includes(k)) ||
    FILE_WRITE_KEYWORDS.some((k) => lower.includes(k))
  );
}

/**
 * Check if task consumes input
 */
export function taskConsumesInput(taskDescription: string): boolean {
  const lower = taskDescription.toLowerCase();
  return (
    INPUT_KEYWORDS.some((k) => lower.includes(k)) ||
    FILE_READ_KEYWORDS.some((k) => lower.includes(k))
  );
}

/**
 * Build dependency graph visualization
 */
export function visualizeDependencies(dependencies: Map<number, number[]>): string {
  const lines: string[] = ['Dependency Graph:', ''];

  for (const [taskId, deps] of dependencies) {
    if (deps.length === 0) {
      lines.push(`  Task #${taskId} (independent)`);
    } else {
      lines.push(`  Task #${taskId} <- [${deps.join(', ')}]`);
    }
  }

  return lines.join('\n');
}

/**
 * Get tasks in topological order
 */
export function getTopologicalOrder(dependencies: Map<number, number[]>): number[] {
  const result: number[] = [];
  const visited = new Set<number>();
  const visiting = new Set<number>();

  function visit(taskId: number): void {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) {
      throw new Error(`Circular dependency detected at task #${taskId}`);
    }

    visiting.add(taskId);

    const deps = dependencies.get(taskId) || [];
    for (const dep of deps) {
      visit(dep);
    }

    visiting.delete(taskId);
    visited.add(taskId);
    result.push(taskId);
  }

  for (const taskId of dependencies.keys()) {
    visit(taskId);
  }

  return result;
}

// =============================================================================
// EXPORTS
// =============================================================================

export { OUTPUT_KEYWORDS, INPUT_KEYWORDS, FILE_WRITE_KEYWORDS, FILE_READ_KEYWORDS, ENTITY_PATTERN };

export default {
  autoDetectDependencies,
  extractEntities,
  taskProducesOutput,
  taskConsumesInput,
  visualizeDependencies,
  getTopologicalOrder,
};

/**
 * TaskDecompositionValidator - Solution #40
 *
 * Validates that task decomposition (Dijkstra's plan) is reasonable.
 * Performs comprehensive checks on:
 * - Coverage: Do subtasks cover the original task scope?
 * - Redundancy: Are there duplicate/overlapping tasks?
 * - Dependencies: Are dependency chains logical?
 * - Agent matching: Is each agent appropriate for its task?
 * - Scope creep: Are subtasks adding work not in original task?
 *
 * Part of GeminiHydra Phase A Validation
 */

import chalk from 'chalk';
import {
  AGENT_DESCRIPTIONS,
  type AgentRole,
  TASK_ROUTING,
  type TaskCategory,
} from '../config/agents.config.js';
import { resolveAgentRoleSafe } from '../types/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * SubTask interface for decomposition validation
 */
export interface SubTask {
  id: number;
  task: string;
  agent: string;
  dependencies: number[];
}

/**
 * Validation issue types
 */
export type ValidationIssueType =
  | 'coverage_gap'
  | 'redundancy'
  | 'circular_dependency'
  | 'missing_dependency'
  | 'invalid_dependency'
  | 'agent_mismatch'
  | 'scope_creep'
  | 'empty_task'
  | 'orphan_task'
  | 'task_too_large'
  | 'task_too_vague';

/**
 * Severity levels for validation issues
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Single validation issue
 */
export interface ValidationIssue {
  type: ValidationIssueType;
  severity: ValidationSeverity;
  taskId?: number;
  message: string;
  suggestion?: string;
}

/**
 * Complete decomposition validation result
 */
export interface DecompositionValidation {
  valid: boolean;
  issues: ValidationIssue[];
  coverage: number; // 0-1, how much of original task is covered
  redundancy: number; // 0-1, how much overlap between tasks
  suggestions: string[];
  metrics: {
    totalSubtasks: number;
    avgTaskComplexity: number;
    maxDependencyDepth: number;
    parallelizationPotential: number;
    agentDistribution: Record<string, number>;
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Keywords for task category detection
 */
const CATEGORY_KEYWORDS: Record<TaskCategory, string[]> = {
  coding: [
    'implement',
    'code',
    'write',
    'create',
    'function',
    'class',
    'module',
    'napisz',
    'zaimplementuj',
    'fix',
    'bug',
    'debug',
  ],
  architecture: [
    'design',
    'architect',
    'structure',
    'pattern',
    'diagram',
    'projektuj',
    'architektura',
    'system',
  ],
  data: ['data', 'database', 'query', 'transform', 'etl', 'dane', 'baza', 'sql', 'json', 'csv'],
  testing: ['test', 'spec', 'coverage', 'unit', 'integration', 'e2e', 'testuj', 'testy', 'qa'],
  security: [
    'security',
    'auth',
    'encrypt',
    'permission',
    'vulnerability',
    'bezpieczenstwo',
    'szyfruj',
  ],
  docs: ['document', 'readme', 'comment', 'jsdoc', 'dokumentacja', 'opisz', 'explain'],
  devops: ['deploy', 'ci', 'cd', 'docker', 'kubernetes', 'pipeline', 'infrastructure', 'wdrozenie'],
  research: ['research', 'analyze', 'investigate', 'explore', 'zbadaj', 'analiza', 'przeanalizuj'],
  planning: ['plan', 'roadmap', 'strategy', 'prioritize', 'planuj', 'strategia', 'priorytet'],
  review: ['review', 'check', 'verify', 'audit', 'przegladnij', 'sprawdz', 'zweryfikuj'],
  fast: ['quick', 'simple', 'straightforward', 'szybko', 'proste', 'latwe'],
  verification: [
    'verify',
    'validate',
    'check',
    'gate',
    'audit',
    'weryfikuj',
    'zwaliduj',
    'sprawdz',
  ],
  general: ['general', 'misc', 'other', 'ogolne', 'inne'],
};

/**
 * Keywords indicating scope creep
 */
const SCOPE_CREEP_INDICATORS = [
  'also',
  'additionally',
  'extra',
  'bonus',
  'nice to have',
  'takze',
  'dodatkowo',
  'ekstra',
  'bonusowo',
  "while we're at it",
  'might as well',
  'przy okazji',
];

/**
 * Keywords indicating task is too vague
 */
const VAGUE_KEYWORDS = [
  'something',
  'stuff',
  'things',
  'etc',
  'whatever',
  'somehow',
  'cos',
  'rzeczy',
  'jakos',
  'itd',
  'cokolwiek',
];

/**
 * Maximum recommended subtask complexity score
 */
const MAX_TASK_COMPLEXITY = 50;

/**
 * Minimum task description length
 */
const MIN_TASK_LENGTH = 10;

// =============================================================================
// TASK DECOMPOSITION VALIDATOR CLASS
// =============================================================================

/**
 * Validates task decomposition plans
 */
export class TaskDecompositionValidator {
  private verbose: boolean;

  constructor(options: { verbose?: boolean } = {}) {
    this.verbose = options.verbose ?? false;
  }

  /**
   * Main validation method - validates entire decomposition
   */
  validateDecomposition(originalTask: string, subtasks: SubTask[]): DecompositionValidation {
    if (this.verbose) {
      console.log(chalk.cyan('[Validator] Starting decomposition validation...'));
    }

    const issues: ValidationIssue[] = [];
    const suggestions: string[] = [];

    // Run all validation checks
    this.checkEmptyTasks(subtasks, issues);
    this.checkDuplicateTasks(subtasks, issues);
    this.checkDependencyValidity(subtasks, issues);
    this.checkCircularDependencies(subtasks, issues);
    this.checkOrphanTasks(subtasks, issues);
    this.checkAgentMatching(subtasks, issues, suggestions);
    this.checkTaskComplexity(subtasks, issues, suggestions);
    this.checkVagueTasks(subtasks, issues, suggestions);
    this.checkScopeCreep(originalTask, subtasks, issues, suggestions);

    // Calculate metrics
    const coverage = this.calculateCoverage(originalTask, subtasks);
    const redundancy = this.calculateRedundancy(subtasks);
    const metrics = this.calculateMetrics(subtasks);

    // Coverage check
    if (coverage < 0.7) {
      issues.push({
        type: 'coverage_gap',
        severity: 'warning',
        message: `Task coverage is only ${(coverage * 100).toFixed(0)}%. Some aspects of the original task may not be addressed.`,
        suggestion: 'Consider adding subtasks for uncovered aspects of the original task.',
      });
      suggestions.push('Review original task requirements and ensure all aspects are covered.');
    }

    // Redundancy check
    if (redundancy > 0.3) {
      issues.push({
        type: 'redundancy',
        severity: 'warning',
        message: `High redundancy detected: ${(redundancy * 100).toFixed(0)}%. Some tasks may overlap.`,
        suggestion: 'Consider merging similar tasks or clarifying task boundaries.',
      });
      suggestions.push('Merge overlapping tasks to improve efficiency.');
    }

    // Generate final suggestions
    if (metrics.maxDependencyDepth > 5) {
      suggestions.push(
        `Consider flattening dependency chain - current depth is ${metrics.maxDependencyDepth}`,
      );
    }

    if (metrics.parallelizationPotential < 0.3) {
      suggestions.push(
        'Low parallelization potential - consider restructuring dependencies to allow more parallel execution.',
      );
    }

    const valid = !issues.some((i) => i.severity === 'error');

    if (this.verbose) {
      this.printValidationReport({ valid, issues, coverage, redundancy, suggestions, metrics });
    }

    return {
      valid,
      issues,
      coverage,
      redundancy,
      suggestions,
      metrics,
    };
  }

  // ===========================================================================
  // VALIDATION CHECKS
  // ===========================================================================

  /**
   * Check for empty or too-short task descriptions
   */
  private checkEmptyTasks(subtasks: SubTask[], issues: ValidationIssue[]): void {
    for (const task of subtasks) {
      if (!task.task || task.task.trim().length === 0) {
        issues.push({
          type: 'empty_task',
          severity: 'error',
          taskId: task.id,
          message: `Task #${task.id} has empty description.`,
          suggestion: 'Provide a clear description of what this task should accomplish.',
        });
      } else if (task.task.trim().length < MIN_TASK_LENGTH) {
        issues.push({
          type: 'empty_task',
          severity: 'warning',
          taskId: task.id,
          message: `Task #${task.id} has very short description (${task.task.length} chars).`,
          suggestion: 'Expand the task description to be more specific.',
        });
      }
    }
  }

  /**
   * Check for duplicate/redundant tasks
   */
  private checkDuplicateTasks(subtasks: SubTask[], issues: ValidationIssue[]): void {
    const seenTasks = new Map<string, number>();

    for (const task of subtasks) {
      const normalized = this.normalizeTaskText(task.task);

      if (seenTasks.has(normalized)) {
        issues.push({
          type: 'redundancy',
          severity: 'warning',
          taskId: task.id,
          message: `Task #${task.id} appears to be duplicate of Task #${seenTasks.get(normalized)}.`,
          suggestion: 'Consider removing duplicate task or differentiating their scope.',
        });
      } else {
        seenTasks.set(normalized, task.id);
      }
    }
  }

  /**
   * Check that all dependency references are valid
   */
  private checkDependencyValidity(subtasks: SubTask[], issues: ValidationIssue[]): void {
    const taskIds = new Set(subtasks.map((t) => t.id));

    for (const task of subtasks) {
      for (const depId of task.dependencies) {
        if (!taskIds.has(depId)) {
          issues.push({
            type: 'invalid_dependency',
            severity: 'error',
            taskId: task.id,
            message: `Task #${task.id} depends on non-existent Task #${depId}.`,
            suggestion: 'Remove invalid dependency or create the missing task.',
          });
        }

        if (depId === task.id) {
          issues.push({
            type: 'invalid_dependency',
            severity: 'error',
            taskId: task.id,
            message: `Task #${task.id} depends on itself.`,
            suggestion: 'Remove self-dependency.',
          });
        }
      }
    }
  }

  /**
   * Check for circular dependencies using DFS
   */
  private checkCircularDependencies(subtasks: SubTask[], issues: ValidationIssue[]): void {
    const taskMap = new Map(subtasks.map((t) => [t.id, t]));
    const visited = new Set<number>();
    const inStack = new Set<number>();

    const detectCycle = (taskId: number, path: number[]): number[] | null => {
      if (inStack.has(taskId)) {
        return [...path, taskId];
      }
      if (visited.has(taskId)) {
        return null;
      }

      visited.add(taskId);
      inStack.add(taskId);

      const task = taskMap.get(taskId);
      if (task) {
        for (const depId of task.dependencies) {
          const cycle = detectCycle(depId, [...path, taskId]);
          if (cycle) {
            return cycle;
          }
        }
      }

      inStack.delete(taskId);
      return null;
    };

    for (const task of subtasks) {
      if (!visited.has(task.id)) {
        const cycle = detectCycle(task.id, []);
        if (cycle) {
          const cycleStart = cycle.indexOf(cycle[cycle.length - 1]);
          const cycleLoop = cycle.slice(cycleStart);

          issues.push({
            type: 'circular_dependency',
            severity: 'error',
            taskId: task.id,
            message: `Circular dependency detected: ${cycleLoop.join(' -> ')}.`,
            suggestion: 'Break the cycle by removing one of the dependencies.',
          });
          break; // Only report first cycle
        }
      }
    }
  }

  /**
   * Check for orphan tasks (no dependencies and nothing depends on them)
   */
  private checkOrphanTasks(subtasks: SubTask[], issues: ValidationIssue[]): void {
    if (subtasks.length <= 1) return;

    const dependedOn = new Set<number>();
    for (const task of subtasks) {
      for (const depId of task.dependencies) {
        dependedOn.add(depId);
      }
    }

    for (const task of subtasks) {
      const hasDependencies = task.dependencies.length > 0;
      const isDependedOn = dependedOn.has(task.id);

      if (!hasDependencies && !isDependedOn && subtasks.length > 2) {
        issues.push({
          type: 'orphan_task',
          severity: 'info',
          taskId: task.id,
          message: `Task #${task.id} is isolated (no dependencies and nothing depends on it).`,
          suggestion: 'Verify this task is truly independent or add appropriate dependencies.',
        });
      }
    }
  }

  /**
   * Check if agents are appropriate for their assigned tasks
   */
  private checkAgentMatching(
    subtasks: SubTask[],
    issues: ValidationIssue[],
    _suggestions: string[],
  ): void {
    for (const task of subtasks) {
      const detectedCategory = this.detectTaskCategory(task.task);
      const recommendedAgent = TASK_ROUTING[detectedCategory];
      const assignedAgent = resolveAgentRoleSafe(task.agent);

      if (recommendedAgent && assignedAgent !== recommendedAgent) {
        // Check if assigned agent is in fallback chain
        const isReasonableChoice = this.isReasonableAgentChoice(assignedAgent, detectedCategory);

        if (!isReasonableChoice) {
          const agentDesc = AGENT_DESCRIPTIONS[recommendedAgent];
          issues.push({
            type: 'agent_mismatch',
            severity: 'warning',
            taskId: task.id,
            message: `Task #${task.id} assigned to '${task.agent}' but appears to be a ${detectedCategory} task.`,
            suggestion: `Consider assigning to '${recommendedAgent}' (${agentDesc?.title || 'specialist'}).`,
          });
        }
      }
    }
  }

  /**
   * Check task complexity
   */
  private checkTaskComplexity(
    subtasks: SubTask[],
    issues: ValidationIssue[],
    _suggestions: string[],
  ): void {
    for (const task of subtasks) {
      const complexity = this.estimateTaskComplexity(task.task);

      if (complexity > MAX_TASK_COMPLEXITY) {
        issues.push({
          type: 'task_too_large',
          severity: 'warning',
          taskId: task.id,
          message: `Task #${task.id} appears too complex (score: ${complexity}). Consider breaking it down.`,
          suggestion: 'Split this task into smaller, more focused subtasks.',
        });
      }
    }
  }

  /**
   * Check for vague task descriptions
   */
  private checkVagueTasks(
    subtasks: SubTask[],
    issues: ValidationIssue[],
    _suggestions: string[],
  ): void {
    for (const task of subtasks) {
      const lower = task.task.toLowerCase();
      const vagueMatches = VAGUE_KEYWORDS.filter((k) => lower.includes(k));

      if (vagueMatches.length > 0) {
        issues.push({
          type: 'task_too_vague',
          severity: 'warning',
          taskId: task.id,
          message: `Task #${task.id} contains vague language: "${vagueMatches.join('", "')}".`,
          suggestion: 'Be more specific about what needs to be done.',
        });
      }
    }
  }

  /**
   * Check for scope creep (tasks adding work not in original)
   */
  private checkScopeCreep(
    originalTask: string,
    subtasks: SubTask[],
    issues: ValidationIssue[],
    _suggestions: string[],
  ): void {
    const originalKeywords = this.extractKeywords(originalTask);

    for (const task of subtasks) {
      const lower = task.task.toLowerCase();

      // Check for scope creep indicators
      const creepIndicators = SCOPE_CREEP_INDICATORS.filter((k) => lower.includes(k));
      if (creepIndicators.length > 0) {
        issues.push({
          type: 'scope_creep',
          severity: 'info',
          taskId: task.id,
          message: `Task #${task.id} may include scope creep: "${creepIndicators.join('", "')}".`,
          suggestion: 'Verify this additional work is necessary for the original task.',
        });
      }

      // Check if task keywords relate to original
      const taskKeywords = this.extractKeywords(task.task);
      const overlap = [...taskKeywords].filter((k) => originalKeywords.has(k)).length;
      const overlapRatio = taskKeywords.size > 0 ? overlap / taskKeywords.size : 0;

      if (overlapRatio < 0.1 && taskKeywords.size > 3) {
        issues.push({
          type: 'scope_creep',
          severity: 'warning',
          taskId: task.id,
          message: `Task #${task.id} has low relevance to original task (${(overlapRatio * 100).toFixed(0)}% keyword overlap).`,
          suggestion: 'Verify this task is necessary for completing the original objective.',
        });
      }
    }
  }

  // ===========================================================================
  // METRIC CALCULATIONS
  // ===========================================================================

  /**
   * Calculate how much of the original task is covered by subtasks
   */
  private calculateCoverage(originalTask: string, subtasks: SubTask[]): number {
    const originalKeywords = this.extractKeywords(originalTask);
    if (originalKeywords.size === 0) return 1;

    const coveredKeywords = new Set<string>();
    for (const task of subtasks) {
      const keywords = this.extractKeywords(task.task);
      for (const k of keywords) {
        if (originalKeywords.has(k)) {
          coveredKeywords.add(k);
        }
      }
    }

    return coveredKeywords.size / originalKeywords.size;
  }

  /**
   * Calculate redundancy between subtasks
   */
  private calculateRedundancy(subtasks: SubTask[]): number {
    if (subtasks.length <= 1) return 0;

    let totalOverlap = 0;
    let comparisons = 0;

    for (let i = 0; i < subtasks.length; i++) {
      const keywords1 = this.extractKeywords(subtasks[i].task);

      for (let j = i + 1; j < subtasks.length; j++) {
        const keywords2 = this.extractKeywords(subtasks[j].task);
        const overlap = this.calculateKeywordOverlap(keywords1, keywords2);
        totalOverlap += overlap;
        comparisons++;
      }
    }

    return comparisons > 0 ? totalOverlap / comparisons : 0;
  }

  /**
   * Calculate decomposition metrics
   */
  private calculateMetrics(subtasks: SubTask[]): DecompositionValidation['metrics'] {
    // Agent distribution
    const agentDistribution: Record<string, number> = {};
    for (const task of subtasks) {
      const agent = task.agent.toLowerCase();
      agentDistribution[agent] = (agentDistribution[agent] || 0) + 1;
    }

    // Average complexity
    const complexities = subtasks.map((t) => this.estimateTaskComplexity(t.task));
    const avgTaskComplexity =
      complexities.length > 0 ? complexities.reduce((a, b) => a + b, 0) / complexities.length : 0;

    // Dependency depth
    const maxDependencyDepth = this.calculateMaxDependencyDepth(subtasks);

    // Parallelization potential (tasks that can run in parallel / total tasks)
    const parallelizationPotential = this.calculateParallelizationPotential(subtasks);

    return {
      totalSubtasks: subtasks.length,
      avgTaskComplexity,
      maxDependencyDepth,
      parallelizationPotential,
      agentDistribution,
    };
  }

  /**
   * Calculate maximum dependency depth
   */
  private calculateMaxDependencyDepth(subtasks: SubTask[]): number {
    const taskMap = new Map(subtasks.map((t) => [t.id, t]));
    const depthCache = new Map<number, number>();

    const getDepth = (taskId: number): number => {
      if (depthCache.has(taskId)) {
        return depthCache.get(taskId) ?? 0;
      }

      const task = taskMap.get(taskId);
      if (!task || task.dependencies.length === 0) {
        depthCache.set(taskId, 0);
        return 0;
      }

      const maxChildDepth = Math.max(...task.dependencies.map((d) => getDepth(d)));
      const depth = maxChildDepth + 1;
      depthCache.set(taskId, depth);
      return depth;
    };

    let maxDepth = 0;
    for (const task of subtasks) {
      maxDepth = Math.max(maxDepth, getDepth(task.id));
    }

    return maxDepth;
  }

  /**
   * Calculate parallelization potential
   */
  private calculateParallelizationPotential(subtasks: SubTask[]): number {
    if (subtasks.length <= 1) return 1;

    // Count tasks that can potentially run in parallel at each level
    const taskMap = new Map(subtasks.map((t) => [t.id, t]));
    const levels: number[][] = [];

    // Topological sort with levels
    const _visited = new Set<number>();
    const taskLevels = new Map<number, number>();

    const getLevel = (taskId: number): number => {
      if (taskLevels.has(taskId)) {
        return taskLevels.get(taskId) ?? 0;
      }

      const task = taskMap.get(taskId);
      if (!task || task.dependencies.length === 0) {
        taskLevels.set(taskId, 0);
        return 0;
      }

      const maxDepLevel = Math.max(...task.dependencies.map((d) => getLevel(d)));
      const level = maxDepLevel + 1;
      taskLevels.set(taskId, level);
      return level;
    };

    for (const task of subtasks) {
      const level = getLevel(task.id);
      if (!levels[level]) {
        levels[level] = [];
      }
      levels[level].push(task.id);
    }

    // Calculate average tasks per level (higher = better parallelization)
    const totalParallel = levels.reduce((sum, level) => sum + level.length, 0);
    return (totalParallel / (levels.length * subtasks.length)) * levels.length;
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Extract significant keywords from text
   */
  private extractKeywords(text: string): Set<string> {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'as',
      'is',
      'was',
      'are',
      'were',
      'been',
      'be',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'this',
      'that',
      'these',
      'those',
      'it',
      'its',
      'i',
      'we',
      'you',
      'they',
      'he',
      'she',
      // Polish stop words
      'i',
      'w',
      'na',
      'z',
      'do',
      'od',
      'dla',
      'po',
      'przy',
      'przez',
      'przed',
      'za',
      'o',
      'u',
      'ze',
      'nad',
      'pod',
      'bez',
      'jest',
      'sa',
      'byl',
      'byla',
      'bedzie',
      'to',
      'ten',
      'ta',
      'te',
      'ci',
      'ja',
      'my',
      'wy',
      'oni',
      'one',
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\u0080-\uFFFF\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    return new Set(words);
  }

  /**
   * Normalize task text for comparison
   */
  private normalizeTaskText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\u0080-\uFFFF]/g, '')
      .substring(0, 50);
  }

  /**
   * Calculate keyword overlap between two sets
   */
  private calculateKeywordOverlap(set1: Set<string>, set2: Set<string>): number {
    if (set1.size === 0 || set2.size === 0) return 0;

    const intersection = [...set1].filter((k) => set2.has(k)).length;
    const union = new Set([...set1, ...set2]).size;

    return intersection / union; // Jaccard similarity
  }

  /**
   * Detect task category from description
   */
  private detectTaskCategory(taskDescription: string): TaskCategory {
    const lower = taskDescription.toLowerCase();
    let bestMatch: TaskCategory = 'general';
    let bestScore = 0;

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const score = keywords.filter((k) => lower.includes(k)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = category as TaskCategory;
      }
    }

    return bestMatch;
  }

  /**
   * Check if agent choice is reasonable for task category
   */
  private isReasonableAgentChoice(agent: AgentRole, category: TaskCategory): boolean {
    // Direct match
    if (TASK_ROUTING[category] === agent) return true;

    // Related categories
    const relatedCategories: Partial<Record<TaskCategory, TaskCategory[]>> = {
      coding: ['testing', 'review', 'fast'],
      architecture: ['planning', 'coding'],
      testing: ['coding', 'security'],
      security: ['testing', 'review'],
      docs: ['research', 'fast'],
      devops: ['security', 'coding'],
      research: ['data', 'planning'],
      planning: ['architecture', 'research'],
      review: ['coding', 'testing'],
    };

    const related = relatedCategories[category] || [];
    return related.some((c) => TASK_ROUTING[c] === agent);
  }

  /**
   * Estimate task complexity (higher = more complex)
   */
  private estimateTaskComplexity(taskDescription: string): number {
    let score = 0;

    // Length factor
    score += Math.min(taskDescription.length / 50, 10);

    // Number of action words
    const actionWords = [
      'implement',
      'create',
      'write',
      'build',
      'design',
      'analyze',
      'test',
      'deploy',
      'configure',
      'integrate',
      'refactor',
      'optimize',
      'zaimplementuj',
      'stworz',
      'napisz',
      'zbuduj',
      'zaprojektuj',
      'przeanalizuj',
    ];
    const actions = actionWords.filter((w) => taskDescription.toLowerCase().includes(w));
    score += actions.length * 5;

    // Multiple entities mentioned
    const entityPattern = /\b(file|class|function|module|component|service|api|database)\b/gi;
    const entities = taskDescription.match(entityPattern) || [];
    score += entities.length * 3;

    // Conditional language
    const conditionals = ['if', 'when', 'unless', 'either', 'or', 'both', 'jezeli', 'gdy', 'lub'];
    const condCount = conditionals.filter((c) => taskDescription.toLowerCase().includes(c)).length;
    score += condCount * 4;

    return Math.round(score);
  }

  /**
   * Print validation report
   */
  private printValidationReport(validation: DecompositionValidation): void {
    console.log(chalk.cyan('\n=== DECOMPOSITION VALIDATION REPORT ===\n'));

    // Status
    if (validation.valid) {
      console.log(chalk.green('Status: VALID'));
    } else {
      console.log(chalk.red('Status: INVALID'));
    }

    // Metrics
    console.log(chalk.gray('\nMetrics:'));
    console.log(`  Coverage: ${(validation.coverage * 100).toFixed(0)}%`);
    console.log(`  Redundancy: ${(validation.redundancy * 100).toFixed(0)}%`);
    console.log(`  Total Subtasks: ${validation.metrics.totalSubtasks}`);
    console.log(`  Avg Complexity: ${validation.metrics.avgTaskComplexity.toFixed(1)}`);
    console.log(`  Max Dep Depth: ${validation.metrics.maxDependencyDepth}`);
    console.log(
      `  Parallelization: ${(validation.metrics.parallelizationPotential * 100).toFixed(0)}%`,
    );

    // Agent distribution
    console.log(chalk.gray('\nAgent Distribution:'));
    for (const [agent, count] of Object.entries(validation.metrics.agentDistribution)) {
      console.log(`  ${agent}: ${count}`);
    }

    // Issues
    if (validation.issues.length > 0) {
      console.log(chalk.gray('\nIssues:'));
      for (const issue of validation.issues) {
        const color =
          issue.severity === 'error'
            ? chalk.red
            : issue.severity === 'warning'
              ? chalk.yellow
              : chalk.gray;
        console.log(color(`  [${issue.severity.toUpperCase()}] ${issue.message}`));
        if (issue.suggestion) {
          console.log(chalk.gray(`    -> ${issue.suggestion}`));
        }
      }
    }

    // Suggestions
    if (validation.suggestions.length > 0) {
      console.log(chalk.gray('\nSuggestions:'));
      for (const suggestion of validation.suggestions) {
        console.log(chalk.cyan(`  * ${suggestion}`));
      }
    }

    console.log(chalk.cyan('\n=========================================\n'));
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a validator instance
 */
export function createValidator(options?: { verbose?: boolean }): TaskDecompositionValidator {
  return new TaskDecompositionValidator(options);
}

/**
 * Quick validation function
 */
export function validateDecomposition(
  originalTask: string,
  subtasks: SubTask[],
): DecompositionValidation {
  const validator = new TaskDecompositionValidator();
  return validator.validateDecomposition(originalTask, subtasks);
}

// =============================================================================
// EXPORTS
// =============================================================================

// Default export
export default {
  TaskDecompositionValidator,
  createValidator,
  validateDecomposition,
};

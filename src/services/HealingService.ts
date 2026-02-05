/**
 * GeminiHydra - Self-Healing Service (Phase C)
 * Detects failures, generates repair tasks, executes fix cycles
 * Uses gemini-3-flash-preview for evaluation
 */

import type {
  LLMProvider,
  ExecutionResult,
  SwarmTask,
  RepairTask,
  HealingEvaluation,
  ChatMessage,
} from '../types/index.js';

const HEALING_PROMPT = `You are a task failure analyzer. Given the execution results, identify failed tasks and generate repair strategies.

For each failed task, create a repair plan:
1. Analyze why it failed (timeout, error, incomplete output)
2. Determine if it's recoverable
3. Create a specific repair prompt that addresses the failure

Respond ONLY with valid JSON:
{
  "success": false,
  "failedTasks": [1, 2],
  "repairTasks": [
    {
      "failedTaskId": 1,
      "reason": "Brief reason for failure",
      "repairStrategy": "retry|simplify|split|skip",
      "repairPrompt": "New prompt that addresses the issue"
    }
  ],
  "maxRetriesReached": false
}

Repair strategies:
- retry: Simple retry with same prompt (transient error)
- simplify: Simplify the task to a more basic version
- split: Split into smaller sub-tasks
- skip: Mark as non-recoverable and skip`;

export class HealingService {
  private provider: LLMProvider;
  private maxRetries: number;

  constructor(provider: LLMProvider, maxRetries: number = 3) {
    this.provider = provider;
    this.maxRetries = maxRetries;
  }

  /**
   * Evaluate execution results and generate repair tasks (Phase C)
   */
  async evaluate(
    tasks: SwarmTask[],
    results: ExecutionResult[],
    currentAttempt: number
  ): Promise<HealingEvaluation> {
    // Find failed tasks
    const failedResults = results.filter(r => !r.success);

    // All succeeded
    if (failedResults.length === 0) {
      return {
        success: true,
        failedTasks: [],
        repairTasks: [],
        maxRetriesReached: false,
      };
    }

    // Max retries reached
    if (currentAttempt >= this.maxRetries) {
      return {
        success: false,
        failedTasks: failedResults.map(r => r.id),
        repairTasks: [],
        maxRetriesReached: true,
      };
    }

    // Build context for LLM
    const context = this.buildEvaluationContext(tasks, results);
    const messages: ChatMessage[] = [
      { role: 'system', content: HEALING_PROMPT },
      { role: 'user', content: context },
    ];

    try {
      const response = await this.provider.createChatCompletion({ messages });
      const content = response.choices[0]?.message?.content || '';

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.createFallbackEvaluation(failedResults, currentAttempt);
      }

      const evaluation = JSON.parse(jsonMatch[0]) as HealingEvaluation;

      // Validate repair tasks
      evaluation.repairTasks = this.validateRepairTasks(evaluation.repairTasks, tasks);
      evaluation.maxRetriesReached = currentAttempt >= this.maxRetries - 1;

      return evaluation;
    } catch (error) {
      console.error('Healing evaluation error:', error);
      return this.createFallbackEvaluation(failedResults, currentAttempt);
    }
  }

  /**
   * Generate a simplified repair prompt
   */
  async generateRepairPrompt(
    originalTask: SwarmTask,
    error: string,
    previousAttempts: number
  ): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Create a simpler version of the failed task. The task has failed ${previousAttempts} times.
Focus on:
1. Breaking down complex requirements
2. Removing ambiguity
3. Adding specific constraints
4. Providing clearer instructions

Respond with ONLY the new task prompt, nothing else.`,
      },
      {
        role: 'user',
        content: `Original task: ${originalTask.task}\n\nError: ${error}\n\nCreate a simpler, clearer version:`,
      },
    ];

    try {
      const response = await this.provider.createChatCompletion({ messages });
      return response.choices[0]?.message?.content || originalTask.task;
    } catch {
      return originalTask.task;
    }
  }

  /**
   * Check if a result indicates recoverable failure
   */
  isRecoverable(result: ExecutionResult): boolean {
    if (result.success) return false;

    const error = result.error?.toLowerCase() || '';

    // Non-recoverable errors
    const nonRecoverable = [
      'api key',
      'authentication',
      'authorization',
      'rate limit exceeded',
      'quota exceeded',
      'model not found',
    ];

    return !nonRecoverable.some(e => error.includes(e));
  }

  private buildEvaluationContext(tasks: SwarmTask[], results: ExecutionResult[]): string {
    let context = 'Task Execution Results:\n\n';

    for (const result of results) {
      const task = tasks.find(t => t.id === result.id);
      context += `Task #${result.id} (${task?.agent || 'unknown'}):\n`;
      context += `  Status: ${result.success ? 'SUCCESS' : 'FAILED'}\n`;
      context += `  Task: ${task?.task.slice(0, 200) || 'N/A'}\n`;

      if (!result.success) {
        context += `  Error: ${result.error || 'Unknown error'}\n`;
      } else {
        context += `  Output length: ${result.content.length} chars\n`;
      }
      context += '\n';
    }

    return context;
  }

  private validateRepairTasks(repairTasks: RepairTask[], originalTasks: SwarmTask[]): RepairTask[] {
    return repairTasks.filter(repair => {
      // Check if original task exists
      const exists = originalTasks.some(t => t.id === repair.failedTaskId);
      if (!exists) return false;

      // Validate strategy
      const validStrategies = ['retry', 'simplify', 'split', 'skip'];
      if (!validStrategies.includes(repair.repairStrategy)) {
        repair.repairStrategy = 'retry';
      }

      // Ensure repair prompt exists
      if (!repair.repairPrompt || repair.repairPrompt.trim() === '') {
        const original = originalTasks.find(t => t.id === repair.failedTaskId);
        repair.repairPrompt = original?.task || '';
      }

      return true;
    });
  }

  private createFallbackEvaluation(
    failedResults: ExecutionResult[],
    currentAttempt: number
  ): HealingEvaluation {
    return {
      success: false,
      failedTasks: failedResults.map(r => r.id),
      repairTasks: failedResults
        .filter(r => this.isRecoverable(r))
        .map(r => ({
          failedTaskId: r.id,
          reason: r.error || 'Unknown error',
          repairStrategy: 'retry' as const,
          repairPrompt: '', // Will use original task
        })),
      maxRetriesReached: currentAttempt >= this.maxRetries - 1,
    };
  }
}

// Singleton pattern
let healingServiceInstance: HealingService | null = null;

export function getHealingService(provider: LLMProvider, maxRetries?: number): HealingService {
  if (!healingServiceInstance) {
    healingServiceInstance = new HealingService(provider, maxRetries);
  }
  return healingServiceInstance;
}

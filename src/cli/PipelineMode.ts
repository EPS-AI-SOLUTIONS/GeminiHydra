/**
 * Pipeline Mode - Task Chaining
 * Agent: Philippa (API/Integration)
 *
 * Features:
 * - Chain multiple tasks with |
 * - Pass output as input to next task
 * - Parallel pipeline branches
 * - Error handling with fallbacks
 */

import chalk from 'chalk';
import ora from 'ora';
import type { AgentRole } from '../config/agents.config.js';
import { Agent } from '../core/agent/Agent.js';
import type { Swarm } from '../core/swarm/Swarm.js';

interface PipelineStage {
  task: string;
  agent?: string;
  condition?: string;
  fallback?: string;
}

interface PipelineResult {
  stage: number;
  task: string;
  output: string;
  success: boolean;
  duration: number;
}

export class PipelineMode {
  private swarm: Swarm;
  private results: PipelineResult[] = [];

  constructor(swarm: Swarm) {
    this.swarm = swarm;
  }

  /**
   * Parse pipeline string into stages
   * Format: "task1" | "task2" | "task3"
   * Or: "task1" | @agent "task2" | "task3"
   */
  parsePipeline(pipelineStr: string): PipelineStage[] {
    const stages: PipelineStage[] = [];
    const parts = pipelineStr.split(/\s*\|\s*/);

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      // Check for agent specification: @agent "task"
      const agentMatch = trimmed.match(/^@(\w+)\s+["']?(.+?)["']?$/);
      if (agentMatch) {
        stages.push({
          task: agentMatch[2],
          agent: agentMatch[1],
        });
      } else {
        // Plain task
        stages.push({
          task: trimmed.replace(/^["']|["']$/g, ''),
        });
      }
    }

    return stages;
  }

  /**
   * Execute a pipeline
   */
  async execute(pipelineStr: string): Promise<string> {
    const stages = this.parsePipeline(pipelineStr);

    if (stages.length === 0) {
      throw new Error('Empty pipeline');
    }

    console.log(chalk.cyan(`\n🔗 Pipeline: ${stages.length} stages\n`));

    let context = '';
    this.results = [];

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const stageNum = i + 1;

      const spinner = ora({
        text: chalk.gray(`[${stageNum}/${stages.length}] ${stage.task.substring(0, 50)}...`),
        prefixText: stage.agent ? chalk.yellow(`@${stage.agent}`) : '',
      }).start();

      const startTime = Date.now();

      try {
        let output: string;

        // === SOLUTION 7: PRESERVE ORIGINAL TASK ===
        // Store original task before any modifications
        const ORIGINAL_STAGE_TASK = stage.task;

        if (stage.agent) {
          // Direct agent execution
          const agent = new Agent(stage.agent as AgentRole);
          // Context is CLEARLY SEPARATED from task
          const taskWithContext = context
            ? `=== CONTEXT FROM PREVIOUS STAGE (FOR REFERENCE ONLY) ===\n${context}\n\n=== YOUR TASK (EXECUTE THIS) ===\n${ORIGINAL_STAGE_TASK}`
            : ORIGINAL_STAGE_TASK;
          output = await agent.think(taskWithContext);
        } else {
          // Swarm execution
          // Context is CLEARLY SEPARATED from task
          const taskWithContext = context
            ? `=== PREVIOUS STAGE OUTPUT (CONTEXT ONLY) ===\n${context}\n\n=== CURRENT TASK (EXECUTE THIS, NOT THE CONTEXT) ===\n${ORIGINAL_STAGE_TASK}`
            : ORIGINAL_STAGE_TASK;
          output = await this.swarm.executeObjective(taskWithContext);
        }

        const duration = Date.now() - startTime;

        this.results.push({
          stage: stageNum,
          task: stage.task,
          output,
          success: true,
          duration,
        });

        context = output; // Pass to next stage
        spinner.succeed(chalk.green(`[${stageNum}/${stages.length}] Complete (${duration}ms)`));
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        const duration = Date.now() - startTime;

        this.results.push({
          stage: stageNum,
          task: stage.task,
          output: msg,
          success: false,
          duration,
        });

        spinner.fail(chalk.red(`[${stageNum}/${stages.length}] Failed: ${msg}`));

        // Check for fallback
        if (stage.fallback) {
          console.log(chalk.yellow(`  Attempting fallback: ${stage.fallback}`));
          // Execute fallback (simplified)
          const agent = new Agent('ciri');
          context = await agent.think(stage.fallback);
        } else {
          throw new Error(`Pipeline failed at stage ${stageNum}: ${msg}`);
        }
      }
    }

    // Generate pipeline summary
    return this.generateSummary();
  }

  /**
   * Generate pipeline execution summary
   */
  private generateSummary(): string {
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    const successCount = this.results.filter((r) => r.success).length;

    let _summary = chalk.cyan('\n═══ Pipeline Summary ═══\n');
    _summary += chalk.gray(`Total stages: ${this.results.length}\n`);
    _summary += chalk.gray(`Successful: ${successCount}/${this.results.length}\n`);
    _summary += chalk.gray(`Total time: ${totalDuration}ms\n\n`);

    // Return last successful output as main result
    const lastSuccess = [...this.results].reverse().find((r) => r.success);
    return lastSuccess?.output || 'Pipeline completed with no output';
  }

  /**
   * Get detailed results
   */
  getResults(): PipelineResult[] {
    return this.results;
  }
}

// Helper to create quick pipelines
export function pipe(...tasks: string[]): string {
  return tasks.map((t) => `"${t}"`).join(' | ');
}

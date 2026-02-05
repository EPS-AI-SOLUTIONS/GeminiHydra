/**
 * GeminiHydra Minimal - GraphProcessor
 * ~80 lines - simple sequential task execution
 */

import { Agent, AgentRole, AGENT_PERSONAS } from './Agent.js';
import { SwarmTask } from './types/swarm.js';
import { ExecutionResult } from './types/provider.js';
import chalk from 'chalk';

export class GraphProcessor {
  /**
   * Execute tasks sequentially (respecting dependencies)
   */
  async execute(tasks: SwarmTask[]): Promise<ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    const completed = new Map<number, ExecutionResult>();

    // Sort by dependencies (simple topological sort)
    const sorted = this.topologicalSort(tasks);

    for (const task of sorted) {
      console.log(chalk.cyan(`\n[Task #${task.id}] ${task.agent}: ${task.task.substring(0, 60)}...`));

      // Build context from dependencies
      let context = '';
      for (const depId of task.dependencies) {
        const dep = completed.get(depId);
        if (dep?.success) {
          context += `[Wynik zadania #${depId}]: ${dep.content.substring(0, 500)}\n`;
        }
      }

      try {
        const agentRole = this.resolveAgent(task.agent);
        const agent = new Agent(agentRole);
        const response = await agent.think(task.task, context);

        const result: ExecutionResult = {
          id: task.id,
          agent: task.agent,
          success: true,
          content: response
        };

        results.push(result);
        completed.set(task.id, result);
        console.log(chalk.green(`[Task #${task.id}] Completed`));

      } catch (error: any) {
        const result: ExecutionResult = {
          id: task.id,
          agent: task.agent,
          success: false,
          content: '',
          error: error.message
        };

        results.push(result);
        completed.set(task.id, result);
        console.log(chalk.red(`[Task #${task.id}] Failed: ${error.message}`));
      }
    }

    return results;
  }

  private resolveAgent(agentName: string): AgentRole {
    const name = agentName.toLowerCase();
    if (name in AGENT_PERSONAS) {
      return name as AgentRole;
    }
    return 'geralt'; // Default
  }

  private topologicalSort(tasks: SwarmTask[]): SwarmTask[] {
    const result: SwarmTask[] = [];
    const visited = new Set<number>();

    const visit = (task: SwarmTask) => {
      if (visited.has(task.id)) return;
      visited.add(task.id);

      for (const depId of task.dependencies) {
        const dep = tasks.find(t => t.id === depId);
        if (dep) visit(dep);
      }

      result.push(task);
    };

    for (const task of tasks) {
      visit(task);
    }

    return result;
  }
}

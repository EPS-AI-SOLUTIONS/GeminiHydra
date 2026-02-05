/**
 * GeminiHydra Minimal - Swarm
 * ~120 lines - Planning + Execution only
 */

import { Agent } from './Agent.js';
import { GraphProcessor } from './GraphProcessor.js';
import { SwarmPlan, SwarmTask } from './types/swarm.js';
import { ExecutionResult } from './types/provider.js';
import chalk from 'chalk';

export class Swarm {
  private processor = new GraphProcessor();

  async executeObjective(objective: string): Promise<string> {
    const startTime = Date.now();

    console.log(chalk.cyan('\n' + '='.repeat(50)));
    console.log(chalk.cyan('  GEMINI HYDRA MINIMAL'));
    console.log(chalk.cyan('='.repeat(50)));
    console.log(chalk.white(`\nZadanie: ${objective.substring(0, 80)}${objective.length > 80 ? '...' : ''}\n`));

    // Phase A: Planning
    console.log(chalk.yellow('\n[Phase A] Planning...'));
    const plan = await this.createPlan(objective);

    if (!plan || plan.tasks.length === 0) {
      return `Nie udalo sie utworzyc planu dla: ${objective}`;
    }

    console.log(chalk.green(`Plan: ${plan.tasks.length} tasks`));
    plan.tasks.forEach(t => {
      console.log(chalk.gray(`  #${t.id} [${t.agent}] ${t.task.substring(0, 50)}...`));
    });

    // Phase B: Execution
    console.log(chalk.yellow('\n[Phase B] Executing...'));
    const results = await this.processor.execute(plan.tasks);

    // Phase D: Synthesis
    console.log(chalk.yellow('\n[Phase D] Synthesizing...'));
    const report = await this.synthesize(objective, results);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(chalk.green(`\nZakonczono w ${duration}s\n`));

    return report;
  }

  private async createPlan(objective: string): Promise<SwarmPlan> {
    const dijkstra = new Agent('dijkstra');

    const planPrompt = `
Stwórz plan wykonania zadania. Odpowiedz TYLKO w formacie JSON:

ZADANIE: ${objective}

FORMAT ODPOWIEDZI (JSON):
{
  "objective": "opis celu",
  "tasks": [
    {"id": 1, "agent": "geralt", "task": "opis zadania 1", "dependencies": []},
    {"id": 2, "agent": "philippa", "task": "opis zadania 2", "dependencies": [1]}
  ]
}

DOSTĘPNI AGENCI: dijkstra (planowanie), geralt (wykonanie), philippa (API/MCP), regis (synteza)

ZASADY:
- Maksymalnie 3 zadania
- Każde zadanie ma unikalne ID
- dependencies = lista ID zadań które muszą być wykonane wcześniej
- Odpowiedz TYLKO JSON, bez markdown
`;

    const response = await dijkstra.think(planPrompt);

    try {
      // Clean JSON from markdown
      let json = response
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      // Find JSON object
      const start = json.indexOf('{');
      const end = json.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        json = json.substring(start, end + 1);
      }

      const plan = JSON.parse(json) as SwarmPlan;

      // Validate and fix tasks
      plan.tasks = plan.tasks.map((t, i) => ({
        id: t.id || i + 1,
        agent: t.agent || 'geralt',
        task: t.task || '',
        dependencies: t.dependencies || [],
        status: 'pending' as const
      }));

      return plan;

    } catch (error: any) {
      console.log(chalk.red(`Plan parsing error: ${error.message}`));
      // Fallback: single task
      return {
        objective,
        tasks: [{
          id: 1,
          agent: 'geralt',
          task: objective,
          dependencies: [],
          status: 'pending'
        }]
      };
    }
  }

  private async synthesize(objective: string, results: ExecutionResult[]): Promise<string> {
    const successResults = results.filter(r => r.success);

    // If single success, return directly
    if (successResults.length === 1 && successResults[0].content.length > 200) {
      return successResults[0].content;
    }

    // Otherwise synthesize with Regis
    const regis = new Agent('regis');
    const synthesisPrompt = `
CEL: ${objective}

WYNIKI AGENTÓW:
${results.map(r => `[#${r.id}] ${r.success ? '✓' : '✗'}: ${r.content.substring(0, 1500)}`).join('\n\n')}

Napisz KRÓTKIE podsumowanie po polsku:
1. Czy cel został zrealizowany?
2. Kluczowe wyniki
3. Ewentualne problemy
`;

    return regis.think(synthesisPrompt);
  }
}

// Export for CLI
export async function createSwarm(): Promise<Swarm> {
  return new Swarm();
}

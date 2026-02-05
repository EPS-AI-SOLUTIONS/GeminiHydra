/**
 * GeminiHydra - Planning Service
 * Handles plan creation and JSON parsing
 */

import { SwarmPlan, SwarmTask } from '../types/index.js';
import { MAX_TASKS } from '../config/constants.js';
import { logger } from './Logger.js';

export class PlanningService {
  /**
   * Parse JSON response from planning agent
   */
  parseResponse(response: string): SwarmPlan | null {
    try {
      // Clean JSON from markdown
      let json = response
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      // Find JSON object
      const start = json.indexOf('{');
      const end = json.lastIndexOf('}');
      if (start === -1 || end === -1) {
        return null;
      }

      json = json.substring(start, end + 1);
      return JSON.parse(json) as SwarmPlan;

    } catch (error) {
      return null;
    }
  }

  /**
   * Validate and normalize tasks
   */
  validateTasks(tasks: Partial<SwarmTask>[]): SwarmTask[] {
    return tasks.slice(0, MAX_TASKS).map((t, i) => ({
      id: t.id || i + 1,
      agent: t.agent || 'geralt',
      task: t.task || '',
      dependencies: t.dependencies || [],
      status: 'pending' as const
    }));
  }

  /**
   * Create fallback plan for single task
   */
  createFallbackPlan(objective: string): SwarmPlan {
    logger.warn('Using fallback single-task plan');
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

  /**
   * Build planning prompt
   */
  buildPrompt(objective: string): string {
    return `
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
- Maksymalnie ${MAX_TASKS} zadania
- Każde zadanie ma unikalne ID
- dependencies = lista ID zadań które muszą być wykonane wcześniej
- Odpowiedz TYLKO JSON, bez markdown
`;
  }
}

export const planningService = new PlanningService();

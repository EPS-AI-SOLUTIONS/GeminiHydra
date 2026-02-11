/**
 * ModelHealthCheck - Feature #20: Model Health Check
 * Monitors model availability and latency
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface ModelHealth {
  model: string;
  available: boolean;
  latency: number;
  lastCheck: Date;
  error?: string;
}

class ModelHealthChecker {
  private health: Map<string, ModelHealth> = new Map();
  private checkInterval = 5 * 60 * 1000; // 5 minutes

  async checkModel(modelName: string): Promise<ModelHealth> {
    const startTime = Date.now();

    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      await model.generateContent('Hi');

      const health: ModelHealth = {
        model: modelName,
        available: true,
        latency: Date.now() - startTime,
        lastCheck: new Date(),
      };

      this.health.set(modelName, health);
      return health;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const health: ModelHealth = {
        model: modelName,
        available: false,
        latency: -1,
        lastCheck: new Date(),
        error: msg,
      };

      this.health.set(modelName, health);
      return health;
    }
  }

  async checkAll(models: string[]): Promise<Map<string, ModelHealth>> {
    const promises = models.map((m) => this.checkModel(m));
    await Promise.all(promises);
    return this.health;
  }

  getHealth(model: string): ModelHealth | undefined {
    return this.health.get(model);
  }

  isAvailable(model: string): boolean {
    const h = this.health.get(model);
    if (!h) return true; // Assume available if not checked

    // Re-check if old
    if (Date.now() - h.lastCheck.getTime() > this.checkInterval) {
      return true; // Allow retry
    }

    return h.available;
  }

  getAvailableModels(candidates: string[]): string[] {
    return candidates.filter((m) => this.isAvailable(m));
  }

  printStatus(): void {
    console.log(chalk.cyan('\n=== Model Health Status ===\n'));

    for (const [model, health] of this.health) {
      const icon = health.available ? chalk.green('[OK]') : chalk.red('[FAIL]');
      const latency = health.latency > 0 ? `${health.latency}ms` : 'N/A';
      console.log(`${icon} ${model}: ${latency}`);
      if (health.error) {
        console.log(chalk.gray(`   Error: ${health.error}`));
      }
    }
  }
}

export const modelHealth = new ModelHealthChecker();

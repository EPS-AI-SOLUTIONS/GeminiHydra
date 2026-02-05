/**
 * GeminiHydra Minimal - Agent
 * ~50 lines - just Gemini API calls
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export type AgentRole = 'dijkstra' | 'regis' | 'geralt' | 'philippa';

export const AGENT_PERSONAS: Record<AgentRole, { name: string; role: string }> = {
  dijkstra: { name: 'dijkstra', role: 'Strategist - creates execution plans' },
  regis:    { name: 'regis',    role: 'Synthesizer - summarizes results' },
  geralt:   { name: 'geralt',   role: 'Executor - performs tasks' },
  philippa: { name: 'philippa', role: 'API/MCP specialist' }
};

export class Agent {
  private name: AgentRole;
  private model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  constructor(role: AgentRole) {
    this.name = AGENT_PERSONAS[role] ? role : 'geralt';
  }

  getName(): string {
    return this.name;
  }

  async think(prompt: string, context: string = ''): Promise<string> {
    const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

    try {
      console.log(chalk.gray(`[${this.name}] Thinking...`));
      const result = await this.model.generateContent(fullPrompt);
      const response = result.response.text();
      console.log(chalk.green(`[${this.name}] Done (${response.length} chars)`));
      return response;
    } catch (error: any) {
      console.log(chalk.red(`[${this.name}] Error: ${error.message}`));
      throw error;
    }
  }
}

export function initializeGeminiModels(): Promise<void> {
  // No-op - model initialized on demand
  return Promise.resolve();
}

/**
 * Interactive Mode with History
 * Agent: Jaskier (UX/Documentation)
 *
 * Features:
 * - Command history (up/down arrows)
 * - Tab completion
 * - Colored prompts per agent
 * - Session memory
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import chalk from 'chalk';

import { GEMINIHYDRA_DIR } from '../config/paths.config.js';

const HISTORY_FILE = path.join(GEMINIHYDRA_DIR, 'history');
const MAX_HISTORY = 1000;

// Agent color mapping
const AGENT_COLORS: Record<string, (text: string) => string> = {
  Dijkstra: chalk.magenta,
  Geralt: chalk.white,
  Yennefer: chalk.magentaBright,
  Triss: chalk.blue,
  Vesemir: chalk.gray,
  Jaskier: chalk.yellow,
  Ciri: chalk.cyan,
  Eskel: chalk.green,
  Lambert: chalk.red,
  Zoltan: chalk.yellowBright,
  Regis: chalk.blueBright,
  Philippa: chalk.greenBright,
};

export class InteractiveMode {
  private rl: readline.Interface;
  private history: string[] = [];
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: assigned in loadHistory/addToHistory
  private historyIndex: number = 0;
  private sessionMemory: Map<string, unknown> = new Map();
  private currentAgent: string = 'dijkstra';

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
  }

  async loadHistory(): Promise<void> {
    try {
      const data = await fs.readFile(HISTORY_FILE, 'utf-8');
      this.history = data.split('\n').filter((line) => line.trim());
      this.historyIndex = this.history.length;
    } catch {
      this.history = [];
    }
  }

  async saveHistory(): Promise<void> {
    const toSave = this.history.slice(-MAX_HISTORY);
    await fs.writeFile(HISTORY_FILE, toSave.join('\n'), 'utf-8');
  }

  addToHistory(command: string): void {
    if (command.trim() && command !== this.history[this.history.length - 1]) {
      this.history.push(command);
      this.historyIndex = this.history.length;
    }
  }

  getPrompt(): string {
    const colorFn = AGENT_COLORS[this.currentAgent] || chalk.white;
    const wolf = chalk.gray('🐺');
    const agent = colorFn(`[${this.currentAgent}]`);
    return `${wolf} ${agent} ${chalk.yellow('>')} `;
  }

  setAgent(agent: string): void {
    if (AGENT_COLORS[agent]) {
      this.currentAgent = agent;
      console.log(chalk.gray(`Switched to ${agent}`));
    }
  }

  setSessionValue(key: string, value: unknown): void {
    this.sessionMemory.set(key, value);
  }

  getSessionValue(key: string): unknown {
    return this.sessionMemory.get(key);
  }

  async prompt(message?: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(message || this.getPrompt(), (answer) => {
        this.addToHistory(answer);
        resolve(answer);
      });
    });
  }

  printWelcome(): void {
    console.log(chalk.magenta('\n╔═══════════════════════════════════════════════════════════╗'));
    console.log(
      chalk.magenta('║') +
        chalk.yellow.bold('         GEMINI HYDRA - INTERACTIVE MODE                  ') +
        chalk.magenta('║'),
    );
    console.log(
      chalk.magenta('║') +
        chalk.gray('  Commands: @agent, /help, /history, /clear, exit          ') +
        chalk.magenta('║'),
    );
    console.log(chalk.magenta('╚═══════════════════════════════════════════════════════════╝\n'));
  }

  printHelp(): void {
    console.log(chalk.cyan('\nAvailable Commands:'));
    console.log(`${chalk.gray('  @<agent>      ')}Switch to specific agent (e.g., @geralt)`);
    console.log(`${chalk.gray('  /help         ')}Show this help`);
    console.log(`${chalk.gray('  /history      ')}Show command history`);
    console.log(`${chalk.gray('  /clear        ')}Clear screen`);
    console.log(`${chalk.gray('  /status       ')}Show session status`);
    console.log(`${chalk.gray('  /cost         ')}Show token usage`);
    console.log(`${chalk.gray('  exit, quit    ')}Exit interactive mode\n`);
  }

  async close(): Promise<void> {
    await this.saveHistory();
    this.rl.close();
  }
}

// Completions for tab
export const COMPLETIONS = [
  '@dijkstra',
  '@geralt',
  '@yennefer',
  '@triss',
  '@vesemir',
  '@jaskier',
  '@ciri',
  '@eskel',
  '@lambert',
  '@zoltan',
  '@regis',
  '@philippa',
  '/help',
  '/history',
  '/clear',
  '/status',
  '/cost',
  'exit',
  'quit',
  'analyze',
  'review',
  'fix',
  'test',
  'deploy',
  'document',
];

export function completer(line: string): [string[], string] {
  const hits = COMPLETIONS.filter((c) => c.startsWith(line.toLowerCase()));
  return [hits.length ? hits : COMPLETIONS, line];
}

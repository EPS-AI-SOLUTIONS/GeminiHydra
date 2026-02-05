/**
 * GeminiHydra - Logger Service
 * Centralized logging with chalk styling and headless mode support
 */

import chalk from 'chalk';
import { LogLevel } from '../types/index.js';
import { PHASES } from '../config/constants.js';

export interface LoggerOptions {
  level?: LogLevel;
  headless?: boolean;
  verbose?: boolean;
}

export class Logger {
  private static instance: Logger;
  private level: LogLevel = 'info';
  private headless: boolean = false;
  private verbose: boolean = false;

  static getInstance(): Logger {
    if (!this.instance) {
      this.instance = new Logger();
    }
    return this.instance;
  }

  configure(options: LoggerOptions): void {
    if (options.level) this.level = options.level;
    if (options.headless !== undefined) this.headless = options.headless;
    if (options.verbose !== undefined) this.verbose = options.verbose;
  }

  private shouldLog(level: LogLevel): boolean {
    if (this.headless && level !== 'error') return false;
    if (this.level === 'silent') return false;

    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.level);
  }

  // Phase logging
  phase(phase: keyof typeof PHASES | string, message?: string): void {
    if (!this.shouldLog('info')) return;
    const phaseName = phase in PHASES ? PHASES[phase as keyof typeof PHASES] : phase;
    const msg = message ? ` ${message}` : '';
    console.log(chalk.yellow(`\n[${phaseName}]${msg}...`));
  }

  // Task logging
  task(id: number, agent: string, description: string): void {
    if (!this.shouldLog('info')) return;
    console.log(chalk.cyan(`\n[Task #${id}] ${agent}: ${description}`));
  }

  taskComplete(id: number): void {
    if (!this.shouldLog('info')) return;
    console.log(chalk.green(`[Task #${id}] Completed`));
  }

  taskFailed(id: number, error: string): void {
    console.log(chalk.red(`[Task #${id}] Failed: ${error}`));
  }

  // Agent logging
  agentThinking(name: string): void {
    if (!this.verbose) return;
    console.log(chalk.gray(`[${name}] Thinking...`));
  }

  agentDone(name: string, chars: number, durationMs?: number): void {
    if (!this.verbose) return;
    const duration = durationMs ? ` in ${(durationMs / 1000).toFixed(1)}s` : '';
    console.log(chalk.green(`[${name}] Done (${chars} chars${duration})`));
  }

  agentError(name: string, error: string): void {
    console.log(chalk.red(`[${name}] Error: ${error}`));
  }

  // Plan logging
  plan(taskCount: number): void {
    if (!this.shouldLog('info')) return;
    console.log(chalk.green(`Plan: ${taskCount} tasks`));
  }

  planTask(id: number, agent: string, task: string): void {
    if (!this.shouldLog('info')) return;
    console.log(chalk.gray(`  #${id} [${agent}] ${task}`));
  }

  // General logging
  debug(message: string): void {
    if (!this.shouldLog('debug')) return;
    console.log(chalk.gray(`[DEBUG] ${message}`));
  }

  info(message: string): void {
    if (!this.shouldLog('info')) return;
    console.log(chalk.white(message));
  }

  success(message: string): void {
    if (!this.shouldLog('info')) return;
    console.log(chalk.green(message));
  }

  error(message: string): void {
    console.log(chalk.red(message));
  }

  warn(message: string): void {
    if (!this.shouldLog('warn')) return;
    console.log(chalk.yellow(message));
  }

  // Banner
  banner(title: string): void {
    if (!this.shouldLog('info')) return;
    console.log(chalk.cyan('\n' + '='.repeat(50)));
    console.log(chalk.cyan(`  ${title}`));
    console.log(chalk.cyan('='.repeat(50)));
  }

  // Separator
  separator(): void {
    if (!this.shouldLog('info')) return;
    console.log(chalk.cyan('-'.repeat(50)));
  }

  // Duration
  duration(seconds: number): void {
    if (!this.shouldLog('info')) return;
    console.log(chalk.green(`\nZakonczone w ${seconds}s\n`));
  }

  // Stream chunk (for streaming output)
  streamChunk(content: string): void {
    if (this.headless) return;
    process.stdout.write(content);
  }
}

export const logger = Logger.getInstance();

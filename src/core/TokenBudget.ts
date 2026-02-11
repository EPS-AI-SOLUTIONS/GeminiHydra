/**
 * TokenBudget - Token usage tracking and budget management
 * Feature #4: Token Budget Management
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

import { GEMINIHYDRA_DIR } from '../config/paths.config.js';

const BUDGET_FILE = path.join(GEMINIHYDRA_DIR, 'token-budget.json');

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface BudgetConfig {
  dailyLimit?: number; // Daily token limit
  sessionLimit?: number; // Per-session limit
  taskLimit?: number; // Per-task limit
  warningThreshold?: number; // Warning at this % of limit
  onLimitReached?: (type: string, used: number, limit: number) => void;
  onWarning?: (type: string, used: number, limit: number) => void;
}

const DEFAULT_CONFIG: BudgetConfig = {
  dailyLimit: 1_000_000, // 1M tokens/day
  sessionLimit: 200_000, // 200K tokens/session
  taskLimit: 50_000, // 50K tokens/task
  warningThreshold: 0.8, // 80%
};

export interface BudgetState {
  daily: { used: number; date: string };
  session: { used: number; startedAt: string };
  tasks: { [taskId: string]: TokenUsage };
}

/**
 * Token Budget Manager
 */
export class TokenBudgetManager {
  private config: Required<BudgetConfig>;
  private state: BudgetState = {
    daily: { used: 0, date: new Date().toISOString().split('T')[0] },
    session: { used: 0, startedAt: new Date().toISOString() },
    tasks: {},
  };

  constructor(config: BudgetConfig = {}) {
    this.config = {
      dailyLimit: config.dailyLimit ?? DEFAULT_CONFIG.dailyLimit ?? 1_000_000,
      sessionLimit: config.sessionLimit ?? DEFAULT_CONFIG.sessionLimit ?? 200_000,
      taskLimit: config.taskLimit ?? DEFAULT_CONFIG.taskLimit ?? 50_000,
      warningThreshold: config.warningThreshold ?? DEFAULT_CONFIG.warningThreshold ?? 0.8,
      onLimitReached:
        config.onLimitReached ??
        ((type, used, limit) => {
          console.log(chalk.red(`[Budget] ${type} limit reached: ${used}/${limit} tokens`));
        }),
      onWarning:
        config.onWarning ??
        ((type, used, limit) => {
          console.log(
            chalk.yellow(
              `[Budget] ${type} warning: ${used}/${limit} tokens (${((used / limit) * 100).toFixed(0)}%)`,
            ),
          );
        }),
    };
  }

  /**
   * Load budget state from file
   */
  async load(): Promise<void> {
    try {
      await fs.mkdir(GEMINIHYDRA_DIR, { recursive: true });
      const data = await fs.readFile(BUDGET_FILE, 'utf-8');
      const saved = JSON.parse(data);

      // Check if daily reset needed
      const today = new Date().toISOString().split('T')[0];
      if (saved.daily?.date !== today) {
        saved.daily = { used: 0, date: today };
      }

      this.state = {
        ...this.state,
        ...saved,
        session: this.state.session, // Keep current session
      };
    } catch (_error) {
      // No saved state, use defaults
    }
  }

  /**
   * Save budget state to file
   */
  async save(): Promise<void> {
    try {
      await fs.mkdir(GEMINIHYDRA_DIR, { recursive: true });
      await fs.writeFile(
        BUDGET_FILE,
        JSON.stringify(
          {
            daily: this.state.daily,
          },
          null,
          2,
        ),
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(chalk.yellow(`[Budget] Failed to save: ${msg}`));
    }
  }

  /**
   * Track token usage
   */
  track(taskId: string, usage: TokenUsage): void {
    const total = usage.input + usage.output;

    // Track per-task (with pruning to prevent unbounded growth)
    if (!this.state.tasks[taskId]) {
      this.state.tasks[taskId] = { input: 0, output: 0, total: 0 };

      // Prune old tasks if map grows too large
      const MAX_TRACKED_TASKS = 500;
      const taskKeys = Object.keys(this.state.tasks);
      if (taskKeys.length > MAX_TRACKED_TASKS) {
        // Remove oldest half of tasks (FIFO by insertion order)
        const toRemove = taskKeys.slice(0, Math.floor(MAX_TRACKED_TASKS / 2));
        for (const key of toRemove) {
          delete this.state.tasks[key];
        }
      }
    }
    this.state.tasks[taskId].input += usage.input;
    this.state.tasks[taskId].output += usage.output;
    this.state.tasks[taskId].total += total;

    // Check task limit
    if (this.state.tasks[taskId].total >= this.config.taskLimit) {
      this.config.onLimitReached('task', this.state.tasks[taskId].total, this.config.taskLimit);
    } else if (
      this.state.tasks[taskId].total >=
      this.config.taskLimit * this.config.warningThreshold
    ) {
      this.config.onWarning('task', this.state.tasks[taskId].total, this.config.taskLimit);
    }

    // Track session
    this.state.session.used += total;
    if (this.state.session.used >= this.config.sessionLimit) {
      this.config.onLimitReached('session', this.state.session.used, this.config.sessionLimit);
    } else if (this.state.session.used >= this.config.sessionLimit * this.config.warningThreshold) {
      this.config.onWarning('session', this.state.session.used, this.config.sessionLimit);
    }

    // Track daily
    this.state.daily.used += total;
    if (this.state.daily.used >= this.config.dailyLimit) {
      this.config.onLimitReached('daily', this.state.daily.used, this.config.dailyLimit);
    } else if (this.state.daily.used >= this.config.dailyLimit * this.config.warningThreshold) {
      this.config.onWarning('daily', this.state.daily.used, this.config.dailyLimit);
    }
  }

  /**
   * Check if within budget
   */
  canProceed(estimatedTokens: number = 0): { allowed: boolean; reason?: string } {
    if (this.state.daily.used + estimatedTokens > this.config.dailyLimit) {
      return { allowed: false, reason: 'Daily limit exceeded' };
    }

    if (this.state.session.used + estimatedTokens > this.config.sessionLimit) {
      return { allowed: false, reason: 'Session limit exceeded' };
    }

    return { allowed: true };
  }

  /**
   * Get remaining budget
   */
  getRemaining(): { daily: number; session: number } {
    return {
      daily: Math.max(0, this.config.dailyLimit - this.state.daily.used),
      session: Math.max(0, this.config.sessionLimit - this.state.session.used),
    };
  }

  /**
   * Get current usage stats
   */
  getStats(): {
    daily: { used: number; limit: number; percentage: number };
    session: { used: number; limit: number; percentage: number };
  } {
    return {
      daily: {
        used: this.state.daily.used,
        limit: this.config.dailyLimit,
        percentage: (this.state.daily.used / this.config.dailyLimit) * 100,
      },
      session: {
        used: this.state.session.used,
        limit: this.config.sessionLimit,
        percentage: (this.state.session.used / this.config.sessionLimit) * 100,
      },
    };
  }

  /**
   * Reset session budget
   */
  resetSession(): void {
    this.state.session = {
      used: 0,
      startedAt: new Date().toISOString(),
    };
    this.state.tasks = {};
  }

  /**
   * Set new limits
   */
  setLimits(limits: Partial<BudgetConfig>): void {
    if (limits.dailyLimit) this.config.dailyLimit = limits.dailyLimit;
    if (limits.sessionLimit) this.config.sessionLimit = limits.sessionLimit;
    if (limits.taskLimit) this.config.taskLimit = limits.taskLimit;
  }

  /**
   * Estimate tokens for text
   */
  static estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Suggest model based on remaining budget
   */
  suggestModel(estimatedTokens: number): 'pro' | 'flash' | 'local' {
    const remaining = this.getRemaining();

    // If low on budget, prefer cheaper/local models
    if (remaining.daily < estimatedTokens * 2) {
      return 'local';
    }

    if (remaining.session < estimatedTokens * 3) {
      return 'flash';
    }

    return 'pro';
  }
}

// Global instance
export const tokenBudget = new TokenBudgetManager();

export default tokenBudget;

/**
 * Cost Tracking - Token Usage & Cost Estimation
 * Agent: Zoltan (Data)
 *
 * Features:
 * - Track token usage per model
 * - Estimate costs based on pricing
 * - Daily/weekly/monthly reports
 * - Budget alerts
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';

import { GEMINIHYDRA_DIR } from '../config/paths.config.js';

// Gemini pricing (per 1M tokens) - Gemini 3 only (2026)
const PRICING = {
  'gemini-3-pro-preview': { input: 1.25, output: 5.00 },
  'gemini-3-flash-preview': { input: 0.075, output: 0.30 },
  'ollama-local': { input: 0, output: 0 }, // Free (local)
};

interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  timestamp: Date;
  task?: string;
}

interface UsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  byModel: Record<string, { input: number; output: number; cost: number }>;
  byDay: Record<string, { tokens: number; cost: number }>;
}

const USAGE_FILE = path.join(GEMINIHYDRA_DIR, 'usage.json');

export class CostTracker {
  private usage: TokenUsage[] = [];
  private budget: number | null = null;

  constructor() {}

  /**
   * Load usage history
   */
  async load(): Promise<void> {
    try {
      const data = await fs.readFile(USAGE_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      this.usage = parsed.usage.map((u: any) => ({
        ...u,
        timestamp: new Date(u.timestamp),
      }));
      this.budget = parsed.budget || null;
    } catch {
      this.usage = [];
    }
  }

  /**
   * Save usage history
   */
  async save(): Promise<void> {
    await fs.writeFile(USAGE_FILE, JSON.stringify({
      usage: this.usage,
      budget: this.budget,
    }, null, 2), 'utf-8');
  }

  /**
   * Track token usage
   */
  async track(model: string, inputTokens: number, outputTokens: number, task?: string): Promise<void> {
    this.usage.push({
      model,
      inputTokens,
      outputTokens,
      timestamp: new Date(),
      task,
    });

    await this.save();

    // Check budget
    if (this.budget) {
      const stats = this.getStats('today');
      if (stats.totalCost >= this.budget) {
        console.log(chalk.red(`\n⚠️  Budget exceeded! ($${stats.totalCost.toFixed(4)} / $${this.budget})`));
      } else if (stats.totalCost >= this.budget * 0.8) {
        console.log(chalk.yellow(`\n⚠️  80% of budget used ($${stats.totalCost.toFixed(4)} / $${this.budget})`));
      }
    }
  }

  /**
   * Calculate cost for usage
   */
  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = PRICING[model as keyof typeof PRICING] || PRICING['gemini-3-pro-preview'];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Get usage statistics
   */
  getStats(period: 'today' | 'week' | 'month' | 'all' = 'all'): UsageStats {
    const now = new Date();
    let filteredUsage = this.usage;

    if (period === 'today') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filteredUsage = this.usage.filter(u => u.timestamp >= startOfDay);
    } else if (period === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filteredUsage = this.usage.filter(u => u.timestamp >= weekAgo);
    } else if (period === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filteredUsage = this.usage.filter(u => u.timestamp >= monthAgo);
    }

    const stats: UsageStats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      byModel: {},
      byDay: {},
    };

    for (const usage of filteredUsage) {
      const cost = this.calculateCost(usage.model, usage.inputTokens, usage.outputTokens);

      stats.totalInputTokens += usage.inputTokens;
      stats.totalOutputTokens += usage.outputTokens;
      stats.totalCost += cost;

      // By model
      if (!stats.byModel[usage.model]) {
        stats.byModel[usage.model] = { input: 0, output: 0, cost: 0 };
      }
      stats.byModel[usage.model].input += usage.inputTokens;
      stats.byModel[usage.model].output += usage.outputTokens;
      stats.byModel[usage.model].cost += cost;

      // By day
      const day = usage.timestamp.toISOString().split('T')[0];
      if (!stats.byDay[day]) {
        stats.byDay[day] = { tokens: 0, cost: 0 };
      }
      stats.byDay[day].tokens += usage.inputTokens + usage.outputTokens;
      stats.byDay[day].cost += cost;
    }

    return stats;
  }

  /**
   * Set budget limit
   */
  async setBudget(amount: number): Promise<void> {
    this.budget = amount;
    await this.save();
    console.log(chalk.green(`Budget set to $${amount.toFixed(2)}`));
  }

  /**
   * Print status report
   */
  printStatus(): void {
    const today = this.getStats('today');
    const week = this.getStats('week');
    const month = this.getStats('month');

    console.log(chalk.cyan('\n═══ Token Usage & Cost Report ═══\n'));

    // Today
    console.log(chalk.yellow('Today:'));
    console.log(chalk.gray(`  Tokens: ${this.formatNumber(today.totalInputTokens + today.totalOutputTokens)}`));
    console.log(chalk.gray(`  Cost: $${today.totalCost.toFixed(4)}`));

    // This week
    console.log(chalk.yellow('\nThis Week:'));
    console.log(chalk.gray(`  Tokens: ${this.formatNumber(week.totalInputTokens + week.totalOutputTokens)}`));
    console.log(chalk.gray(`  Cost: $${week.totalCost.toFixed(4)}`));

    // This month
    console.log(chalk.yellow('\nThis Month:'));
    console.log(chalk.gray(`  Tokens: ${this.formatNumber(month.totalInputTokens + month.totalOutputTokens)}`));
    console.log(chalk.gray(`  Cost: $${month.totalCost.toFixed(4)}`));

    // By model
    console.log(chalk.yellow('\nBy Model (Month):'));
    const sortedModels = Object.entries(month.byModel)
      .sort((a, b) => b[1].cost - a[1].cost);

    for (const [model, data] of sortedModels) {
      const percentage = ((data.cost / month.totalCost) * 100) || 0;
      const bar = this.createBar(percentage, 20);
      console.log(chalk.gray(`  ${model.padEnd(25)} ${bar} ${percentage.toFixed(0)}% ($${data.cost.toFixed(4)})`));
    }

    // Budget status
    if (this.budget) {
      const used = (today.totalCost / this.budget) * 100;
      console.log(chalk.yellow('\nBudget:'));
      console.log(chalk.gray(`  Daily limit: $${this.budget.toFixed(2)}`));
      console.log(chalk.gray(`  Used today: $${today.totalCost.toFixed(4)} (${used.toFixed(0)}%)`));
      const budgetBar = this.createBar(used, 30, used > 80);
      console.log(chalk.gray(`  ${budgetBar}`));
    }

    console.log('');
  }

  /**
   * Format large numbers
   */
  private formatNumber(num: number): string {
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(2)}M`;
    } else if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`;
    }
    return num.toString();
  }

  /**
   * Create ASCII progress bar
   */
  private createBar(percentage: number, width: number, warning: boolean = false): string {
    const filled = Math.min(Math.round((percentage / 100) * width), width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return warning ? chalk.red(bar) : chalk.green(bar);
  }

  /**
   * Estimate tokens for text (rough approximation)
   */
  static estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Get pricing info
   */
  static getPricing(): typeof PRICING {
    return PRICING;
  }
}

// Singleton instance for global tracking
export const costTracker = new CostTracker();

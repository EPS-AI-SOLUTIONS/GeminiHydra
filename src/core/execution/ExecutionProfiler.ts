/**
 * ExecutionProfiler - Feature #20 from ExecutionEngine
 *
 * Handles execution profiling, statistics collection,
 * and performance analysis of task execution.
 */

import chalk from 'chalk';
import type { ErrorType } from './AdaptiveRetry.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ExecutionProfile {
  taskId: number;
  agent: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  tokensUsed: number;
  apiCalls: number;
  retries: number;
  success: boolean;
  errorType?: ErrorType;
  model: string;
  phaseTimings: Record<string, number>;
}

export interface ExecutionStats {
  totalTasks: number;
  successRate: number;
  avgDuration: number;
  avgTokens: number;
  avgRetries: number;
  byAgent: Record<string, AgentStats>;
  byModel: Record<string, ModelStats>;
}

export interface AgentStats {
  count: number;
  avgDuration: number;
  successRate: number;
}

export interface ModelStats {
  count: number;
  avgDuration: number;
  avgTokens: number;
}

// =============================================================================
// EXECUTION PROFILER CLASS
// =============================================================================

class ExecutionProfiler {
  private profiles: ExecutionProfile[] = [];
  private activeProfiles: Map<number, Partial<ExecutionProfile>> = new Map();
  private maxProfiles: number = 1000;

  /**
   * Start profiling a task
   */
  startTask(taskId: number, agent: string, model: string): void {
    this.activeProfiles.set(taskId, {
      taskId,
      agent,
      model,
      startTime: new Date(),
      tokensUsed: 0,
      apiCalls: 0,
      retries: 0,
      phaseTimings: {},
    });
  }

  /**
   * Record API call
   */
  recordApiCall(taskId: number, tokens: number): void {
    const profile = this.activeProfiles.get(taskId);
    if (profile) {
      profile.tokensUsed = (profile.tokensUsed || 0) + tokens;
      profile.apiCalls = (profile.apiCalls || 0) + 1;
    }
  }

  /**
   * Record retry
   */
  recordRetry(taskId: number): void {
    const profile = this.activeProfiles.get(taskId);
    if (profile) {
      profile.retries = (profile.retries || 0) + 1;
    }
  }

  /**
   * Record phase timing
   */
  recordPhase(taskId: number, phase: string, duration: number): void {
    const profile = this.activeProfiles.get(taskId);
    if (profile) {
      if (!profile.phaseTimings) profile.phaseTimings = {};
      profile.phaseTimings[phase] = duration;
    }
  }

  /**
   * End profiling
   */
  endTask(taskId: number, success: boolean, errorType?: ErrorType): ExecutionProfile {
    const profile = this.activeProfiles.get(taskId);
    if (!profile) {
      throw new Error(`No active profile for task ${taskId}`);
    }

    const endTime = new Date();
    const duration = endTime.getTime() - (profile.startTime?.getTime() ?? endTime.getTime());

    const fullProfile: ExecutionProfile = {
      taskId,
      agent: profile.agent ?? 'unknown',
      startTime: profile.startTime ?? new Date(),
      endTime,
      duration,
      tokensUsed: profile.tokensUsed || 0,
      apiCalls: profile.apiCalls || 0,
      retries: profile.retries || 0,
      success,
      errorType,
      model: profile.model ?? 'unknown',
      phaseTimings: profile.phaseTimings || {},
    };

    this.profiles.push(fullProfile);
    this.activeProfiles.delete(taskId);

    // Trim old profiles
    if (this.profiles.length > this.maxProfiles) {
      this.profiles = this.profiles.slice(-this.maxProfiles);
    }

    return fullProfile;
  }

  /**
   * Get statistics
   */
  getStats(): ExecutionStats {
    if (this.profiles.length === 0) {
      return {
        totalTasks: 0,
        successRate: 0,
        avgDuration: 0,
        avgTokens: 0,
        avgRetries: 0,
        byAgent: {},
        byModel: {},
      };
    }

    const successful = this.profiles.filter((p) => p.success);
    const totalDuration = this.profiles.reduce((sum, p) => sum + p.duration, 0);
    const totalTokens = this.profiles.reduce((sum, p) => sum + p.tokensUsed, 0);
    const totalRetries = this.profiles.reduce((sum, p) => sum + p.retries, 0);

    // By agent
    const byAgent: Record<string, { count: number; totalDuration: number; successes: number }> = {};
    for (const profile of this.profiles) {
      if (!byAgent[profile.agent]) {
        byAgent[profile.agent] = { count: 0, totalDuration: 0, successes: 0 };
      }
      byAgent[profile.agent].count++;
      byAgent[profile.agent].totalDuration += profile.duration;
      if (profile.success) byAgent[profile.agent].successes++;
    }

    // By model
    const byModel: Record<string, { count: number; totalDuration: number; totalTokens: number }> =
      {};
    for (const profile of this.profiles) {
      if (!byModel[profile.model]) {
        byModel[profile.model] = { count: 0, totalDuration: 0, totalTokens: 0 };
      }
      byModel[profile.model].count++;
      byModel[profile.model].totalDuration += profile.duration;
      byModel[profile.model].totalTokens += profile.tokensUsed;
    }

    return {
      totalTasks: this.profiles.length,
      successRate: successful.length / this.profiles.length,
      avgDuration: totalDuration / this.profiles.length,
      avgTokens: totalTokens / this.profiles.length,
      avgRetries: totalRetries / this.profiles.length,
      byAgent: Object.fromEntries(
        Object.entries(byAgent).map(([agent, data]) => [
          agent,
          {
            count: data.count,
            avgDuration: data.totalDuration / data.count,
            successRate: data.successes / data.count,
          },
        ]),
      ),
      byModel: Object.fromEntries(
        Object.entries(byModel).map(([model, data]) => [
          model,
          {
            count: data.count,
            avgDuration: data.totalDuration / data.count,
            avgTokens: data.totalTokens / data.count,
          },
        ]),
      ),
    };
  }

  /**
   * Get recent profiles
   */
  getRecent(count: number = 10): ExecutionProfile[] {
    return this.profiles.slice(-count);
  }

  /**
   * Get slowest tasks
   */
  getSlowest(count: number = 5): ExecutionProfile[] {
    return [...this.profiles].sort((a, b) => b.duration - a.duration).slice(0, count);
  }

  /**
   * Get fastest tasks
   */
  getFastest(count: number = 5): ExecutionProfile[] {
    return [...this.profiles].sort((a, b) => a.duration - b.duration).slice(0, count);
  }

  /**
   * Get failed tasks
   */
  getFailed(count: number = 10): ExecutionProfile[] {
    return this.profiles.filter((p) => !p.success).slice(-count);
  }

  /**
   * Get profiles by agent
   */
  getByAgent(agent: string): ExecutionProfile[] {
    return this.profiles.filter((p) => p.agent === agent);
  }

  /**
   * Get profiles by model
   */
  getByModel(model: string): ExecutionProfile[] {
    return this.profiles.filter((p) => p.model === model);
  }

  /**
   * Get profiles in time range
   */
  getInTimeRange(start: Date, end: Date): ExecutionProfile[] {
    return this.profiles.filter((p) => p.startTime >= start && p.endTime <= end);
  }

  /**
   * Get total tokens used
   */
  getTotalTokensUsed(): number {
    return this.profiles.reduce((sum, p) => sum + p.tokensUsed, 0);
  }

  /**
   * Get total API calls
   */
  getTotalApiCalls(): number {
    return this.profiles.reduce((sum, p) => sum + p.apiCalls, 0);
  }

  /**
   * Get active profile count
   */
  getActiveProfileCount(): number {
    return this.activeProfiles.size;
  }

  /**
   * Check if task is being profiled
   */
  isTaskActive(taskId: number): boolean {
    return this.activeProfiles.has(taskId);
  }

  /**
   * Print summary
   */
  printSummary(): void {
    const stats = this.getStats();

    console.log(chalk.cyan('\n[PROFILER] EXECUTION PROFILING SUMMARY'));
    console.log(chalk.gray('-'.repeat(50)));
    console.log(`Total Tasks: ${stats.totalTasks}`);
    console.log(`Success Rate: ${(stats.successRate * 100).toFixed(1)}%`);
    console.log(`Avg Duration: ${(stats.avgDuration / 1000).toFixed(2)}s`);
    console.log(`Avg Tokens: ${stats.avgTokens.toFixed(0)}`);
    console.log(`Avg Retries: ${stats.avgRetries.toFixed(2)}`);

    console.log(chalk.gray('\nBy Agent:'));
    for (const [agent, data] of Object.entries(stats.byAgent)) {
      console.log(
        `  ${agent}: ${data.count} tasks, ${(data.avgDuration / 1000).toFixed(2)}s avg, ${(data.successRate * 100).toFixed(0)}% success`,
      );
    }

    console.log(chalk.gray('\nBy Model:'));
    for (const [model, data] of Object.entries(stats.byModel)) {
      console.log(
        `  ${model}: ${data.count} tasks, ${(data.avgDuration / 1000).toFixed(2)}s avg, ${data.avgTokens.toFixed(0)} tokens avg`,
      );
    }
  }

  /**
   * Export profiles to JSON
   */
  exportToJSON(): string {
    return JSON.stringify(
      {
        profiles: this.profiles,
        stats: this.getStats(),
        exportedAt: new Date().toISOString(),
      },
      null,
      2,
    );
  }

  /**
   * Import profiles from JSON
   */
  importFromJSON(json: string): number {
    try {
      const data = JSON.parse(json);
      if (Array.isArray(data.profiles)) {
        const imported = data.profiles.map((p: Record<string, unknown>) => ({
          ...p,
          startTime: new Date(p.startTime as string | number),
          endTime: new Date(p.endTime as string | number),
        }));
        this.profiles.push(...imported);

        // Trim if needed
        if (this.profiles.length > this.maxProfiles) {
          this.profiles = this.profiles.slice(-this.maxProfiles);
        }

        return imported.length;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  /**
   * Clear profiles
   */
  clear(): void {
    this.profiles = [];
    this.activeProfiles.clear();
  }

  /**
   * Set max profiles
   */
  setMaxProfiles(max: number): void {
    this.maxProfiles = max;
    if (this.profiles.length > max) {
      this.profiles = this.profiles.slice(-max);
    }
  }

  /**
   * Get profile count
   */
  getProfileCount(): number {
    return this.profiles.length;
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const executionProfiler = new ExecutionProfiler();

// Export class for testing purposes
export { ExecutionProfiler };

/**
 * ResourceScheduler - Feature #17 from ExecutionEngine
 *
 * Handles resource-aware scheduling of tasks based on API quotas,
 * memory usage, and concurrency limits.
 */

import chalk from 'chalk';
import type { PrioritizedTask } from './TaskPrioritization.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ResourceState {
  apiQuotaRemaining: number;
  apiQuotaLimit: number;
  memoryUsageMB: number;
  activeTasks: number;
  maxConcurrentTasks: number;
  lastApiCall: Date;
  rateLimitResetTime?: Date;
}

export interface CanExecuteResult {
  canRun: boolean;
  reason?: string;
  waitTime?: number;
}

export interface SchedulingRecommendation {
  recommendedConcurrency: number;
  shouldPause: boolean;
  reason: string;
}

// =============================================================================
// RESOURCE SCHEDULER CLASS
// =============================================================================

class ResourceScheduler {
  private state: ResourceState = {
    apiQuotaRemaining: 1000,
    apiQuotaLimit: 1000,
    memoryUsageMB: 0,
    activeTasks: 0,
    maxConcurrentTasks: 12,
    lastApiCall: new Date(),
  };

  private taskQueue: Array<{ task: PrioritizedTask; resolve: () => void }> = [];

  /**
   * Update resource state
   */
  updateState(partial: Partial<ResourceState>): void {
    this.state = { ...this.state, ...partial };
  }

  /**
   * Get current state
   */
  getState(): ResourceState {
    return { ...this.state };
  }

  /**
   * Check if resources are available for task
   */
  canExecute(_task: PrioritizedTask): CanExecuteResult {
    // Check concurrency limit
    if (this.state.activeTasks >= this.state.maxConcurrentTasks) {
      return { canRun: false, reason: 'Max concurrent tasks reached', waitTime: 1000 };
    }

    // Check API quota
    if (this.state.apiQuotaRemaining <= 0) {
      const waitTime = this.state.rateLimitResetTime
        ? Math.max(0, this.state.rateLimitResetTime.getTime() - Date.now())
        : 60000;
      return { canRun: false, reason: 'API quota exhausted', waitTime };
    }

    // Check memory (rough estimate)
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
    if (memoryUsage > 500) {
      // 500MB threshold
      return { canRun: false, reason: 'High memory usage', waitTime: 5000 };
    }

    return { canRun: true };
  }

  /**
   * Request execution slot
   */
  async requestSlot(task: PrioritizedTask): Promise<void> {
    const check = this.canExecute(task);

    if (check.canRun) {
      this.state.activeTasks++;
      return;
    }

    // Queue and wait
    console.log(chalk.yellow(`[Scheduler] Task #${task.id} waiting: ${check.reason}`));

    return new Promise((resolve) => {
      this.taskQueue.push({ task, resolve });

      // Set up periodic check
      const checkInterval = setInterval(() => {
        const recheck = this.canExecute(task);
        if (recheck.canRun) {
          clearInterval(checkInterval);
          this.state.activeTasks++;
          const idx = this.taskQueue.findIndex((q) => q.task.id === task.id);
          if (idx >= 0) this.taskQueue.splice(idx, 1);
          resolve();
        }
      }, check.waitTime || 1000);
    });
  }

  /**
   * Release execution slot
   */
  releaseSlot(): void {
    this.state.activeTasks = Math.max(0, this.state.activeTasks - 1);

    // Try to wake up waiting tasks
    if (this.taskQueue.length > 0) {
      const next = this.taskQueue[0];
      const check = this.canExecute(next.task);
      if (check.canRun) {
        this.taskQueue.shift();
        this.state.activeTasks++;
        next.resolve();
      }
    }
  }

  /**
   * Record API call for quota tracking
   */
  recordApiCall(tokensUsed: number = 1): void {
    this.state.apiQuotaRemaining = Math.max(0, this.state.apiQuotaRemaining - tokensUsed);
    this.state.lastApiCall = new Date();
  }

  /**
   * Reset quota (called periodically or after reset time)
   */
  resetQuota(): void {
    this.state.apiQuotaRemaining = this.state.apiQuotaLimit;
    this.state.rateLimitResetTime = undefined;
  }

  /**
   * Set rate limit reset time
   */
  setRateLimitResetTime(resetTime: Date): void {
    this.state.rateLimitResetTime = resetTime;
  }

  /**
   * Get scheduling recommendation
   */
  getRecommendation(): SchedulingRecommendation {
    const quotaPercent = this.state.apiQuotaRemaining / this.state.apiQuotaLimit;

    if (quotaPercent < 0.1) {
      return {
        recommendedConcurrency: 2,
        shouldPause: true,
        reason: 'API quota critically low',
      };
    }

    if (quotaPercent < 0.3) {
      return {
        recommendedConcurrency: 4,
        shouldPause: false,
        reason: 'API quota low, reducing concurrency',
      };
    }

    return {
      recommendedConcurrency: this.state.maxConcurrentTasks,
      shouldPause: false,
      reason: 'Resources healthy',
    };
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.taskQueue.length;
  }

  /**
   * Clear queue
   */
  clearQueue(): void {
    this.taskQueue = [];
  }

  /**
   * Set max concurrent tasks
   */
  setMaxConcurrentTasks(max: number): void {
    this.state.maxConcurrentTasks = max;
  }

  /**
   * Set API quota limit
   */
  setApiQuotaLimit(limit: number): void {
    this.state.apiQuotaLimit = limit;
    if (this.state.apiQuotaRemaining > limit) {
      this.state.apiQuotaRemaining = limit;
    }
  }

  /**
   * Get memory usage in MB
   */
  getCurrentMemoryUsageMB(): number {
    return process.memoryUsage().heapUsed / 1024 / 1024;
  }

  /**
   * Check if system is under pressure
   */
  isUnderPressure(): boolean {
    const memoryUsage = this.getCurrentMemoryUsageMB();
    const quotaPercent = this.state.apiQuotaRemaining / this.state.apiQuotaLimit;

    return (
      memoryUsage > 400 ||
      quotaPercent < 0.2 ||
      this.state.activeTasks >= this.state.maxConcurrentTasks
    );
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const resourceScheduler = new ResourceScheduler();

// Export class for testing purposes
export { ResourceScheduler };

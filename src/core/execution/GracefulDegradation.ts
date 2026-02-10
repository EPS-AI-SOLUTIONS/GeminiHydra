/**
 * GracefulDegradation - Feature #18 from ExecutionEngine
 *
 * Handles graceful degradation when system is under stress,
 * automatically switching between operation modes based on
 * failure patterns and success rates.
 */

import chalk from 'chalk';
import { ErrorType } from './AdaptiveRetry.js';

// =============================================================================
// TYPES
// =============================================================================

export type DegradationLevelName = 'full' | 'reduced' | 'minimal' | 'offline';

export interface DegradationLevel {
  level: DegradationLevelName;
  features: string[];
  fallbackModel: string;
  maxConcurrency: number;
}

export interface DegradationStatus {
  level: DegradationLevelName;
  failureCount: number;
  lastFailure: Date | null;
  recoveryAttempts: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const DEGRADATION_LEVELS: Record<DegradationLevelName, DegradationLevel> = {
  full: {
    level: 'full',
    features: ['all'],
    fallbackModel: 'gemini-3-pro-preview',
    maxConcurrency: 12
  },
  reduced: {
    level: 'reduced',
    features: ['basic', 'mcp', 'ollama'],
    fallbackModel: 'gemini-3-pro-preview',
    maxConcurrency: 6
  },
  minimal: {
    level: 'minimal',
    features: ['basic', 'ollama'],
    fallbackModel: 'gemini-3-pro-preview',
    maxConcurrency: 3
  },
  offline: {
    level: 'offline',
    features: ['ollama'],
    fallbackModel: 'qwen3:4b',
    maxConcurrency: 2
  }
};

// =============================================================================
// GRACEFUL DEGRADATION MANAGER CLASS
// =============================================================================

class GracefulDegradationManager {
  private currentLevel: DegradationLevelName = 'full';
  private failureCount: number = 0;
  private lastFailure: Date | null = null;
  private recoveryAttempts: number = 0;

  /**
   * Record failure
   */
  recordFailure(errorType: ErrorType): void {
    this.failureCount++;
    this.lastFailure = new Date();

    // Degrade based on failure patterns
    if (errorType === 'rate_limit' && this.failureCount >= 3) {
      this.degrade();
    } else if (errorType === 'network' && this.failureCount >= 5) {
      this.degrade();
    } else if (this.failureCount >= 10) {
      this.degrade();
    }
  }

  /**
   * Record success (for recovery)
   */
  recordSuccess(): void {
    this.recoveryAttempts++;

    // Try to recover after consistent success
    if (this.recoveryAttempts >= 5 && this.currentLevel !== 'full') {
      this.upgrade();
    }
  }

  /**
   * Degrade to lower level
   */
  private degrade(): void {
    const levels: DegradationLevelName[] = ['full', 'reduced', 'minimal', 'offline'];
    const currentIdx = levels.indexOf(this.currentLevel);

    if (currentIdx < levels.length - 1) {
      this.currentLevel = levels[currentIdx + 1];
      this.failureCount = 0;
      this.recoveryAttempts = 0;

      console.log(chalk.yellow(`[Degradation] Degraded to ${this.currentLevel} mode`));
    }
  }

  /**
   * Upgrade to higher level
   */
  private upgrade(): void {
    const levels: DegradationLevelName[] = ['full', 'reduced', 'minimal', 'offline'];
    const currentIdx = levels.indexOf(this.currentLevel);

    if (currentIdx > 0) {
      this.currentLevel = levels[currentIdx - 1];
      this.recoveryAttempts = 0;

      console.log(chalk.green(`[Degradation] Upgraded to ${this.currentLevel} mode`));
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): DegradationLevel {
    return DEGRADATION_LEVELS[this.currentLevel];
  }

  /**
   * Check if feature is available
   */
  isFeatureAvailable(feature: string): boolean {
    const config = this.getConfig();
    return config.features.includes('all') || config.features.includes(feature);
  }

  /**
   * Force set level (for testing or manual override)
   */
  setLevel(level: DegradationLevelName): void {
    this.currentLevel = level;
    this.failureCount = 0;
    this.recoveryAttempts = 0;
    console.log(chalk.cyan(`[Degradation] Manually set to ${level} mode`));
  }

  /**
   * Get status
   */
  getStatus(): DegradationStatus {
    return {
      level: this.currentLevel,
      failureCount: this.failureCount,
      lastFailure: this.lastFailure,
      recoveryAttempts: this.recoveryAttempts
    };
  }

  /**
   * Get current level
   */
  getCurrentLevel(): DegradationLevelName {
    return this.currentLevel;
  }

  /**
   * Get current fallback model
   */
  getFallbackModel(): string {
    return this.getConfig().fallbackModel;
  }

  /**
   * Get current max concurrency
   */
  getMaxConcurrency(): number {
    return this.getConfig().maxConcurrency;
  }

  /**
   * Reset to full mode
   */
  reset(): void {
    this.currentLevel = 'full';
    this.failureCount = 0;
    this.lastFailure = null;
    this.recoveryAttempts = 0;
    console.log(chalk.green(`[Degradation] Reset to full mode`));
  }

  /**
   * Check if system is degraded
   */
  isDegraded(): boolean {
    return this.currentLevel !== 'full';
  }

  /**
   * Check if system is offline
   */
  isOffline(): boolean {
    return this.currentLevel === 'offline';
  }

  /**
   * Get available features
   */
  getAvailableFeatures(): string[] {
    return this.getConfig().features;
  }

  /**
   * Force degrade (for testing)
   */
  forceDegrade(): void {
    this.failureCount = 10;
    this.degrade();
  }

  /**
   * Force upgrade (for testing)
   */
  forceUpgrade(): void {
    this.recoveryAttempts = 5;
    this.upgrade();
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const degradationManager = new GracefulDegradationManager();

// Export class for testing purposes
export { GracefulDegradationManager };

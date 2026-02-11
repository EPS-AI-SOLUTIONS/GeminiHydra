/**
 * AgentReputationTracker - Solution 39: Agent Reputation Tracking
 *
 * Tracks agent reliability based on historical performance metrics.
 * Provides reputation-based weighting for consensus algorithms and agent selection.
 *
 * Key Features:
 * - Records performance metrics per agent/task
 * - Computes reliability tiers: trusted, neutral, suspect, unreliable
 * - Tracks performance trends: improving, stable, declining
 * - Time-decay for old performance data
 * - Exports reputation weights for Swarm consensus
 *
 * @module AgentReputationTracker
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

// AgentRole type is available for reference but we use string IDs for flexibility
// import { AgentRole } from '../types/index.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Performance metrics for a single task execution
 */
export interface PerformanceMetrics {
  /** Whether the task completed successfully */
  success: boolean;
  /** Hallucination score from HallucinationDetector (0-100, lower is better) */
  hallucinationScore: number;
  /** Accuracy score based on validation (0-100, higher is better) */
  accuracyScore: number;
  /** Response time in milliseconds */
  responseTime: number;
  /** Whether output passed final validation */
  validationPassed: boolean;
  /** Optional: specific error type if failed */
  errorType?: string;
  /** Optional: task complexity (simple, medium, complex, critical) */
  taskComplexity?: 'simple' | 'medium' | 'complex' | 'critical';
}

/**
 * Complete reputation profile for an agent
 */
export interface AgentReputation {
  /** Agent identifier */
  agentId: string;
  /** Total number of tasks performed */
  totalTasks: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Average hallucination score (0-100, lower is better) */
  avgHallucinationScore: number;
  /** Average accuracy score (0-100, higher is better) */
  avgAccuracyScore: number;
  /** Average response time in milliseconds */
  avgResponseTime: number;
  /** Validation pass rate (0-1) */
  validationPassRate: number;
  /** Reliability tier based on overall performance */
  reliabilityTier: ReliabilityTier;
  /** Performance trend over time */
  trend: PerformanceTrend;
  /** Confidence weight for consensus (0.1-2.0) */
  consensusWeight: number;
  /** Last updated timestamp */
  lastUpdated: number;
  /** Recent performance window (last N tasks) */
  recentPerformance: {
    successRate: number;
    avgHallucinationScore: number;
    windowSize: number;
  };
}

/**
 * Reliability tier categories
 */
export type ReliabilityTier = 'trusted' | 'neutral' | 'suspect' | 'unreliable';

/**
 * Performance trend indicators
 */
export type PerformanceTrend = 'improving' | 'stable' | 'declining';

/**
 * Single performance record with timestamp for decay
 */
interface PerformanceRecord {
  taskId: number;
  timestamp: number;
  metrics: PerformanceMetrics;
  /** Decay weight (1.0 = fresh, approaches 0 = old) */
  weight: number;
}

/**
 * Configuration for the reputation tracker
 */
export interface ReputationTrackerConfig {
  /** Path to persist reputation data */
  persistPath?: string;
  /** Half-life for decay in milliseconds (default: 7 days) */
  decayHalfLifeMs?: number;
  /** Minimum tasks required for reliable reputation */
  minTasksForReliability?: number;
  /** Window size for recent performance calculation */
  recentWindowSize?: number;
  /** Auto-save interval in milliseconds (0 = disabled) */
  autoSaveIntervalMs?: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_CONFIG: Required<ReputationTrackerConfig> = {
  persistPath: './.gemini-hydra/reputation-data.json',
  decayHalfLifeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  minTasksForReliability: 5,
  recentWindowSize: 10,
  autoSaveIntervalMs: 60000, // 1 minute
};

/**
 * Tier thresholds based on composite score (0-100)
 */
const TIER_THRESHOLDS = {
  trusted: 80, // Score >= 80
  neutral: 50, // Score 50-79
  suspect: 25, // Score 25-49
  unreliable: 0, // Score < 25
};

/**
 * Consensus weight multipliers by tier
 */
const TIER_WEIGHTS: Record<ReliabilityTier, number> = {
  trusted: 1.5, // Trusted agents get 50% more weight
  neutral: 1.0, // Neutral agents get standard weight
  suspect: 0.5, // Suspect agents get 50% less weight
  unreliable: 0.2, // Unreliable agents barely count
};

/**
 * Trend detection thresholds (difference between recent and overall)
 */
const TREND_THRESHOLDS = {
  improving: 10, // Recent > Overall by 10+ points
  declining: -10, // Recent < Overall by 10+ points
};

// =============================================================================
// AGENT REPUTATION TRACKER CLASS
// =============================================================================

/**
 * Tracks and manages agent reputation based on historical performance
 */
export class AgentReputationTracker {
  private config: Required<ReputationTrackerConfig>;
  private records: Map<string, PerformanceRecord[]> = new Map();
  private reputationCache: Map<string, AgentReputation> = new Map();
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private dirty: boolean = false;

  constructor(config: ReputationTrackerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Start auto-save if configured
    if (this.config.autoSaveIntervalMs > 0) {
      this.autoSaveTimer = setInterval(() => this.saveIfDirty(), this.config.autoSaveIntervalMs);
    }
  }

  // ---------------------------------------------------------------------------
  // CORE METHODS
  // ---------------------------------------------------------------------------

  /**
   * Record performance metrics for a task execution
   *
   * @param agentId - Agent identifier (e.g., 'geralt', 'yennefer')
   * @param taskId - Unique task identifier
   * @param metrics - Performance metrics for the task
   */
  recordPerformance(agentId: string, taskId: number, metrics: PerformanceMetrics): void {
    const normalizedId = agentId.toLowerCase();

    // Initialize records array if needed
    if (!this.records.has(normalizedId)) {
      this.records.set(normalizedId, []);
    }

    const record: PerformanceRecord = {
      taskId,
      timestamp: Date.now(),
      metrics,
      weight: 1.0, // Fresh record, full weight
    };

    this.records.get(normalizedId)?.push(record);

    // Invalidate cache for this agent
    this.reputationCache.delete(normalizedId);
    this.dirty = true;

    // Log recording
    const emoji = metrics.success ? '✅' : '❌';
    console.log(
      chalk.gray(
        `[ReputationTracker] ${emoji} Recorded: ${normalizedId} task #${taskId} ` +
          `(hall: ${metrics.hallucinationScore}, acc: ${metrics.accuracyScore})`,
      ),
    );
  }

  /**
   * Get comprehensive reputation for an agent
   *
   * @param agentId - Agent identifier
   * @returns Complete reputation profile
   */
  getReputation(agentId: string): AgentReputation {
    const normalizedId = agentId.toLowerCase();

    // Check cache first
    const cached = this.reputationCache.get(normalizedId);
    if (cached) {
      return cached;
    }

    // Calculate reputation
    const reputation = this.calculateReputation(normalizedId);

    // Cache result
    this.reputationCache.set(normalizedId, reputation);

    return reputation;
  }

  /**
   * Get consensus weight for an agent (for use in multi-agent voting)
   *
   * @param agentId - Agent identifier
   * @returns Weight multiplier (0.1-2.0)
   */
  getConsensusWeight(agentId: string): number {
    const reputation = this.getReputation(agentId);
    return reputation.consensusWeight;
  }

  /**
   * Get all agents sorted by reputation score
   *
   * @returns Array of agent reputations, best first
   */
  getRankedAgents(): AgentReputation[] {
    const allAgents = Array.from(this.records.keys());
    const reputations = allAgents.map((id) => this.getReputation(id));

    // Sort by composite score (derived from tier and success rate)
    return reputations.sort((a, b) => {
      const scoreA = this.computeCompositeScore(a);
      const scoreB = this.computeCompositeScore(b);
      return scoreB - scoreA;
    });
  }

  /**
   * Get agents by reliability tier
   *
   * @param tier - Target reliability tier
   * @returns Array of agent IDs in that tier
   */
  getAgentsByTier(tier: ReliabilityTier): string[] {
    return Array.from(this.records.keys()).filter(
      (id) => this.getReputation(id).reliabilityTier === tier,
    );
  }

  /**
   * Select best agent for a task based on reputation
   *
   * @param candidates - List of candidate agent IDs
   * @param preferFresh - If true, slightly prefer less-used agents for diversity
   * @returns Best agent ID or null if none available
   */
  selectBestAgent(candidates: string[], preferFresh: boolean = false): string | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const scored = candidates.map((id) => {
      const rep = this.getReputation(id);
      let score = this.computeCompositeScore(rep);

      // Slight bonus for improving agents
      if (rep.trend === 'improving') {
        score *= 1.05;
      }

      // Diversity bonus for fresh agents
      if (preferFresh && rep.totalTasks < this.config.minTasksForReliability) {
        score *= 1.1;
      }

      return { id, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].id;
  }

  // ---------------------------------------------------------------------------
  // DECAY MANAGEMENT
  // ---------------------------------------------------------------------------

  /**
   * Apply time decay to all records
   * Should be called periodically to update weights
   */
  applyDecay(): void {
    const now = Date.now();
    const halfLife = this.config.decayHalfLifeMs;
    let decayedCount = 0;

    for (const [agentId, records] of this.records) {
      for (const record of records) {
        const age = now - record.timestamp;
        // Exponential decay: weight = 0.5^(age/halfLife)
        const newWeight = 0.5 ** (age / halfLife);

        if (Math.abs(record.weight - newWeight) > 0.01) {
          record.weight = newWeight;
          decayedCount++;
        }
      }

      // Invalidate cache after decay
      this.reputationCache.delete(agentId);
    }

    if (decayedCount > 0) {
      this.dirty = true;
      console.log(chalk.gray(`[ReputationTracker] Applied decay to ${decayedCount} records`));
    }
  }

  /**
   * Prune very old records (weight < 0.01)
   *
   * @returns Number of records pruned
   */
  pruneOldRecords(): number {
    let prunedCount = 0;

    for (const [agentId, records] of this.records) {
      const before = records.length;
      const filtered = records.filter((r) => r.weight >= 0.01);

      if (filtered.length < before) {
        this.records.set(agentId, filtered);
        prunedCount += before - filtered.length;
        this.reputationCache.delete(agentId);
      }
    }

    if (prunedCount > 0) {
      this.dirty = true;
      console.log(chalk.yellow(`[ReputationTracker] Pruned ${prunedCount} old records`));
    }

    return prunedCount;
  }

  // ---------------------------------------------------------------------------
  // PERSISTENCE
  // ---------------------------------------------------------------------------

  /**
   * Load reputation data from disk
   */
  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.config.persistPath, 'utf-8');
      const parsed = JSON.parse(data);

      // Reconstruct Map from serialized data
      this.records = new Map(
        Object.entries(parsed.records || {}).map(([k, v]) => [k, v as PerformanceRecord[]]),
      );

      // Apply decay to loaded data
      this.applyDecay();

      console.log(chalk.green(`[ReputationTracker] Loaded ${this.records.size} agent profiles`));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') {
        console.log(chalk.yellow(`[ReputationTracker] Load warning: ${msg}`));
      }
      // Start fresh if file doesn't exist
    }
  }

  /**
   * Save reputation data to disk
   */
  async save(): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.config.persistPath);
      await fs.mkdir(dir, { recursive: true });

      // Serialize Map to object
      const serialized = {
        version: 1,
        savedAt: Date.now(),
        records: Object.fromEntries(this.records),
      };

      await fs.writeFile(this.config.persistPath, JSON.stringify(serialized, null, 2), 'utf-8');

      this.dirty = false;
      console.log(chalk.gray(`[ReputationTracker] Saved ${this.records.size} agent profiles`));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`[ReputationTracker] Save error: ${msg}`));
    }
  }

  /**
   * Save only if there are unsaved changes
   */
  private async saveIfDirty(): Promise<void> {
    if (this.dirty) {
      await this.save();
    }
  }

  /**
   * Cleanup resources (call on shutdown)
   */
  async shutdown(): Promise<void> {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    await this.saveIfDirty();
  }

  // ---------------------------------------------------------------------------
  // INTERNAL CALCULATION METHODS
  // ---------------------------------------------------------------------------

  /**
   * Calculate full reputation for an agent
   */
  private calculateReputation(agentId: string): AgentReputation {
    const records = this.records.get(agentId) || [];

    // Default reputation for new/unknown agents
    if (records.length === 0) {
      return this.createDefaultReputation(agentId);
    }

    // Calculate weighted metrics
    const weightedMetrics = this.calculateWeightedMetrics(records);
    const recentMetrics = this.calculateRecentMetrics(records);

    // Determine tier and trend
    const compositeScore = this.calculateCompositeScoreFromMetrics(weightedMetrics);
    const reliabilityTier = this.determineTier(compositeScore);
    const trend = this.determineTrend(weightedMetrics, recentMetrics);

    // Calculate consensus weight
    const consensusWeight = this.calculateConsensusWeight(reliabilityTier, records.length, trend);

    return {
      agentId,
      totalTasks: records.length,
      successRate: weightedMetrics.successRate,
      avgHallucinationScore: weightedMetrics.avgHallucinationScore,
      avgAccuracyScore: weightedMetrics.avgAccuracyScore,
      avgResponseTime: weightedMetrics.avgResponseTime,
      validationPassRate: weightedMetrics.validationPassRate,
      reliabilityTier,
      trend,
      consensusWeight,
      lastUpdated: Math.max(...records.map((r) => r.timestamp)),
      recentPerformance: {
        successRate: recentMetrics.successRate,
        avgHallucinationScore: recentMetrics.avgHallucinationScore,
        windowSize: Math.min(records.length, this.config.recentWindowSize),
      },
    };
  }

  /**
   * Calculate weighted metrics from records
   */
  private calculateWeightedMetrics(records: PerformanceRecord[]): {
    successRate: number;
    avgHallucinationScore: number;
    avgAccuracyScore: number;
    avgResponseTime: number;
    validationPassRate: number;
  } {
    let totalWeight = 0;
    let weightedSuccess = 0;
    let weightedHallucination = 0;
    let weightedAccuracy = 0;
    let weightedResponseTime = 0;
    let weightedValidation = 0;

    for (const record of records) {
      const w = record.weight;
      totalWeight += w;

      weightedSuccess += w * (record.metrics.success ? 1 : 0);
      weightedHallucination += w * record.metrics.hallucinationScore;
      weightedAccuracy += w * record.metrics.accuracyScore;
      weightedResponseTime += w * record.metrics.responseTime;
      weightedValidation += w * (record.metrics.validationPassed ? 1 : 0);
    }

    if (totalWeight === 0) {
      return {
        successRate: 0.5,
        avgHallucinationScore: 50,
        avgAccuracyScore: 50,
        avgResponseTime: 1000,
        validationPassRate: 0.5,
      };
    }

    return {
      successRate: weightedSuccess / totalWeight,
      avgHallucinationScore: weightedHallucination / totalWeight,
      avgAccuracyScore: weightedAccuracy / totalWeight,
      avgResponseTime: weightedResponseTime / totalWeight,
      validationPassRate: weightedValidation / totalWeight,
    };
  }

  /**
   * Calculate metrics for recent tasks only
   */
  private calculateRecentMetrics(records: PerformanceRecord[]): {
    successRate: number;
    avgHallucinationScore: number;
  } {
    const windowSize = this.config.recentWindowSize;
    const recent = records
      .slice(-windowSize) // Get last N records
      .filter((r) => r.weight > 0.1); // Only reasonably fresh ones

    if (recent.length === 0) {
      return { successRate: 0.5, avgHallucinationScore: 50 };
    }

    const successCount = recent.filter((r) => r.metrics.success).length;
    const avgHallucination =
      recent.reduce((sum, r) => sum + r.metrics.hallucinationScore, 0) / recent.length;

    return {
      successRate: successCount / recent.length,
      avgHallucinationScore: avgHallucination,
    };
  }

  /**
   * Calculate composite score from metrics (0-100)
   */
  private calculateCompositeScoreFromMetrics(metrics: {
    successRate: number;
    avgHallucinationScore: number;
    avgAccuracyScore: number;
    validationPassRate: number;
  }): number {
    // Weights for different factors
    const weights = {
      success: 0.3,
      hallucination: 0.3,
      accuracy: 0.25,
      validation: 0.15,
    };

    // Convert hallucination score (lower is better) to positive metric
    const hallucinationGood = 100 - metrics.avgHallucinationScore;

    const score =
      metrics.successRate * 100 * weights.success +
      hallucinationGood * weights.hallucination +
      metrics.avgAccuracyScore * weights.accuracy +
      metrics.validationPassRate * 100 * weights.validation;

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Compute composite score from reputation (for sorting)
   */
  private computeCompositeScore(rep: AgentReputation): number {
    return this.calculateCompositeScoreFromMetrics({
      successRate: rep.successRate,
      avgHallucinationScore: rep.avgHallucinationScore,
      avgAccuracyScore: rep.avgAccuracyScore,
      validationPassRate: rep.validationPassRate,
    });
  }

  /**
   * Determine reliability tier from composite score
   */
  private determineTier(compositeScore: number): ReliabilityTier {
    if (compositeScore >= TIER_THRESHOLDS.trusted) return 'trusted';
    if (compositeScore >= TIER_THRESHOLDS.neutral) return 'neutral';
    if (compositeScore >= TIER_THRESHOLDS.suspect) return 'suspect';
    return 'unreliable';
  }

  /**
   * Determine performance trend
   */
  private determineTrend(
    overall: { successRate: number; avgHallucinationScore: number },
    recent: { successRate: number; avgHallucinationScore: number },
  ): PerformanceTrend {
    // Compare recent vs overall (higher success rate, lower hallucination is better)
    const overallScore = overall.successRate * 100 - overall.avgHallucinationScore;
    const recentScore = recent.successRate * 100 - recent.avgHallucinationScore;
    const diff = recentScore - overallScore;

    if (diff >= TREND_THRESHOLDS.improving) return 'improving';
    if (diff <= TREND_THRESHOLDS.declining) return 'declining';
    return 'stable';
  }

  /**
   * Calculate consensus weight for multi-agent voting
   */
  private calculateConsensusWeight(
    tier: ReliabilityTier,
    taskCount: number,
    trend: PerformanceTrend,
  ): number {
    let weight = TIER_WEIGHTS[tier];

    // Confidence adjustment based on sample size
    if (taskCount < this.config.minTasksForReliability) {
      // New agents get neutral weight until proven
      weight = Math.min(weight, 1.0);
      // Apply uncertainty penalty
      weight *= 0.5 + (0.5 * taskCount) / this.config.minTasksForReliability;
    }

    // Trend adjustment
    if (trend === 'improving') {
      weight *= 1.1; // 10% bonus for improving
    } else if (trend === 'declining') {
      weight *= 0.9; // 10% penalty for declining
    }

    // Clamp to valid range
    return Math.max(0.1, Math.min(2.0, weight));
  }

  /**
   * Create default reputation for unknown agent
   */
  private createDefaultReputation(agentId: string): AgentReputation {
    return {
      agentId,
      totalTasks: 0,
      successRate: 0.5, // Neutral assumption
      avgHallucinationScore: 50,
      avgAccuracyScore: 50,
      avgResponseTime: 1000,
      validationPassRate: 0.5,
      reliabilityTier: 'neutral',
      trend: 'stable',
      consensusWeight: 0.75, // Slightly below neutral for unknown
      lastUpdated: Date.now(),
      recentPerformance: {
        successRate: 0.5,
        avgHallucinationScore: 50,
        windowSize: 0,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // STATISTICS & REPORTING
  // ---------------------------------------------------------------------------

  /**
   * Get summary statistics across all agents
   */
  getStats(): {
    totalAgents: number;
    totalRecords: number;
    tierDistribution: Record<ReliabilityTier, number>;
    avgSuccessRate: number;
    avgHallucinationScore: number;
  } {
    const agents = Array.from(this.records.keys());
    const reputations = agents.map((id) => this.getReputation(id));

    const tierDistribution: Record<ReliabilityTier, number> = {
      trusted: 0,
      neutral: 0,
      suspect: 0,
      unreliable: 0,
    };

    let totalSuccess = 0;
    let totalHallucination = 0;

    for (const rep of reputations) {
      tierDistribution[rep.reliabilityTier]++;
      totalSuccess += rep.successRate;
      totalHallucination += rep.avgHallucinationScore;
    }

    const totalRecords = Array.from(this.records.values()).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );

    return {
      totalAgents: agents.length,
      totalRecords,
      tierDistribution,
      avgSuccessRate: agents.length > 0 ? totalSuccess / agents.length : 0,
      avgHallucinationScore: agents.length > 0 ? totalHallucination / agents.length : 50,
    };
  }

  /**
   * Generate human-readable report
   */
  generateReport(): string {
    const stats = this.getStats();
    const ranked = this.getRankedAgents();

    let report = `
╔════════════════════════════════════════════════════════════════╗
║           AGENT REPUTATION TRACKER - SUMMARY REPORT            ║
╚════════════════════════════════════════════════════════════════╝

📊 OVERALL STATISTICS
   Total Agents: ${stats.totalAgents}
   Total Records: ${stats.totalRecords}
   Average Success Rate: ${(stats.avgSuccessRate * 100).toFixed(1)}%
   Average Hallucination Score: ${stats.avgHallucinationScore.toFixed(1)}

📈 TIER DISTRIBUTION
   🟢 Trusted:    ${stats.tierDistribution.trusted}
   🟡 Neutral:    ${stats.tierDistribution.neutral}
   🟠 Suspect:    ${stats.tierDistribution.suspect}
   🔴 Unreliable: ${stats.tierDistribution.unreliable}

🏆 AGENT RANKINGS (Best → Worst)
`;

    for (let i = 0; i < ranked.length; i++) {
      const rep = ranked[i];
      const tierEmoji = {
        trusted: '🟢',
        neutral: '🟡',
        suspect: '🟠',
        unreliable: '🔴',
      }[rep.reliabilityTier];

      const trendEmoji = {
        improving: '📈',
        stable: '➡️',
        declining: '📉',
      }[rep.trend];

      report += `   ${i + 1}. ${tierEmoji} ${rep.agentId.padEnd(12)} | `;
      report += `Tasks: ${String(rep.totalTasks).padStart(3)} | `;
      report += `Success: ${(rep.successRate * 100).toFixed(0).padStart(3)}% | `;
      report += `Hall: ${rep.avgHallucinationScore.toFixed(0).padStart(2)} | `;
      report += `Weight: ${rep.consensusWeight.toFixed(2)} | `;
      report += `${trendEmoji} ${rep.trend}\n`;
    }

    report += `
════════════════════════════════════════════════════════════════
Generated: ${new Date().toISOString()}
`;

    return report;
  }

  /**
   * Clear all reputation data (for testing)
   */
  clear(): void {
    this.records.clear();
    this.reputationCache.clear();
    this.dirty = false;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/** Global singleton instance */
let instance: AgentReputationTracker | null = null;

/**
 * Get or create the global AgentReputationTracker instance
 */
export function getAgentReputationTracker(
  config?: ReputationTrackerConfig,
): AgentReputationTracker {
  if (!instance) {
    instance = new AgentReputationTracker(config);
  }
  return instance;
}

/**
 * Initialize the global tracker (call once at startup)
 */
export async function initializeReputationTracker(
  config?: ReputationTrackerConfig,
): Promise<AgentReputationTracker> {
  const tracker = getAgentReputationTracker(config);
  await tracker.load();
  return tracker;
}

/**
 * Get the singleton instance (assumes already initialized)
 */
export function reputationTracker(): AgentReputationTracker {
  if (!instance) {
    instance = new AgentReputationTracker();
  }
  return instance;
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick record performance (uses singleton)
 */
export function recordAgentPerformance(
  agentId: string,
  taskId: number,
  metrics: PerformanceMetrics,
): void {
  reputationTracker().recordPerformance(agentId, taskId, metrics);
}

/**
 * Quick get reputation (uses singleton)
 */
export function getAgentReputation(agentId: string): AgentReputation {
  return reputationTracker().getReputation(agentId);
}

/**
 * Quick get consensus weight (uses singleton)
 */
export function getAgentConsensusWeight(agentId: string): number {
  return reputationTracker().getConsensusWeight(agentId);
}

/**
 * Quick select best agent (uses singleton)
 */
export function selectBestAgentByReputation(
  candidates: string[],
  preferFresh?: boolean,
): string | null {
  return reputationTracker().selectBestAgent(candidates, preferFresh);
}

/**
 * Check if agent is in trusted tier (uses singleton)
 */
export function isAgentTrusted(agentId: string): boolean {
  return reputationTracker().getReputation(agentId).reliabilityTier === 'trusted';
}

/**
 * Check if agent should be avoided (unreliable tier)
 */
export function shouldAvoidAgent(agentId: string): boolean {
  return reputationTracker().getReputation(agentId).reliabilityTier === 'unreliable';
}

// =============================================================================
// EXPORTS
// =============================================================================

export { AgentReputationTracker as default, TIER_THRESHOLDS, TIER_WEIGHTS, TREND_THRESHOLDS };

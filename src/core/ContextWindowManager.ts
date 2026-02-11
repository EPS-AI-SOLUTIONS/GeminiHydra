/**
 * ContextWindowManager - Solution #43
 * Manages context window size to prevent overflow and ensure relevant context.
 *
 * Features:
 * - Priority-based context management
 * - Source tracking (agent, task, system)
 * - Token estimation (~4 chars per token)
 * - Intelligent pruning of older, low-priority content
 * - Overflow risk detection
 *
 * For use with Swarm.ts and other orchestration components.
 */

import chalk from 'chalk';

// ============================================================
// Types & Interfaces
// ============================================================

/**
 * Represents a single entry in the context window
 */
export interface ContextEntry {
  /** The actual content text */
  content: string;
  /** Priority level (0-10, higher stays longer) */
  priority: number;
  /** Source identifier (agent, task, system, user, etc.) */
  source: string;
  /** Estimated token count */
  tokens: number;
  /** Unix timestamp when added */
  timestamp: number;
  /** Optional unique identifier */
  id?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Statistics about the current context window state
 */
export interface ContextStats {
  /** Total estimated tokens in context */
  totalTokens: number;
  /** Token count by source */
  sources: Map<string, number>;
  /** Whether context is at risk of overflow */
  overflowRisk: boolean;
  /** Number of entries */
  entryCount: number;
  /** Average priority of entries */
  averagePriority: number;
  /** Oldest entry timestamp */
  oldestEntry: number | null;
  /** Newest entry timestamp */
  newestEntry: number | null;
}

/**
 * Configuration options for the ContextWindowManager
 */
export interface ContextWindowConfig {
  /** Maximum tokens before overflow warning (default: 100000) */
  maxTokens: number;
  /** Warning threshold as percentage (default: 0.8 = 80%) */
  warningThreshold: number;
  /** Critical threshold as percentage (default: 0.95 = 95%) */
  criticalThreshold: number;
  /** Minimum priority to always keep (default: 8) */
  minPriorityToKeep: number;
  /** Age in ms after which low-priority items can be pruned (default: 5 min) */
  pruneAgeThreshold: number;
  /** Enable verbose logging */
  verbose: boolean;
}

/**
 * Result from pruning operation
 */
export interface PruneResult {
  /** IDs or descriptions of pruned entries */
  prunedEntries: string[];
  /** Total tokens freed */
  tokensFreed: number;
  /** Remaining token count */
  remainingTokens: number;
  /** Whether target was achieved */
  targetAchieved: boolean;
}

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_CONFIG: ContextWindowConfig = {
  maxTokens: 100000, // 100K tokens max context
  warningThreshold: 0.8, // Warn at 80%
  criticalThreshold: 0.95, // Critical at 95%
  minPriorityToKeep: 8, // Always keep priority 8+
  pruneAgeThreshold: 5 * 60 * 1000, // 5 minutes
  verbose: false,
};

// ============================================================
// ContextWindowManager Class
// ============================================================

/**
 * ContextWindowManager - Manages context window to prevent overflow
 *
 * @example
 * ```typescript
 * const cwm = new ContextWindowManager({ maxTokens: 50000 });
 *
 * // Add context entries
 * cwm.addToContext("System prompt...", 10, "system");
 * cwm.addToContext("User query...", 7, "user");
 * cwm.addToContext("Agent response...", 5, "agent");
 *
 * // Get optimal context for API call
 * const context = cwm.getOptimalContext(30000);
 *
 * // Check stats
 * const stats = cwm.getContextStats();
 * if (stats.overflowRisk) {
 *   cwm.pruneContext(stats.totalTokens * 0.5);
 * }
 * ```
 */
export class ContextWindowManager {
  private entries: ContextEntry[] = [];
  private config: ContextWindowConfig;
  private entryIdCounter: number = 0;

  constructor(config: Partial<ContextWindowConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================
  // Core Methods
  // ============================================================

  /**
   * Add content to the context window
   *
   * @param content - The text content to add
   * @param priority - Priority level 0-10 (higher = more important)
   * @param source - Source identifier (agent, task, system, user, etc.)
   * @param metadata - Optional metadata to attach
   */
  addToContext(
    content: string,
    priority: number,
    source: string,
    metadata?: Record<string, unknown>,
  ): void {
    // Validate inputs
    const normalizedPriority = Math.max(0, Math.min(10, priority));
    const tokens = this.estimateTokens(content);
    const id = `ctx_${++this.entryIdCounter}_${Date.now()}`;

    const entry: ContextEntry = {
      content,
      priority: normalizedPriority,
      source,
      tokens,
      timestamp: Date.now(),
      id,
      metadata,
    };

    this.entries.push(entry);

    if (this.config.verbose) {
      console.log(
        chalk.gray(
          `[ContextWindow] Added ${tokens} tokens from "${source}" (priority: ${normalizedPriority})`,
        ),
      );
    }

    // Check if we need automatic pruning
    const stats = this.getContextStats();
    if (stats.overflowRisk) {
      const targetTokens = Math.floor(this.config.maxTokens * 0.7);
      this.pruneContext(targetTokens);
    }
  }

  /**
   * Get optimal context string within token budget
   *
   * @param maxTokens - Maximum tokens to include
   * @returns Concatenated context string optimized for relevance
   */
  getOptimalContext(maxTokens: number): string {
    if (this.entries.length === 0) {
      return '';
    }

    // Score and sort entries
    const scored = this.entries.map((entry) => ({
      entry,
      score: this.calculateEntryScore(entry),
    }));

    // Sort by score (highest first)
    scored.sort((a, b) => b.score - a.score);

    // Build context within token limit
    const selected: ContextEntry[] = [];
    let currentTokens = 0;

    for (const { entry } of scored) {
      if (currentTokens + entry.tokens <= maxTokens) {
        selected.push(entry);
        currentTokens += entry.tokens;
      }
    }

    // Restore chronological order for coherent context
    selected.sort((a, b) => a.timestamp - b.timestamp);

    // Format context by source groups
    const formatted = this.formatContext(selected);

    if (this.config.verbose) {
      console.log(
        chalk.gray(
          `[ContextWindow] Built context: ${currentTokens}/${maxTokens} tokens from ${selected.length} entries`,
        ),
      );
    }

    return formatted;
  }

  /**
   * Prune context to reach target token count
   *
   * @param targetTokens - Target token count to achieve
   * @returns Information about pruned entries
   */
  pruneContext(targetTokens: number): PruneResult {
    const initialTokens = this.getTotalTokens();

    if (initialTokens <= targetTokens) {
      return {
        prunedEntries: [],
        tokensFreed: 0,
        remainingTokens: initialTokens,
        targetAchieved: true,
      };
    }

    const tokensToFree = initialTokens - targetTokens;
    const prunedEntries: string[] = [];
    let tokensFreed = 0;

    // Score entries (lower score = more likely to prune)
    const scored = this.entries.map((entry, index) => ({
      entry,
      index,
      score: this.calculateEntryScore(entry),
    }));

    // Sort by score (lowest first = prune first)
    scored.sort((a, b) => a.score - b.score);

    // Prune entries until we hit target
    const indicesToRemove: number[] = [];

    for (const { entry, index, score } of scored) {
      if (tokensFreed >= tokensToFree) {
        break;
      }

      // Don't prune high-priority entries unless absolutely necessary
      if (entry.priority >= this.config.minPriorityToKeep) {
        continue;
      }

      indicesToRemove.push(index);
      tokensFreed += entry.tokens;
      prunedEntries.push(
        `${entry.source}:${entry.id} (${entry.tokens} tokens, priority ${entry.priority})`,
      );

      if (this.config.verbose) {
        console.log(
          chalk.yellow(
            `[ContextWindow] Pruning: ${entry.source} - ${entry.tokens} tokens (score: ${score.toFixed(2)})`,
          ),
        );
      }
    }

    // Remove entries (in reverse order to maintain indices)
    indicesToRemove.sort((a, b) => b - a);
    for (const index of indicesToRemove) {
      this.entries.splice(index, 1);
    }

    const remainingTokens = this.getTotalTokens();
    const targetAchieved = remainingTokens <= targetTokens;

    console.log(
      chalk.gray(
        `[ContextWindow] Pruned ${prunedEntries.length} entries, freed ${tokensFreed} tokens ` +
          `(${initialTokens} -> ${remainingTokens})`,
      ),
    );

    return {
      prunedEntries,
      tokensFreed,
      remainingTokens,
      targetAchieved,
    };
  }

  /**
   * Get statistics about current context window state
   */
  getContextStats(): ContextStats {
    const sources = new Map<string, number>();
    let totalTokens = 0;
    let totalPriority = 0;
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;

    for (const entry of this.entries) {
      totalTokens += entry.tokens;
      totalPriority += entry.priority;

      // Track by source
      const currentSourceTokens = sources.get(entry.source) || 0;
      sources.set(entry.source, currentSourceTokens + entry.tokens);

      // Track timestamps
      if (oldestEntry === null || entry.timestamp < oldestEntry) {
        oldestEntry = entry.timestamp;
      }
      if (newestEntry === null || entry.timestamp > newestEntry) {
        newestEntry = entry.timestamp;
      }
    }

    const usageRatio = totalTokens / this.config.maxTokens;
    const overflowRisk = usageRatio >= this.config.warningThreshold;

    return {
      totalTokens,
      sources,
      overflowRisk,
      entryCount: this.entries.length,
      averagePriority: this.entries.length > 0 ? totalPriority / this.entries.length : 0,
      oldestEntry,
      newestEntry,
    };
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  /**
   * Estimate tokens for text content (~4 chars per token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate score for an entry (higher = more important to keep)
   */
  private calculateEntryScore(entry: ContextEntry): number {
    const now = Date.now();
    const ageMs = now - entry.timestamp;
    const ageMinutes = ageMs / (1000 * 60);

    // Priority component (0-50 points)
    const priorityScore = entry.priority * 5;

    // Recency component (0-30 points, decays over 30 minutes)
    const recencyScore = Math.max(0, 30 - ageMinutes);

    // Source importance (0-20 points)
    const sourceScore = this.getSourceImportance(entry.source);

    return priorityScore + recencyScore + sourceScore;
  }

  /**
   * Get importance score for a source type
   */
  private getSourceImportance(source: string): number {
    const sourceScores: Record<string, number> = {
      system: 20,
      error: 18,
      user: 15,
      task: 12,
      agent: 10,
      result: 8,
      debug: 3,
      log: 2,
    };

    return sourceScores[source.toLowerCase()] || 5;
  }

  /**
   * Format selected entries into coherent context string
   */
  private formatContext(entries: ContextEntry[]): string {
    if (entries.length === 0) {
      return '';
    }

    // Group by source for clarity
    const bySource = new Map<string, ContextEntry[]>();
    for (const entry of entries) {
      const existing = bySource.get(entry.source) || [];
      existing.push(entry);
      bySource.set(entry.source, existing);
    }

    // Format each group
    const sections: string[] = [];

    // System messages first
    if (bySource.has('system')) {
      const systemEntries = bySource.get('system');
      if (!systemEntries) return '';
      sections.push(systemEntries.map((e) => e.content).join('\n'));
      bySource.delete('system');
    }

    // Then chronological for everything else
    const remainingEntries = entries.filter((e) => e.source !== 'system');
    if (remainingEntries.length > 0) {
      sections.push(remainingEntries.map((e) => e.content).join('\n\n'));
    }

    return sections.join('\n\n---\n\n');
  }

  /**
   * Get total tokens in context
   */
  private getTotalTokens(): number {
    return this.entries.reduce((sum, entry) => sum + entry.tokens, 0);
  }

  // ============================================================
  // Public Utility Methods
  // ============================================================

  /**
   * Get all entries (for inspection)
   */
  getEntries(): readonly ContextEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries by source
   */
  getEntriesBySource(source: string): ContextEntry[] {
    return this.entries.filter((e) => e.source === source);
  }

  /**
   * Update priority of an entry
   */
  updatePriority(entryId: string, newPriority: number): boolean {
    const entry = this.entries.find((e) => e.id === entryId);
    if (entry) {
      entry.priority = Math.max(0, Math.min(10, newPriority));
      return true;
    }
    return false;
  }

  /**
   * Remove a specific entry by ID
   */
  removeEntry(entryId: string): boolean {
    const index = this.entries.findIndex((e) => e.id === entryId);
    if (index !== -1) {
      this.entries.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    const count = this.entries.length;
    const tokens = this.getTotalTokens();
    this.entries = [];
    console.log(chalk.gray(`[ContextWindow] Cleared ${count} entries (${tokens} tokens)`));
  }

  /**
   * Clear entries by source
   */
  clearBySource(source: string): number {
    const before = this.entries.length;
    this.entries = this.entries.filter((e) => e.source !== source);
    const removed = before - this.entries.length;
    if (this.config.verbose && removed > 0) {
      console.log(chalk.gray(`[ContextWindow] Cleared ${removed} entries from source "${source}"`));
    }
    return removed;
  }

  /**
   * Get configuration
   */
  getConfig(): ContextWindowConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ContextWindowConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if context is at critical level
   */
  isCritical(): boolean {
    const ratio = this.getTotalTokens() / this.config.maxTokens;
    return ratio >= this.config.criticalThreshold;
  }

  /**
   * Get usage percentage
   */
  getUsagePercentage(): number {
    return (this.getTotalTokens() / this.config.maxTokens) * 100;
  }

  /**
   * Format stats for display
   */
  formatStats(): string {
    const stats = this.getContextStats();
    const usage = this.getUsagePercentage();

    let statusColor = chalk.green;
    if (usage >= 95) {
      statusColor = chalk.red;
    } else if (usage >= 80) {
      statusColor = chalk.yellow;
    }

    const lines = [
      chalk.bold('Context Window Stats:'),
      `  Tokens: ${statusColor(`${stats.totalTokens.toLocaleString()} / ${this.config.maxTokens.toLocaleString()}`)} (${usage.toFixed(1)}%)`,
      `  Entries: ${stats.entryCount}`,
      `  Avg Priority: ${stats.averagePriority.toFixed(1)}`,
      `  Overflow Risk: ${stats.overflowRisk ? chalk.red('YES') : chalk.green('NO')}`,
      '',
      '  Sources:',
    ];

    for (const [source, tokens] of stats.sources) {
      lines.push(`    - ${source}: ${tokens.toLocaleString()} tokens`);
    }

    return lines.join('\n');
  }
}

// ============================================================
// Singleton Instance
// ============================================================

/**
 * Global context window manager instance
 */
export const contextWindowManager = new ContextWindowManager();

// ============================================================
// Exports
// ============================================================

export default ContextWindowManager;

/**
 * AutoCompact - Automatic Context Compaction & Summarization
 *
 * Monitors conversation context usage and automatically compacts
 * old/verbose context into concise summaries to prevent token overflow.
 *
 * Features:
 * - Real-time context monitoring with configurable thresholds
 * - AI-powered summarization of old conversation turns
 * - Multi-level compaction: light (merge), medium (summarize), aggressive (distill)
 * - Preservation of high-importance messages (system prompts, errors, recent)
 * - Integration with ConversationMemory, SessionMemory, ContextWindowManager
 * - Manual `/compact` command support
 * - Compaction statistics and history
 *
 * @module core/conversation/AutoCompact
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import { GEMINI_MODELS } from '../../config/models.config.js';
import type { ConversationTurn } from './ConversationMemory.js';

// ============================================================
// Types & Interfaces
// ============================================================

export type CompactionLevel = 'light' | 'medium' | 'aggressive';

export interface AutoCompactConfig {
  /** Enable automatic compaction (default: true) */
  enabled: boolean;
  /** Token threshold % to trigger auto-compact (default: 0.70 = 70%) */
  triggerThreshold: number;
  /** Target token usage % after compaction (default: 0.50 = 50%) */
  targetThreshold: number;
  /** Minimum age (ms) of messages eligible for compaction (default: 5 min) */
  minAgeMs: number;
  /** Minimum importance to always preserve (default: 0.8) */
  preserveImportanceAbove: number;
  /** Number of recent messages always preserved (default: 6) */
  preserveRecentCount: number;
  /** Check interval in ms (default: 30 seconds) */
  checkIntervalMs: number;
  /** Maximum tokens for a single summary (default: 300) */
  maxSummaryTokens: number;
  /** Maximum turns to summarize in one batch (default: 20) */
  maxBatchSize: number;
  /** Compaction level (default: 'medium') */
  defaultLevel: CompactionLevel;
  /** Enable verbose logging */
  verbose: boolean;
}

export interface CompactionResult {
  /** Compaction level used */
  level: CompactionLevel;
  /** Original token count */
  originalTokens: number;
  /** Token count after compaction */
  compactedTokens: number;
  /** Tokens saved */
  tokensSaved: number;
  /** Compression ratio (0-1, lower = more compression) */
  compressionRatio: number;
  /** Number of turns compacted */
  turnsCompacted: number;
  /** Number of turns preserved */
  turnsPreserved: number;
  /** Summary text generated */
  summary: string;
  /** Timestamp */
  timestamp: number;
  /** Duration in ms */
  durationMs: number;
}

export interface CompactionStats {
  /** Total compactions performed */
  totalCompactions: number;
  /** Total tokens saved across all compactions */
  totalTokensSaved: number;
  /** Average compression ratio */
  averageCompressionRatio: number;
  /** History of compaction results */
  history: CompactionResult[];
  /** Last compaction timestamp */
  lastCompactedAt: number | null;
}

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_CONFIG: AutoCompactConfig = {
  enabled: true,
  triggerThreshold: 0.7,
  targetThreshold: 0.5,
  minAgeMs: 5 * 60 * 1000, // 5 minutes
  preserveImportanceAbove: 0.8,
  preserveRecentCount: 6,
  checkIntervalMs: 30_000, // 30 seconds
  maxSummaryTokens: 300,
  maxBatchSize: 20,
  defaultLevel: 'medium',
  verbose: false,
};

// ============================================================
// AutoCompact Class
// ============================================================

export class AutoCompact {
  private config: AutoCompactConfig;
  private stats: CompactionStats;
  private checkInterval: NodeJS.Timeout | null = null;
  private isCompacting = false;
  private genAI: GoogleGenerativeAI | null = null;

  constructor(config: Partial<AutoCompactConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      totalCompactions: 0,
      totalTokensSaved: 0,
      averageCompressionRatio: 0,
      history: [],
      lastCompactedAt: null,
    };
  }

  // ============================================================
  // Lifecycle
  // ============================================================

  /**
   * Start automatic monitoring
   */
  start(): void {
    if (!this.config.enabled) return;
    if (this.checkInterval) return;

    // Lazy init Gemini client
    if (!this.genAI && process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }

    this.checkInterval = setInterval(() => {
      this.autoCheck().catch((err) => {
        if (this.config.verbose) {
          console.log(chalk.yellow(`[AutoCompact] Check failed: ${err.message}`));
        }
      });
    }, this.config.checkIntervalMs);

    if (this.config.verbose) {
      console.log(
        chalk.gray(
          `[AutoCompact] Started (check every ${this.config.checkIntervalMs / 1000}s, trigger at ${this.config.triggerThreshold * 100}%)`,
        ),
      );
    }
  }

  /**
   * Stop automatic monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.config.verbose) {
      console.log(chalk.gray('[AutoCompact] Stopped'));
    }
  }

  // ============================================================
  // Core Compaction
  // ============================================================

  /**
   * Automatic check - called periodically
   * Checks ConversationMemory and triggers compaction if needed
   */
  private async autoCheck(): Promise<void> {
    if (this.isCompacting) return;

    try {
      // Dynamic import to avoid circular deps
      const { conversationMemory } = await import('./ConversationMemory.js');
      const session = conversationMemory.getCurrentSession();
      if (!session || session.turns.length < 10) return;

      // Estimate current token usage
      const totalTokens = session.turns.reduce((sum, t) => sum + this.estimateTokens(t.content), 0);

      // Check against a reasonable context window (32K default for Gemini)
      const maxContextTokens = 32_000;
      const usage = totalTokens / maxContextTokens;

      if (usage >= this.config.triggerThreshold) {
        if (this.config.verbose) {
          console.log(
            chalk.yellow(
              `[AutoCompact] Usage at ${(usage * 100).toFixed(0)}% — triggering compaction`,
            ),
          );
        }
        await this.compact(session.turns, this.config.defaultLevel);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (this.config.verbose) {
        console.log(chalk.yellow(`[AutoCompact] autoCheck error: ${msg}`));
      }
    }
  }

  /**
   * Compact conversation turns
   *
   * @param turns - Array of conversation turns to compact
   * @param level - Compaction level: light, medium, or aggressive
   * @returns CompactionResult with new summary and stats
   */
  async compact(
    turns: ConversationTurn[],
    level: CompactionLevel = this.config.defaultLevel,
  ): Promise<CompactionResult> {
    if (this.isCompacting) {
      throw new Error('Compaction already in progress');
    }

    this.isCompacting = true;
    const startTime = Date.now();

    try {
      const now = Date.now();

      // Partition turns into "preserve" and "compact" groups
      const { toPreserve, toCompact } = this.partitionTurns(turns, now);

      if (toCompact.length === 0) {
        return this.createEmptyResult(turns, level, startTime);
      }

      // Estimate tokens
      const originalTokens = toCompact.reduce((sum, t) => sum + this.estimateTokens(t.content), 0);

      // Generate summary based on level
      const summary = await this.generateSummary(toCompact, level);

      const compactedTokens = this.estimateTokens(summary);
      const tokensSaved = originalTokens - compactedTokens;
      const compressionRatio = originalTokens > 0 ? compactedTokens / originalTokens : 1;

      const result: CompactionResult = {
        level,
        originalTokens,
        compactedTokens,
        tokensSaved,
        compressionRatio,
        turnsCompacted: toCompact.length,
        turnsPreserved: toPreserve.length,
        summary,
        timestamp: now,
        durationMs: Date.now() - startTime,
      };

      // Update stats
      this.updateStats(result);

      // Apply compaction to ConversationMemory
      await this.applyCompaction(turns, toCompact, summary);

      if (this.config.verbose || tokensSaved > 500) {
        console.log(
          chalk.green(
            `[AutoCompact] ✓ ${level}: ${toCompact.length} turns → summary ` +
              `(${originalTokens} → ${compactedTokens} tokens, saved ${tokensSaved}, ` +
              `ratio: ${(compressionRatio * 100).toFixed(0)}%, ${result.durationMs}ms)`,
          ),
        );
      }

      return result;
    } finally {
      this.isCompacting = false;
    }
  }

  /**
   * Manual compact for CLI command `/compact`
   */
  async manualCompact(level?: CompactionLevel): Promise<CompactionResult> {
    const { conversationMemory } = await import('./ConversationMemory.js');
    const session = conversationMemory.getCurrentSession();

    if (!session || session.turns.length < 3) {
      throw new Error('Not enough conversation turns to compact (need at least 3)');
    }

    return this.compact(session.turns, level || this.config.defaultLevel);
  }

  // ============================================================
  // Partitioning
  // ============================================================

  /**
   * Partition turns into groups: preserve (keep as-is) and compact (summarize)
   */
  private partitionTurns(
    turns: ConversationTurn[],
    now: number,
  ): { toPreserve: ConversationTurn[]; toCompact: ConversationTurn[] } {
    const toPreserve: ConversationTurn[] = [];
    const toCompact: ConversationTurn[] = [];

    const recentCutoff = turns.length - this.config.preserveRecentCount;

    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const age = now - turn.timestamp;
      const isRecent = i >= recentCutoff;
      const isHighImportance = turn.importance >= this.config.preserveImportanceAbove;
      const isSystem = turn.role === 'system';
      const isTooYoung = age < this.config.minAgeMs;

      if (isRecent || isHighImportance || isSystem || isTooYoung) {
        toPreserve.push(turn);
      } else {
        toCompact.push(turn);
      }
    }

    return { toPreserve, toCompact };
  }

  // ============================================================
  // Summary Generation
  // ============================================================

  /**
   * Generate summary of compactable turns
   */
  private async generateSummary(
    turns: ConversationTurn[],
    level: CompactionLevel,
  ): Promise<string> {
    // If Gemini is not available, fall back to extractive summary
    if (!this.genAI) {
      return this.extractiveSummary(turns, level);
    }

    // Batch if too many turns
    const batch = turns.slice(-this.config.maxBatchSize);
    const formattedTurns = batch
      .map((t) => `[${t.role}] ${t.content.substring(0, 500)}`)
      .join('\n---\n');

    const levelInstructions = this.getLevelInstructions(level);

    try {
      const model = this.genAI.getGenerativeModel({
        model: GEMINI_MODELS.FLASH,
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: this.config.maxSummaryTokens,
        },
      });

      const prompt = `You are a context compaction assistant. ${levelInstructions}

Summarize the following conversation turns into a concise context summary that preserves:
- Key decisions and their rationale
- Important technical details (file paths, function names, error messages)
- Current task state and progress
- User preferences and constraints mentioned

Conversation turns to compact:
${formattedTurns}

Summary:`;

      const result = await model.generateContent(prompt);
      const summary = result.response.text().trim();

      if (summary.length > 0) {
        return summary;
      }

      // Fallback if AI returns empty
      return this.extractiveSummary(turns, level);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (this.config.verbose) {
        console.log(chalk.yellow(`[AutoCompact] AI summary failed, using extractive: ${msg}`));
      }
      return this.extractiveSummary(turns, level);
    }
  }

  /**
   * Get level-specific instructions for AI summarization
   */
  private getLevelInstructions(level: CompactionLevel): string {
    switch (level) {
      case 'light':
        return 'Preserve most details, just merge redundant/repeated information. Keep all key points.';
      case 'medium':
        return 'Create a balanced summary. Keep important details, remove verbose explanations and redundancies. Aim for ~40% of original length.';
      case 'aggressive':
        return 'Distill to absolute essentials only. Keep only critical decisions, current task state, and key technical references. Aim for ~20% of original length.';
    }
  }

  /**
   * Extractive summary fallback (no AI needed)
   */
  private extractiveSummary(turns: ConversationTurn[], level: CompactionLevel): string {
    const maxCharsPerTurn = level === 'aggressive' ? 80 : level === 'medium' ? 150 : 300;

    const lines: string[] = [`[Context Summary — ${turns.length} turns compacted]`];

    // Group by role
    const userTurns = turns.filter((t) => t.role === 'user');
    const assistantTurns = turns.filter((t) => t.role === 'assistant');

    // Extract user requests
    if (userTurns.length > 0) {
      lines.push('\nUser requests:');
      const selected = level === 'aggressive' ? userTurns.slice(-3) : userTurns.slice(-5);
      for (const t of selected) {
        lines.push(`- ${t.content.substring(0, maxCharsPerTurn).replace(/\n/g, ' ').trim()}`);
      }
    }

    // Extract key assistant responses
    if (assistantTurns.length > 0) {
      lines.push('\nKey responses:');
      // Pick highest importance assistant turns
      const sorted = [...assistantTurns].sort((a, b) => b.importance - a.importance);
      const selected = sorted.slice(0, level === 'aggressive' ? 2 : 4);
      for (const t of selected) {
        lines.push(`- ${t.content.substring(0, maxCharsPerTurn).replace(/\n/g, ' ').trim()}`);
      }
    }

    return lines.join('\n');
  }

  // ============================================================
  // Apply Compaction
  // ============================================================

  /**
   * Apply compaction: replace compacted turns with summary turn in ConversationMemory
   */
  private async applyCompaction(
    _allTurns: ConversationTurn[],
    compactedTurns: ConversationTurn[],
    summary: string,
  ): Promise<void> {
    try {
      const { conversationMemory } = await import('./ConversationMemory.js');
      const session = conversationMemory.getCurrentSession();
      if (!session) return;

      // Remove compacted turns
      const compactedIds = new Set(compactedTurns.map((t) => t.id));
      session.turns = session.turns.filter((t) => !compactedIds.has(t.id));

      // Insert summary as a system turn at the beginning
      const summaryTurn: ConversationTurn = {
        id: `compact_${Date.now()}`,
        timestamp: Date.now(),
        role: 'system',
        content: `[AutoCompact Summary]\n${summary}`,
        importance: 0.7,
      };

      // Insert after any existing system messages at the start
      const firstNonSystemIndex = session.turns.findIndex((t) => t.role !== 'system');
      if (firstNonSystemIndex === -1) {
        session.turns.push(summaryTurn);
      } else {
        session.turns.splice(firstNonSystemIndex, 0, summaryTurn);
      }

      // Also persist
      await conversationMemory.persist();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (this.config.verbose) {
        console.log(chalk.yellow(`[AutoCompact] Apply failed: ${msg}`));
      }
    }
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /**
   * Estimate tokens in text (~4 chars per token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Create empty result when nothing to compact
   */
  private createEmptyResult(
    turns: ConversationTurn[],
    level: CompactionLevel,
    startTime: number,
  ): CompactionResult {
    return {
      level,
      originalTokens: 0,
      compactedTokens: 0,
      tokensSaved: 0,
      compressionRatio: 1,
      turnsCompacted: 0,
      turnsPreserved: turns.length,
      summary: '',
      timestamp: Date.now(),
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Update compaction statistics
   */
  private updateStats(result: CompactionResult): void {
    this.stats.totalCompactions++;
    this.stats.totalTokensSaved += result.tokensSaved;
    this.stats.lastCompactedAt = result.timestamp;

    // Keep last 20 history entries
    this.stats.history.push(result);
    if (this.stats.history.length > 20) {
      this.stats.history.shift();
    }

    // Update average compression ratio
    if (this.stats.history.length > 0) {
      this.stats.averageCompressionRatio =
        this.stats.history.reduce((sum, r) => sum + r.compressionRatio, 0) /
        this.stats.history.length;
    }
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Get compaction statistics
   */
  getStats(): CompactionStats {
    return { ...this.stats };
  }

  /**
   * Get current configuration
   */
  getConfig(): AutoCompactConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<AutoCompactConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart monitoring if interval changed
    if (config.checkIntervalMs && this.checkInterval) {
      this.stop();
      this.start();
    }
  }

  /**
   * Check if compaction is currently in progress
   */
  isRunning(): boolean {
    return this.isCompacting;
  }

  /**
   * Check if auto-monitoring is active
   */
  isMonitoring(): boolean {
    return this.checkInterval !== null;
  }

  /**
   * Format stats for display
   */
  formatStats(): string {
    const s = this.stats;
    const lines = [
      chalk.bold('AutoCompact Statistics:'),
      `  Total compactions: ${s.totalCompactions}`,
      `  Total tokens saved: ${s.totalTokensSaved.toLocaleString()}`,
      `  Avg compression ratio: ${(s.averageCompressionRatio * 100).toFixed(0)}%`,
      `  Last compacted: ${s.lastCompactedAt ? new Date(s.lastCompactedAt).toLocaleTimeString() : 'never'}`,
      `  Monitoring: ${this.isMonitoring() ? chalk.green('active') : chalk.gray('inactive')}`,
    ];

    if (s.history.length > 0) {
      const last = s.history[s.history.length - 1];
      lines.push(
        `  Last result: ${last.turnsCompacted} turns → ${last.compactedTokens} tokens (saved ${last.tokensSaved})`,
      );
    }

    return lines.join('\n');
  }

  /**
   * Compact SessionMemory messages
   * For use with the SessionMemory system (separate from ConversationMemory)
   */
  async compactSessionMessages(
    messages: Array<{ role: string; content: string; timestamp: Date; agent?: string }>,
    level: CompactionLevel = this.config.defaultLevel,
  ): Promise<{ summary: string; tokensSaved: number }> {
    // Convert to ConversationTurn-like structure
    const turns: ConversationTurn[] = messages.map((m, i) => ({
      id: `session_${i}`,
      timestamp: m.timestamp.getTime(),
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      importance: m.role === 'system' ? 0.9 : 0.5,
    }));

    const summary = await this.generateSummary(turns, level);
    const originalTokens = turns.reduce((sum, t) => sum + this.estimateTokens(t.content), 0);
    const compactedTokens = this.estimateTokens(summary);

    return {
      summary,
      tokensSaved: originalTokens - compactedTokens,
    };
  }
}

// ============================================================
// Singleton Instance
// ============================================================

export const autoCompact = new AutoCompact();

export default autoCompact;

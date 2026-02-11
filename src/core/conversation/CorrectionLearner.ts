/**
 * CorrectionLearner.ts - Feature #25: Learning from Corrections
 *
 * Learns from user corrections to improve future responses.
 * Tracks correction patterns and applies learnings to new responses.
 *
 * Part of ConversationLayer refactoring - extracted from lines 541-700
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';

// ============================================================
// Types & Interfaces
// ============================================================

export interface Correction {
  id: string;
  timestamp: number;
  originalResponse: string;
  correctedResponse: string;
  context: string;
  category: string;
  learned: boolean;
}

export interface LearnedPattern {
  id: string;
  pattern: string;
  correction: string;
  frequency: number;
  lastUsed: number;
}

export interface CorrectionStats {
  corrections: number;
  patterns: number;
  topCategories: string[];
}

// ============================================================
// CorrectionLearner Class
// ============================================================

export class CorrectionLearner {
  private corrections: Correction[] = [];
  private patterns: Map<string, LearnedPattern> = new Map();
  private persistPath: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath || path.join(process.cwd(), '.gemini', 'corrections.json');
  }

  async initialize(): Promise<void> {
    try {
      const data = await fs.readFile(this.persistPath, 'utf-8');
      const parsed = JSON.parse(data);
      this.corrections = parsed.corrections || [];
      this.patterns = new Map(Object.entries(parsed.patterns || {}));
      console.log(chalk.gray(`[CorrectionLearner] Loaded ${this.patterns.size} patterns`));
    } catch {
      // Fresh start
    }
  }

  recordCorrection(
    original: string,
    corrected: string,
    context: string,
    category: string = 'general',
  ): Correction {
    const correction: Correction = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      originalResponse: original,
      correctedResponse: corrected,
      context,
      category,
      learned: false,
    };

    this.corrections.push(correction);

    // Extract pattern
    this.extractPattern(correction);

    console.log(chalk.cyan(`[CorrectionLearner] Recorded correction in category: ${category}`));
    return correction;
  }

  private extractPattern(correction: Correction): void {
    // Simple pattern extraction: find what was wrong and what was right
    const original = correction.originalResponse.toLowerCase();
    const corrected = correction.correctedResponse.toLowerCase();

    // Find common mistakes
    const patternKey = this.hashPattern(original, correction.category);

    const existing = this.patterns.get(patternKey);
    if (existing) {
      existing.frequency++;
      existing.lastUsed = Date.now();
      existing.correction = correction.correctedResponse;
    } else {
      this.patterns.set(patternKey, {
        id: crypto.randomUUID(),
        pattern: original.slice(0, 100),
        correction: corrected.slice(0, 200),
        frequency: 1,
        lastUsed: Date.now(),
      });
    }

    correction.learned = true;
  }

  private hashPattern(text: string, category: string): string {
    // Simple hash for pattern matching
    const words = text.split(/\s+/).slice(0, 5).join(' ');
    return `${category}:${words}`;
  }

  applyLearnings(response: string, category: string = 'general'): string {
    const modified = response;
    let appliedCount = 0;

    // Check against learned patterns
    for (const [key, pattern] of this.patterns) {
      if (key.startsWith(category) && pattern.frequency >= 2) {
        // High-frequency corrections are more reliable
        if (modified.toLowerCase().includes(pattern.pattern)) {
          // Log but don't auto-replace (too risky)
          console.log(
            chalk.yellow(`[CorrectionLearner] Found similar pattern to previous correction`),
          );
          appliedCount++;
        }
      }
    }

    if (appliedCount > 0) {
      console.log(chalk.gray(`[CorrectionLearner] Found ${appliedCount} relevant patterns`));
    }

    return modified;
  }

  async persist(): Promise<void> {
    try {
      const dir = path.dirname(this.persistPath);
      await fs.mkdir(dir, { recursive: true });

      const data = {
        corrections: this.corrections.slice(-100), // Keep last 100
        patterns: Object.fromEntries(this.patterns),
        lastSaved: Date.now(),
      };
      await fs.writeFile(this.persistPath, JSON.stringify(data, null, 2));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`[CorrectionLearner] Persist failed: ${msg}`));
    }
  }

  getStats(): CorrectionStats {
    const categories = new Map<string, number>();
    this.corrections.forEach((c) => {
      categories.set(c.category, (categories.get(c.category) || 0) + 1);
    });

    const topCategories = [...categories.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat);

    return {
      corrections: this.corrections.length,
      patterns: this.patterns.size,
      topCategories,
    };
  }

  /**
   * Get all corrections for a specific category
   */
  getCorrectionsByCategory(category: string): Correction[] {
    return this.corrections.filter((c) => c.category === category);
  }

  /**
   * Get learned patterns for a specific category
   */
  getPatternsByCategory(category: string): LearnedPattern[] {
    return [...this.patterns.entries()]
      .filter(([key]) => key.startsWith(category))
      .map(([_, pattern]) => pattern);
  }

  /**
   * Clear all corrections and patterns
   */
  clear(): void {
    this.corrections = [];
    this.patterns.clear();
  }

  /**
   * Get most frequent patterns
   */
  getFrequentPatterns(limit: number = 10): LearnedPattern[] {
    return [...this.patterns.values()].sort((a, b) => b.frequency - a.frequency).slice(0, limit);
  }
}

// ============================================================
// Default Instance
// ============================================================

export const correctionLearner = new CorrectionLearner();

/**
 * ContextManager - Feature #6
 * Context Window Management with intelligent eviction and summarization
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import { GEMINI_MODELS } from '../../config/models.config.js';
import { geminiSemaphore } from '../TrafficControl.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const INTELLIGENCE_MODEL = GEMINI_MODELS.FLASH;

export interface ContextChunk {
  content: string;
  importance: number;
  timestamp: Date;
  type: 'user' | 'assistant' | 'system' | 'result';
}

export class ContextWindowManager {
  private chunks: ContextChunk[] = [];
  private maxTokens: number = 30000; // Approximate max context
  private currentTokens: number = 0;

  /**
   * Estimate tokens in text (rough approximation)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Add content to context window
   */
  add(content: string, type: ContextChunk['type'], importance: number = 0.5): void {
    const tokens = this.estimateTokens(content);

    this.chunks.push({
      content,
      importance,
      timestamp: new Date(),
      type,
    });

    this.currentTokens += tokens;

    // Manage overflow
    while (this.currentTokens > this.maxTokens && this.chunks.length > 1) {
      this.evictLeastImportant();
    }
  }

  /**
   * Evict least important chunk
   */
  private evictLeastImportant(): void {
    // Calculate scores (importance + recency)
    const now = Date.now();
    const scored = this.chunks.map((chunk, index) => {
      const age = (now - chunk.timestamp.getTime()) / (1000 * 60); // Minutes
      const recencyScore = Math.max(0, 1 - age / 60); // Decay over 1 hour
      const score = chunk.importance * 0.7 + recencyScore * 0.3;
      return { index, score, tokens: this.estimateTokens(chunk.content) };
    });

    // Sort by score (ascending = least important first)
    scored.sort((a, b) => a.score - b.score);

    // Remove least important (but not the most recent)
    const toRemove = scored.find((s) => s.index !== this.chunks.length - 1);
    if (toRemove) {
      this.chunks.splice(toRemove.index, 1);
      this.currentTokens -= toRemove.tokens;
      console.log(chalk.gray(`[Context] Evicted chunk, freed ~${toRemove.tokens} tokens`));
    }
  }

  /**
   * Get optimized context for prompt
   */
  getContext(maxTokens: number = 8000): string {
    // Sort by importance and recency
    const now = Date.now();
    const sorted = [...this.chunks].sort((a, b) => {
      const ageA = (now - a.timestamp.getTime()) / (1000 * 60);
      const ageB = (now - b.timestamp.getTime()) / (1000 * 60);
      const scoreA = a.importance * 0.6 + Math.max(0, 1 - ageA / 30) * 0.4;
      const scoreB = b.importance * 0.6 + Math.max(0, 1 - ageB / 30) * 0.4;
      return scoreB - scoreA;
    });

    // Build context within token limit
    let tokens = 0;
    const selected: string[] = [];

    for (const chunk of sorted) {
      const chunkTokens = this.estimateTokens(chunk.content);
      if (tokens + chunkTokens <= maxTokens) {
        selected.push(chunk.content);
        tokens += chunkTokens;
      }
    }

    return selected.join('\n\n');
  }

  /**
   * Summarize old context to save tokens
   */
  async summarizeOldContext(): Promise<void> {
    const oldChunks = this.chunks.filter((c) => {
      const age = (Date.now() - c.timestamp.getTime()) / (1000 * 60);
      return age > 10 && c.importance < 0.7; // Older than 10 min and not critical
    });

    if (oldChunks.length < 3) return;

    const toSummarize = oldChunks.map((c) => c.content).join('\n---\n');

    try {
      const summary = await geminiSemaphore.withPermit(async () => {
        const model = genAI.getGenerativeModel({
          model: INTELLIGENCE_MODEL,
          generationConfig: { temperature: 1.0, maxOutputTokens: 500 }, // Temperature locked at 1.0 for Gemini - do not change
        });
        const result = await model.generateContent(
          `Podsumuj zwięźle (max 200 słów) następujący kontekst:\n\n${toSummarize.substring(0, 3000)}`,
        );
        return result.response.text();
      });

      // Remove old chunks and add summary
      for (const old of oldChunks) {
        const index = this.chunks.indexOf(old);
        if (index > -1) {
          this.currentTokens -= this.estimateTokens(old.content);
          this.chunks.splice(index, 1);
        }
      }

      this.add(summary, 'system', 0.6);
      console.log(chalk.gray(`[Context] Summarized ${oldChunks.length} chunks`));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`[Context] Summarization failed: ${msg}`));
    }
  }

  /**
   * Get statistics
   */
  getStats(): { chunks: number; estimatedTokens: number } {
    return {
      chunks: this.chunks.length,
      estimatedTokens: this.currentTokens,
    };
  }

  /**
   * Get all chunks
   */
  getChunks(): ContextChunk[] {
    return [...this.chunks];
  }

  /**
   * Clear context
   */
  clear(): void {
    this.chunks = [];
    this.currentTokens = 0;
  }
}

// Singleton instance
export const contextManager = new ContextWindowManager();

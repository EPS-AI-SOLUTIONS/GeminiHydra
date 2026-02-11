/**
 * PromptMemory - System pamięci promptów dla GeminiHydra
 *
 * Features:
 * - Zapisywanie ulubionych promptów z tagami i kategoryzacją
 * - Semantyczne wyszukiwanie promptów
 * - Auto-sugestie na podstawie kontekstu
 * - Historia użycia promptów z rankingiem
 * - Import/Export kolekcji promptów
 * - Szablony z parametrami {{variable}}
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';

// ============================================================
// Types
// ============================================================

export type PromptCategory =
  | 'coding' // Programowanie
  | 'analysis' // Analiza kodu/danych
  | 'refactoring' // Refaktoryzacja
  | 'debugging' // Debugowanie
  | 'testing' // Testy
  | 'docs' // Dokumentacja
  | 'git' // Operacje git
  | 'architecture' // Architektura
  | 'review' // Code review
  | 'explain' // Wyjaśnienia
  | 'translate' // Tłumaczenia (język/kod)
  | 'custom'; // Własne

export interface PromptVariable {
  name: string;
  description?: string;
  defaultValue?: string;
  required?: boolean;
}

export interface SavedPrompt {
  id: string;
  title: string;
  content: string;
  category: PromptCategory;
  tags: string[];
  variables?: PromptVariable[];

  // Metadane
  createdAt: Date;
  updatedAt: Date;
  usageCount: number;
  lastUsedAt?: Date;
  rating?: number; // 1-5 stars

  // Embedding dla wyszukiwania semantycznego
  embedding?: number[];

  // Notatki użytkownika
  notes?: string;

  // Powiązania
  relatedPromptIds?: string[];

  // Źródło (jeśli importowany)
  source?: 'user' | 'import' | 'suggestion' | 'community';
}

export interface PromptUsageEntry {
  promptId: string;
  usedAt: Date;
  context?: string; // krótki opis kontekstu użycia
  variables?: Record<string, string>; // użyte zmienne
  success?: boolean; // czy prompt zadziałał dobrze
}

export interface PromptMemoryData {
  prompts: SavedPrompt[];
  history: PromptUsageEntry[];
  favorites: string[]; // IDs ulubionych
  lastSyncAt?: Date;
}

export interface PromptSearchOptions {
  query?: string;
  category?: PromptCategory;
  tags?: string[];
  minRating?: number;
  limit?: number;
  sortBy?: 'usage' | 'rating' | 'recent' | 'relevance';
  onlyFavorites?: boolean;
}

export interface PromptSuggestion {
  prompt: SavedPrompt;
  score: number;
  reason: string;
}

// ============================================================
// PromptMemory Class
// ============================================================

const GEMINI_DIR = path.join(os.homedir(), '.geminihydra');
const PROMPTS_FILE = path.join(GEMINI_DIR, 'memory', 'prompts.json');

export class PromptMemory {
  private data: PromptMemoryData = {
    prompts: [],
    history: [],
    favorites: [],
  };

  private initialized = false;
  private saveDebounceTimer: NodeJS.Timeout | null = null;
  private readonly SAVE_DEBOUNCE_MS = 1000;
  private readonly MAX_HISTORY = 1000;
  private readonly EMBEDDING_DIM = 100;

  // ============================================================
  // Initialization
  // ============================================================

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(PROMPTS_FILE), { recursive: true });

      // Load existing data
      await this.load();
      this.initialized = true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(chalk.yellow(`[PromptMemory] Init warning: ${msg}`));
      this.initialized = true;
    }
  }

  private async load(): Promise<void> {
    try {
      const content = await fs.readFile(PROMPTS_FILE, 'utf-8');
      const parsed = JSON.parse(content);

      // Convert dates
      this.data = {
        prompts: (parsed.prompts || []).map((p: Record<string, unknown>) => ({
          ...p,
          createdAt: new Date(p.createdAt as string),
          updatedAt: new Date(p.updatedAt as string),
          lastUsedAt: p.lastUsedAt ? new Date(p.lastUsedAt as string) : undefined,
        })),
        history: (parsed.history || []).map((h: Record<string, unknown>) => ({
          ...h,
          usedAt: new Date(h.usedAt as string),
        })),
        favorites: parsed.favorites || [],
        lastSyncAt: parsed.lastSyncAt ? new Date(parsed.lastSyncAt) : undefined,
      };
    } catch {
      // File doesn't exist or is invalid - use defaults
      this.data = { prompts: [], history: [], favorites: [] };
    }
  }

  private async save(): Promise<void> {
    // Debounce saves
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(async () => {
      try {
        await fs.mkdir(path.dirname(PROMPTS_FILE), { recursive: true });
        await fs.writeFile(PROMPTS_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`[PromptMemory] Save error: ${msg}`));
      }
    }, this.SAVE_DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    await fs.mkdir(path.dirname(PROMPTS_FILE), { recursive: true });
    await fs.writeFile(PROMPTS_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  // ============================================================
  // CRUD Operations
  // ============================================================

  /**
   * Zapisz nowy prompt
   */
  async savePrompt(options: {
    title: string;
    content: string;
    category?: PromptCategory;
    tags?: string[];
    variables?: PromptVariable[];
    notes?: string;
    rating?: number;
  }): Promise<SavedPrompt> {
    await this.init();

    const id = this.generateId();
    const now = new Date();

    // Detect variables in content
    const detectedVars = this.detectVariables(options.content);
    const variables = options.variables || detectedVars;

    // Auto-detect category if not provided
    const category = options.category || this.detectCategory(options.content, options.tags || []);

    const prompt: SavedPrompt = {
      id,
      title: options.title,
      content: options.content,
      category,
      tags: options.tags || [],
      variables,
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
      notes: options.notes,
      rating: options.rating,
      embedding: this.generateEmbedding(options.content),
      source: 'user',
    };

    this.data.prompts.push(prompt);
    await this.save();

    return prompt;
  }

  /**
   * Aktualizuj istniejący prompt
   */
  async updatePrompt(
    id: string,
    updates: Partial<Omit<SavedPrompt, 'id' | 'createdAt'>>,
  ): Promise<SavedPrompt | null> {
    await this.init();

    const index = this.data.prompts.findIndex((p) => p.id === id);
    if (index === -1) return null;

    const prompt = this.data.prompts[index];

    // Apply updates
    Object.assign(prompt, updates, {
      updatedAt: new Date(),
    });

    // Regenerate embedding if content changed
    if (updates.content) {
      prompt.embedding = this.generateEmbedding(updates.content);
    }

    await this.save();
    return prompt;
  }

  /**
   * Usuń prompt
   */
  async deletePrompt(id: string): Promise<boolean> {
    await this.init();

    const index = this.data.prompts.findIndex((p) => p.id === id);
    if (index === -1) return false;

    this.data.prompts.splice(index, 1);
    this.data.favorites = this.data.favorites.filter((f) => f !== id);

    await this.save();
    return true;
  }

  /**
   * Pobierz prompt po ID
   */
  async getPrompt(id: string): Promise<SavedPrompt | null> {
    await this.init();
    return this.data.prompts.find((p) => p.id === id) || null;
  }

  /**
   * Pobierz wszystkie prompty
   */
  async getAllPrompts(): Promise<SavedPrompt[]> {
    await this.init();
    return [...this.data.prompts];
  }

  // ============================================================
  // Search & Discovery
  // ============================================================

  /**
   * Wyszukaj prompty
   */
  async searchPrompts(options: PromptSearchOptions = {}): Promise<SavedPrompt[]> {
    await this.init();

    let results = [...this.data.prompts];

    // Filter by favorites
    if (options.onlyFavorites) {
      results = results.filter((p) => this.data.favorites.includes(p.id));
    }

    // Filter by category
    if (options.category) {
      results = results.filter((p) => p.category === options.category);
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      results = results.filter((p) =>
        options.tags?.some((tag) => p.tags.includes(tag.toLowerCase())),
      );
    }

    // Filter by minimum rating
    if (options.minRating) {
      results = results.filter((p) => (p.rating || 0) >= (options.minRating ?? 0));
    }

    // Search by query (semantic + text)
    if (options.query) {
      const queryLower = options.query.toLowerCase();
      const queryEmbedding = this.generateEmbedding(options.query);

      results = results
        .map((p) => ({
          prompt: p,
          score: this.calculateRelevance(p, queryLower, queryEmbedding),
        }))
        .filter((r) => r.score > 0.1)
        .sort((a, b) => b.score - a.score)
        .map((r) => r.prompt);
    }

    // Sort
    switch (options.sortBy) {
      case 'usage':
        results.sort((a, b) => b.usageCount - a.usageCount);
        break;
      case 'rating':
        results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'recent':
        results.sort((a, b) => {
          const aTime = a.lastUsedAt?.getTime() || a.updatedAt.getTime();
          const bTime = b.lastUsedAt?.getTime() || b.updatedAt.getTime();
          return bTime - aTime;
        });
        break;
      // 'relevance' is already sorted above for query search
    }

    // Limit
    if (options.limit && options.limit > 0) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  /**
   * Sugestie promptów na podstawie kontekstu
   */
  async getSuggestions(context: string, limit = 5): Promise<PromptSuggestion[]> {
    await this.init();

    if (!context.trim()) return [];

    const contextLower = context.toLowerCase();
    const contextEmbedding = this.generateEmbedding(context);

    const suggestions: PromptSuggestion[] = this.data.prompts
      .map((prompt) => {
        const score = this.calculateRelevance(prompt, contextLower, contextEmbedding);

        // Boost by usage frequency
        const usageBoost = Math.min(prompt.usageCount / 10, 0.2);

        // Boost by rating
        const ratingBoost = ((prompt.rating || 3) / 5) * 0.1;

        // Boost by recency
        const recencyBoost = prompt.lastUsedAt
          ? Math.max(
              0,
              0.1 - (Date.now() - prompt.lastUsedAt.getTime()) / (30 * 24 * 60 * 60 * 1000),
            )
          : 0;

        // Boost favorites
        const favoriteBoost = this.data.favorites.includes(prompt.id) ? 0.15 : 0;

        const finalScore = score + usageBoost + ratingBoost + recencyBoost + favoriteBoost;

        let reason = 'podobna treść';
        if (favoriteBoost > 0) reason = 'ulubiony prompt';
        else if (usageBoost > 0.1) reason = 'często używany';
        else if (prompt.tags.some((t) => contextLower.includes(t)))
          reason = `pasujący tag: ${prompt.tags.find((t) => contextLower.includes(t))}`;

        return { prompt, score: finalScore, reason };
      })
      .filter((s) => s.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return suggestions;
  }

  // ============================================================
  // Usage Tracking
  // ============================================================

  /**
   * Zapisz użycie prompta
   */
  async recordUsage(
    promptId: string,
    options?: {
      context?: string;
      variables?: Record<string, string>;
      success?: boolean;
    },
  ): Promise<void> {
    await this.init();

    // Update prompt stats
    const prompt = this.data.prompts.find((p) => p.id === promptId);
    if (prompt) {
      prompt.usageCount++;
      prompt.lastUsedAt = new Date();
    }

    // Add to history
    const entry: PromptUsageEntry = {
      promptId,
      usedAt: new Date(),
      context: options?.context,
      variables: options?.variables,
      success: options?.success,
    };

    this.data.history.unshift(entry);

    // Trim history
    if (this.data.history.length > this.MAX_HISTORY) {
      this.data.history = this.data.history.slice(0, this.MAX_HISTORY);
    }

    await this.save();
  }

  /**
   * Oceń prompt
   */
  async ratePrompt(id: string, rating: number): Promise<void> {
    await this.init();

    const prompt = this.data.prompts.find((p) => p.id === id);
    if (prompt) {
      prompt.rating = Math.max(1, Math.min(5, rating));
      await this.save();
    }
  }

  // ============================================================
  // Favorites
  // ============================================================

  async toggleFavorite(id: string): Promise<boolean> {
    await this.init();

    const index = this.data.favorites.indexOf(id);
    if (index === -1) {
      this.data.favorites.push(id);
      await this.save();
      return true;
    } else {
      this.data.favorites.splice(index, 1);
      await this.save();
      return false;
    }
  }

  async isFavorite(id: string): Promise<boolean> {
    await this.init();
    return this.data.favorites.includes(id);
  }

  async getFavorites(): Promise<SavedPrompt[]> {
    await this.init();
    return this.data.prompts.filter((p) => this.data.favorites.includes(p.id));
  }

  // ============================================================
  // Template Compilation
  // ============================================================

  /**
   * Kompiluj prompt z parametrami
   */
  compilePrompt(prompt: SavedPrompt, variables: Record<string, string>): string {
    let compiled = prompt.content;

    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      compiled = compiled.replace(regex, value);
    }

    // Replace remaining variables with defaults
    if (prompt.variables) {
      for (const v of prompt.variables) {
        const regex = new RegExp(`\\{\\{\\s*${v.name}\\s*\\}\\}`, 'g');
        if (v.defaultValue) {
          compiled = compiled.replace(regex, v.defaultValue);
        }
      }
    }

    return compiled;
  }

  /**
   * Wykryj zmienne w tekście prompta
   */
  private detectVariables(content: string): PromptVariable[] {
    const regex = /\{\{\s*(\w+)\s*\}\}/g;
    const variables: PromptVariable[] = [];
    const seen = new Set<string>();

    for (let match = regex.exec(content); match !== null; match = regex.exec(content)) {
      const name = match[1];
      if (!seen.has(name)) {
        seen.add(name);
        variables.push({
          name,
          required: true,
        });
      }
    }

    return variables;
  }

  // ============================================================
  // Import/Export
  // ============================================================

  /**
   * Eksportuj prompty do JSON
   */
  async exportPrompts(options?: {
    ids?: string[];
    category?: PromptCategory;
    includeHistory?: boolean;
  }): Promise<string> {
    await this.init();

    let prompts = [...this.data.prompts];

    if (options?.ids) {
      prompts = prompts.filter((p) => options.ids?.includes(p.id));
    }

    if (options?.category) {
      prompts = prompts.filter((p) => p.category === options.category);
    }

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      prompts: prompts.map((p) => ({
        ...p,
        embedding: undefined, // Don't export embeddings
      })),
      history: options?.includeHistory ? this.data.history : undefined,
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Importuj prompty z JSON
   */
  async importPrompts(
    jsonData: string,
    options?: {
      overwrite?: boolean;
      addTags?: string[];
    },
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    await this.init();

    const result = { imported: 0, skipped: 0, errors: [] as string[] };

    try {
      const data = JSON.parse(jsonData);
      const prompts = data.prompts || [];

      for (const p of prompts) {
        try {
          // Check for duplicate
          const existing = this.data.prompts.find(
            (existing) => existing.title === p.title && existing.content === p.content,
          );

          if (existing && !options?.overwrite) {
            result.skipped++;
            continue;
          }

          if (existing && options?.overwrite) {
            // Update existing
            Object.assign(existing, {
              ...p,
              id: existing.id,
              updatedAt: new Date(),
              embedding: this.generateEmbedding(p.content),
            });
          } else {
            // Create new
            const newPrompt: SavedPrompt = {
              ...p,
              id: this.generateId(),
              createdAt: new Date(p.createdAt || Date.now()),
              updatedAt: new Date(),
              usageCount: 0,
              tags: [...(p.tags || []), ...(options?.addTags || [])],
              embedding: this.generateEmbedding(p.content),
              source: 'import',
            };
            this.data.prompts.push(newPrompt);
          }

          result.imported++;
        } catch (e: unknown) {
          const eMsg = e instanceof Error ? e.message : String(e);
          result.errors.push(`Błąd przy imporcie "${p.title}": ${eMsg}`);
        }
      }

      await this.save();
    } catch (e: unknown) {
      const eMsg = e instanceof Error ? e.message : String(e);
      result.errors.push(`Błąd parsowania JSON: ${eMsg}`);
    }

    return result;
  }

  // ============================================================
  // Statistics
  // ============================================================

  async getStats(): Promise<{
    totalPrompts: number;
    totalUsage: number;
    byCategory: Record<PromptCategory, number>;
    topTags: { tag: string; count: number }[];
    topPrompts: { title: string; usageCount: number }[];
    recentlyUsed: number;
  }> {
    await this.init();

    const byCategory: Record<PromptCategory, number> = {
      coding: 0,
      analysis: 0,
      refactoring: 0,
      debugging: 0,
      testing: 0,
      docs: 0,
      git: 0,
      architecture: 0,
      review: 0,
      explain: 0,
      translate: 0,
      custom: 0,
    };

    const tagCounts: Record<string, number> = {};
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let recentlyUsed = 0;

    for (const p of this.data.prompts) {
      byCategory[p.category]++;

      for (const tag of p.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }

      if (p.lastUsedAt && p.lastUsedAt.getTime() > oneWeekAgo) {
        recentlyUsed++;
      }
    }

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    const topPrompts = [...this.data.prompts]
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10)
      .map((p) => ({ title: p.title, usageCount: p.usageCount }));

    return {
      totalPrompts: this.data.prompts.length,
      totalUsage: this.data.history.length,
      byCategory,
      topTags,
      topPrompts,
      recentlyUsed,
    };
  }

  /**
   * Wydrukuj podsumowanie
   */
  async printSummary(): Promise<void> {
    const stats = await this.getStats();

    console.log(chalk.cyan('\n═══ Prompt Memory ═══\n'));
    console.log(chalk.gray(`Zapisanych promptów: ${chalk.white(stats.totalPrompts)}`));
    console.log(chalk.gray(`Łączne użycia: ${chalk.white(stats.totalUsage)}`));
    console.log(chalk.gray(`Używane w ostatnim tygodniu: ${chalk.white(stats.recentlyUsed)}`));
    console.log(chalk.gray(`Ulubionych: ${chalk.white(this.data.favorites.length)}`));

    if (stats.topTags.length > 0) {
      console.log(chalk.gray('\nTop tagi:'));
      stats.topTags.slice(0, 5).forEach(({ tag, count }) => {
        console.log(chalk.gray(`  #${tag} (${count})`));
      });
    }

    if (stats.topPrompts.length > 0) {
      console.log(chalk.gray('\nNajczęściej używane:'));
      stats.topPrompts.slice(0, 5).forEach(({ title, usageCount }) => {
        console.log(chalk.gray(`  "${title}" - ${usageCount}x`));
      });
    }

    console.log('');
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private generateId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private generateEmbedding(text: string): number[] {
    // Simple bag-of-words embedding (nie ML, ale działa dla podobieństwa)
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const embedding = new Array(this.EMBEDDING_DIM).fill(0);

    for (const word of words) {
      // Hash word to index
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = (hash << 5) - hash + word.charCodeAt(i);
        hash = hash & hash;
      }
      const index = Math.abs(hash) % this.EMBEDDING_DIM;
      embedding[index] += 1;
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length) return 0;

    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    return magnitude > 0 ? dotProduct / magnitude : 0;
  }

  private calculateRelevance(
    prompt: SavedPrompt,
    queryLower: string,
    queryEmbedding: number[],
  ): number {
    let score = 0;

    // Exact title match
    if (prompt.title.toLowerCase().includes(queryLower)) {
      score += 0.5;
    }

    // Content match
    if (prompt.content.toLowerCase().includes(queryLower)) {
      score += 0.3;
    }

    // Tag match
    for (const tag of prompt.tags) {
      if (queryLower.includes(tag) || tag.includes(queryLower)) {
        score += 0.2;
        break;
      }
    }

    // Semantic similarity
    if (prompt.embedding) {
      const similarity = this.cosineSimilarity(queryEmbedding, prompt.embedding);
      score += similarity * 0.4;
    }

    return score;
  }

  private detectCategory(content: string, tags: string[]): PromptCategory {
    const lower = `${content.toLowerCase()} ${tags.join(' ').toLowerCase()}`;

    if (/test|spec|assert|expect|mock|stub/.test(lower)) return 'testing';
    if (/debug|error|fix|bug|issue|problem/.test(lower)) return 'debugging';
    if (/refactor|clean|improve|optimize|simplify/.test(lower)) return 'refactoring';
    if (/review|check|audit|analyze code/.test(lower)) return 'review';
    if (/explain|what|how|why|describe/.test(lower)) return 'explain';
    if (/document|readme|jsdoc|comment|api doc/.test(lower)) return 'docs';
    if (/git|commit|branch|merge|rebase/.test(lower)) return 'git';
    if (/architect|design|pattern|structure|system/.test(lower)) return 'architecture';
    if (/translate|convert|port|migrate/.test(lower)) return 'translate';
    if (/analyze|statistics|metric|report/.test(lower)) return 'analysis';
    if (/code|function|class|implement|create|write/.test(lower)) return 'coding';

    return 'custom';
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const promptMemory = new PromptMemory();

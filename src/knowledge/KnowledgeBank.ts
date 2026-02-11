/**
 * KnowledgeBank - Centralny bank wiedzy dla wszystkich agentów
 *
 * Funkcje:
 * 1. Przechowywanie wiedzy z różnych źródeł (code, docs, conversations)
 * 2. Wektorowe wyszukiwanie (embeddings via Ollama/Gemini)
 * 3. Kategoryzacja i tagowanie wiedzy
 * 4. Dostęp dla wszystkich agentów
 * 5. Budowanie kontekstu RAG
 * 6. Uczenie lokalnego modelu
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import ollama from 'ollama';
import { KNOWLEDGE_DIR } from '../config/paths.config.js';

const KNOWLEDGE_DB = path.join(KNOWLEDGE_DIR, 'knowledge.json');
const EMBEDDINGS_DIR = path.join(KNOWLEDGE_DIR, 'embeddings');
const TRAINING_DIR = path.join(KNOWLEDGE_DIR, 'training');

// ============================================================
// Types
// ============================================================

export type KnowledgeType =
  | 'code_pattern' // Wzorce kodu, best practices
  | 'architecture' // Decyzje architektoniczne
  | 'bug_fix' // Rozwiązania błędów
  | 'documentation' // Dokumentacja
  | 'conversation' // Ważne fragmenty konwersacji
  | 'lesson_learned' // Wnioski z doświadczeń
  | 'api_reference' // Referencje API
  | 'config' // Konfiguracje
  | 'workflow' // Przepływy pracy
  | 'custom'; // Własne kategorie

export type KnowledgeSource =
  | 'user' // Dodane przez użytkownika
  | 'agent' // Wygenerowane przez agenta
  | 'codebase' // Wyekstrahowane z kodu
  | 'session' // Z historii sesji
  | 'import'; // Zaimportowane z pliku

export interface KnowledgeEntry {
  id: string;
  type: KnowledgeType;
  source: KnowledgeSource;
  title: string;
  content: string;
  summary?: string;
  tags: string[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    accessCount: number;
    lastAccessedAt: string;
    createdBy?: string; // Agent name or 'user'
    projectPath?: string;
    filePath?: string;
    language?: string;
    importance: number; // 0-1
  };
  embedding?: number[]; // Vector embedding
  relatedIds?: string[]; // Related knowledge IDs
}

export interface KnowledgeStore {
  version: number;
  entries: KnowledgeEntry[];
  stats: {
    totalEntries: number;
    byType: Record<string, number>;
    bySource: Record<string, number>;
  };
}

export interface SearchResult {
  entry: KnowledgeEntry;
  score: number;
  matchType: 'semantic' | 'keyword' | 'tag';
}

export interface RAGContext {
  relevantKnowledge: KnowledgeEntry[];
  contextText: string;
  tokenEstimate: number;
}

// ============================================================
// KnowledgeBank Class
// ============================================================

export class KnowledgeBank {
  private store: KnowledgeStore = {
    version: 1,
    entries: [],
    stats: { totalEntries: 0, byType: {}, bySource: {} },
  };
  private initialized = false;
  private embeddingModel = 'nomic-embed-text';
  private embeddingsCache: Map<string, number[]> = new Map();

  /**
   * Initialize knowledge bank
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    await fs.mkdir(KNOWLEDGE_DIR, { recursive: true });
    await fs.mkdir(EMBEDDINGS_DIR, { recursive: true });
    await fs.mkdir(TRAINING_DIR, { recursive: true });

    try {
      const data = await fs.readFile(KNOWLEDGE_DB, 'utf-8');
      this.store = JSON.parse(data);
    } catch {
      this.store = {
        version: 1,
        entries: [],
        stats: { totalEntries: 0, byType: {}, bySource: {} },
      };
    }

    // Load embeddings cache
    await this.loadEmbeddingsCache();

    this.initialized = true;
    console.log(
      chalk.gray(`[KnowledgeBank] Loaded ${this.store.entries.length} knowledge entries`),
    );
  }

  /**
   * Save knowledge store
   */
  private async save(): Promise<void> {
    this.updateStats();
    await fs.writeFile(KNOWLEDGE_DB, JSON.stringify(this.store, null, 2));
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    for (const entry of this.store.entries) {
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      bySource[entry.source] = (bySource[entry.source] || 0) + 1;
    }

    this.store.stats = {
      totalEntries: this.store.entries.length,
      byType,
      bySource,
    };
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `know_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ============================================================
  // Knowledge Management
  // ============================================================

  /**
   * Add knowledge entry
   */
  async add(
    type: KnowledgeType,
    title: string,
    content: string,
    options: {
      source?: KnowledgeSource;
      tags?: string[];
      summary?: string;
      createdBy?: string;
      projectPath?: string;
      filePath?: string;
      language?: string;
      importance?: number;
      generateEmbedding?: boolean;
    } = {},
  ): Promise<KnowledgeEntry> {
    const {
      source = 'user',
      tags = [],
      summary,
      createdBy,
      projectPath,
      filePath,
      language,
      importance = 0.5,
      generateEmbedding = true,
    } = options;

    const now = new Date().toISOString();
    const entry: KnowledgeEntry = {
      id: this.generateId(),
      type,
      source,
      title,
      content,
      summary: summary || this.generateSummary(content),
      tags: this.extractTags(content, tags),
      metadata: {
        createdAt: now,
        updatedAt: now,
        accessCount: 0,
        lastAccessedAt: now,
        createdBy,
        projectPath,
        filePath,
        language,
        importance,
      },
    };

    // Generate embedding if requested
    if (generateEmbedding) {
      try {
        entry.embedding = await this.generateEmbedding(content);
      } catch (_err) {
        console.warn(chalk.yellow('[KnowledgeBank] Could not generate embedding'));
      }
    }

    this.store.entries.push(entry);
    await this.save();

    console.log(chalk.green(`[KnowledgeBank] Added: ${title}`));
    return entry;
  }

  /**
   * Update knowledge entry
   */
  async update(id: string, updates: Partial<KnowledgeEntry>): Promise<KnowledgeEntry | null> {
    const entry = this.store.entries.find((e) => e.id === id);
    if (!entry) return null;

    Object.assign(entry, updates, {
      metadata: {
        ...entry.metadata,
        ...updates.metadata,
        updatedAt: new Date().toISOString(),
      },
    });

    // Regenerate embedding if content changed
    if (updates.content) {
      try {
        entry.embedding = await this.generateEmbedding(updates.content);
      } catch {}
    }

    await this.save();
    return entry;
  }

  /**
   * Delete knowledge entry
   */
  async delete(id: string): Promise<boolean> {
    const idx = this.store.entries.findIndex((e) => e.id === id);
    if (idx === -1) return false;

    this.store.entries.splice(idx, 1);
    await this.save();
    return true;
  }

  /**
   * Get entry by ID
   */
  get(id: string): KnowledgeEntry | undefined {
    const entry = this.store.entries.find((e) => e.id === id);
    if (entry) {
      entry.metadata.accessCount++;
      entry.metadata.lastAccessedAt = new Date().toISOString();
    }
    return entry;
  }

  // ============================================================
  // Search & Retrieval
  // ============================================================

  /**
   * Search knowledge base (hybrid: semantic + keyword)
   */
  async search(
    query: string,
    options: {
      limit?: number;
      types?: KnowledgeType[];
      sources?: KnowledgeSource[];
      tags?: string[];
      minImportance?: number;
      useSemanticSearch?: boolean;
    } = {},
  ): Promise<SearchResult[]> {
    const {
      limit = 10,
      types,
      sources,
      tags,
      minImportance = 0,
      useSemanticSearch = true,
    } = options;

    let candidates = this.store.entries;

    // Apply filters
    if (types?.length) {
      candidates = candidates.filter((e) => types.includes(e.type));
    }
    if (sources?.length) {
      candidates = candidates.filter((e) => sources.includes(e.source));
    }
    if (tags?.length) {
      candidates = candidates.filter((e) => tags.some((t) => e.tags.includes(t.toLowerCase())));
    }
    if (minImportance > 0) {
      candidates = candidates.filter((e) => e.metadata.importance >= minImportance);
    }

    const results: SearchResult[] = [];

    // Semantic search with embeddings
    if (useSemanticSearch) {
      try {
        const queryEmbedding = await this.generateEmbedding(query);

        for (const entry of candidates) {
          if (entry.embedding) {
            const score = this.cosineSimilarity(queryEmbedding, entry.embedding);
            if (score > 0.3) {
              // Threshold
              results.push({ entry, score, matchType: 'semantic' });
            }
          }
        }
      } catch {
        // Fall back to keyword search
      }
    }

    // Keyword search (always run as backup/supplement)
    const keywords = this.extractKeywords(query);

    for (const entry of candidates) {
      // Skip if already found with semantic search
      if (results.some((r) => r.entry.id === entry.id)) continue;

      const text = `${entry.title} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase();
      let score = 0;

      for (const kw of keywords) {
        if (text.includes(kw)) {
          score += 1;
        }
      }

      // Tag exact match bonus
      for (const tag of entry.tags) {
        if (keywords.includes(tag)) {
          score += 2;
        }
      }

      if (score > 0) {
        results.push({
          entry,
          score: score / keywords.length,
          matchType: 'keyword',
        });
      }
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Get knowledge for RAG context
   */
  async getRAGContext(
    query: string,
    options: {
      maxTokens?: number;
      maxEntries?: number;
      types?: KnowledgeType[];
    } = {},
  ): Promise<RAGContext> {
    const { maxTokens = 4000, maxEntries = 5, types } = options;

    const searchResults = await this.search(query, {
      limit: maxEntries * 2,
      types,
      useSemanticSearch: true,
    });

    const relevantKnowledge: KnowledgeEntry[] = [];
    let contextText = '';
    let tokenEstimate = 0;

    for (const result of searchResults) {
      const entryText = this.formatEntryForContext(result.entry);
      const entryTokens = Math.ceil(entryText.length / 4);

      if (tokenEstimate + entryTokens > maxTokens) break;
      if (relevantKnowledge.length >= maxEntries) break;

      relevantKnowledge.push(result.entry);
      contextText += `${entryText}\n\n`;
      tokenEstimate += entryTokens;

      // Update access stats
      result.entry.metadata.accessCount++;
      result.entry.metadata.lastAccessedAt = new Date().toISOString();
    }

    await this.save();

    return {
      relevantKnowledge,
      contextText: contextText.trim(),
      tokenEstimate,
    };
  }

  /**
   * Format entry for context injection
   */
  private formatEntryForContext(entry: KnowledgeEntry): string {
    return `### ${entry.title} [${entry.type}]
${entry.summary || entry.content.slice(0, 500)}
Tags: ${entry.tags.join(', ')}`;
  }

  // ============================================================
  // Embeddings
  // ============================================================

  /**
   * Generate embedding using Ollama
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    // Check cache first
    const cacheKey = this.hashText(text);
    if (this.embeddingsCache.has(cacheKey)) {
      return this.embeddingsCache.get(cacheKey) ?? [];
    }

    try {
      const response = await ollama.embeddings({
        model: this.embeddingModel,
        prompt: text.slice(0, 8000), // Limit text length
      });

      const embedding = response.embedding;
      this.embeddingsCache.set(cacheKey, embedding);

      // Persist to disk occasionally
      if (this.embeddingsCache.size % 50 === 0) {
        await this.saveEmbeddingsCache();
      }

      return embedding;
    } catch (error) {
      throw new Error(`Embedding generation failed: ${error}`);
    }
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Hash text for cache key
   */
  private hashText(text: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 1000); i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Load embeddings cache
   */
  private async loadEmbeddingsCache(): Promise<void> {
    try {
      const cachePath = path.join(EMBEDDINGS_DIR, 'cache.json');
      const data = await fs.readFile(cachePath, 'utf-8');
      const cache = JSON.parse(data);
      this.embeddingsCache = new Map(Object.entries(cache));
    } catch {
      this.embeddingsCache = new Map();
    }
  }

  /**
   * Save embeddings cache
   */
  private async saveEmbeddingsCache(): Promise<void> {
    const cachePath = path.join(EMBEDDINGS_DIR, 'cache.json');
    const cache = Object.fromEntries(this.embeddingsCache);
    await fs.writeFile(cachePath, JSON.stringify(cache));
  }

  // ============================================================
  // Text Processing
  // ============================================================

  /**
   * Generate summary from content
   */
  private generateSummary(content: string): string {
    // Handle undefined/null/empty content
    if (!content) {
      return '';
    }

    // Simple extractive summary - first 2 sentences or 200 chars
    const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
    if (sentences.length >= 2) {
      return sentences.slice(0, 2).join(' ').trim();
    }
    return content.slice(0, 200) + (content.length > 200 ? '...' : '');
  }

  /**
   * Extract tags from content
   */
  private extractTags(content: string, existingTags: string[]): string[] {
    const tags = new Set((existingTags || []).map((t) => t.toLowerCase()));

    // Handle undefined/null/empty content
    if (!content) {
      return Array.from(tags).slice(0, 15);
    }

    // Technical terms to detect
    const techPatterns = [
      /\b(typescript|javascript|python|rust|go|java|react|vue|angular|node|express|fastapi|django)\b/gi,
      /\b(api|rest|graphql|websocket|http|https)\b/gi,
      /\b(database|sql|mongodb|postgresql|redis|sqlite)\b/gi,
      /\b(docker|kubernetes|aws|gcp|azure|ci\/cd)\b/gi,
      /\b(test|testing|jest|vitest|pytest)\b/gi,
      /\b(error|bug|fix|issue|problem)\b/gi,
      /\b(pattern|architecture|design|structure)\b/gi,
    ];

    for (const pattern of techPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const m of matches) tags.add(m.toLowerCase());
      }
    }

    return Array.from(tags).slice(0, 15);
  }

  /**
   * Extract keywords from query
   */
  private extractKeywords(text: string): string[] {
    if (!text) return [];

    const stopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'have',
      'has',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'can',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'up',
      'about',
      'how',
      'what',
      'when',
      'where',
      'why',
      'all',
      'and',
      'but',
      'if',
      'or',
      'this',
      'that',
      'jak',
      'jest',
      'są',
      'co',
      'gdzie',
      'kiedy',
      'dlaczego',
      'który',
      'która',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\sąćęłńóśźż]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));
  }

  // ============================================================
  // Import/Export
  // ============================================================

  /**
   * Import knowledge from file
   */
  async importFromFile(filePath: string, type: KnowledgeType = 'documentation'): Promise<number> {
    const content = await fs.readFile(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // Detect language
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.js': 'javascript',
      '.py': 'python',
      '.rs': 'rust',
      '.go': 'go',
      '.java': 'java',
      '.md': 'markdown',
    };

    await this.add(type, fileName, content, {
      source: 'import',
      filePath,
      language: langMap[ext] || 'text',
      importance: 0.6,
    });

    return 1;
  }

  /**
   * Import knowledge from directory
   */
  async importFromDirectory(
    dirPath: string,
    options: {
      extensions?: string[];
      type?: KnowledgeType;
      recursive?: boolean;
    } = {},
  ): Promise<number> {
    const { extensions = ['.md', '.txt'], type = 'documentation', recursive = true } = options;
    let imported = 0;

    const processDir = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && recursive) {
          await processDir(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (extensions.includes(ext)) {
            await this.importFromFile(fullPath, type);
            imported++;
          }
        }
      }
    };

    await processDir(dirPath);
    return imported;
  }

  /**
   * Export knowledge to JSON
   */
  async exportToJSON(filePath: string): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(this.store.entries, null, 2));
  }

  /**
   * Export for training (JSONL format for fine-tuning)
   */
  async exportForTraining(outputPath?: string): Promise<string> {
    const trainingPath = outputPath || path.join(TRAINING_DIR, `training_${Date.now()}.jsonl`);
    const lines: string[] = [];

    for (const entry of this.store.entries) {
      // Format for instruction fine-tuning
      const trainingExample = {
        instruction: `Provide information about: ${entry.title}`,
        input: entry.tags.join(', '),
        output: entry.content,
      };
      lines.push(JSON.stringify(trainingExample));

      // Also create Q&A pairs if we have summary
      if (entry.summary) {
        const qaExample = {
          instruction: `What is ${entry.title}?`,
          input: '',
          output: entry.summary,
        };
        lines.push(JSON.stringify(qaExample));
      }
    }

    await fs.writeFile(trainingPath, lines.join('\n'));
    console.log(
      chalk.green(`[KnowledgeBank] Exported ${lines.length} training examples to ${trainingPath}`),
    );

    return trainingPath;
  }

  // ============================================================
  // Statistics
  // ============================================================

  /**
   * Get knowledge bank statistics
   */
  getStats(): KnowledgeStore['stats'] & {
    embeddingsCount: number;
    topTags: Array<{ tag: string; count: number }>;
  } {
    // Count tags
    const tagCounts: Record<string, number> = {};
    for (const entry of this.store.entries) {
      for (const tag of entry.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    return {
      ...this.store.stats,
      embeddingsCount: this.store.entries.filter((e) => e.embedding).length,
      topTags,
    };
  }

  /**
   * List all entries
   */
  list(
    options: {
      type?: KnowledgeType;
      source?: KnowledgeSource;
      limit?: number;
      sortBy?: 'recent' | 'accessed' | 'importance';
    } = {},
  ): KnowledgeEntry[] {
    const { type, source, limit = 50, sortBy = 'recent' } = options;

    let entries = [...this.store.entries];

    if (type) entries = entries.filter((e) => e.type === type);
    if (source) entries = entries.filter((e) => e.source === source);

    // Sort
    switch (sortBy) {
      case 'accessed':
        entries.sort(
          (a, b) =>
            new Date(b.metadata.lastAccessedAt).getTime() -
            new Date(a.metadata.lastAccessedAt).getTime(),
        );
        break;
      case 'importance':
        entries.sort((a, b) => b.metadata.importance - a.metadata.importance);
        break;
      default:
        entries.sort(
          (a, b) =>
            new Date(b.metadata.createdAt).getTime() - new Date(a.metadata.createdAt).getTime(),
        );
    }

    return entries.slice(0, limit);
  }

  /**
   * Prune old/unused entries
   */
  async prune(
    options: { maxAgeDays?: number; minAccessCount?: number; minImportance?: number } = {},
  ): Promise<number> {
    const { maxAgeDays = 90, minAccessCount = 0, minImportance = 0.1 } = options;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    const before = this.store.entries.length;

    this.store.entries = this.store.entries.filter((entry) => {
      const lastAccess = new Date(entry.metadata.lastAccessedAt);
      const isOld = lastAccess < cutoffDate;
      const isUnused = entry.metadata.accessCount <= minAccessCount;
      const isLowImportance = entry.metadata.importance < minImportance;

      // Keep if NOT (old AND unused AND low importance)
      return !(isOld && isUnused && isLowImportance);
    });

    const pruned = before - this.store.entries.length;
    if (pruned > 0) {
      await this.save();
    }

    return pruned;
  }

  /**
   * Close and save
   */
  async close(): Promise<void> {
    await this.save();
    await this.saveEmbeddingsCache();
  }
}

// Global instance
export const knowledgeBank = new KnowledgeBank();

export default knowledgeBank;

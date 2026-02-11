/**
 * BaseMemory - Abstract base class for all memory systems
 * Provides common functionality for persistence, serialization, and lifecycle management
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GEMINIHYDRA_DIR } from '../config/paths.config.js';
import { loadFromFile, saveToFile } from '../native/persistence.js';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Base memory entry structure
 */
export interface MemoryEntry {
  id: string;
  timestamp: Date;
  content: string;
  tags: string[];
  importance: number; // 0-1 scale
  metadata?: Record<string, unknown>;
}

/**
 * Options for initializing memory systems
 */
export interface MemoryOptions {
  persistPath?: string;
  maxEntries?: number;
  autoSave?: boolean;
  saveDebounceMs?: number;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  entries: number;
  size: number;
  oldestEntry?: Date;
  newestEntry?: Date;
}

/**
 * Prune options for removing old entries
 */
export interface PruneOptions {
  maxAgeDays?: number;
  maxEntries?: number;
  minImportance?: number;
}

// ============================================================================
// Serialization Helpers
// ============================================================================

/**
 * JSON replacer for Date objects - converts to ISO strings
 */
export function jsonDateReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

/**
 * Convert date strings back to Date objects in parsed JSON
 * @param obj - Object to transform
 * @param dateFields - Array of field names that should be converted to Date
 * @returns Transformed object with Date fields
 */
export function reviveDates<T extends Record<string, unknown>>(obj: T, dateFields: string[]): T {
  if (!obj || typeof obj !== 'object') return obj;

  const result = { ...obj } as T;
  for (const field of dateFields) {
    if (field in result && result[field]) {
      (result as Record<string, unknown>)[field] = new Date(result[field] as string);
    }
  }
  return result;
}

/**
 * Serialize data to JSON string with proper Date handling
 */
export function serializeToJson(data: unknown, pretty: boolean = true): string {
  return JSON.stringify(data, jsonDateReplacer, pretty ? 2 : 0);
}

/**
 * Deserialize JSON string with error handling
 * @returns Parsed data or null if parsing fails
 */
export function deserializeFromJson<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Safe deserialize with date revival for arrays
 * @param data - JSON string
 * @param dateFields - Fields to convert to Date objects
 * @returns Array of items with Date fields converted
 */
export function deserializeArrayWithDates<T extends Record<string, unknown>>(
  data: string,
  dateFields: string[],
): T[] {
  const parsed = deserializeFromJson<T[]>(data);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((item) => reviveDates(item, dateFields));
}

/**
 * Safe deserialize with date revival for objects
 * @param data - JSON string
 * @param dateFields - Fields to convert to Date objects
 * @returns Object with Date fields converted, or null if parsing fails
 */
export function deserializeObjectWithDates<T extends Record<string, unknown>>(
  data: string,
  dateFields: string[],
): T | null {
  const parsed = deserializeFromJson<T>(data);
  if (!parsed || typeof parsed !== 'object') return null;
  return reviveDates(parsed, dateFields);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate a unique ID for memory entries
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = crypto.randomBytes(6).toString('hex');
  return `${timestamp}-${randomPart}`;
}

/**
 * Generate a short numeric ID
 */
export function generateNumericId(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

/**
 * Estimate the size of data in bytes
 */
export function estimateSize(data: unknown): number {
  try {
    const str = JSON.stringify(data);
    // Approximate UTF-8 byte size
    return new Blob([str]).size;
  } catch {
    return 0;
  }
}

/**
 * Prune old entries based on age
 */
export function pruneOldEntries<
  T extends { timestamp?: Date; created?: Date; lastAccessed?: Date },
>(
  entries: T[],
  maxAgeDays: number,
  dateField: 'timestamp' | 'created' | 'lastAccessed' = 'timestamp',
): T[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
  const cutoffTime = cutoffDate.getTime();

  return entries.filter((entry) => {
    const entryDate = entry[dateField];
    if (!entryDate) return true; // Keep entries without dates
    const date = entryDate instanceof Date ? entryDate : new Date(entryDate);
    return date.getTime() >= cutoffTime;
  });
}

/**
 * Sort entries by importance (descending)
 */
export function sortByImportance<T extends { importance?: number }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => (b.importance || 0) - (a.importance || 0));
}

/**
 * Extract hashtags from content
 */
export function extractTags(content: string): string[] {
  const matches = content.match(/#(\w+)/g) || [];
  return [...new Set(matches.map((t) => t.slice(1).toLowerCase()))];
}

/**
 * Get the default base directory for memory storage
 */
export function getDefaultBaseDir(): string {
  return GEMINIHYDRA_DIR;
}

// ============================================================================
// Abstract Base Class
// ============================================================================

/**
 * Abstract base class for all memory systems
 * Provides common functionality for persistence and lifecycle management
 */
export abstract class BaseMemory<_TData = unknown> {
  // Common properties
  protected persistPath: string;
  protected maxEntries: number;
  protected autoSave: boolean;
  protected saveDebounceMs: number;

  // Internal state
  protected initialized: boolean = false;
  protected saveDebounceTimer: NodeJS.Timeout | null = null;
  protected dirty: boolean = false;

  // Date fields to auto-revive during deserialization (override in subclasses)
  protected dateFields: string[] = ['timestamp', 'created', 'updated', 'lastAccessed'];

  constructor(options: MemoryOptions = {}) {
    this.persistPath = options.persistPath || path.join(getDefaultBaseDir(), 'memory.json');
    this.maxEntries = options.maxEntries || 10000;
    this.autoSave = options.autoSave ?? true;
    this.saveDebounceMs = options.saveDebounceMs || 1000;
  }

  // ============================================================================
  // Protected Serialization Helpers
  // ============================================================================

  /**
   * Helper method to serialize data to JSON
   * Subclasses can use this for consistent serialization
   */
  protected serializeData(data: unknown): string {
    return serializeToJson(data);
  }

  /**
   * Helper method to deserialize JSON with date revival
   * Subclasses can use this for consistent deserialization
   */
  protected deserializeData<T extends Record<string, unknown>>(
    data: string,
    dateFields?: string[],
  ): T | null {
    return deserializeObjectWithDates<T>(data, dateFields || this.dateFields);
  }

  /**
   * Helper method to deserialize array data with date revival
   * Subclasses can use this for arrays of entries
   */
  protected deserializeArrayData<T extends Record<string, unknown>>(
    data: string,
    dateFields?: string[],
  ): T[] {
    return deserializeArrayWithDates<T>(data, dateFields || this.dateFields);
  }

  // ============================================================================
  // Lifecycle Methods
  // ============================================================================

  /**
   * Initialize the memory system
   * Creates directories and loads existing data
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    await this.ensureDir();
    await this.load();
    this.initialized = true;
  }

  /**
   * Load data from persistent storage
   */
  async load(): Promise<void> {
    const data = await loadFromFile<Record<string, unknown>>(this.persistPath);
    if (data) {
      this.deserialize(JSON.stringify(data));
    } else {
      // File doesn't exist or is invalid - start fresh
      this.initializeEmpty();
    }
  }

  /**
   * Save data to persistent storage
   */
  async save(): Promise<void> {
    const data = this.serialize();
    // Parse the serialized JSON and use saveToFile for consistent formatting
    await saveToFile(this.persistPath, JSON.parse(data));
    this.dirty = false;
  }

  /**
   * Schedule a debounced save operation
   * Useful for batching multiple changes
   */
  protected scheduleSave(): void {
    if (!this.autoSave) return;

    this.dirty = true;

    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(async () => {
      try {
        await this.save();
      } catch (error) {
        console.error('[BaseMemory] Save error:', error);
      }
    }, this.saveDebounceMs);
  }

  /**
   * Force immediate save if there are pending changes
   */
  async flush(): Promise<void> {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }

    if (this.dirty) {
      await this.save();
    }
  }

  /**
   * Ensure the directory for persistence exists
   */
  protected async ensureDir(): Promise<void> {
    const dir = path.dirname(this.persistPath);
    await fs.mkdir(dir, { recursive: true });
  }

  // ============================================================================
  // Statistics and Utilities
  // ============================================================================

  /**
   * Get statistics about the memory store
   */
  abstract getStats(): MemoryStats;

  /**
   * Clear all entries from memory
   */
  abstract clear(): void;

  /**
   * Get the number of entries
   */
  abstract getEntryCount(): number;

  // ============================================================================
  // Serialization (Abstract - must be implemented by subclasses)
  // ============================================================================

  /**
   * Serialize the memory data to a string for persistence
   */
  abstract serialize(): string;

  /**
   * Deserialize data from a string
   */
  abstract deserialize(data: string): void;

  /**
   * Initialize empty state (called when no existing data)
   */
  protected abstract initializeEmpty(): void;

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Close the memory system and save any pending data
   */
  async close(): Promise<void> {
    await this.flush();
    this.initialized = false;
  }

  /**
   * Check if the memory system is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the persistence path
   */
  getPersistPath(): string {
    return this.persistPath;
  }

  /**
   * Check if there are unsaved changes
   */
  isDirty(): boolean {
    return this.dirty;
  }
}

// ============================================================================
// Typed Base Memory for specific entry types
// ============================================================================

/**
 * Extended base class for memories with typed entries
 * Provides additional common functionality for entry management
 */
export abstract class TypedBaseMemory<TEntry extends MemoryEntry> extends BaseMemory {
  protected entries: TEntry[] = [];

  /**
   * Add an entry to the memory store
   */
  protected addEntry(entry: TEntry): void {
    this.entries.push(entry);

    // Enforce max entries limit
    if (this.entries.length > this.maxEntries) {
      // Remove oldest entries first (assuming entries are in chronological order)
      this.entries = this.entries.slice(-this.maxEntries);
    }

    this.scheduleSave();
  }

  /**
   * Remove an entry by ID
   */
  protected removeEntry(id: string): boolean {
    const index = this.entries.findIndex((e) => e.id === id);
    if (index === -1) return false;

    this.entries.splice(index, 1);
    this.scheduleSave();
    return true;
  }

  /**
   * Find an entry by ID
   */
  protected findEntry(id: string): TEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /**
   * Get all entries
   */
  protected getAllEntries(): TEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries by tag
   */
  protected getEntriesByTag(tag: string): TEntry[] {
    const normalizedTag = tag.toLowerCase();
    return this.entries.filter((e) => e.tags.some((t) => t.toLowerCase() === normalizedTag));
  }

  /**
   * Search entries by content
   */
  protected searchEntries(query: string, limit: number = 10): TEntry[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2);

    if (queryWords.length === 0) {
      return this.entries.slice(0, limit);
    }

    const scored = this.entries.map((entry) => {
      const contentLower = entry.content.toLowerCase();
      const tagsLower = entry.tags.join(' ').toLowerCase();
      const combined = `${contentLower} ${tagsLower}`;

      const matchCount = queryWords.filter((w) => combined.includes(w)).length;
      const score = (matchCount / queryWords.length) * 0.7 + entry.importance * 0.3;

      return { entry, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.entry);
  }

  /**
   * Prune entries based on options
   */
  prune(options: PruneOptions = {}): number {
    const { maxAgeDays, maxEntries, minImportance } = options;
    const initialCount = this.entries.length;

    // Filter by age
    if (maxAgeDays !== undefined) {
      this.entries = pruneOldEntries(this.entries, maxAgeDays, 'timestamp');
    }

    // Filter by importance
    if (minImportance !== undefined) {
      this.entries = this.entries.filter((e) => e.importance >= minImportance);
    }

    // Enforce max entries
    const limit = maxEntries ?? this.maxEntries;
    if (this.entries.length > limit) {
      // Keep the most important entries
      this.entries = sortByImportance(this.entries).slice(0, limit);
    }

    const prunedCount = initialCount - this.entries.length;
    if (prunedCount > 0) {
      this.scheduleSave();
    }

    return prunedCount;
  }

  getStats(): MemoryStats {
    const timestamps = this.entries
      .map((e) => e.timestamp)
      .filter((t) => t instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime());

    return {
      entries: this.entries.length,
      size: estimateSize(this.entries),
      oldestEntry: timestamps[0],
      newestEntry: timestamps[timestamps.length - 1],
    };
  }

  getEntryCount(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
    this.scheduleSave();
  }

  serialize(): string {
    return this.serializeData(this.entries);
  }

  deserialize(data: string): void {
    this.entries = this.deserializeArrayData<TEntry & Record<string, unknown>>(data, [
      'timestamp',
    ]) as TEntry[];
  }

  protected initializeEmpty(): void {
    this.entries = [];
  }
}

export default BaseMemory;

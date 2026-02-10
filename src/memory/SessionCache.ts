/**
 * SessionCache - L1 Cache for session data
 * Ported from AgentSwarm.psm1 lines 116-143
 *
 * Fast in-memory cache with disk persistence for:
 * - Current objective
 * - Chronicle (execution history)
 * - Temporary data between phases
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { loadFromFile, saveToFile, fileExists } from '../native/persistence.js';
import { GEMINIHYDRA_DIR, CACHE_DIR } from '../config/paths.config.js';

/**
 * Cache configuration
 */
export interface SessionCacheConfig {
  basePath?: string;
  autoSave?: boolean;
  saveDebounce?: number; // ms
}

const DEFAULT_CONFIG: SessionCacheConfig = {
  basePath: '.serena/memories/cache',
  autoSave: true,
  saveDebounce: 1000
};

/**
 * Session data structure
 */
interface SessionData {
  objective?: string;
  refinedObjective?: string;
  chronicle?: string;
  planJson?: string;
  startTime?: string;
  lastUpdate?: string;
  custom: Record<string, any>;
}

/**
 * SessionCache - L1 Cache implementation
 */
export class SessionCache {
  private config: SessionCacheConfig;
  private cache: Map<string, any> = new Map();
  private cacheFile: string;
  private saveTimeout: NodeJS.Timeout | null = null;
  private dirty: boolean = false;

  constructor(config: SessionCacheConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cacheFile = path.join(process.cwd(), this.config.basePath!, 'session_cache.json');
  }

  /**
   * Load cache from disk
   */
  async load(): Promise<void> {
    const parsed = await loadFromFile<Record<string, any>>(this.cacheFile);

    if (parsed) {
      // Convert to Map
      this.cache = new Map(Object.entries(parsed));
      console.log(chalk.gray(`[SessionCache] Loaded ${this.cache.size} entries`));
    } else {
      this.cache = new Map();
    }
  }

  /**
   * Save cache to disk
   */
  async save(): Promise<void> {
    try {
      // Convert Map to object
      const obj = Object.fromEntries(this.cache);

      // Atomic write with retry (PS1 lines 120-142)
      let retries = 3;
      while (retries > 0) {
        try {
          await saveToFile(this.cacheFile, obj);
          this.dirty = false;
          return;
        } catch (writeError) {
          retries--;
          if (retries === 0) throw writeError;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (error: any) {
      console.log(chalk.red(`[SessionCache] Save error: ${error.message}`));
    }
  }

  /**
   * Schedule debounced save
   */
  private scheduleSave(): void {
    if (!this.config.autoSave) return;

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(() => {
      if (this.dirty) {
        this.save();
      }
    }, this.config.saveDebounce);
  }

  /**
   * Set a cache value
   */
  async set(key: string, value: any): Promise<void> {
    this.cache.set(key, value);
    this.dirty = true;
    this.scheduleSave();
  }

  /**
   * Get a cache value
   */
  get<T = any>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  /**
   * Check if key exists
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete a key
   */
  async delete(key: string): Promise<boolean> {
    const had = this.cache.delete(key);
    if (had) {
      this.dirty = true;
      this.scheduleSave();
    }
    return had;
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.dirty = true;

    try {
      await fs.unlink(this.cacheFile);
    } catch {
      // File might not exist
    }
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all entries
   */
  entries(): [string, any][] {
    return Array.from(this.cache.entries());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  // ============ Session-specific methods ============

  /**
   * Set current objective
   */
  async setObjective(objective: string): Promise<void> {
    await this.set('objective', objective);
    await this.set('startTime', new Date().toISOString());
  }

  /**
   * Get current objective
   */
  getObjective(): string | undefined {
    return this.get<string>('objective');
  }

  /**
   * Set refined objective
   */
  async setRefinedObjective(objective: string): Promise<void> {
    await this.set('refinedObjective', objective);
  }

  /**
   * Get refined objective
   */
  getRefinedObjective(): string | undefined {
    return this.get<string>('refinedObjective');
  }

  /**
   * Append to chronicle
   */
  async appendChronicle(entry: string): Promise<void> {
    const current = this.get<string>('chronicle') || 'Chronicle Start\n';
    const timestamp = new Date().toISOString();
    await this.set('chronicle', `${current}[${timestamp}] ${entry}\n`);
    await this.set('lastUpdate', timestamp);
  }

  /**
   * Get chronicle
   */
  getChronicle(): string {
    return this.get<string>('chronicle') || '';
  }

  /**
   * Store plan JSON
   */
  async setPlan(planJson: string): Promise<void> {
    await this.set('planJson', planJson);
  }

  /**
   * Get plan JSON
   */
  getPlan(): string | undefined {
    return this.get<string>('planJson');
  }

  /**
   * Get session summary
   */
  getSummary(): SessionData {
    return {
      objective: this.get('objective'),
      refinedObjective: this.get('refinedObjective'),
      chronicle: this.get('chronicle'),
      planJson: this.get('planJson'),
      startTime: this.get('startTime'),
      lastUpdate: this.get('lastUpdate'),
      custom: Object.fromEntries(
        Array.from(this.cache.entries())
          .filter(([k]) => !['objective', 'refinedObjective', 'chronicle', 'planJson', 'startTime', 'lastUpdate'].includes(k))
      )
    };
  }

  /**
   * Force save (bypass debounce)
   */
  async flush(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    if (this.dirty) {
      await this.save();
    }
  }
}

// Singleton instance
export const sessionCache = new SessionCache();

export default SessionCache;

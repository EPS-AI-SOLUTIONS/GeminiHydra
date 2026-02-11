/**
 * HotReload - Config file watching and hot reload
 * Feature #5: Hot Reload Config
 */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';

export interface HotReloadOptions {
  debounce?: number; // Debounce time in ms
  onReload?: (config: unknown) => void;
  onError?: (error: Error) => void;
}

const DEFAULT_OPTIONS: HotReloadOptions = {
  debounce: 500,
};

/**
 * Hot Reload Manager for config files
 */
export class HotReloadManager extends EventEmitter {
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private configs: Map<string, unknown> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private options: Required<HotReloadOptions>;

  constructor(options: HotReloadOptions = {}) {
    super();
    this.options = {
      debounce: options.debounce ?? DEFAULT_OPTIONS.debounce ?? 1000,
      onReload: options.onReload ?? (() => {}),
      onError: options.onError ?? ((e) => console.error(chalk.red(e.message))),
    };
  }

  /**
   * Watch a config file for changes
   */
  watch(filePath: string): void {
    const absolutePath = path.resolve(filePath);

    if (this.watchers.has(absolutePath)) {
      return; // Already watching
    }

    // Initial load
    this.loadConfig(absolutePath);

    try {
      const watcher = fs.watch(absolutePath, (eventType) => {
        if (eventType === 'change') {
          // Debounce
          const existingTimer = this.debounceTimers.get(absolutePath);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          const timer = setTimeout(() => {
            this.reloadConfig(absolutePath);
          }, this.options.debounce);

          this.debounceTimers.set(absolutePath, timer);
        }
      });

      this.watchers.set(absolutePath, watcher);
      console.log(chalk.gray(`[HotReload] Watching: ${path.basename(absolutePath)}`));
    } catch (error: unknown) {
      this.options.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Load config from file
   */
  private loadConfig(filePath: string): unknown {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();

      let config: unknown;
      if (ext === '.json') {
        config = JSON.parse(content);
      } else if (ext === '.js' || ext === '.mjs') {
        // Clear require cache for hot reload
        delete require.cache[require.resolve(filePath)];
        config = require(filePath);
      } else {
        // Treat as JSON
        config = JSON.parse(content);
      }

      this.configs.set(filePath, config);
      return config;
    } catch (error: unknown) {
      this.options.onError(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * Reload config and emit event
   */
  private reloadConfig(filePath: string): void {
    const oldConfig = this.configs.get(filePath);
    const newConfig = this.loadConfig(filePath);

    if (newConfig) {
      console.log(chalk.cyan(`[HotReload] Reloaded: ${path.basename(filePath)}`));
      this.emit('reload', { path: filePath, oldConfig, newConfig });
      this.options.onReload(newConfig);
    }
  }

  /**
   * Get current config for a file
   */
  getConfig(filePath: string): unknown {
    const absolutePath = path.resolve(filePath);
    return this.configs.get(absolutePath);
  }

  /**
   * Stop watching a file
   */
  unwatch(filePath: string): void {
    const absolutePath = path.resolve(filePath);
    const watcher = this.watchers.get(absolutePath);

    if (watcher) {
      watcher.close();
      this.watchers.delete(absolutePath);
      this.configs.delete(absolutePath);

      const timer = this.debounceTimers.get(absolutePath);
      if (timer) {
        clearTimeout(timer);
        this.debounceTimers.delete(absolutePath);
      }

      console.log(chalk.gray(`[HotReload] Stopped watching: ${path.basename(absolutePath)}`));
    }
  }

  /**
   * Stop all watchers
   */
  unwatchAll(): void {
    for (const filePath of this.watchers.keys()) {
      this.unwatch(filePath);
    }
  }

  /**
   * Get list of watched files
   */
  getWatchedFiles(): string[] {
    return Array.from(this.watchers.keys());
  }
}

// Global instance
export const hotReloadManager = new HotReloadManager();

export default hotReloadManager;

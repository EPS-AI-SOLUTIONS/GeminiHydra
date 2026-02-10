/**
 * Watch Mode - File Monitoring
 * Agent: Eskel (DevOps)
 *
 * Features:
 * - Watch directories for changes
 * - Auto-execute tasks on file change
 * - Debouncing to prevent spam
 * - Pattern filtering (glob)
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { Swarm } from '../core/swarm/Swarm.js';
import { Agent } from '../core/agent/Agent.js';

interface WatchOptions {
  patterns?: string[];       // Glob patterns to watch
  ignore?: string[];         // Patterns to ignore
  debounce?: number;         // Debounce time in ms
  agent?: string;            // Specific agent to use
  recursive?: boolean;       // Watch subdirectories
}

interface FileChange {
  type: 'add' | 'change' | 'delete';
  path: string;
  timestamp: Date;
}

export class WatchMode {
  private swarm: Swarm;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private taskOnChange: string = '';
  private options: WatchOptions;
  private changeQueue: FileChange[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;

  constructor(swarm: Swarm, options: WatchOptions = {}) {
    this.swarm = swarm;
    this.options = {
      patterns: options.patterns || ['**/*'],
      ignore: options.ignore || ['node_modules', '.git', 'dist', '*.log'],
      debounce: options.debounce || 1000,
      agent: options.agent,
      recursive: options.recursive ?? true,
    };
  }

  /**
   * Start watching a directory
   */
  async watch(directory: string, task: string): Promise<void> {
    const absPath = path.resolve(directory);
    this.taskOnChange = task;

    console.log(chalk.cyan(`\n👁️  Watch Mode Active`));
    console.log(chalk.gray(`Directory: ${absPath}`));
    console.log(chalk.gray(`Task: ${task}`));
    console.log(chalk.gray(`Debounce: ${this.options.debounce}ms`));
    console.log(chalk.yellow('\nPress Ctrl+C to stop watching\n'));

    try {
      const watcher = fs.watch(absPath, { recursive: this.options.recursive }, (eventType, filename) => {
        if (filename && !this.shouldIgnore(filename)) {
          this.queueChange({
            type: eventType === 'rename' ? 'add' : 'change',
            path: path.join(absPath, filename),
            timestamp: new Date(),
          });
        }
      });

      this.watchers.set(absPath, watcher);

      // Handle process termination
      process.on('SIGINT', () => {
        this.stop();
        process.exit(0);
      });

    } catch (error: any) {
      console.error(chalk.red(`Watch error: ${error.message}`));
      throw error;
    }
  }

  /**
   * Check if file should be ignored
   */
  private shouldIgnore(filename: string): boolean {
    const ignorePatterns = this.options.ignore || [];
    return ignorePatterns.some(pattern => {
      if (pattern.startsWith('*')) {
        return filename.endsWith(pattern.slice(1));
      }
      return filename.includes(pattern);
    });
  }

  /**
   * Queue a file change (with debouncing)
   */
  private queueChange(change: FileChange): void {
    this.changeQueue.push(change);

    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new debounce timer
    this.debounceTimer = setTimeout(() => {
      this.processChanges();
    }, this.options.debounce);
  }

  /**
   * Process queued changes
   */
  private async processChanges(): Promise<void> {
    if (this.isProcessing || this.changeQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const changes = [...this.changeQueue];
    this.changeQueue = [];

    // Summarize changes
    const changeTypes = {
      add: changes.filter(c => c.type === 'add').length,
      change: changes.filter(c => c.type === 'change').length,
      delete: changes.filter(c => c.type === 'delete').length,
    };

    console.log(chalk.yellow(`\n📝 Detected changes: +${changeTypes.add} ~${changeTypes.change} -${changeTypes.delete}`));

    // List changed files (max 5)
    const filesToShow = changes.slice(0, 5);
    filesToShow.forEach(c => {
      const icon = c.type === 'add' ? '+' : c.type === 'delete' ? '-' : '~';
      console.log(chalk.gray(`  ${icon} ${path.basename(c.path)}`));
    });
    if (changes.length > 5) {
      console.log(chalk.gray(`  ... and ${changes.length - 5} more`));
    }

    try {
      // Build context with changed files
      const changedFiles = changes.map(c => c.path).join('\n');
      const contextualTask = `
Files changed:
${changedFiles}

Task: ${this.taskOnChange}
`;

      if (this.options.agent) {
        // Use specific agent
        const agent = new Agent(this.options.agent as any);
        const result = await agent.think(contextualTask);
        console.log(chalk.green('\n✓ Agent response:'));
        console.log(result);
      } else {
        // Use full swarm
        const result = await this.swarm.executeObjective(contextualTask);
        console.log(chalk.green('\n✓ Swarm response:'));
        console.log(result);
      }

    } catch (error: any) {
      console.error(chalk.red(`\n✗ Error: ${error.message}`));
    }

    this.isProcessing = false;
    console.log(chalk.gray('\n👁️  Watching for changes...'));
  }

  /**
   * Stop all watchers
   */
  stop(): void {
    console.log(chalk.yellow('\n\nStopping watchers...'));
    this.watchers.forEach((watcher, path) => {
      watcher.close();
      console.log(chalk.gray(`  Stopped: ${path}`));
    });
    this.watchers.clear();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    console.log(chalk.green('Watch mode stopped.\n'));
  }

  /**
   * Get current watch status
   */
  getStatus(): { directories: string[]; task: string; queueLength: number } {
    return {
      directories: Array.from(this.watchers.keys()),
      task: this.taskOnChange,
      queueLength: this.changeQueue.length,
    };
  }
}

/**
 * PartialCompletion - Feature #12: Partial Completion Handling
 *
 * Manages partial task completion, allowing tasks to be resumed
 * from where they left off. Stores progress to disk for persistence
 * across sessions, tracks completed steps, and provides resume functionality.
 *
 * Part of GeminiHydra ExecutionEngine
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { GEMINIHYDRA_DIR } from '../../config/paths.config.js';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface PartialResult {
  taskId: number;
  completedSteps: string[];
  pendingSteps: string[];
  partialOutput: string;
  progress: number; // 0-100
  checkpoint: string;
  resumable: boolean;
}

// =============================================================================
// PARTIAL COMPLETION MANAGER CLASS
// =============================================================================

class PartialCompletionManager {
  private partials: Map<number, PartialResult> = new Map();
  private storePath: string;

  constructor(storePath: string = path.join(GEMINIHYDRA_DIR, 'partials')) {
    this.storePath = storePath;
  }

  /**
   * Record partial progress
   */
  async savePartial(result: PartialResult): Promise<void> {
    this.partials.set(result.taskId, result);

    // Persist to disk
    try {
      await fs.mkdir(this.storePath, { recursive: true });
      const filePath = path.join(this.storePath, `task_${result.taskId}.json`);
      await fs.writeFile(filePath, JSON.stringify(result, null, 2));
      console.log(
        chalk.gray(`[Partial] Saved progress for task #${result.taskId} (${result.progress}%)`),
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`[Partial] Could not persist: ${msg}`));
    }
  }

  /**
   * Load partial result
   */
  async loadPartial(taskId: number): Promise<PartialResult | null> {
    // Check memory first
    if (this.partials.has(taskId)) {
      const cached = this.partials.get(taskId);
      if (cached) return cached;
    }

    // Try disk
    try {
      const filePath = path.join(this.storePath, `task_${taskId}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const result = JSON.parse(content) as PartialResult;
      this.partials.set(taskId, result);
      return result;
    } catch {
      return null;
    }
  }

  /**
   * Resume from partial
   */
  async resumeFrom(taskId: number): Promise<{ context: string; remainingSteps: string[] } | null> {
    const partial = await this.loadPartial(taskId);
    if (!partial || !partial.resumable) return null;

    console.log(chalk.cyan(`[Partial] Resuming task #${taskId} from ${partial.progress}%`));

    return {
      context: `POPRZEDNI POSTEP:\n${partial.partialOutput}\n\nUKONCZONE KROKI:\n${partial.completedSteps.join('\n')}`,
      remainingSteps: partial.pendingSteps,
    };
  }

  /**
   * Clear partial (task completed)
   */
  async clearPartial(taskId: number): Promise<void> {
    this.partials.delete(taskId);

    try {
      const filePath = path.join(this.storePath, `task_${taskId}.json`);
      await fs.unlink(filePath);
    } catch {}
  }

  /**
   * Get all partials
   */
  async getAllPartials(): Promise<PartialResult[]> {
    try {
      await fs.mkdir(this.storePath, { recursive: true });
      const files = await fs.readdir(this.storePath);
      const partials: PartialResult[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(this.storePath, file), 'utf-8');
            partials.push(JSON.parse(content));
          } catch {}
        }
      }

      return partials;
    } catch {
      return [];
    }
  }

  /**
   * Get store path
   */
  getStorePath(): string {
    return this.storePath;
  }

  /**
   * Set store path
   */
  setStorePath(newPath: string): void {
    this.storePath = newPath;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const partialManager = new PartialCompletionManager();

// =============================================================================
// EXPORTS
// =============================================================================

export { PartialCompletionManager };

export default {
  partialManager,
  PartialCompletionManager,
};

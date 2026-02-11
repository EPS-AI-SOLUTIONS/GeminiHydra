/**
 * CheckpointSystem - Feature #15: Checkpoint System
 *
 * Provides checkpoint/restore functionality for mission execution.
 * Allows saving execution state at key points, enabling recovery
 * from failures without losing progress. Supports multiple checkpoints
 * per mission with automatic cleanup of old checkpoints.
 *
 * Part of GeminiHydra ExecutionEngine
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { GEMINIHYDRA_DIR } from '../../config/paths.config.js';
import type { ExecutionResult } from '../../types/index.js';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface Checkpoint {
  id: string;
  missionId: string;
  timestamp: Date;
  phase: string;
  state: {
    completedTasks: number[];
    pendingTasks: number[];
    results: Record<number, ExecutionResult>;
    context: string;
  };
  metadata: Record<string, unknown>;
}

// =============================================================================
// CHECKPOINT MANAGER CLASS
// =============================================================================

class CheckpointManager {
  private checkpoints: Map<string, Checkpoint> = new Map();
  private storePath: string;

  constructor(storePath: string = path.join(GEMINIHYDRA_DIR, 'checkpoints')) {
    this.storePath = storePath;
  }

  /**
   * Create checkpoint
   */
  async create(
    missionId: string,
    phase: string,
    state: Checkpoint['state'],
    metadata: Record<string, unknown> = {},
  ): Promise<string> {
    const id = `${missionId}_${phase}_${Date.now()}`;

    const checkpoint: Checkpoint = {
      id,
      missionId,
      timestamp: new Date(),
      phase,
      state,
      metadata,
    };

    this.checkpoints.set(id, checkpoint);

    // Persist
    try {
      await fs.mkdir(this.storePath, { recursive: true });
      const filePath = path.join(this.storePath, `${id}.json`);
      await fs.writeFile(filePath, JSON.stringify(checkpoint, null, 2));
      console.log(chalk.green(`[Checkpoint] Created: ${id}`));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`[Checkpoint] Could not persist: ${msg}`));
    }

    return id;
  }

  /**
   * Load checkpoint
   */
  async load(id: string): Promise<Checkpoint | null> {
    if (this.checkpoints.has(id)) {
      return this.checkpoints.get(id) ?? null;
    }

    try {
      const filePath = path.join(this.storePath, `${id}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      const checkpoint = JSON.parse(content) as Checkpoint;
      checkpoint.timestamp = new Date(checkpoint.timestamp);
      this.checkpoints.set(id, checkpoint);
      return checkpoint;
    } catch {
      return null;
    }
  }

  /**
   * Get latest checkpoint for mission
   */
  async getLatest(missionId: string): Promise<Checkpoint | null> {
    try {
      await fs.mkdir(this.storePath, { recursive: true });
      const files = await fs.readdir(this.storePath);
      const missionFiles = files
        .filter((f) => f.startsWith(missionId) && f.endsWith('.json'))
        .sort()
        .reverse();

      if (missionFiles.length === 0) return null;

      return this.load(missionFiles[0].replace('.json', ''));
    } catch {
      return null;
    }
  }

  /**
   * Restore from checkpoint
   */
  async restore(id: string): Promise<Checkpoint['state'] | null> {
    const checkpoint = await this.load(id);
    if (!checkpoint) return null;

    console.log(
      chalk.cyan(
        `[Checkpoint] Restoring from ${checkpoint.phase} (${checkpoint.timestamp.toISOString()})`,
      ),
    );
    return checkpoint.state;
  }

  /**
   * Delete checkpoint
   */
  async delete(id: string): Promise<void> {
    this.checkpoints.delete(id);
    try {
      await fs.unlink(path.join(this.storePath, `${id}.json`));
    } catch {}
  }

  /**
   * Clean old checkpoints (keep last N per mission)
   */
  async cleanOld(missionId: string, keepCount: number = 3): Promise<number> {
    try {
      const files = await fs.readdir(this.storePath);
      const missionFiles = files
        .filter((f) => f.startsWith(missionId) && f.endsWith('.json'))
        .sort()
        .reverse();

      const toDelete = missionFiles.slice(keepCount);
      for (const file of toDelete) {
        await this.delete(file.replace('.json', ''));
      }

      return toDelete.length;
    } catch {
      return 0;
    }
  }

  /**
   * List all checkpoints for a mission
   */
  async listCheckpoints(missionId: string): Promise<Checkpoint[]> {
    try {
      await fs.mkdir(this.storePath, { recursive: true });
      const files = await fs.readdir(this.storePath);
      const missionFiles = files
        .filter((f) => f.startsWith(missionId) && f.endsWith('.json'))
        .sort()
        .reverse();

      const checkpoints: Checkpoint[] = [];
      for (const file of missionFiles) {
        const checkpoint = await this.load(file.replace('.json', ''));
        if (checkpoint) {
          checkpoints.push(checkpoint);
        }
      }

      return checkpoints;
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

  /**
   * Clear all checkpoints from memory
   */
  clearMemory(): void {
    this.checkpoints.clear();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const checkpointManager = new CheckpointManager();

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create a checkpoint ID from mission and phase
 */
export function createCheckpointId(missionId: string, phase: string): string {
  return `${missionId}_${phase}_${Date.now()}`;
}

/**
 * Parse checkpoint ID to extract components
 */
export function parseCheckpointId(
  id: string,
): { missionId: string; phase: string; timestamp: number } | null {
  const parts = id.split('_');
  if (parts.length < 3) return null;

  const timestamp = parseInt(parts[parts.length - 1], 10);
  const phase = parts[parts.length - 2];
  const missionId = parts.slice(0, -2).join('_');

  return { missionId, phase, timestamp };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { CheckpointManager };

export default {
  checkpointManager,
  CheckpointManager,
  createCheckpointId,
  parseCheckpointId,
};

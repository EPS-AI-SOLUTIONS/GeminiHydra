/**
 * RollbackManager.ts - Feature #28: Rollback Capability
 *
 * Allows undoing changes made during task execution by creating
 * snapshots of files before modifications and restoring them on demand.
 *
 * Part of ConversationLayer module extraction.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import chalk from 'chalk';

// ============================================================
// Types & Interfaces
// ============================================================

export interface FileSnapshot {
  path: string;
  content: string;
  exists: boolean;
}

export interface RollbackPoint {
  id: string;
  timestamp: number;
  description: string;
  files: FileSnapshot[];
  commands: string[];
}

export interface RollbackResult {
  success: boolean;
  restoredFiles: string[];
  errors: string[];
}

// ============================================================
// RollbackManager Class
// ============================================================

export class RollbackManager {
  private points: RollbackPoint[] = [];
  private maxPoints: number = 20;

  /**
   * Creates a rollback point with file snapshots
   * @param description - Description of the rollback point
   * @param files - Array of file paths to snapshot
   * @returns Created RollbackPoint
   */
  async createPoint(description: string, files: string[]): Promise<RollbackPoint> {
    const point: RollbackPoint = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      description,
      files: [],
      commands: [],
    };

    // Snapshot files
    for (const filePath of files) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        point.files.push({ path: filePath, content, exists: true });
      } catch {
        point.files.push({ path: filePath, content: '', exists: false });
      }
    }

    this.points.push(point);

    // Limit stored points
    if (this.points.length > this.maxPoints) {
      this.points.shift();
    }

    console.log(
      chalk.cyan(`[Rollback] Created point: ${description} (${point.files.length} files)`),
    );
    return point;
  }

  /**
   * Adds a command to the latest rollback point
   * @param command - Command string to record
   */
  recordCommand(command: string): void {
    const latest = this.getLatestPoint();
    if (latest) {
      latest.commands.push(command);
    }
  }

  /**
   * Adds a file snapshot to the latest rollback point
   * @param filePath - Path to the file
   * @param content - File content
   * @param exists - Whether file existed before
   */
  addFileSnapshot(filePath: string, content: string, exists: boolean): void {
    const latest = this.getLatestPoint();
    if (latest) {
      // Check if file already in snapshot
      const existing = latest.files.find((f) => f.path === filePath);
      if (!existing) {
        latest.files.push({ path: filePath, content, exists });
      }
    }
  }

  /**
   * Rolls back to a specific rollback point
   * @param pointId - ID of the rollback point
   * @returns RollbackResult with success status and details
   */
  async rollback(pointId: string): Promise<RollbackResult> {
    const point = this.points.find((p) => p.id === pointId);
    if (!point) {
      return { success: false, restoredFiles: [], errors: ['Rollback point not found'] };
    }

    const restoredFiles: string[] = [];
    const errors: string[] = [];

    for (const file of point.files) {
      try {
        if (file.exists) {
          await fs.writeFile(file.path, file.content);
          restoredFiles.push(file.path);
        } else {
          try {
            await fs.unlink(file.path);
            restoredFiles.push(`${file.path} (deleted)`);
          } catch {
            // File doesn't exist, that's fine
          }
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`${file.path}: ${msg}`);
      }
    }

    console.log(chalk.green(`[Rollback] Restored ${restoredFiles.length} files`));
    return { success: errors.length === 0, restoredFiles, errors };
  }

  /**
   * Rolls back to the most recent rollback point
   * @returns RollbackResult with success status and details
   */
  async rollbackLatest(): Promise<RollbackResult> {
    const latest = this.getLatestPoint();
    if (!latest) {
      return { success: false, restoredFiles: [], errors: ['No rollback points available'] };
    }
    return this.rollback(latest.id);
  }

  /**
   * Gets all rollback points
   * @returns Array of RollbackPoint objects
   */
  getPoints(): RollbackPoint[] {
    return [...this.points];
  }

  /**
   * Gets the most recent rollback point
   * @returns Latest RollbackPoint or undefined
   */
  getLatestPoint(): RollbackPoint | undefined {
    return this.points[this.points.length - 1];
  }

  /**
   * Gets a specific rollback point by ID
   * @param pointId - ID of the rollback point
   * @returns RollbackPoint or undefined
   */
  getPoint(pointId: string): RollbackPoint | undefined {
    return this.points.find((p) => p.id === pointId);
  }

  /**
   * Removes a specific rollback point
   * @param pointId - ID of the rollback point to remove
   * @returns true if removed, false if not found
   */
  removePoint(pointId: string): boolean {
    const index = this.points.findIndex((p) => p.id === pointId);
    if (index !== -1) {
      this.points.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clears all rollback points
   */
  clearPoints(): void {
    this.points = [];
    console.log(chalk.gray('[Rollback] Cleared all rollback points'));
  }

  /**
   * Sets the maximum number of rollback points to keep
   * @param max - Maximum number of points
   */
  setMaxPoints(max: number): void {
    this.maxPoints = max;
    // Trim if necessary
    while (this.points.length > this.maxPoints) {
      this.points.shift();
    }
  }

  /**
   * Gets summary of all rollback points
   * @returns Array of point summaries
   */
  getSummary(): { id: string; description: string; timestamp: number; fileCount: number }[] {
    return this.points.map((p) => ({
      id: p.id,
      description: p.description,
      timestamp: p.timestamp,
      fileCount: p.files.length,
    }));
  }

  /**
   * Formats rollback points as a human-readable string
   * @returns Formatted string with all rollback points
   */
  formatPoints(): string {
    if (this.points.length === 0) {
      return 'No rollback points available';
    }

    const lines: string[] = ['Rollback Points:'];
    for (const point of this.points) {
      const date = new Date(point.timestamp).toLocaleString();
      lines.push(
        `  [${point.id.slice(0, 8)}] ${point.description} (${date}, ${point.files.length} files)`,
      );
    }
    return lines.join('\n');
  }
}

// ============================================================
// Singleton Instance
// ============================================================

export const rollbackManager = new RollbackManager();

// ============================================================
// Exports
// ============================================================

export default {
  RollbackManager,
  rollbackManager,
};

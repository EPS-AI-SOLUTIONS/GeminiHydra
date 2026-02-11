/**
 * GracefulShutdown - Clean shutdown handling
 * Feature #10: Graceful Shutdown
 */

import chalk from 'chalk';
import { mcpManager } from '../mcp/index.js';
import { sessionCache } from '../memory/SessionCache.js';
import { logger } from './LiveLogger.js';

export type ShutdownHandler = () => Promise<void>;

export interface ShutdownOptions {
  timeout?: number; // Max time to wait for cleanup (ms)
  exitCode?: number; // Exit code on completion
  forceAfter?: number; // Force exit after this time (ms)
}

const DEFAULT_OPTIONS: ShutdownOptions = {
  timeout: 10000, // 10 seconds
  exitCode: 0,
  forceAfter: 15000, // 15 seconds
};

/**
 * Graceful Shutdown Manager
 */
export class GracefulShutdownManager {
  private handlers: Map<string, ShutdownHandler> = new Map();
  private isShuttingDown = false;
  private currentTask: Promise<unknown> | null = null;

  constructor() {
    this.setupSignalHandlers();
  }

  /**
   * Register shutdown handler
   */
  register(name: string, handler: ShutdownHandler): void {
    this.handlers.set(name, handler);
  }

  /**
   * Unregister shutdown handler
   */
  unregister(name: string): void {
    this.handlers.delete(name);
  }

  /**
   * Set current task (will wait for completion on shutdown)
   */
  setCurrentTask(task: Promise<unknown>): void {
    this.currentTask = task;
  }

  /**
   * Clear current task
   */
  clearCurrentTask(): void {
    this.currentTask = null;
  }

  /**
   * Setup signal handlers
   */
  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

    for (const signal of signals) {
      process.on(signal, async () => {
        if (this.isShuttingDown) {
          logger.system('⚠ Force exit requested', 'error');
          process.exit(1);
        }

        logger.system(`🛑 Received ${signal}, initiating graceful shutdown...`, 'warn');
        await this.shutdown({ exitCode: signal === 'SIGTERM' ? 0 : 130 });
      });
    }

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error(chalk.red('\n💥 Uncaught Exception:'), error);
      await this.shutdown({ exitCode: 1 });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason) => {
      console.error(chalk.red('\n💥 Unhandled Rejection:'), reason);
      await this.shutdown({ exitCode: 1 });
    });
  }

  /**
   * Perform graceful shutdown
   */
  async shutdown(options: ShutdownOptions = {}): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Set force exit timer
    const forceExitTimer = setTimeout(() => {
      console.error(chalk.red('\n⚠ Shutdown timeout exceeded, forcing exit'));
      process.exit(opts.exitCode);
    }, opts.forceAfter);

    try {
      // Wait for current task if any
      if (this.currentTask) {
        logger.system('  Waiting for current task to complete...', 'debug');
        try {
          await Promise.race([
            this.currentTask,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Task timeout')), opts.timeout),
            ),
          ]);
        } catch {
          logger.system('  Current task interrupted', 'warn');
        }
      }

      // Run all registered handlers
      logger.system('  Running cleanup handlers...', 'debug');
      const handlerPromises = Array.from(this.handlers.entries()).map(async ([name, handler]) => {
        try {
          logger.system(`    - ${name}`, 'debug');
          await handler();
        } catch (error: unknown) {
          const errMsg = error instanceof Error ? error.message : String(error);
          logger.system(`    ⚠ ${name} failed: ${errMsg}`, 'warn');
        }
      });

      await Promise.allSettled(handlerPromises);

      logger.system('✓ Shutdown complete', 'info');
      clearTimeout(forceExitTimer);
      process.exit(opts.exitCode);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.system(`Shutdown error: ${errMsg}`, 'error');
      clearTimeout(forceExitTimer);
      process.exit(1);
    }
  }

  /**
   * Check if shutdown is in progress
   */
  isInProgress(): boolean {
    return this.isShuttingDown;
  }
}

// Global instance
export const shutdownManager = new GracefulShutdownManager();

// Register default handlers
shutdownManager.register('sessionCache', async () => {
  await sessionCache.flush();
});

shutdownManager.register('mcpServers', async () => {
  await mcpManager.disconnectAll();
});

// FIX #45: Export temperature learning state on shutdown
shutdownManager.register('temperatureLearning', async () => {
  try {
    const { getTemperatureController } = await import('./agent/temperature.js');
    const controller = getTemperatureController();
    const state = controller.exportLearningState();
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir('./.hydra', { recursive: true });
    await writeFile('./.hydra/temperature-state.json', JSON.stringify(state, null, 2));
    logger.system('    ✓ Temperature learning state saved', 'debug');
  } catch {
    // Non-critical — temperature state is nice-to-have
  }
});

// FIX #44: Export session metrics on shutdown
shutdownManager.register('metricsExport', async () => {
  try {
    const { metrics } = await import('./metrics.js');
    const stats = metrics.getSessionStats();
    if (stats.totalRequests > 0) {
      const { writeFile, mkdir } = await import('node:fs/promises');
      await mkdir('./.hydra', { recursive: true });
      const filename = `./.hydra/session-${Date.now()}.json`;
      await writeFile(filename, JSON.stringify(stats, null, 2));
      logger.system(`    ✓ Session metrics saved (${stats.totalRequests} requests)`, 'debug');
    }
  } catch {
    // Non-critical
  }
});

// AutoCompact: Stop monitoring on shutdown
shutdownManager.register('autoCompact', async () => {
  try {
    const { autoCompact } = await import('./conversation/AutoCompact.js');
    autoCompact.stop();
    const stats = autoCompact.getStats();
    if (stats.totalCompactions > 0) {
      logger.system(
        `    ✓ AutoCompact stopped (${stats.totalCompactions} compactions, ${stats.totalTokensSaved} tokens saved)`,
        'debug',
      );
    }
  } catch {
    // Non-critical
  }
});

export default shutdownManager;

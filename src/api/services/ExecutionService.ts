/**
 * Execution Service
 * Handles task execution through Swarm
 */

import { createSwarm } from '../../index.js';
import type {
  ExecuteOptions,
  ExecutePlan,
  ExecuteStatusResponse,
  ExecutionMode,
  SSEEventType,
} from '../types/index.js';
import { classificationService } from './ClassificationService.js';
import { historyService } from './HistoryService.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ExecuteResult {
  plan: ExecutePlan;
  result: string;
  duration: number;
  mode: ExecutionMode;
}

export interface ExecuteStreamEvent {
  type: SSEEventType;
  data: unknown;
}

// ═══════════════════════════════════════════════════════════════════════════
// Service Class
// ═══════════════════════════════════════════════════════════════════════════

export class ExecutionService {
  private isProcessing = false;
  private processingPromise: Promise<void> | null = null;

  /**
   * Safely cleanup a swarm instance, respecting the processing state.
   * If processing is active, logs a warning and defers cleanup.
   */
  // biome-ignore lint/suspicious/noExplicitAny: Swarm type varies between execution modes
  private async safeCleanup(swarm: any): Promise<void> {
    if (!('cleanup' in swarm && typeof swarm.cleanup === 'function')) {
      return;
    }

    if (this.isProcessing) {
      console.warn(
        '[ExecutionService] Cleanup requested during active processing — deferring cleanup.',
      );
      // Defer cleanup until processing completes
      if (this.processingPromise) {
        this.processingPromise.then(() => {
          swarm.cleanup().catch((err: unknown) => {
            console.error('[ExecutionService] Deferred cleanup error:', err);
          });
        });
      }
      return;
    }

    await swarm.cleanup();
  }

  /**
   * Execute a task (non-streaming)
   */
  async execute(
    prompt: string,
    mode: ExecutionMode = 'basic',
    _options: ExecuteOptions = {},
  ): Promise<ExecuteResult> {
    const startTime = Date.now();
    const plan = classificationService.createPlan(prompt);

    // Add user message to history
    historyService.addUserMessage(prompt);

    this.isProcessing = true;
    let resolveProcessing: (() => void) | undefined;
    this.processingPromise = new Promise<void>((resolve) => {
      resolveProcessing = resolve;
    });

    try {
      // Create and execute swarm
      const swarm = await createSwarm();

      const result = await swarm.executeObjective(prompt);

      const duration = Date.now() - startTime;

      // Add assistant message to history
      historyService.addAssistantMessage(result, plan, {
        duration,
        mode,
        streaming: false,
      });

      // Mark processing as done before cleanup
      this.isProcessing = false;
      resolveProcessing?.();
      this.processingPromise = null;

      await this.safeCleanup(swarm);

      return { plan, result, duration, mode };
    } catch (error: unknown) {
      this.isProcessing = false;
      resolveProcessing?.();
      this.processingPromise = null;
      const errorMessage = error instanceof Error ? error.message : String(error);
      historyService.addErrorMessage(errorMessage);
      throw error;
    }
  }

  /**
   * Execute a task with streaming
   * Returns an async generator yielding SSE events
   */
  async *executeStream(
    prompt: string,
    mode: ExecutionMode = 'basic',
    _options: ExecuteOptions = {},
  ): AsyncGenerator<ExecuteStreamEvent> {
    const startTime = Date.now();
    const plan = classificationService.createPlan(prompt);

    // Yield plan event
    yield { type: 'plan', data: { plan } };

    // Add user message to history
    historyService.addUserMessage(prompt);

    this.isProcessing = true;
    let resolveProcessing: (() => void) | undefined;
    this.processingPromise = new Promise<void>((resolve) => {
      resolveProcessing = resolve;
    });

    try {
      // Create swarm
      const swarm = await createSwarm();

      // Non-streaming execution (simplified)
      const result = await swarm.executeObjective(prompt);
      const duration = Date.now() - startTime;

      yield { type: 'chunk', data: { content: result } };
      yield { type: 'result', data: { result, duration } };

      historyService.addAssistantMessage(result, plan, {
        duration,
        mode,
        streaming: false,
      });

      // Mark processing as done before cleanup
      this.isProcessing = false;
      resolveProcessing?.();
      this.processingPromise = null;

      await this.safeCleanup(swarm);
    } catch (error: unknown) {
      this.isProcessing = false;
      resolveProcessing?.();
      this.processingPromise = null;
      const errorMessage = error instanceof Error ? error.message : String(error);
      yield { type: 'error', data: { error: errorMessage } };
      historyService.addErrorMessage(errorMessage);
    }
  }

  /**
   * Check execution capability
   */
  async checkStatus(): Promise<ExecuteStatusResponse> {
    try {
      const swarm = await createSwarm();
      await this.safeCleanup(swarm);

      return {
        available: true,
        modes: ['basic', 'enhanced', 'swarm'],
        streaming: false, // Simplified - no streaming support in basic Swarm
      };
    } catch {
      return {
        available: false,
        error: 'Swarm not available - check MCP or API configuration',
      };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════

export const executionService = new ExecutionService();

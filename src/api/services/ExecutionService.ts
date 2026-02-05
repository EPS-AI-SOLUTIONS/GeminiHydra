/**
 * Execution Service
 * Handles task execution through Swarm
 */

import { createSwarm } from '../../index.js';
import { classificationService } from './ClassificationService.js';
import { historyService } from './HistoryService.js';
import type {
  ExecuteResponse,
  ExecuteStatusResponse,
  ExecutionMode,
  ExecuteOptions,
  ExecutePlan,
  SSEEventType,
} from '../types/index.js';

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
  /**
   * Execute a task (non-streaming)
   */
  async execute(
    prompt: string,
    mode: ExecutionMode = 'basic',
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    const startTime = Date.now();
    const plan = classificationService.createPlan(prompt);

    // Add user message to history
    historyService.addUserMessage(prompt);

    try {
      // Create and execute swarm
      const swarm = await createSwarm({
        headless: !options.verbose,
        selfHealing: mode === 'swarm',
        translation: true,
      });

      const result = await swarm.executeObjective(prompt);
      await swarm.cleanup();

      const duration = Date.now() - startTime;

      // Add assistant message to history
      historyService.addAssistantMessage(result, plan, {
        duration,
        mode,
        streaming: false,
      });

      return { plan, result, duration, mode };
    } catch (error: unknown) {
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
    options: ExecuteOptions = {}
  ): AsyncGenerator<ExecuteStreamEvent> {
    const startTime = Date.now();
    const plan = classificationService.createPlan(prompt);

    // Yield plan event
    yield { type: 'plan', data: { plan } };

    // Add user message to history
    historyService.addUserMessage(prompt);

    try {
      // Create swarm
      const swarm = await createSwarm({
        headless: !options.verbose,
        selfHealing: mode === 'swarm',
        translation: true,
      });

      // Check if streaming is available
      if (typeof swarm.executeObjectiveStream === 'function') {
        // Use streaming execution
        let fullResult = '';

        for await (const chunk of swarm.executeObjectiveStream(prompt)) {
          fullResult += chunk;
          yield { type: 'chunk', data: { content: chunk } };
        }

        const duration = Date.now() - startTime;
        yield { type: 'result', data: { result: fullResult, duration } };

        // Add to history
        historyService.addAssistantMessage(fullResult, plan, {
          duration,
          mode,
          streaming: true,
        });
      } else {
        // Fallback to non-streaming
        const result = await swarm.executeObjective(prompt);
        const duration = Date.now() - startTime;

        yield { type: 'chunk', data: { content: result } };
        yield { type: 'result', data: { result, duration } };

        historyService.addAssistantMessage(result, plan, {
          duration,
          mode,
          streaming: false,
        });
      }

      await swarm.cleanup();
    } catch (error: unknown) {
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
      const swarm = await createSwarm({ headless: true });
      await swarm.cleanup();

      return {
        available: true,
        modes: ['basic', 'enhanced', 'swarm'],
        streaming: true,
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

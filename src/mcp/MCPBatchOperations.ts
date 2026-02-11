/**
 * MCP Batch Operations - Batch execution of MCP tool calls
 *
 * Extracted from MCPManager.ts for better separation of concerns.
 * Provides efficient batch processing of multiple tool calls.
 */

import { processBatch } from '../utils/batchProcessor.js';
import type { MCPBatchOperation, MCPBatchResult, MCPToolResult } from './MCPTypes.js';

// ============================================================
// Types
// ============================================================

export interface BatchExecutionOptions {
  maxConcurrency?: number;
  onProgress?: (completed: number, total: number) => void;
  stopOnError?: boolean;
}

export interface BatchStats {
  total: number;
  successful: number;
  failed: number;
  duration: number;
}

export type ToolExecutor = (
  toolName: string,
  params: Record<string, unknown>,
) => Promise<MCPToolResult>;

// ============================================================
// MCPBatchExecutor Class
// ============================================================

export class MCPBatchExecutor {
  private defaultOptions: BatchExecutionOptions = {
    maxConcurrency: 5,
    stopOnError: false,
  };

  constructor(options?: BatchExecutionOptions) {
    if (options) {
      this.defaultOptions = { ...this.defaultOptions, ...options };
    }
  }

  // ============================================================
  // Batch Execution
  // ============================================================

  /**
   * Execute multiple tool operations in batch
   */
  async execute(
    operations: MCPBatchOperation[],
    executor: ToolExecutor,
    options?: BatchExecutionOptions,
  ): Promise<{ results: MCPBatchResult[]; stats: BatchStats }> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();

    const batchResult = await processBatch(operations, async (op) => executor(op.tool, op.params), {
      maxConcurrency: opts.maxConcurrency,
      onProgress: opts.onProgress,
    });

    const results = batchResult.results.map((r) => ({
      id: r.item.id,
      success: r.success,
      result: r.result,
      error: r.error,
    }));

    const stats: BatchStats = {
      total: operations.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      duration: Date.now() - startTime,
    };

    return { results, stats };
  }

  /**
   * Execute operations sequentially (one at a time)
   */
  async executeSequential(
    operations: MCPBatchOperation[],
    executor: ToolExecutor,
    options?: { onProgress?: (completed: number, total: number) => void },
  ): Promise<MCPBatchResult[]> {
    const results: MCPBatchResult[] = [];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      try {
        const result = await executor(op.tool, op.params);
        results.push({
          id: op.id,
          success: result.success,
          result,
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        results.push({
          id: op.id,
          success: false,
          error: msg,
        });
      }

      options?.onProgress?.(i + 1, operations.length);
    }

    return results;
  }

  // ============================================================
  // Common Batch Operations
  // ============================================================

  /**
   * Batch read multiple files
   */
  async batchReadFiles(
    paths: string[],
    executor: ToolExecutor,
    options?: BatchExecutionOptions,
  ): Promise<MCPBatchResult[]> {
    const operations: MCPBatchOperation[] = paths.map((filePath) => ({
      tool: 'filesystem__read_file',
      params: { path: filePath },
      id: filePath,
    }));

    const { results } = await this.execute(operations, executor, options);
    return results;
  }

  /**
   * Batch write multiple files
   */
  async batchWriteFiles(
    files: Array<{ path: string; content: string }>,
    executor: ToolExecutor,
    options?: BatchExecutionOptions,
  ): Promise<MCPBatchResult[]> {
    const operations: MCPBatchOperation[] = files.map((file) => ({
      tool: 'filesystem__write_file',
      params: { path: file.path, content: file.content },
      id: file.path,
    }));

    const { results } = await this.execute(operations, executor, options);
    return results;
  }

  /**
   * Batch search in multiple paths
   */
  async batchSearch(
    searches: Array<{ pattern: string; path?: string }>,
    executor: ToolExecutor,
    options?: BatchExecutionOptions,
  ): Promise<MCPBatchResult[]> {
    const operations: MCPBatchOperation[] = searches.map((search, i) => ({
      tool: 'search__grep',
      params: search,
      id: `search-${i}`,
    }));

    const { results } = await this.execute(operations, executor, options);
    return results;
  }

  // ============================================================
  // Pipeline Operations
  // ============================================================

  /**
   * Execute operations in a pipeline where each step depends on the previous
   */
  async executePipeline(
    steps: Array<{
      operation: MCPBatchOperation;
      transform?: (result: MCPToolResult) => MCPBatchOperation | null;
    }>,
    executor: ToolExecutor,
  ): Promise<MCPBatchResult[]> {
    const results: MCPBatchResult[] = [];
    let previousResult: MCPToolResult | null = null;

    for (const step of steps) {
      let operation = step.operation;

      // Transform operation based on previous result if transformer provided
      if (previousResult && step.transform) {
        const transformed = step.transform(previousResult);
        if (!transformed) {
          break; // Stop pipeline if transformer returns null
        }
        operation = transformed;
      }

      try {
        const result = await executor(operation.tool, operation.params);
        results.push({
          id: operation.id,
          success: result.success,
          result,
        });
        previousResult = result;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        results.push({
          id: operation.id,
          success: false,
          error: msg,
        });
        break; // Stop pipeline on error
      }
    }

    return results;
  }

  // ============================================================
  // Retry Failed Operations
  // ============================================================

  /**
   * Retry failed operations from a previous batch
   */
  async retryFailed(
    previousResults: MCPBatchResult[],
    operations: MCPBatchOperation[],
    executor: ToolExecutor,
    options?: BatchExecutionOptions,
  ): Promise<MCPBatchResult[]> {
    // Find failed operation IDs
    const failedIds = new Set(previousResults.filter((r) => !r.success).map((r) => r.id));

    // Filter to only retry failed operations
    const retryOperations = operations.filter((op) => failedIds.has(op.id));

    if (retryOperations.length === 0) {
      return [];
    }

    const { results } = await this.execute(retryOperations, executor, options);
    return results;
  }
}

// ============================================================
// Singleton
// ============================================================

export const mcpBatchExecutor = new MCPBatchExecutor();

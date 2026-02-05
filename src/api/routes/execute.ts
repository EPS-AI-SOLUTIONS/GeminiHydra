/**
 * Execute Routes
 * Task execution with Swarm integration
 */

import { FastifyPluginAsync } from 'fastify';
import { executionService } from '../services/index.js';
import { validateExecuteRequest } from '../validators/index.js';
import { SSEWriter, createKeepAlive } from '../utils/index.js';
import type {
  ExecuteResponse,
  ExecuteErrorResponse,
  ExecuteStatusResponse,
} from '../types/index.js';
import type { ExecuteRequestType } from '../types/fastify.js';

export const executeRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /api/execute
   * Execute task (non-streaming)
   */
  fastify.post<ExecuteRequestType & { Reply: ExecuteResponse | ExecuteErrorResponse }>(
    '/execute',
    async (request, reply) => {
      try {
        const { prompt, mode, options } = validateExecuteRequest(request.body);
        const result = await executionService.execute(prompt, mode, options);
        return result;
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        reply.status(500);
        return { error: errorMessage };
      }
    }
  );

  /**
   * POST /api/execute/stream
   * Execute with SSE streaming
   */
  fastify.post<ExecuteRequestType>('/execute/stream', async (request, reply) => {
    try {
      const { prompt, mode, options } = validateExecuteRequest(request.body);

      // Create SSE writer
      const sse = new SSEWriter(reply);
      const keepAlive = createKeepAlive(sse);

      try {
        // Execute with streaming
        for await (const event of executionService.executeStream(prompt, mode, options)) {
          sse.send(event.type as 'plan' | 'chunk' | 'result' | 'error', event.data as object);
        }
      } finally {
        clearInterval(keepAlive);
        sse.close();
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      reply.status(400);
      return { error: errorMessage };
    }
  });

  /**
   * GET /api/execute/status
   * Check execution capability
   */
  fastify.get<{ Reply: ExecuteStatusResponse }>('/execute/status', async () => {
    return executionService.checkStatus();
  });
};

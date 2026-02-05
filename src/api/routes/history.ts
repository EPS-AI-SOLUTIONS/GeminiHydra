/**
 * History Routes
 * Message history endpoints
 */

import { FastifyPluginAsync } from 'fastify';
import { historyService } from '../services/index.js';
import { validateHistoryLimit, validateSearchQuery } from '../validators/index.js';
import type { HistoryResponse, ClearHistoryResponse, Message } from '../types/index.js';
import type { HistoryQueryRequest } from '../types/fastify.js';

export const historyRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/history
   * Get message history
   */
  fastify.get<HistoryQueryRequest & { Reply: HistoryResponse }>(
    '/history',
    async (request) => {
      const limit = validateHistoryLimit(request.query.limit);

      return {
        messages: historyService.getMessages(limit),
        total: historyService.getCount(),
      };
    }
  );

  /**
   * DELETE /api/history
   * Clear message history
   */
  fastify.delete<{ Reply: ClearHistoryResponse }>('/history', async () => {
    const cleared = historyService.clear();
    return {
      success: true,
      cleared,
    };
  });

  /**
   * POST /api/history
   * Add a message to history (internal use)
   */
  fastify.post<{
    Body: { role: 'user' | 'assistant' | 'system'; content: string; agent?: string; tier?: string };
    Reply: Message;
  }>('/history', async (request) => {
    const { role, content } = request.body;

    if (role === 'user') {
      return historyService.addUserMessage(content);
    } else if (role === 'system') {
      return historyService.addSystemMessage(content);
    }

    // For assistant, use addSystemMessage as fallback (no plan info in direct POST)
    return historyService.addSystemMessage(content);
  });

  /**
   * GET /api/history/search
   * Search messages
   */
  fastify.get<{
    Querystring: { q: string };
    Reply: { messages: Message[]; count: number };
  }>('/history/search', async (request) => {
    const query = validateSearchQuery(request.query.q);
    const messages = historyService.search(query);
    return {
      messages,
      count: messages.length,
    };
  });
};

/**
 * Health Check Routes
 */

import { FastifyPluginAsync } from 'fastify';
import { API_CONFIG } from '../config/index.js';
import type { HealthResponse } from '../types/index.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/health
   * Health check endpoint
   */
  fastify.get<{ Reply: HealthResponse }>('/health', async () => {
    return {
      status: 'ok',
      version: API_CONFIG.version,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });
};

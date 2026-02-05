/**
 * GeminiHydra HTTP API Server
 * Fastify server exposing Swarm functionality for GUI
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';

// Routes
import {
  healthRoutes,
  agentsRoutes,
  settingsRoutes,
  executeRoutes,
  historyRoutes,
} from './routes/index.js';

// Middleware
import {
  errorHandler,
  notFoundHandler,
  onRequest,
  onResponse,
  generateRequestId,
} from './middleware/index.js';

// Types
import type { ServerOptions, ServerInfo } from './types/index.js';

// Config
import { API_CONFIG } from './config/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Server Factory
// ═══════════════════════════════════════════════════════════════════════════

export async function createServer(options: ServerOptions = {}) {
  const {
    port = API_CONFIG.server.port,
    host = API_CONFIG.server.host,
    logger = true,
  } = options;

  // Create Fastify instance
  const fastify = Fastify({
    logger: logger
      ? {
          level: 'info',
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss',
              ignore: 'pid,hostname',
            },
          },
        }
      : false,
    genReqId: generateRequestId,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Plugins
  // ═══════════════════════════════════════════════════════════════════════════

  // CORS
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Hooks
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.addHook('onRequest', onRequest);
  fastify.addHook('onResponse', onResponse);

  // ═══════════════════════════════════════════════════════════════════════════
  // Error Handling
  // ═══════════════════════════════════════════════════════════════════════════

  fastify.setErrorHandler(errorHandler);
  fastify.setNotFoundHandler(notFoundHandler);

  // ═══════════════════════════════════════════════════════════════════════════
  // Routes
  // ═══════════════════════════════════════════════════════════════════════════

  // API routes
  await fastify.register(healthRoutes, { prefix: '/api' });
  await fastify.register(agentsRoutes, { prefix: '/api' });
  await fastify.register(settingsRoutes, { prefix: '/api' });
  await fastify.register(executeRoutes, { prefix: '/api' });
  await fastify.register(historyRoutes, { prefix: '/api' });

  // Root endpoint - server info
  fastify.get<{ Reply: ServerInfo }>('/', async () => {
    return {
      name: 'GeminiHydra API',
      version: API_CONFIG.version,
      endpoints: [
        'GET  /api/health',
        'GET  /api/agents',
        'POST /api/agents/classify',
        'GET  /api/settings',
        'PATCH /api/settings',
        'POST /api/settings/reset',
        'POST /api/execute',
        'POST /api/execute/stream',
        'GET  /api/execute/status',
        'GET  /api/history',
        'GET  /api/history/search',
        'POST /api/history',
        'DELETE /api/history',
      ],
    };
  });

  return { fastify, port, host };
}

// ═══════════════════════════════════════════════════════════════════════════
// Server Startup
// ═══════════════════════════════════════════════════════════════════════════

export async function startServer(options: ServerOptions = {}) {
  const { fastify, port, host } = await createServer(options);

  try {
    await fastify.listen({ port, host });

    console.log(`
╔════════════════════════════════════════════════════════════╗
║                  GeminiHydra API Server                    ║
║                                                            ║
║  Version: ${API_CONFIG.version.padEnd(47)}║
║  Server:  http://${host}:${port}                              ║
║                                                            ║
║  Endpoints:                                                ║
║    GET  /api/health           - Health check               ║
║    GET  /api/agents           - List agents                ║
║    POST /api/agents/classify  - Classify prompt            ║
║    GET  /api/settings         - Get settings               ║
║    PATCH /api/settings        - Update settings            ║
║    POST /api/settings/reset   - Reset settings             ║
║    POST /api/execute          - Execute task               ║
║    POST /api/execute/stream   - Execute with streaming     ║
║    GET  /api/execute/status   - Check execution status     ║
║    GET  /api/history          - Get history                ║
║    GET  /api/history/search   - Search history             ║
║    DELETE /api/history        - Clear history              ║
╚════════════════════════════════════════════════════════════╝
`);

    return fastify;
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Re-exports
// ═══════════════════════════════════════════════════════════════════════════

export type { ServerOptions };

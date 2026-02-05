/**
 * Request Logger Middleware
 * Enhanced request/response logging
 */

import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { API_CONFIG } from '../config/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface RequestLog {
  requestId: string;
  method: string;
  url: string;
  timestamp: string;
  duration?: number;
  statusCode?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Request Timing
// ═══════════════════════════════════════════════════════════════════════════

const requestTimes = new Map<string, number>();

export function onRequest(
  request: FastifyRequest,
  _reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  requestTimes.set(request.id, Date.now());
  done();
}

export function onResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
): void {
  const startTime = requestTimes.get(request.id);
  requestTimes.delete(request.id);

  if (startTime) {
    const duration = Date.now() - startTime;

    // Log slow requests
    if (duration > API_CONFIG.monitoring.slowRequestThresholdMs) {
      request.log.warn({
        msg: 'Slow request detected',
        duration,
        url: request.url,
        method: request.method,
        statusCode: reply.statusCode,
      });
    }
  }

  done();
}

// ═══════════════════════════════════════════════════════════════════════════
// Request ID Generator
// ═══════════════════════════════════════════════════════════════════════════

let requestCounter = 0;

export function generateRequestId(): string {
  requestCounter += 1;
  return `req-${requestCounter}`;
}

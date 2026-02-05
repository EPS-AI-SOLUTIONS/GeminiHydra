/**
 * Fastify Type Extensions
 */

import type { FastifyRequest, FastifyReply, RouteGenericInterface } from 'fastify';
import type { ExecuteRequest, Settings } from './index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Request Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ExecuteRequestType {
  Body: ExecuteRequest;
}

export interface SettingsPatchRequest {
  Body: Partial<Settings>;
}

export interface HistoryQueryRequest {
  Querystring: {
    limit?: string;
  };
}

export interface ClassifyRequest {
  Body: {
    prompt: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Handler Types
// ═══════════════════════════════════════════════════════════════════════════

export type RouteHandler<T = unknown> = (
  request: FastifyRequest,
  reply: FastifyReply
) => Promise<T>;

export type TypedRouteHandler<ReqType extends RouteGenericInterface, ResType> = (
  request: FastifyRequest<ReqType>,
  reply: FastifyReply
) => Promise<ResType>;

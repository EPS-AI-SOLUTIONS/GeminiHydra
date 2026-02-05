/**
 * Route Wrapper Utilities
 * Helpers for consistent error handling and response formatting in routes
 */

import type { FastifyReply, FastifyRequest, RouteGenericInterface } from 'fastify';
import { ApiError } from '../middleware/errorHandler.js';
import { API_ERRORS } from '../constants/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type RouteHandler<TRequest extends RouteGenericInterface, TResponse> = (
  request: FastifyRequest<TRequest>,
  reply: FastifyReply
) => Promise<TResponse>;

export interface ErrorResult {
  error: string;
  code?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Error Formatting
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Create error result object
 */
export function createErrorResult(error: unknown): ErrorResult {
  const message = getErrorMessage(error);
  const result: ErrorResult = { error: message };

  if (error instanceof ApiError && error.code) {
    result.code = error.code;
  }

  return result;
}

/**
 * Get HTTP status code from error
 */
export function getErrorStatusCode(error: unknown): number {
  if (error instanceof ApiError) {
    return error.statusCode;
  }
  return 500;
}

// ═══════════════════════════════════════════════════════════════════════════
// Route Wrappers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wrap a route handler with standard error handling
 * Returns error response instead of throwing
 */
export function wrapRoute<TRequest extends RouteGenericInterface, TResponse>(
  handler: RouteHandler<TRequest, TResponse>
): RouteHandler<TRequest, TResponse | ErrorResult> {
  return async (request, reply) => {
    try {
      return await handler(request, reply);
    } catch (error) {
      const statusCode = getErrorStatusCode(error);
      reply.status(statusCode);
      return createErrorResult(error);
    }
  };
}

/**
 * Wrap a route handler that may fail with execution errors
 * Uses 500 status for execution failures
 */
export function wrapExecutionRoute<TRequest extends RouteGenericInterface, TResponse>(
  handler: RouteHandler<TRequest, TResponse>
): RouteHandler<TRequest, TResponse | ErrorResult> {
  return async (request, reply) => {
    try {
      return await handler(request, reply);
    } catch (error) {
      const statusCode = getErrorStatusCode(error);
      reply.status(statusCode);
      request.log.error({ error: getErrorMessage(error) }, 'Execution failed');
      return {
        error: API_ERRORS.EXECUTION_FAILED(getErrorMessage(error)),
      };
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Response Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create success response with data
 */
export function successResponse<T>(data: T): T {
  return data;
}

/**
 * Create error response
 */
export function errorResponse(message: string, statusCode: number = 500): ErrorResult & { statusCode: number } {
  return {
    error: message,
    statusCode,
  };
}

/**
 * Check if result is an error
 */
export function isErrorResult(result: unknown): result is ErrorResult {
  return (
    typeof result === 'object' &&
    result !== null &&
    'error' in result &&
    typeof (result as ErrorResult).error === 'string'
  );
}

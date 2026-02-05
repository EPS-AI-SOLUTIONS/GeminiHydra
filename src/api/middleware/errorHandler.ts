/**
 * Error Handler Middleware
 * Centralized error handling for Fastify
 */

import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

// ═══════════════════════════════════════════════════════════════════════════
// Error Types
// ═══════════════════════════════════════════════════════════════════════════

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ExecutionError extends ApiError {
  constructor(message: string) {
    super(message, 500, 'EXECUTION_ERROR');
    this.name = 'ExecutionError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Error Response
// ═══════════════════════════════════════════════════════════════════════════

export interface ErrorResponse {
  error: string;
  code?: string;
  statusCode: number;
  timestamp: string;
}

function createErrorResponse(
  error: Error | FastifyError,
  statusCode: number
): ErrorResponse {
  const response: ErrorResponse = {
    error: error.message,
    statusCode,
    timestamp: new Date().toISOString(),
  };

  if (error instanceof ApiError && error.code) {
    response.code = error.code;
  }

  return response;
}

// ═══════════════════════════════════════════════════════════════════════════
// Error Handler
// ═══════════════════════════════════════════════════════════════════════════

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  // Log error
  request.log.error(error);

  // Determine status code
  let statusCode = 500;

  if (error instanceof ApiError) {
    statusCode = error.statusCode;
  } else if ('statusCode' in error && typeof error.statusCode === 'number') {
    statusCode = error.statusCode;
  } else if (error.validation) {
    statusCode = 400;
  }

  // Send error response
  const response = createErrorResponse(error, statusCode);
  reply.status(statusCode).send(response);
}

// ═══════════════════════════════════════════════════════════════════════════
// Not Found Handler
// ═══════════════════════════════════════════════════════════════════════════

export function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const response: ErrorResponse = {
    error: `Route ${request.method} ${request.url} not found`,
    code: 'NOT_FOUND',
    statusCode: 404,
    timestamp: new Date().toISOString(),
  };

  reply.status(404).send(response);
}

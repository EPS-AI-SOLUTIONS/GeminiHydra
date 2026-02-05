/**
 * Middleware Module
 * Re-exports all middleware
 */

export {
  errorHandler,
  notFoundHandler,
  ApiError,
  ValidationError,
  NotFoundError,
  ExecutionError,
} from './errorHandler.js';

export type { ErrorResponse } from './errorHandler.js';

export {
  onRequest,
  onResponse,
  generateRequestId,
} from './requestLogger.js';

export type { RequestLog } from './requestLogger.js';

/**
 * GeminiHydra API Module
 * Re-exports server functionality and all modules
 */

// Server
export { createServer, startServer } from './server.js';

// Config
export { API_CONFIG } from './config/index.js';
export type { ApiConfig, ServerConfig, HistoryConfig, SettingsConfig, MonitoringConfig } from './config/index.js';

// Constants
export {
  VALID_THEMES,
  VALID_LANGUAGES,
  VALID_EXECUTION_MODES,
  VALID_MESSAGE_ROLES,
  NUMERIC_RANGES,
  FIELD_NAMES,
  isValidTheme,
  isValidLanguage,
  isValidExecutionMode,
  isValidMessageRole,
  VALIDATION_ERRORS,
  API_ERRORS,
  SUCCESS_MESSAGES,
  LOG_MESSAGES,
} from './constants/index.js';
export type { ValidMessageRole } from './constants/index.js';

// Types
export * from './types/index.js';
export * from './types/fastify.js';

// Services
export {
  classificationService,
  ClassificationService,
  historyService,
  HistoryService,
  executionService,
  ExecutionService,
} from './services/index.js';
export type { Classification, FullClassification, ExecuteResult, ExecuteStreamEvent } from './services/index.js';

// Validators
export {
  validatePrompt,
  isNonEmptyString,
  validateExecuteRequest,
  validateExecutionMode,
  validateExecuteOptions,
  validateSettingsUpdate,
  validateTheme,
  validateLanguage,
  validateTemperature,
  validateMaxTokens,
  validateModel,
  validateHistoryLimit,
  validateSearchQuery,
  validateDateRange,
  validateClassifyRequest,
  validateAgentId,
} from './validators/index.js';
export type { ExecuteOptions, ClassifyRequest } from './validators/index.js';

// Stores
export { settingsStore, historyStore, SettingsStore, HistoryStore } from './stores/index.js';
export type { AddMessageInput, ValidationResult } from './stores/index.js';

// Middleware
export {
  errorHandler,
  notFoundHandler,
  ApiError,
  ValidationError,
  NotFoundError,
  ExecutionError,
} from './middleware/index.js';
export type { ErrorResponse, RequestLog } from './middleware/index.js';

// Utils - SSE
export { SSEWriter, createKeepAlive } from './utils/index.js';
export * from './utils/validation.js';

// Utils - Route Helpers
export {
  wrapRoute,
  wrapExecutionRoute,
  getErrorMessage,
  createErrorResult,
  getErrorStatusCode,
  successResponse,
  errorResponse,
  isErrorResult,
} from './utils/index.js';
export type { RouteHandler, ErrorResult } from './utils/index.js';

// Utils - Message Filters
export {
  filterByRole,
  filterByAgent,
  filterBySearch,
  filterByDateRange,
  applyFilters,
  groupByDate,
  groupByAgent,
  getLastN,
  getFirstN,
  sortByTimestamp,
  getUniqueAgents,
  countByRole,
} from './utils/index.js';
export type { MessageFilter, MessageGroup } from './utils/index.js';

// Utils - Event Builders
export {
  createPlanEvent,
  createChunkEvent,
  createResultEvent,
  createErrorEvent,
  createStatusEvent,
  serializeEvent,
  serializeComment,
  serializeDone,
  arrayToEventStream,
  chunksToEvents,
  mergeEventStreams,
  isPlanEvent,
  isChunkEvent,
  isResultEvent,
  isErrorEvent,
} from './utils/index.js';
export type {
  SSEEvent,
  PlanEventData,
  ChunkEventData,
  ResultEventData,
  ErrorEventData,
  StatusEventData,
} from './utils/index.js';

// Routes
export * from './routes/index.js';

/**
 * Utils Module
 * Re-exports all utilities
 */

// SSE Streaming
export { SSEWriter, createKeepAlive } from './sse.js';

// Validation Helpers
export {
  requireString,
  optionalString,
  requireNumber,
  optionalNumber,
  requireBoolean,
  optionalBoolean,
  requireEnum,
  optionalEnum,
  requireObject,
  requireArray,
} from './validation.js';

// Route Helpers
export {
  wrapRoute,
  wrapExecutionRoute,
  getErrorMessage,
  createErrorResult,
  getErrorStatusCode,
  successResponse,
  errorResponse,
  isErrorResult,
  type RouteHandler,
  type ErrorResult,
} from './routeWrapper.js';

// Message Filters
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
  type MessageFilter,
  type MessageGroup,
} from './messageFilters.js';

// Event Builders
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
  type SSEEvent,
  type PlanEventData,
  type ChunkEventData,
  type ResultEventData,
  type ErrorEventData,
  type StatusEventData,
} from './eventBuilders.js';

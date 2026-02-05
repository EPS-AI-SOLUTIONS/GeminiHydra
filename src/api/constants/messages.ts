/**
 * Error Messages
 * Centralized error messages for consistent API responses
 */

// ═══════════════════════════════════════════════════════════════════════════
// Validation Errors
// ═══════════════════════════════════════════════════════════════════════════

export const VALIDATION_ERRORS = {
  REQUIRED: (field: string) => `${field} is required`,
  INVALID_TYPE: (field: string, expected: string) => `${field} must be a ${expected}`,
  INVALID_ENUM: (field: string, values: readonly string[]) =>
    `${field} must be one of: ${values.join(', ')}`,
  OUT_OF_RANGE: (field: string, min: number, max: number) =>
    `${field} must be between ${min} and ${max}`,
  TOO_SHORT: (field: string, min: number) =>
    `${field} must be at least ${min} characters`,
  TOO_LONG: (field: string, max: number) =>
    `${field} must be at most ${max} characters`,
  EMPTY_STRING: (field: string) => `${field} cannot be empty`,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// API Errors
// ═══════════════════════════════════════════════════════════════════════════

export const API_ERRORS = {
  NOT_FOUND: (resource: string) => `${resource} not found`,
  ROUTE_NOT_FOUND: (method: string, url: string) => `Route ${method} ${url} not found`,
  EXECUTION_FAILED: (reason: string) => `Execution failed: ${reason}`,
  SWARM_UNAVAILABLE: 'Swarm not available - check MCP or API configuration',
  INTERNAL_ERROR: 'Internal server error',
  BAD_REQUEST: 'Bad request',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Success Messages
// ═══════════════════════════════════════════════════════════════════════════

export const SUCCESS_MESSAGES = {
  HISTORY_CLEARED: (count: number) => `Successfully cleared ${count} messages`,
  SETTINGS_UPDATED: 'Settings updated successfully',
  SETTINGS_RESET: 'Settings reset to defaults',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Log Messages
// ═══════════════════════════════════════════════════════════════════════════

export const LOG_MESSAGES = {
  SLOW_REQUEST: 'Slow request detected',
  SERVER_STARTED: (host: string, port: number) => `Server listening at http://${host}:${port}`,
  SERVER_STOPPED: 'Server stopped',
} as const;

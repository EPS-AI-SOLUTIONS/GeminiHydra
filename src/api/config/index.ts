/**
 * API Configuration
 * Centralized configuration for all API modules
 */

// ═══════════════════════════════════════════════════════════════════════════
// Environment helpers
// ═══════════════════════════════════════════════════════════════════════════

const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

const getEnvString = (key: string, defaultValue: string): string => {
  return process.env[key] || defaultValue;
};

// ═══════════════════════════════════════════════════════════════════════════
// API Configuration
// ═══════════════════════════════════════════════════════════════════════════

export const API_CONFIG = {
  /** Application version */
  version: getEnvString('API_VERSION', '16.0.0'),

  /** Server configuration */
  server: {
    port: getEnvNumber('API_PORT', 8080),
    host: getEnvString('API_HOST', '0.0.0.0'),
  },

  /** History store configuration */
  history: {
    maxSize: getEnvNumber('HISTORY_MAX_SIZE', 1000),
    defaultLimit: getEnvNumber('HISTORY_DEFAULT_LIMIT', 50),
  },

  /** Settings validation limits */
  settings: {
    temperature: {
      min: 0,
      max: 2,
    },
    tokens: {
      min: 1,
      max: 32768,
    },
  },

  /** Monitoring configuration */
  monitoring: {
    /** Threshold in ms for logging slow requests */
    slowRequestThresholdMs: getEnvNumber('SLOW_REQUEST_THRESHOLD_MS', 1000),
    /** SSE keep-alive interval in ms */
    keepAliveIntervalMs: getEnvNumber('SSE_KEEPALIVE_MS', 15000),
  },

  /** Logger configuration */
  logger: {
    level: getEnvString('LOG_LEVEL', 'info'),
    pretty: process.env.NODE_ENV !== 'production',
  },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Type exports
// ═══════════════════════════════════════════════════════════════════════════

export type ApiConfig = typeof API_CONFIG;
export type ServerConfig = typeof API_CONFIG.server;
export type HistoryConfig = typeof API_CONFIG.history;
export type SettingsConfig = typeof API_CONFIG.settings;
export type MonitoringConfig = typeof API_CONFIG.monitoring;

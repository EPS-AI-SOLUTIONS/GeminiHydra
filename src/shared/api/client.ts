// @ts-nocheck
/** Jaskier Shared Pattern */
// src/shared/api/client.ts
/**
 * GeminiHydra — Typed API Client (thin shell)
 * =============================================
 * Initializes @jaskier/hydra-app API client with GeminiHydra-specific config,
 * then re-exports all API functions. Single client instance shared between
 * app code and hydra-app components.
 */

import { initApiClient } from '@jaskier/hydra-app/shared/api';
import { env } from '../config/env';

// Initialize the shared API client — MUST happen before any component renders
initApiClient({
  flyUrl: 'https://geminihydra-v15-backend.fly.dev',
  localPort: 8081,
  authSecret: env.VITE_AUTH_SECRET,
});

export type { ApiClientConfig, HealthStatus } from '@jaskier/hydra-app/shared/api';
// Re-export everything from hydra-app's client (single source of truth)
export {
  ApiError,
  apiDelete,
  apiGet,
  apiGetPolling,
  apiPatch,
  apiPost,
  apiPostFormData,
  BASE_URL,
  checkHealth,
  getBaseUrl,
} from '@jaskier/hydra-app/shared/api';

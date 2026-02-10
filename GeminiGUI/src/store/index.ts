/**
 * GeminiGUI - Store Barrel Export
 * @module store
 *
 * Centralized Zustand state management with memoized selectors.
 * Provides access to the global app store and optimized selectors
 * for performance-critical component subscriptions.
 *
 * Usage:
 *   import { useAppStore, selectTheme } from '@/store';
 *   const theme = useAppStore(selectTheme);
 *   const isApiKeySet = useAppStore(selectIsApiKeySet);
 */

// ============================================================================
// MAIN STORE
// ============================================================================

export { useAppStore } from './useAppStore';

// ============================================================================
// BASIC STATE SELECTORS (Primitive Values)
// ============================================================================

export {
  selectTheme,
  selectProvider,
  selectCount,
  selectCurrentSessionId,
} from './selectors';

// ============================================================================
// SETTINGS SELECTORS
// ============================================================================

export {
  selectSettings,
  selectIsApiKeySet,
  selectOllamaEndpoint,
  selectSystemPrompt,
  selectDefaultProvider,
  selectUseSwarm,
  selectGeminiApiKey,
} from './selectors';

// ============================================================================
// SESSION SELECTORS
// ============================================================================

export {
  selectSessions,
  selectSessionById,
  selectCurrentSession,
  selectSessionCount,
  selectSessionHasMessages,
  selectSessionMetadata,
} from './selectors';

// ============================================================================
// MESSAGE SELECTORS
// ============================================================================

export {
  selectChatHistory,
  selectCurrentMessages,
  selectMessagesBySessionId,
  selectMessageCount,
  selectMessageCountBySessionId,
  selectHasMessages,
  selectLastMessage,
  selectLastMessageBySessionId,
} from './selectors';

// ============================================================================
// COMPUTED STATE SELECTORS
// ============================================================================

export {
  selectIsAppReady,
  selectApiConfigStatus,
  selectRuntimeSettings,
} from './selectors';

// ============================================================================
// PAGINATION SELECTORS
// ============================================================================

export {
  selectPaginatedMessages,
  selectTotalPages,
  selectPaginationInfo,
} from './selectors';

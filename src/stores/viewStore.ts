// @ts-nocheck
/**
 * viewStore — GeminiHydra thin shell
 * ====================================
 * Initializes @jaskier/hydra-app view store with GeminiHydra-specific config,
 * then re-exports all store hooks/types. The single store instance is shared
 * between app code and hydra-app components.
 */

import { initViewStore } from '@jaskier/hydra-app/stores';

// Initialize the shared view store — MUST happen before any component renders
initViewStore({
  storageKey: 'geminihydra-view',
  devtoolsName: 'GeminiHydra/ViewStore',
});

export type { ChatSession, ChatTab, ViewStoreState } from '@jaskier/hydra-app/stores';
// Re-export everything from hydra-app's stores (single source of truth)
export {
  useCurrentChatHistory,
  useCurrentSession,
  useCurrentSessionId,
  useViewStore,
} from '@jaskier/hydra-app/stores';

// Re-export types and utils for backward compatibility
export * from './types';
export * from './utils';

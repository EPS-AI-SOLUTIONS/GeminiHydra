/**
 * GeminiGUI - Zustand App Store
 * @module store/useAppStore
 *
 * Centralized state management composed from domain-specific slices.
 * Each slice is defined in ./slices/ for better maintainability.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Message, Session, Settings, View } from '../types';
import { STORAGE_KEYS, DEFAULT_SETTINGS, LIMITS, GEMINI_MODELS, DEFAULT_GEMINI_MODEL } from '../constants';

import {
  isValidUrl,
  isValidApiKey,
  sanitizeContent,
  sanitizeTitle,
} from '../utils/validators';
import type { AppState } from '../types';

// Extended AppState with pagination
interface PaginationState {
  messagesPerPage: number;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  setMessagesPerPage: (count: number) => void;
}

type AppStateWithPagination = AppState & PaginationState;

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useAppStore = create<AppStateWithPagination>()(
  persist(
    (set) => ({
      // ========================================
      // UI State
      // ========================================
      count: 0,
      theme: 'dark',
      provider: 'llama',
      currentView: 'chat' as View,

      // ========================================
      // Pagination State
      // ========================================
      messagesPerPage: 50,
      currentPage: 0,

      setCurrentPage: (page) => set({ currentPage: Math.max(0, page) }),
      setMessagesPerPage: (count) => set({
        messagesPerPage: Math.max(10, Math.min(count, 200)),
        currentPage: 0 // Reset to first page when changing page size
      }),

      setCurrentView: (view: View) => set({ currentView: view }),

      setProvider: (provider) => set({ provider }),

      increment: () =>
        set((state) => ({
          count: Math.min(state.count + 1, 999999),
        })),

      decrement: () =>
        set((state) => ({
          count: Math.max(state.count - 1, 0),
        })),

      reset: () => set({ count: 0 }),

      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === 'dark' ? 'light' : 'dark',
        })),

      // ========================================
      // Session State
      // ========================================
      sessions: [],
      currentSessionId: null,

      createSession: () => {
        const id = crypto.randomUUID();
        const newSession: Session = {
          id,
          title: 'New Chat',
          createdAt: Date.now(),
        };

        set((state) => {
          let sessions = [newSession, ...state.sessions];

          if (sessions.length > LIMITS.MAX_SESSIONS) {
            const removedIds = sessions.slice(LIMITS.MAX_SESSIONS).map((s) => s.id);
            sessions = sessions.slice(0, LIMITS.MAX_SESSIONS);

            const newHistory = { ...state.chatHistory };
            removedIds.forEach((removedId) => delete newHistory[removedId]);

            return {
              sessions,
              currentSessionId: id,
              chatHistory: { ...newHistory, [id]: [] },
            };
          }

          return {
            sessions,
            currentSessionId: id,
            chatHistory: { ...state.chatHistory, [id]: [] },
          };
        });
      },

      deleteSession: (id) =>
        set((state) => {
          const newSessions = state.sessions.filter((s) => s.id !== id);
          const newHistory = { ...state.chatHistory };
          delete newHistory[id];

          let newCurrentId = state.currentSessionId;
          if (state.currentSessionId === id) {
            newCurrentId = newSessions.length > 0 ? newSessions[0].id : null;
          }

          return {
            sessions: newSessions,
            chatHistory: newHistory,
            currentSessionId: newCurrentId,
          };
        }),

      selectSession: (id) =>
        set((state) => {
          const exists = state.sessions.some((s) => s.id === id);
          if (!exists) return state;
          return { currentSessionId: id };
        }),

      updateSessionTitle: (id, title) =>
        set((state) => {
          const sanitizedTitle = sanitizeTitle(title, LIMITS.MAX_TITLE_LENGTH);
          if (!sanitizedTitle) return state;

          return {
            sessions: state.sessions.map((s) =>
              s.id === id ? { ...s, title: sanitizedTitle } : s
            ),
          };
        }),

      // ========================================
      // Chat State
      // ========================================
      chatHistory: {},

      addMessage: (msg) =>
        set((state) => {
          if (!state.currentSessionId) return state;

          const sanitizedMsg: Message = {
            ...msg,
            content: sanitizeContent(msg.content, LIMITS.MAX_CONTENT_LENGTH),
          };

          const currentMessages = state.chatHistory[state.currentSessionId] || [];

          let updatedMessages = [...currentMessages, sanitizedMsg];
          if (updatedMessages.length > LIMITS.MAX_MESSAGES_PER_SESSION) {
            updatedMessages = updatedMessages.slice(-LIMITS.MAX_MESSAGES_PER_SESSION);
          }

          let updatedSessions = state.sessions;
          if (msg.role === 'user' && currentMessages.length === 0) {
            const title = sanitizeTitle(
              msg.content.substring(0, 30) + (msg.content.length > 30 ? '...' : ''),
              LIMITS.MAX_TITLE_LENGTH
            );
            updatedSessions = state.sessions.map((s) =>
              s.id === state.currentSessionId ? { ...s, title } : s
            );
          }

          return {
            chatHistory: {
              ...state.chatHistory,
              [state.currentSessionId]: updatedMessages,
            },
            sessions: updatedSessions,
          };
        }),

      updateLastMessage: (content) =>
        set((state) => {
          if (!state.currentSessionId) return state;
          const messages = state.chatHistory[state.currentSessionId] || [];
          if (messages.length === 0) return state;

          const newMessages = [...messages];
          const lastMsg = newMessages[newMessages.length - 1];

          const newContent = sanitizeContent(
            lastMsg.content + content,
            LIMITS.MAX_CONTENT_LENGTH
          );

          newMessages[newMessages.length - 1] = {
            ...lastMsg,
            content: newContent,
          };

          return {
            chatHistory: {
              ...state.chatHistory,
              [state.currentSessionId]: newMessages,
            },
          };
        }),

      clearHistory: () =>
        set((state) => {
          if (!state.currentSessionId) return state;
          return {
            chatHistory: {
              ...state.chatHistory,
              [state.currentSessionId]: [],
            },
          };
        }),

      // ========================================
      // Settings State
      // ========================================
      settings: DEFAULT_SETTINGS,

      updateSettings: (newSettings) =>
        set((state) => {
          const validated: Partial<Settings> = {};

          if (newSettings.ollamaEndpoint !== undefined) {
            if (isValidUrl(newSettings.ollamaEndpoint)) {
              validated.ollamaEndpoint = newSettings.ollamaEndpoint;
            }
          }

          if (newSettings.geminiApiKey !== undefined) {
            if (isValidApiKey(newSettings.geminiApiKey)) {
              validated.geminiApiKey = newSettings.geminiApiKey;
            }
          }

          // Sync API key to sessionStorage (never localStorage)
          if (validated.geminiApiKey !== undefined) {
            if (typeof window !== 'undefined') {
              if (validated.geminiApiKey) {
                sessionStorage.setItem('gemini-api-key', validated.geminiApiKey);
              } else {
                sessionStorage.removeItem('gemini-api-key');
              }
            }
          }

          if (newSettings.systemPrompt !== undefined) {
            validated.systemPrompt = sanitizeContent(
              newSettings.systemPrompt,
              LIMITS.MAX_SYSTEM_PROMPT_LENGTH
            );
          }

          if (newSettings.selectedModel !== undefined) {
            const isValid = GEMINI_MODELS.some((m) => m.id === newSettings.selectedModel);
            if (isValid) {
              validated.selectedModel = newSettings.selectedModel;
            }
          }

          if (newSettings.useSwarm !== undefined) {
            validated.useSwarm = Boolean(newSettings.useSwarm);
          }

          return {
            settings: { ...state.settings, ...validated },
          };
        }),
    }),
    {
      name: STORAGE_KEYS.APP_STATE,
      partialize: (state) => ({
        count: state.count,
        theme: state.theme,
        currentView: state.currentView,
        sessions: state.sessions,
        currentSessionId: state.currentSessionId,
        chatHistory: state.chatHistory,
        settings: {
          ...state.settings,
          // SECURITY: Never persist API key to localStorage
          // Use sessionStorage or env vars instead
          geminiApiKey: '',
        },
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<AppStateWithPagination>;
        const merged = { ...current, ...p };
        // Ensure new settings fields have defaults when migrating from old schema
        if (p?.settings) {
          merged.settings = { ...DEFAULT_SETTINGS, ...p.settings };

          // Migrate invalid model names to correct ones
          const selectedModel = merged.settings.selectedModel;
          const validModelIds = GEMINI_MODELS.map(m => m.id);

          // Fix common incorrect model names
          if (selectedModel === 'gemini-3.0-flash') {
            merged.settings.selectedModel = 'gemini-3-pro-preview';
          } else if (selectedModel === 'gemini-3.0-pro') {
            merged.settings.selectedModel = 'gemini-3-pro-preview';
          } else if (!validModelIds.includes(selectedModel)) {
            // If model is not in the list, reset to default
            merged.settings.selectedModel = DEFAULT_GEMINI_MODEL;
          }
        }

        // Migration: clean up old [CONTEXT] messages, empty placeholders, and Jaskier prompt
        if (p?.chatHistory) {
          const cleanedHistory: Record<string, Message[]> = {};
          for (const [sessionId, messages] of Object.entries(p.chatHistory)) {
            if (Array.isArray(messages)) {
              cleanedHistory[sessionId] = messages.filter(
                (m) => m.content.trim().length > 0 && !m.content.startsWith('[CONTEXT]')
              );
            }
          }
          merged.chatHistory = cleanedHistory;
        }
        // Reset session titles that start with [CONTEXT]
        if (merged.sessions && Array.isArray(merged.sessions)) {
          merged.sessions = merged.sessions.map((s: Session) =>
            s.title.startsWith('[CONTEXT]') ? { ...s, title: 'New Chat' } : s
          );
        }
        if (merged.settings?.systemPrompt?.includes('Jaskier')) {
          merged.settings.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
        }

        // Restore API key from sessionStorage (not persisted in localStorage)
        const sessionApiKey = typeof window !== 'undefined'
          ? sessionStorage.getItem('gemini-api-key') ?? ''
          : '';
        if (sessionApiKey && merged.settings) {
          merged.settings.geminiApiKey = sessionApiKey;
        }

        return merged;
      },
    }
  )
);

// =============================================================================
// RE-EXPORTED SELECTORS (canonical definitions in ./selectors.ts)
// =============================================================================
// All selectors are defined once in ./selectors.ts and re-exported here
// for backward compatibility. New code should import from './selectors'
// or from the barrel '@/store'.
//
// NOTE: Selectors returning objects/arrays should be used with useShallow
// to prevent unnecessary re-renders:
//   import { useShallow } from 'zustand/shallow';
//   const sessions = useAppStore(useShallow(selectSessions));
//   const settings = useAppStore(useShallow(selectSettings));
//   const messages = useAppStore(useShallow(selectCurrentMessages));
//   const pagination = useAppStore(useShallow(selectPaginationInfo));
// Primitive selectors (string, number, boolean) do NOT need useShallow.

export {
  // Basic state
  selectTheme,
  selectProvider,
  selectCount,
  selectCurrentSessionId,
  selectCurrentView,
  // Settings
  selectSettings,
  selectIsApiKeySet,
  selectOllamaEndpoint,
  selectSystemPrompt,
  selectDefaultProvider,
  selectUseSwarm,
  selectGeminiApiKey,
  // Sessions
  selectSessions,
  selectSessionById,
  selectCurrentSession,
  selectSessionCount,
  selectSessionHasMessages,
  selectSessionMetadata,
  // Messages
  selectChatHistory,
  selectCurrentMessages,
  selectMessagesBySessionId,
  selectMessageCount,
  selectMessageCountBySessionId,
  selectHasMessages,
  selectLastMessage,
  selectLastMessageBySessionId,
  // Composite
  selectIsAppReady,
  selectApiConfigStatus,
  selectRuntimeSettings,
  // Pagination
  selectPaginatedMessages,
  selectTotalPages,
  selectPaginationInfo,
} from './selectors';

export default useAppStore;

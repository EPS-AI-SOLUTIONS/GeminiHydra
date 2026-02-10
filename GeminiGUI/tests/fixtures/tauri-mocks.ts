/**
 * Tauri API Mocks for Playwright E2E Tests
 *
 * Pre-seeds window.__TAURI_MOCK__ and window.__TAURI_INTERNALS__ BEFORE
 * the app bundle loads. The Vite-aliased mock (src/mocks/tauri.ts) will
 * find this pre-seeded state via getOrCreateMockState() and use it,
 * ensuring both Playwright tests and app code share the SAME event
 * listeners and invoke results.
 */

import type { Page } from '@playwright/test';

// Types for mock system
interface MockInvokeHandlers {
  [command: string]: unknown;
}

interface StreamPayload {
  chunk: string;
  done: boolean;
  error?: string;
}

interface MemoryEntry {
  id: string;
  agent: string;
  content: string;
  timestamp: number;
  importance: number;
}

interface KnowledgeGraph {
  nodes: Array<{ id: string; type: string; label: string }>;
  edges: Array<{ source: string; target: string; label: string }>;
}

// Default mock responses (JSON-serializable values only)
// Function-based handlers (run_system_command) are added by the Vite mock
export const DEFAULT_MOCK_RESPONSES: Record<string, unknown> = {
  greet: 'Test Mode Active - GeminiGUI',
  spawn_swarm_agent_v2: null,
  get_ollama_models: ['qwen3:4b', 'qwen3:4b', 'qwen3:1.7b'],
  get_gemini_models: ['gemini-3-flash-preview', 'gemini-3-pro-preview'],
  get_gemini_models_sorted: ['gemini-3-flash-preview', 'gemini-3-pro-preview'],
  get_bridge_state: { requests: [], auto_approve: false },
  set_auto_approve: true,
  approve_request: true,
  reject_request: true,
  get_agent_memories: [] as MemoryEntry[],
  add_agent_memory: true,
  clear_agent_memories: true,
  get_knowledge_graph: { nodes: [], edges: [] } as KnowledgeGraph,
  add_knowledge_node: true,
  add_knowledge_edge: true,
  save_file_content: true,
  get_env_vars: {},
  start_ollama_server: true,
  prompt_ollama: 'Mock Ollama response',
  prompt_ollama_stream: null,
  prompt_gemini_stream: null,
};

/**
 * Creates the Tauri mock pre-seed script for page.addInitScript().
 *
 * This runs BEFORE any app JavaScript. It sets up:
 * 1. window.__TAURI_MOCK__ with invokeResults, eventListeners, invokeHistory
 * 2. window.__TAURI_INTERNALS__ for isTauri guards
 * 3. Helper functions for Playwright test control
 *
 * When the Vite mock module loads later, its getOrCreateMockState() finds
 * the existing window.__TAURI_MOCK__ and reuses it (merging function-based
 * defaults that can't be JSON-serialized here).
 */
export function createTauriMockScript(customHandlers: Partial<MockInvokeHandlers> = {}): string {
  // Filter out function values since JSON.stringify drops them
  const serializableHandlers: Record<string, unknown> = {};
  const merged = { ...DEFAULT_MOCK_RESPONSES, ...customHandlers };
  for (const [key, value] of Object.entries(merged)) {
    if (typeof value !== 'function') {
      serializableHandlers[key] = value;
    }
  }

  const handlersJson = JSON.stringify(serializableHandlers);

  return `
    (function() {
      // Pre-seed the shared mock state BEFORE the Vite mock module loads.
      // The Vite mock's getOrCreateMockState() checks for this and reuses it.
      window.__TAURI_MOCK__ = {
        eventListeners: new Map(),
        invokeResults: ${handlersJson},
        invokeHistory: [],
      };

      // Pre-seed __TAURI_INTERNALS__ for isTauri guards in the app.
      // The Vite mock's ensureTauriInternals() checks for this and keeps it.
      window.__TAURI_INTERNALS__ = {
        invoke: async function(cmd, args) {
          // Fallback invoke (overwritten by Vite mock at module load)
          var mock = window.__TAURI_MOCK__;
          mock.invokeHistory.push({ cmd: cmd, args: args, timestamp: Date.now() });
          var handler = mock.invokeResults[cmd];
          if (typeof handler === 'function') return handler(args);
          if (handler !== undefined) return handler;
          console.warn('[Tauri Mock Pre-seed] Unmocked command:', cmd);
          return null;
        }
      };

      // Helper for Playwright tests to emit events to the shared listener Map
      window.__emitTauriEvent = function(eventName, payload) {
        var mock = window.__TAURI_MOCK__;
        var listeners = mock.eventListeners.get(eventName);
        if (listeners) {
          listeners.forEach(function(handler) {
            handler({ payload: payload });
          });
        }
      };

      // Helper to set mock invoke result dynamically during tests
      window.__setMockInvokeResult = function(cmd, result) {
        window.__TAURI_MOCK__.invokeResults[cmd] = result;
      };

      // Helper to get invoke history for assertions
      window.__getInvokeHistory = function() {
        return window.__TAURI_MOCK__.invokeHistory;
      };

      // Helper to clear invoke history
      window.__clearInvokeHistory = function() {
        window.__TAURI_MOCK__.invokeHistory = [];
      };

      console.log('[Tauri Mock] Pre-seeded for Playwright tests');
    })();
  `;
}

/**
 * Inject Tauri mocks into a Playwright page
 */
export async function injectTauriMocks(
  page: Page,
  customHandlers: Partial<MockInvokeHandlers> = {}
): Promise<void> {
  await page.addInitScript(createTauriMockScript(customHandlers));
}

/**
 * Emit a Tauri event from test code
 */
export async function emitTauriEvent(
  page: Page,
  eventName: string,
  payload: unknown
): Promise<void> {
  await page.evaluate(
    ([name, data]) => {
      (window as any).__emitTauriEvent(name, data);
    },
    [eventName, payload]
  );
}

/**
 * Set a mock invoke result from test code
 */
export async function setMockInvokeResult(
  page: Page,
  command: string,
  result: unknown
): Promise<void> {
  await page.evaluate(
    ([cmd, res]) => {
      (window as any).__setMockInvokeResult(cmd, res);
    },
    [command, result]
  );
}

/**
 * Get invoke history for assertions
 */
export async function getInvokeHistory(
  page: Page
): Promise<Array<{ cmd: string; args: unknown; timestamp: number }>> {
  return page.evaluate(() => (window as any).__getInvokeHistory());
}

/**
 * Clear invoke history
 */
export async function clearInvokeHistory(page: Page): Promise<void> {
  await page.evaluate(() => (window as any).__clearInvokeHistory());
}

/**
 * Emit a stream chunk event (for streaming responses)
 */
export async function emitStreamChunk(
  page: Page,
  chunk: string,
  done: boolean = false,
  eventType: 'ollama-event' | 'swarm-data' | 'gemini-stream' = 'swarm-data'
): Promise<void> {
  const payload: StreamPayload = { chunk, done };
  await emitTauriEvent(page, eventType, payload);
}

/**
 * Emit a stream error event
 */
export async function emitStreamError(
  page: Page,
  error: string,
  eventType: 'ollama-event' | 'swarm-data' | 'gemini-stream' = 'swarm-data'
): Promise<void> {
  const payload: StreamPayload = { chunk: '', done: true, error };
  await emitTauriEvent(page, eventType, payload);
}

/**
 * Mock memories for the memory panel
 */
export function createMockMemories(count: number = 5): MemoryEntry[] {
  const agents = ['Dijkstra', 'Geralt', 'Yennefer', 'Triss', 'Jaskier'];
  return Array.from({ length: count }, (_, i) => ({
    id: `memory-${i}`,
    agent: agents[i % agents.length],
    content: `Test memory content #${i + 1}`,
    timestamp: Date.now() / 1000 - i * 3600,
    importance: Math.random(),
  }));
}

/**
 * Mock knowledge graph
 */
export function createMockKnowledgeGraph(): KnowledgeGraph {
  return {
    nodes: [
      { id: 'node-1', type: 'concept', label: 'Test Concept' },
      { id: 'node-2', type: 'entity', label: 'Test Entity' },
      { id: 'node-3', type: 'action', label: 'Test Action' },
    ],
    edges: [
      { source: 'node-1', target: 'node-2', label: 'relates_to' },
      { source: 'node-2', target: 'node-3', label: 'triggers' },
    ],
  };
}

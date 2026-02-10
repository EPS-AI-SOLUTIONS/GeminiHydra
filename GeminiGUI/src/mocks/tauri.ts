/**
 * UNIVERSAL TAURI MOCK - WINDOW BRIDGE EDITION
 *
 * Stores ALL state on window.__TAURI_MOCK__ so that both:
 * - Vite-aliased app code (compile-time mock)
 * - Playwright test helpers (runtime mock via page.evaluate)
 * operate on the SAME event listeners and invoke results.
 *
 * Also sets window.__TAURI_INTERNALS__ so isTauri guards pass.
 */

// --- Agent Personas for Swarm Simulation ---
const AGENTS = [
  { name: 'Dijkstra', msg: 'Analizuję cel strategiczny...' },
  { name: 'Vesemir', msg: 'Weryfikuję plan pod kątem zgodności z kodeksem...' },
  { name: 'Geralt', msg: 'Skanuję w poszukiwaniu zagrożeń (Security VETO)... Bezpiecznie.' },
  { name: 'Yennefer', msg: 'Optymalizuję architekturę rozwiązania...' },
  { name: 'Triss', msg: 'Przygotowuję scenariusze testowe...' },
  { name: 'Ciri', msg: 'Szybka podróż przez system plików...' },
  { name: 'Eskel', msg: 'Sprawdzam zależności npm...' },
  { name: 'Lambert', msg: 'Debuguję... Cholera, znowu null pointer.' },
  { name: 'Zoltan', msg: 'Przeliczam dane. Zgadza się co do grajcara.' },
  { name: 'Regis', msg: 'Syntezuję wiedzę z dostępnych źródeł...' },
  { name: 'Philippa', msg: 'Nawiązuję połączenie z API...' },
  { name: 'Jaskier', msg: 'Oto opowieść o naszym zwycięstwie! (Podsumowanie)' },
];

// --- Shared State on Window ---

interface MockState {
  eventListeners: Map<string, Set<Function>>;
  invokeResults: Record<string, any>;
  invokeHistory: Array<{ cmd: string; args: any; timestamp: number }>;
}

/**
 * Get or create the shared mock state on window.__TAURI_MOCK__.
 * If Playwright pre-seeded the state via addInitScript, we reuse it.
 * Otherwise we create a fresh one (dev mode without Playwright).
 */
function getOrCreateMockState(): MockState {
  const w = globalThis as any;
  if (!w.__TAURI_MOCK__) {
    w.__TAURI_MOCK__ = {
      eventListeners: new Map<string, Set<Function>>(),
      invokeResults: {} as Record<string, any>,
      invokeHistory: [] as Array<{ cmd: string; args: any; timestamp: number }>,
    };
  }

  // Merge default responses (function-based ones can't be pre-seeded via JSON)
  const r = w.__TAURI_MOCK__.invokeResults;
  if (r.greet === undefined) r.greet = 'Test Mode Active - GeminiGUI';
  if (r.run_system_command === undefined) {
    r.run_system_command = (args: any) => `[MOCK CMD] Executed: ${args?.command}`;
  }
  if (r.get_bridge_state === undefined) r.get_bridge_state = { auto_approve: true, requests: [] };
  if (r.get_env_vars === undefined) r.get_env_vars = { GEMINI_API_KEY: 'test-key-123' };
  if (r.get_ollama_models === undefined) r.get_ollama_models = ['llama3-wolf-edition', 'qwen-yennefer-tuned'];
  if (r.get_gemini_models === undefined) r.get_gemini_models = ['gemini-pro-kaer-morhen'];
  if (r.get_gemini_models_sorted === undefined) r.get_gemini_models_sorted = ['gemini-3-flash-preview', 'gemini-3-pro-preview'];
  if (r.get_agent_memories === undefined) r.get_agent_memories = [];
  if (r.get_knowledge_graph === undefined) r.get_knowledge_graph = { nodes: [], edges: [] };
  if (r.save_file_content === undefined) r.save_file_content = true;
  if (r.set_auto_approve === undefined) r.set_auto_approve = true;
  if (r.approve_request === undefined) r.approve_request = true;
  if (r.reject_request === undefined) r.reject_request = true;
  if (r.add_agent_memory === undefined) r.add_agent_memory = true;
  if (r.clear_agent_memories === undefined) r.clear_agent_memories = true;
  if (r.add_knowledge_node === undefined) r.add_knowledge_node = true;
  if (r.add_knowledge_edge === undefined) r.add_knowledge_edge = true;
  if (r.start_ollama_server === undefined) r.start_ollama_server = true;
  if (r.prompt_ollama === undefined) r.prompt_ollama = 'Mock Ollama response';
  if (r.prompt_ollama_stream === undefined) r.prompt_ollama_stream = null;
  if (r.prompt_gemini_stream === undefined) r.prompt_gemini_stream = null;
  if (r.spawn_swarm_agent_v2 === undefined) r.spawn_swarm_agent_v2 = null;

  return w.__TAURI_MOCK__;
}

/**
 * Set window.__TAURI_INTERNALS__ so that isTauri guards in the app pass.
 */
function ensureTauriInternals() {
  const w = globalThis as any;
  if (!w.__TAURI_INTERNALS__) {
    w.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: any) => invoke(cmd, args),
    };
  }
}

// --- Event System (shared via window.__TAURI_MOCK__) ---

const emit = (event: string, payload: any) => {
  const mock = getOrCreateMockState();
  const callbacks = mock.eventListeners.get(event);
  if (callbacks) callbacks.forEach((cb) => cb({ payload }));
};

export const listen = async (event: string, callback: Function) => {
  const mock = getOrCreateMockState();
  if (!mock.eventListeners.has(event)) {
    mock.eventListeners.set(event, new Set());
  }
  mock.eventListeners.get(event)!.add(callback);
  return () => {
    mock.eventListeners.get(event)?.delete(callback);
  };
};

// --- Core Invoke (shared via window.__TAURI_MOCK__) ---

export const invoke = async (cmd: string, args: any = {}) => {
  const mock = getOrCreateMockState();
  mock.invokeHistory.push({ cmd, args, timestamp: Date.now() });

  // Check for dynamic handler/value
  const handler = mock.invokeResults[cmd];
  if (typeof handler === 'function') {
    return handler(args);
  }
  if (handler !== undefined) {
    return handler;
  }

  // Special: Swarm simulation with sequential agent events
  if (cmd === 'spawn_swarm_agent' || cmd === 'spawn_swarm_agent_v2') {
    setTimeout(() => emit('swarm-data', { chunk: `[SYSTEM] Cel: ${args.objective}\n\n`, done: false }), 100);
    let delay = 200;
    AGENTS.forEach((agent) => {
      setTimeout(() => {
        emit('swarm-data', { chunk: `**[${agent.name}]**: ${agent.msg}\n`, done: false });
      }, delay);
      delay += 150;
    });
    setTimeout(() => emit('swarm-data', { chunk: `\n[SWARM COMPLETED]\n`, done: true }), delay + 200);
    return;
  }

  console.warn('[TAURI MOCK] Unmocked command:', cmd);
  return null;
};

// --- Window System ---

export const getCurrentWindow = () => ({
  label: 'main',
  show: async () => {},
  onClose: async () => {},
});

export const WebviewWindow = {
  getByLabel: async (_label: string) => {
    return { show: async () => {} };
  },
};

// --- Export Structure (matches @tauri-apps/api module paths) ---

export const core = { invoke };
export const event = { listen, emit };
// Use a different name to avoid shadowing globalThis.window
const windowExport = { getCurrentWindow };
export { windowExport as window };
export const webviewWindow = { WebviewWindow };

// --- Initialize on module load ---

if (typeof globalThis !== 'undefined') {
  getOrCreateMockState();
  ensureTauriInternals();

  // Also provide __emitTauriEvent helper for Playwright (if not already set)
  const w = globalThis as any;
  if (!w.__emitTauriEvent) {
    w.__emitTauriEvent = (eventName: string, payload: any) => {
      emit(eventName, payload);
    };
  }
  if (!w.__setMockInvokeResult) {
    w.__setMockInvokeResult = (cmd: string, result: any) => {
      w.__TAURI_MOCK__.invokeResults[cmd] = result;
    };
  }
  if (!w.__getInvokeHistory) {
    w.__getInvokeHistory = () => w.__TAURI_MOCK__.invokeHistory;
  }
  if (!w.__clearInvokeHistory) {
    w.__clearInvokeHistory = () => { w.__TAURI_MOCK__.invokeHistory = []; };
  }

  console.log('[TAURI MOCK] Initialized with window bridge');
}

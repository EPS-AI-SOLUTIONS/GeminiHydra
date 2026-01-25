/**
 * UNIVERSAL TAURI MOCK - SWARM EDITION
 * Simulates the 12-agent "Wolf Swarm" logic for E2E testing.
 */

console.log('[TAURI MOCK] Initializing Wolf Swarm Simulator...');

// --- Event System ---
const listeners = new Map<string, Set<Function>>();

const emit = (event: string, payload: any) => {
  const callbacks = listeners.get(event);
  if (callbacks) callbacks.forEach((cb) => cb({ payload }));
};

export const listen = async (event: string, callback: Function) => {
  // console.log(`[TAURI MOCK] listen: ${event}`); // Reduce noise
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)?.add(callback);
  return () => listeners.get(event)?.delete(callback);
};

// --- Agent Personas for Simulation ---
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
  { name: 'Jaskier', msg: 'Oto opowieść o naszym zwycięstwie! (Podsumowanie)' }
];

// --- Core System ---
export const invoke = async (cmd: string, args: any = {}) => {
  console.log(`[TAURI MOCK] invoke: ${cmd}`, JSON.stringify(args).substring(0, 50));
  
  if (cmd === 'spawn_swarm_agent') {
    console.log('[TAURI MOCK] 🐺 UNLEASHING THE SWARM');
    
    // 1. Initial Prompt
    setTimeout(() => emit('swarm-data', { chunk: `[SYSTEM] Cel: ${args.objective}\n\n`, done: false }), 100);

    // 2. Simulate Agents responding in sequence
    let delay = 200;
    AGENTS.forEach((agent) => {
      setTimeout(() => {
        emit('swarm-data', { 
          chunk: `**[${agent.name}]**: ${agent.msg}\n`, 
          done: false 
        });
      }, delay);
      delay += 150; // Fast sequence for tests
    });

    // 3. Finish
    setTimeout(() => emit('swarm-data', { chunk: `\n[SWARM COMPLETED]\n`, done: true }), delay + 200);
    return;
  }

  if (cmd === 'run_system_command') {
    return `[MOCK CMD] Executed: ${args.command}`;
  }
  
  const mocks: Record<string, any> = {
    get_bridge_state: { auto_approve: true, requests: [] },
    get_env_vars: { GEMINI_API_KEY: 'test-key-123' },
    get_ollama_models: ['llama3-wolf-edition', 'qwen-yennefer-tuned'],
    get_gemini_models: ['gemini-pro-kaer-morhen'],
    get_agent_memories: [],
    get_knowledge_graph: { nodes: [], edges: [] },
  };

  return mocks[cmd] || null;
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
  }
};

// --- Export Structure ---
export const core = { invoke };
export const event = { listen, emit };
export const window = { getCurrentWindow };
export const webviewWindow = { WebviewWindow };
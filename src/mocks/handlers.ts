// src/mocks/handlers.ts
// MSW v2 handlers for GeminiHydra Vitest tests (B1142-T09)
// Mirrors the GeminiHydra Rust/Axum backend routes (port 8081, gh_* tables)
import { HttpResponse, http } from 'msw';

export const handlers = [
  // ── Health ────────────────────────────────────────────────────────────────
  http.get('/api/health', () =>
    HttpResponse.json({
      status: 'ok',
      version: '1.0.0',
      app: 'geminihydra',
      providers: ['google'],
    }),
  ),
  http.get('/api/health/ready', () => HttpResponse.json({ ready: true })),
  http.get('/api/health/detailed', () =>
    HttpResponse.json({
      status: 'ok',
      database: 'ok',
      pgvector: 'ok',
      uptime_secs: 42,
    }),
  ),
  http.get('/api/v1/health', () => HttpResponse.json({ status: 'ok', version: '1.0.0' })),
  http.get('/api/v1/health/ready', () => HttpResponse.json({ ready: true })),

  // ── Auth mode ─────────────────────────────────────────────────────────────
  http.get('/api/auth/mode', () =>
    HttpResponse.json({ mode: 'password', providers: ['password', 'google', 'github'] }),
  ),
  http.get('/api/v1/auth/mode', () =>
    HttpResponse.json({ mode: 'password', providers: ['password', 'google', 'github'] }),
  ),
  http.get('/api/auth/status', () =>
    HttpResponse.json({
      authenticated: true,
      user: { id: 'test-user-id', email: 'test@example.com', name: 'Test User' },
    }),
  ),
  http.post('/api/auth/login', () =>
    HttpResponse.json({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 900,
    }),
  ),
  http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })),
  http.get('/api/auth/apikey', () => HttpResponse.json({ api_key: 'mock-api-key-gemini' })),

  // ── Google OAuth ──────────────────────────────────────────────────────────
  http.get('/api/auth/google/status', () => HttpResponse.json({ connected: false, has_api_key: false })),
  http.get('/api/auth/google/login', () =>
    HttpResponse.json({ url: 'https://accounts.google.com/o/oauth2/auth?mock=1' }),
  ),
  http.get('/api/auth/google/redirect', () => HttpResponse.json({ connected: true })),
  http.post('/api/auth/google/logout', () => new HttpResponse(null, { status: 204 })),
  http.get('/api/auth/google/apikey', () => HttpResponse.json({ api_key: 'mock-google-api-key' })),

  // ── GitHub OAuth ──────────────────────────────────────────────────────────
  http.get('/api/auth/github/status', () => HttpResponse.json({ connected: false })),
  http.get('/api/auth/github/login', () =>
    HttpResponse.json({ url: 'https://github.com/login/oauth/authorize?mock=1' }),
  ),
  http.get('/api/auth/github/callback', () => HttpResponse.json({ connected: true })),
  http.post('/api/auth/github/logout', () => new HttpResponse(null, { status: 204 })),

  // ── Vercel OAuth ──────────────────────────────────────────────────────────
  http.get('/api/auth/vercel/status', () => HttpResponse.json({ connected: false })),
  http.get('/api/auth/vercel/login', () => HttpResponse.json({ url: 'https://vercel.com/oauth/authorize?mock=1' })),
  http.get('/api/auth/vercel/callback', () => HttpResponse.json({ connected: true })),
  http.post('/api/auth/vercel/logout', () => new HttpResponse(null, { status: 204 })),

  // ── Models (Google Gemini — gh_model_pins) ────────────────────────────────
  http.get('/api/models', () =>
    HttpResponse.json({
      models: [
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview', use_case: 'chat' },
        { id: 'gemini-3-flash', name: 'Gemini 3 Flash', use_case: 'fast' },
        { id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image', use_case: 'image' },
      ],
      default_model: 'gemini-3.1-pro-preview',
    }),
  ),
  http.post('/api/models/refresh', () => HttpResponse.json({ refreshed: true, model_count: 3 })),
  http.post('/api/models/pin', () =>
    HttpResponse.json({ use_case: 'chat', model_id: 'gemini-3.1-pro-preview', pinned: true }),
  ),
  http.delete('/api/models/pin/:use_case', () => new HttpResponse(null, { status: 204 })),
  http.get('/api/models/pins', () => HttpResponse.json({ pins: [] })),
  // Gemini models alias route
  http.get('/api/gemini/models', () =>
    HttpResponse.json({
      models: [
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro Preview' },
        { id: 'gemini-3-flash', name: 'Gemini 3 Flash' },
      ],
    }),
  ),

  // ── Sessions (gh_sessions, gh_chat_messages) ──────────────────────────────
  http.get('/api/sessions', () => HttpResponse.json({ sessions: [] })),
  http.post('/api/sessions', () =>
    HttpResponse.json({
      id: 'test-session-id',
      title: 'Test Session',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  ),
  http.get('/api/sessions/:id', () =>
    HttpResponse.json({
      id: 'test-session-id',
      title: 'Test Session',
      created_at: new Date().toISOString(),
    }),
  ),
  http.delete('/api/sessions/:id', () => new HttpResponse(null, { status: 204 })),
  http.get('/api/sessions/:id/messages', () => HttpResponse.json({ messages: [] })),
  http.post('/api/sessions/:id/generate-title', () => HttpResponse.json({ title: 'Generated Title' })),
  http.post('/api/sessions/:id/unlock', () => HttpResponse.json({ unlocked: true })),
  http.get('/api/sessions/:id/working-directory', () => HttpResponse.json({ path: '/tmp/test' })),
  http.put('/api/sessions/:id/working-directory', () => HttpResponse.json({ path: '/tmp/test' })),

  // ── History (gh_chat_messages) ────────────────────────────────────────────
  http.get('/api/history', () => HttpResponse.json({ history: [], total: 0 })),
  http.delete('/api/history', () => new HttpResponse(null, { status: 204 })),
  http.get('/api/history/search', () => HttpResponse.json({ results: [], total: 0 })),

  // ── Settings (gh_settings) ────────────────────────────────────────────────
  http.get('/api/settings', () =>
    HttpResponse.json({
      default_model: 'gemini-3.1-pro-preview',
      theme: 'dark',
      language: 'pl',
    }),
  ),
  http.put('/api/settings', () => HttpResponse.json({ saved: true })),
  http.post('/api/settings/reset', () => HttpResponse.json({ reset: true })),

  // ── Memory & Knowledge Graph (gh_memories, gh_knowledge_nodes/edges) ──────
  http.get('/api/memory/memories', () => HttpResponse.json({ memories: [] })),
  http.post('/api/memory/memories', () =>
    HttpResponse.json({ id: 'mem-1', content: 'test memory', created_at: new Date().toISOString() }),
  ),
  http.delete('/api/memory/memories/:id', () => new HttpResponse(null, { status: 204 })),
  http.get('/api/memory/graph', () => HttpResponse.json({ nodes: [], edges: [] })),
  http.post('/api/memory/graph/nodes', () => HttpResponse.json({ id: 'node-1', label: 'test', type: 'concept' })),
  http.post('/api/memory/graph/edges', () =>
    HttpResponse.json({ id: 'edge-1', source: 'node-1', target: 'node-2', label: 'relates_to' }),
  ),

  // ── Ratings ───────────────────────────────────────────────────────────────
  http.post('/api/ratings', () => HttpResponse.json({ rated: true })),

  // ── Prompt History (gh_prompt_history) ────────────────────────────────────
  http.get('/api/prompt-history', () => HttpResponse.json({ prompts: [] })),
  http.post('/api/prompt-history', () =>
    HttpResponse.json({ id: 'hist-1', prompt: 'test prompt', created_at: new Date().toISOString() }),
  ),
  http.delete('/api/prompt-history', () => new HttpResponse(null, { status: 204 })),

  // ── Logs (LogRingBuffer) ──────────────────────────────────────────────────
  http.get('/api/logs/backend', () => HttpResponse.json({ logs: [] })),

  // ── System ────────────────────────────────────────────────────────────────
  http.get('/api/system/stats', () => HttpResponse.json({ cpu: 0.1, memory_mb: 128, uptime_secs: 42 })),
  http.get('/api/system/audit', () => HttpResponse.json({ entries: [] })),
  http.post('/api/admin/rotate-key', () => HttpResponse.json({ rotated: true })),

  // ── Agents (gh_agents) ────────────────────────────────────────────────────
  http.get('/api/agents', () => HttpResponse.json({ agents: [] })),
  http.post('/api/agents', () =>
    HttpResponse.json({ id: 'agent-1', name: 'Test Agent', created_at: new Date().toISOString() }),
  ),
  http.get('/api/agents/profiles', () => HttpResponse.json({ profiles: [] })),
  http.post('/api/agents/classify', () => HttpResponse.json({ agent_id: 'agent-1', confidence: 0.9 })),
  http.get('/api/agents/delegations', () => HttpResponse.json({ delegations: [] })),
  http.post('/api/agents/delegations/stream', () => new HttpResponse(null, { status: 200 })),
  http.get('/api/agents/:id', () => HttpResponse.json({ id: 'agent-1', name: 'Test Agent' })),
  http.put('/api/agents/:id', () => HttpResponse.json({ id: 'agent-1', name: 'Updated Agent' })),
  http.delete('/api/agents/:id', () => new HttpResponse(null, { status: 204 })),

  // ── Service Tokens (gh_service_tokens) ────────────────────────────────────
  http.get('/api/tokens', () => HttpResponse.json({ tokens: [] })),
  http.post('/api/tokens', () => HttpResponse.json({ service: 'github', created: true })),
  http.delete('/api/tokens/:service', () => new HttpResponse(null, { status: 204 })),

  // ── Files ─────────────────────────────────────────────────────────────────
  http.post('/api/files/read', () => HttpResponse.json({ content: 'mock file content', path: '/tmp/test.txt' })),
  http.post('/api/files/list', () => HttpResponse.json({ files: [], directories: [] })),
  http.post('/api/files/browse', () => HttpResponse.json({ entries: [], path: '/tmp' })),

  // ── OCR ───────────────────────────────────────────────────────────────────
  http.post('/api/ocr', () => HttpResponse.json({ text: 'mock ocr text', confidence: 0.95 })),
  http.get('/api/ocr/history', () => HttpResponse.json({ history: [] })),
  http.delete('/api/ocr/history/:id', () => new HttpResponse(null, { status: 204 })),

  // ── Browser Proxy ─────────────────────────────────────────────────────────
  http.get('/api/browser-proxy/status', () => HttpResponse.json({ connected: false, url: null })),
  http.get('/api/browser-proxy/history', () => HttpResponse.json({ history: [] })),
  http.post('/api/browser-proxy/login', () => HttpResponse.json({ success: true })),
  http.get('/api/browser-proxy/login/status', () => HttpResponse.json({ logged_in: false })),
  http.post('/api/browser-proxy/reinit', () => HttpResponse.json({ reinitiated: true })),
  http.delete('/api/browser-proxy/logout', () => new HttpResponse(null, { status: 204 })),

  // ── MCP Servers (gh_mcp_servers) ─────────────────────────────────────────
  http.get('/api/mcp/servers', () => HttpResponse.json({ servers: [] })),
  http.post('/api/mcp/servers', () => HttpResponse.json({ id: 'mcp-1', name: 'Test MCP', connected: false })),
  http.get('/api/mcp/servers/:id', () => HttpResponse.json({ id: 'mcp-1', name: 'Test MCP', connected: false })),
  http.delete('/api/mcp/servers/:id', () => new HttpResponse(null, { status: 204 })),
  http.post('/api/mcp/servers/:id/connect', () => HttpResponse.json({ connected: true })),
  http.post('/api/mcp/servers/:id/disconnect', () => HttpResponse.json({ connected: false })),
  http.get('/api/mcp/servers/:id/tools', () => HttpResponse.json({ tools: [] })),
  http.get('/api/mcp/tools', () => HttpResponse.json({ tools: [] })),
  http.get('/api/mcp/agents/:id/permissions', () => HttpResponse.json({ permissions: [] })),
  http.put('/api/mcp/agents/:id/permissions', () => HttpResponse.json({ updated: true })),

  // ── Execute / Chat ────────────────────────────────────────────────────────
  http.post('/api/execute', () =>
    HttpResponse.json({
      id: 'exec-1',
      result: 'Mock response from Gemini',
      model: 'gemini-3.1-pro-preview',
      tokens_used: 42,
    }),
  ),
  http.post('/api/internal/tool', () => HttpResponse.json({ result: 'mock tool result' })),
];

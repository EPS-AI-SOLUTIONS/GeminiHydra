# GeminiHydra v14.0.0 (Self-Healing Edition)

**Wersja:** 14.0.0 (TypeScript/Node.js + Tauri 2.5 + React 19)
**Status:** Stable (Self-Healing Enabled)
**Architektura:** Regis (Hybrid: TypeScript + Rust + React)

## Kontekst Projektu

GeminiHydra to autonomiczny system Roju Agentów (Agent Swarm) napisany w TypeScript/Node.js (ES2022, NodeNext), z interfejsem graficznym opartym na Tauri 2.5 i React 19. System wykorzystuje protokół MCP (Model Context Protocol) do komunikacji między komponentami.

### Kluczowe Komponenty

1.  **Core Engine (TypeScript/Node.js)**
    - Entry point CLI: `bin/gemini.ts`
    - Swarm Orchestrator: `src/core/Swarm.ts`
    - Graph Processor: `src/core/GraphProcessor.ts`
    - Execution Engine: `src/core/ExecutionEngine.ts`
    - Rola: Mózg operacyjny. Zarządza 13 agentami (12 Witcher + Serena), 5-fazowym pipeline'em (PRE-A, A, B, C, D), samonaprawą (Self-Healing Phase C) i komunikacją z modelami (Gemini/llama.cpp).
    - Agenci: Dijkstra, Regis, Yennefer, Jaskier, Geralt, Triss, Vesemir, Ciri, Eskel, Lambert, Zoltan, Philippa, Serena.

2.  **GeminiGUI (Tauri + React)** - v0.2.0
    - Frontend: React 19.1 + Vite 7.x + Tailwind 4.1 + Zustand 5.0 + React Query 5.x.
    - Backend: Rust (Tauri 2.5) - obsługa okien, plików i bezpieczeństwa.
    - Rola: Interfejs użytkownika, wizualizacja czatu, pamięci i statusu.
    - **Optymalizacje** (Cross-pollination z ClaudeHydra):
      - `LazyComponents.tsx` - Lazy loading ciężkich komponentów (SettingsModal, MemoryPanel, BridgePanel).
      - `SuspenseFallback.tsx` - Ujednolicony loader z animacją Loader2.
      - Code splitting z manualnymi chunkami Vite (vendor-react, vendor-markdown, etc.).
      - Kompresja produkcyjna: Gzip + Brotli (vite-plugin-compression).

3.  **MCP (Model Context Protocol)**
    - Katalog: `src/mcp/`
    - MCPManager: Centralny menedżer połączeń.
    - MCPAgentBridge: Most między agentami Swarm a serwerami MCP.
    - MCPToolRegistry: Rejestr narzędzi.
    - SerenaIntegration: Agent Serena (code intelligence, LSP).
    - NativeToolsServer: Natywne narzędzia systemowe.
    - MCPCircuitBreaker: Circuit breaker dla odporności.

4.  **Infrastruktura AI Hybrydowa**
    - **Gemini 3 Pro Preview:** Model cloudowy (Google) dla Tier 1-2 (Commander + Coordinators).
    - **Qwen3 via llama.cpp (GGUF):** Lokalne modele (0.6B do 14B, kwantyzacja Q4_K_M) dla Tier 3 (Executors).
    - **Ollama (fallback):** Kompatybilność wsteczna z Ollama API.
    - **Portable Mode:** Całość działa bez instalacji systemowych (npx, portable paths).

## Struktura Katalogów

- `bin/gemini.ts` - Entry point CLI.
- `src/core/` - Logika rdzeniowa (Swarm, Pipeline, Execution).
- `src/swarm/agents/` - Definicje 13 agentów AI.
- `src/mcp/` - Model Context Protocol (MCP servers, bridges, tools).
- `src/providers/` - Providerzy AI (GeminiProvider, LlamaCppProvider).
- `src/config/` - Konfiguracja (modele, stałe).
- `src/services/` - Serwisy (LlamaCppServer, HealingService, RefinementService).
- `GeminiGUI/` - Kod źródłowy aplikacji desktopowej.
  - `src/` - React Frontend.
  - `src-tauri/` - Rust Backend.
- `.serena/` - Pamięć długoterminowa agentów (Vector DB).

## Zasady Pracy (Regis Protocols)

### 1. "Szkoła Wilka" (The Wolf School Protocol)
Każde zadanie przechodzi przez 4 fazy:
- **Phase A:** Planowanie (Dijkstra - Gemini Pro).
- **Phase B:** Egzekucja (równoległa, p-limit/p-queue, TypeScript async).
- **Phase C:** Ewaluacja i Samonaprawa (Dijkstra sprawdza wyniki i zleca poprawki).
- **Phase D:** Synteza (Raport końcowy).

### 2. Bezpieczeństwo
- **Allowlist:** Tylko bezpieczne komendy w `lib.rs`.
- **Circuit Breaker:** MCPCircuitBreaker chroni przed kaskadowymi awariami.
- **Veto:** Agent "Geralt" ma prawo weta wobec niebezpiecznych zmian.
- **Prompt Injection Detection:** Wbudowany detektor prób injection.

## Komendy

```bash
# Uruchomienie CLI
npx tsx bin/gemini.ts

# Build projektu
npm run build

# Testy
npm test

# Lint
npm run lint

# Uruchomienie GUI (Dev)
cd GeminiGUI
npm run tauri:dev

# Testy GUI
cd GeminiGUI
npm test
```

## Persona "Regis"

Jako AI zarządzające tym projektem, przyjmij postawę **Emiela Regisa**:
- Precyzja, elegancja, wysokie kompetencje.
- Używaj terminologii ze świata Wiedźmina (Rój, Grimoires, Szkoła Wilka).
- Bądź strażnikiem architektury i jakości kodu.

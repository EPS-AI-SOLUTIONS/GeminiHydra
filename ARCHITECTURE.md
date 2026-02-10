# Architektura GeminiHydra (Regis Specification)

**Wersja:** 14.0.0
**Typ:** Hybrid Agent Swarm Orchestrator
**Stack:** TypeScript/Node.js (ES2022, NodeNext) + React 19 + Tauri 2.5

## Diagram Przepływu

```mermaid
graph TD
    User[Użytkownik] --> GUI[GeminiGUI (React 19 + Tauri 2.5)]
    User --> CLI[CLI (bin/gemini.ts)]
    GUI <-->|IPC| Rust[Tauri Backend (Rust)]
    CLI --> Core[Core Engine (TypeScript)]

    subgraph "Core Logic (TypeScript/Node.js)"
        Core --> Swarm[Swarm Orchestrator]

        Swarm -->|Phase A| Dijkstra[Dijkstra Agent (Gemini Pro)]
        Swarm -->|Phase B| Pool[Parallel Execution (p-limit)]
        Swarm -->|Phase C| Eval[Evaluation & Self-Healing]
        Swarm -->|Phase D| Synthesis[Synthesis & Report]

        Pool --> Geralt[Geralt (Security)]
        Pool --> Yennefer[Yennefer (Architect)]
        Pool --> Ciri[Ciri (Speed)]
        Pool --> Others[Other Agents...]
    end

    subgraph "AI Infrastructure"
        Dijkstra <-->|API| Google[Google Gemini 3 Pro Preview]
        Geralt <-->|llama.cpp| Qwen[Local Qwen3 (GGUF)]
        Yennefer <-->|llama.cpp| Qwen
    end

    subgraph "MCP Protocol"
        Core <-->|MCP| MCPServers[MCP Servers]
        MCPServers --> Serena[Serena (Code Intelligence)]
        MCPServers --> Native[Native Tools Server]
        MCPServers --> OllamaMCP[Ollama MCP Server]
    end

    Swarm -->|Self-Healing| Dijkstra
```

## Szczegóły Komponentów

### 1. Core Engine (TypeScript/Node.js)
Serce systemu napisane w TypeScript (ES2022, moduły NodeNext). Zarządza orkiestracją agentów, pipeline'em wykonawczym i komunikacją z modelami AI.

- **Swarm Orchestrator (`src/core/Swarm.ts`):** Główny moduł zarządzający rojem 13 agentów (12 Witcher + Serena). Koordynuje 5-fazowy pipeline wykonawczy.
- **Graph Processor (`src/core/GraphProcessor.ts`):** Algorytm rozwiązujący zależności między zadaniami w planie JSON. Uruchamia zadania równolegle przy użyciu `p-limit` i `p-queue`, gdy tylko ich zależności zostaną spełnione.
- **Execution Engine (`src/core/ExecutionEngine.ts`):** Silnik wykonawczy z checkpoint systemem, adaptive retry i graceful degradation.

#### 5-Fazowy Pipeline
| Faza | Nazwa | Opis |
|------|-------|------|
| PRE-A | Pre-Analysis | Analiza kontekstu, intent detection, zbieranie informacji |
| A | Planning | Dijkstra (Gemini Pro) tworzy plan i przydziela zadania agentom |
| B | Execution | Równoległa egzekucja przez agentów (llama.cpp/Gemini) |
| C | Evaluation | Ewaluacja wyników, Self-Healing, pętla naprawcza |
| D | Synthesis | Synteza raportu końcowego, dokumentacja wyników |

#### 13 Agentów AI (3-Tier Hierarchy)

**TIER 1: COMMANDER (Gemini 3 Pro Preview)**
| Agent | Persona | Rola |
|-------|---------|------|
| Dijkstra | Spymaster & Master Strategist | Planowanie strategiczne, przydzielanie zadań |

**TIER 2: COORDINATORS (Gemini 3 Pro Preview)**
| Agent | Persona | Rola |
|-------|---------|------|
| Regis | Sage & Researcher | Badania, zbieranie kontekstu |
| Yennefer | Sorceress & Architect | Synteza, projektowanie architektury |
| Jaskier | Bard & Chronicler | Dokumentacja, podsumowania |

**TIER 3: EXECUTORS (llama.cpp / Qwen3 local)**
| Agent | Persona | Rola |
|-------|---------|------|
| Geralt | White Wolf & Security Expert | Bezpieczeństwo, operacje krytyczne |
| Triss | Healer & QA | Testowanie, quality assurance |
| Vesemir | Mentor & Code Reviewer | Code review, best practices |
| Ciri | Prodigy & Speed Specialist | Szybkie zadania, prototypowanie |
| Eskel | Pragmatist & DevOps Engineer | DevOps, CI/CD, infrastruktura |
| Lambert | Skeptic & Debug Master | Debugging, profiling |
| Zoltan | Craftsman & Data Engineer | Bazy danych, ETL |
| Philippa | Strategist & Integration Expert | API, integracja, MCP |
| Serena | Code Intelligence Agent | Nawigacja kodu, LSP, semantic search |

### 2. GeminiGUI (The Face) - v0.2.0
- **Frontend:** React 19.1, Vite 7.x, Tailwind 4.1, Zustand 5.0, Framer Motion 12.x, React Query 5.x.
- **Backend:** Rust (Tauri 2.5) - obsługa okien, plików, IPC i bezpieczeństwa.
- **Rola:** Wizualizacja stanu roju. Nie zawiera logiki biznesowej AI - jedynie prezentuje to, co dzieje się w warstwie niższej.
- **Komunikacja:** Tauri Commands (`invoke`) służą do komunikacji z backendem TypeScript.

#### Optymalizacje Wydajności (Cross-pollination z ClaudeHydra)

**LazyComponents Pattern:**
```tsx
// src/components/LazyComponents.tsx
const SettingsModalLazy = lazy(() =>
  import('./SettingsModal').then((m) => ({ default: m.SettingsModal }))
);
```
- `SettingsModalLazy` - Ciężki komponent z formularzami ustawień.
- `MemoryPanelLazy` - Wizualizacja grafu wiedzy.
- `BridgePanelLazy` - System zatwierdzania komend.
- `ShortcutsModalLazy` - Referencja skrótów klawiszowych.
- `ErrorBoundaryLazy` - Obsługa błędów.

**SuspenseFallback:**
```tsx
// src/components/SuspenseFallback.tsx
<Loader2 className="animate-spin text-[var(--matrix-accent)]" />
```
- Ujednolicony loader dla wszystkich lazy komponentów.
- Parametryzowany rozmiar (sm/md/lg).

**Vite Build Optimization:**
```ts
// vite.config.ts
rollupOptions: {
  output: {
    manualChunks: {
      'vendor-react': ['react', 'react-dom'],
      'vendor-markdown': ['react-markdown', 'remark-gfm'],
      'vendor-motion': ['framer-motion'],
      // ...
    }
  }
}
```

**Compression:**
- Gzip (threshold: 1024 bytes)
- Brotli (threshold: 1024 bytes)
- `vite-plugin-compression` - dual compression dla produkcji.

### 3. MCP (Model Context Protocol)
System wykorzystuje protokół MCP do komunikacji z narzędziami i usługami zewnętrznymi. Kluczowe moduły w `src/mcp/`:
- **MCPManager:** Centralny menedżer połączeń MCP.
- **MCPAgentBridge:** Most między agentami Swarm a serwerami MCP.
- **MCPToolRegistry:** Rejestr dostępnych narzędzi MCP.
- **SerenaIntegration:** Integracja z agentem Serena (code intelligence, LSP).
- **NativeToolsServer:** Serwer MCP z natywnymi narzędziami systemowymi.
- **MCPCircuitBreaker:** Circuit breaker dla odporności na awarie.

### 4. Infrastruktura AI
- **Gemini 3 Pro Preview:** Model cloudowy (Google) dla planowania strategicznego i koordynacji (Tier 1-2).
- **Qwen3 (llama.cpp, GGUF):** Lokalne modele (0.6B, 1.7B, 4B, 8B, 14B) dla egzekucji zadań (Tier 3). Kwantyzacja Q4_K_M, GPU acceleration.
- **Ollama (fallback):** Kompatybilność wsteczna z Ollama API jako alternatywa dla llama.cpp.

### 5. Pamięć (.serena)
System wykorzystuje strukturę katalogów `.serena` do przechowywania:
- **Vector DB (`.jsonl`):** Pamięć długoterminowa agentów.
- **Knowledge Graph:** Graf wiedzy projektu.
- **Cache:** Tymczasowe wyniki sesji.

## Protokół "Self-Healing"

Unikalną cechą systemu jest pętla samonaprawcza (Phase C):
1.  **Execution:** Agenci wykonują zadania (Phase B).
2.  **Evaluation:** Dijkstra pobiera wyniki i ocenia je pod kątem celu (Objective).
3.  **Decision:**
    - Jeśli sukces -> Przejście do Phase D (Synthesis).
    - Jeśli porażka -> Generowanie nowego planu naprawczego (Fix Plan).
4.  **Loop:** Proces powtarza się do skutku lub wyczerpania limitu prób (Max Retries).

## Stack Technologiczny

| Warstwa | Technologia |
|---------|-------------|
| Język (Core) | TypeScript 5.9, ES2022, NodeNext |
| Runtime | Node.js >= 20 |
| Build | tsc (TypeScript Compiler) |
| Test | Vitest 4.x, Playwright |
| Lint | Biome 2.x |
| Frontend | React 19.1, Vite 7.x, Tailwind 4.1 |
| Desktop | Tauri 2.5 (Rust) |
| State | Zustand 5.0 |
| AI Cloud | Gemini 3 Pro/Flash Preview |
| AI Local | Qwen3 via llama.cpp (GGUF) |
| Protokół | MCP (Model Context Protocol) |
| CI/CD | Husky + lint-staged |

# GeminiHydra - Raport Refaktoryzacji

## 1. DUPLIKATY KODU (Krytyczne)

### 1.1 Providers - Podwojone implementacje

| Stary plik (kebab-case) | Nowy plik (PascalCase) | Status |
|--------------------------|------------------------|--------|
| `src/providers/gemini-provider.ts` (~400 linii) | `src/providers/GeminiProvider.ts` (~200 linii) | **DUPLIKAT** |
| `src/providers/llamacpp-provider.ts` (~350 linii) | `src/providers/LlamaCppProvider.ts` (~250 linii) | **DUPLIKAT** |

**Problem:** Oba zestawy istnieja rownolegle. Stare wersje sa importowane przez `SwarmOrchestrator`, nowe przez `providers/index.ts` i `RefinementService`.

**Rekomendacja:** Skonsolidowac do PascalCase wersji, zaktualizowac importy w SwarmOrchestrator.

---

### 1.2 Root `src/` vs `src/core/` - Trojka Duplikatow

| Root (minimal) | Core (full) | Roznica |
|----------------|-------------|---------|
| `src/Agent.ts` (27 linii) | `src/core/Agent.ts` (720 linii) | Root to stub |
| `src/Swarm.ts` (~150 linii) | `src/core/Swarm.ts` (~750 linii) | Root = mini-wersja |
| `src/GraphProcessor.ts` (~100 linii) | `src/core/GraphProcessor.ts` (~400 linii) | Root = mini-wersja |

**Problem:** `src/index.ts` eksportuje z `./core/` ALE ROWNIEZ eksportuje `createSwarm` z `./Swarm.js` (root wersja!). To powoduje zamieszanie - ktora wersja jest uzywana?

**Rekomendacja:** Usunac root stubs, zaktualizowac `createSwarm` by uzywal core/Swarm.

---

### 1.3 Config Agentow - Podwojone Definicje

| Plik | Zawiera |
|------|---------|
| `src/config/agents.config.ts` | `AGENT_ROLES`, `AGENT_COLORS`, `AGENT_DESCRIPTIONS`, routing |
| `src/config/agents.ts` | `AGENT_PERSONAS`, `resolveAgentRole` |

**Problem:** Informacje o agentach rozrzucone po 2 plikach + `AGENT_PERSONAS` w `src/core/Agent.ts` (trzecia definicja!).

**Rekomendacja:** Skonsolidowac do jednego `src/config/agents.ts`.

---

### 1.4 Konfiguracja Modeli - Podwojone

| Plik | Zawiera |
|------|---------|
| `src/config/models.config.ts` | `AVAILABLE_MODELS`, `MODEL_TIERS`, `MODEL_ALIASES` |
| `src/core/Agent.ts` | `MODEL_TIERS` (lokalna kopia!), `availableModels` |

**Rekomendacja:** Usunac duplikaty z Agent.ts, importowac z models.config.ts.

---

## 2. MARTWE / NIEUZYWANE PLIKI

### 2.1 Potwierdzone martwe pliki

| Plik | Powod |
|------|-------|
| `src/core/PhasePreA.ts` | Oznaczony jako DELETED w git status |
| `scripts/ollama-mcp-server.js.deleted` | Sam siebie opisuje jako usuniety |
| `COMPLETION_REPORT.md` | Jednorazowy raport, DELETED |
| `DUPLICATE_ANALYSIS_REPORT.md` | Stary raport, DELETED |
| `TECHNICAL_REPORT_v12.md` | Stary raport, DELETED |
| `GeminiGUI/BUTTON_TEST_SUMMARY.md` | Tymczasowy raport testow |
| `GeminiGUI/DELIVERY_SUMMARY.txt` | Tymczasowy raport |
| `GeminiGUI/ERRORBOUNDARY_SUMMARY.md` | Tymczasowy raport |
| `GeminiGUI/IMPLEMENTATION_SUMMARY.md` | Tymczasowy raport |
| `GeminiGUI/INDEX_EXPORTS_SUMMARY.txt` | Tymczasowy raport |
| `GeminiGUI/OPTIMIZATION_SUMMARY.txt` | Tymczasowy raport |
| `GeminiGUI/SKELETON_COMPONENTS_SUMMARY.md` | Tymczasowy raport |
| `GeminiGUI/TESTFILE_SUMMARY.txt` | Tymczasowy raport |
| `GeminiGUI/TESTS_SUMMARY.md` | Tymczasowy raport |
| `GeminiGUI/TEST_SUMMARY.md` | Tymczasowy raport |
| `GeminiGUI/TOAST_SYSTEM_SUMMARY.md` | Tymczasowy raport |
| `GeminiGUI/VALIDATORS_TEST_SUMMARY.txt` | Tymczasowy raport |
| `temp-update-shortcut.ps1` | Tymczasowy skrypt |

### 2.2 Pliki do weryfikacji (potencjalnie martwe)

| Plik | Notatka |
|------|---------|
| `src/core/FewShotExtensions.ts` | Sprawdzic importy |
| `src/core/MultiModalSupport.ts` | Sprawdzic importy |
| `src/core/PromptAudit.ts` | Sprawdzic importy |
| `src/core/PromptClarityScorer.ts` | Sprawdzic importy |
| `_analyze.ps1`, `_dirs.ps1`, `_lines.ps1` | Skrypty debugowania? |

---

## 3. ZLOZONOSC CYKLOMATYCZNA - Krytyczne Pliki

### 3.1 Monolityczne klasy (>500 linii)

| Plik | Linie | Problem |
|------|-------|---------|
| `src/core/Agent.ts` | ~720 | Klasa Agent + TemperatureController + 13 personas + model selection + chain thinking |
| `src/core/Swarm.ts` | ~750 | Orkiestracja + MCP + memory + file/network access + consensus |
| `src/core/GraphProcessor.ts` | ~400 | Graph traversal + phase execution + subgraph detection |
| `src/core/ExecutionEngine.ts` | ~600 | Task execution + profiling + checkpointing + degradation |

### 3.2 Rekomendacje ekstrakcji z Agent.ts

Klasa `Agent.ts` (720 linii) powinna byc rozbita na:

1. **`src/core/agent/Agent.ts`** - Klasa bazowa Agent (think, thinkInternal, geminiFallback)
2. **`src/core/agent/TemperatureController.ts`** - TemperatureController + cala logika temperatur
3. **`src/core/agent/DijkstraChain.ts`** - dijkstraChainThink + DIJKSTRA_CHAIN
4. **`src/config/agents.ts`** - AGENT_PERSONAS (przeniesienie z Agent.ts)
5. **`src/config/models.config.ts`** - MODEL_TIERS, availableModels (przeniesienie duplikatow)

### 3.3 Rekomendacje ekstrakcji z Swarm.ts

1. **`src/core/swarm/Swarm.ts`** - Glowna orkiestracja
2. **`src/core/swarm/McpContext.ts`** - buildMcpContext
3. **`src/core/swarm/FileAccess.ts`** - readFile, writeFile
4. **`src/core/swarm/Consensus.ts`** - checkMultiAgentConsensus

---

## 4. PROBLEMY ARCHITEKTONICZNE

### 4.1 Niespojny naming convention
- Providers: `gemini-provider.ts` vs `GeminiProvider.ts`
- Config: `agents.config.ts` vs `agents.ts` vs `models.config.ts`
- Core: brak konsekwentnego wzorca

### 4.2 Circular dependency risk
- `src/index.ts` importuje z `./core/` i z root `./Swarm.ts`
- `src/core/Agent.ts` definiuje modele ktore powinny byc w config
- `src/core/Swarm.ts` importuje z `../providers/` bezposrednio

### 4.3 Brak barrel exports
- `src/core/index.ts` istnieje ale nie wszystkie moduły sa wyeksportowane
- `src/providers/index.ts` eksportuje nowe wersje, ale stare sa importowane bezposrednio

---

## 5. PLAN REFAKTORYZACJI (Priorytetyzowany)

### Faza 1: Czyszczenie (Bezpieczne, natychmiastowe)
1. [x] Usunac martwe pliki z sekcji 2.1
2. [ ] Usunac tymczasowe skrypty (_analyze.ps1, etc.)
3. [ ] Git commit: "chore: remove dead files and temp reports"

### Faza 2: Konsolidacja Providerow (Srednie ryzyko)
1. [ ] Sclic gemini-provider.ts -> GeminiProvider.ts (zachowujac funkcjonalnosc)
2. [ ] Sclic llamacpp-provider.ts -> LlamaCppProvider.ts
3. [ ] Zaktualizowac importy w SwarmOrchestrator
4. [ ] Usunac stare pliki kebab-case
5. [ ] Git commit: "refactor: consolidate provider implementations"

### Faza 3: Eliminacja Root Stubs (Srednie ryzyko)
1. [ ] Przeniesc logike createSwarm do core/Swarm.ts
2. [ ] Zaktualizowac src/index.ts by eksportowal tylko z core/
3. [ ] Usunac src/Agent.ts, src/Swarm.ts, src/GraphProcessor.ts (root stubs)
4. [ ] Git commit: "refactor: remove root module stubs, use core/ only"

### Faza 4: Konsolidacja Config (Niskie ryzyko)
1. [ ] Polczyc agents.config.ts + agents.ts -> agents.ts
2. [ ] Przeniesc AGENT_PERSONAS z core/Agent.ts do config/agents.ts
3. [ ] Przeniesc MODEL_TIERS z core/Agent.ts do config/models.config.ts
4. [ ] Git commit: "refactor: consolidate agent and model configs"

### Faza 5: Rozbicie Monolitow (Wyzsze ryzyko)
1. [ ] Ekstrakcja TemperatureController z Agent.ts
2. [ ] Ekstrakcja DijkstraChain z Agent.ts
3. [ ] Ekstrakcja McpContext, FileAccess, Consensus z Swarm.ts
4. [ ] Git commit: "refactor: extract modules from Agent and Swarm monoliths"

---

## 6. METRYKI

| Metryka | Przed | Cel |
|---------|-------|-----|
| Martwe pliki | ~18 | 0 |
| Duplikaty providerow | 4 pliki (2 pary) | 2 pliki |
| Root stubs | 3 pliki | 0 |
| Duplikaty config | 3 pliki z overlap | 2 pliki bez overlap |
| Agent.ts linie | ~720 | ~200 (+ 3 moduły) |
| Swarm.ts linie | ~750 | ~400 (+ 3 moduły) |

---

*Raport wygenerowany: 2026-02-10*
*Narzedzia: Serena MCP + Claude Opus 4.6*

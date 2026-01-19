# Architektura HYDRA

## Przegląd Architektury

HYDRA wykorzystuje wielowarstwową architekturę z separacją odpowiedzialności:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WARSTWA PREZENTACJI                            │
│                         CLI / Dashboard / API                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WARSTWA ORKIESTRACJI                              │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│  │   Planner   │  │   Router    │  │  Scheduler  │  │  Validator  │       │
│  │  (Dijkstra) │  │             │  │             │  │  (Vesemir)  │       │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WARSTWA AGENTÓW (12)                              │
│                                                                             │
│  ┌───────┐ ┌─────────┐ ┌───────┐ ┌─────────┐ ┌────────┐ ┌──────┐          │
│  │Geralt │ │Yennefer │ │ Triss │ │ Jaskier │ │Vesemir │ │ Ciri │          │
│  └───────┘ └─────────┘ └───────┘ └─────────┘ └────────┘ └──────┘          │
│  ┌───────┐ ┌─────────┐ ┌────────┐ ┌───────┐ ┌──────────┐ ┌─────────┐      │
│  │ Eskel │ │ Lambert │ │ Zoltan │ │ Regis │ │ Dijkstra │ │Philippa │      │
│  └───────┘ └─────────┘ └────────┘ └───────┘ └──────────┘ └─────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WARSTWA MCP                                    │
│                                                                             │
│  ┌──────────────┐    ┌───────────────────┐    ┌────────────┐              │
│  │    Serena    │    │ Desktop Commander │    │ Playwright │              │
│  │  (symbolic)  │    │    (system ops)   │    │ (browser)  │              │
│  └──────────────┘    └───────────────────┘    └────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WARSTWA BACKENDÓW AI                              │
│                                                                             │
│  ┌────────────────────────────┐    ┌────────────────────────────┐         │
│  │         OLLAMA             │    │         GEMINI             │         │
│  │  ┌────────┐ ┌────────┐    │    │  ┌─────────────────────┐   │         │
│  │  │llama3.2│ │qwen2.5 │    │    │  │ generativelanguage  │   │         │
│  │  │  :3b   │ │-coder  │    │    │  │    .googleapis.com  │   │         │
│  │  └────────┘ └────────┘    │    │  └─────────────────────┘   │         │
│  └────────────────────────────┘    └────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Komponenty Główne

### 1. System Kolejkowania (prompt-queue.js)

- **PromptQueue** - Podstawowa kolejka z priorytetami
- **AgentQueueManager** - Zarządzanie 12 równoległymi kolejkami agentów
- **AgentChannel** - Dedykowany kanał dla każdego agenta
- **RateLimiter** - Algorytm token bucket dla rate limiting

### 2. System Promptów (system-prompt.js)

- **BOOT_PROMPT** - Inicjalizacyjny prompt systemowy
- **OLLAMA_INSTRUCTIONS** - Instrukcje dla modeli Ollama
- **GEMINI_INSTRUCTIONS** - Instrukcje dla Gemini API
- **MCP_ENFORCEMENT** - Wymuszanie protokołu MCP
- **WitcherAgents** - Definicje 12 agentów

### 3. Konfiguracja (config.js)

- Walidacja Zod dla wszystkich ustawień
- Zmienne środowiskowe
- Tryby pracy (standard/YOLO)

### 4. Narzędzia MCP (src/tools/)

- **filesystem.js** - Operacje na plikach
- **shell.js** - Komendy powłoki
- **knowledge.js** - System pamięci

## Przepływ Danych

```
Input → Planner → Agent Selection → Queue → Execution → Validation → Output
         │              │              │         │           │
         ▼              ▼              ▼         ▼           ▼
     Dijkstra      Load Balancing   Priority  Parallel   Vesemir
                                     Queue     Exec
```

## Strategie Load Balancing

1. **ROUND_ROBIN** - Cykliczne rozdzielanie między agentów
2. **LEAST_LOADED** - Wybór najmniej obciążonego agenta
3. **WEIGHTED** - Ważony random proporcjonalny do obciążenia
4. **RANDOM** - Losowy wybór agenta
5. **ROLE_BASED** - Routing oparty na roli agenta

## Bezpieczeństwo

- Wszystkie operacje przez MCP
- Walidacja ścieżek plików
- Blokowanie niebezpiecznych komend
- Audit logging wszystkich akcji

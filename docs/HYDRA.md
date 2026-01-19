# HYDRA - System Wieloagentowy

## Co to jest HYDRA?

HYDRA (Holistic Yielding Dynamic Resource Allocator) to zaawansowany system wieloagentowy AI, który orkiestruje 12 wyspecjalizowanych agentów do wykonywania złożonych zadań programistycznych.

## Architektura Swarmu

```
                              ┌─────────────┐
                              │   INPUT     │
                              │   (User)    │
                              └──────┬──────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │      DIJKSTRA         │
                         │  (Strategic Planner)  │
                         └───────────┬───────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
              ┌──────────┐    ┌──────────┐    ┌──────────┐
              │ GERALT   │    │ YENNEFER │    │  TRISS   │
              │(Security)│    │ (Arch)   │    │   (QA)   │
              └──────────┘    └──────────┘    └──────────┘
                    │                │                │
                    └────────────────┼────────────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │       VESEMIR         │
                         │   (Code Reviewer)     │
                         └───────────┬───────────┘
                                     │
                                     ▼
                              ┌─────────────┐
                              │   OUTPUT    │
                              │  (Result)   │
                              └─────────────┘
```

## Przepływ Pracy (Workflow)

### 1. Input Processing

Odbiór i walidacja danych wejściowych od użytkownika.

### 2. Task Planning (Dijkstra)

- Analiza złożoności zadania
- Dekompozycja na podzadania
- Przypisanie agentów

### 3. Agent Selection

- Load balancing (5 strategii)
- Wybór optymalnych agentów
- Weryfikacja dostępności

### 4. Parallel Execution

- Równoległe wykonanie przez agentów
- Rate limiting
- Retry logic z exponential backoff

### 5. Result Validation (Vesemir)

- Przegląd wyników
- Walidacja jakości
- Sprawdzenie bezpieczeństwa

### 6. Output Formatting

- Formatowanie odpowiedzi
- Struktura MCP
- Zwrot do użytkownika

## Konfiguracja Swarmu

```javascript
import { getAgentQueue, LoadBalancingStrategy } from './prompt-queue.js';

const swarm = getAgentQueue({
  // Maksymalna liczba równoległych zadań per agent
  maxConcurrentPerAgent: 2,

  // Całkowita maksymalna liczba równoległych zadań
  totalMaxConcurrent: 12,

  // Domyślna strategia load balancing
  defaultStrategy: LoadBalancingStrategy.LEAST_LOADED,

  // Włącz zbieranie metryk
  enableMetrics: true,

  // Interwał raportowania metryk (ms)
  metricsInterval: 30000,

  // Maksymalna liczba prób
  maxRetries: 3,

  // Timeout zadania (ms)
  timeout: 60000
});
```

## Przykłady Użycia

### Proste zadanie

```javascript
const result = await enqueueToAgents('Przeanalizuj bezpieczeństwo tego kodu', {
  priority: Priority.HIGH
});
```

### Zadanie do konkretnego agenta

```javascript
const result = await enqueueToSpecificAgent('Triss', 'Napisz testy dla modułu auth', {
  metadata: { module: 'auth' }
});
```

### Batch z dystrybucją

```javascript
const results = await enqueueBatchDistributed([
  'Zadanie 1',
  'Zadanie 2',
  'Zadanie 3',
  'Zadanie 4',
  'Zadanie 5',
  'Zadanie 6'
]); // Rozdzieli między 6 różnych agentów
```

### Zadanie po roli

```javascript
const result = await enqueueToAgents('Zoptymalizuj ten kod', {
  role: 'optimizer', // Ciri
  priority: Priority.NORMAL
});
```

## Metryki Swarmu

```javascript
const metrics = getAgentMetrics();

console.log('=== SUMMARY ===');
console.log(`Active Agents: ${metrics.summary.activeAgents}/12`);
console.log(`Total Throughput: ${metrics.summary.totalThroughput} tasks/min`);
console.log(`Success Rate: ${metrics.summary.averageSuccessRate}%`);
console.log(`Avg Response: ${metrics.summary.averageResponseTime}ms`);

console.log('\n=== PER AGENT ===');
for (const [name, m] of Object.entries(metrics.perAgent)) {
  console.log(`${name}: ${m.totalCompleted} completed, ${m.successRate}% success`);
}
```

## Strategie Load Balancing

| Strategia | Opis | Użycie |
|-----------|------|--------|
| ROUND_ROBIN | Cykliczne przydzielanie | Równomierne rozłożenie |
| LEAST_LOADED | Najmniej obciążony | Domyślna, optymalna |
| WEIGHTED | Ważony random | Preferowanie szybszych agentów |
| RANDOM | Losowy wybór | Testowanie |
| ROLE_BASED | Po roli agenta | Specjalizacja |

## Zarządzanie Agentami

```javascript
// Pauza agenta
getAgentQueue().pauseAgent('Lambert');

// Wznowienie
getAgentQueue().resumeAgent('Lambert');

// Wyłączenie (nie przyjmuje nowych)
getAgentQueue().offlineAgent('Ciri');

// Draining (kończy bieżące, nie przyjmuje nowych)
getAgentQueue().drainAgent('Eskel');

// Anuluj wszystkie zadania agenta
getAgentQueue().cancelAgent('Zoltan');
```

## Stany Kanałów Agentów

| Stan | Opis |
|------|------|
| ACTIVE | Normalnie działający |
| PAUSED | Wstrzymany, nie przetwarza |
| DRAINING | Kończy bieżące, nie przyjmuje nowych |
| OFFLINE | Całkowicie wyłączony |

## Obsługa Błędów

```javascript
swarm.on('agentFailed', ({ channelId, agentName, error, attempts }) => {
  console.error(`Agent ${agentName} failed: ${error}`);

  if (attempts >= 3) {
    // Przenieś do innego agenta
    getAgentQueue().offlineAgent(agentName);
  }
});

swarm.on('retrying', ({ agentName, attempt, delay, error }) => {
  console.warn(`Retrying ${agentName} (attempt ${attempt}): ${error}`);
});
```

## Integracja z Pamięcią

```javascript
// Zapisz kontekst swarmu do pamięci
await mcp__serena__write_memory({
  memory_file_name: 'swarm-context.md',
  content: `# Swarm Context\n\nLast task: ${task}\nAgents used: ${agents.join(', ')}`
});

// Odczytaj przy następnej sesji
const context = await mcp__serena__read_memory({
  memory_file_name: 'swarm-context.md'
});
```

## Best Practices

1. **Używaj odpowiedniego agenta** - Każdy ma swoją specjalizację
2. **Monitoruj metryki** - Identyfikuj wąskie gardła
3. **Ustawiaj priorytety** - URGENT dla krytycznych zadań
4. **Wykorzystuj parallel execution** - `enqueueBatchDistributed`
5. **Obsługuj błędy** - Subskrybuj eventy `agentFailed`

---

## Pipeline Wykonawczy

### 5 etapów pipeline

```
ROUTE -> SPECULATE -> PLAN -> EXECUTE -> SYNTHESIZE
```

| Etap | Timeout | Opis |
|------|---------|------|
| ROUTE | 5s | Wybór providera (Ollama/Gemini) |
| SPECULATE | 10s | Spekulatywne wykonanie |
| PLAN | 15s | Dekompozycja zadania |
| EXECUTE | 60s | Główne wykonanie |
| SYNTHESIZE | 10s | Agregacja wyników |

### Klasy pipeline

```javascript
import { PipelineBuilder, Pipeline, ExecutionContext } from './hydra/pipeline.js';

const pipeline = new PipelineBuilder()
  .addStage('ROUTE', routeHandler, { timeout: 5000 })
  .addStage('EXECUTE', executeHandler, { timeout: 60000 })
  .build();

const context = new ExecutionContext({ input, metadata });
const result = await pipeline.run(context);
```

---

## Providers

### BaseProvider (abstrakcyjny)

```javascript
class BaseProvider {
  async generate(prompt, options) { /* abstract */ }
  async stream(prompt, options) { /* abstract */ }
  async healthCheck() { /* abstract */ }
  getMetrics() { /* zwraca statystyki */ }
}
```

### OllamaProvider

- **Lokalizacja**: localhost:11434
- **Modele**: llama3.2:1b, llama3.2:3b, phi3, qwen2.5-coder
- **Cechy**: darmowy, prywatny, specjalizowane modele

### GeminiProvider

- **API**: generativelanguage.googleapis.com
- **Modele**: gemini-2.0-flash, gemini-1.5-pro
- **Cechy**: duży kontekst, multimodalny, najwyższa jakość

### ProviderRegistry

```javascript
import { ProviderRegistry } from './hydra/providers.js';

const registry = new ProviderRegistry();
registry.register('ollama', new OllamaProvider());
registry.register('gemini', new GeminiProvider());

const provider = registry.get('ollama');
```

---

## Router i Selekcja Providerów

### Kategorie zadań

| Kategoria | Provider | Przykład |
|-----------|----------|----------|
| simple | Ollama | Proste pytania |
| code | Ollama (qwen2.5-coder) | Generowanie kodu |
| research | Gemini | Analiza dokumentów |
| complex | Gemini | Złożone zadania |
| creative | Gemini | Kreatywne pisanie |

### Analiza złożoności

```javascript
// Skala 1-5
const complexity = analyzeComplexity(prompt);
// 1-2: Ollama
// 3: Auto (heurystyka)
// 4-5: Gemini
```

### Proces routingu

1. **Heurystyka** - analiza słów kluczowych
2. **LLM Routing** - model decyduje
3. **Auto-routing** - fallback na podstawie złożoności

---

## Cache i Retry Logic

### TTLCache

```javascript
import { TTLCache } from './hydra/cache.js';

const cache = new TTLCache({
  maxSize: 1000,
  ttl: 3600000,        // 1 godzina
  policy: 'LRU'        // LRU, LFU, FIFO
});

cache.set('key', value);
const hit = cache.get('key');
```

### HealthCheckCache

```javascript
const healthCache = new HealthCheckCache({
  ttl: 30000,          // 30s
  autoRefresh: true,
  refreshInterval: 10000
});
```

### Exponential Backoff

```javascript
import { withRetry } from './hydra/retry.js';

const result = await withRetry(
  () => apiCall(),
  {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    jitter: true       // Dodaje losowość
  }
);
```

---

## Connection Pooling

```javascript
import { ConnectionPool, RateLimiter, ManagedPool } from './hydra/pool.js';

// Pool z limitem współbieżności
const pool = new ConnectionPool({
  maxConnections: 10,
  idleTimeout: 60000
});

// Rate limiter (token bucket)
const limiter = new RateLimiter({
  tokensPerSecond: 10,
  bucketSize: 20
});

// Zarządzany pool
const managed = new ManagedPool(pool, limiter);
const conn = await managed.acquire();
```

---

## Circuit Breaker Pattern

### Stany

```
CLOSED -> (błędy > próg) -> OPEN -> (timeout) -> HALF-OPEN -> (sukces) -> CLOSED
                                                          -> (błąd) -> OPEN
```

### Konfiguracja

```javascript
import { CircuitBreaker } from './hydra/circuit-breaker.js';

const breaker = new CircuitBreaker({
  failureThreshold: 5,    // 5 błędów otwiera
  successThreshold: 2,    // 2 sukcesy zamykają
  timeout: 30000,         // 30s w stanie OPEN
  resetTimeout: 60000     // 60s reset statystyk
});

const result = await breaker.execute(() => apiCall());
```

---

## Metryki i Statystyki

### RollingStats

```javascript
import { RollingStats } from './hydra/metrics.js';

const stats = new RollingStats({ windowSize: 60000 }); // 1 min
stats.record(responseTime);

console.log(stats.getStats());
// { count, mean, p50, p95, p99, min, max }
```

### TimeSeriesMetrics

```javascript
const timeSeries = new TimeSeriesMetrics({
  resolution: 1000,      // 1s
  retention: 3600000     // 1h
});

timeSeries.record('requests', 1);
const data = timeSeries.query('requests', { last: '5m' });
```

### StatsCollector

```javascript
import { StatsCollector } from './hydra/metrics.js';

const collector = new StatsCollector();
collector.increment('requests_total');
collector.observe('response_time', 150);
collector.gauge('active_connections', pool.size);

const metrics = collector.export(); // Format Prometheus
```

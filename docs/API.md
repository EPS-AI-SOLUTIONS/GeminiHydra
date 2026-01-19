# API Reference

## System Kolejkowania

### PromptQueue

Podstawowa klasa kolejki z priorytetami.

```javascript
import { PromptQueue, Priority, Status } from './prompt-queue.js';

const queue = new PromptQueue({
  maxConcurrent: 4,
  maxRetries: 3,
  timeout: 60000
});
```

#### Metody

| Metoda | Opis |
|--------|------|
| `enqueue(prompt, options)` | Dodaj prompt do kolejki |
| `enqueueBatch(prompts, options)` | Dodaj wiele promptów |
| `cancel(id)` | Anuluj zadanie |
| `cancelAll()` | Anuluj wszystkie zadania |
| `pause()` | Wstrzymaj przetwarzanie |
| `resume()` | Wznów przetwarzanie |
| `getStatus()` | Pobierz status kolejki |
| `getItem(id)` | Pobierz element po ID |
| `waitFor(id, timeout)` | Czekaj na zakończenie |
| `setHandler(fn)` | Ustaw handler |

### AgentQueueManager

Zarządzanie 12 równoległymi kolejkami agentów.

```javascript
import {
  getAgentQueue,
  enqueueToAgents,
  enqueueToSpecificAgent,
  LoadBalancingStrategy
} from './prompt-queue.js';

const queue = getAgentQueue({
  maxConcurrentPerAgent: 2,
  defaultStrategy: LoadBalancingStrategy.LEAST_LOADED
});
```

#### Metody

| Metoda | Opis |
|--------|------|
| `enqueue(prompt, options)` | Enqueue z load balancing |
| `enqueueToAgent(agent, prompt, options)` | Enqueue do konkretnego agenta |
| `enqueueBatch(prompts, options)` | Batch enqueue |
| `enqueueBatchDistributed(prompts, options)` | Batch z dystrybucją |
| `getChannel(agentName)` | Pobierz kanał agenta |
| `getAllChannelStatuses()` | Statusy wszystkich kanałów |
| `getMetrics()` | Metryki zagregowane |
| `pauseAgent(name)` / `resumeAgent(name)` | Zarządzanie agentem |
| `waitForAgent(name, timeout)` | Czekaj na agenta |
| `waitForAll(timeout)` | Czekaj na wszystkich |
| `shutdown()` | Zamknij menedżera |

### Priority

```javascript
export const Priority = {
  URGENT: 0,     // Najwyższy priorytet
  HIGH: 1,
  NORMAL: 2,     // Domyślny
  LOW: 3,
  BACKGROUND: 4  // Najniższy priorytet
};
```

### Status

```javascript
export const Status = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  RETRYING: 'retrying'
};
```

### LoadBalancingStrategy

```javascript
export const LoadBalancingStrategy = {
  ROUND_ROBIN: 'round_robin',
  LEAST_LOADED: 'least_loaded',
  WEIGHTED: 'weighted',
  RANDOM: 'random',
  ROLE_BASED: 'role_based'
};
```

---

## System Promptów

### SystemPromptManager

```javascript
import { systemPromptManager } from './system-prompt.js';
```

#### Metody

| Metoda | Opis |
|--------|------|
| `getBootPrompt()` | Prompt inicjalizacyjny |
| `getOllamaInstructions(context)` | Instrukcje Ollama |
| `getGeminiInstructions(context)` | Instrukcje Gemini |
| `getMCPEnforcement()` | Wymuszanie MCP |
| `getAgentPrompt(agentId)` | Prompt agenta |
| `getSystemPrompt(options)` | Kompletny prompt |
| `getAllAgents()` | Wszystkie definicje agentów |
| `getAgent(agentId)` | Agent po ID |
| `getAgentsByCapability(cap)` | Agenci po capability |
| `getWorkflowSchema()` | Schemat workflow |
| `getPermissions()` | Definicje uprawnień |
| `isPathAllowed(path, op)` | Walidacja ścieżki |

### Przykład użycia

```javascript
// Pobierz kompletny prompt systemowy
const prompt = systemPromptManager.getSystemPrompt({
  backend: 'ollama',
  agent: 'geralt',
  includePermissions: true,
  includeMCP: true
});

// Pobierz agentów z konkretną zdolnością
const testers = systemPromptManager.getAgentsByCapability('unit_testing');

// Waliduj ścieżkę
const allowed = systemPromptManager.isPathAllowed('/etc/passwd', 'read');
// false - zablokowane
```

---

## Funkcje Pomocnicze

### Queue Helpers

```javascript
// Singleton helpers
import {
  getQueue,
  resetQueue,
  enqueue,
  enqueueBatch,
  getQueueStatus,
  cancelItem,
  pauseQueue,
  resumeQueue
} from './prompt-queue.js';

// Agent queue helpers
import {
  getAgentQueue,
  resetAgentQueue,
  enqueueToAgents,
  enqueueToSpecificAgent,
  enqueueBatchToAgents,
  enqueueBatchDistributed,
  getAgentQueueStatus,
  getAgentMetrics,
  pauseAgentQueue,
  resumeAgentQueue,
  getAgentChannel,
  getActiveAgents,
  setAgentHandler
} from './prompt-queue.js';
```

---

## Zdarzenia

### PromptQueue Events

```javascript
queue.on('enqueued', ({ id, priority, prompt }) => {});
queue.on('started', ({ id, attempt }) => {});
queue.on('completed', ({ id, result, duration }) => {});
queue.on('failed', ({ id, error, attempts }) => {});
queue.on('cancelled', ({ id }) => {});
queue.on('retrying', ({ id, attempt, delay, error }) => {});
queue.on('paused', () => {});
queue.on('resumed', () => {});
```

### AgentQueueManager Events

```javascript
agentQueue.on('initialized', ({ agentCount }) => {});
agentQueue.on('enqueued', ({ id, channelId, agent, strategy }) => {});
agentQueue.on('agentEnqueued', ({ channelId, agentName }) => {});
agentQueue.on('agentStarted', ({ channelId, agentName, attempt }) => {});
agentQueue.on('agentCompleted', ({ channelId, agentName, result, duration }) => {});
agentQueue.on('agentFailed', ({ channelId, agentName, error, attempts }) => {});
agentQueue.on('channelStateChanged', ({ agentName, state }) => {});
agentQueue.on('retrying', ({ channelId, agentName, attempt, delay, error }) => {});
agentQueue.on('metrics', (metrics) => {});
agentQueue.on('paused', () => {});
agentQueue.on('resumed', () => {});
agentQueue.on('allCancelled', ({ count }) => {});
agentQueue.on('shutdown', () => {});
```

---

## Stałe

```javascript
import {
  Models,
  Agents,
  AgentRoles,
  Paths,
  Timeouts,
  Retry,
  RateLimits,
  SizeLimits,
  CacheTTL,
  Security,
  HttpStatus,
  EnvVars
} from './constants.js';
```

Szczegóły w pliku `src/constants.js`.

---

## MCP Tools (Endpointy)

### Narzędzia systemu plików

| Tool | Opis |
|------|------|
| `list_directory` | Wyświetla zawartość katalogu z opcjonalną rekurencją |
| `read_file` | Odczytuje zawartość pliku z obsługą różnych kodowań |
| `write_file` | Zapisuje zawartość do pliku z opcjonalnym tworzeniem katalogów |
| `delete_file` | Usuwa plik lub katalog |

### Narzędzia powłoki

| Tool | Opis |
|------|------|
| `run_shell_command` | Wykonuje polecenie powłoki z kontrolą bezpieczeństwa |

### Narzędzia pamięci wiedzy

| Tool | Opis |
|------|------|
| `knowledge_add` | Dodaje dokument do pamięci wektorowej |
| `knowledge_search` | Wyszukuje semantycznie w pamięci |
| `knowledge_delete` | Usuwa dokument z pamięci |

### Narzędzia Swarm

| Tool | Opis |
|------|------|
| `hydra_swarm` | Wykonuje protokół Agent Swarm |
| `swarm_status` | Sprawdza status silnika swarm |

---

## Kody Błędów

### Walidacja (400)

| Kod | Opis |
|-----|------|
| `VALIDATION_ERROR` | Ogólny błąd walidacji |
| `INVALID_INPUT` | Nieprawidłowe dane wejściowe |
| `SCHEMA_VALIDATION_FAILED` | Schemat nie przeszedł walidacji |
| `MISSING_REQUIRED_FIELD` | Brak wymaganego pola |

### Autoryzacja (401/403)

| Kod | Opis |
|-----|------|
| `AUTHENTICATION_ERROR` | Błąd uwierzytelniania |
| `AUTHORIZATION_ERROR` | Błąd autoryzacji |
| `PERMISSION_DENIED` | Odmowa dostępu |

### Nie znaleziono (404)

| Kod | Opis |
|-----|------|
| `FILE_NOT_FOUND` | Plik nie istnieje |
| `NOT_FOUND` | Zasób nie znaleziony |
| `TOOL_NOT_FOUND` | Narzędzie nie istnieje |

### Rate Limit (429)

| Kod | Opis |
|-----|------|
| `RATE_LIMIT_EXCEEDED` | Przekroczono limit żądań |
| `QUOTA_EXCEEDED` | Przekroczono quota |

### Błędy serwera (500)

| Kod | Opis |
|-----|------|
| `INTERNAL_ERROR` | Wewnętrzny błąd serwera |
| `TOOL_EXECUTION_ERROR` | Błąd wykonania narzędzia |
| `SWARM_ERROR` | Błąd silnika swarm |

### Timeout/Sieć (503/504)

| Kod | Opis |
|-----|------|
| `TIMEOUT_ERROR` | Przekroczono czas oczekiwania |
| `NETWORK_ERROR` | Błąd sieci |
| `CONNECTION_REFUSED` | Połączenie odrzucone |

---

## Rate Limiting

### Konfiguracja domyślna

```javascript
RateLimits = {
  MAX_CONCURRENT: 10,      // Równoczesne operacje
  REQUESTS_PER_MINUTE: 60, // Żądania/min
  BUCKET_SIZE: 10,         // Rozmiar bucket
  REFILL_RATE: 2           // Tokeny/s
};
```

### Tryb YOLO

W trybie YOLO (`HYDRA_YOLO=true`) limity są zwiększone:

```javascript
RateLimits_YOLO = {
  MAX_CONCURRENT: 20,
  REQUESTS_PER_MINUTE: 120,
  BUCKET_SIZE: 20,
  REFILL_RATE: 5
};
```

---

## Limity rozmiaru

```javascript
SizeLimits = {
  MAX_FILE_SIZE: 10 * 1024 * 1024,  // 10 MB
  MAX_COMMAND_LENGTH: 10000,         // 10000 znaków
  MAX_RESPONSE_SIZE: 1024 * 1024,    // 1 MB
  MAX_BATCH_SIZE: 100                // 100 elementów
};
```

---

## Bezpieczeństwo API

### Ochrona ścieżek

```javascript
// Path traversal protection
const blocked = ['../', '..\\', '%2e%2e'];
```

### Zablokowane polecenia

```javascript
const blockedCommands = [
  'shutdown',
  'rm -rf /',
  ':(){ :|:& };:',  // Fork bomb
  'format c:',
  'del /f /s /q c:\\'
];
```

### Filtrowanie zmiennych środowiskowych

```javascript
const filteredEnvVars = [
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'DATABASE_PASSWORD',
  'SECRET_KEY'
];
```

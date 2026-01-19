# Konfiguracja HYDRA

## Przegląd

Konfiguracja HYDRA jest zarządzana przez `src/config.js` z walidacją Zod. Wszystkie ustawienia można nadpisać zmiennymi środowiskowymi.

## Zmienne Środowiskowe

| Zmienna | Opis | Domyślna |
|---------|------|----------|
| `GEMINI_API_KEY` | Klucz API dla Google Gemini | - |
| `DEBUG` | Włącza tryb debug | `false` |
| `NODE_ENV` | Środowisko (development/production) | `development` |
| `LOG_LEVEL` | Poziom logowania | `info` |
| `HYDRA_YOLO` | Tryb YOLO (bez potwierdzeń) | `false` |
| `CACHE_DIR` | Katalog cache | `cache` |
| `GEMINI_CONFIG_PATH` | Ścieżka do pliku konfiguracji | `.gemini/config.json` |

## Plik Konfiguracyjny

```javascript
// src/config.js
export const CONFIG = {
  // Backend AI
  BACKEND: 'ollama', // 'ollama' | 'gemini'

  // Ollama
  OLLAMA_HOST: 'http://localhost:11434',
  DEFAULT_MODEL: 'llama3.2:3b',

  // Gemini (opcjonalnie)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,

  // Kolejka
  QUEUE_MAX_CONCURRENT: 4,
  QUEUE_MAX_RETRIES: 3,
  QUEUE_TIMEOUT_MS: 60000,

  // Bezpieczeństwo
  YOLO_MODE: false,
  RISK_BLOCKING: true,

  // Ścieżki
  MEMORY_DIR: '.serena/memories',
  LOG_DIR: '.hydra-data/logs',
  CACHE_DIR: 'cache'
};
```

## Walidacja Zod

```javascript
import { z } from 'zod';

const ConfigSchema = z.object({
  BACKEND: z.enum(['ollama', 'gemini']).default('ollama'),
  OLLAMA_HOST: z.string().url().default('http://localhost:11434'),
  DEFAULT_MODEL: z.string().default('llama3.2:3b'),
  QUEUE_MAX_CONCURRENT: z.number().min(1).max(20).default(4),
  QUEUE_MAX_RETRIES: z.number().min(0).max(10).default(3),
  QUEUE_TIMEOUT_MS: z.number().min(1000).max(300000).default(60000),
  YOLO_MODE: z.boolean().default(false),
  RISK_BLOCKING: z.boolean().default(true)
});
```

## Tryby Pracy

### Tryb Standardowy

```bash
npm start
```

- Wszystkie operacje wymagają potwierdzenia
- Pełna walidacja bezpieczeństwa
- Audit logging włączony

### Tryb YOLO

```bash
HYDRA_YOLO=true npm start
```

- Brak potwierdzeń dla operacji
- Szybsze wykonanie
- ⚠️ Używaj ostrożnie

## Konfiguracja MCP

Plik `mcp_config.json`:

```json
{
  "mcpServers": {
    "serena": {
      "command": "C:\\Users\\...\\uvx.exe",
      "args": ["--from", "serena-ai", "serena", "--project-path", "."],
      "env": {}
    },
    "desktop-commander": {
      "command": "npx",
      "args": ["-y", "@anthropic/desktop-commander"]
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@anthropic/playwright-mcp"]
    }
  }
}
```

## Konfiguracja Kolejki Agentów

```javascript
import { getAgentQueue } from './prompt-queue.js';

const queue = getAgentQueue({
  maxConcurrentPerAgent: 2,      // Max równoległych zadań per agent
  totalMaxConcurrent: 12,        // Max całkowita liczba zadań
  defaultStrategy: 'least_loaded', // Strategia load balancing
  enableMetrics: true,           // Włącz metryki
  metricsInterval: 30000,        // Interwał raportowania (ms)
  maxRetries: 3,                 // Max liczba prób
  timeout: 60000                 // Timeout zadania (ms)
});
```

## Konfiguracja Modeli

```javascript
// src/constants.js
export const Models = Object.freeze({
  FAST: 'llama3.2:1b',        // Szybkie odpowiedzi
  CORE: 'llama3.2:3b',        // Ogólne zastosowanie
  CODE: 'qwen2.5-coder:1.5b', // Kodowanie
  ANALYSIS: 'phi3:mini',      // Analiza
  EMBEDDING: 'nomic-embed-text' // Embeddingi
});
```

## Konfiguracja Bezpieczeństwa

```javascript
// src/security/patterns.js
export const BLOCKED_COMMANDS = [
  'rm -rf /',
  'mkfs',
  'dd if=',
  ':(){:|:&};:' // Fork bomb
];

export const BLOCKED_PATHS = [
  /^\/etc\//,
  /^C:\\Windows/i,
  /\.env$/,
  /credentials/i
];
```

## Przykładowy Plik .env

```bash
# AI Backend
GEMINI_API_KEY=your_api_key_here

# Środowisko
NODE_ENV=development
DEBUG=false
LOG_LEVEL=info

# Bezpieczeństwo
HYDRA_YOLO=false

# Ścieżki
CACHE_DIR=.cache
```

# Bezpieczeństwo HYDRA

## Przegląd

HYDRA implementuje wielowarstwowy model bezpieczeństwa z wymuszeniem protokołu MCP, walidacją wejść i audit loggingiem.

## Zasady Podstawowe

1. **MCP OBOWIĄZKOWE** - Wszystkie operacje I/O przez MCP
2. **Least Privilege** - Minimalne uprawnienia dla każdej operacji
3. **Input Validation** - Walidacja wszystkich danych wejściowych
4. **Audit Trail** - Logowanie wszystkich akcji bezpieczeństwa

## Uprawnienia Plikowe

### Dozwolone do odczytu

```javascript
FilePermissions.READ.allowed = [
  './',              // Katalog projektu
  '.serena/',        // Pamięć
  '.gemini/',        // Konfiguracja
  'cache/',          // Cache
  '.hydra-data/logs' // Logi
];
```

### Dozwolone do zapisu

```javascript
FilePermissions.WRITE.allowed = [
  '.serena/memories/',  // Pamięć
  'cache/',            // Cache
  '.hydra-data/logs/', // Logi
  '.gemini/tmp/',      // Pliki tymczasowe
  '.hydra-data/audit/' // Audit logi
];
```

### Zablokowane wzorce

```javascript
FilePermissions.BLOCKED.patterns = [
  /^\/etc\//,           // Linux system
  /^\/usr\//,           // Linux binaries
  /^C:\\Windows/i,      // Windows system
  /^C:\\Program Files/i,// Windows apps
  /\.env$/,             // Environment files
  /\.ssh/,              // SSH keys
  /credentials/i,       // Credentials
  /secrets?/i,          // Secrets
  /\.key$/              // Key files
];
```

## Uprawnienia Sieciowe

### Dozwolone endpointy

| Endpoint | Metody | Opis |
|----------|--------|------|
| `localhost:11434` | GET, POST | Ollama API |
| `generativelanguage.googleapis.com` | GET, POST | Gemini API |
| `stdio://` | * | MCP Protocol |

### Zablokowane domeny

```javascript
NetworkPermissions.BLOCKED_DOMAINS = [
  '*.onion',
  '*.darkweb.*',
  'pastebin.com',
  '*.torrent.*'
];
```

## Niebezpieczne Komendy

```javascript
// src/security/patterns.js
export const DANGEROUS_PATTERNS = [
  /rm\s+-rf?\s+[\/~]/i,                    // Recursive delete
  /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/, // Fork bomb
  />\s*\/dev\/sd[a-z]/i,                   // Direct disk write
  /mkfs/i,                                  // Format filesystem
  /dd\s+if=/i,                             // Disk dump
  /chmod\s+777/i,                          // Unsafe permissions
  /curl.*\|\s*(?:ba)?sh/i,                 // Curl to shell
  /wget.*\|\s*(?:ba)?sh/i                  // Wget to shell
];

export const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf ~',
  'format',
  'del /f /s /q',
  ':(){ :|:& };:'
];
```

## Audit Logging

### Poziomy istotności

```javascript
Security.SEVERITY = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
};
```

### Typy zdarzeń

```javascript
Security.EVENT_TYPES = {
  SHELL_COMMAND: 'SHELL_COMMAND',
  FILE_ACCESS: 'FILE_ACCESS',
  API_CALL: 'API_CALL',
  AUTH_EVENT: 'AUTH_EVENT',
  CONFIG_CHANGE: 'CONFIG_CHANGE',
  SECURITY_EVENT: 'SECURITY_EVENT',
  TOOL_EXECUTION: 'TOOL_EXECUTION'
};
```

### Format logu

```json
{
  "timestamp": "2026-01-19T12:00:00.000Z",
  "severity": "WARN",
  "eventType": "SHELL_COMMAND",
  "agent": "Lambert",
  "action": "execute_shell_command",
  "details": {
    "command": "npm test",
    "exitCode": 0
  },
  "allowed": true
}
```

## Walidacja Wejść

```javascript
// Walidacja ścieżki
function isPathAllowed(path, operation) {
  // Sprawdź zablokowane wzorce
  for (const pattern of FilePermissions.BLOCKED.patterns) {
    if (pattern.test(path)) {
      return false;
    }
  }

  // Sprawdź dozwolone katalogi
  const permissions = operation === 'write'
    ? FilePermissions.WRITE
    : FilePermissions.READ;

  return permissions.allowed.some(allowed =>
    path.startsWith(allowed) || path.includes(allowed)
  );
}
```

## Tryb YOLO

⚠️ **Używaj z ostrożnością**

```bash
HYDRA_YOLO=true npm start
```

W trybie YOLO:
- Brak potwierdzeń dla operacji
- Niebezpieczne komendy nadal zablokowane
- Audit logging nadal aktywny

## Best Practices

1. **Nigdy nie wyłączaj MCP** - Protokół zapewnia bezpieczeństwo
2. **Regularnie sprawdzaj audit logi** - `.hydra-data/audit/`
3. **Nie przechowuj sekretów w kodzie** - Używaj .env
4. **Aktualizuj zależności** - `npm audit`
5. **Limituj uprawnienia** - Principle of least privilege

## SecurityEnforcer

Klasa `SecurityEnforcer` zarządza poziomami ryzyka i uprawnieniami.

### Poziomy ryzyka

```javascript
RiskLevel = {
  NONE: 0,      // Brak ryzyka
  LOW: 1,       // Niskie ryzyko
  MEDIUM: 2,    // Średnie ryzyko
  HIGH: 3,      // Wysokie ryzyko
  CRITICAL: 4   // Krytyczne ryzyko
};
```

### Konfiguracja

```javascript
const enforcer = new SecurityEnforcer({
  strictMode: true,           // Tryb ścisły
  allowedPaths: ['./src'],    // Biała lista ścieżek
  blockedPaths: ['/etc'],     // Czarna lista ścieżek
  maxViolations: 5            // Max naruszeń przed blokadą
});
```

## Sanitizacja Wejść

### Znaki specjalne Shell

```javascript
// 23 znaki wymagające escapowania
SHELL_ESCAPE_CHARS = [
  '`', '$', '!', '&', '|', ';',
  '>', '<', '(', ')', '{', '}',
  '[', ']', '*', '?', '#', '~',
  '\\', '"', "'", '\n', '\r'
];
```

### Funkcje sanityzacji

```javascript
import { sanitizeInput, sanitizePath } from './security/patterns.js';

// Sanityzacja ogólnego inputu
const clean = sanitizeInput(userInput);

// Sanityzacja ścieżki (wykrywa path traversal)
const safePath = sanitizePath(filePath);
```

## Szyfrowanie Cache (AES-256-GCM)

### Konfiguracja

```javascript
// .env
CACHE_ENCRYPTION_KEY=your_32_byte_hex_or_base64_key
```

### Struktura zaszyfrowanego wpisu

```javascript
{
  iv: '12_byte_initialization_vector_hex',
  tag: '16_byte_auth_tag_hex',
  data: 'encrypted_data_hex'
}
```

### Algorytm

- **Szyfr**: AES-256-GCM
- **IV**: 12 bajtów (losowe)
- **Tag**: 16 bajtów (uwierzytelniający)
- **Klucz**: 32 bajty (hex lub Base64)

## Rate Limiting

### Klasy błędów

```javascript
import { RateLimitError, TimeoutError } from './api-client.js';

try {
  await apiCall();
} catch (error) {
  if (error instanceof RateLimitError) {
    // Exponential backoff z jitter
    await delay(error.retryAfter || calculateBackoff(attempt));
  }
}
```

### Backoff z Jitter

```javascript
function calculateBackoff(attempt, baseDelay = 1000) {
  const exponential = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponential;
  return exponential + jitter;
}
```

## Ocena Ryzyka

```javascript
import { assessRisk } from './security/enforcer.js';

const risk = assessRisk(command, context);
// { level: RiskLevel.HIGH, reasons: ['recursive delete', 'system path'] }
```

## Reagowanie na Incydenty

1. **Sprawdź audit logi**
```bash
cat .hydra-data/audit/audit-*.log | grep CRITICAL
```

2. **Zatrzymaj system**
```bash
Ctrl+C lub process.exit()
```

3. **Przejrzyj historię**
```javascript
mcp__desktop-commander__get_recent_tool_calls({ maxResults: 100 })
```

4. **Zresetuj stan**
```javascript
import { resetAgentQueue } from './prompt-queue.js';
resetAgentQueue();
```

## Lista Kontrolna Bezpieczeństwa

- [ ] Ustaw `CACHE_ENCRYPTION_KEY` w produkcji
- [ ] Włącz `strictMode` w SecurityEnforcer
- [ ] Skonfiguruj rotację audit logów
- [ ] Ustaw limity rate limiting
- [ ] Zdefiniuj białą listę ścieżek
- [ ] Sprawdź zależności: `npm audit`
- [ ] Włącz logowanie wszystkich zdarzeń
- [ ] Skonfiguruj maksymalną liczbę naruszeń
- [ ] Przetestuj scenariusze ataków
- [ ] Dokumentuj procedury reagowania

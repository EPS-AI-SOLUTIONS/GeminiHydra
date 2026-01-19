# CLI - Interfejs Linii Poleceń

## Uruchomienie

```bash
# Podstawowe uruchomienie
npm start

# Z trybem debug
DEBUG=true npm start

# Z trybem YOLO (bez potwierdzeń)
HYDRA_YOLO=true npm start

# Uruchomienie testów
npm test

# Uruchomienie z konkretnym modelem
npm start -- --model llama3.2:1b
```

## Komendy Interaktywne

| Komenda | Opis |
|---------|------|
| `/help` | Wyświetl pomoc |
| `/status` | Status systemu |
| `/agents` | Lista agentów |
| `/metrics` | Metryki wydajności |
| `/memory` | Lista zapisanych pamięci |
| `/clear` | Wyczyść ekran |
| `/exit` | Zakończ program |

## Formatowanie Output

### Markdown

CLI wspiera renderowanie Markdown:
- **Pogrubienie**: `**tekst**`
- *Kursywa*: `*tekst*`
- `Kod inline`: `` `kod` ``
- Bloki kodu z podświetleniem składni

### Kolory

```javascript
// src/logger/colors.js
export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};
```

## Struktura CLI

```
src/cli/
├── index.js      # Główny entry point
├── commands/     # Handlery komend
├── ui/           # Komponenty UI
└── utils/        # Utility functions
```

## Przykładowa Sesja

```
╔══════════════════════════════════════════════════════════════════════╗
║                         HYDRA CLI v1.0.0                             ║
╚══════════════════════════════════════════════════════════════════════╝

[System] 12 agents initialized
[System] Ollama backend connected
[System] MCP servers ready

hydra> Przeanalizuj bezpieczeństwo pliku src/config.js

[Dijkstra] Planning task decomposition...
[Geralt] Starting security analysis...
[Vesemir] Reviewing findings...

═══ Security Analysis Report ═══

✅ No critical vulnerabilities found
⚠️ 2 warnings:
   - Line 45: Consider using environment variable
   - Line 78: Validate input before processing

Suggestions:
1. Move API_KEY to .env file
2. Add input validation

hydra> /status

═══ System Status ═══
Backend: ollama
Active Agents: 12/12
Queue: 0 pending, 0 running
Uptime: 5m 23s

hydra> /exit
Goodbye!
```

## Konfiguracja CLI

```javascript
// src/cli/config.js
export const cliConfig = {
  prompt: 'hydra> ',
  historyFile: '.hydra-history',
  maxHistorySize: 1000,
  enableColors: true,
  enableMarkdown: true
};
```

## Obsługa Błędów

```
hydra> /invalid-command

❌ Unknown command: /invalid-command
Type /help for available commands.

hydra> execute dangerous command

⚠️ This operation requires confirmation.
Do you want to proceed? [y/N]: n
Operation cancelled.
```

## Tryby Pracy

### Tryb Interaktywny (domyślny)

```bash
npm start
```

Pełna interaktywność z promptem.

### Tryb Single Command

```bash
npm start -- -c "Analyze file.js"
```

Wykonaj pojedyncze polecenie i zakończ.

### Tryb Pipe

```bash
echo "Explain this code" | npm start --
```

Przyjmij input ze stdin.

## Environment Variables

```bash
# Plik .env
DEBUG=false
LOG_LEVEL=info
HYDRA_YOLO=false
GEMINI_API_KEY=your_key
```

---

## Pełna Lista Komend

### Komendy statusu

| Komenda | Alias | Opis |
|---------|-------|------|
| `/health` | `/h` | Sprawdź zdrowie systemu |
| `/stats` | `/s` | Statystyki użycia |
| `/models` | `/m` | Lista dostępnych modeli |
| `/config` | `/cfg` | Wyświetl konfigurację |
| `/reset` | `/r` | Zresetuj stan |

### Komendy providerów

| Komenda | Alias | Opis |
|---------|-------|------|
| `/ollama` | `/ol` | Wymuś Ollama |
| `/gemini` | `/gm` | Wymuś Gemini |
| `/auto` | `/a` | Automatyczny wybór |

### Komendy trybu

| Komenda | Alias | Opis |
|---------|-------|------|
| `/quick` | `/q` | Tryb szybki (bez planowania) |
| `/multiline` | `/ml` | Tryb wieloliniowy |

### Komendy debug

| Komenda | Alias | Opis |
|---------|-------|------|
| `/analyze` | `/an` | Analiza routingu |

### Komendy ogólne

| Komenda | Alias | Opis |
|---------|-------|------|
| `/clear` | `/cls` | Wyczyść ekran |
| `/help` | `/?` | Wyświetl pomoc |
| `/history` | `/hist` | Historia komend |
| `/theme` | `/th` | Zmień motyw |
| `/export` | `/exp` | Eksportuj sesję |
| `/import` | `/imp` | Importuj sesję |
| `/exit` | `/quit` | Zakończ |

---

## Motywy

```javascript
// Dostępne motywy
const themes = {
  hydra: {    // Domyślny - niebieski/cyjan
    primary: 'cyan',
    secondary: 'blue',
    success: 'green',
    error: 'red',
    warning: 'yellow'
  },
  minimal: {  // Minimalistyczny
    primary: 'white',
    secondary: 'gray'
  },
  neon: {     // Neonowy
    primary: 'magenta',
    secondary: 'cyan'
  },
  monokai: {  // Monokai
    primary: 'yellow',
    secondary: 'magenta'
  },
  dracula: {  // Dracula
    primary: 'purple',
    secondary: 'pink'
  }
};
```

Zmiana motywu:
```
hydra> /theme neon
✅ Theme changed to: neon
```

---

## Skróty Klawiszowe

| Klawisz | Akcja |
|---------|-------|
| `↑` / `↓` | Historia komend |
| `Tab` | Autouzupełnianie |
| `Ctrl+C` | Przerwij operację |
| `Ctrl+D` | Wyjdź z programu |
| `Ctrl+L` | Wyczyść ekran |
| `Ctrl+U` | Wyczyść linię |
| `Ctrl+W` | Usuń ostatnie słowo |
| `Home` / `End` | Początek/koniec linii |

---

## Autouzupełnianie

Autouzupełnianie działa dla:

1. **Komend** - `/he` + Tab → `/help`
2. **Ścieżek plików** - `analyze src/` + Tab → `analyze src/index.js`
3. **Nazw agentów** - `@Ger` + Tab → `@Geralt`
4. **Opcji** - `--ver` + Tab → `--verbose`

---

## Struktura Plików CLI

```
src/cli/
├── index.js          # Główny punkt wejścia i klasa HydraCLI
├── constants.js      # Stałe (klawisze, ANSI, symbole)
├── CommandParser.js  # Parser i rejestr komend
├── InputHandler.js   # Obsługa wejścia readline
├── OutputRenderer.js # Renderowanie wyjścia (markdown, tabele, ramki)
├── Theme.js          # System motywów
├── Spinner.js        # Animacje i paski postępu
├── HistoryManager.js # Zarządzanie historią
└── Autocomplete.js   # System autouzupełniania
```

---

## Troubleshooting

### Problem: CLI nie uruchamia się

```bash
# Sprawdź zależności
npm install

# Sprawdź Node.js
node --version  # Wymaga >= 18.0.0
```

### Problem: Brak kolorów

```bash
# Wymuś kolory
FORCE_COLOR=1 npm start

# Lub wyłącz
NO_COLOR=1 npm start
```

### Problem: Historia nie działa

```bash
# Sprawdź uprawnienia
ls -la ~/.hydra-history

# Wyczyść historię
rm ~/.hydra-history
```

### Problem: Unicode nie wyświetla się

Terminal musi wspierać UTF-8:

```bash
# Linux/macOS
export LANG=en_US.UTF-8

# Windows PowerShell
[Console]::OutputEncoding = [Text.UTF8Encoding]::UTF8
```

---

## Logi debugowania

```bash
# Włącz pełne logi
DEBUG=hydra:* npm start

# Tylko CLI
DEBUG=hydra:cli npm start

# Tylko routing
DEBUG=hydra:router npm start
```

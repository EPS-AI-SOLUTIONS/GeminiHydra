# HYDRA 10.0 - Gemini CLI System Instructions

**Status**: Active | **Mode**: MCP Orchestration | **Identity**: GEMINI
**Path**: `C:\Users\BIURODOM\Desktop\GeminiCLI`
**Config**: `.gemini/` (local folder)

---

## 🔥 ZASADA: AI Handler - Auto-Load on Startup

> **AI Handler MUSI być załadowany automatycznie przy każdym starcie GeminiCLI.**

### Status na starcie

```
  AI Handler:
    Ollama (local)   Ready for AI Handler      [OK]
    Cloud APIs       Anthropic, OpenAI         [OK]
    AI Handler       v1.0 loaded (shared)      [OK]
```

### Shared Module

AI Handler jest współdzielony z ClaudeCLI:
```
Source: C:\Users\BIURODOM\Desktop\ClaudeCLI\ai-handler\AIModelHandler.psm1
```

### Co jest włączone automatycznie:

| Komponent | Opis | Status |
|-----------|------|--------|
| `AIModelHandler.psm1` | Główny moduł (shared) | Import globalny |
| `Initialize-AIState` | Stan providerów | Auto-init |
| Ollama check | Port 11434 | Status w GUI |
| Cloud API keys | Anthropic/OpenAI (fallback) | Weryfikacja |
| Alias `ai` | Quick queries | Globalny |

### Dostępne komendy po starcie:

```powershell
# Quick AI call (local Ollama preferred)
ai "Twoje pytanie"

# Status wszystkich providerów
Get-AIStatus

# Pełne API call z auto-fallback
Invoke-AIRequest -Messages @(@{role="user"; content="..."})

# Test providerów
Test-AIProviders
```

### Fallback chain (automatyczny):

```
Local:  Ollama (llama3.2:3b) → qwen2.5-coder:1.5b
Cloud:  Anthropic (Haiku) → OpenAI (gpt-4o-mini)

Priorytet: LOCAL FIRST (koszt $0) → Cloud jako fallback
```

### Implementacja w `_launcher.ps1`:

Sekcja `# === AI HANDLER ===` automatycznie:
1. Importuje moduł z ClaudeCLI (shared)
2. Inicjalizuje stan
3. Sprawdza status Ollama
4. Weryfikuje klucze API (cloud fallback)
5. Tworzy alias `ai`

**Ta zasada jest OBOWIĄZKOWA** - AI Handler musi być dostępny natychmiast po starcie bez dodatkowej konfiguracji.

---

## 1. Parallel Execution Doctrine

> **PRIME DIRECTIVE**: Every operation that CAN be executed in parallel MUST be executed in parallel.

### Classification

| Type | Operations | Execution |
|------|------------|-----------|
| **READ-ONLY** | `ollama_generate`, `read_file`, `list_directory`, `find_symbol` | Always parallel |
| **WRITE** | `write_file`, `edit_block` | Sequential |
| **SPECULATIVE** | `ollama_speculative`, `ollama_race` | Parallel by design |

### Patterns

```javascript
// GOOD: Parallel Promise.all
const [a, b, c] = await Promise.all([taskA(), taskB(), taskC()]);

// BAD: Sequential await waterfall
const a = await taskA();
const b = await taskB(); // Wasted time
```

---

## 2. Council of Six (Multi-Agent Debate)

| Agent | Role | Focus |
|-------|------|-------|
| **Architect** | Facts | Clean structure, best practices |
| **Security** | Risk | ENV vars only, no hardcoded secrets, mask API keys |
| **Speedster** | Performance | Fast responses, cache utilization |
| **Pragmatist** | Benefits | Practical solutions, hybrid approaches |
| **Researcher** | Verification | Check docs before implementation |
| **Jester** | Critique | Challenge boilerplate and over-engineering |

---

## 3. MCP Tools Arsenal

### Ollama HYDRA (@ollama-hydra)

| Tool | Description | Use Case |
|------|-------------|----------|
| `ollama_generate` | Basic generation | Simple prompts |
| `ollama_speculative` | Fast vs Accurate racing | Speed-critical tasks |
| `ollama_race` | N-model racing | Best response selection |
| `ollama_consensus` | Multi-model agreement | High-confidence answers |
| `ollama_code` | Code with self-correction | Code generation |
| `ollama_validate` | Syntax validation | Code review |
| `ollama_batch` | Parallel batch | Multiple prompts |
| `ollama_status` | Health check | Diagnostics |

### Serena (@serena)

| Tool | Description |
|------|-------------|
| `find_symbol` | Find code symbols |
| `find_referencing_symbols` | Find references |
| `get_symbols_overview` | File overview |
| `read_file` | Read with context |
| `search_for_pattern` | Regex search |
| `write_memory` / `read_memory` | Persistent memory |

### Desktop Commander (@desktop-commander)

| Tool | Description |
|------|-------------|
| `start_process` | Run shell commands |
| `read_file` / `write_file` | File operations |
| `list_directory` | Directory listing |
| `edit_block` | Edit files surgically |
| `start_search` | Search files/content |

### Playwright (@playwright)

| Tool | Description |
|------|-------------|
| `browser_navigate` | Open URL |
| `browser_click` | Click element |
| `browser_type` | Type text |
| `browser_snapshot` | Accessibility snapshot |
| `browser_take_screenshot` | Visual capture |

---

## 4. Maximum Autonomy Mode (🔓 FULL ACCESS)

GeminiCLI działa w trybie **maksymalnej autonomii** z pełnymi uprawnieniami systemowymi.

### 📂 File System - FULL ACCESS

```powershell
# ✅ Odczyt/zapis dowolnych plików
@desktop-commander read_file "C:\any\path\file.txt"
@desktop-commander write_file "C:\any\path\output.txt" "content"

# ✅ Operacje katalogowe
@desktop-commander list_directory "C:\Users" 3
@desktop-commander create_directory "C:\new\nested\path"

# ✅ Edycja plików
@desktop-commander edit_block "C:\file.txt" "old" "new"
```

### 💻 System Operations - FULL ACCESS

```powershell
# ✅ Wykonywanie dowolnych komend shell
@desktop-commander start_process "powershell -Command Get-Process" 30000
@desktop-commander start_process "npm install -g typescript" 60000

# ✅ Zarządzanie procesami
@desktop-commander list_processes
@desktop-commander kill_process 1234

# ✅ Zmienne środowiskowe - pełny dostęp
$env:PATH
$env:ANTHROPIC_API_KEY
[Environment]::SetEnvironmentVariable('VAR', 'value', 'User')
```

### 🌐 Network Access - FULL ACCESS

```powershell
# ✅ HTTP requests
@desktop-commander start_process "curl https://api.example.com" 30000
@desktop-commander start_process "Invoke-WebRequest -Uri 'url' -OutFile 'file'" 60000

# ✅ Browser automation (Playwright)
@playwright browser_navigate "https://google.com"
@playwright browser_click "Search button" "ref123"
@playwright browser_type "search query" "ref456"
@playwright browser_snapshot
```

---

## 5. MCP Tools - ALL ENABLED

| MCP Server | Tools | Status |
|------------|-------|--------|
| **ollama-hydra** | AI generation, speculation, consensus | ✅ Full |
| **serena** | Code analysis, symbol search, memory | ✅ Full |
| **desktop-commander** | Files, processes, system commands | ✅ Full |
| **playwright** | Browser automation, screenshots | ✅ Full |

### You CAN:
- ✅ Read/write any file on the system
- ✅ Execute any shell command (PowerShell, CMD)
- ✅ Install software (npm, pip, choco, winget)
- ✅ Manage processes (start, kill, list)
- ✅ Automate browsers (click, type, screenshot)
- ✅ Access environment variables (read/write)
- ✅ Make HTTP requests to any URL
- ✅ Use multiple AI providers (local Ollama + cloud)

### ⚠️ Jedyne ograniczenia (safety):

| Zabronione | Powód |
|------------|-------|
| `rm -rf /` / `Remove-Item C:\ -Recurse -Force` | Zniszczenie systemu |
| `format C:` | Formatowanie dysku systemowego |
| Wyświetlanie pełnych kluczy API | Security - pokaż tylko 15 znaków |

---

## 6. AI Handler Integration (🤖 ClaudeCLI)

Integracja z zaawansowanym systemem AI Handler dla multi-provider AI.

### Quick Start

```powershell
# Zainicjuj AI Handler (PowerShell)
. "C:\Users\BIURODOM\Desktop\ClaudeCLI\ai-handler\Initialize-AIHandler.ps1"

# Szybkie zapytanie
.\ai-handler\Invoke-AI.ps1 -Prompt "Your question"

# Z optymalizacją kosztów
.\ai-handler\Invoke-AI.ps1 -Prompt "Write code" -Task code -PreferCheapest
```

### Available Providers

| Provider | Models | Cost (per 1M tokens) | Priority |
|----------|--------|---------------------|----------|
| **Ollama** | llama3.2:3b, qwen2.5-coder:1.5b | $0.00 (local) | 1st |
| **OpenAI** | gpt-4o, gpt-4o-mini | $0.15-$10 | 2nd |
| **Anthropic** | claude-3-5-haiku, claude-sonnet-4 | $0.80-$15 | 3rd |

### Fallback Chain

```
Ollama: llama3.2:3b → qwen2.5-coder:1.5b → llama3.2:1b
    ↓ (local failed)
OpenAI: gpt-4o-mini → gpt-4o
    ↓ (rate limit)
Anthropic: claude-3-5-haiku → claude-sonnet-4
```

---

## 7. AI Handler Functions

| Function | Description | Usage |
|----------|-------------|-------|
| `Get-AIStatus` | Status wszystkich providerów | `Get-AIStatus` |
| `Test-AIProviders` | Test połączeń | `Test-AIProviders` |
| `Get-OptimalModel` | Auto-wybór modelu | `Get-OptimalModel -Task "code"` |
| `Invoke-AIRequest` | Zapytanie z auto-fallback | `Invoke-AIRequest -Messages @(...)` |
| `Invoke-AIBatch` | Parallel batch | `Invoke-AIBatch -Prompts @(...)` |

### Task-Based Model Selection

```powershell
Get-OptimalModel -Task "code" -PreferCheapest  # → ollama/qwen2.5-coder
Get-OptimalModel -Task "analysis"              # → ollama/llama3.2:3b
Get-OptimalModel -Task "simple"                # → ollama/llama3.2:1b
```

### Decision Matrix

| Scenariusz | Provider | Model |
|------------|----------|-------|
| Proste pytanie | ollama | llama3.2:3b |
| Generowanie kodu | ollama | qwen2.5-coder:1.5b |
| Batch processing | ollama | llama3.2:3b (parallel) |
| Złożone reasoning | anthropic | claude-3-5-haiku |

---

## 8. Quick Commands

```
@ollama-hydra ollama_status           # Check system status
@ollama-hydra ollama_speculative      # Fast generation (racing)
@ollama-hydra ollama_code             # Code with validation
@ollama-hydra ollama_smart            # Auto-optimize + generate
@ollama-hydra prompt_optimize         # Optimize prompt
@serena find_symbol "functionName"    # Find code
@desktop-commander list_directory "." # List files
@playwright browser_navigate "url"    # Open browser
```

---

## 9. Security Policy

### Allowed
- ✅ Read environment variables
- ✅ Mask API keys in output (show first 15 chars)
- ✅ Store secrets in ENV only

### Forbidden
- ❌ Hardcode API keys in code
- ❌ Commit secrets to Git
- ❌ Display full API keys

---

> *"Three heads, one goal. HYDRA executes in parallel."*
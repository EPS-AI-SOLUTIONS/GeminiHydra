# MCP - Model Context Protocol

## Przegląd

MCP (Model Context Protocol) to obowiązkowy protokół komunikacji w HYDRA. Wszystkie operacje na plikach, sieci i systemie MUSZĄ przechodzić przez serwery MCP.

## Dostępne Serwery MCP

### 1. Serena (Symbolic Code Analysis)

```javascript
// Operacje na plikach
mcp__serena__read_file({ relative_path: 'src/index.js' })
mcp__serena__create_text_file({ relative_path: 'new.js', content: '...' })
mcp__serena__replace_content({ relative_path: 'file.js', needle: 'old', repl: 'new' })

// Analiza symboliczna
mcp__serena__get_symbols_overview({ relative_path: 'src/' })
mcp__serena__find_symbol({ name_path_pattern: 'ClassName/methodName' })
mcp__serena__find_referencing_symbols({ name_path: 'MyClass' })

// Pamięć
mcp__serena__write_memory({ memory_file_name: 'context.md', content: '...' })
mcp__serena__read_memory({ memory_file_name: 'context.md' })
mcp__serena__list_memories()

// Shell (z ograniczeniami bezpieczeństwa)
mcp__serena__execute_shell_command({ command: 'npm test' })
```

### 2. Desktop Commander (System Operations)

```javascript
// Pliki
mcp__desktop-commander__read_file({ path: '/absolute/path/file.js' })
mcp__desktop-commander__write_file({ path: '/path/file.js', content: '...', mode: 'rewrite' })
mcp__desktop-commander__edit_block({ file_path: '/path', old_string: 'old', new_string: 'new' })

// System plików
mcp__desktop-commander__list_directory({ path: '/path', depth: 2 })
mcp__desktop-commander__get_file_info({ path: '/path/file.js' })
mcp__desktop-commander__create_directory({ path: '/new/dir' })
mcp__desktop-commander__move_file({ source: '/old', destination: '/new' })

// Wyszukiwanie
mcp__desktop-commander__start_search({
  path: '/project',
  pattern: '*.js',
  searchType: 'files'
})

// Procesy
mcp__desktop-commander__start_process({ command: 'node -i' })
mcp__desktop-commander__interact_with_process({ pid: 1234, input: 'console.log(1)' })
mcp__desktop-commander__list_sessions()
```

### 3. Playwright (Browser Automation)

```javascript
// Nawigacja
mcp__playwright__browser_navigate({ url: 'https://example.com' })
mcp__playwright__browser_navigate_back()

// Interakcja
mcp__playwright__browser_click({ ref: 'button[0]' })
mcp__playwright__browser_type({ ref: 'input[0]', text: 'Hello' })
mcp__playwright__browser_fill_form({ fields: [...] })

// Zrzuty ekranu
mcp__playwright__browser_snapshot()
mcp__playwright__browser_take_screenshot({ fullPage: true })

// Konsola i sieć
mcp__playwright__browser_console_messages()
mcp__playwright__browser_network_requests()
```

## Wymuszanie MCP

```javascript
// ❌ ZABRONIONE - Bezpośredni dostęp
import { readFileSync } from 'fs';
const content = readFileSync('file.js');

// ✅ WYMAGANE - Przez MCP
const content = await mcp__serena__read_file({ relative_path: 'file.js' });
```

## Konfiguracja MCP

MCP jest skonfigurowany w `mcp_config.json`:

```json
{
  "mcpServers": {
    "serena": {
      "command": "uvx",
      "args": ["--from", "serena-ai", "serena", "--project-path", "."]
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

## Protokół Komunikacji

- Transport: stdio (standard input/output)
- Format: JSON-RPC 2.0
- Kodowanie: UTF-8

### Struktura Żądania

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": { "relative_path": "src/index.js" }
  },
  "id": 1
}
```

### Struktura Odpowiedzi

```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [{ "type": "text", "text": "file contents..." }],
    "isError": false
  },
  "id": 1
}
```

## Obsługa Błędów

```javascript
try {
  const result = await mcp__serena__read_file({ relative_path: 'missing.js' });
} catch (error) {
  // Obsługa błędu MCP
  console.error('MCP Error:', error.message);
}
```

## Bezpieczeństwo MCP

1. **Walidacja ścieżek** - Blokowanie dostępu do katalogów systemowych
2. **Sandboxing** - Izolacja operacji shell
3. **Rate limiting** - Ograniczenie liczby żądań
4. **Audit logging** - Logowanie wszystkich operacji

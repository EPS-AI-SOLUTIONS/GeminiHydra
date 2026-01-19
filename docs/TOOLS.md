# Narzędzia HYDRA

## Przegląd

HYDRA udostępnia zestaw narzędzi dostępnych przez protokół MCP. Wszystkie operacje na plikach, systemie i sieci MUSZĄ korzystać z tych narzędzi.

## Narzędzia Plikowe

### Serena File Tools

```javascript
// Odczyt pliku
mcp__serena__read_file({
  relative_path: 'src/index.js',
  start_line: 1,
  end_line: 100
})

// Tworzenie pliku
mcp__serena__create_text_file({
  relative_path: 'src/new-file.js',
  content: 'export default {};\n'
})

// Zamiana zawartości
mcp__serena__replace_content({
  relative_path: 'src/file.js',
  needle: 'oldFunction',
  repl: 'newFunction',
  mode: 'literal',  // lub 'regex'
  allow_multiple_occurrences: false
})

// Lista plików
mcp__serena__list_dir({
  relative_path: 'src/',
  recursive: true,
  skip_ignored_files: true
})

// Znajdź pliki
mcp__serena__find_file({
  relative_path: 'src/',
  file_mask: '*.js'
})
```

### Desktop Commander File Tools

```javascript
// Odczyt pliku (absolute path)
mcp__desktop-commander__read_file({
  path: 'C:\\project\\src\\index.js',
  offset: 0,
  length: 100
})

// Zapis pliku
mcp__desktop-commander__write_file({
  path: 'C:\\project\\src\\new.js',
  content: 'content here',
  mode: 'rewrite'  // lub 'append'
})

// Edycja blokowa
mcp__desktop-commander__edit_block({
  file_path: 'C:\\project\\src\\file.js',
  old_string: 'old code',
  new_string: 'new code',
  expected_replacements: 1
})

// Informacje o pliku
mcp__desktop-commander__get_file_info({
  path: 'C:\\project\\src\\index.js'
})

// Lista katalogów
mcp__desktop-commander__list_directory({
  path: 'C:\\project\\src',
  depth: 2
})
```

## Narzędzia Analizy Kodu

### Serena Symbolic Tools

```javascript
// Przegląd symboli
mcp__serena__get_symbols_overview({
  relative_path: 'src/module.js',
  depth: 2
})

// Znajdź symbol
mcp__serena__find_symbol({
  name_path_pattern: 'ClassName/methodName',
  relative_path: 'src/',
  include_body: true,
  include_info: true
})

// Znajdź referencje
mcp__serena__find_referencing_symbols({
  name_path: 'MyClass',
  relative_path: 'src/'
})

// Zamień ciało symbolu
mcp__serena__replace_symbol_body({
  relative_path: 'src/file.js',
  name_path: 'MyClass/myMethod',
  body: 'return 42;'
})

// Wstaw po symbolu
mcp__serena__insert_after_symbol({
  relative_path: 'src/file.js',
  name_path: 'MyClass',
  body: '\nexport const newConst = 1;'
})

// Zmień nazwę symbolu
mcp__serena__rename_symbol({
  relative_path: 'src/file.js',
  name_path: 'oldName',
  new_name: 'newName'
})
```

## Narzędzia Wyszukiwania

### Desktop Commander Search

```javascript
// Wyszukiwanie plików
mcp__desktop-commander__start_search({
  path: 'C:\\project',
  pattern: '*.test.js',
  searchType: 'files',
  ignoreCase: true
})

// Wyszukiwanie treści
mcp__desktop-commander__start_search({
  path: 'C:\\project\\src',
  pattern: 'TODO',
  searchType: 'content',
  filePattern: '*.js',
  contextLines: 2
})

// Pobierz wyniki
mcp__desktop-commander__get_more_search_results({
  sessionId: 'session-id',
  offset: 0,
  length: 100
})

// Zatrzymaj wyszukiwanie
mcp__desktop-commander__stop_search({
  sessionId: 'session-id'
})
```

### Serena Pattern Search

```javascript
mcp__serena__search_for_pattern({
  substring_pattern: 'function\\s+\\w+',
  relative_path: 'src/',
  restrict_search_to_code_files: true,
  context_lines_before: 2,
  context_lines_after: 2
})
```

## Narzędzia Systemowe

### Desktop Commander Process Tools

```javascript
// Uruchom proces
mcp__desktop-commander__start_process({
  command: 'npm test',
  timeout_ms: 60000
})

// Interakcja z procesem (REPL)
mcp__desktop-commander__start_process({
  command: 'node -i'
})

mcp__desktop-commander__interact_with_process({
  pid: 1234,
  input: 'console.log("hello")',
  timeout_ms: 5000
})

// Odczytaj output
mcp__desktop-commander__read_process_output({
  pid: 1234,
  timeout_ms: 3000
})

// Lista sesji
mcp__desktop-commander__list_sessions()

// Zabij proces
mcp__desktop-commander__force_terminate({ pid: 1234 })
```

### Serena Shell

```javascript
mcp__serena__execute_shell_command({
  command: 'npm run build',
  capture_stderr: true,
  cwd: 'C:\\project'
})
```

## System Pamięci

### Serena Memory Tools

```javascript
// Zapisz pamięć
mcp__serena__write_memory({
  memory_file_name: 'project-context.md',
  content: '# Project Context\n\nKey information...'
})

// Odczytaj pamięć
mcp__serena__read_memory({
  memory_file_name: 'project-context.md'
})

// Lista pamięci
mcp__serena__list_memories()

// Edytuj pamięć
mcp__serena__edit_memory({
  memory_file_name: 'context.md',
  needle: 'old info',
  repl: 'new info',
  mode: 'literal'
})

// Usuń pamięć
mcp__serena__delete_memory({
  memory_file_name: 'obsolete.md'
})
```

## Narzędzia Przeglądarki

### Playwright Browser Tools

```javascript
// Nawigacja
mcp__playwright__browser_navigate({
  url: 'https://example.com'
})

// Snapshot (accessibility tree)
mcp__playwright__browser_snapshot()

// Screenshot
mcp__playwright__browser_take_screenshot({
  fullPage: true,
  type: 'png'
})

// Kliknięcie
mcp__playwright__browser_click({
  ref: 'button[0]',
  element: 'Submit'
})

// Wpisywanie
mcp__playwright__browser_type({
  ref: 'input[0]',
  text: 'Hello World',
  submit: false
})

// Wypełnij formularz
mcp__playwright__browser_fill_form({
  fields: [
    { selector: '#name', value: 'John' },
    { selector: '#email', value: 'john@example.com' }
  ]
})

// Konsola i sieć
mcp__playwright__browser_console_messages()
mcp__playwright__browser_network_requests()

// Zamknij
mcp__playwright__browser_close()
```

## Narzędzia Utility

### Desktop Commander Utilities

```javascript
// Konfiguracja
mcp__desktop-commander__get_config()
mcp__desktop-commander__set_config_value({
  key: 'fileReadLineLimit',
  value: 2000
})

// Statystyki użycia
mcp__desktop-commander__get_usage_stats()

// Historia wywołań
mcp__desktop-commander__get_recent_tool_calls({
  maxResults: 50,
  toolName: 'write_file'
})
```

## Best Practices

1. **Używaj ścieżek względnych z Serena** - prostsze i bezpieczniejsze
2. **Używaj ścieżek absolutnych z Desktop Commander** - wymagane
3. **Zawsze obsługuj błędy** - sprawdzaj `isError` w odpowiedzi
4. **Używaj pamięci dla kontekstu** - persist knowledge across sessions
5. **Preferuj symbolic tools** - `find_symbol` > `search_for_pattern`

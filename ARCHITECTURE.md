# Architektura

## Moduły

- `src/server.js` – główny serwer MCP i routing narzędzi.
- `src/tools.js` – definicje narzędzi MCP.
- `src/config.js` – konfiguracja z ENV.
- `src/env.js` – walidacja i ładowanie zmiennych środowiskowych.
- `src/logger.js` – logger z poziomami i JSON w produkcji.
- `src/cache.js` – cache z szyfrowaniem AES-256-GCM.
- `src/tool-validator.js` – walidacja wejść narzędzi przez JSON Schema.

## Przepływ

1. Serwer ładuje konfigurację i wersję.
2. Inicjalizuje kolejkę (opcjonalnie z persystencją) i cache (sprzątanie cykliczne).
3. Obsługuje wywołania narzędzi z walidacją wejścia.

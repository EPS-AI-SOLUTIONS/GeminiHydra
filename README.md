# HYDRA Ollama MCP Server

Lekki serwer MCP do integracji z Ollama i Gemini CLI, z kolejką zadań, cache i optymalizacją promptów.

## Szybki start

```bash
pnpm install
pnpm start
```

## Konfiguracja

Skopiuj `.env.example` do `.env` i ustaw wartości według potrzeb. Konfiguracja ładowana jest przez `dotenv`, więc lokalnie wystarczy jeden plik.

Najważniejsze zmienne:
- `OLLAMA_HOST`
- `DEFAULT_MODEL`, `FAST_MODEL`, `CODER_MODEL`
- `CACHE_ENCRYPTION_KEY` (AES-256-GCM, 32 bajty)
- `CACHE_MAX_ENTRY_BYTES`, `CACHE_CLEANUP_INTERVAL_MS`, `CACHE_MAX_TOTAL_MB`
- `PROMPT_MAX_LENGTH`, `MODEL_ALLOWLIST`, `MODEL_DENYLIST`
- `PROMPT_RISK_BLOCK`
- `GEMINI_FETCH_TIMEOUT_MS`, `GEMINI_FETCH_RETRIES`
- `QUEUE_PERSISTENCE_ENABLED`, `QUEUE_PERSISTENCE_PATH`

## Narzędzia MCP

Serwer udostępnia m.in.:
- `ollama_generate`, `ollama_smart`, `ollama_speculative`
- `ollama_status`, `ollama_cache_clear`
- `hydra_health`, `hydra_config`

Domyślna kolejka promptów korzysta z AI handlera (smart generowanie) już przy starcie.

## Kolejka i cache

- Kolejka może zapisywać stan na dysku (opcja `QUEUE_PERSISTENCE_ENABLED`).
- Cache ma limit rozmiaru wpisu i cykliczne sprzątanie.

## Logowanie

Logi w produkcji są w JSON, sterowane przez `LOG_LEVEL`.

## Bezpieczeństwo konfiguracji

- Klucze API tylko przez zmienne środowiskowe (`.env` + `dotenv`).
- `.env` pozostaje w `.gitignore`.

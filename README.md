# HYDRA Ollama MCP Server

Lekki serwer MCP do integracji z Ollama i Gemini CLI, z kolejką zadań, cache i optymalizacją promptów.

## Szybki start

```bash
pnpm install
pnpm start
```

## Konfiguracja

Skopiuj `.env.example` do `.env` i ustaw wartości według potrzeb.

Najważniejsze zmienne:
- `OLLAMA_HOST`
- `DEFAULT_MODEL`, `FAST_MODEL`, `CODER_MODEL`
- `CACHE_ENCRYPTION_KEY` (AES-256-GCM, 32 bajty)

## Narzędzia MCP

Serwer udostępnia m.in.:
- `ollama_generate`, `ollama_smart`, `ollama_speculative`
- `ollama_status`, `ollama_cache_clear`
- `hydra_health`, `hydra_config`

Domyślna kolejka promptów korzysta z AI handlera (smart generowanie) już przy starcie.

## Logowanie

Logi w produkcji są w JSON, sterowane przez `LOG_LEVEL`.

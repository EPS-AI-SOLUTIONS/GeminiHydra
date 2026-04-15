# SQLx Offline Query Cache

Ten katalog zawiera metadane zapytań SQLx dla trybu offline CI.

## Stan obecny

GeminiHydra backend używa wyłącznie **runtime** `sqlx::query` / `sqlx::query_as`
(nie compile-time `query!` makr). Dlatego ten katalog nie zawiera plików JSON z cache
zapytań — jest tu tylko ten README i `.gitkeep` żeby katalog był widoczny w git.

Ustawienie `SQLX_OFFLINE=true` w CI pozwala `cargo check` / `cargo clippy` /
`cargo test --no-run` kompilować bez żywej bazy PostgreSQL.

## Regeneracja (wymagana żywa baza danych z pgvector)

Jeśli w przyszłości dodasz makra `query!` do kodu, uruchom:

    cd apps/GeminiHydra/backend
    DATABASE_URL="postgresql://gemini:gemini_local@localhost:5432/geminihydra" cargo sqlx prepare --workspace

Wymaga:
- Docker Desktop uruchomiony
- `docker run -d --name geminihydra-pg -e POSTGRES_USER=gemini -e POSTGRES_PASSWORD=gemini_local -e POSTGRES_DB=geminihydra -p 5432:5432 pgvector/pgvector:pg16`
- `DATABASE_URL=... cargo run` (uruchom migracje)
- Następnie `cargo sqlx prepare --workspace`

## Kiedy regenerować

- Po dodaniu nowej `query!` / `query_as!` / `query_scalar!` makry w kodzie Rust
- Po zmianie schematu bazy danych (nowa migracja)
- Jeśli CI zgłasza "query not found in offline cache"

## Porty baz danych (wszystkie Hydra)

| App           | DB port | DB name      | User     |
|---------------|---------|--------------|----------|
| GeminiHydra   | 5432    | geminihydra  | gemini   |
| GrokHydra     | 5434    | grokhydra    | grok     |
| DeepSeekHydra | 5435    | deepseekhydra| deepseek |

# Build context: workspace root (JaskierWorkspace/)
# fly deploy must be run from workspace root, or fly.toml must set build.context

# ── Stage 1: cargo-chef base ──
FROM lukemathwalker/cargo-chef:latest-rust-1 AS chef
WORKDIR /app

# ── Stage 2: Planner — generate recipe from full workspace ──
FROM chef AS planner
# Copy workspace-level manifests
COPY Cargo.toml Cargo.lock ./
# Copy all shared crates (manifests + src)
COPY crates/ ./crates/
# Copy this app's backend
COPY apps/GeminiHydra/backend/Cargo.toml ./apps/GeminiHydra/backend/Cargo.toml
COPY apps/GeminiHydra/backend/src ./apps/GeminiHydra/backend/src
# Stub out other workspace members so Cargo can resolve the full workspace graph.
# ClaudeHydra is listed as "apps/ClaudeHydra/backend" in root Cargo.toml (via junction),
# so the stub must be placed at apps/ClaudeHydra/backend/ — not ClaudeHydra/backend/.
RUN for pkg in ClaudeHydra Tissaia OpenAIHydra GrokHydra DeepSeekHydra Regis; do \
      mkdir -p apps/$pkg/backend/src && \
      echo 'fn main() {}' > apps/$pkg/backend/src/main.rs; \
    done
RUN cargo chef prepare --recipe-path recipe.json

# ── Stage 3: Builder — cook deps (cached), then compile ──
FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
# Cook all workspace dependencies — layer cached until Cargo.toml/Cargo.lock change
RUN cargo chef cook --release -p geminihydra-backend --recipe-path recipe.json
# Now copy the real source
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/
COPY apps/GeminiHydra/backend/Cargo.toml ./apps/GeminiHydra/backend/Cargo.toml
COPY apps/GeminiHydra/backend/src ./apps/GeminiHydra/backend/src
COPY apps/GeminiHydra/backend/migrations ./apps/GeminiHydra/backend/migrations
# Stub the other workspace members (src only, Cargo.toml already in recipe)
RUN for pkg in ClaudeHydra Tissaia OpenAIHydra GrokHydra DeepSeekHydra Regis; do \
      mkdir -p apps/$pkg/backend/src && \
      echo 'fn main() {}' > apps/$pkg/backend/src/main.rs; \
    done
RUN cargo build --release -p geminihydra-backend

# ── Stage 4: Minimal runtime ──
FROM debian:trixie-slim AS runtime
RUN apt-get update && apt-get install -y ca-certificates curl git && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/geminihydra-backend /usr/local/bin/app
COPY apps/GeminiHydra/backend/migrations ./migrations
ENV PORT=8081
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8081/api/health || exit 1
CMD ["app"]

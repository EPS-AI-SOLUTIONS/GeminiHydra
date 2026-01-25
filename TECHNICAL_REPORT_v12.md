# TECHNICAL REPORT v12.17 (Wolf School Upgrade)

## 1. Core Architecture Upgrades
- **EXEC Protocol:** Agents can now execute PowerShell commands directly via 'EXEC:' prefix.
- **Memory Injection:** Phase A now retrieves context from VectorDB before planning.
- **Ollama Watchdog:** System automatically detects dead Ollama instances and performs resuscitation/warmup.

## 2. Stability & Performance
- **Traffic Control:** Implemented SemaphoreSlim(3) to limit concurrent LLM requests.
- **Retry Logic:** Added exponential backoff (3 attempts) for network resilience.
- **High-Performance Env:** Processes start with OLLAMA_NUM_PARALLEL=4 and FLASH_ATTENTION=1.
- **Fail-Fast:** Reduced timeouts to 120s per task to prevent zombie threads.

## 3. Self-Healing
- Phase C is now fully operational and capable of correcting syntax errors in agent commands.

*Signed: Regis*

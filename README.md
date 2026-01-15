# HYDRA - Multi-Headed AI Orchestration System

> *"Twelve wolves hunt as one. HYDRA executes in parallel."*

## Overview

HYDRA is an AI orchestration system that combines cloud AI (Google Gemini) for strategic planning with local AI (Ollama) for parallel task execution through 12 specialized Witcher agents.

## Prerequisites

- **PowerShell 7+ (`pwsh`) or Windows PowerShell** is required to run `.\_launcher.ps1`.
  - On macOS/Linux, install PowerShell 7 and ensure `pwsh` is on your PATH.
  - If you cannot install PowerShell, use the Node entrypoint (`npm start`) instead of the launcher script.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start the system
.\_launcher.ps1
```

## Architecture

```
User Prompt → Gemini Pro (Plan) → Ollama Agents (Parallel) → Gemini Pro (Synthesize) → Answer
```

### The 12 Witcher Agents

| Agent | Specialization | Model |
|-------|---------------|-------|
| Geralt | Security/Ops | llama3.2:3b |
| Yennefer | Architecture/Code | qwen2.5-coder |
| Triss | QA/Testing | qwen2.5-coder |
| Jaskier | Documentation | llama3.2:3b |
| Ciri | Quick Tasks | llama3.2:1b |
| Regis | Research | phi3:mini |
| +6 more | Various | Various |

## Core Modules

- **AgentSwarm.psm1** - 6-step protocol with 12 agents and parallel execution
- **AIModelHandler.psm1** - Multi-provider AI interface
- **TaskClassifier.psm1** - Task routing and classification

## Configuration

Copy `.env.example` to `.env` and configure:
- `OLLAMA_HOST` - Ollama server address
- `DEFAULT_MODEL`, `FAST_MODEL`, `CODER_MODEL` - Model selection
- `SSH_PUBLIC_KEY` - Optional SSH public key for local authorization via `scripts/setup-ssh-key.sh`
- See `GEMINI.md` for full configuration options

## Documentation

- [GEMINI.md](./GEMINI.md) - System instructions and rules
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical architecture
- [CHANGELOG.md](./CHANGELOG.md) - Version history

## Git Remote Setup

`git push` requires a configured remote. If you see "No configured push destination", add one:

```bash
git remote add origin <your-remote-url>
git push -u origin <your-branch>
```

## Troubleshooting

### `pwsh` / `powershell` missing

If `pwsh` or `powershell` is not available, the launcher scripts will fail. Validate availability:

```bash
pwsh -v
powershell -v
```

If neither command exists:
- Install PowerShell 7+ and ensure `pwsh` is on PATH.
- Or skip the launcher and run the Node entrypoint instead:

```bash
npm start
```

### Error: `pwsh: command not found` / `powershell: command not found`

These errors mean PowerShell is not installed in the environment. Install PowerShell 7+ (so `pwsh` is available), or use the Node entrypoint:

```bash
npm start
```

### `git push` fails with "No configured push destination"

Add a remote and push again:

```bash
git remote add origin <your-remote-url>
git push -u origin <your-branch>
```

### Error: `fatal: No configured push destination.`

This means no Git remote is configured. Add a remote and retry:

```bash
git remote add origin <your-remote-url>
git push -u origin <your-branch>
```

## Version

**v3.0.0** - Unified AgentSwarm with parallel execution and 12 agents

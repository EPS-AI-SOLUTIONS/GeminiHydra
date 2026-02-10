# GeminiHydra v14.0 "School of the Wolf"

> **Multi-Agent AI Swarm CLI** - A powerful Node.js orchestration system featuring 12 specialized agents, 5-phase execution protocol, self-healing capabilities, and MCP (Model Context Protocol) integration.

![Version](https://img.shields.io/badge/version-14.0.0-blue)
![Stack](https://img.shields.io/badge/stack-Node.js_18%2B_TypeScript-green)
![AI](https://img.shields.io/badge/AI-Gemini_3-purple)
![License](https://img.shields.io/badge/license-MIT-orange)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Commands Reference](#cli-commands-reference)
- [Agents](#agents)
- [Gemini Models](#gemini-models)
- [Configuration](#configuration)
- [MCP Integration](#mcp-integration)
- [License](#license)

---

## Overview

**GeminiHydra** is an advanced AI agent swarm system that orchestrates multiple specialized AI agents to accomplish complex tasks. Inspired by The Witcher universe, each agent has a unique personality, role, and expertise area.

The system uses a **5-phase execution protocol** that includes:
- Automatic task translation and refinement
- Intelligent planning with dependency resolution
- Parallel graph-based execution
- Self-healing error recovery
- Final synthesis and reporting

### Key Capabilities

- **12 Specialized Agents** - Each with distinct roles (Dijkstra, Geralt, Yennefer, Triss, etc.)
- **5-Phase Protocol** - Comprehensive task execution pipeline
- **Model Selection** - Intelligent routing between `gemini-3-pro-preview` and `gemini-3-flash-preview`
- **MCP Integration** - Connect to external tools via Model Context Protocol
- **Self-Healing** - Automatic error detection and repair cycles
- **Memory Systems** - Session, long-term, and agent-specific memory
- **YOLO Mode** - Full autonomous execution with file/shell/network access

---

## Features

### 5-Phase Execution Protocol

| Phase | Name | Description |
|-------|------|-------------|
| **PRE-A** | Translation & Refinement | Translates non-English objectives, classifies task difficulty, selects optimal model |
| **A** | Dijkstra Planning | Creates execution plan with task dependencies using graph algorithms |
| **B** | Graph Processor Execution | Parallel execution of tasks respecting dependencies |
| **C** | Self-Healing Evaluation | Detects failures, generates repair tasks, executes fix cycles |
| **D** | Final Synthesis | Aggregates results, generates comprehensive report |

### 12 Specialized Agents

Each agent is designed for specific task types:

| Agent | Polish Name | Role | Specialty |
|-------|-------------|------|-----------|
| **Dijkstra** | Dijkstra | Supreme Coordinator | Task routing, optimization, resource allocation |
| **Geralt** | Geralt | Lead Developer | Complex problem solving, debugging, refactoring |
| **Yennefer** | Yennefer | System Architect | System design, patterns, architecture decisions |
| **Triss** | Triss | Data Specialist | Data processing, analysis, transformations |
| **Vesemir** | Vesemir | Code Reviewer | Code quality, best practices, mentoring |
| **Jaskier** | Jaskier | Documentation Lead | Documentation, communication, user experience |
| **Ciri** | Ciri | Speed Demon | Fast operations, caching, performance optimization |
| **Eskel** | Eskel | Testing Expert | Test coverage, QA, edge case hunting |
| **Lambert** | Lambert | Security Specialist | Security, validation, vulnerability detection |
| **Zoltan** | Zoltan | DevOps Engineer | Infrastructure, deployment, CI/CD |
| **Regis** | Regis | Research Lead | Deep analysis, knowledge extraction, research |
| **Philippa** | Philippa | Strategy Lead | Planning, optimization, long-term strategy |

### Advanced Intelligence Features

- **Chain-of-Thought Reasoning** - Step-by-step reasoning for complex tasks
- **Tree-of-Thoughts** - Exploratory reasoning for critical problems
- **Semantic Caching** - Intelligent response caching
- **Knowledge Graph** - Learning from past executions
- **Adaptive Temperature** - Per-agent temperature profiles for optimal output

---

## Architecture

```
                           USER INPUT
                               |
                               v
                    +------------------+
                    |    PHASE A       |
                    | Dijkstra Planning|
                    | (Creates Plan)   |
                    +------------------+
                               |
                               v
                    +------------------+
                    |    PHASE B       |
                    | Graph Processor  |
                    | (Parallel Exec)  |
                    +------------------+
                               |
                               v
                    +------------------+
                    |    PHASE C       |
                    | Self-Healing     |
                    | (Error Recovery) |
                    +------------------+
                               |
                               v
                    +------------------+
                    |    PHASE D       |
                    | Final Synthesis  |
                    | (Report Gen)     |
                    +------------------+
                               |
                               v
                         FINAL REPORT
```

### Task Flow

1. **PRE-A**: User objective is translated (if needed) and classified by difficulty
2. **A**: Dijkstra agent creates an execution plan with tasks and dependencies
3. **B**: GraphProcessor executes tasks in parallel, respecting dependencies
4. **C**: Results are evaluated; failed tasks trigger repair cycles
5. **D**: Regis synthesizes all results into a final comprehensive report

---

## Installation

### Prerequisites

- **Node.js** v18.0.0 or higher
- **npm** or **pnpm**
- **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/)
- **Ollama** (optional, for local model execution)

### Setup

1. **Clone the repository:**

```bash
git clone https://github.com/your-repo/gemini-hydra.git
cd gemini-hydra
```

2. **Install dependencies:**

```bash
npm install
```

3. **Configure environment:**

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

4. **Build the project:**

```bash
npm run build
```

5. **Verify installation:**

```bash
npm start doctor
```

---

## Quick Start

### Interactive Mode

Start the interactive CLI:

```bash
# Using npm
npm start

# Or directly with the binary
node dist/bin/gemini.js
```

You will see the GeminiHydra banner and a prompt:

```
+===============================================================+
|      GEMINI HYDRA v14.0 - SCHOOL OF THE WOLF                  |
|   12 Agents | 5-Phase Protocol | Self-Healing | Full Node.js  |
+===============================================================+

[Dijkstra] >
```

### Execute a Task

Simply type your objective:

```
[Dijkstra] > Create a TypeScript function to validate email addresses
```

The system will:
1. Classify the task (simple/moderate/complex/critical)
2. Create an execution plan
3. Execute tasks with appropriate agents
4. Return a comprehensive report

### Direct Execution

Run a single task without entering interactive mode:

```bash
npm start "Analyze the architecture of this project"
```

---

## CLI Commands Reference

### Main Commands

| Command | Description |
|---------|-------------|
| `gemini` | Start interactive mode |
| `gemini "<objective>"` | Execute single objective |
| `gemini init` | Initialize project context |
| `gemini doctor` | Check system health |
| `gemini status` | Show token usage and cost |

### Interactive Mode Commands

| Command | Description |
|---------|-------------|
| `/help` | Show all available commands |
| `/history` | Show command history |
| `/clear` | Clear the screen |
| `/status` | Show session status and costs |
| `/cost` | Show token usage report |
| `/queue` | Show task queue |
| `/cancel <id>` | Cancel a queued task |
| `/mcp` | Show MCP status and tools |
| `@<agent>` | Switch to specific agent (e.g., `@geralt`) |
| `@serena` | Activate Serena code intelligence agent |
| `exit` / `quit` | Exit interactive mode |

### Agent Commands

| Command | Description |
|---------|-------------|
| `gemini agent <name> "<task>"` | Execute task with specific agent |
| `gemini a geralt "Fix this bug"` | Short form of agent command |

### Pipeline Mode

Chain multiple tasks:

```bash
gemini pipe "analyze code" "suggest improvements" "generate tests"
```

Or in interactive mode:

```
[Dijkstra] > analyze code | suggest improvements | generate tests
```

### Watch Mode

Monitor directory for changes:

```bash
gemini watch ./src --task "review and suggest improvements"
```

### Memory Commands

| Command | Description |
|---------|-------------|
| `gemini memory --list` | List all memories |
| `gemini memory --search "<query>"` | Search memories |
| `gemini memory --remember "<text>"` | Save a memory |
| `gemini memory --stats` | Show memory statistics |

### Session Commands

| Command | Description |
|---------|-------------|
| `gemini session --list` | List all sessions |
| `gemini session --resume [id]` | Resume a session |
| `gemini session --new "<name>"` | Start named session |
| `gemini session --export <file>` | Export session to file |

### MCP Commands

| Command | Description |
|---------|-------------|
| `gemini mcp --list` | List MCP servers and tools |
| `gemini mcp --status` | Show MCP connection status |
| `gemini mcp --add <name> --command "..."` | Add MCP server |
| `gemini mcp --remove <name>` | Remove MCP server |
| `gemini mcp --call <tool> --params {...}` | Call MCP tool |

### File Commands

| Command | Description |
|---------|-------------|
| `gemini file <path> --analyze` | Analyze file content |
| `gemini file <path> --extract` | Extract text from file |
| `gemini image <path>` | Analyze image with Gemini Vision |

### Debug Commands

| Command | Description |
|---------|-------------|
| `gemini debug [target]` | Start debug loop with screenshots |

---

## Agents

### Using Specific Agents

Switch to a specific agent in interactive mode:

```
[Dijkstra] > @geralt
Switched to Geralt

[Geralt] > fix the authentication bug in src/auth.ts
```

### Agent Specializations

- **@dijkstra** - Strategic planning and task orchestration
- **@geralt** - General development and debugging
- **@yennefer** - Architecture and design patterns
- **@triss** - Data analysis and transformations
- **@vesemir** - Code review and mentoring
- **@jaskier** - Documentation and communication
- **@ciri** - Fast operations and quick fixes
- **@eskel** - Testing and quality assurance
- **@lambert** - Security analysis and validation
- **@zoltan** - DevOps and infrastructure
- **@regis** - Research and deep analysis
- **@philippa** - API design and integration

### Serena Agent (Code Intelligence)

The `@serena` agent provides LSP-powered code intelligence:

```
[Dijkstra] > @serena status
[Dijkstra] > @serena find <symbol>
[Dijkstra] > @serena overview <file>
[Dijkstra] > @serena search <pattern>
```

---

## Gemini Models

GeminiHydra uses **only two Gemini models** for all operations:

### gemini-3-pro-preview

- **Usage**: Complex and critical tasks
- **Strengths**: Better reasoning, higher quality output
- **Cost**: Higher (1.25 USD / 1M input tokens, 5.0 USD / 1M output tokens)
- **Context Window**: 1,000,000 tokens

### gemini-3-flash-preview

- **Usage**: Fast tasks, simple operations (default)
- **Strengths**: Low latency, cost-effective
- **Cost**: Lower (0.075 USD / 1M input tokens, 0.30 USD / 1M output tokens)
- **Context Window**: 1,000,000 tokens

### Model Selection

The system automatically selects the appropriate model based on task classification:

| Task Difficulty | Model |
|-----------------|-------|
| Simple | `gemini-3-flash-preview` |
| Moderate | `gemini-3-flash-preview` |
| Complex | `gemini-3-pro-preview` |
| Critical | `gemini-3-pro-preview` |

---

## Configuration

### Environment Variables

```env
# Required
GEMINI_API_KEY=your_api_key

# Optional
OLLAMA_HOST=http://localhost:11434
```

### YOLO Configuration

The default YOLO configuration enables full autonomous execution:

```typescript
{
  autoApprove: true,
  fileSystemAccess: true,
  shellAccess: true,
  networkAccess: true,
  maxConcurrency: 8,
  timeout: 300000
}
```

### Phase Configuration

```typescript
{
  enablePhaseC: true,       // Self-Healing
  maxRepairCycles: 1,       // Number of repair attempts
  forceModel: 'auto'        // 'auto', 'flash', or 'pro'
}
```

---

## MCP Integration

GeminiHydra supports the Model Context Protocol for connecting to external tools.

### Adding an MCP Server

```bash
gemini mcp --add myserver --command "npx -y @server/mcp"
```

### Using MCP Tools

In interactive mode:

```
[Dijkstra] > /mcp
[Dijkstra] > mcp:desktop-commander__list_directory {"path": "./src"}
```

### Available MCP Integrations

- **desktop-commander** - File system operations
- **serena** - Code intelligence and LSP
- **playwright** - Browser automation
- **Claude-in-Chrome** - Browser interaction

---

## Development

### Build

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Testing

```bash
npm test
```

### Linting

```bash
npm run lint
```

---

## Project Structure

```
GeminiHydra/
|-- bin/
|   +-- gemini.ts          # CLI entry point
|-- src/
|   |-- cli/               # CLI commands and modes
|   |-- config/            # Configuration files
|   |-- core/              # Core execution engine
|   |   |-- Agent.ts       # Agent implementation
|   |   |-- Swarm.ts       # Main orchestration
|   |   |-- PhaseC.ts      # Self-Healing
|   |   +-- GraphProcessor.ts
|   |-- mcp/               # MCP integration
|   |-- memory/            # Memory systems
|   +-- types/             # TypeScript types
|-- config/                # Runtime configuration
|-- .env                   # Environment variables
+-- package.json
```

---

## License

MIT License

---

## Acknowledgments

- Inspired by The Witcher universe
- Powered by Google Gemini AI
- Built with Node.js and TypeScript

---

**School of the Wolf** - Where AI agents become Witchers.

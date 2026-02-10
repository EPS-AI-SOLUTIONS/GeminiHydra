# GeminiHydra 5-Phase Execution Pipeline

> A comprehensive guide to the intelligent task execution pipeline

## Overview

GeminiHydra implements a sophisticated 5-phase execution pipeline that transforms user requests into validated, high-quality outputs. The pipeline leverages a hybrid architecture combining Google Gemini cloud models with local Ollama models for optimal performance, cost-efficiency, and reliability.

```
+------------------+     +------------------+     +------------------+
|   PRE-A Phase    | --> |    A Phase       | --> |    B Phase       |
| Translation &    |     | Dijkstra         |     | Graph Processor  |
| Classification   |     | Planning         |     | Execution        |
+------------------+     +------------------+     +------------------+
                                                          |
                                                          v
                         +------------------+     +------------------+
                         |    D Phase       | <-- |    C Phase       |
                         | Final Synthesis  |     | Self-Healing     |
                         | & Report         |     | Evaluation       |
                         +------------------+     +------------------+
```

---

## Model Configuration

### Gemini Cloud Models (Primary)
| Model | Use Case |
|-------|----------|
| `gemini-3-pro-preview` | Complex reasoning, planning, evaluation |
| `gemini-3-flash-preview` | Fast processing, translation, synthesis |

### Ollama Local Models (Agent Execution)
| Model | Role |
|-------|------|
| Various configured models | Individual agent tasks during graph execution |

---

### Intelligence Layers

#### Chain-of-Thought (CoT)
```
User Query -> Break into logical steps -> Reason through each step -> Synthesize conclusion
```
- Linear reasoning for straightforward problems
- Step-by-step decomposition
- Maintains reasoning trace for transparency

#### Tree-of-Thoughts (ToT)
```
                    [Root Problem]
                    /      |      \
               [Path A] [Path B] [Path C]
               /    \      |      /    \
           [A1]  [A2]   [B1]   [C1]  [C2]
                          |
                    [Best Path]
```
- Explores multiple solution paths in parallel
- Evaluates and prunes branches
- Selects optimal reasoning path
- Used for ambiguous or complex queries

#### Query Decomposition
```
Complex Query -> [Sub-query 1] + [Sub-query 2] + [Sub-query 3] -> Merged Result
```
- Breaks compound questions into atomic parts
- Processes sub-queries independently
- Merges results with conflict resolution

---

## Phase A: Dijkstra Planning

**Primary Model:** `gemini-3-pro-preview`
**Fallback Model:** `gemini-3-flash-preview`

### Purpose
Creates an optimized execution plan using the Dijkstra Chain hierarchy, producing a SwarmPlan with prioritized tasks and agent assignments.

```
                    +-------------------+
                    |  Refined Query    |
                    +-------------------+
                            |
                            v
              +---------------------------+
              |     DIJKSTRA CHAIN        |
              +---------------------------+
              |                           |
              |  +---------------------+  |
              |  |   FLAGSHIP          |  |
              |  |   gemini-3-pro      |  |  <-- Primary Planner
              |  +---------------------+  |
              |            |              |
              |            v (fallback)   |
              |  +---------------------+  |
              |  |   FIRST OFFICER     |  |
              |  |   gemini-3-pro      |  |  <-- Secondary Planner
              |  +---------------------+  |
              |            |              |
              |            v (fallback)   |
              |  +---------------------+  |
              |  |   FAST SCOUT        |  |
              |  |   gemini-3-flash    |  |  <-- Quick Planning
              |  +---------------------+  |
              |            |              |
              |            v (fallback)   |
              |  +---------------------+  |
              |  |   LAST RESORT       |  |
              |  |   gemini-3-flash    |  |  <-- Minimal Planning
              |  +---------------------+  |
              |                           |
              +---------------------------+
                            |
                            v
                    +-------------------+
                    |    SwarmPlan      |
                    +-------------------+
```

### Dijkstra Chain Hierarchy

| Tier | Name | Model | Purpose |
|------|------|-------|---------|
| 1 | **Flagship** | `gemini-3-pro-preview` | Full strategic planning with optimization |
| 2 | **First Officer** | `gemini-3-pro-preview` | Robust planning with reduced complexity |
| 3 | **Fast Scout** | `gemini-3-flash-preview` | Quick planning for simpler tasks |
| 4 | **Last Resort** | `gemini-3-flash-preview` | Minimal viable planning under constraints |

### SwarmPlan Structure

```typescript
interface SwarmPlan {
  id: string;
  query: string;
  classification: TaskClassification;
  tasks: SwarmTask[];
  dependencies: DependencyGraph;
  estimatedDuration: number;
  resourceRequirements: ResourceSpec;
}

interface SwarmTask {
  id: string;
  agentType: AgentType;
  description: string;
  priority: number;
  dependencies: string[];
  tools: string[];
  expectedOutput: OutputSpec;
}
```

### Planning Strategies

1. **Decomposition** - Break complex tasks into manageable subtasks
2. **Parallelization** - Identify independent tasks for concurrent execution
3. **Sequencing** - Order dependent tasks correctly
4. **Resource Allocation** - Assign optimal agents and tools
5. **Contingency Planning** - Define fallback paths for failures

---

## Phase B: Graph Processor Execution

**Execution Engine:** Parallel task processor with `p-limit`
**Concurrency:** Maximum 12 concurrent tasks

### Purpose
Executes the SwarmPlan using a directed acyclic graph (DAG) processor, managing parallel execution, agent coordination, and MCP tool integration.

```
                         SwarmPlan
                             |
                             v
        +--------------------------------------------+
        |            GRAPH PROCESSOR                 |
        +--------------------------------------------+
        |                                            |
        |    +--------+  +--------+  +--------+     |
        |    | Task 1 |  | Task 2 |  | Task 3 |     |  <- Parallel Layer 1
        |    +--------+  +--------+  +--------+     |
        |         \          |          /           |
        |          \         |         /            |
        |           v        v        v             |
        |         +-------------------+             |
        |         |     Task 4        |             |  <- Dependent Task
        |         +-------------------+             |
        |                  |                        |
        |                  v                        |
        |    +--------+  +--------+  +--------+     |
        |    | Task 5 |  | Task 6 |  | Task 7 |     |  <- Parallel Layer 2
        |    +--------+  +--------+  +--------+     |
        |                                            |
        +--------------------------------------------+
                             |
                             v
                    Task Results Collection
```

### Execution Model

#### Parallel Execution with p-limit
```typescript
import pLimit from 'p-limit';

const limit = pLimit(12); // Max 12 concurrent tasks

const executeGraph = async (tasks: SwarmTask[]) => {
  const readyTasks = getReadyTasks(tasks);

  const promises = readyTasks.map(task =>
    limit(() => executeTask(task))
  );

  return Promise.all(promises);
};
```

### Agent Distribution

#### Ollama Local Models (Most Agents)
- **Cost:** Free (local execution)
- **Latency:** Low
- **Use Cases:** Standard agent tasks, code generation, analysis

#### Gemini Cloud (Special Agents)
| Agent | Model | Purpose |
|-------|-------|---------|
| **Dijkstra** | `gemini-3-pro-preview` | Strategic planning decisions |
| **Regis** | `gemini-3-flash-preview` | Report synthesis and formatting |
| **Serena** | `gemini-3-pro-preview` | Code analysis and refactoring |

### MCP Tools Integration

```
+------------------+     +------------------+     +------------------+
|  Agent Task      | --> |  MCP Router      | --> |  Tool Execution  |
+------------------+     +------------------+     +------------------+
                                  |
                                  v
              +---------------------------------------+
              |           MCP TOOL REGISTRY           |
              +---------------------------------------+
              |  - Desktop Commander (file ops)       |
              |  - Serena (code intelligence)         |
              |  - Playwright (browser automation)    |
              |  - Custom tools                       |
              +---------------------------------------+
```

### Task Execution Flow

1. **Dependency Resolution** - Verify all prerequisites met
2. **Agent Selection** - Choose appropriate agent for task
3. **Context Injection** - Provide relevant context and history
4. **Tool Binding** - Attach required MCP tools
5. **Execution** - Run task with timeout management
6. **Result Capture** - Collect output and metadata
7. **Status Update** - Update graph state

---

## Phase C: Self-Healing Evaluation

**Model:** `gemini-3-pro-preview`

### Purpose
Validates execution results, detects failures or quality issues, and initiates repair cycles to ensure output quality meets requirements.

```
                    Task Results
                         |
                         v
              +---------------------+
              |   EVALUATION        |
              |   gemini-3-pro      |
              +---------------------+
                         |
            +------------+------------+
            |                         |
            v                         v
      +-----------+            +-----------+
      |   PASS    |            |   FAIL    |
      +-----------+            +-----------+
            |                         |
            |                         v
            |               +-------------------+
            |               |   REPAIR CYCLE    |
            |               +-------------------+
            |               |  - Diagnose issue |
            |               |  - Generate fix   |
            |               |  - Re-execute     |
            |               |  - Re-evaluate    |
            |               +-------------------+
            |                         |
            |            +------------+
            |            |
            v            v
      +-------------------------+
      |   LESSONS LEARNED       |
      |   MEMORY UPDATE         |
      +-------------------------+
                    |
                    v
            Validated Results
```

### Evaluation Criteria

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Completeness | 25% | All required outputs produced |
| Correctness | 30% | Factual accuracy, no errors |
| Coherence | 20% | Logical consistency across outputs |
| Quality | 15% | Meets quality standards |
| Efficiency | 10% | Resource usage within bounds |

### Repair Cycle

```typescript
interface RepairCycle {
  maxAttempts: 3;
  strategies: [
    'retry-same-agent',
    'escalate-model',
    'decompose-further',
    'alternative-approach'
  ];
}
```

#### Repair Strategies

1. **Retry Same Agent** - Simple retry with adjusted parameters
2. **Escalate Model** - Use more capable model
3. **Decompose Further** - Break failed task into smaller pieces
4. **Alternative Approach** - Try completely different method

### Lessons Learned Memory

```typescript
interface LessonLearned {
  taskType: string;
  failureMode: string;
  rootCause: string;
  successfulFix: string;
  timestamp: Date;
  confidenceScore: number;
}
```

- **Captures** failure patterns and successful fixes
- **Indexes** for fast retrieval in future similar tasks
- **Decays** old lessons to prevent stale guidance
- **Influences** future planning decisions

---

## Phase D: Final Synthesis

**Model:** `gemini-3-flash-preview` (Regis Override)

### Purpose
Consolidates all validated results into a coherent final output, applying anti-hallucination validation and generating the final report.

```
              Validated Results
                     |
                     v
        +------------------------+
        |   REGIS SYNTHESIZER    |
        |   gemini-3-flash       |
        +------------------------+
                     |
                     v
        +------------------------+
        |  ANTI-HALLUCINATION    |
        |  VALIDATION            |
        +------------------------+
        |  - Fact verification   |
        |  - Source attribution  |
        |  - Confidence scoring  |
        |  - Uncertainty flagging|
        +------------------------+
                     |
                     v
        +------------------------+
        |  REPORT GENERATION     |
        +------------------------+
        |  - Structure output    |
        |  - Format for user     |
        |  - Include citations   |
        |  - Add metadata        |
        +------------------------+
                     |
                     v
              +-------------+
              | FINAL REPORT|
              +-------------+
```

### Regis Override

The Regis agent has special authority in Phase D:
- **Overrides** conflicting agent outputs
- **Resolves** ambiguities definitively
- **Ensures** consistent voice and format
- **Applies** final quality checks

### Anti-Hallucination Validation

```typescript
interface HallucinationCheck {
  factualClaims: Claim[];
  verificationResults: VerificationResult[];
  confidenceThreshold: 0.85;
  uncertaintyMarkers: string[];
}

interface Claim {
  statement: string;
  source: string | null;
  verifiable: boolean;
  confidence: number;
}
```

#### Validation Steps

1. **Extract Claims** - Identify factual statements
2. **Verify Sources** - Check against provided context
3. **Cross-Reference** - Compare with other agent outputs
4. **Score Confidence** - Assign reliability scores
5. **Flag Uncertainty** - Mark low-confidence claims
6. **Remove/Caveat** - Handle unverifiable claims

### Final Report Structure

```markdown
# Task Report

## Summary
[High-level overview of results]

## Detailed Findings
[Comprehensive results with citations]

## Confidence Assessment
[Reliability scores and uncertainty notes]

## Appendix
- Sources consulted
- Agent contributions
- Execution metrics
```

---

## Complete Pipeline Flow

```
USER INPUT
    |
    v
+------------------------------------------------------------------+
|                     PRE-A: TRANSLATION & CLASSIFICATION           |
|   [gemini-3-flash-preview]                                        |
|   - Language detection/translation                                |
|   - Task classification                                           |
|   - Intelligence layer selection (CoT/ToT/Decomposition)          |
+------------------------------------------------------------------+
    |
    v
+------------------------------------------------------------------+
|                     A: DIJKSTRA PLANNING                          |
|   [gemini-3-pro-preview -> gemini-3-flash-preview fallback]       |
|   - Flagship -> First Officer -> Fast Scout -> Last Resort        |
|   - SwarmPlan generation with tasks and dependencies              |
+------------------------------------------------------------------+
    |
    v
+------------------------------------------------------------------+
|                     B: GRAPH PROCESSOR EXECUTION                  |
|   [Ollama local + Gemini cloud for special agents]                |
|   - Parallel execution (p-limit: max 12 concurrent)               |
|   - MCP tools integration                                         |
|   - Agent task execution                                          |
+------------------------------------------------------------------+
    |
    v
+------------------------------------------------------------------+
|                     C: SELF-HEALING EVALUATION                    |
|   [gemini-3-pro-preview]                                          |
|   - Result validation                                             |
|   - Repair cycles (max 3 attempts)                                |
|   - Lessons learned memory update                                 |
+------------------------------------------------------------------+
    |
    v
+------------------------------------------------------------------+
|                     D: FINAL SYNTHESIS                            |
|   [gemini-3-flash-preview - Regis Override]                       |
|   - Anti-hallucination validation                                 |
|   - Report generation                                             |
|   - Final output formatting                                       |
+------------------------------------------------------------------+
    |
    v
FINAL OUTPUT
```

---

## Configuration Reference

### Environment Variables

```bash
# Gemini Configuration
GEMINI_API_KEY=your-api-key
GEMINI_PRO_MODEL=gemini-3-pro-preview
GEMINI_FLASH_MODEL=gemini-3-flash-preview

# Execution Configuration
MAX_CONCURRENT_TASKS=12
REPAIR_MAX_ATTEMPTS=3
CONFIDENCE_THRESHOLD=0.85

# Ollama Configuration
OLLAMA_HOST=http://localhost:11434
```

### Model Mapping

```typescript
const MODEL_CONFIG = {
  'pre-a': 'gemini-3-flash-preview',
  'phase-a': {
    primary: 'gemini-3-pro-preview',
    fallback: 'gemini-3-flash-preview'
  },
  'phase-b': {
    dijkstra: 'gemini-3-pro-preview',
    regis: 'gemini-3-flash-preview',
    serena: 'gemini-3-pro-preview',
    default: 'ollama-local'
  },
  'phase-c': 'gemini-3-pro-preview',
  'phase-d': 'gemini-3-flash-preview'
};
```

---

## Performance Characteristics

| Phase | Typical Duration | Model Cost | Parallelism |
|-------|-----------------|------------|-------------|
| PRE-A | 1-3 seconds | Low (Flash) | None |
| A | 3-10 seconds | Medium (Pro) | None |
| B | Variable | Mixed | Up to 12x |
| C | 2-8 seconds | Medium (Pro) | Per-task |
| D | 2-5 seconds | Low (Flash) | None |

---

## Error Handling

### Phase-Specific Recovery

| Phase | Error Type | Recovery Action |
|-------|-----------|-----------------|
| PRE-A | Translation failure | Fallback to English-only |
| A | Planning timeout | Cascade to Fast Scout |
| B | Task failure | Mark failed, continue others |
| C | Evaluation failure | Skip validation, flag output |
| D | Synthesis failure | Return raw results |

### Circuit Breaker Pattern

```typescript
const circuitBreaker = {
  failureThreshold: 5,
  recoveryTimeout: 30000,
  states: ['CLOSED', 'OPEN', 'HALF-OPEN']
};
```

---

## Related Documentation

- [Architecture Overview](./ARCHITECTURE.md)
- [Agent Configuration](./AGENTS.md)
- [MCP Tools Reference](./MCP_TOOLS.md)
- [Memory System](./MEMORY.md)

---

*Last Updated: February 2026*

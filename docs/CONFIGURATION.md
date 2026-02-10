# GeminiHydra Configuration Guide

This document describes all configuration options available in GeminiHydra.

## Table of Contents

- [Environment Variables](#environment-variables)
- [YOLO Configuration](#yolo-configuration)
- [Intelligence Configuration](#intelligence-configuration)
- [Model Pricing](#model-pricing)

---

## Environment Variables

Configure GeminiHydra using environment variables in your `.env` file or system environment:

```env
GEMINI_API_KEY=your-api-key
GEMINI_MODEL=gemini-3-flash-preview  # Default model
```

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GEMINI_API_KEY` | Your Google Gemini API key | Yes | - |
| `GEMINI_MODEL` | Default model to use for requests | No | `gemini-3-flash-preview` |

---

## YOLO Configuration

YOLO (You Only Live Once) mode enables high-performance parallel processing with configurable access controls.

```typescript
interface YoloConfig {
  yolo?: boolean;                    // High concurrency mode
  fileAccess?: boolean;              // Read/write files
  shellAccess?: boolean;             // Execute commands
  networkAccess?: boolean;           // API calls
  maxConcurrency?: number;           // Max 12
  enablePhaseC?: boolean;            // Self-healing
  maxRepairCycles?: number;          // Default: 1
  forceModel?: 'flash' | 'pro' | 'auto';
  enableIntelligenceLayer?: boolean;
  enableAdvancedReasoning?: boolean;
  forceOllama?: boolean;             // Force local models
  ollamaModel?: string;              // Default: llama3.2:3b
}
```

### Option Details

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `yolo` | `boolean` | `false` | Enables high concurrency mode for maximum throughput |
| `fileAccess` | `boolean` | `false` | Allows reading and writing files on the filesystem |
| `shellAccess` | `boolean` | `false` | Permits execution of shell commands |
| `networkAccess` | `boolean` | `false` | Enables external API calls and network requests |
| `maxConcurrency` | `number` | `4` | Maximum parallel operations (capped at 12) |
| `enablePhaseC` | `boolean` | `false` | Enables self-healing error recovery phase |
| `maxRepairCycles` | `number` | `1` | Maximum attempts for self-healing repairs |
| `forceModel` | `string` | `'auto'` | Force a specific model: `'flash'`, `'pro'`, or `'auto'` |
| `enableIntelligenceLayer` | `boolean` | `false` | Activates advanced intelligence features |
| `enableAdvancedReasoning` | `boolean` | `false` | Enables enhanced reasoning capabilities |
| `forceOllama` | `boolean` | `false` | Force use of local Ollama models instead of cloud |
| `ollamaModel` | `string` | `'llama3.2:3b'` | Specify which Ollama model to use |

### Example Usage

```typescript
const config: YoloConfig = {
  yolo: true,
  fileAccess: true,
  shellAccess: true,
  networkAccess: true,
  maxConcurrency: 8,
  enablePhaseC: true,
  maxRepairCycles: 3,
  forceModel: 'flash'
};
```

---

## Intelligence Configuration

Fine-tune the AI reasoning and processing capabilities with the intelligence configuration.

```typescript
interface IntelligenceConfig {
  useChainOfThought: boolean;
  useSelfReflection: boolean;
  useConfidenceScoring: boolean;
  useMultiPerspective: boolean;
  useSemanticCache: boolean;
  useKnowledgeGraph: boolean;
  useQueryDecomposition: boolean;
  useAnalogicalReasoning: boolean;
  useTreeOfThoughts: boolean;
  useMetaPrompting: boolean;
  useSemanticChunking: boolean;
  confidenceThreshold: number;  // Default: 70
}
```

### Option Details

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useChainOfThought` | `boolean` | `false` | Enables step-by-step reasoning for complex problems |
| `useSelfReflection` | `boolean` | `false` | Allows the model to evaluate and improve its own responses |
| `useConfidenceScoring` | `boolean` | `false` | Adds confidence scores to outputs |
| `useMultiPerspective` | `boolean` | `false` | Considers multiple viewpoints when generating responses |
| `useSemanticCache` | `boolean` | `false` | Caches semantically similar queries for faster responses |
| `useKnowledgeGraph` | `boolean` | `false` | Leverages knowledge graph for enhanced context |
| `useQueryDecomposition` | `boolean` | `false` | Breaks complex queries into smaller sub-queries |
| `useAnalogicalReasoning` | `boolean` | `false` | Uses analogies to solve novel problems |
| `useTreeOfThoughts` | `boolean` | `false` | Explores multiple reasoning paths simultaneously |
| `useMetaPrompting` | `boolean` | `false` | Enables meta-level prompt optimization |
| `useSemanticChunking` | `boolean` | `false` | Intelligently chunks large inputs for processing |
| `confidenceThreshold` | `number` | `70` | Minimum confidence score (0-100) for accepting responses |

### Example Usage

```typescript
const intelligenceConfig: IntelligenceConfig = {
  useChainOfThought: true,
  useSelfReflection: true,
  useConfidenceScoring: true,
  useMultiPerspective: false,
  useSemanticCache: true,
  useKnowledgeGraph: true,
  useQueryDecomposition: true,
  useAnalogicalReasoning: false,
  useTreeOfThoughts: false,
  useMetaPrompting: false,
  useSemanticChunking: true,
  confidenceThreshold: 70
};
```

---

## Model Pricing

GeminiHydra supports multiple models with different pricing tiers:

| Model | Input Cost | Output Cost | Best For |
|-------|------------|-------------|----------|
| `gemini-3-pro-preview` | $1.25 / 1M tokens | $5.00 / 1M tokens | Complex reasoning, detailed analysis |
| `gemini-3-flash-preview` | $0.075 / 1M tokens | $0.30 / 1M tokens | Fast responses, high volume tasks |
| Local models (Ollama) | **FREE** | **FREE** | Privacy-focused, offline usage |

### Cost Optimization Tips

1. **Use Flash for routine tasks**: The flash model is significantly cheaper and faster for most use cases
2. **Enable semantic caching**: Reduce duplicate API calls with `useSemanticCache: true`
3. **Use local models for development**: Set `forceOllama: true` during development to eliminate costs
4. **Set appropriate concurrency**: Higher concurrency increases throughput but may increase costs

### Choosing the Right Model

- **gemini-3-pro-preview**: Best for complex reasoning, multi-step analysis, and tasks requiring high accuracy
- **gemini-3-flash-preview**: Ideal for quick responses, simple queries, and cost-sensitive applications
- **Ollama (local)**: Perfect for offline usage, privacy requirements, or development/testing

---

## Quick Start Example

```typescript
import { GeminiHydra } from 'gemini-hydra';

const hydra = new GeminiHydra({
  // YOLO Configuration
  yolo: true,
  fileAccess: true,
  maxConcurrency: 6,
  forceModel: 'flash',

  // Intelligence Configuration
  intelligence: {
    useChainOfThought: true,
    useSemanticCache: true,
    confidenceThreshold: 75
  }
});
```

---

## See Also

- [README.md](../README.md) - Project overview and getting started
- [API Documentation](./API.md) - Full API reference
- [Examples](./examples/) - Usage examples and recipes

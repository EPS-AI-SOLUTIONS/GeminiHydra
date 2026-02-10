/**
 * Swarm - Type definitions and default configuration
 *
 * YoloConfig interface and DEFAULT_CONFIG constant.
 *
 * @module core/swarm/types
 */

import type { IntelligenceConfig } from '../intelligence/index.js';
import type { ExecutionEngineConfig } from '../execution/index.js';

// ============================================================================
// YOLO CONFIGURATION
// ============================================================================

/**
 * YOLO Configuration Interface
 */
export interface YoloConfig {
  yolo?: boolean;
  fileAccess?: boolean;
  shellAccess?: boolean;
  networkAccess?: boolean;
  maxConcurrency?: number;
  enablePhaseC?: boolean;
  maxRepairCycles?: number;
  forceModel?: 'flash' | 'pro' | 'auto';  // Override model selection
  enableIntelligenceLayer?: boolean;      // Enable advanced reasoning
  intelligenceConfig?: IntelligenceConfig; // Intelligence layer configuration
  enableExecutionEngine?: boolean;         // Enable advanced execution features
  executionEngineConfig?: ExecutionEngineConfig; // Execution engine configuration
  enableAdvancedReasoning?: boolean;      // NEW: Enable Tree-of-Thoughts, Meta-Prompting, etc.
  rootDir?: string;                       // CRITICAL: Project root directory for path validation
  // Phase B Ollama optimization
  forceOllama?: boolean;                  // Force all Phase B agents to use Ollama
  ollamaModel?: string;                   // Specific Ollama model for Phase B (default: llama3.2:3b)
  // Timeout/cancellation settings (Fix #12)
  taskTimeoutMs?: number;                 // Per-task timeout in ms (default: 5 minutes)
  totalTimeoutMs?: number;                // Total execution timeout in ms (default: 30 minutes)
  // Results storage limits (Fix #14)
  maxStoredResults?: number;              // Max results kept in memory (default: 500)
  resultTtlMs?: number;                   // TTL for stored results in ms (default: 1 hour)
}

export const DEFAULT_CONFIG: YoloConfig = {
  yolo: true,
  fileAccess: true,
  shellAccess: true,
  networkAccess: true,
  maxConcurrency: 12,     // High concurrency for parallel execution
  enablePhaseC: true,
  maxRepairCycles: 3,     // Self-healing repair cycles (3 attempts before giving up)
  forceModel: 'auto',
  enableIntelligenceLayer: true,  // Enable advanced reasoning by default
  enableAdvancedReasoning: true,  // NEW: Enable Tree-of-Thoughts, Meta-Prompting, Semantic Chunking
  // Phase B Ollama optimization - enables maximum parallel agent execution
  forceOllama: true,              // Force Ollama for all Phase B agents
  ollamaModel: 'qwen3:4b',         // Fast local model for parallel execution (Qwen3)
  // Timeout settings (Fix #12)
  taskTimeoutMs: 5 * 60 * 1000,   // 5 minutes per task
  totalTimeoutMs: 30 * 60 * 1000,  // 30 minutes total
  // Results storage limits (Fix #14)
  maxStoredResults: 500,           // Max 500 results in memory
  resultTtlMs: 60 * 60 * 1000,     // 1 hour TTL
  intelligenceConfig: {
    useChainOfThought: true,
    useSelfReflection: true,
    useConfidenceScoring: true,
    useMultiPerspective: true,    // Multi-perspective analysis for complex tasks
    useSemanticCache: true,
    useKnowledgeGraph: true,
    useQueryDecomposition: true,
    useAnalogicalReasoning: true,
    useTreeOfThoughts: false,     // Only for exploration problems (expensive)
    useMetaPrompting: true,       // Enabled - optimize prompts dynamically
    useSemanticChunking: true,    // Enabled - handle long contexts
    confidenceThreshold: 70
  },
  enableExecutionEngine: true,  // Enable advanced execution features by default
  executionEngineConfig: {
    enableAdaptiveRetry: true,
    enablePartialCompletion: true,
    enableParallelExecution: true,
    enableAutoDependencies: true,
    enableCheckpoints: true,
    enablePrioritization: true,
    enableResourceScheduling: true,
    enableGracefulDegradation: true,
    enableTemplating: true,
    enableProfiling: true
  }
};

/**
 * IntelligenceLayer - Advanced AI reasoning capabilities for GeminiHydra
 *
 * Implements:
 * 1. Chain-of-Thought reasoning
 * 2. Self-Reflection Loop (with Gemini Flash)
 * 3. Confidence Scoring
 * 4. Multi-Perspective Analysis
 * 5. Tree-of-Thoughts exploration
 * 6. Context Window Management
 * 7. Semantic Caching
 * 8. Query Decomposition
 * 9. Knowledge Graphs
 * 10. Analogical Reasoning
 * 11. Meta-Prompting
 * 12. Semantic Chunking
 */

import chalk from 'chalk';

export { type Analogy, findAnalogies } from './AnalogicalReasoning.js';
export { type ChainOfThoughtResult, chainOfThought } from './ChainOfThought.js';
export { type ConfidenceScore, scoreConfidence } from './ConfidenceScoring.js';
export { type ContextChunk, ContextWindowManager, contextManager } from './ContextManager.js';
export {
  type KnowledgeEdge,
  KnowledgeGraph,
  type KnowledgeNode,
  knowledgeGraph,
} from './KnowledgeGraph.js';
// MetaPrompting - Full implementation in intelligence/MetaPrompting.ts
export {
  type ABTestResult,
  AdvancedMetaPrompter,
  advancedMetaPrompter,
  type CompressionResult,
  classifyTaskType,
  type DomainOptimizationResult,
  type DomainType,
  type EvolutionConfig,
  executeWithMetaPrompt,
  // Legacy API functions
  generateMetaPrompt,
  getPromptTemplate,
  // Classes
  MetaPrompter,
  type MetaPromptingConfig,
  // Types - Legacy
  type MetaPromptResult,
  // Singleton instances
  metaPrompter,
  // Types - Main
  type PromptOptimization,
  type PromptTemplate,
  PromptTemplateLibrary,
  promptTemplateLibrary,
  quickABTest,
  quickCompress,
  quickEvolve,
  // Quick functions
  quickOptimize,
  type RecursiveOptimizationResult,
  type TaskType,
  type TemplateCategory,
} from './MetaPrompting.js';
export {
  type MultiPerspectiveResult,
  multiPerspectiveAnalysis,
  type Perspective,
} from './MultiPerspective.js';
export {
  buildHierarchyTree,
  clearDecompositionCache,
  type DecomposedQuery,
  decomposeQuery,
  decompositionCache,
  detectQueryType,
  getDecompositionCacheStats,
  type HierarchyNode,
  hierarchicalDecompose,
  type MergedGroup,
  mergeRelatedQueries,
  type QueryType,
  type QueryTypeInfo,
  robustJsonParse,
  type SubQuery,
  shouldDecompose,
  visualizeDependencyGraph,
} from './QueryDecomposition.js';
export {
  clearReflexionMemory,
  type EvaluationResult,
  getReflexionStats,
  type ReflectionResult,
  type ReflexionLesson,
  type ReflexionMemory,
  type ReflexionResult,
  reflexionLoop,
  reflexionMemory,
  selfReflect,
  type TrajectoryCheckpoint,
} from './SelfReflection.js';
// Re-export all modules
export { type CacheEntry, SemanticCache, semanticCache } from './SemanticCache.js';
export {
  addToContextWithChunking,
  type BoundaryType,
  type ChunkBoundary,
  type ChunkHierarchy,
  type ChunkingOptions,
  type ChunkingResult,
  type ChunkType,
  createCodeAwareChunks,
  createHierarchicalChunks,
  createSemanticChunks,
  detectLanguage,
  detectSemanticBoundaries,
  findRelevantChunks,
  getSemanticContext,
  type HierarchyLevel,
  mergeChunksWithOverlap,
  type ProgrammingLanguage,
  prioritizeChunks,
  reconstructText,
  type SemanticChunk,
  semanticChunk,
  summarizeChunks,
} from './SemanticChunking.js';
export {
  bfsTreeOfThoughts,
  mctsTreeOfThoughts,
  parallelTreeOfThoughts,
  quickTreeOfThoughts,
  type SearchStrategy,
  type ThoughtNode,
  type ToTOptions,
  type TreeOfThoughtsResult,
  treeOfThoughts,
} from './TreeOfThoughts.js';

import { findAnalogies } from './AnalogicalReasoning.js';
import { scoreConfidence } from './ConfidenceScoring.js';
import { contextManager } from './ContextManager.js';
import { knowledgeGraph } from './KnowledgeGraph.js';
import {
  advancedMetaPrompter,
  classifyTaskType,
  generateMetaPrompt,
  metaPrompter,
} from './MetaPrompting.js';
import { multiPerspectiveAnalysis } from './MultiPerspective.js';
import { selfReflect } from './SelfReflection.js';
// Import for internal use
import { semanticCache } from './SemanticCache.js';
import {
  addToContextWithChunking,
  createCodeAwareChunks,
  createSemanticChunks,
  findRelevantChunks,
  getSemanticContext,
  prioritizeChunks,
  semanticChunk,
} from './SemanticChunking.js';
import {
  bfsTreeOfThoughts,
  mctsTreeOfThoughts,
  parallelTreeOfThoughts,
  treeOfThoughts,
} from './TreeOfThoughts.js';

// =============================================================================
// UNIFIED INTELLIGENCE PIPELINE
// =============================================================================

export interface IntelligenceConfig {
  useChainOfThought?: boolean;
  useSelfReflection?: boolean;
  useConfidenceScoring?: boolean;
  useMultiPerspective?: boolean;
  useSemanticCache?: boolean;
  useKnowledgeGraph?: boolean;
  useQueryDecomposition?: boolean;
  useAnalogicalReasoning?: boolean;
  useTreeOfThoughts?: boolean; // NEW: Tree-of-Thoughts exploration
  useMetaPrompting?: boolean; // NEW: Dynamic prompt optimization
  useSemanticChunking?: boolean; // NEW: Intelligent text segmentation
  confidenceThreshold?: number;
}

const DEFAULT_INTELLIGENCE_CONFIG: IntelligenceConfig = {
  useChainOfThought: true,
  useSelfReflection: true,
  useConfidenceScoring: true,
  useMultiPerspective: false, // Expensive, use for critical tasks
  useSemanticCache: true,
  useKnowledgeGraph: true,
  useQueryDecomposition: true,
  useAnalogicalReasoning: true,
  useTreeOfThoughts: false, // Expensive, use for exploration problems
  useMetaPrompting: true, // Enabled by default for prompt optimization
  useSemanticChunking: true, // Enabled for long context handling
  confidenceThreshold: 70,
};

/**
 * Main intelligence pipeline - enhances any task with advanced reasoning
 */
export async function enhanceWithIntelligence(
  task: string,
  baseResponse: string,
  config: IntelligenceConfig = {},
): Promise<string> {
  const cfg = { ...DEFAULT_INTELLIGENCE_CONFIG, ...config };

  console.log(chalk.cyan('\n[INTELLIGENCE LAYER] ACTIVATED'));

  let enhancedResponse = baseResponse;

  // 1. Check semantic cache first
  if (cfg.useSemanticCache) {
    const cached = await semanticCache.get(task);
    if (cached) {
      return cached;
    }
  }

  // 2. Add knowledge graph context
  if (cfg.useKnowledgeGraph) {
    const knowledgeContext = knowledgeGraph.buildContext(task);
    if (knowledgeContext) {
      contextManager.add(knowledgeContext, 'system', 0.7);
    }
  }

  // 3. Find analogies
  if (cfg.useAnalogicalReasoning) {
    const analogies = await findAnalogies(task);
    if (analogies.length > 0) {
      const analogyContext = analogies
        .map((a) => `[Analogy] ${a.sourcePattern} -> ${a.suggestedApproach}`)
        .join('\n');
      contextManager.add(analogyContext, 'system', 0.6);
    }
  }

  // 4. Self-reflection loop
  if (cfg.useSelfReflection) {
    const reflection = await selfReflect(task, enhancedResponse);
    if (reflection.confidenceImprovement > 10) {
      enhancedResponse = reflection.improvedResponse;
    }
  }

  // 5. Confidence scoring
  if (cfg.useConfidenceScoring) {
    const confidence = await scoreConfidence(task, enhancedResponse);

    if (confidence.overall < (cfg.confidenceThreshold ?? 70) && confidence.needsClarification) {
      // Add clarification note
      enhancedResponse += `\n\n[CONFIDENCE] ${confidence.overall}%\n`;
      enhancedResponse += `Pytania do wyjasnienia:\n`;
      enhancedResponse += confidence.clarificationQuestions.map((q) => `* ${q}`).join('\n');
    }
  }

  // 6. Multi-perspective (only for critical tasks)
  if (cfg.useMultiPerspective) {
    const perspectives = await multiPerspectiveAnalysis(task);
    if (perspectives.disagreements.length > 0) {
      enhancedResponse += `\n\n[PERSPECTIVES]\n`;
      enhancedResponse += perspectives.perspectives
        .map((p) => `* ${p.viewpoint}: ${p.recommendation}`)
        .join('\n');
    }
  }

  // Store in cache and knowledge graph
  if (cfg.useSemanticCache) {
    await semanticCache.set(task, enhancedResponse);
  }

  if (cfg.useKnowledgeGraph) {
    knowledgeGraph.recordExecution(task, enhancedResponse, true);
  }

  console.log(chalk.cyan('[INTELLIGENCE LAYER] COMPLETE\n'));

  return enhancedResponse;
}

// Export default object with all functions and managers
export default {
  // Core functions
  enhanceWithIntelligence,

  // Managers (singleton instances)
  semanticCache,
  knowledgeGraph,
  contextManager,

  // Tree-of-Thoughts (all strategies)
  treeOfThoughts,
  mctsTreeOfThoughts,
  bfsTreeOfThoughts,
  parallelTreeOfThoughts,

  // MetaPrompting
  metaPrompter,
  advancedMetaPrompter,
  generateMetaPrompt,
  classifyTaskType,

  // Semantic Chunking (all functions)
  semanticChunk,
  createSemanticChunks,
  createCodeAwareChunks,
  findRelevantChunks,
  prioritizeChunks,
  addToContextWithChunking,
  getSemanticContext,
};

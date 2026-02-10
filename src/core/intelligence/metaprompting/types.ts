/**
 * MetaPrompting Types & Interfaces
 *
 * All type definitions, interfaces and default configurations
 * for the meta-prompting system.
 *
 * @module core/intelligence/metaprompting/types
 */

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Interface representing the result of prompt optimization
 */
export interface PromptOptimization {
  /** The original prompt before optimization */
  originalPrompt: string;
  /** The optimized version of the prompt */
  optimizedPrompt: string;
  /** List of improvements made to the prompt */
  improvements: string[];
  /** Expected quality gain (0.0 - 1.0 scale) */
  expectedGain: number;
}

/**
 * Meta-prompting configuration options
 */
export interface MetaPromptingConfig {
  /** Model to use for meta-prompting operations */
  model?: string;
  /** Temperature for generation (lower = more deterministic) */
  temperature?: number;
  /** Language for prompts and responses */
  language?: 'pl' | 'en';
  /** Maximum tokens for responses */
  maxTokens?: number;
}

/**
 * Prompt evolution configuration
 */
export interface EvolutionConfig {
  /** Population size for genetic algorithm */
  populationSize: number;
  /** Number of generations to evolve */
  generations: number;
  /** Mutation rate (0.0 - 1.0) */
  mutationRate: number;
  /** Selection pressure (higher = more selective) */
  selectionPressure: number;
  /** Crossover rate (0.0 - 1.0) */
  crossoverRate: number;
  /** Elitism count - number of best individuals to keep */
  elitismCount: number;
}

/**
 * A/B test result interface
 */
export interface ABTestResult {
  /** Variant A prompt */
  variantA: string;
  /** Variant B prompt */
  variantB: string;
  /** Score for variant A (0.0 - 1.0) */
  scoreA: number;
  /** Score for variant B (0.0 - 1.0) */
  scoreB: number;
  /** Winner: 'A', 'B', or 'tie' */
  winner: 'A' | 'B' | 'tie';
  /** Statistical confidence (0.0 - 1.0) */
  confidence: number;
  /** Detailed comparison analysis */
  analysis: string;
  /** Recommendations for improvement */
  recommendations: string[];
}

/**
 * Prompt compression result
 */
export interface CompressionResult {
  /** Original prompt */
  originalPrompt: string;
  /** Compressed prompt */
  compressedPrompt: string;
  /** Compression ratio (original / compressed) */
  compressionRatio: number;
  /** Estimated semantic preservation (0.0 - 1.0) */
  semanticPreservation: number;
  /** Elements removed during compression */
  removedElements: string[];
  /** Original token count estimate */
  originalTokens: number;
  /** Compressed token count estimate */
  compressedTokens: number;
}

/**
 * Domain-specific optimization result
 */
export interface DomainOptimizationResult {
  /** Domain name */
  domain: string;
  /** Original prompt */
  originalPrompt: string;
  /** Domain-optimized prompt */
  optimizedPrompt: string;
  /** Domain-specific enhancements applied */
  enhancements: string[];
  /** Domain vocabulary injected */
  vocabularyInjected: string[];
  /** Expected domain relevance score */
  domainRelevance: number;
}

/**
 * Prompt template interface
 */
export interface PromptTemplate {
  /** Unique template ID */
  id: string;
  /** Template name */
  name: string;
  /** Template category */
  category: TemplateCategory;
  /** Template description */
  description: string;
  /** Template string with {{placeholders}} */
  template: string;
  /** Required variables */
  requiredVars: string[];
  /** Optional variables with defaults */
  optionalVars: Record<string, string>;
  /** Tags for searchability */
  tags: string[];
  /** Usage examples */
  examples: Array<{ vars: Record<string, string>; result: string }>;
  /** Quality rating (0.0 - 1.0) */
  rating: number;
  /** Usage count */
  usageCount: number;
}

/**
 * Template categories
 */
export type TemplateCategory =
  | 'code_generation'
  | 'code_review'
  | 'debugging'
  | 'documentation'
  | 'architecture'
  | 'testing'
  | 'refactoring'
  | 'analysis'
  | 'creative'
  | 'planning'
  | 'data_processing'
  | 'custom';

/**
 * Individual in genetic algorithm population
 */
export interface PromptIndividual {
  /** Prompt content */
  prompt: string;
  /** Fitness score (0.0 - 1.0) */
  fitness: number;
  /** Generation number */
  generation: number;
  /** Parent IDs for lineage tracking */
  parents: string[];
  /** Unique ID */
  id: string;
  /** Mutations applied */
  mutations: string[];
}

/**
 * Recursive optimization result
 */
export interface RecursiveOptimizationResult {
  /** Original prompt */
  originalPrompt: string;
  /** Final optimized prompt */
  finalPrompt: string;
  /** All iterations */
  iterations: Array<{
    iteration: number;
    prompt: string;
    score: number;
    improvements: string[];
  }>;
  /** Total improvement score */
  totalImprovement: number;
  /** Convergence reached */
  converged: boolean;
  /** Number of iterations performed */
  iterationsPerformed: number;
}

/**
 * Domain types for domain-specific optimization
 */
export type DomainType =
  | 'web-development'
  | 'data-science'
  | 'devops'
  | 'security'
  | 'mobile'
  | 'database'
  | 'ai-ml'
  | 'general';

/**
 * Legacy MetaPromptResult interface
 */
export interface MetaPromptResult {
  originalTask: string;
  taskType: TaskType;
  optimizedPrompt: string;
  suggestedTechniques: string[];
  expectedOutputFormat: string;
  confidence: number;
}

/**
 * Legacy TaskType
 */
export type TaskType =
  | 'analysis'
  | 'creative'
  | 'coding'
  | 'research'
  | 'planning'
  | 'debugging'
  | 'explanation'
  | 'transformation'
  | 'evaluation'
  | 'unknown';

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

/**
 * Default configuration for MetaPrompter
 */
export const DEFAULT_CONFIG: MetaPromptingConfig = {
  model: undefined, // Will use selectModel dynamically
  temperature: 0.4,
  language: 'pl',
  maxTokens: 4096
};

/**
 * Default evolution configuration
 */
export const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
  populationSize: 8,
  generations: 5,
  mutationRate: 0.3,
  selectionPressure: 2.0,
  crossoverRate: 0.7,
  elitismCount: 2
};

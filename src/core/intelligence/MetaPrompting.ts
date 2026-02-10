/**
 * MetaPrompting - Advanced prompt optimization and generation system
 *
 * This file re-exports from the modular metaprompting/ subdirectory.
 * The implementation has been split into:
 * - metaprompting/types.ts       - All interfaces, types, and default configs
 * - metaprompting/templates.ts   - PromptTemplateLibrary with built-in templates
 * - metaprompting/MetaPrompter.ts - Base MetaPrompter class
 * - metaprompting/AdvancedMetaPrompter.ts - Advanced features (genetic algo, A/B, compression, domain, few-shot)
 * - metaprompting/legacy.ts      - Legacy API (classifyTaskType, generateMetaPrompt, etc.)
 * - metaprompting/index.ts       - Re-exports, singletons, and quick functions
 *
 * Import from here or from './metaprompting/index.js' directly.
 */

export {
  // Types - Optimization
  type PromptOptimization,
  type MetaPromptingConfig,
  type EvolutionConfig,
  type ABTestResult,
  type CompressionResult,
  type DomainOptimizationResult,
  type RecursiveOptimizationResult,

  // Types - Templates
  type PromptTemplate,
  type TemplateCategory,

  // Types - Domain
  type DomainType,

  // Types - Legacy API
  type MetaPromptResult,
  type TaskType,

  // Types - Internal (exported for advanced usage)
  type PromptIndividual,

  // Default configs
  DEFAULT_CONFIG,
  DEFAULT_EVOLUTION_CONFIG,

  // Classes
  MetaPrompter,
  AdvancedMetaPrompter,
  PromptTemplateLibrary,

  // Singleton instances
  metaPrompter,
  advancedMetaPrompter,
  promptTemplateLibrary,

  // Quick functions
  quickOptimize,
  quickEvolve,
  quickCompress,
  quickABTest,

  // Legacy API functions
  generateMetaPrompt,
  executeWithMetaPrompt,
  classifyTaskType,
  getPromptTemplate
} from './metaprompting/index.js';

// Default export
export { default } from './metaprompting/index.js';

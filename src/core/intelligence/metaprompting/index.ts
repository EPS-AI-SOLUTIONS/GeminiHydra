/**
 * MetaPrompting - Advanced prompt optimization and generation system
 *
 * Re-exports all modules, singleton instances, and quick functions.
 *
 * @module core/intelligence/metaprompting
 */

// ── Types ──
export type {
  PromptOptimization,
  MetaPromptingConfig,
  EvolutionConfig,
  ABTestResult,
  CompressionResult,
  DomainOptimizationResult,
  PromptTemplate,
  TemplateCategory,
  PromptIndividual,
  RecursiveOptimizationResult,
  DomainType,
  MetaPromptResult,
  TaskType,
} from './types.js';

export { DEFAULT_CONFIG, DEFAULT_EVOLUTION_CONFIG } from './types.js';

// ── Classes ──
export { PromptTemplateLibrary } from './templates.js';
export { MetaPrompter } from './MetaPrompter.js';
export { AdvancedMetaPrompter } from './AdvancedMetaPrompter.js';

// ── Legacy API ──
export {
  classifyTaskType,
  generateMetaPrompt,
  executeWithMetaPrompt,
  getPromptTemplate,
} from './legacy.js';

// ============================================================================
// SINGLETON INSTANCES
// ============================================================================

import { MetaPrompter } from './MetaPrompter.js';
import { AdvancedMetaPrompter } from './AdvancedMetaPrompter.js';
import { PromptTemplateLibrary } from './templates.js';

/**
 * Singleton instance of MetaPrompter (basic)
 * Pre-configured for Polish language as default
 */
export const metaPrompter = new MetaPrompter({
  language: 'pl',
  temperature: 0.4
});

/**
 * Singleton instance of AdvancedMetaPrompter
 * Pre-configured with all advanced features
 */
export const advancedMetaPrompter = new AdvancedMetaPrompter(
  {
    language: 'pl',
    temperature: 0.4
  },
  {
    populationSize: 8,
    generations: 5,
    mutationRate: 0.3
  }
);

/**
 * Singleton instance of PromptTemplateLibrary
 */
export const promptTemplateLibrary = new PromptTemplateLibrary();

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Quick optimization - single call to optimize a prompt
 */
export async function quickOptimize(prompt: string, context: string = ''): Promise<string> {
  const result = await metaPrompter.optimizePrompt(prompt, context);
  return result.optimizedPrompt;
}

/**
 * Quick evolution - evolve a prompt with default settings
 */
export async function quickEvolve(prompt: string, context: string = ''): Promise<string> {
  const result = await advancedMetaPrompter.evolvePrompt(prompt, context, {
    populationSize: 4,
    generations: 3
  });
  return result.bestPrompt;
}

/**
 * Quick compression - compress a prompt with default settings
 */
export async function quickCompress(prompt: string): Promise<string> {
  const result = await advancedMetaPrompter.compressPrompt(prompt);
  return result.compressedPrompt;
}

/**
 * Quick A/B test - compare two prompts
 */
export async function quickABTest(
  variantA: string,
  variantB: string,
  context: string = ''
): Promise<'A' | 'B' | 'tie'> {
  const result = await advancedMetaPrompter.abTestPrompts(variantA, variantB, context);
  return result.winner;
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

import {
  classifyTaskType as _classifyTaskType,
  generateMetaPrompt as _generateMetaPrompt,
  executeWithMetaPrompt as _executeWithMetaPrompt,
  getPromptTemplate as _getPromptTemplate,
} from './legacy.js';

export default {
  // Classes
  MetaPrompter,
  AdvancedMetaPrompter,
  PromptTemplateLibrary,

  // Instances
  metaPrompter,
  advancedMetaPrompter,
  promptTemplateLibrary,

  // Quick functions
  quickOptimize,
  quickEvolve,
  quickCompress,
  quickABTest,

  // Legacy API
  generateMetaPrompt: _generateMetaPrompt,
  executeWithMetaPrompt: _executeWithMetaPrompt,
  classifyTaskType: _classifyTaskType,
  getPromptTemplate: _getPromptTemplate,
};

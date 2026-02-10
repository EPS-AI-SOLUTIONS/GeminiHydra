/**
 * FewShot Module - Re-exports for few-shot examples system
 *
 * @module fewshot
 */

// Types
export type {
  FewShotExample,
  AgentExample,
  ExampleUsageStats,
  FewShotExampleCollection,
  AgentExampleCollection,
} from './types.js';

// Data
export { EXTENDED_FEW_SHOT_EXAMPLES } from './extended-examples.js';
export { AGENT_SPECIFIC_EXAMPLES } from './agent-examples.js';

// Selection & scoring
export {
  selectBestExamples,
  getAgentSpecificExamples,
  recordExampleUsage,
  scoreExampleEffectiveness,
  getTopEffectiveExamples,
  detectExampleCategory,
  getBestFewShotExamples,
} from './selection.js';

// Default export (backward compatibility)
import { EXTENDED_FEW_SHOT_EXAMPLES } from './extended-examples.js';
import { AGENT_SPECIFIC_EXAMPLES } from './agent-examples.js';
import {
  selectBestExamples,
  getAgentSpecificExamples,
  recordExampleUsage,
  scoreExampleEffectiveness,
  getTopEffectiveExamples,
  detectExampleCategory,
  getBestFewShotExamples,
} from './selection.js';

export default {
  EXTENDED_FEW_SHOT_EXAMPLES,
  AGENT_SPECIFIC_EXAMPLES,
  selectBestExamples,
  getAgentSpecificExamples,
  recordExampleUsage,
  scoreExampleEffectiveness,
  getTopEffectiveExamples,
  detectExampleCategory,
  getBestFewShotExamples
};

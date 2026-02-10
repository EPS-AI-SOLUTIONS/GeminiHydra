/**
 * Agent - Module index
 *
 * Re-exports all agent components.
 *
 * Original Agent.ts (1870 lines) has been split into:
 * - types.ts       - Type definitions (TaskType, TaskComplexity, interfaces)
 * - temperature.ts - TemperatureController, profiles, adaptive temp functions
 * - models.ts      - GenAI, model tiers, Dijkstra chain, personas, classification
 * - Agent.ts       - Agent class
 *
 * @module core/agent/index
 */

// Agent class
export { Agent } from './Agent.js';
// Models, classification, personas
export {
  AGENT_PERSONAS,
  classifyTaskComplexity,
  DIJKSTRA_CHAIN,
  genAI,
  initializeGeminiModels,
  MODEL_TIERS,
  selectModelForComplexity,
} from './models.js';
// Temperature system
export {
  DEFAULT_AGENT_PROFILES,
  detectTaskType,
  getAdaptiveTemperature,
  getEnhancedAdaptiveTemperature,
  getTemperatureController,
  initializeTemperatureController,
  TemperatureController,
} from './temperature.js';
// Types
export type {
  AdaptiveTemperatureConfig,
  AgentTemperatureProfile,
  TaskComplexity,
  TaskType,
  TemperatureContext,
  TemperaturePerformanceRecord,
  ThinkOptions,
} from './types.js';
// Validation utilities
export {
  type CodeBlockValidation,
  type ConfidenceResult,
  calculateConfidenceScore,
  estimateResponseQuality,
  validateCodeBlocks,
} from './validation.js';

/**
 * GeminiHydra - Constants
 * Centralized configuration values
 */

// Display truncation lengths
export const OBJECTIVE_TRUNCATION = 80;
export const TASK_TRUNCATION = 50;
export const TASK_DISPLAY_TRUNCATION = 60;
export const CONTEXT_TRUNCATION = 500;
export const RESULT_PREVIEW_LENGTH = 1500;

// Synthesis thresholds
export const MIN_SINGLE_RESULT_LENGTH = 200;
export const MAX_TASKS = 3;

// Timeouts (ms)
export const DEFAULT_TIMEOUT = 60000;

// Model configuration
export const DEFAULT_MODEL = 'gemini-2.0-flash';

// Pipeline models
export const PIPELINE_MODELS = {
  PHASE_A: 'gemini-3-pro-preview',    // Dijkstra Planning
  PHASE_BA: 'gemini-3-flash-preview', // Translation & Refinement
  PHASE_B: 'llama-3.2-3b',            // Local execution (llama-cpp-python)
  PHASE_C: 'gemini-3-flash-preview',  // Self-Healing
  PHASE_D: 'gemini-3-flash-preview',  // Synthesis
} as const;

// Phase names for display
export const PHASES = {
  'A': 'Phase A: Dijkstra Planning',
  'B-A': 'Phase B-A: Translation & Refinement',
  'B': 'Phase B: Graph Processor Execution',
  'C': 'Phase C: Self-Healing',
  'D': 'Phase D: Final Synthesis',
  // Backwards compatibility
  PLANNING: 'Phase A',
  EXECUTION: 'Phase B',
  SYNTHESIS: 'Phase D',
} as const;

// Self-healing limits
export const MAX_HEALING_CYCLES = 3;
export const MAX_RETRIES_PER_TASK = 3;

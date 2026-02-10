/**
 * Agent - Type definitions and interfaces
 *
 * Adaptive temperature system types, task types, and complexity levels.
 *
 * @module core/agent/types
 */

// ============================================================================
// TASK TYPES AND COMPLEXITY
// ============================================================================

/** Task types for adaptive temperature */
export type TaskType = 'code' | 'fix' | 'analysis' | 'creative' | 'planning' | 'general';

/** Task complexity levels */
export type TaskComplexity = 'trivial' | 'simple' | 'medium' | 'complex' | 'critical';

// ============================================================================
// ADAPTIVE TEMPERATURE SYSTEM INTERFACES
// ============================================================================

/**
 * Configuration for adaptive temperature system
 */
export interface AdaptiveTemperatureConfig {
  // Per-agent temperature profiles
  agentProfiles: Record<string, AgentTemperatureProfile>;

  // Global settings
  enableDynamicAdjustment: boolean;
  enableAnnealing: boolean;
  enableContextAwareness: boolean;
  enableUncertaintyBoost: boolean;
  enableLearning: boolean;

  // Annealing settings
  annealingRate: number;           // How fast temperature decreases (0.01 - 0.1)
  annealingMinTemp: number;        // Minimum temperature floor (0.05 - 0.2)

  // Uncertainty settings
  uncertaintyBoostFactor: number;  // How much to boost temp when uncertain (1.1 - 1.5)
  uncertaintyThreshold: number;    // Confidence threshold below which to boost (0.0 - 1.0)

  // Learning settings
  learningRate: number;            // How fast to adjust from results (0.01 - 0.2)
  historySize: number;             // Number of past results to consider
}

/**
 * Per-agent temperature profile
 */
export interface AgentTemperatureProfile {
  name: string;
  role: string;

  // Base temperature ranges per task type
  baseRanges: Record<TaskType, [number, number]>;

  // Agent-specific modifiers
  creativityBias: number;          // -0.2 to +0.2 - adjust for creative agents
  precisionBias: number;           // -0.2 to +0.2 - adjust for precise agents

  // Preferred temperature for this agent's primary function
  preferredTemp: number;

  // Historical performance
  performanceHistory: TemperaturePerformanceRecord[];
}

/**
 * Record of temperature vs performance for learning
 */
export interface TemperaturePerformanceRecord {
  timestamp: number;
  temperature: number;
  taskType: TaskType;
  qualityScore: number;           // 0.0 - 1.0
  responseTime: number;           // milliseconds
  wasSuccessful: boolean;
}

/**
 * Context for current generation session
 */
export interface TemperatureContext {
  agentName: string;
  taskType: TaskType;
  task: string;

  // Progress tracking for annealing
  generationProgress: number;     // 0.0 - 1.0
  currentStep: number;
  totalSteps: number;

  // Previous results for context awareness
  previousResults: Array<{
    temperature: number;
    quality: number;
    wasSuccessful: boolean;
  }>;

  // Uncertainty indicators
  confidenceLevel: number;        // 0.0 - 1.0
  retryCount: number;
  errorCount: number;
}

/**
 * Options for Agent.think() method
 */
export interface ThinkOptions {
  /** Timeout in milliseconds (default: 60000 = 60s) */
  timeout?: number;
  /** AbortSignal for external cancellation */
  signal?: AbortSignal;
}

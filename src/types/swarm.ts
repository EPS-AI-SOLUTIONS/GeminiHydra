/**
 * GeminiHydra - Swarm Types
 * Type definitions for the Witcher Swarm system
 */

/**
 * Model tiers for 3-level hierarchy
 */
export type ModelTier = 'commander' | 'coordinator' | 'executor';

/**
 * Agent roles (12 Witcher agents)
 */
export type AgentRole =
  | 'geralt' | 'yennefer' | 'triss' | 'jaskier'
  | 'vesemir' | 'ciri' | 'eskel' | 'lambert'
  | 'zoltan' | 'regis' | 'dijkstra' | 'philippa';

/**
 * Agent specification
 */
export interface AgentSpec {
  persona: string;
  focus: string;
  skills: string[];
  tier: ModelTier;
}

/**
 * Agent invocation result
 */
export interface AgentResult {
  success: boolean;
  agent: AgentRole;
  model: string;
  response?: string;
  error?: string;
  duration: number;
  tokens?: number;
  taskId?: number;
}

/**
 * Task priority
 */
export type TaskPriority = 'high' | 'medium' | 'low';

/**
 * Task status
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Swarm task
 */
export interface SwarmTask {
  id: number;
  agent: AgentRole | string;
  task: string;
  dependencies: number[];
  status: TaskStatus;
  priority?: TaskPriority;
  context?: string;
  difficulty?: import('./provider.js').TaskDifficulty;
  retryCount?: number;
}

/**
 * Complexity level
 */
export type ComplexityLevel = 'Simple' | 'Moderate' | 'Complex' | 'Advanced';

/**
 * Swarm plan
 */
export interface SwarmPlan {
  objective: string;
  complexity?: ComplexityLevel;
  tasks: SwarmTask[];
  parallelGroups?: number[][];
  estimatedTime?: string;
  refinement?: import('./provider.js').RefinementResult;
}

/**
 * Swarm transcript step
 */
export interface TranscriptStep {
  success: boolean;
  response?: string;
  error?: string;
  duration?: number;
  agent?: AgentRole;
}

/**
 * Swarm transcript
 */
export interface SwarmTranscript {
  sessionId: string;
  query: string;
  mode: string;
  startTime: string;
  steps: {
    speculate?: TranscriptStep;
    plan?: { result: TranscriptStep; parsedPlan?: SwarmPlan };
    execute?: AgentResult[];
    synthesize?: TranscriptStep;
    log?: TranscriptStep;
  };
}

/**
 * Swarm execution result
 */
export interface SwarmResult {
  success: boolean;
  sessionId: string;
  query: string;
  finalAnswer: string;
  summary: string;
  duration: number;
  archiveFile?: string;
  transcript: SwarmTranscript;
}

/**
 * Swarm options
 */
export interface SwarmOptions {
  yoloMode?: boolean;
  skipResearch?: boolean;
  verbose?: boolean;
  maxConcurrency?: number;
  timeoutSeconds?: number;
}

/**
 * Swarm mode settings
 */
export interface SwarmModeSettings {
  maxConcurrency: number;
  safetyBlocking: boolean;
  retryAttempts: number;
  timeoutSeconds: number;
}

/**
 * Prompt classification result
 */
export interface ClassificationResult {
  prompt: string;
  agent: AgentRole;
  model: string;
  tier: ModelTier;
  confidence: number;
}

/**
 * Complexity analysis result
 */
export interface ComplexityAnalysis {
  score: number;
  level: ComplexityLevel;
  wordCount: number;
  hasCode: boolean;
  hasMultipleTasks: boolean;
  technicalTerms: number;
  recommendedAgent: AgentRole;
}

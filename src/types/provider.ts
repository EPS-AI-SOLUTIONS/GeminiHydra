/**
 * GeminiHydra - Provider Types
 * Type definitions for AI providers
 */

// ============================================
// Chat Completion Types (OpenAI-compatible)
// ============================================

/**
 * Chat message structure
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Chat completion request
 */
export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string[];
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

/**
 * Chat completion response
 */
export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: TokenUsage;
}

/**
 * Chat completion choice
 */
export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: 'stop' | 'length' | 'tool_calls' | null;
}

/**
 * Chat completion chunk (streaming)
 */
export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
}

/**
 * Chat completion chunk choice
 */
export interface ChatCompletionChunkChoice {
  index: number;
  delta: Partial<ChatMessage>;
  finish_reason: 'stop' | 'length' | null;
}

// ============================================
// LLM Provider Interface
// ============================================

/**
 * Core LLM Provider interface
 * All providers must implement this interface
 */
export interface LLMProvider {
  name: string;
  model: string;
  createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;
  createChatCompletionStream?(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk>;
  isAvailable(): boolean;
}

/**
 * Extended LLM Provider with additional capabilities
 */
export interface ExtendedLLMProvider extends LLMProvider {
  /** Generate structured JSON output with schema validation */
  generateJson?<T>(prompt: string, schema: object): Promise<T>;
  /** Analyze text (sentiment, summary, keywords, etc.) */
  analyzeText?(text: string, task: string, options?: Record<string, unknown>): Promise<unknown>;
  /** Generate or analyze code */
  analyzeCode?(task: string, codeOrDescription: string, language?: string): Promise<string>;
  /** Check provider health */
  healthCheck?(): Promise<boolean>;
}

// ============================================
// Provider Result Types
// ============================================

/**
 * Result from a provider generation request
 */
export interface ProviderResult {
  content: string;
  model: string;
  success: boolean;
  duration_ms?: number;
  tokens?: number;
  error?: string;
  usage?: TokenUsage;
  finishReason?: string;
}

/**
 * Token usage information
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Result from a provider health check
 */
export interface HealthCheckResult {
  healthy: boolean;
  available: boolean;
  latency?: number;
  latency_ms?: number;
  timestamp?: Date;
  checkedAt?: Date | string;
  version?: string;
  models?: string[];
  error?: string;
}

/**
 * Options for provider generation requests
 */
export interface ProviderOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  stream?: boolean;
  systemPrompt?: string;
  stopSequences?: string[];
}

/**
 * Provider statistics
 */
export interface ProviderStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalLatency: number;
  totalDuration?: number;
  averageLatency: number;
  successRate?: number;
  lastRequest?: Date;
  lastError?: string;
  lastErrors?: Array<{ message: string; timestamp: string }>;
}

/**
 * Base provider configuration
 * Note: Specific providers may extend this with different models structure
 */
export interface ProviderConfig {
  name?: string;
  type?: 'gemini' | 'local' | 'openai' | 'mcp-llama';
  model?: string;
  models?: string[] | Record<string, string>;
  defaultModel?: string;
  apiKey?: string;
  baseUrl?: string;
  modelPath?: string;
  contextSize?: number;
  gpuLayers?: number;
  costPerToken?: number;
  maxRetries?: number;
  timeout?: number;
  pool?: PoolConfig;
  rateLimit?: RateLimitConfig;
  circuitBreaker?: CircuitBreakerConfig;
}

/**
 * Connection pool configuration
 */
export interface PoolConfig {
  maxConcurrent?: number;
  maxQueueSize?: number;
  acquireTimeout?: number;
  idleTimeout?: number;
  fifo?: boolean;
}

// Note: PoolStatus is exported from core/pool.ts

/**
 * Rate limiter configuration
 */
export interface RateLimitConfig {
  enabled?: boolean;
  tokensPerInterval?: number;
  interval?: number;
  maxBurst?: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  ttl?: number;
  defaultTTL?: number;
  maxSize?: number;
  evictionPolicy?: 'lru' | 'lfu' | 'fifo';
  staleWhileRevalidate?: boolean;
}

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccessedAt: number;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  jitter?: boolean;
  retryableErrors?: string[];
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  halfOpenMaxCalls?: number;
}

// Note: CircuitState and CircuitBreakerStatus are exported from core/retry.ts

// ============================================
// Pipeline & Task Types
// ============================================

/**
 * Task difficulty level
 */
export type TaskDifficulty = 'simple' | 'moderate' | 'complex';

/**
 * Pipeline phase
 */
export type PipelinePhase = 'A' | 'B-A' | 'B' | 'C' | 'D';

/**
 * Refinement result from Phase B-A
 */
export interface RefinementResult {
  originalObjective: string;
  translatedObjective: string;
  language: string;
  difficulty: TaskDifficulty;
  recommendedModel: string;
  context?: string;
}

/**
 * Repair task for healing phase
 */
export interface RepairTask {
  failedTaskId: number;
  reason: string;
  repairStrategy: string;
  repairPrompt: string;
}

/**
 * Healing evaluation result
 */
export interface HealingEvaluation {
  success: boolean;
  failedTasks: number[];
  repairTasks: RepairTask[];
  maxRetriesReached: boolean;
}

/**
 * Execution result from task execution
 */
export interface ExecutionResult {
  id: number;
  agent: string;
  success: boolean;
  content: string;
  error?: string;
  duration?: number;
  tokens?: TokenUsage;
  repairAttempt?: number;
}

/**
 * Pipeline result
 */
export interface PipelineResult {
  objective: string;
  refinement?: RefinementResult;
  plan: import('./swarm.js').SwarmPlan;
  executionResults: ExecutionResult[];
  healingAttempts: number;
  finalReport: string;
  totalDuration: number;
  phaseTimings: Record<PipelinePhase, number>;
}

// ============================================
// MCP Llama Provider Types
// ============================================

/**
 * MCP Model identifier
 */
export type McpModelId = 'main' | 'functionary' | 'vision' | 'draft';

/**
 * MCP Llama provider configuration
 */
export interface McpLlamaConfig {
  /** Default model to use */
  defaultModel?: McpModelId;
  /** Temperature for generation (0-1) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Use fast generation (speculative decoding) */
  useFastGeneration?: boolean;
}

/**
 * MCP Model info
 */
export interface McpModelInfo {
  id: McpModelId;
  name: string;
  size: string;
  capabilities: string[];
}

// ============================================
// Configuration Types
// ============================================

/**
 * Log level
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

/**
 * Agent persona
 */
export interface AgentPersona {
  name: string;
  role: string;
  description?: string;
  systemPrompt?: string;
}

/**
 * Pipeline models configuration
 */
export interface PipelineModels {
  phaseA: string;
  phaseBA: string;
  phaseB: string;
  phaseC: string;
  phaseD: string;
}

/**
 * Local LLM model configuration
 */
export interface LocalModelConfig {
  name: string;
  difficulty: TaskDifficulty[];
  contextSize: number;
  description: string;
}

/**
 * Local LLM configuration
 */
export interface LocalLLMConfig {
  baseUrl: string;
  models: LocalModelConfig[];
  defaultModel: string;
}

/**
 * Swarm configuration
 */
export interface SwarmConfig {
  maxTasks: number;
  timeout: number;
  maxRetries: number;
  maxHealingCycles: number;
  parallelExecution: boolean;
}

/**
 * Path configuration
 */
export interface PathConfig {
  projectRoot: string;
  trustedFolders: string[];
  ignorePatterns: string[];
}

/**
 * Feature flags
 */
export interface FeatureFlags {
  streaming: boolean;
  headless: boolean;
  verbose: boolean;
  sandbox: boolean;
  selfHealing: boolean;
  translation: boolean;
}

/**
 * Full Hydra configuration
 */
export interface HydraConfig {
  provider: ProviderConfig;
  models: PipelineModels;
  localLLM: LocalLLMConfig;
  swarm: SwarmConfig;
  paths: PathConfig;
  features: FeatureFlags;
}

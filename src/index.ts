/**
 * GeminiHydra v14.0 - Main Module Index (Refactored)
 *
 * Comprehensive exports for all 63 implemented features
 * Modular architecture with separate concerns
 */

// ============================================================
// Configuration (NEW - Centralized Config)
// ============================================================

export {
  // Model configs
  GEMINI_MODELS,
  LLAMA_MODELS,
  OLLAMA_MODELS,  // Alias for LLAMA_MODELS
  DEFAULT_MODEL,
  FAST_MODEL,
  QUALITY_MODEL,
  LOCAL_MODEL,
  CODING_MODEL,
  MODEL_PRICING,
  MODEL_CAPABILITIES,
  calculateCost,
  getModelCapabilities,
  isLocalModel,
  isGeminiModel,
  isLlamaModel,
  type LlamaModel,
  type OllamaModel,  // Alias for LlamaModel

  // Agent configs
  AGENT_ROLES,
  AGENT_DESCRIPTIONS,
  AGENT_COLORS,
  TASK_ROUTING,
  getAgentDescription,
  getAgentColor,
  getAgentForTask,
  getAllAgentRoles,

  // Limits (grouped objects)
  RETRY_LIMITS,
  TIMEOUT_LIMITS,
  TOKEN_LIMITS,
  CONCURRENCY_LIMITS,
  CACHE_LIMITS,
  MEMORY_LIMITS,
  FILE_LIMITS,
  QUEUE_LIMITS,
  // Limits (individual constants)
  MAX_RETRIES,
  MAX_CRITICAL_RETRIES,
  RETRY_INITIAL_DELAY_MS,
  RETRY_MAX_DELAY_MS,
  RETRY_BACKOFF_MULTIPLIER,
  TIMEOUT_MS,
  FAST_TIMEOUT_MS,
  LONG_TIMEOUT_MS,
  LLAMA_TIMEOUT_MS,
  STREAM_TIMEOUT_MS,
  CONNECTION_TIMEOUT_MS,
  MAX_TOKENS,
  MAX_TOKENS_FAST,
  MAX_TOKENS_LONG,
  MAX_CONTEXT_TOKENS,
  RESERVED_SYSTEM_TOKENS,
  TOKEN_SAFETY_BUFFER,
  MAX_CONCURRENT_TASKS,
  MAX_CONCURRENT_API_CALLS,
  MAX_CONCURRENT_FILE_OPS,
  MAX_PARALLEL_AGENTS,
  RATE_LIMIT_RPM,
  RATE_LIMIT_TPM,
  CACHE_TTL,
  CACHE_TTL_SHORT,
  CACHE_TTL_LONG,
  MAX_CACHE_SIZE,
  MAX_CACHE_SIZE_BYTES,
  MAX_CACHE_ENTRY_SIZE,
  MAX_MEMORY_ENTRIES,
  MAX_SESSION_HISTORY,
  MAX_CONVERSATION_TURNS,
  MEMORY_CLEANUP_THRESHOLD,
  MAX_FILE_SIZE,
  MAX_BATCH_FILES,
  MAX_DIRECTORY_DEPTH,
  MAX_FILE_LINES,
  MAX_QUEUE_SIZE,
  QUEUE_BATCH_SIZE,
  QUEUE_DRAIN_TIMEOUT_MS,
  // Limits (functions)
  calculateRetryDelay,
  getAvailableContextTokens,
  isCacheExpired,
  getTimeoutForOperation,
  getMaxTokensForOperation,

  // Runtime config
  ConfigManager,
  getConfig,
  resetConfig,
  validateEnvVars,

  // Paths
  HOME_DIR,
  GEMINIHYDRA_DIR,
  PROJECT_ROOT,
  SESSION_DIR,
  MEMORY_DIR,
  CACHE_DIR,
  LOGS_DIR,
  KNOWLEDGE_DIR,
  TEMP_DIR,
  BACKUP_DIR,
  CONFIG_FILE,
  API_KEYS_FILE,
  PREFERENCES_FILE,
  SESSION_INDEX_FILE,
  MEMORY_INDEX_FILE,
  KNOWLEDGE_GRAPH_FILE,
  RESPONSE_CACHE_FILE,
  EMBEDDING_CACHE_FILE,
  TOKEN_CACHE_FILE,
  MAIN_LOG_FILE,
  ERROR_LOG_FILE,
  DEBUG_LOG_FILE,
  API_LOG_FILE,
  getConfigPath,
  getSessionPath,
  getMemoryPath,
  getKnowledgePath,
  getCachePath,
  getTempPath,
  getBackupPath,
  getLogPath,
  getAllDirectories,
  ensureDirectoryPath,
  isWithinGeminiHydra,
  normalizePath,
  getRelativePath
} from './config/index.js';

// ============================================================
// Core Systems
// ============================================================

// Feature #1: Real-time Streaming
export {
  streamGeminiResponse,
  streamWithFallback,
  StreamingChat
} from './core/StreamingOutput.js';
export type { StreamingOptions } from './core/StreamingOutput.js';

// Feature #5: Hot Reload
export { HotReloadManager, hotReloadManager } from './core/HotReload.js';
export type { HotReloadOptions } from './core/HotReload.js';

// Feature #8: Circuit Breaker
export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  circuitBreakerRegistry
} from './core/CircuitBreaker.js';
export type { CircuitState, CircuitBreakerOptions } from './core/CircuitBreaker.js';

// Feature #9: Request Cache
export {
  RequestCache,
  RequestDeduplicator,
  requestCache,
  requestDeduplicator
} from './core/RequestCache.js';
export type { CacheEntry, CacheOptions } from './core/RequestCache.js';

// Feature #10: Graceful Shutdown
export {
  GracefulShutdownManager,
  shutdownManager
} from './core/GracefulShutdown.js';
export type { ShutdownHandler, ShutdownOptions } from './core/GracefulShutdown.js';

// ============================================================
// Memory & Persistence (Refactored)
// ============================================================

// Base Memory class
export {
  BaseMemory,
  TypedBaseMemory,
  generateId,
  generateNumericId,
  estimateSize,
  pruneOldEntries,
  sortByImportance,
  extractTags,
  getDefaultBaseDir
} from './memory/BaseMemory.js';
export type {
  MemoryEntry as BaseMemoryEntry,
  MemoryOptions,
  MemoryStats,
  PruneOptions
} from './memory/BaseMemory.js';

// Feature #3: Persistent Memory
export { PersistentMemory, persistentMemory } from './memory/PersistentMemory.js';
export type { MemoryEntry, MemorySearchOptions } from './memory/PersistentMemory.js';

// Session Memory
export { SessionMemory, sessionMemory } from './memory/SessionMemory.js';

// Long-Term Memory
export { LongTermMemory, longTermMemory } from './memory/LongTermMemory.js';

// Feature #51: Codebase Memory
export {
  CodebaseMemory,
  codebaseMemory
} from './memory/CodebaseMemory.js';
export type {
  FileInfo,
  ProjectStructure,
  CodebaseAnalysis,
  ContextEnrichment
} from './memory/CodebaseMemory.js';

// ============================================================
// CLI Commands (Refactored)
// ============================================================

// Command Registry
export {
  CommandRegistry,
  commandRegistry,
  success,
  error
} from './cli/CommandRegistry.js';
export type {
  Command,
  CommandArg,
  CommandResult,
  CommandContext,
  CommandHandler
} from './cli/CommandRegistry.js';

// Command Helpers
export {
  parseArgs,
  formatTable,
  formatSimpleTable,
  formatDuration,
  formatRelativeTime,
  formatBytes,
  formatNumber,
  formatPercent,
  confirmAction,
  promptInput,
  promptSelect,
  truncate,
  indent,
  horizontalLine,
  box,
  Spinner,
  showProgress,
  statusIndicator,
  highlightMatch
} from './cli/CommandHelpers.js';
export type { ParsedArgs, TableColumn } from './cli/CommandHelpers.js';

// Codebase Commands
export {
  codebaseCommands,
  autoEnrichPrompt,
  initCodebaseForCwd,
  registerCodebaseCommands
} from './cli/CodebaseCommands.js';

// Session Commands
export {
  sessionCommands,
  initSessionSystem,
  recordMessage,
  getPromptContext,
  buildFullContext,
  saveAndClose,
  registerSessionCommands
} from './cli/SessionCommands.js';

// Initialize all commands
export { initializeCommands } from './cli/index.js';

// ============================================================
// Knowledge System
// ============================================================

// Feature #52: Knowledge Bank & Agent
export {
  KnowledgeBank,
  knowledgeBank,
  KnowledgeAgent,
  knowledgeAgent,
  knowledgeCommands
} from './knowledge/index.js';
export type {
  KnowledgeType,
  KnowledgeSource,
  KnowledgeEntry as KnowledgeBankEntry,
  SearchResult,
  RAGContext,
  LearnedKnowledge,
  AgentContext,
  AgentResponse
} from './knowledge/index.js';

// Feature #4: Token Budget
export { TokenBudgetManager, tokenBudget } from './core/TokenBudget.js';
export type { TokenUsage, BudgetConfig, BudgetState } from './core/TokenBudget.js';

// Feature #7: Task Priority
export {
  TaskPriorityQueue,
  taskQueue,
  detectPriority,
  prioritizeTasks
} from './core/TaskPriority.js';
export type { Priority, PrioritizedTask } from './core/TaskPriority.js';

// ============================================================
// Model Intelligence (Refactored)
// ============================================================

export {
  // Feature #11: Dynamic Model Selection
  classifyComplexity,
  selectModelForTask,
  // Feature #12: Fallback Chains
  getFallbackChain,
  AGENT_FALLBACK_CHAINS,
  // Feature #14: Performance Tracking
  modelPerformance,
  // Feature #15: Prompt Caching
  promptCache,
  // Feature #16: Response Quality
  scoreResponseQuality,
  // Feature #17: Multi-model Consensus
  getConsensus,
  // Feature #18: Context Window
  contextManager as modelContextManager,
  // Feature #19: Prompt Optimization
  optimizePromptForModel,
  MODEL_PROMPT_CONFIGS,
  // Feature #20: Model Health
  modelHealth
} from './core/models/index.js';

export type {
  TaskComplexity,
  ModelSelectionResult,
  FallbackChainEntry,
  ModelMetrics,
  QualityScore,
  ConsensusResult,
  ContextMessage,
  ModelPromptConfig,
  ModelHealth
} from './core/models/index.js';

// ============================================================
// Git Integration
// ============================================================

// Feature #27
export { GitIntegration, git, gitCommands } from './cli/GitIntegration.js';
export type { GitStatus, CommitOptions, PROptions } from './cli/GitIntegration.js';

// ============================================================
// CLI Enhancements
// ============================================================

// Features #31-39
export {
  // Feature #31: Progress Bar
  ProgressBar,
  // Feature #32: Task Editor
  TaskEditor,
  // Feature #33: Templates
  TemplateManager,
  templateManager,
  // Feature #34: Output Formats
  OutputFormatter,
  outputFormatter,
  // Feature #35: Syntax Highlighting
  highlightCode,
  // Feature #36: Autocomplete
  createCompleter,
  // Feature #37: History Search
  HistorySearch,
  historySearch,
  // Feature #38: Pagination
  OutputPaginator,
  paginator,
  // Feature #39: Notifications
  sendNotification
} from './cli/CLIEnhancements.js';

export type {
  ProgressBarOptions,
  EditableTask,
  TaskTemplate,
  OutputFormat,
  AutocompleteOptions,
  NotificationOptions
} from './cli/CLIEnhancements.js';

// ============================================================
// Monitoring & Debug
// ============================================================

// Features #41, #42, #43, #44, #45
export {
  // Feature #41: Logging
  Logger,
  logger,
  // Feature #42: Metrics
  MetricsDashboard,
  metrics,
  // Feature #43: Task Replay
  TaskReplay,
  taskReplay,
  // Feature #44: Dry Run
  DryRunMode,
  dryRun,
  // Feature #45: Agent Trace
  AgentTrace,
  agentTrace,
  // Debug Loop
  DebugLoop,
  debugWithScreenshot
} from './debug/index.js';

export type {
  LogLevel,
  LogEntry,
  MetricPoint,
  Metric,
  ReplayEntry,
  ReplaySession,
  DryRunResult,
  TraceSpan
} from './debug/index.js';

// ============================================================
// Security
// ============================================================

// Features #48, #50
export {
  InputSanitizer,
  sanitizer,
  SecureConfig,
  secureConfig,
  maskSensitive,
  generateSecureToken,
  hashSensitive,
  RateLimiter,
  rateLimiter
} from './core/SecuritySystem.js';

export type {
  SanitizationResult,
  SanitizationOptions,
  SecureConfigData
} from './core/SecuritySystem.js';

// ============================================================
// Plugin System
// ============================================================

// Feature #6
export {
  PluginManager,
  pluginManager,
  createPlugin,
  LoggingPlugin,
  MetricsPlugin
} from './core/PluginSystem.js';

export type {
  PluginHook,
  PluginContext,
  PluginHandler,
  PluginManifest,
  Plugin,
  PluginRegistryEntry
} from './core/PluginSystem.js';

// ============================================================
// Core Exports
// ============================================================

export { Swarm } from './core/swarm/Swarm.js';
export { Agent } from './core/agent/Agent.js';
export { GraphProcessor } from './core/GraphProcessor.js';

// Feature #64: Tree of Thoughts (ToT) - exported from intelligence layer
// NOTE: Advanced ToT (MCTS, BFS, parallel) is available from ./core/intelligence/index.js
// Legacy export for backwards compatibility:
export {
  treeOfThoughts,
  quickTreeOfThoughts,
  mctsTreeOfThoughts,
  bfsTreeOfThoughts,
  parallelTreeOfThoughts
} from './core/intelligence/index.js';
export type {
  ThoughtNode,
  TreeOfThoughtsResult,
  ToTOptions,
  SearchStrategy
} from './core/intelligence/index.js';

// ============================================================
// Intelligence Layer (Refactored)
// ============================================================

export {
  // Core intelligence functions
  chainOfThought,
  selfReflect,
  scoreConfidence,
  multiPerspectiveAnalysis,
  decomposeQuery,
  findAnalogies,
  enhanceWithIntelligence,
  // Managers and caches
  semanticCache,
  knowledgeGraph,
  contextManager as intelligenceContextManager
} from './core/intelligence/index.js';

export type {
  ChainOfThoughtResult,
  ReflectionResult,
  ConfidenceScore,
  Perspective,
  MultiPerspectiveResult,
  DecomposedQuery,
  Analogy,
  IntelligenceConfig
} from './core/intelligence/index.js';

// ============================================================
// Execution Engine (Refactored)
// ============================================================

export {
  // #11 Adaptive Retry
  adaptiveRetry,
  classifyError,
  // #12 Partial Completion
  partialManager,
  // #13 Parallel Execution
  detectParallelGroups,
  executeParallelGroups,
  // #14 Auto Dependencies
  autoDetectDependencies,
  // #15 Checkpoints
  checkpointManager,
  // #16 Prioritization
  detectTaskPriority,
  calculatePriorityScore,
  sortByPriority,
  // #17 Resource Scheduling
  resourceScheduler,
  // #18 Graceful Degradation
  degradationManager,
  // #19 Task Templating
  taskTemplateManager,
  // #20 Execution Profiling
  executionProfiler,
  // Engine
  initExecutionEngine,
  getExecutionEngineStatus,
  resetExecutionEngine,
  printExecutionEngineStatus,
  isEngineReady,
  getEngineHealth
} from './core/execution/index.js';

export type {
  ErrorType,
  RetryConfig,
  PartialResult,
  SubTask,
  ParallelExecutionResult,
  Checkpoint,
  TaskPriority as ExecutionTaskPriority,
  PrioritizedTask as ExecutionPrioritizedTask,
  ResourceState,
  DegradationLevel,
  TaskTemplate as ExecutionTaskTemplate,
  ExecutionProfile,
  ExecutionEngineConfig
} from './core/execution/index.js';

// ============================================================
// Conversation Layer (Refactored)
// ============================================================

export {
  // #21 Conversation Memory
  ConversationMemory,
  conversationMemory,
  // #22 Smart Context Pruning
  SmartContextPruner,
  contextPruner,
  // #23 Intent Detection
  detectIntent,
  // #24 Proactive Suggestions
  ProactiveSuggestions,
  proactiveSuggestions,
  // #25 Learning from Corrections
  CorrectionLearner,
  correctionLearner,
  // #26 Task Estimation
  estimateTask,
  // #27 Progress Tracking
  ProgressTracker,
  progressTracker,
  // #28 Rollback Capability
  RollbackManager,
  rollbackManager,
  // #29 Dry-Run Preview
  generateDryRunPreview,
  formatDryRunPreview,
  // #30 Explanation Mode
  ExplanationMode,
  explanationMode,
  // Init
  initConversationSubsystems,
  persistConversationData
} from './core/conversation/index.js';

export type {
  ConversationTurn,
  ConversationSession,
  PruningStrategy,
  PrunedContext,
  IntentCategory,
  DetectedIntent,
  Suggestion,
  Correction,
  LearnedPattern,
  TaskEstimate,
  ProgressStep,
  ProgressReport,
  RollbackPoint,
  DryRunAction,
  DryRunPreview,
  ExplanationStep,
  Explanation
} from './core/conversation/index.js';

// ============================================================
// Developer Tools (Refactored)
// ============================================================

export {
  // #31 Code Review Agent
  reviewCode,
  formatCodeReview,
  detectLanguage,
  // #32 Test Generation
  generateTests,
  formatGeneratedTests,
  // #33 Documentation Generation
  generateDocumentation,
  formatDocumentation,
  // #34 Refactoring Suggestions
  analyzeRefactoring,
  formatRefactoringAnalysis,
  // #35 Performance Profiling
  profilePerformance,
  formatPerformanceProfile,
  // #36 Security Scanning
  scanSecurity,
  formatSecurityScan,
  // #37 Dependency Analysis
  analyzeDependencies,
  formatDependencyAnalysis,
  // #38 API Mocking
  generateMockEndpoints,
  generateMockServer,
  generateMockData,
  // #39 Environment Management
  EnvManager,
  envManager,
  // #40 Multi-Project Support
  MultiProjectManager,
  projectManager,
  // Init
  initDeveloperModules
} from './core/developer/index.js';

export type {
  CodeReviewIssue,
  CodeReviewResult,
  GeneratedTest,
  TestGenerationResult,
  DocEntry,
  DocumentationResult,
  RefactoringSuggestion,
  RefactoringAnalysis,
  PerformanceIssue,
  PerformanceProfile,
  SecurityVulnerability,
  SecurityScanResult,
  DependencyInfo,
  DependencyAnalysis,
  MockEndpoint,
  MockApiConfig,
  EnvironmentConfig,
  ProjectInfo,
  ProjectWorkspace
} from './core/developer/index.js';

// ============================================================
// Swarm Agents & Classification
// ============================================================

export {
  classifyPrompt,
  analyzeComplexity
} from './swarm/agents/classifier.js';

export {
  getAgentSummaries,
  AGENT_SPECS,
  MODEL_TIERS,
  getAgentRoles,
  getAgentsByTier,
  getCommanders,
  getCoordinators,
  getExecutors,
  getAgentSpec
} from './swarm/agents/definitions.js';

export { createSwarm } from './core/swarm/Swarm.js';

// ============================================================
// Version Info
// ============================================================

// ============================================================
// Health Check
// ============================================================

export { healthCheck, healthCheckSync } from './health.js';
export type { HealthCheckResult } from './health.js';

export const VERSION = '14.1.0';
export const FEATURE_COUNT = 64;
export const REFACTORED = true;

/**
 * Initialize all GeminiHydra subsystems
 */
export async function initGeminiHydra(): Promise<void> {
  const { initExecutionEngine } = await import('./core/execution/index.js');
  const { initConversationSubsystems } = await import('./core/conversation/index.js');
  const { initDeveloperModules } = await import('./core/developer/index.js');
  const { initializeCommands } = await import('./cli/index.js');
  const { getAllDirectories, validateEnvVars: validate } = await import('./config/index.js');
  const fs = await import('fs/promises');

  // Validate environment variables at startup
  validate();

  // Ensure all directories exist
  for (const dir of getAllDirectories()) {
    await fs.mkdir(dir, { recursive: true }).catch(() => {});
  }

  // Initialize subsystems
  await initExecutionEngine();
  await initConversationSubsystems();
  await initDeveloperModules();
  initializeCommands();
}

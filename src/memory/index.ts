/**
 * Memory System Index
 *
 * Consolidated memory architecture organized into 5 categories:
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  CORE         Base classes, session state, persistent storage   │
 * │               BaseMemory, SessionMemory, PersistentMemory       │
 * │                                                                 │
 * │  AGENT        Per-agent memory and long-term learning           │
 * │               AgentMemory, LongTermMemory                       │
 * │                                                                 │
 * │  PROJECT      Codebase analysis and project-level knowledge     │
 * │               ProjectMemory, CodebaseMemory                     │
 * │                                                                 │
 * │  ADVANCED     Semantic search, knowledge graph, prompt library  │
 * │               VectorStore, GraphMemory, PromptMemory            │
 * │                                                                 │
 * │  CACHE        Fast in-memory caching with disk persistence      │
 * │               SessionCache                                      │
 * └─────────────────────────────────────────────────────────────────┘
 */

// =============================================================================
// CORE: Base classes, session state, persistent storage
// =============================================================================

// BaseMemory - Abstract base class and shared utilities for all memory modules
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
} from './BaseMemory.js';

export type {
  MemoryEntry,
  MemoryOptions,
  MemoryStats,
  PruneOptions
} from './BaseMemory.js';

// SessionMemory - Short-lived conversational context within a single session
export { SessionMemory, sessionMemory } from './SessionMemory.js';

// PersistentMemory - JSON-based durable storage that survives restarts
export { PersistentMemory, persistentMemory } from './PersistentMemory.js';
export type {
  MemoryEntry as PersistentMemoryEntry,
  MemorySearchOptions
} from './PersistentMemory.js';

// =============================================================================
// AGENT: Per-agent memory and long-term learning
// =============================================================================

// AgentMemory - Isolated memory scope for individual swarm agents
export { AgentMemory, agentMemory } from './AgentMemory.js';

// LongTermMemory - Cross-session learning and knowledge retention
export { LongTermMemory, longTermMemory } from './LongTermMemory.js';
export type { MemoryCategory } from './LongTermMemory.js';

// =============================================================================
// PROJECT: Codebase analysis and project-level knowledge
// =============================================================================

// ProjectMemory - High-level project metadata and configuration memory
export { ProjectMemory, projectMemory } from './ProjectMemory.js';

// CodebaseMemory - Source code analysis, file structure, and context enrichment
export { CodebaseMemory, codebaseMemory } from './CodebaseMemory.js';
export type {
  FileInfo,
  ProjectStructure,
  CodebaseAnalysis,
  ContextEnrichment
} from './CodebaseMemory.js';

// =============================================================================
// ADVANCED: Semantic search, knowledge graph, prompt library
// =============================================================================

// VectorStore - Vector-based memory for swarm agents (JSON + JSONL storage)
export { VectorStore, AgentVectorMemory, agentVectorMemory } from './VectorStore.js';

// GraphMemory - Native knowledge graph with entities, relations, and traversal
export { GraphMemory, getGraphMemory, graphMemory } from './GraphMemory.js';
export type {
  EntityType,
  RelationType,
  Entity,
  Relation,
  Observation,
  GraphSearchResult,
  TraversalOptions,
  GraphStats
} from './GraphMemory.js';

// PromptMemory - Saved prompts library with categories and variables
export { PromptMemory, promptMemory } from './PromptMemory.js';
export type {
  SavedPrompt,
  PromptCategory,
  PromptVariable,
  PromptSearchOptions,
  PromptSuggestion
} from './PromptMemory.js';

// =============================================================================
// CACHE: Fast in-memory caching with disk persistence
// =============================================================================

// SessionCache - L1 in-memory cache with auto-save for objectives and chronicles
export { SessionCache, sessionCache } from './SessionCache.js';
export type { SessionCacheConfig } from './SessionCache.js';

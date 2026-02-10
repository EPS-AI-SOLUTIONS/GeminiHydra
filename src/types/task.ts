/**
 * Task types - Canonical definitions
 *
 * Single source of truth for task-related types
 * used across swarm, provider, and execution modules.
 *
 * @module types/task
 */

// ============================================================================
// Task Status
// ============================================================================

/**
 * Status of a swarm task
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

// ============================================================================
// Task Priority
// ============================================================================

/**
 * Priority level for task scheduling
 */
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low' | 'background';

// ============================================================================
// Task Difficulty
// ============================================================================

/**
 * Difficulty level for model routing
 */
export type TaskDifficulty = 'trivial' | 'simple' | 'medium' | 'moderate' | 'complex' | 'expert' | 'critical';

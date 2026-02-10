/**
 * FewShot Types - Shared type definitions for few-shot examples system
 *
 * @module fewshot/types
 */

/** Single few-shot example entry */
export interface FewShotExample {
  input: string;
  output: string;
  keywords: string[];
  effectiveness: number;
}

/** Agent-specific example (no effectiveness score) */
export interface AgentExample {
  input: string;
  output: string;
  keywords: string[];
}

/** Example usage tracking stats */
export interface ExampleUsageStats {
  category: string;
  exampleIndex: number;
  usageCount: number;
  successCount: number;
  lastUsed: Date;
}

/** Collection of few-shot examples by category */
export type FewShotExampleCollection = Record<string, FewShotExample[]>;

/** Collection of agent-specific examples */
export type AgentExampleCollection = Record<string, AgentExample[]>;

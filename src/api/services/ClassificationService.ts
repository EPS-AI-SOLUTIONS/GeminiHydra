/**
 * Classification Service
 * Handles prompt classification and agent selection
 */

import {
  getAgentSummaries,
  classifyPrompt,
  analyzeComplexity,
} from '../../index.js';
import type { ExecutePlan, AgentSummary, ComplexityInfo } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface Classification {
  agent: string;
  tier: string;
  model: string;
  confidence: number;
}

export interface FullClassification {
  classification: Classification;
  complexity: ComplexityInfo & {
    wordCount: number;
    hasCode: boolean;
    hasMultipleTasks: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Service Class
// ═══════════════════════════════════════════════════════════════════════════

export class ClassificationService {
  /**
   * Get all available agents
   */
  getAgents(): AgentSummary[] {
    return getAgentSummaries();
  }

  /**
   * Classify a prompt to determine best agent
   */
  classify(prompt: string): Classification {
    const result = classifyPrompt(prompt);
    return {
      agent: result.agent,
      tier: result.tier,
      model: result.model,
      confidence: result.confidence,
    };
  }

  /**
   * Analyze prompt complexity
   */
  analyzeComplexity(prompt: string): ComplexityInfo & {
    wordCount: number;
    hasCode: boolean;
    hasMultipleTasks: boolean;
  } {
    const result = analyzeComplexity(prompt);
    return {
      level: result.level,
      score: result.score,
      wordCount: result.wordCount,
      hasCode: result.hasCode,
      hasMultipleTasks: result.hasMultipleTasks,
    };
  }

  /**
   * Get full classification with complexity analysis
   * Combines classify() and analyzeComplexity()
   */
  getFullClassification(prompt: string): FullClassification {
    return {
      classification: this.classify(prompt),
      complexity: this.analyzeComplexity(prompt),
    };
  }

  /**
   * Create execution plan from prompt
   * This is the unified method that eliminates duplication
   */
  createPlan(prompt: string): ExecutePlan {
    const classification = this.classify(prompt);
    const complexity = analyzeComplexity(prompt);

    return {
      agent: classification.agent,
      tier: classification.tier,
      model: classification.model,
      confidence: classification.confidence,
      complexity: {
        level: complexity.level,
        score: complexity.score,
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════

export const classificationService = new ClassificationService();

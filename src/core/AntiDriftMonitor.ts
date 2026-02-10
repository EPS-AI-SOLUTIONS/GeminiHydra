/**
 * Solution 49: Anti-Drift Monitor
 *
 * Monitors for prompt drift throughout the execution pipeline.
 * Ensures that the execution stays aligned with the original user intent
 * across all phases: A, B, C, D
 *
 * Drift Score:
 *   0 = Perfect alignment with original intent
 *   100 = Complete drift from original intent
 */

/**
 * Result of a drift check at a specific phase
 */
export interface DriftCheck {
  /** Whether significant drift was detected */
  hasDrift: boolean;
  /** Drift score: 0 = perfect alignment, 100 = complete drift */
  driftScore: number;
  /** Key intent words extracted from original objective */
  originalIntent: string[];
  /** Key focus areas in current phase output */
  currentFocus: string[];
  /** Topics that diverged from original intent */
  divergentTopics: string[];
  /** Phase where this check was performed */
  phase: SwarmPhase;
  /** Timestamp of the check */
  timestamp: number;
  /** Content length analyzed */
  contentLength: number;
}

/**
 * Swarm execution phases
 */
export type SwarmPhase = 'A' | 'B' | 'C' | 'D';

/**
 * Configuration for drift detection sensitivity
 */
export interface DriftConfig {
  /** Threshold above which drift is considered significant (default: 40) */
  driftThreshold: number;
  /** Minimum word length to consider as intent word (default: 3) */
  minWordLength: number;
  /** Stop words to ignore in intent extraction */
  stopWords: Set<string>;
  /** Enable aggressive drift detection for critical tasks */
  strictMode: boolean;
}

/**
 * Default stop words for Polish and English
 */
const DEFAULT_STOP_WORDS = new Set([
  // Polish stop words
  'i', 'w', 'z', 'do', 'na', 'dla', 'to', 'jest', 'jako', 'oraz', 'lub', 'czy',
  'nie', 'tak', 'ze', 'od', 'po', 'przy', 'przed', 'za', 'pod', 'nad', 'przez',
  'jak', 'co', 'ktory', 'ktora', 'ktore', 'ten', 'ta', 'te', 'tym', 'tego',
  'ale', 'bo', 'gdyz', 'poniewaz', 'jesli', 'jezeli', 'zeby', 'aby', 'jednak',
  'tez', 'rowniez', 'jeszcze', 'juz', 'tylko', 'wiecej', 'mniej', 'bardzo',
  'wszystko', 'wszystkie', 'kazdy', 'kazda', 'jakis', 'jakies', 'pare',
  'moze', 'mozna', 'musi', 'musisz', 'powinien', 'trzeba', 'nalezy',
  // English stop words
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used',
  'this', 'that', 'these', 'those', 'it', 'its', 'what', 'which', 'who',
  'whom', 'whose', 'where', 'when', 'why', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
  'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now',
  // Common programming terms to ignore
  'function', 'class', 'method', 'file', 'code', 'implement', 'create', 'add',
  'update', 'delete', 'remove', 'change', 'modify', 'use', 'using', 'used'
]);

const DEFAULT_CONFIG: DriftConfig = {
  driftThreshold: 40,
  minWordLength: 3,
  stopWords: DEFAULT_STOP_WORDS,
  strictMode: false
};

/**
 * Anti-Drift Monitor Class
 *
 * Tracks prompt drift across execution phases and provides
 * real-time monitoring and correction suggestions.
 */
export class AntiDriftMonitor {
  private originalObjective: string = '';
  private originalIntentWords: string[] = [];
  private driftHistory: DriftCheck[] = [];
  private config: DriftConfig;
  private phaseOutputs: Map<SwarmPhase, string> = new Map();

  constructor(config: Partial<DriftConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config.stopWords) {
      // Merge custom stop words with defaults
      this.config.stopWords = new Set([
        ...DEFAULT_STOP_WORDS,
        ...config.stopWords
      ]);
    }
  }

  /**
   * Set the original user objective that all phases should align with
   * This MUST be called before any drift checks
   */
  setOriginalIntent(objective: string): void {
    this.originalObjective = objective;
    this.originalIntentWords = this.extractIntentWords(objective);
    this.driftHistory = [];
    this.phaseOutputs.clear();

    // Log initialization
    console.log(`[AntiDrift] Original intent set: ${this.originalIntentWords.length} key words extracted`);
    console.log(`[AntiDrift] Key intent words: ${this.originalIntentWords.slice(0, 10).join(', ')}${this.originalIntentWords.length > 10 ? '...' : ''}`);
  }

  /**
   * Check for drift in the current phase output
   * @param currentContent - The content/output of the current phase
   * @param phase - The current execution phase
   * @returns DriftCheck result with drift analysis
   */
  checkDrift(currentContent: string, phase: SwarmPhase): DriftCheck {
    // Store phase output for later analysis
    this.phaseOutputs.set(phase, currentContent);

    // Extract focus areas from current content
    const currentFocus = this.extractIntentWords(currentContent);

    // Calculate drift metrics
    const { driftScore, divergentTopics } = this.calculateDrift(
      this.originalIntentWords,
      currentFocus
    );

    // Determine if drift is significant
    const hasDrift = driftScore >= this.config.driftThreshold;

    const driftCheck: DriftCheck = {
      hasDrift,
      driftScore,
      originalIntent: [...this.originalIntentWords],
      currentFocus,
      divergentTopics,
      phase,
      timestamp: Date.now(),
      contentLength: currentContent.length
    };

    // Add to history
    this.driftHistory.push(driftCheck);

    // Log drift check result
    if (hasDrift) {
      console.log(`[AntiDrift] WARNING: Phase ${phase} drift detected! Score: ${driftScore}%`);
      console.log(`[AntiDrift] Divergent topics: ${divergentTopics.slice(0, 5).join(', ')}`);
    } else {
      console.log(`[AntiDrift] Phase ${phase} aligned. Drift score: ${driftScore}%`);
    }

    return driftCheck;
  }

  /**
   * Get the complete drift history across all phases
   */
  getDriftHistory(): DriftCheck[] {
    return [...this.driftHistory];
  }

  /**
   * Suggest correction when drift is detected
   * @param driftCheck - The drift check result to analyze
   * @returns Correction suggestion string
   */
  suggestCorrection(driftCheck: DriftCheck): string {
    if (!driftCheck.hasDrift) {
      return 'No correction needed - output aligned with original intent.';
    }

    const suggestions: string[] = [];

    // Identify missing original intent words
    const currentSet = new Set(driftCheck.currentFocus.map(w => w.toLowerCase()));
    const missingIntent = driftCheck.originalIntent.filter(
      word => !currentSet.has(word.toLowerCase())
    );

    if (missingIntent.length > 0) {
      suggestions.push(
        `REFOCUS: The output is missing key intent terms: ${missingIntent.slice(0, 5).join(', ')}`
      );
    }

    // Identify divergent topics to remove
    if (driftCheck.divergentTopics.length > 0) {
      suggestions.push(
        `REMOVE: Divergent topics not in original intent: ${driftCheck.divergentTopics.slice(0, 5).join(', ')}`
      );
    }

    // Phase-specific suggestions
    switch (driftCheck.phase) {
      case 'A':
        suggestions.push(
          'PHASE A CORRECTION: Regenerate plan focusing only on: ' +
          `"${this.originalObjective}". Ignore tangential tasks.`
        );
        break;
      case 'B':
        suggestions.push(
          'PHASE B CORRECTION: Filter task results to remove outputs not directly ' +
          'addressing the original objective. Discard speculative content.'
        );
        break;
      case 'C':
        suggestions.push(
          'PHASE C CORRECTION: During self-healing, validate repairs against original ' +
          'objective, not the refined/drifted version.'
        );
        break;
      case 'D':
        suggestions.push(
          'PHASE D CORRECTION: Synthesize report referencing ONLY the original objective: ' +
          `"${this.originalObjective}". Include explicit comparison.`
        );
        break;
    }

    // Add general realignment instruction
    suggestions.push(
      `REALIGNMENT: Original objective was: "${this.originalObjective}". ` +
      'All outputs must directly serve this goal.'
    );

    return suggestions.join('\n\n');
  }

  /**
   * Get a summary of drift across all phases
   */
  getDriftSummary(): {
    overallDriftScore: number;
    worstPhase: SwarmPhase | null;
    worstScore: number;
    phasesWithDrift: SwarmPhase[];
    isAligned: boolean;
  } {
    if (this.driftHistory.length === 0) {
      return {
        overallDriftScore: 0,
        worstPhase: null,
        worstScore: 0,
        phasesWithDrift: [],
        isAligned: true
      };
    }

    let worstPhase: SwarmPhase | null = null;
    let worstScore = 0;
    const phasesWithDrift: SwarmPhase[] = [];

    for (const check of this.driftHistory) {
      if (check.driftScore > worstScore) {
        worstScore = check.driftScore;
        worstPhase = check.phase;
      }
      if (check.hasDrift) {
        phasesWithDrift.push(check.phase);
      }
    }

    // Calculate overall drift as weighted average (later phases weighted more)
    const phaseWeights: Record<SwarmPhase, number> = {
      'A': 1.5,
      'B': 2.0,
      'C': 1.5,
      'D': 2.5
    };

    let weightedSum = 0;
    let totalWeight = 0;

    for (const check of this.driftHistory) {
      const weight = phaseWeights[check.phase];
      weightedSum += check.driftScore * weight;
      totalWeight += weight;
    }

    const overallDriftScore = totalWeight > 0
      ? Math.round(weightedSum / totalWeight)
      : 0;

    return {
      overallDriftScore,
      worstPhase,
      worstScore,
      phasesWithDrift,
      isAligned: overallDriftScore < this.config.driftThreshold
    };
  }

  /**
   * Get the original objective (immutable reference)
   */
  getOriginalObjective(): string {
    return this.originalObjective;
  }

  /**
   * Get phase output for comparison
   */
  getPhaseOutput(phase: SwarmPhase): string | undefined {
    return this.phaseOutputs.get(phase);
  }

  /**
   * Reset the monitor for a new execution
   */
  reset(): void {
    this.originalObjective = '';
    this.originalIntentWords = [];
    this.driftHistory = [];
    this.phaseOutputs.clear();
  }

  /**
   * Check if current trajectory will likely complete original objective
   * Based on accumulated drift and remaining phases
   */
  predictCompletion(currentPhase: SwarmPhase): {
    willComplete: boolean;
    confidence: number;
    recommendation: string;
  } {
    const summary = this.getDriftSummary();
    const phaseOrder: SwarmPhase[] = ['A', 'B', 'C', 'D'];
    const currentIndex = phaseOrder.indexOf(currentPhase);
    const remainingPhases = phaseOrder.length - currentIndex - 1;

    // Calculate confidence based on drift and remaining opportunity to correct
    let confidence = 100 - summary.overallDriftScore;

    // Adjust confidence based on trend
    if (this.driftHistory.length >= 2) {
      const recentDrift = this.driftHistory.slice(-2);
      const trend = recentDrift[1].driftScore - recentDrift[0].driftScore;

      if (trend > 10) {
        // Drift is increasing
        confidence -= 20;
      } else if (trend < -10) {
        // Drift is decreasing (good)
        confidence += 10;
      }
    }

    // More remaining phases = more opportunity to correct
    confidence += remainingPhases * 5;
    confidence = Math.max(0, Math.min(100, confidence));

    let recommendation: string;
    if (confidence >= 80) {
      recommendation = 'On track - continue execution';
    } else if (confidence >= 50) {
      recommendation = 'Moderate drift detected - consider applying corrections before next phase';
    } else {
      recommendation = `HIGH DRIFT RISK - Consider restarting with original objective: "${this.originalObjective}"`;
    }

    return {
      willComplete: confidence >= 50,
      confidence,
      recommendation
    };
  }

  // =========================================
  // Private Helper Methods
  // =========================================

  /**
   * Extract key intent words from text
   */
  private extractIntentWords(text: string): string[] {
    // Normalize text
    const normalized = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')  // Remove non-alphanumeric
      .replace(/\s+/g, ' ')
      .trim();

    // Split into words
    const words = normalized.split(' ');

    // Filter and deduplicate
    const intentWords = new Set<string>();

    for (const word of words) {
      if (
        word.length >= this.config.minWordLength &&
        !this.config.stopWords.has(word) &&
        !this.isNumeric(word)
      ) {
        intentWords.add(word);
      }
    }

    // Also extract compound terms (e.g., "anti-drift", "knowledge-graph")
    const compoundTerms = text.match(/[\p{L}]+-[\p{L}]+/gu) || [];
    for (const term of compoundTerms) {
      if (term.length >= this.config.minWordLength) {
        intentWords.add(term.toLowerCase());
      }
    }

    // Extract technical terms (camelCase, PascalCase)
    const technicalTerms = text.match(/[A-Z][a-z]+(?:[A-Z][a-z]+)+/g) || [];
    for (const term of technicalTerms) {
      intentWords.add(term.toLowerCase());
    }

    return Array.from(intentWords);
  }

  /**
   * Calculate drift between original intent and current focus
   */
  private calculateDrift(
    originalIntent: string[],
    currentFocus: string[]
  ): {
    driftScore: number;
    divergentTopics: string[];
  } {
    if (originalIntent.length === 0) {
      return { driftScore: 0, divergentTopics: [] };
    }

    const originalSet = new Set(originalIntent.map(w => w.toLowerCase()));
    const currentSet = new Set(currentFocus.map(w => w.toLowerCase()));

    // Calculate overlap (Jaccard-like similarity)
    let matches = 0;
    for (const word of currentSet) {
      if (originalSet.has(word)) {
        matches++;
      }
    }

    // Find divergent topics (in current but not in original)
    const divergentTopics: string[] = [];
    for (const word of currentFocus) {
      const lower = word.toLowerCase();
      if (!originalSet.has(lower)) {
        divergentTopics.push(word);
      }
    }

    // Calculate drift score
    // Higher score = more drift
    const originalCoverage = matches / originalSet.size; // How much of original is preserved
    const currentPurity = currentSet.size > 0 ? matches / currentSet.size : 0; // How much of current is from original

    // Weight original coverage more heavily (we want to preserve original intent)
    const alignmentScore = (originalCoverage * 0.7) + (currentPurity * 0.3);
    let driftScore = Math.round((1 - alignmentScore) * 100);

    // Apply strict mode penalty for high divergent topic count
    if (this.config.strictMode && divergentTopics.length > originalIntent.length) {
      driftScore = Math.min(100, driftScore + 15);
    }

    return {
      driftScore: Math.max(0, Math.min(100, driftScore)),
      divergentTopics: divergentTopics.slice(0, 20) // Limit to top 20
    };
  }

  /**
   * Check if string is purely numeric
   */
  private isNumeric(str: string): boolean {
    return /^\d+$/.test(str);
  }
}

// =========================================
// Singleton Export for Swarm.ts Integration
// =========================================

/**
 * Global anti-drift monitor instance
 * Use this in Swarm.ts for phase transition monitoring
 */
export const antiDriftMonitor = new AntiDriftMonitor();

/**
 * Factory function to create configured monitor
 */
export function createAntiDriftMonitor(config?: Partial<DriftConfig>): AntiDriftMonitor {
  return new AntiDriftMonitor(config);
}

// =========================================
// Usage Example (for documentation)
// =========================================
/*
import { antiDriftMonitor, SwarmPhase } from './AntiDriftMonitor.js';

// At start of execution
antiDriftMonitor.setOriginalIntent("Implement user authentication with OAuth2");

// At each phase transition
const phaseAResult = antiDriftMonitor.checkDrift(planJson, 'A');
const phaseBResult = antiDriftMonitor.checkDrift(executionResults, 'B');
const phaseCResult = antiDriftMonitor.checkDrift(healedResults, 'C');
const phaseDResult = antiDriftMonitor.checkDrift(finalReport, 'D');

// Get summary
const summary = antiDriftMonitor.getDriftSummary();
console.log(`Overall drift: ${summary.overallDriftScore}%`);
console.log(`Aligned: ${summary.isAligned}`);

// Get prediction
const prediction = antiDriftMonitor.predictCompletion('B');
console.log(`Will complete: ${prediction.willComplete} (${prediction.confidence}% confidence)`);
*/

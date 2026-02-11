/**
 * FinalQualityGate - Solution 50: Ultimate Quality Gate for Anti-Hallucination
 *
 * This is the final quality gate that aggregates all anti-hallucination checks
 * before producing the final output. It combines multiple quality components
 * to determine if a report should be accepted, reviewed, or rejected.
 *
 * Components checked (weighted):
 * - Hallucination score (25%) - Detection of fabricated content
 * - Citation coverage (20%) - Proper source attribution
 * - Coherence score (15%) - Internal consistency and logical flow
 * - Objective alignment (20%) - Relevance to original task
 * - Evidence completeness (10%) - Supporting evidence quality
 * - Format compliance (10%) - Structural requirements
 *
 * GeminiHydra Protocol v14.0 "School of the Wolf"
 */

import chalk from 'chalk';
import type { ExecutionResult } from '../types/index.js';
import { CitationEnforcer, type Source } from './CitationEnforcer.js';
import { FinalReportValidator } from './FinalReportValidator.js';
import { detectHallucinations } from './HallucinationDetector.js';
import { ResponseCoherenceAnalyzer } from './ResponseCoherenceAnalyzer.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Context for quality evaluation
 */
export interface QualityContext {
  /** The original user objective/request */
  originalObjective: string;
  /** Results from all agents */
  agentResults: ExecutionResult[];
  /** Total execution time in milliseconds */
  executionTime: number;
  /** Results from each execution phase */
  phaseResults: Map<string, unknown>;
  /** Optional task classification */
  taskType?: string;
  /** Optional minimum threshold override */
  minimumThreshold?: number;
}

/**
 * Individual quality component result
 */
export interface QualityComponent {
  /** Name of the component being evaluated */
  name: string;
  /** Score for this component (0-100) */
  score: number;
  /** Weight of this component in overall score (0-1) */
  weight: number;
  /** List of issues found for this component */
  issues: string[];
  /** Whether this component passed its individual threshold */
  passed: boolean;
}

/**
 * Final quality result
 */
export interface QualityResult {
  /** Whether the overall quality check passed */
  passed: boolean;
  /** Overall weighted score (0-100) */
  overallScore: number;
  /** Individual component results */
  components: QualityComponent[];
  /** Critical issues that block acceptance */
  blockers: string[];
  /** Non-critical warnings */
  warnings: string[];
  /** Recommended action */
  recommendation: 'accept' | 'review' | 'reject';
  /** Timestamp of evaluation */
  timestamp: number;
  /** Evaluation duration in ms */
  evaluationTime: number;
}

/**
 * Configuration for FinalQualityGate
 */
export interface FinalQualityGateConfig {
  /** Minimum score to pass (default: 70) */
  passThreshold: number;
  /** Score above which to accept without review (default: 85) */
  acceptThreshold: number;
  /** Score below which to reject outright (default: 40) */
  rejectThreshold: number;
  /** Enable verbose logging */
  verbose: boolean;
  /** Custom component weights */
  weights?: Partial<ComponentWeights>;
  /** Enable strict mode - any blocker fails */
  strictMode: boolean;
}

/**
 * Weights for each quality component (must sum to 1.0)
 */
interface ComponentWeights {
  hallucination: number;
  citation: number;
  coherence: number;
  objectiveAlignment: number;
  evidenceCompleteness: number;
  formatCompliance: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default configuration */
const DEFAULT_CONFIG: FinalQualityGateConfig = {
  passThreshold: 70,
  acceptThreshold: 85,
  rejectThreshold: 40,
  verbose: false,
  strictMode: false,
  weights: undefined,
};

/** Default component weights (sum = 1.0) */
export const DEFAULT_WEIGHTS: ComponentWeights = {
  hallucination: 0.25, // 25% - Most critical
  citation: 0.2, // 20% - Important for verification
  coherence: 0.15, // 15% - Logical consistency
  objectiveAlignment: 0.2, // 20% - Relevance to task
  evidenceCompleteness: 0.1, // 10% - Supporting evidence
  formatCompliance: 0.1, // 10% - Structural requirements
};

/** Required sections for format compliance */
const REQUIRED_SECTIONS = ['## Podsumowanie', '## Wyniki', '## Zgodność z celem'];

/** Patterns indicating fabricated content */
const FABRICATION_PATTERNS = [
  /\bfile\d+\.(ts|js|tsx|jsx)\b/gi,
  /\bClass\d+\b/g,
  /\bComponent\d+\b/g,
  /\/path\/to\//gi,
  /\[TODO\]|\[PLACEHOLDER\]/gi,
];

// =============================================================================
// FINALQUALITYGATE CLASS
// =============================================================================

/**
 * FinalQualityGate - Aggregates all anti-hallucination checks
 */
export class FinalQualityGate {
  private config: FinalQualityGateConfig;
  private weights: ComponentWeights;
  private lastResult: QualityResult | null = null;
  private citationEnforcer: CitationEnforcer;
  private coherenceAnalyzer: ResponseCoherenceAnalyzer;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: assigned in constructor for future use
  private reportValidator: FinalReportValidator;

  constructor(config: Partial<FinalQualityGateConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.weights = { ...DEFAULT_WEIGHTS, ...config.weights };

    // Normalize weights to ensure they sum to 1.0
    this.normalizeWeights();

    // Initialize sub-validators
    this.citationEnforcer = new CitationEnforcer({ verbose: this.config.verbose });
    this.coherenceAnalyzer = new ResponseCoherenceAnalyzer({
      coherenceThreshold: 70,
      verbose: this.config.verbose,
    });
    this.reportValidator = new FinalReportValidator({ verbose: this.config.verbose });
  }

  /**
   * Normalize weights to sum to 1.0
   */
  private normalizeWeights(): void {
    const sum = Object.values(this.weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.01) {
      // Normalize
      for (const key of Object.keys(this.weights) as (keyof ComponentWeights)[]) {
        this.weights[key] = this.weights[key] / sum;
      }
    }
  }

  /**
   * Main evaluation method - performs all quality checks
   */
  evaluateQuality(report: string, context: QualityContext): QualityResult {
    const startTime = Date.now();
    const components: QualityComponent[] = [];
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (this.config.verbose) {
      console.log(chalk.cyan('\n[FinalQualityGate] Starting comprehensive quality evaluation...'));
      console.log(chalk.gray(`  Report length: ${report.length} chars`));
      console.log(chalk.gray(`  Agent results: ${context.agentResults.length}`));
      console.log(chalk.gray(`  Execution time: ${context.executionTime}ms`));
    }

    // === COMPONENT 1: Hallucination Detection (25%) ===
    const hallucinationComponent = this.evaluateHallucination(report, context);
    components.push(hallucinationComponent);
    if (!hallucinationComponent.passed) {
      blockers.push(...hallucinationComponent.issues.filter((i) => i.includes('CRITICAL')));
      warnings.push(...hallucinationComponent.issues.filter((i) => !i.includes('CRITICAL')));
    }

    // === COMPONENT 2: Citation Coverage (20%) ===
    const citationComponent = this.evaluateCitation(report, context);
    components.push(citationComponent);
    if (!citationComponent.passed) {
      warnings.push(...citationComponent.issues);
    }

    // === COMPONENT 3: Coherence Score (15%) ===
    const coherenceComponent = this.evaluateCoherence(report);
    components.push(coherenceComponent);
    if (!coherenceComponent.passed) {
      warnings.push(...coherenceComponent.issues);
    }

    // === COMPONENT 4: Objective Alignment (20%) ===
    const alignmentComponent = this.evaluateObjectiveAlignment(report, context);
    components.push(alignmentComponent);
    if (!alignmentComponent.passed) {
      if (alignmentComponent.score < 30) {
        blockers.push('CRITICAL: Report does not address the original objective');
      } else {
        warnings.push(...alignmentComponent.issues);
      }
    }

    // === COMPONENT 5: Evidence Completeness (10%) ===
    const evidenceComponent = this.evaluateEvidenceCompleteness(report, context);
    components.push(evidenceComponent);
    if (!evidenceComponent.passed) {
      warnings.push(...evidenceComponent.issues);
    }

    // === COMPONENT 6: Format Compliance (10%) ===
    const formatComponent = this.evaluateFormatCompliance(report);
    components.push(formatComponent);
    if (!formatComponent.passed) {
      warnings.push(...formatComponent.issues);
    }

    // Calculate overall weighted score
    const overallScore = this.calculateOverallScore(components);

    // Determine recommendation
    const recommendation = this.determineRecommendation(overallScore, blockers, context);

    // Determine if passed
    const threshold = context.minimumThreshold ?? this.config.passThreshold;
    const passed = this.config.strictMode
      ? blockers.length === 0 && overallScore >= threshold
      : overallScore >= threshold;

    const evaluationTime = Date.now() - startTime;

    const result: QualityResult = {
      passed,
      overallScore,
      components,
      blockers,
      warnings,
      recommendation,
      timestamp: Date.now(),
      evaluationTime,
    };

    this.lastResult = result;

    if (this.config.verbose) {
      this.logResult(result);
    }

    return result;
  }

  /**
   * Evaluate hallucination score
   */
  private evaluateHallucination(report: string, _context: QualityContext): QualityComponent {
    const issues: string[] = [];

    // Use HallucinationDetector
    const hallucinationResult = detectHallucinations(report);

    // Convert hallucination score (0-100, higher = worse) to quality score (0-100, higher = better)
    let score = 100 - hallucinationResult.totalScore;

    // Additional checks for fabricated content
    let fabricationCount = 0;
    for (const pattern of FABRICATION_PATTERNS) {
      const matches = report.match(pattern);
      if (matches) {
        fabricationCount += matches.length;
        issues.push(`Potential fabrication detected: ${matches.slice(0, 2).join(', ')}`);
      }
    }

    // Penalize for fabrications
    score = Math.max(0, score - fabricationCount * 10);

    // Add issues from hallucination detector
    for (const check of hallucinationResult.checks) {
      if (check.triggered) {
        const severity = check.severity === 'critical' ? 'CRITICAL' : check.severity.toUpperCase();
        issues.push(`[${severity}] ${check.message}`);
      }
    }

    return {
      name: 'hallucination',
      score: Math.round(score),
      weight: this.weights.hallucination,
      issues,
      passed: score >= 60,
    };
  }

  /**
   * Evaluate citation coverage
   */
  private evaluateCitation(report: string, context: QualityContext): QualityComponent {
    const issues: string[] = [];

    // Create sources from agent results
    const sources: Source[] = context.agentResults
      .filter((r) => r.success)
      .map((r, index) => ({
        taskId: r.id ?? index + 1,
        agentId: r.sourceTracking?.agent ?? 'unknown',
        content: (r.logs ?? []).join('\n'),
      }));

    // Use CitationEnforcer
    const citationResult = this.citationEnforcer.enforceCitations(report, sources);

    let score = citationResult.citationCoverage;

    // Penalize for hallucinations detected
    if (citationResult.hallucinations.length > 0) {
      const criticalHallucinations = citationResult.hallucinations.filter(
        (h) => h.severity === 'critical',
      );
      score = Math.max(0, score - criticalHallucinations.length * 15);
      score = Math.max(
        0,
        score - (citationResult.hallucinations.length - criticalHallucinations.length) * 5,
      );

      for (const h of citationResult.hallucinations.slice(0, 5)) {
        issues.push(`[${h.severity.toUpperCase()}] ${h.claim}: ${h.reason}`);
      }
    }

    // Add warnings
    issues.push(...citationResult.warnings);

    // Bonus for high citation count
    if (citationResult.citedClaims > 5) {
      score = Math.min(100, score + 5);
    }

    return {
      name: 'citation',
      score: Math.round(score),
      weight: this.weights.citation,
      issues,
      passed: score >= 50,
    };
  }

  /**
   * Evaluate coherence score
   */
  private evaluateCoherence(report: string): QualityComponent {
    const issues: string[] = [];

    // Use ResponseCoherenceAnalyzer
    const coherenceResult = this.coherenceAnalyzer.analyzeCoherence(report);

    const score = coherenceResult.score;

    // Add issues
    for (const issue of coherenceResult.issues.slice(0, 5)) {
      issues.push(`[${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}`);
    }

    // Add suggestions as warnings
    for (const suggestion of coherenceResult.suggestions.slice(0, 3)) {
      if (!suggestion.includes('No major suggestions')) {
        issues.push(`Suggestion: ${suggestion}`);
      }
    }

    return {
      name: 'coherence',
      score: Math.round(score),
      weight: this.weights.coherence,
      issues,
      passed: coherenceResult.coherent,
    };
  }

  /**
   * Evaluate objective alignment
   */
  private evaluateObjectiveAlignment(report: string, context: QualityContext): QualityComponent {
    const issues: string[] = [];
    const reportLower = report.toLowerCase();
    const objectiveLower = context.originalObjective.toLowerCase();

    // Extract key terms from objective (words > 3 chars, excluding stop words)
    const stopWords = new Set([
      'this',
      'that',
      'with',
      'from',
      'have',
      'been',
      'will',
      'would',
      'could',
      'should',
      'about',
    ]);
    const keyTerms = objectiveLower
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word))
      .slice(0, 20); // Max 20 key terms

    // Count matches
    let matchCount = 0;
    const missingTerms: string[] = [];

    for (const term of keyTerms) {
      if (reportLower.includes(term)) {
        matchCount++;
      } else {
        missingTerms.push(term);
      }
    }

    // Calculate alignment percentage
    const alignment = keyTerms.length > 0 ? (matchCount / keyTerms.length) * 100 : 100;

    // Check for explicit objective reference
    const hasObjectiveReference =
      report.includes('ORYGINALNY CEL') ||
      report.includes('Original objective') ||
      report.includes('## Cel') ||
      report.includes('## Objective');

    let score = alignment;

    // Bonus for explicit objective reference
    if (hasObjectiveReference) {
      score = Math.min(100, score + 10);
    }

    // Check if key results address the objective
    const resultsSection = report.match(/## Wyniki[\s\S]*?(?=##|$)/i);
    if (resultsSection) {
      const resultsKeyTermMatches = keyTerms.filter((term) =>
        resultsSection[0].toLowerCase().includes(term),
      ).length;
      const resultsCoverage =
        keyTerms.length > 0 ? (resultsKeyTermMatches / keyTerms.length) * 100 : 100;

      // Average with results-specific alignment
      score = (score + resultsCoverage) / 2;
    }

    // Add issues
    if (alignment < 50) {
      issues.push(`Low objective alignment: ${alignment.toFixed(0)}%`);
      if (missingTerms.length > 0) {
        issues.push(`Missing key terms: ${missingTerms.slice(0, 5).join(', ')}`);
      }
    }

    if (!hasObjectiveReference) {
      issues.push('No explicit reference to original objective');
    }

    return {
      name: 'objectiveAlignment',
      score: Math.round(score),
      weight: this.weights.objectiveAlignment,
      issues,
      passed: score >= 60,
    };
  }

  /**
   * Evaluate evidence completeness
   */
  private evaluateEvidenceCompleteness(report: string, context: QualityContext): QualityComponent {
    const issues: string[] = [];

    // Count successful agent results
    const successfulResults = context.agentResults.filter((r) => r.success);
    const totalResults = context.agentResults.length;

    // Calculate task completion rate
    const completionRate = totalResults > 0 ? (successfulResults.length / totalResults) * 100 : 0;

    // Check for task citations in report
    const taskCitationPattern = /\[(?:Zadanie|Task)\s*#?(\d+)\]/gi;
    const citedTasks = new Set<number>();
    for (
      let match = taskCitationPattern.exec(report);
      match !== null;
      match = taskCitationPattern.exec(report)
    ) {
      citedTasks.add(parseInt(match[1], 10));
    }

    // Calculate citation coverage of successful results
    const citedSuccessful = successfulResults.filter((r) => citedTasks.has(r.id ?? 0)).length;

    const citationCoverage =
      successfulResults.length > 0 ? (citedSuccessful / successfulResults.length) * 100 : 100;

    // Check for evidence markers
    const evidencePatterns = [
      /dlatego|therefore|hence|thus/gi,
      /ponieważ|because|since/gi,
      /na podstawie|based on/gi,
      /zgodnie z|according to/gi,
      /wynika z|results from|follows from/gi,
    ];

    let evidenceMarkerCount = 0;
    for (const pattern of evidencePatterns) {
      const matches = report.match(pattern);
      if (matches) {
        evidenceMarkerCount += matches.length;
      }
    }

    // Calculate score
    const score =
      completionRate * 0.4 + citationCoverage * 0.4 + Math.min(evidenceMarkerCount * 5, 20);

    // Add issues
    if (completionRate < 70) {
      issues.push(
        `Low task completion rate: ${completionRate.toFixed(0)}% (${successfulResults.length}/${totalResults})`,
      );
    }

    if (citationCoverage < 50) {
      issues.push(`Low evidence citation: ${citationCoverage.toFixed(0)}% of results cited`);
    }

    if (evidenceMarkerCount < 2) {
      issues.push('Few evidence markers - consider adding reasoning connectors');
    }

    return {
      name: 'evidenceCompleteness',
      score: Math.round(score),
      weight: this.weights.evidenceCompleteness,
      issues,
      passed: score >= 50,
    };
  }

  /**
   * Evaluate format compliance
   */
  private evaluateFormatCompliance(report: string): QualityComponent {
    const issues: string[] = [];
    let score = 100;

    // Check for required sections
    for (const section of REQUIRED_SECTIONS) {
      const patterns = [
        section,
        section.replace('## ', '### '),
        section.replace('## ', '**'),
        section.toLowerCase(),
      ];

      const found = patterns.some((p) => report.toLowerCase().includes(p.toLowerCase()));
      if (!found) {
        score -= 15;
        issues.push(`Missing required section: ${section}`);
      }
    }

    // Check for proper markdown structure
    const hasHeaders = /^#{1,3}\s/m.test(report);
    const hasBulletPoints = /^[-*]\s/m.test(report);
    const hasNumberedList = /^\d+\.\s/m.test(report);

    if (!hasHeaders) {
      score -= 10;
      issues.push('No markdown headers found');
    }

    if (!hasBulletPoints && !hasNumberedList) {
      score -= 5;
      issues.push('No lists found - consider using bullet points');
    }

    // Check for proper paragraph breaks
    const paragraphBreaks = (report.match(/\n\s*\n/g) || []).length;
    if (paragraphBreaks < 2 && report.length > 500) {
      score -= 5;
      issues.push('Insufficient paragraph breaks');
    }

    // Check for unclosed code blocks
    const codeBlockOpens = (report.match(/```\w*/g) || []).length;
    const codeBlockCloses = (report.match(/```\s*$/gm) || []).length;
    if (codeBlockOpens !== codeBlockCloses) {
      score -= 10;
      issues.push('Unclosed code blocks detected');
    }

    // Check minimum length
    if (report.length < 200) {
      score -= 20;
      issues.push('Report too short (minimum 200 characters recommended)');
    }

    return {
      name: 'formatCompliance',
      score: Math.max(0, score),
      weight: this.weights.formatCompliance,
      issues,
      passed: score >= 60,
    };
  }

  /**
   * Calculate overall weighted score
   */
  private calculateOverallScore(components: QualityComponent[]): number {
    let weightedSum = 0;
    let totalWeight = 0;

    for (const component of components) {
      weightedSum += component.score * component.weight;
      totalWeight += component.weight;
    }

    return Math.round(weightedSum / totalWeight);
  }

  /**
   * Determine recommendation based on score and blockers
   */
  private determineRecommendation(
    score: number,
    blockers: string[],
    _context: QualityContext,
  ): 'accept' | 'review' | 'reject' {
    // If in strict mode and has blockers, reject
    if (this.config.strictMode && blockers.length > 0) {
      return 'reject';
    }

    // High score with no blockers = accept
    if (score >= this.config.acceptThreshold && blockers.length === 0) {
      return 'accept';
    }

    // Very low score or many blockers = reject
    if (score < this.config.rejectThreshold || blockers.length >= 3) {
      return 'reject';
    }

    // Everything else = review
    return 'review';
  }

  /**
   * Generate detailed report of quality evaluation
   */
  getDetailedReport(): string {
    if (!this.lastResult) {
      return 'No evaluation has been performed yet.';
    }

    const r = this.lastResult;
    const lines: string[] = [];

    lines.push('═'.repeat(60));
    lines.push('  FINAL QUALITY GATE REPORT');
    lines.push('═'.repeat(60));
    lines.push('');

    // Overall status
    const statusIcon = r.passed ? '[PASS]' : '[FAIL]';
    const _statusColor = r.passed ? 'green' : 'red';
    lines.push(
      `Status: ${statusIcon} | Score: ${r.overallScore}/100 | Recommendation: ${r.recommendation.toUpperCase()}`,
    );
    lines.push(`Threshold: ${this.config.passThreshold}% | Strict Mode: ${this.config.strictMode}`);
    lines.push(`Evaluation Time: ${r.evaluationTime}ms`);
    lines.push('');

    // Component breakdown
    lines.push('─'.repeat(60));
    lines.push('  COMPONENT SCORES (weighted)');
    lines.push('─'.repeat(60));

    for (const component of r.components) {
      const passIcon = component.passed ? '[OK]' : '[X]';
      const weightPercent = (component.weight * 100).toFixed(0);
      const contribution = (component.score * component.weight).toFixed(1);

      lines.push(
        `  ${passIcon} ${component.name.padEnd(22)} ${component.score.toString().padStart(3)}/100 (${weightPercent}% weight, +${contribution} pts)`,
      );

      if (component.issues.length > 0 && !component.passed) {
        for (const issue of component.issues.slice(0, 2)) {
          lines.push(`      - ${issue}`);
        }
        if (component.issues.length > 2) {
          lines.push(`      ... and ${component.issues.length - 2} more issues`);
        }
      }
    }

    lines.push('');

    // Blockers
    if (r.blockers.length > 0) {
      lines.push('─'.repeat(60));
      lines.push('  BLOCKERS (must fix)');
      lines.push('─'.repeat(60));
      for (const blocker of r.blockers) {
        lines.push(`  [!] ${blocker}`);
      }
      lines.push('');
    }

    // Warnings
    if (r.warnings.length > 0) {
      lines.push('─'.repeat(60));
      lines.push(`  WARNINGS (${r.warnings.length} total)`);
      lines.push('─'.repeat(60));
      for (const warning of r.warnings.slice(0, 5)) {
        lines.push(`  [?] ${warning}`);
      }
      if (r.warnings.length > 5) {
        lines.push(`  ... and ${r.warnings.length - 5} more warnings`);
      }
      lines.push('');
    }

    // Recommendation
    lines.push('─'.repeat(60));
    lines.push('  RECOMMENDATION');
    lines.push('─'.repeat(60));

    switch (r.recommendation) {
      case 'accept':
        lines.push('  [ACCEPT] Report quality is sufficient. Ready for final output.');
        break;
      case 'review':
        lines.push('  [REVIEW] Report requires human review before acceptance.');
        lines.push('  Consider addressing the warnings listed above.');
        break;
      case 'reject':
        lines.push('  [REJECT] Report quality is insufficient. Regeneration recommended.');
        lines.push('  Fix the blockers and major issues before resubmitting.');
        break;
    }

    lines.push('');
    lines.push('═'.repeat(60));

    return lines.join('\n');
  }

  /**
   * Log result to console
   */
  private logResult(result: QualityResult): void {
    const statusColor = result.passed ? chalk.green : chalk.red;
    const statusIcon = result.passed ? '[PASS]' : '[FAIL]';

    console.log(chalk.cyan(`\n${'='.repeat(60)}`));
    console.log(chalk.cyan('  FINAL QUALITY GATE EVALUATION'));
    console.log(chalk.cyan('='.repeat(60)));

    console.log(statusColor(`\nStatus: ${statusIcon} | Score: ${result.overallScore}/100`));
    console.log(chalk.gray(`Recommendation: ${result.recommendation.toUpperCase()}`));
    console.log(chalk.gray(`Evaluation time: ${result.evaluationTime}ms`));

    console.log(chalk.yellow('\nComponent Scores:'));
    for (const component of result.components) {
      const passIcon = component.passed ? chalk.green('[OK]') : chalk.red('[X]');
      const scoreColor =
        component.score >= 70 ? chalk.green : component.score >= 50 ? chalk.yellow : chalk.red;

      console.log(
        `  ${passIcon} ${component.name.padEnd(22)} ${scoreColor(`${component.score}/100`)} (${(component.weight * 100).toFixed(0)}%)`,
      );
    }

    if (result.blockers.length > 0) {
      console.log(chalk.red(`\nBlockers (${result.blockers.length}):`));
      for (const blocker of result.blockers.slice(0, 3)) {
        console.log(chalk.red(`  - ${blocker}`));
      }
    }

    if (result.warnings.length > 0) {
      console.log(chalk.yellow(`\nWarnings (${result.warnings.length}):`));
      for (const warning of result.warnings.slice(0, 5)) {
        console.log(chalk.yellow(`  - ${warning}`));
      }
    }

    console.log(chalk.cyan(`\n${'='.repeat(60)}`));
  }

  /**
   * Get the last evaluation result
   */
  getLastResult(): QualityResult | null {
    return this.lastResult;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FinalQualityGateConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.weights) {
      this.weights = { ...this.weights, ...config.weights };
      this.normalizeWeights();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): FinalQualityGateConfig {
    return { ...this.config };
  }

  /**
   * Quick check - returns true if report passes quality gate
   */
  quickCheck(report: string, context: QualityContext): boolean {
    const result = this.evaluateQuality(report, context);
    return result.passed;
  }
}

// =============================================================================
// SINGLETON INSTANCE & HELPER FUNCTIONS
// =============================================================================

/**
 * Default singleton instance
 */
export const finalQualityGate = new FinalQualityGate({
  passThreshold: 70,
  acceptThreshold: 85,
  rejectThreshold: 40,
  verbose: false,
  strictMode: false,
});

/**
 * Quick quality evaluation
 */
export function evaluateQuality(report: string, context: QualityContext): QualityResult {
  return finalQualityGate.evaluateQuality(report, context);
}

/**
 * Quick check if report passes quality gate
 */
export function passesQualityGate(report: string, context: QualityContext): boolean {
  return finalQualityGate.quickCheck(report, context);
}

/**
 * Get detailed quality report
 */
export function getQualityReport(): string {
  return finalQualityGate.getDetailedReport();
}

/**
 * Set quality threshold
 */
export function setQualityThreshold(threshold: number): void {
  finalQualityGate.updateConfig({ passThreshold: threshold });
}

/**
 * Enable strict mode
 */
export function enableStrictMode(enabled: boolean = true): void {
  finalQualityGate.updateConfig({ strictMode: enabled });
}

/**
 * Create quality context from execution results
 */
export function createQualityContext(
  originalObjective: string,
  agentResults: ExecutionResult[],
  executionTime: number,
  phaseResults?: Map<string, unknown>,
): QualityContext {
  return {
    originalObjective,
    agentResults,
    executionTime,
    phaseResults: phaseResults ?? new Map(),
  };
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  FinalQualityGate,
  finalQualityGate,
  evaluateQuality,
  passesQualityGate,
  getQualityReport,
  setQualityThreshold,
  enableStrictMode,
  createQualityContext,
  DEFAULT_WEIGHTS,
};

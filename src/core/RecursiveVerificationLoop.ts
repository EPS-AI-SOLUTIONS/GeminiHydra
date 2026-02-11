/**
 * RecursiveVerificationLoop - Solution 48
 * Recursive verification loop that re-checks uncertain claims until convergence
 *
 * This module implements an iterative verification process that:
 * 1. Checks all claims in the first iteration
 * 2. Re-checks claims with confidence < 70% in subsequent iterations
 * 3. Continues until convergence (no status changes) or maxDepth reached
 * 4. Maintains a full trace of verification history per claim
 *
 * Export for Phase D synthesis integration.
 */

import chalk from 'chalk';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * A claim to be verified
 */
export interface Claim {
  /** Unique identifier for the claim */
  id: string;
  /** The actual content/statement of the claim */
  content: string;
  /** Current confidence level (0-100) */
  confidence: number;
  /** Source of the claim (agent, model, external) */
  source: string;
  /** IDs of claims this claim depends on */
  dependencies: string[];
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Status of a claim during verification
 */
export type ClaimStatus = 'pending' | 'verified' | 'uncertain' | 'rejected';

/**
 * Internal state of a claim during verification process
 */
interface ClaimState {
  claim: Claim;
  status: ClaimStatus;
  confidence: number;
  verificationCount: number;
  lastVerifiedAt: number;
  history: IterationSnapshot[];
}

/**
 * Snapshot of a claim's state at a specific iteration
 */
interface IterationSnapshot {
  iteration: number;
  status: ClaimStatus;
  confidence: number;
  reason: string;
  timestamp: number;
}

/**
 * Trace of all iterations for a specific claim
 */
export interface IterationTrace {
  iteration: number;
  status: ClaimStatus;
  confidence: number;
  previousConfidence: number;
  confidenceDelta: number;
  reason: string;
  timestamp: number;
  dependenciesStatus: { id: string; status: ClaimStatus }[];
}

/**
 * Final result of the verification process
 */
export interface VerificationResult {
  /** Claims that passed verification (confidence >= threshold) */
  verified: Claim[];
  /** Claims that remain uncertain after all iterations */
  uncertain: Claim[];
  /** Claims that were rejected (confidence dropped below rejection threshold) */
  rejected: Claim[];
  /** Total number of iterations performed */
  iterations: number;
  /** Whether the process converged naturally */
  convergenceReached: boolean;
  /** Time taken in milliseconds */
  durationMs: number;
  /** Summary statistics */
  stats: VerificationStats;
}

/**
 * Statistics about the verification process
 */
export interface VerificationStats {
  totalClaims: number;
  initialVerified: number;
  initialUncertain: number;
  initialRejected: number;
  finalVerified: number;
  finalUncertain: number;
  finalRejected: number;
  averageIterationsPerClaim: number;
  confidenceImprovement: number;
  convergenceIteration: number | null;
}

/**
 * Configuration options for the verification loop
 */
export interface VerificationOptions {
  /** Minimum confidence to mark as verified (default: 70) */
  verificationThreshold?: number;
  /** Confidence below which to reject (default: 30) */
  rejectionThreshold?: number;
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
  /** Custom verification function */
  verifyFn?: (claim: Claim, context: VerificationContext) => Promise<VerificationOutcome>;
  /** Maximum claims to process in parallel (default: 5) */
  parallelLimit?: number;
  /** Timeout per claim verification in ms (default: 10000) */
  claimTimeout?: number;
  /** Weight factor for dependency confidence (default: 0.3) */
  dependencyWeight?: number;
}

/**
 * Context provided to verification function
 */
export interface VerificationContext {
  iteration: number;
  allClaims: Map<string, ClaimState>;
  dependencyStates: ClaimState[];
  previousConfidence: number;
  verificationHistory: IterationSnapshot[];
}

/**
 * Outcome of verifying a single claim
 */
export interface VerificationOutcome {
  confidence: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// DEFAULT VERIFICATION FUNCTION
// ============================================================================

/**
 * Default verification function that analyzes claim content and dependencies
 */
async function defaultVerifyFn(
  claim: Claim,
  context: VerificationContext,
): Promise<VerificationOutcome> {
  // Base confidence from the claim itself
  let confidence = claim.confidence;
  const reasons: string[] = [];

  // Factor 1: Dependency health (if dependencies exist)
  if (context.dependencyStates.length > 0) {
    const depConfidences = context.dependencyStates.map((d) => d.confidence);
    const avgDepConfidence = depConfidences.reduce((a, b) => a + b, 0) / depConfidences.length;
    const rejectedDeps = context.dependencyStates.filter((d) => d.status === 'rejected').length;
    const verifiedDeps = context.dependencyStates.filter((d) => d.status === 'verified').length;

    // Adjust confidence based on dependencies
    if (rejectedDeps > 0) {
      confidence = Math.min(confidence, 40 - rejectedDeps * 10);
      reasons.push(`${rejectedDeps} rejected dependencies`);
    } else if (verifiedDeps === context.dependencyStates.length) {
      confidence = Math.min(100, confidence + 10);
      reasons.push('All dependencies verified');
    } else {
      // Weighted average with dependency confidence
      confidence = Math.round(confidence * 0.7 + avgDepConfidence * 0.3);
      reasons.push(`Dependency average: ${avgDepConfidence.toFixed(1)}%`);
    }
  }

  // Factor 2: Iteration stabilization
  if (context.verificationHistory.length >= 2) {
    const recentHistory = context.verificationHistory.slice(-3);
    const confidenceVariance = calculateVariance(recentHistory.map((h) => h.confidence));

    if (confidenceVariance < 5) {
      // Confidence is stabilizing, slight boost
      confidence = Math.min(100, confidence + 5);
      reasons.push('Confidence stabilizing');
    } else if (confidenceVariance > 20) {
      // High variance, reduce confidence
      confidence = Math.max(0, confidence - 10);
      reasons.push('High confidence variance');
    }
  }

  // Factor 3: Content quality heuristics
  const contentScore = analyzeClaimContent(claim.content);
  confidence = Math.round(confidence * 0.8 + contentScore * 0.2);
  if (contentScore < 50) {
    reasons.push('Weak content signals');
  } else if (contentScore > 80) {
    reasons.push('Strong content signals');
  }

  // Factor 4: Source reliability
  const sourceScore = evaluateSource(claim.source);
  confidence = Math.round(confidence * 0.9 + sourceScore * 0.1);

  // Clamp to valid range
  confidence = Math.max(0, Math.min(100, confidence));

  return {
    confidence,
    reason: reasons.length > 0 ? reasons.join('; ') : 'Standard verification',
  };
}

/**
 * Calculate variance of a number array
 */
function calculateVariance(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  const squaredDiffs = numbers.map((n) => (n - mean) ** 2);
  return squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
}

/**
 * Analyze claim content for quality signals
 */
function analyzeClaimContent(content: string): number {
  let score = 50; // Base score

  // Positive signals
  if (content.length > 50) score += 10;
  if (content.length > 200) score += 5;
  if (/\d+/.test(content)) score += 10; // Contains numbers
  if (/\b(?:because|therefore|thus|since|due to)\b/i.test(content)) score += 10; // Reasoning
  if (/\b(?:verified|confirmed|tested|validated)\b/i.test(content)) score += 5;

  // Negative signals
  if (/\b(?:maybe|perhaps|might|possibly|probably)\b/i.test(content)) score -= 15;
  if (/\b(?:assume|assumption|guess|think)\b/i.test(content)) score -= 10;
  if (/\b(?:TODO|FIXME|TBD|unknown)\b/i.test(content)) score -= 20;
  if (content.length < 10) score -= 20;

  return Math.max(0, Math.min(100, score));
}

/**
 * Evaluate source reliability
 */
function evaluateSource(source: string): number {
  const sourceLower = source.toLowerCase();

  // High reliability sources
  if (/\b(?:dijkstra|vesemir|regis)\b/.test(sourceLower)) return 90;
  if (/\b(?:verified|tested|validated)\b/.test(sourceLower)) return 85;
  if (/\b(?:official|documented)\b/.test(sourceLower)) return 80;

  // Medium reliability
  if (/\b(?:geralt|yennefer|triss|philippa)\b/.test(sourceLower)) return 70;
  if (/\b(?:analysis|computed|calculated)\b/.test(sourceLower)) return 65;

  // Lower reliability
  if (/\b(?:jaskier|zoltan)\b/.test(sourceLower)) return 55;
  if (/\b(?:user|input|external)\b/.test(sourceLower)) return 50;
  if (/\b(?:unknown|unverified)\b/.test(sourceLower)) return 30;

  return 60; // Default
}

// ============================================================================
// MAIN CLASS
// ============================================================================

/**
 * RecursiveVerificationLoop - Iteratively verifies claims until convergence
 */
export class RecursiveVerificationLoop {
  private options: Required<VerificationOptions>;
  private claimStates: Map<string, ClaimState> = new Map();
  private verificationTraces: Map<string, IterationTrace[]> = new Map();
  private currentIteration: number = 0;

  constructor(options: VerificationOptions = {}) {
    this.options = {
      verificationThreshold: options.verificationThreshold ?? 70,
      rejectionThreshold: options.rejectionThreshold ?? 30,
      verbose: options.verbose ?? false,
      verifyFn: options.verifyFn ?? defaultVerifyFn,
      parallelLimit: options.parallelLimit ?? 5,
      claimTimeout: options.claimTimeout ?? 10000,
      dependencyWeight: options.dependencyWeight ?? 0.3,
    };
  }

  /**
   * Start the verification loop
   *
   * @param claims - Array of claims to verify
   * @param maxDepth - Maximum number of iterations (default: 10)
   * @returns VerificationResult with final states
   */
  async startVerification(claims: Claim[], maxDepth: number = 10): Promise<VerificationResult> {
    const startTime = Date.now();

    // Initialize state
    this.claimStates.clear();
    this.verificationTraces.clear();
    this.currentIteration = 0;

    // Initialize claim states
    for (const claim of claims) {
      const initialStatus = this.determineStatus(claim.confidence);
      this.claimStates.set(claim.id, {
        claim,
        status: initialStatus,
        confidence: claim.confidence,
        verificationCount: 0,
        lastVerifiedAt: Date.now(),
        history: [],
      });
      this.verificationTraces.set(claim.id, []);
    }

    // Topologically sort claims based on dependencies
    const sortedClaimIds = this.topologicalSort(claims);

    if (this.options.verbose) {
      console.log(
        chalk.cyan(`[RecursiveVerification] Starting verification of ${claims.length} claims`),
      );
      console.log(chalk.gray(`  Max depth: ${maxDepth}`));
      console.log(chalk.gray(`  Verification threshold: ${this.options.verificationThreshold}%`));
      console.log(chalk.gray(`  Rejection threshold: ${this.options.rejectionThreshold}%`));
    }

    let convergenceReached = false;
    const initialStats = this.getStatusCounts();

    // Main verification loop
    while (this.currentIteration < maxDepth) {
      this.currentIteration++;

      // Get claims that need verification this iteration
      const claimsToVerify = this.getClaimsForIteration(sortedClaimIds);

      if (claimsToVerify.length === 0) {
        if (this.options.verbose) {
          console.log(
            chalk.green(
              `[RecursiveVerification] Convergence reached at iteration ${this.currentIteration}`,
            ),
          );
        }
        convergenceReached = true;
        break;
      }

      if (this.options.verbose) {
        console.log(
          chalk.blue(
            `[RecursiveVerification] Iteration ${this.currentIteration}: verifying ${claimsToVerify.length} claims`,
          ),
        );
      }

      // Verify claims (with parallelism control)
      const statusChanges = await this.verifyClaimsBatch(claimsToVerify);

      if (this.options.verbose) {
        console.log(chalk.gray(`  Status changes: ${statusChanges}`));
      }

      // Check for convergence (no changes in this iteration)
      if (statusChanges === 0 && this.currentIteration > 1) {
        if (this.options.verbose) {
          console.log(
            chalk.green(`[RecursiveVerification] No status changes - convergence reached`),
          );
        }
        convergenceReached = true;
        break;
      }
    }

    // Build final result
    const verified: Claim[] = [];
    const uncertain: Claim[] = [];
    const rejected: Claim[] = [];

    for (const state of this.claimStates.values()) {
      // Update claim with final confidence
      const updatedClaim: Claim = {
        ...state.claim,
        confidence: state.confidence,
      };

      switch (state.status) {
        case 'verified':
          verified.push(updatedClaim);
          break;
        case 'rejected':
          rejected.push(updatedClaim);
          break;
        default:
          uncertain.push(updatedClaim);
      }
    }

    const finalStats = this.getStatusCounts();
    const durationMs = Date.now() - startTime;

    // Calculate statistics
    const totalVerificationCounts = Array.from(this.claimStates.values()).map(
      (s) => s.verificationCount,
    );
    const avgIterations =
      totalVerificationCounts.length > 0
        ? totalVerificationCounts.reduce((a, b) => a + b, 0) / totalVerificationCounts.length
        : 0;

    const initialAvgConfidence = claims.reduce((sum, c) => sum + c.confidence, 0) / claims.length;
    const finalAvgConfidence =
      Array.from(this.claimStates.values()).reduce((sum, s) => sum + s.confidence, 0) /
      this.claimStates.size;

    const stats: VerificationStats = {
      totalClaims: claims.length,
      initialVerified: initialStats.verified,
      initialUncertain: initialStats.uncertain,
      initialRejected: initialStats.rejected,
      finalVerified: finalStats.verified,
      finalUncertain: finalStats.uncertain,
      finalRejected: finalStats.rejected,
      averageIterationsPerClaim: Math.round(avgIterations * 100) / 100,
      confidenceImprovement: Math.round((finalAvgConfidence - initialAvgConfidence) * 100) / 100,
      convergenceIteration: convergenceReached ? this.currentIteration : null,
    };

    if (this.options.verbose) {
      console.log(chalk.cyan(`[RecursiveVerification] Complete in ${durationMs}ms`));
      console.log(
        chalk.gray(
          `  Verified: ${verified.length}, Uncertain: ${uncertain.length}, Rejected: ${rejected.length}`,
        ),
      );
      console.log(
        chalk.gray(
          `  Confidence improvement: ${stats.confidenceImprovement > 0 ? '+' : ''}${stats.confidenceImprovement}%`,
        ),
      );
    }

    return {
      verified,
      uncertain,
      rejected,
      iterations: this.currentIteration,
      convergenceReached,
      durationMs,
      stats,
    };
  }

  /**
   * Get the full verification trace for a specific claim
   */
  getVerificationTrace(claimId: string): IterationTrace[] {
    return this.verificationTraces.get(claimId) || [];
  }

  /**
   * Get all verification traces
   */
  getAllTraces(): Map<string, IterationTrace[]> {
    return new Map(this.verificationTraces);
  }

  /**
   * Get current state of a claim
   */
  getClaimState(claimId: string): ClaimState | undefined {
    return this.claimStates.get(claimId);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Determine initial status based on confidence
   */
  private determineStatus(confidence: number): ClaimStatus {
    if (confidence >= this.options.verificationThreshold) {
      return 'verified';
    } else if (confidence <= this.options.rejectionThreshold) {
      return 'rejected';
    } else {
      return 'uncertain';
    }
  }

  /**
   * Topologically sort claims based on dependencies
   */
  private topologicalSort(claims: Claim[]): string[] {
    const claimMap = new Map(claims.map((c) => [c.id, c]));
    const visited = new Set<string>();
    const result: string[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const claim = claimMap.get(id);
      if (claim) {
        for (const depId of claim.dependencies) {
          if (claimMap.has(depId)) {
            visit(depId);
          }
        }
      }
      result.push(id);
    };

    for (const claim of claims) {
      visit(claim.id);
    }

    return result;
  }

  /**
   * Get claims that need verification in this iteration
   */
  private getClaimsForIteration(sortedIds: string[]): string[] {
    if (this.currentIteration === 1) {
      // First iteration: verify all claims
      return sortedIds;
    }

    // Subsequent iterations: only claims with confidence < threshold
    return sortedIds.filter((id) => {
      const state = this.claimStates.get(id);
      if (!state) return false;

      // Re-verify if uncertain or if dependencies changed
      if (state.status === 'uncertain') return true;

      // Re-verify if any dependency status changed recently
      const depStates = this.getDependencyStates(state.claim);
      const recentlyChanged = depStates.some(
        (ds) =>
          ds.history.length > 0 &&
          ds.history[ds.history.length - 1].iteration === this.currentIteration - 1,
      );

      return recentlyChanged && state.confidence < 85;
    });
  }

  /**
   * Verify a batch of claims with parallelism control
   */
  private async verifyClaimsBatch(claimIds: string[]): Promise<number> {
    let statusChanges = 0;

    // Process in batches
    for (let i = 0; i < claimIds.length; i += this.options.parallelLimit) {
      const batch = claimIds.slice(i, i + this.options.parallelLimit);
      const results = await Promise.all(batch.map((id) => this.verifySingleClaim(id)));
      statusChanges += results.filter((changed) => changed).length;
    }

    return statusChanges;
  }

  /**
   * Verify a single claim
   */
  private async verifySingleClaim(claimId: string): Promise<boolean> {
    const state = this.claimStates.get(claimId);
    if (!state) return false;

    const previousStatus = state.status;
    const previousConfidence = state.confidence;

    // Build verification context
    const dependencyStates = this.getDependencyStates(state.claim);
    const context: VerificationContext = {
      iteration: this.currentIteration,
      allClaims: this.claimStates,
      dependencyStates,
      previousConfidence,
      verificationHistory: state.history,
    };

    try {
      // Run verification with timeout
      const outcome = await Promise.race([
        this.options.verifyFn(state.claim, context),
        new Promise<VerificationOutcome>((_, reject) =>
          setTimeout(() => reject(new Error('Verification timeout')), this.options.claimTimeout),
        ),
      ]);

      // Update state
      state.confidence = outcome.confidence;
      state.status = this.determineStatus(outcome.confidence);
      state.verificationCount++;
      state.lastVerifiedAt = Date.now();

      // Record history
      const snapshot: IterationSnapshot = {
        iteration: this.currentIteration,
        status: state.status,
        confidence: state.confidence,
        reason: outcome.reason,
        timestamp: Date.now(),
      };
      state.history.push(snapshot);

      // Record trace
      const trace: IterationTrace = {
        iteration: this.currentIteration,
        status: state.status,
        confidence: state.confidence,
        previousConfidence,
        confidenceDelta: state.confidence - previousConfidence,
        reason: outcome.reason,
        timestamp: Date.now(),
        dependenciesStatus: dependencyStates.map((ds) => ({
          id: ds.claim.id,
          status: ds.status,
        })),
      };
      this.verificationTraces.get(claimId)?.push(trace);

      if (this.options.verbose && state.status !== previousStatus) {
        const arrow = state.confidence > previousConfidence ? chalk.green('UP') : chalk.red('DN');
        console.log(
          chalk.gray(
            `    [${claimId}] ${previousStatus} -> ${state.status} ` +
              `(${previousConfidence}% -> ${state.confidence}% ${arrow}) - ${outcome.reason}`,
          ),
        );
      }

      return state.status !== previousStatus;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (this.options.verbose) {
        console.log(chalk.yellow(`    [${claimId}] Verification error: ${msg}`));
      }

      // On error, slightly decrease confidence
      state.confidence = Math.max(0, state.confidence - 5);
      state.status = this.determineStatus(state.confidence);

      return state.status !== previousStatus;
    }
  }

  /**
   * Get dependency states for a claim
   */
  private getDependencyStates(claim: Claim): ClaimState[] {
    return claim.dependencies
      .map((depId) => this.claimStates.get(depId))
      .filter((state): state is ClaimState => state !== undefined);
  }

  /**
   * Get current status counts
   */
  private getStatusCounts(): { verified: number; uncertain: number; rejected: number } {
    let verified = 0;
    let uncertain = 0;
    let rejected = 0;

    for (const state of this.claimStates.values()) {
      switch (state.status) {
        case 'verified':
          verified++;
          break;
        case 'rejected':
          rejected++;
          break;
        default:
          uncertain++;
      }
    }

    return { verified, uncertain, rejected };
  }

  // ============================================================================
  // CONFIGURATION METHODS
  // ============================================================================

  /**
   * Update verification options
   */
  setOptions(options: Partial<VerificationOptions>): void {
    this.options = { ...this.options, ...options } as Required<VerificationOptions>;
  }

  /**
   * Get current options
   */
  getOptions(): Required<VerificationOptions> {
    return { ...this.options };
  }

  /**
   * Reset the verifier state
   */
  reset(): void {
    this.claimStates.clear();
    this.verificationTraces.clear();
    this.currentIteration = 0;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create a claim from simple inputs
 */
export function createClaim(
  id: string,
  content: string,
  confidence: number,
  source: string,
  dependencies: string[] = [],
): Claim {
  return {
    id,
    content,
    confidence: Math.max(0, Math.min(100, confidence)),
    source,
    dependencies,
  };
}

/**
 * Quick verification - single pass without recursion
 */
export async function quickVerify(claims: Claim[]): Promise<{
  verified: Claim[];
  uncertain: Claim[];
  rejected: Claim[];
}> {
  const verifier = new RecursiveVerificationLoop({ verbose: false });
  const result = await verifier.startVerification(claims, 1);
  return {
    verified: result.verified,
    uncertain: result.uncertain,
    rejected: result.rejected,
  };
}

/**
 * Format verification trace as readable string
 */
export function formatTrace(trace: IterationTrace[]): string {
  if (trace.length === 0) return 'No verification history';

  const lines: string[] = ['=== Verification Trace ==='];

  for (const entry of trace) {
    const delta =
      entry.confidenceDelta >= 0 ? `+${entry.confidenceDelta}` : `${entry.confidenceDelta}`;
    lines.push(
      `[Iteration ${entry.iteration}] ${entry.status.toUpperCase()} | ` +
        `${entry.previousConfidence}% -> ${entry.confidence}% (${delta}%) | ` +
        `${entry.reason}`,
    );

    if (entry.dependenciesStatus.length > 0) {
      const deps = entry.dependenciesStatus.map((d) => `${d.id}:${d.status}`).join(', ');
      lines.push(`  Dependencies: ${deps}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format verification result as summary string
 */
export function formatResult(result: VerificationResult): string {
  const lines: string[] = [
    '=== Verification Result ===',
    `Total iterations: ${result.iterations}`,
    `Convergence: ${result.convergenceReached ? 'YES' : 'NO'}`,
    `Duration: ${result.durationMs}ms`,
    '',
    `Verified (${result.verified.length}):`,
    ...result.verified.map(
      (c) => `  [OK] ${c.id}: ${c.confidence}% - ${c.content.substring(0, 50)}...`,
    ),
    '',
    `Uncertain (${result.uncertain.length}):`,
    ...result.uncertain.map(
      (c) => `  [??] ${c.id}: ${c.confidence}% - ${c.content.substring(0, 50)}...`,
    ),
    '',
    `Rejected (${result.rejected.length}):`,
    ...result.rejected.map(
      (c) => `  [XX] ${c.id}: ${c.confidence}% - ${c.content.substring(0, 50)}...`,
    ),
    '',
    '--- Statistics ---',
    `Confidence improvement: ${result.stats.confidenceImprovement > 0 ? '+' : ''}${result.stats.confidenceImprovement}%`,
    `Average iterations per claim: ${result.stats.averageIterationsPerClaim}`,
  ];

  return lines.join('\n');
}

// ============================================================================
// DEFAULT INSTANCE & EXPORTS
// ============================================================================

/** Default verifier instance */
export const recursiveVerifier = new RecursiveVerificationLoop();

/** Export for Phase D synthesis integration */
export default RecursiveVerificationLoop;

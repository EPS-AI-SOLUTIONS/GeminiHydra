/**
 * EvidenceChainTracker - Solution #33: Evidence Chain Tracking
 *
 * Tracks the chain of evidence for each claim made by agents.
 * Ensures all agent claims have supporting evidence from actual operations
 * (file reads, file writes, commands, MCP calls, or other agent outputs).
 *
 * Features:
 * - Chain creation and management for task claims
 * - Evidence linking with timestamps and agent attribution
 * - Gap detection for claims without proof
 * - Trust score calculation based on evidence completeness
 * - Integration-ready for GraphProcessor.ts
 */

import crypto from 'node:crypto';
import chalk from 'chalk';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Types of evidence that can support a claim
 */
export type EvidenceType =
  | 'file_read' // Evidence from reading a file
  | 'file_write' // Evidence from writing/modifying a file
  | 'command' // Evidence from executing a shell command
  | 'mcp_call' // Evidence from an MCP tool invocation
  | 'agent_output'; // Evidence from another agent's verified output

/**
 * A single piece of evidence supporting a claim
 */
export interface Evidence {
  /** Type of evidence */
  type: EvidenceType;
  /** Content/description of the evidence */
  content: string;
  /** Unix timestamp when evidence was recorded */
  timestamp: number;
  /** ID of the agent that produced this evidence */
  agentId: string;
  /** Optional: file path for file-related evidence */
  filePath?: string;
  /** Optional: command executed for command evidence */
  command?: string;
  /** Optional: MCP tool name for MCP evidence */
  mcpTool?: string;
  /** Optional: hash of the evidence content for integrity */
  contentHash?: string;
}

/**
 * Result of chain validation
 */
export interface ChainValidation {
  /** Whether the chain is complete (all claims have evidence) */
  isComplete: boolean;
  /** Total number of evidence items in the chain */
  evidenceCount: number;
  /** List of gaps (claims without sufficient evidence) */
  gaps: string[];
  /** Trust score from 0 to 1 based on evidence quality and coverage */
  trustScore: number;
  /** Detailed analysis of the chain */
  details?: ChainAnalysisDetails;
}

/**
 * Detailed analysis of an evidence chain
 */
export interface ChainAnalysisDetails {
  /** Number of unique agents contributing evidence */
  uniqueAgents: number;
  /** Time span of evidence collection (ms) */
  timeSpan: number;
  /** Breakdown of evidence by type */
  evidenceByType: Record<EvidenceType, number>;
  /** List of claims with their evidence status */
  claimStatus: ClaimEvidenceStatus[];
  /** Warnings about the chain */
  warnings: string[];
}

/**
 * Status of evidence for a specific claim
 */
export interface ClaimEvidenceStatus {
  /** The claim text */
  claim: string;
  /** Whether evidence exists for this claim */
  hasEvidence: boolean;
  /** Evidence items supporting this claim */
  supportingEvidence: Evidence[];
  /** Confidence score for this claim (0-1) */
  confidence: number;
}

/**
 * An evidence chain for a task
 */
interface EvidenceChain {
  /** Unique chain identifier */
  chainId: string;
  /** Associated task ID */
  taskId: number;
  /** The initial claim that started the chain */
  claim: string;
  /** List of evidence items */
  evidence: Evidence[];
  /** Sub-claims extracted from agent responses */
  subClaims: string[];
  /** Timestamp when chain was created */
  createdAt: number;
  /** Timestamp of last update */
  updatedAt: number;
  /** Whether the chain has been validated */
  validated: boolean;
  /** Last validation result */
  lastValidation?: ChainValidation;
}

/**
 * Configuration for the evidence chain tracker
 */
export interface EvidenceChainTrackerConfig {
  /** Minimum evidence items required for a complete chain */
  minEvidenceRequired?: number;
  /** Minimum trust score threshold (0-1) */
  minTrustScore?: number;
  /** Enable detailed analysis in validation */
  enableDetailedAnalysis?: boolean;
  /** Enable debug logging */
  debug?: boolean;
  /** Maximum chain age before warning (ms) */
  maxChainAge?: number;
  /** Whether to auto-extract sub-claims from evidence */
  autoExtractClaims?: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<EvidenceChainTrackerConfig> = {
  minEvidenceRequired: 1,
  minTrustScore: 0.6,
  enableDetailedAnalysis: true,
  debug: false,
  maxChainAge: 300000, // 5 minutes
  autoExtractClaims: true,
};

// =============================================================================
// EVIDENCE CHAIN TRACKER CLASS
// =============================================================================

/**
 * EvidenceChainTracker - Tracks and validates evidence chains for agent claims
 */
export class EvidenceChainTracker {
  private chains: Map<string, EvidenceChain> = new Map();
  private taskChainMap: Map<number, string[]> = new Map();
  private config: Required<EvidenceChainTrackerConfig>;

  constructor(config: EvidenceChainTrackerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start a new evidence chain for a claim
   * @param taskId - The task ID associated with this claim
   * @param claim - The claim that needs evidence
   * @returns The unique chain ID
   */
  startChain(taskId: number, claim: string): string {
    const chainId = this.generateChainId(taskId, claim);
    const now = Date.now();

    const chain: EvidenceChain = {
      chainId,
      taskId,
      claim,
      evidence: [],
      subClaims: [],
      createdAt: now,
      updatedAt: now,
      validated: false,
    };

    this.chains.set(chainId, chain);

    // Track chain by task
    const taskChains = this.taskChainMap.get(taskId) || [];
    taskChains.push(chainId);
    this.taskChainMap.set(taskId, taskChains);

    if (this.config.debug) {
      console.log(chalk.cyan(`[EvidenceChain] Started chain ${chainId} for task ${taskId}`));
      console.log(chalk.gray(`  Claim: "${claim.substring(0, 100)}..."`));
    }

    return chainId;
  }

  /**
   * Add evidence to an existing chain
   * @param chainId - The chain to add evidence to
   * @param evidence - The evidence to add
   */
  addEvidence(chainId: string, evidence: Evidence): void {
    const chain = this.chains.get(chainId);
    if (!chain) {
      if (this.config.debug) {
        console.log(chalk.yellow(`[EvidenceChain] Warning: Chain ${chainId} not found`));
      }
      return;
    }

    // Add content hash for integrity verification
    const evidenceWithHash: Evidence = {
      ...evidence,
      contentHash: this.hashContent(evidence.content),
    };

    chain.evidence.push(evidenceWithHash);
    chain.updatedAt = Date.now();
    chain.validated = false; // Needs re-validation

    // Auto-extract sub-claims if enabled
    if (this.config.autoExtractClaims) {
      const extractedClaims = this.extractSubClaims(evidence.content);
      chain.subClaims.push(...extractedClaims);
    }

    if (this.config.debug) {
      console.log(chalk.cyan(`[EvidenceChain] Added ${evidence.type} evidence to ${chainId}`));
      console.log(
        chalk.gray(`  Agent: ${evidence.agentId}, Content length: ${evidence.content.length}`),
      );
    }
  }

  /**
   * Validate an evidence chain
   * @param chainId - The chain to validate
   * @returns Validation result
   */
  validateChain(chainId: string): ChainValidation {
    const chain = this.chains.get(chainId);
    if (!chain) {
      return {
        isComplete: false,
        evidenceCount: 0,
        gaps: ['Chain not found'],
        trustScore: 0,
      };
    }

    const gaps: string[] = [];
    const warnings: string[] = [];

    // Check for minimum evidence
    if (chain.evidence.length < this.config.minEvidenceRequired) {
      gaps.push(
        `Insufficient evidence: ${chain.evidence.length}/${this.config.minEvidenceRequired} required`,
      );
    }

    // Check for evidence types coverage
    const _evidenceTypes = new Set(chain.evidence.map((e) => e.type));

    // Check main claim coverage
    const mainClaimCovered = this.isClaimCoveredByEvidence(chain.claim, chain.evidence);
    if (!mainClaimCovered) {
      gaps.push(`Main claim lacks direct evidence: "${chain.claim.substring(0, 50)}..."`);
    }

    // Check sub-claims coverage
    for (const subClaim of chain.subClaims) {
      const covered = this.isClaimCoveredByEvidence(subClaim, chain.evidence);
      if (!covered) {
        gaps.push(`Sub-claim lacks evidence: "${subClaim.substring(0, 50)}..."`);
      }
    }

    // Check chain age
    const chainAge = Date.now() - chain.createdAt;
    if (chainAge > this.config.maxChainAge) {
      warnings.push(`Chain is stale (${Math.round(chainAge / 1000)}s old)`);
    }

    // Check for agent diversity (single-agent chains may be less reliable)
    const uniqueAgents = new Set(chain.evidence.map((e) => e.agentId));
    if (chain.evidence.length > 3 && uniqueAgents.size === 1) {
      warnings.push('All evidence from single agent - consider cross-verification');
    }

    // Calculate trust score
    const trustScore = this.calculateTrustScore(chain, gaps);

    // Build detailed analysis if enabled
    let details: ChainAnalysisDetails | undefined;
    if (this.config.enableDetailedAnalysis) {
      details = this.buildDetailedAnalysis(chain, gaps, warnings);
    }

    const isComplete = gaps.length === 0 && trustScore >= this.config.minTrustScore;

    const validation: ChainValidation = {
      isComplete,
      evidenceCount: chain.evidence.length,
      gaps,
      trustScore,
      details,
    };

    // Cache validation result
    chain.validated = true;
    chain.lastValidation = validation;

    if (this.config.debug) {
      this.logValidationResult(chainId, validation);
    }

    return validation;
  }

  /**
   * Get all chains for a task
   * @param taskId - The task ID
   * @returns Array of chain IDs
   */
  getChainsForTask(taskId: number): string[] {
    return this.taskChainMap.get(taskId) || [];
  }

  /**
   * Get a specific chain by ID
   * @param chainId - The chain ID
   * @returns The evidence chain or undefined
   */
  getChain(chainId: string): EvidenceChain | undefined {
    return this.chains.get(chainId);
  }

  /**
   * Validate all chains for a task
   * @param taskId - The task ID
   * @returns Map of chain IDs to validation results
   */
  validateTaskChains(taskId: number): Map<string, ChainValidation> {
    const chainIds = this.getChainsForTask(taskId);
    const results = new Map<string, ChainValidation>();

    for (const chainId of chainIds) {
      results.set(chainId, this.validateChain(chainId));
    }

    return results;
  }

  /**
   * Get overall trust score for a task based on all its chains
   * @param taskId - The task ID
   * @returns Aggregate trust score (0-1)
   */
  getTaskTrustScore(taskId: number): number {
    const validations = this.validateTaskChains(taskId);
    if (validations.size === 0) return 0;

    let totalScore = 0;
    for (const validation of validations.values()) {
      totalScore += validation.trustScore;
    }

    return totalScore / validations.size;
  }

  /**
   * Add a sub-claim to an existing chain
   * @param chainId - The chain ID
   * @param subClaim - The sub-claim to add
   */
  addSubClaim(chainId: string, subClaim: string): void {
    const chain = this.chains.get(chainId);
    if (chain && !chain.subClaims.includes(subClaim)) {
      chain.subClaims.push(subClaim);
      chain.validated = false;
    }
  }

  /**
   * Clear all chains (useful for testing or reset)
   */
  clearAllChains(): void {
    this.chains.clear();
    this.taskChainMap.clear();
  }

  /**
   * Clear chains for a specific task
   * @param taskId - The task ID
   */
  clearTaskChains(taskId: number): void {
    const chainIds = this.taskChainMap.get(taskId) || [];
    for (const chainId of chainIds) {
      this.chains.delete(chainId);
    }
    this.taskChainMap.delete(taskId);
  }

  /**
   * Get statistics about all chains
   */
  getStatistics(): {
    totalChains: number;
    totalEvidence: number;
    averageTrustScore: number;
    chainsByTask: number;
    incompleteChains: number;
  } {
    let totalEvidence = 0;
    let totalTrustScore = 0;
    let incompleteChains = 0;

    for (const chain of this.chains.values()) {
      totalEvidence += chain.evidence.length;
      const validation = chain.lastValidation || this.validateChain(chain.chainId);
      totalTrustScore += validation.trustScore;
      if (!validation.isComplete) {
        incompleteChains++;
      }
    }

    return {
      totalChains: this.chains.size,
      totalEvidence,
      averageTrustScore: this.chains.size > 0 ? totalTrustScore / this.chains.size : 0,
      chainsByTask: this.taskChainMap.size,
      incompleteChains,
    };
  }

  /**
   * Update configuration
   * @param config - New configuration options
   */
  setConfig(config: Partial<EvidenceChainTrackerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<EvidenceChainTrackerConfig> {
    return { ...this.config };
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Generate a unique chain ID
   */
  private generateChainId(taskId: number, claim: string): string {
    const timestamp = Date.now();
    const hash = crypto
      .createHash('sha256')
      .update(`${taskId}-${claim}-${timestamp}`)
      .digest('hex')
      .substring(0, 12);
    return `chain-${taskId}-${hash}`;
  }

  /**
   * Hash content for integrity verification
   */
  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
  }

  /**
   * Check if a claim is covered by evidence
   */
  private isClaimCoveredByEvidence(claim: string, evidence: Evidence[]): boolean {
    if (evidence.length === 0) return false;

    const claimKeywords = this.extractKeywords(claim);
    if (claimKeywords.length === 0) return evidence.length > 0;

    // Check if evidence content covers claim keywords
    const allEvidenceContent = evidence.map((e) => e.content.toLowerCase()).join(' ');

    let matchedKeywords = 0;
    for (const keyword of claimKeywords) {
      if (allEvidenceContent.includes(keyword.toLowerCase())) {
        matchedKeywords++;
      }
    }

    // Require at least 50% keyword coverage
    return matchedKeywords / claimKeywords.length >= 0.5;
  }

  /**
   * Extract keywords from text for matching
   */
  private extractKeywords(text: string): string[] {
    // Remove common words and extract significant terms
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'dare',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'as',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'between',
      'under',
      'again',
      'further',
      'then',
      'once',
      'here',
      'there',
      'when',
      'where',
      'why',
      'how',
      'all',
      'each',
      'few',
      'more',
      'most',
      'other',
      'some',
      'such',
      'no',
      'nor',
      'not',
      'only',
      'own',
      'same',
      'so',
      'than',
      'too',
      'very',
      'just',
      'and',
      'but',
      'if',
      'or',
      'because',
      'until',
      'while',
      'this',
      'that',
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));

    // Return unique keywords
    return [...new Set(words)];
  }

  /**
   * Extract sub-claims from evidence content
   */
  private extractSubClaims(content: string): string[] {
    const claims: string[] = [];

    // Look for assertion patterns
    const patterns = [
      /(?:found|discovered|detected|identified)\s+(.+?)(?:\.|$)/gi,
      /(?:the file|the function|the class)\s+['"`]?(\S+)['"`]?\s+(?:contains|has|includes)/gi,
      /(?:created|modified|updated|deleted)\s+(.+?)(?:\.|$)/gi,
      /(?:verified|confirmed|validated)\s+that\s+(.+?)(?:\.|$)/gi,
    ];

    for (const pattern of patterns) {
      for (let match = pattern.exec(content); match !== null; match = pattern.exec(content)) {
        const claim = match[1]?.trim();
        if (claim && claim.length > 10 && claim.length < 200) {
          claims.push(claim);
        }
      }
    }

    return claims;
  }

  /**
   * Calculate trust score for a chain
   */
  private calculateTrustScore(chain: EvidenceChain, gaps: string[]): number {
    let score = 1.0;

    // Penalize for gaps
    score -= gaps.length * 0.15;

    // Reward evidence diversity
    const evidenceTypes = new Set(chain.evidence.map((e) => e.type));
    score += (evidenceTypes.size - 1) * 0.05; // Bonus for multiple types

    // Reward multiple agents
    const uniqueAgents = new Set(chain.evidence.map((e) => e.agentId));
    score += (uniqueAgents.size - 1) * 0.05; // Bonus for cross-agent evidence

    // Penalize stale chains
    const chainAge = Date.now() - chain.createdAt;
    if (chainAge > this.config.maxChainAge) {
      score -= 0.1;
    }

    // Bonus for sufficient evidence
    if (chain.evidence.length >= this.config.minEvidenceRequired) {
      score += 0.1;
    }

    // Bonus for file-based evidence (most concrete)
    const fileEvidence = chain.evidence.filter(
      (e) => e.type === 'file_read' || e.type === 'file_write',
    );
    if (fileEvidence.length > 0) {
      score += 0.1;
    }

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Build detailed analysis for validation
   */
  private buildDetailedAnalysis(
    chain: EvidenceChain,
    _gaps: string[],
    warnings: string[],
  ): ChainAnalysisDetails {
    const evidenceByType: Record<EvidenceType, number> = {
      file_read: 0,
      file_write: 0,
      command: 0,
      mcp_call: 0,
      agent_output: 0,
    };

    for (const evidence of chain.evidence) {
      evidenceByType[evidence.type]++;
    }

    const timestamps = chain.evidence.map((e) => e.timestamp);
    const timeSpan = timestamps.length > 1 ? Math.max(...timestamps) - Math.min(...timestamps) : 0;

    const claimStatus: ClaimEvidenceStatus[] = [
      {
        claim: chain.claim,
        hasEvidence: this.isClaimCoveredByEvidence(chain.claim, chain.evidence),
        supportingEvidence: chain.evidence.filter((e) =>
          this.isClaimCoveredByEvidence(chain.claim, [e]),
        ),
        confidence: this.isClaimCoveredByEvidence(chain.claim, chain.evidence) ? 0.8 : 0.2,
      },
      ...chain.subClaims.map((subClaim) => ({
        claim: subClaim,
        hasEvidence: this.isClaimCoveredByEvidence(subClaim, chain.evidence),
        supportingEvidence: chain.evidence.filter((e) =>
          this.isClaimCoveredByEvidence(subClaim, [e]),
        ),
        confidence: this.isClaimCoveredByEvidence(subClaim, chain.evidence) ? 0.7 : 0.1,
      })),
    ];

    return {
      uniqueAgents: new Set(chain.evidence.map((e) => e.agentId)).size,
      timeSpan,
      evidenceByType,
      claimStatus,
      warnings,
    };
  }

  /**
   * Log validation result for debugging
   */
  private logValidationResult(chainId: string, validation: ChainValidation): void {
    const status = validation.isComplete ? chalk.green('[COMPLETE]') : chalk.red('[INCOMPLETE]');
    console.log(chalk.cyan(`\n[EvidenceChain] Validation for ${chainId}:`));
    console.log(`  Status: ${status}`);
    console.log(chalk.gray(`  Evidence count: ${validation.evidenceCount}`));
    console.log(chalk.gray(`  Trust score: ${(validation.trustScore * 100).toFixed(1)}%`));

    if (validation.gaps.length > 0) {
      console.log(chalk.yellow('  Gaps:'));
      for (const gap of validation.gaps) {
        console.log(chalk.yellow(`    - ${gap}`));
      }
    }

    if (validation.details?.warnings && validation.details.warnings.length > 0) {
      console.log(chalk.yellow('  Warnings:'));
      for (const warning of validation.details.warnings) {
        console.log(chalk.yellow(`    - ${warning}`));
      }
    }
  }
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick function to start a chain and get the ID
 */
export function startEvidenceChain(taskId: number, claim: string): string {
  return evidenceChainTracker.startChain(taskId, claim);
}

/**
 * Quick function to add evidence to a chain
 */
export function addEvidenceToChain(chainId: string, evidence: Evidence): void {
  evidenceChainTracker.addEvidence(chainId, evidence);
}

/**
 * Quick function to validate a chain
 */
export function validateEvidenceChain(chainId: string): ChainValidation {
  return evidenceChainTracker.validateChain(chainId);
}

/**
 * Quick function to get task trust score
 */
export function getTaskEvidenceTrustScore(taskId: number): number {
  return evidenceChainTracker.getTaskTrustScore(taskId);
}

/**
 * Create evidence from a file read operation
 */
export function createFileReadEvidence(
  agentId: string,
  filePath: string,
  content: string,
): Evidence {
  return {
    type: 'file_read',
    content: `Read file: ${filePath}\nContent preview: ${content.substring(0, 500)}...`,
    timestamp: Date.now(),
    agentId,
    filePath,
  };
}

/**
 * Create evidence from a file write operation
 */
export function createFileWriteEvidence(
  agentId: string,
  filePath: string,
  content: string,
): Evidence {
  return {
    type: 'file_write',
    content: `Wrote to file: ${filePath}\nContent preview: ${content.substring(0, 500)}...`,
    timestamp: Date.now(),
    agentId,
    filePath,
  };
}

/**
 * Create evidence from a command execution
 */
export function createCommandEvidence(agentId: string, command: string, output: string): Evidence {
  return {
    type: 'command',
    content: `Executed: ${command}\nOutput: ${output.substring(0, 1000)}`,
    timestamp: Date.now(),
    agentId,
    command,
  };
}

/**
 * Create evidence from an MCP tool call
 */
export function createMcpCallEvidence(agentId: string, toolName: string, result: string): Evidence {
  return {
    type: 'mcp_call',
    content: `MCP tool: ${toolName}\nResult: ${result.substring(0, 1000)}`,
    timestamp: Date.now(),
    agentId,
    mcpTool: toolName,
  };
}

/**
 * Create evidence from another agent's output
 */
export function createAgentOutputEvidence(
  agentId: string,
  sourceAgentId: string,
  output: string,
): Evidence {
  return {
    type: 'agent_output',
    content: `Agent ${sourceAgentId} output: ${output.substring(0, 1000)}`,
    timestamp: Date.now(),
    agentId,
  };
}

// =============================================================================
// DEFAULT INSTANCE & EXPORT
// =============================================================================

/**
 * Default instance for convenience
 */
export const evidenceChainTracker = new EvidenceChainTracker();

export default EvidenceChainTracker;

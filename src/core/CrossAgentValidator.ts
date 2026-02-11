/**
 * CrossAgentValidator - Solution 31: Cross-Agent Validation
 *
 * Validates that multiple agents agree on key facts before accepting them.
 * This helps detect hallucinations and inconsistencies across agent outputs.
 *
 * Claim Types:
 * - file_modified: Files that were claimed to be modified
 * - function_created: Functions/classes that were claimed to be created
 * - test_passed: Tests that were claimed to pass
 * - error_found: Errors that were identified
 * - dependency_added: Dependencies that were added
 * - config_changed: Configuration changes made
 *
 * Usage in Swarm.ts Phase D:
 * ```typescript
 * import { crossAgentValidator } from './CrossAgentValidator.js';
 *
 * // During execution, each agent registers their claims
 * crossAgentValidator.registerAgentClaim('geralt', 1, 'src/utils.ts', 'file_modified');
 * crossAgentValidator.registerAgentClaim('yennefer', 2, 'src/utils.ts', 'file_modified');
 *
 * // In Phase D, validate consensus
 * const fileConsensus = crossAgentValidator.validateConsensus('file_modified');
 * if (!fileConsensus.hasConsensus) {
 *   console.warn('Agents disagree on modified files:', fileConsensus.conflictingClaims);
 * }
 * ```
 */

/**
 * Supported claim types that agents can make
 */
export type ClaimType =
  | 'file_modified'
  | 'function_created'
  | 'test_passed'
  | 'error_found'
  | 'dependency_added'
  | 'config_changed'
  | 'file_read'
  | 'command_executed';

/**
 * Individual claim made by an agent
 */
export interface AgentClaim {
  agentId: string;
  taskId: number;
  claim: string;
  claimType: ClaimType;
  timestamp: number;
  confidence?: number; // Optional confidence score 0-100
}

/**
 * Result of consensus validation for a claim type
 */
export interface ConsensusResult {
  /** Whether consensus was reached (2+ agents agree) */
  hasConsensus: boolean;
  /** Agreement level as percentage (0-100) */
  agreementLevel: number;
  /** Claims where agents disagree on the same topic */
  conflictingClaims: string[];
  /** Map of agent IDs to their claimed values for this type */
  agentVotes: Map<string, string>;
  /** Claims that have 2+ agents agreeing */
  agreedClaims: string[];
  /** Claims with only single agent (unverified) */
  unverifiedClaims: string[];
  /** Total number of unique claims */
  totalClaims: number;
  /** Number of agents who made claims of this type */
  participatingAgents: number;
}

/**
 * Overall validation summary across all claim types
 */
export interface ValidationSummary {
  /** Overall consensus score (0-100) */
  overallScore: number;
  /** Whether the overall validation passed */
  isValid: boolean;
  /** Results by claim type */
  resultsByType: Map<ClaimType, ConsensusResult>;
  /** All detected conflicts */
  allConflicts: Array<{
    claimType: ClaimType;
    claim: string;
    agents: string[];
    values: string[];
  }>;
  /** Warnings for unverified claims */
  warnings: string[];
}

/**
 * CrossAgentValidator class for multi-agent consensus validation
 */
export class CrossAgentValidator {
  /** Storage for all agent claims */
  private claims: AgentClaim[] = [];

  /** Index of claims by type for fast lookup */
  private claimsByType: Map<ClaimType, AgentClaim[]> = new Map();

  /** Index of claims by claim value for detecting duplicates */
  private claimsByValue: Map<string, AgentClaim[]> = new Map();

  /** Minimum agents required for consensus */
  private readonly MIN_CONSENSUS_AGENTS = 2;

  /** Threshold for agreement level to consider consensus valid */
  private readonly CONSENSUS_THRESHOLD = 50; // 50%

  constructor() {
    this.reset();
  }

  /**
   * Reset all claims (call between swarm executions)
   */
  reset(): void {
    this.claims = [];
    this.claimsByType = new Map();
    this.claimsByValue = new Map();

    // Initialize claim type buckets
    const claimTypes: ClaimType[] = [
      'file_modified',
      'function_created',
      'test_passed',
      'error_found',
      'dependency_added',
      'config_changed',
      'file_read',
      'command_executed',
    ];

    for (const type of claimTypes) {
      this.claimsByType.set(type, []);
    }
  }

  /**
   * Register a claim made by an agent
   *
   * @param agentId - The agent making the claim (e.g., 'geralt', 'yennefer')
   * @param taskId - The task ID this claim relates to
   * @param claim - The actual claim value (e.g., 'src/utils.ts', 'calculateTotal()')
   * @param claimType - The type of claim being made
   * @param confidence - Optional confidence score 0-100
   */
  registerAgentClaim(
    agentId: string,
    taskId: number,
    claim: string,
    claimType: ClaimType | string,
    confidence?: number,
  ): void {
    // Normalize claim type
    const normalizedType = this.normalizeClaimType(claimType);

    // Normalize claim value (lowercase, trim, standardize paths)
    const normalizedClaim = this.normalizeClaim(claim, normalizedType);

    const agentClaim: AgentClaim = {
      agentId: agentId.toLowerCase(),
      taskId,
      claim: normalizedClaim,
      claimType: normalizedType,
      timestamp: Date.now(),
      confidence: confidence ?? 80, // Default confidence
    };

    // Add to main claims array
    this.claims.push(agentClaim);

    // Index by type
    if (!this.claimsByType.has(normalizedType)) {
      this.claimsByType.set(normalizedType, []);
    }
    this.claimsByType.get(normalizedType)?.push(agentClaim);

    // Index by claim value (for detecting duplicates/agreements)
    const claimKey = `${normalizedType}:${normalizedClaim}`;
    if (!this.claimsByValue.has(claimKey)) {
      this.claimsByValue.set(claimKey, []);
    }
    this.claimsByValue.get(claimKey)?.push(agentClaim);
  }

  /**
   * Validate consensus for a specific claim type
   *
   * @param claimType - The type of claims to validate
   * @returns ConsensusResult with agreement analysis
   */
  validateConsensus(claimType: ClaimType | string): ConsensusResult {
    const normalizedType = this.normalizeClaimType(claimType);
    const typeClaims = this.claimsByType.get(normalizedType) || [];

    // Get unique agents who made claims of this type
    const agentVotes = new Map<string, string>();
    const claimCounts = new Map<string, Set<string>>(); // claim -> set of agents

    for (const claim of typeClaims) {
      // Track agent votes
      const existing = agentVotes.get(claim.agentId);
      if (!existing) {
        agentVotes.set(claim.agentId, claim.claim);
      } else {
        // Agent made multiple claims - append
        if (!existing.includes(claim.claim)) {
          agentVotes.set(claim.agentId, `${existing}, ${claim.claim}`);
        }
      }

      // Track claim counts
      if (!claimCounts.has(claim.claim)) {
        claimCounts.set(claim.claim, new Set());
      }
      claimCounts.get(claim.claim)?.add(claim.agentId);
    }

    // Find agreed claims (2+ agents)
    const agreedClaims: string[] = [];
    const unverifiedClaims: string[] = [];
    const conflictingClaims: string[] = [];

    for (const [claim, agents] of claimCounts) {
      if (agents.size >= this.MIN_CONSENSUS_AGENTS) {
        agreedClaims.push(claim);
      } else {
        unverifiedClaims.push(claim);
      }
    }

    // Detect conflicts - find contradictory claims about the same entity
    const conflicts = this.detectConflicts(typeClaims);
    conflictingClaims.push(...conflicts);

    // Calculate agreement level
    const totalClaims = claimCounts.size;
    const participatingAgents = agentVotes.size;
    let agreementLevel = 0;

    if (totalClaims > 0) {
      // Agreement level = (agreed claims / total claims) * 100
      // Plus bonus for multiple agents confirming same claim
      const agreedCount = agreedClaims.length;
      agreementLevel = Math.round((agreedCount / totalClaims) * 100);

      // Penalty for conflicts
      const conflictPenalty = conflictingClaims.length * 10;
      agreementLevel = Math.max(0, agreementLevel - conflictPenalty);
    }

    // Determine if consensus reached
    const hasConsensus =
      conflictingClaims.length === 0 &&
      agreementLevel >= this.CONSENSUS_THRESHOLD &&
      (agreedClaims.length > 0 || totalClaims === 0);

    return {
      hasConsensus,
      agreementLevel,
      conflictingClaims,
      agentVotes,
      agreedClaims,
      unverifiedClaims,
      totalClaims,
      participatingAgents,
    };
  }

  /**
   * Validate consensus across all claim types and produce summary
   *
   * @returns ValidationSummary with overall analysis
   */
  validateAll(): ValidationSummary {
    const resultsByType = new Map<ClaimType, ConsensusResult>();
    const allConflicts: ValidationSummary['allConflicts'] = [];
    const warnings: string[] = [];

    let totalScore = 0;
    let typeCount = 0;

    // Validate each claim type
    const claimTypes: ClaimType[] = [
      'file_modified',
      'function_created',
      'test_passed',
      'error_found',
      'dependency_added',
      'config_changed',
      'file_read',
      'command_executed',
    ];

    for (const type of claimTypes) {
      const result = this.validateConsensus(type);
      resultsByType.set(type, result);

      // Only count types with claims
      if (result.totalClaims > 0) {
        totalScore += result.agreementLevel;
        typeCount++;

        // Collect conflicts
        if (result.conflictingClaims.length > 0) {
          for (const claim of result.conflictingClaims) {
            allConflicts.push({
              claimType: type,
              claim,
              agents: Array.from(result.agentVotes.keys()),
              values: Array.from(result.agentVotes.values()),
            });
          }
        }

        // Add warnings for unverified claims
        for (const unverified of result.unverifiedClaims) {
          warnings.push(`[${type}] Unverified claim (single agent): "${unverified}"`);
        }
      }
    }

    // Calculate overall score
    const overallScore = typeCount > 0 ? Math.round(totalScore / typeCount) : 100; // No claims = no conflicts

    // Determine if overall validation passes
    const isValid = allConflicts.length === 0 && overallScore >= this.CONSENSUS_THRESHOLD;

    return {
      overallScore,
      isValid,
      resultsByType,
      allConflicts,
      warnings,
    };
  }

  /**
   * Extract claims automatically from execution result content
   *
   * @param agentId - Agent that produced the result
   * @param taskId - Task ID
   * @param content - Result content to analyze
   */
  extractClaimsFromResult(agentId: string, taskId: number, content: string): void {
    if (!content) return;

    // Extract file modifications
    const fileModPatterns = [
      /===ZAPIS===\s*([^\n]+)/gi,
      /(?:zapisano|zapisuje|modyfikuj\u0119|zmodyfikowa\u0142em)\s+(?:plik\s+)?([a-zA-Z0-9_\-/.]+\.[a-zA-Z]+)/gi,
      /(?:wrote|writing|modified|updated)\s+(?:file\s+)?([a-zA-Z0-9_\-/.]+\.[a-zA-Z]+)/gi,
    ];

    for (const pattern of fileModPatterns) {
      for (let match = pattern.exec(content); match !== null; match = pattern.exec(content)) {
        this.registerAgentClaim(agentId, taskId, match[1], 'file_modified');
      }
    }

    // Extract file reads
    const fileReadPatterns = [
      /(?:odczyta\u0142em|czytam|wczytuj\u0119)\s+(?:plik\s+)?([a-zA-Z0-9_\-/.]+\.[a-zA-Z]+)/gi,
      /(?:read|reading|loaded)\s+(?:file\s+)?([a-zA-Z0-9_\-/.]+\.[a-zA-Z]+)/gi,
      /EXEC:\s*(?:type|cat)\s+"?([^"\n]+)"?/gi,
    ];

    for (const pattern of fileReadPatterns) {
      for (let match = pattern.exec(content); match !== null; match = pattern.exec(content)) {
        this.registerAgentClaim(agentId, taskId, match[1], 'file_read');
      }
    }

    // Extract function/class creations
    const funcPatterns = [
      /(?:stworzy\u0142em|dodat\u0142em|zaimplementowa\u0142em)\s+(?:funkcj\u0119|metod\u0119|klas\u0119)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      /(?:created|added|implemented)\s+(?:function|method|class)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
      /(?:export\s+)?(?:function|class|interface|type)\s+([A-Z][a-zA-Z0-9_]*)/g,
    ];

    for (const pattern of funcPatterns) {
      for (let match = pattern.exec(content); match !== null; match = pattern.exec(content)) {
        this.registerAgentClaim(agentId, taskId, match[1], 'function_created');
      }
    }

    // Extract test results
    const testPatterns = [
      /(?:test\s+)?['"]([^'"]+)['"]\s+(?:przeszed\u0142|passed)/gi,
      /(?:test|spec)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:\u2713|passed|ok)/gi,
      /PASS\s+([a-zA-Z0-9_\-/.]+\.(?:test|spec)\.[a-zA-Z]+)/gi,
    ];

    for (const pattern of testPatterns) {
      for (let match = pattern.exec(content); match !== null; match = pattern.exec(content)) {
        this.registerAgentClaim(agentId, taskId, match[1], 'test_passed');
      }
    }

    // Extract errors found
    const errorPatterns = [
      /(?:b\u0142\u0105d|error|exception):\s*([^\n]+)/gi,
      /(?:znalaz\u0142em|wykry\u0142em|found)\s+(?:b\u0142\u0105d|error):\s*([^\n]+)/gi,
      /(?:FAIL|ERROR)\s+([^\n]+)/gi,
    ];

    for (const pattern of errorPatterns) {
      for (let match = pattern.exec(content); match !== null; match = pattern.exec(content)) {
        this.registerAgentClaim(agentId, taskId, match[1].trim(), 'error_found');
      }
    }

    // Extract command executions
    const cmdPatterns = [
      /EXEC:\s*([^\n]+)/gi,
      /\$\s+([^\n]+)/gi,
      />\s+(npm|npx|node|tsc|git|yarn|pnpm)\s+[^\n]+/gi,
    ];

    for (const pattern of cmdPatterns) {
      for (let match = pattern.exec(content); match !== null; match = pattern.exec(content)) {
        this.registerAgentClaim(agentId, taskId, match[1].trim(), 'command_executed');
      }
    }
  }

  /**
   * Get all claims by a specific agent
   */
  getAgentClaims(agentId: string): AgentClaim[] {
    return this.claims.filter((c) => c.agentId === agentId.toLowerCase());
  }

  /**
   * Get all claims for a specific task
   */
  getTaskClaims(taskId: number): AgentClaim[] {
    return this.claims.filter((c) => c.taskId === taskId);
  }

  /**
   * Get statistics about current claims
   */
  getStats(): {
    totalClaims: number;
    claimsByType: Record<string, number>;
    agentParticipation: Record<string, number>;
  } {
    const claimsByType: Record<string, number> = {};
    const agentParticipation: Record<string, number> = {};

    for (const [type, claims] of this.claimsByType) {
      claimsByType[type] = claims.length;
    }

    for (const claim of this.claims) {
      agentParticipation[claim.agentId] = (agentParticipation[claim.agentId] || 0) + 1;
    }

    return {
      totalClaims: this.claims.length,
      claimsByType,
      agentParticipation,
    };
  }

  // =========================================
  // Private Helper Methods
  // =========================================

  /**
   * Normalize claim type to valid ClaimType
   */
  private normalizeClaimType(type: string): ClaimType {
    const normalized = type.toLowerCase().replace(/[^a-z_]/g, '_');

    const validTypes: ClaimType[] = [
      'file_modified',
      'function_created',
      'test_passed',
      'error_found',
      'dependency_added',
      'config_changed',
      'file_read',
      'command_executed',
    ];

    if (validTypes.includes(normalized as ClaimType)) {
      return normalized as ClaimType;
    }

    // Map common variations
    const typeMap: Record<string, ClaimType> = {
      file: 'file_modified',
      modified: 'file_modified',
      written: 'file_modified',
      wrote: 'file_modified',
      function: 'function_created',
      class: 'function_created',
      interface: 'function_created',
      created: 'function_created',
      test: 'test_passed',
      passed: 'test_passed',
      error: 'error_found',
      fail: 'error_found',
      dependency: 'dependency_added',
      config: 'config_changed',
      read: 'file_read',
      command: 'command_executed',
      exec: 'command_executed',
    };

    return typeMap[normalized] || 'file_modified';
  }

  /**
   * Normalize claim value for comparison
   */
  private normalizeClaim(claim: string, type: ClaimType): string {
    let normalized = claim.trim();

    // Normalize file paths
    if (type === 'file_modified' || type === 'file_read') {
      // Convert backslashes to forward slashes
      normalized = normalized.replace(/\\/g, '/');
      // Remove leading ./ or /
      normalized = normalized.replace(/^\.?\/?/, '');
      // Lowercase for comparison
      normalized = normalized.toLowerCase();
    }

    // Normalize function names
    if (type === 'function_created') {
      // Keep original case for functions
      normalized = normalized.trim();
      // Remove parentheses if present
      normalized = normalized.replace(/\(\)$/, '');
    }

    return normalized;
  }

  /**
   * Detect conflicts in claims of same type
   * Conflicts occur when agents claim different things about same entity
   */
  private detectConflicts(claims: AgentClaim[]): string[] {
    const conflicts: string[] = [];

    // Group claims by base entity (e.g., same file, same function name)
    const entityClaims = new Map<string, AgentClaim[]>();

    for (const claim of claims) {
      const baseEntity = this.extractBaseEntity(claim.claim, claim.claimType);
      if (!entityClaims.has(baseEntity)) {
        entityClaims.set(baseEntity, []);
      }
      entityClaims.get(baseEntity)?.push(claim);
    }

    // Check for conflicts within same entity
    for (const [entity, entityClaimList] of entityClaims) {
      // Get unique agents
      const uniqueAgents = new Set(entityClaimList.map((c) => c.agentId));

      // If multiple agents claim different things about same entity
      if (uniqueAgents.size > 1) {
        const claimValues = new Set(entityClaimList.map((c) => c.claim));

        // If there are different claim values from different agents
        if (claimValues.size > 1 && this.isConflict(entityClaimList)) {
          conflicts.push(`Conflict on ${entity}: ${Array.from(claimValues).join(' vs ')}`);
        }
      }
    }

    return conflicts;
  }

  /**
   * Extract base entity from claim for conflict detection
   */
  private extractBaseEntity(claim: string, type: ClaimType): string {
    if (type === 'file_modified' || type === 'file_read') {
      // Extract filename without extension
      const match = claim.match(/([^/\\]+)\.[a-zA-Z]+$/);
      return match ? match[1].toLowerCase() : claim.toLowerCase();
    }

    if (type === 'function_created') {
      // Use function name as base entity
      return claim.toLowerCase();
    }

    // Default: use claim as-is
    return claim.toLowerCase();
  }

  /**
   * Determine if a set of claims represents a conflict
   */
  private isConflict(claims: AgentClaim[]): boolean {
    // For file_modified: conflict if agents claim different versions
    // For function_created: conflict if agents claim different implementations
    // For test_passed vs error_found: conflict if same test

    const types = new Set(claims.map((c) => c.claimType));

    // Different types for same entity = potential conflict
    if (types.has('test_passed') && types.has('error_found')) {
      return true;
    }

    // Multiple different claims about same file content = conflict
    if (types.size === 1 && types.has('file_modified')) {
      const agents = new Set(claims.map((c) => c.agentId));
      return agents.size > 1; // Multiple agents modifying same file
    }

    return false;
  }
}

// Singleton instance for use across the application
export const crossAgentValidator = new CrossAgentValidator();

// Export default for convenience
export default crossAgentValidator;

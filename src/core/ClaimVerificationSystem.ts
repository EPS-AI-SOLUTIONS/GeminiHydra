/**
 * ClaimVerificationSystem - Solution 42: Claim Verification System
 *
 * Verifies specific claims made by agents against available evidence.
 * Cross-references claims with actual file system operations, command execution
 * results, and other agent claims for Phase D verification.
 */

import chalk from 'chalk';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

/**
 * Types of claims that can be registered
 */
export enum ClaimType {
  FILE_CREATED = 'file_created',
  FILE_MODIFIED = 'file_modified',
  CODE_ADDED = 'code_added',
  BUG_FIXED = 'bug_fixed',
  TEST_PASSED = 'test_passed',
  COMMAND_RUN = 'command_run',
  ERROR_FOUND = 'error_found',
}

/**
 * A claim made by an agent
 */
export interface Claim {
  /** The content/description of the claim */
  content: string;
  /** ID of the agent making the claim */
  agentId: string;
  /** Task ID associated with this claim */
  taskId: number;
  /** Type of claim being made */
  claimType: ClaimType;
  /** Optional evidence supporting the claim */
  evidence?: string[];
}

/**
 * Internal representation of a registered claim
 */
interface RegisteredClaim extends Claim {
  /** Unique identifier for this claim */
  claimId: string;
  /** Timestamp when claim was registered */
  registeredAt: Date;
  /** Current verification status */
  status: VerificationStatus;
  /** Number of verification attempts */
  verificationAttempts: number;
  /** Related claim IDs */
  relatedClaims: string[];
}

/**
 * Status of verification
 */
export type VerificationStatus = 'pending' | 'verified' | 'unverified' | 'contradicted' | 'partial';

/**
 * Result of claim verification
 */
export interface VerificationResult {
  /** Whether the claim was verified */
  verified: boolean;
  /** Confidence level (0-1) */
  confidence: number;
  /** Evidence supporting the claim */
  evidence: string[];
  /** Any contradictions found */
  contradictions: string[];
  /** Overall status */
  status: VerificationStatus;
}

/**
 * Context provided for verification
 */
export interface VerificationContext {
  /** File system state (paths that exist) */
  fileSystemState?: string[];
  /** Command execution results */
  commandResults?: CommandResult[];
  /** Other agent claims for cross-reference */
  otherAgentClaims?: Claim[];
  /** MCP operation logs */
  mcpOperations?: MCPOperation[];
  /** Git status/diff information */
  gitStatus?: GitStatus;
  /** Test execution results */
  testResults?: TestResult[];
  /** Error logs */
  errorLogs?: ErrorLog[];
}

/**
 * Result of a command execution
 */
export interface CommandResult {
  /** The command that was run */
  command: string;
  /** Exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Timestamp of execution */
  timestamp: Date;
}

/**
 * MCP operation log entry
 */
export interface MCPOperation {
  /** Type of operation */
  operation: 'read' | 'write' | 'create' | 'delete' | 'execute' | 'list';
  /** Target path or resource */
  target: string;
  /** Whether operation succeeded */
  success: boolean;
  /** Timestamp */
  timestamp: Date;
  /** Additional details */
  details?: string;
}

/**
 * Git repository status
 */
export interface GitStatus {
  /** Modified files */
  modifiedFiles: string[];
  /** Newly created files */
  createdFiles: string[];
  /** Deleted files */
  deletedFiles: string[];
  /** Current branch */
  branch: string;
  /** Last commit hash */
  lastCommit?: string;
}

/**
 * Test execution result
 */
export interface TestResult {
  /** Test name/identifier */
  testName: string;
  /** Whether test passed */
  passed: boolean;
  /** Error message if failed */
  error?: string;
  /** Duration in ms */
  duration: number;
}

/**
 * Error log entry
 */
export interface ErrorLog {
  /** Error message */
  message: string;
  /** Stack trace */
  stack?: string;
  /** Timestamp */
  timestamp: Date;
  /** Source file */
  source?: string;
}

/**
 * Configuration for the verification system
 */
export interface ClaimVerificationConfig {
  /** Minimum confidence threshold for verification (0-1) */
  minConfidenceThreshold?: number;
  /** Enable cross-agent claim validation */
  enableCrossAgentValidation?: boolean;
  /** Enable strict file verification */
  strictFileVerification?: boolean;
  /** Maximum age of claims to consider (in ms) */
  maxClaimAge?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Statistics about verification activity
 */
export interface VerificationStats {
  /** Total claims registered */
  totalClaims: number;
  /** Claims verified */
  verifiedClaims: number;
  /** Claims unverified */
  unverifiedClaims: number;
  /** Claims contradicted */
  contradictedClaims: number;
  /** Claims partially verified */
  partialClaims: number;
  /** Claims pending */
  pendingClaims: number;
  /** Verification rate */
  verificationRate: number;
  /** Average confidence */
  averageConfidence: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: Required<ClaimVerificationConfig> = {
  minConfidenceThreshold: 0.7,
  enableCrossAgentValidation: true,
  strictFileVerification: true,
  maxClaimAge: 3600000, // 1 hour
  debug: false,
};

// =============================================================================
// CLAIM VERIFICATION SYSTEM CLASS
// =============================================================================

/**
 * ClaimVerificationSystem - Verifies agent claims against available evidence
 */
export class ClaimVerificationSystem {
  private claims: Map<string, RegisteredClaim> = new Map();
  private config: Required<ClaimVerificationConfig>;
  private claimCounter: number = 0;

  constructor(config: ClaimVerificationConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // PUBLIC METHODS
  // ===========================================================================

  /**
   * Register a new claim from an agent
   * @param claim The claim to register
   * @returns The unique claim ID
   */
  registerClaim(claim: Claim): string {
    const claimId = this.generateClaimId(claim);

    const registeredClaim: RegisteredClaim = {
      ...claim,
      claimId,
      registeredAt: new Date(),
      status: 'pending',
      verificationAttempts: 0,
      relatedClaims: this.findRelatedClaims(claim),
    };

    this.claims.set(claimId, registeredClaim);

    if (this.config.debug) {
      console.log(chalk.cyan(`[ClaimVerification] Registered claim ${claimId}:`));
      console.log(chalk.gray(`  Agent: ${claim.agentId}, Task: ${claim.taskId}`));
      console.log(chalk.gray(`  Type: ${claim.claimType}`));
      console.log(chalk.gray(`  Content: ${claim.content.substring(0, 100)}...`));
    }

    return claimId;
  }

  /**
   * Verify a claim against available evidence
   * @param claimId The ID of the claim to verify
   * @param verificationContext Context containing evidence for verification
   * @returns The verification result
   */
  verifyClaim(claimId: string, verificationContext: VerificationContext): VerificationResult {
    const claim = this.claims.get(claimId);

    if (!claim) {
      return {
        verified: false,
        confidence: 0,
        evidence: [],
        contradictions: [`Claim ${claimId} not found`],
        status: 'unverified',
      };
    }

    claim.verificationAttempts++;

    // Dispatch to type-specific verification
    let result: VerificationResult;

    switch (claim.claimType) {
      case ClaimType.FILE_CREATED:
        result = this.verifyFileCreated(claim, verificationContext);
        break;
      case ClaimType.FILE_MODIFIED:
        result = this.verifyFileModified(claim, verificationContext);
        break;
      case ClaimType.CODE_ADDED:
        result = this.verifyCodeAdded(claim, verificationContext);
        break;
      case ClaimType.BUG_FIXED:
        result = this.verifyBugFixed(claim, verificationContext);
        break;
      case ClaimType.TEST_PASSED:
        result = this.verifyTestPassed(claim, verificationContext);
        break;
      case ClaimType.COMMAND_RUN:
        result = this.verifyCommandRun(claim, verificationContext);
        break;
      case ClaimType.ERROR_FOUND:
        result = this.verifyErrorFound(claim, verificationContext);
        break;
      default:
        result = this.genericVerification(claim, verificationContext);
    }

    // Cross-agent validation
    if (this.config.enableCrossAgentValidation && verificationContext.otherAgentClaims) {
      result = this.crossValidateWithOtherAgents(
        claim,
        result,
        verificationContext.otherAgentClaims,
      );
    }

    // Update claim status
    claim.status = result.status;

    if (this.config.debug) {
      this.logVerificationResult(claimId, result);
    }

    return result;
  }

  /**
   * Batch verify multiple claims
   * @param claimIds Array of claim IDs to verify
   * @param verificationContext Shared verification context
   * @returns Map of claim IDs to verification results
   */
  batchVerify(
    claimIds: string[],
    verificationContext: VerificationContext,
  ): Map<string, VerificationResult> {
    const results = new Map<string, VerificationResult>();

    for (const claimId of claimIds) {
      results.set(claimId, this.verifyClaim(claimId, verificationContext));
    }

    return results;
  }

  /**
   * Get all claims for a specific task
   * @param taskId The task ID
   * @returns Array of registered claims
   */
  getClaimsByTask(taskId: number): RegisteredClaim[] {
    return Array.from(this.claims.values()).filter((claim) => claim.taskId === taskId);
  }

  /**
   * Get all claims by a specific agent
   * @param agentId The agent ID
   * @returns Array of registered claims
   */
  getClaimsByAgent(agentId: string): RegisteredClaim[] {
    return Array.from(this.claims.values()).filter((claim) => claim.agentId === agentId);
  }

  /**
   * Get all pending claims
   * @returns Array of pending claims
   */
  getPendingClaims(): RegisteredClaim[] {
    return Array.from(this.claims.values()).filter((claim) => claim.status === 'pending');
  }

  /**
   * Get verification statistics
   * @returns Verification stats
   */
  getStats(): VerificationStats {
    const allClaims = Array.from(this.claims.values());
    const verified = allClaims.filter((c) => c.status === 'verified');
    const unverified = allClaims.filter((c) => c.status === 'unverified');
    const contradicted = allClaims.filter((c) => c.status === 'contradicted');
    const partial = allClaims.filter((c) => c.status === 'partial');
    const pending = allClaims.filter((c) => c.status === 'pending');

    const totalVerified = verified.length + partial.length * 0.5;
    const totalAttempted = allClaims.length - pending.length;

    return {
      totalClaims: allClaims.length,
      verifiedClaims: verified.length,
      unverifiedClaims: unverified.length,
      contradictedClaims: contradicted.length,
      partialClaims: partial.length,
      pendingClaims: pending.length,
      verificationRate: totalAttempted > 0 ? totalVerified / totalAttempted : 0,
      averageConfidence: this.calculateAverageConfidence(),
    };
  }

  /**
   * Clear all claims
   */
  clearClaims(): void {
    this.claims.clear();
    this.claimCounter = 0;
  }

  /**
   * Remove old claims beyond the max age
   */
  pruneOldClaims(): number {
    const cutoffTime = Date.now() - this.config.maxClaimAge;
    let pruned = 0;

    for (const [claimId, claim] of this.claims) {
      if (claim.registeredAt.getTime() < cutoffTime) {
        this.claims.delete(claimId);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Update configuration
   * @param config New configuration options
   */
  setConfig(config: Partial<ClaimVerificationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   * @returns Current config
   */
  getConfig(): Required<ClaimVerificationConfig> {
    return { ...this.config };
  }

  // ===========================================================================
  // PRIVATE VERIFICATION METHODS
  // ===========================================================================

  /**
   * Verify a file_created claim
   */
  private verifyFileCreated(
    claim: RegisteredClaim,
    context: VerificationContext,
  ): VerificationResult {
    const evidence: string[] = [];
    const contradictions: string[] = [];
    let confidence = 0;

    // Extract file path from claim content
    const filePath = this.extractFilePath(claim.content);

    if (!filePath) {
      return {
        verified: false,
        confidence: 0,
        evidence: [],
        contradictions: ['Could not extract file path from claim'],
        status: 'unverified',
      };
    }

    // Check file system state
    if (context.fileSystemState) {
      if (context.fileSystemState.includes(filePath)) {
        evidence.push(`File exists in file system: ${filePath}`);
        confidence += 0.4;
      } else {
        contradictions.push(`File not found in file system: ${filePath}`);
      }
    }

    // Check MCP operations
    if (context.mcpOperations) {
      const createOp = context.mcpOperations.find(
        (op) => op.operation === 'create' && op.target === filePath && op.success,
      );
      if (createOp) {
        evidence.push(`MCP create operation found for: ${filePath}`);
        confidence += 0.3;
      }

      const writeOp = context.mcpOperations.find(
        (op) => op.operation === 'write' && op.target === filePath && op.success,
      );
      if (writeOp) {
        evidence.push(`MCP write operation found for: ${filePath}`);
        confidence += 0.2;
      }
    }

    // Check Git status
    if (context.gitStatus) {
      if (context.gitStatus.createdFiles.includes(filePath)) {
        evidence.push(`File appears in Git as new: ${filePath}`);
        confidence += 0.1;
      }
    }

    // Add claim's own evidence
    if (claim.evidence) {
      evidence.push(...claim.evidence.map((e) => `Claim evidence: ${e}`));
    }

    return this.buildResult(confidence, evidence, contradictions);
  }

  /**
   * Verify a file_modified claim
   */
  private verifyFileModified(
    claim: RegisteredClaim,
    context: VerificationContext,
  ): VerificationResult {
    const evidence: string[] = [];
    const contradictions: string[] = [];
    let confidence = 0;

    const filePath = this.extractFilePath(claim.content);

    if (!filePath) {
      return {
        verified: false,
        confidence: 0,
        evidence: [],
        contradictions: ['Could not extract file path from claim'],
        status: 'unverified',
      };
    }

    // Check MCP operations
    if (context.mcpOperations) {
      const writeOps = context.mcpOperations.filter(
        (op) => op.operation === 'write' && op.target === filePath && op.success,
      );
      if (writeOps.length > 0) {
        evidence.push(`Found ${writeOps.length} MCP write operation(s) for: ${filePath}`);
        confidence += 0.4;
      }
    }

    // Check Git status
    if (context.gitStatus) {
      if (context.gitStatus.modifiedFiles.includes(filePath)) {
        evidence.push(`File appears in Git as modified: ${filePath}`);
        confidence += 0.4;
      }
    }

    // Check file exists
    if (context.fileSystemState?.includes(filePath)) {
      evidence.push(`File exists: ${filePath}`);
      confidence += 0.1;
    } else if (context.fileSystemState) {
      contradictions.push(`File does not exist: ${filePath}`);
    }

    if (claim.evidence) {
      evidence.push(...claim.evidence.map((e) => `Claim evidence: ${e}`));
      confidence += 0.1;
    }

    return this.buildResult(confidence, evidence, contradictions);
  }

  /**
   * Verify a code_added claim
   */
  private verifyCodeAdded(
    claim: RegisteredClaim,
    context: VerificationContext,
  ): VerificationResult {
    const evidence: string[] = [];
    const contradictions: string[] = [];
    let confidence = 0;

    // Check for write operations
    if (context.mcpOperations) {
      const writeOps = context.mcpOperations.filter((op) => op.operation === 'write' && op.success);
      if (writeOps.length > 0) {
        evidence.push(`Found ${writeOps.length} write operation(s) that may contain added code`);
        confidence += 0.3;
      }
    }

    // Check Git for modifications
    if (context.gitStatus) {
      const changedFiles = [...context.gitStatus.modifiedFiles, ...context.gitStatus.createdFiles];
      if (changedFiles.length > 0) {
        evidence.push(`Git shows ${changedFiles.length} changed file(s)`);
        confidence += 0.3;
      }
    }

    // Look for code patterns in claim content
    const codePatterns = /function|class|const|let|var|import|export|def|fn\s+/i;
    if (codePatterns.test(claim.content)) {
      evidence.push('Claim content contains code-related keywords');
      confidence += 0.2;
    }

    if (claim.evidence) {
      evidence.push(...claim.evidence.map((e) => `Claim evidence: ${e}`));
      confidence += 0.2;
    }

    return this.buildResult(confidence, evidence, contradictions);
  }

  /**
   * Verify a bug_fixed claim
   */
  private verifyBugFixed(claim: RegisteredClaim, context: VerificationContext): VerificationResult {
    const evidence: string[] = [];
    const contradictions: string[] = [];
    let confidence = 0;

    // Check for successful tests
    if (context.testResults) {
      const passedTests = context.testResults.filter((t) => t.passed);
      const failedTests = context.testResults.filter((t) => !t.passed);

      if (passedTests.length > 0 && failedTests.length === 0) {
        evidence.push(`All ${passedTests.length} test(s) passing`);
        confidence += 0.4;
      } else if (failedTests.length > 0) {
        contradictions.push(`${failedTests.length} test(s) still failing`);
      }
    }

    // Check for file modifications
    if (context.mcpOperations) {
      const writeOps = context.mcpOperations.filter((op) => op.operation === 'write' && op.success);
      if (writeOps.length > 0) {
        evidence.push(`Found ${writeOps.length} file modification(s) that may contain fix`);
        confidence += 0.2;
      }
    }

    // Check for no recent errors
    if (context.errorLogs) {
      const recentErrors = context.errorLogs.filter(
        (e) => Date.now() - e.timestamp.getTime() < 300000, // 5 minutes
      );
      if (recentErrors.length === 0) {
        evidence.push('No recent errors in logs');
        confidence += 0.2;
      } else {
        contradictions.push(`Found ${recentErrors.length} recent error(s) in logs`);
      }
    }

    if (claim.evidence) {
      evidence.push(...claim.evidence.map((e) => `Claim evidence: ${e}`));
      confidence += 0.2;
    }

    return this.buildResult(confidence, evidence, contradictions);
  }

  /**
   * Verify a test_passed claim
   */
  private verifyTestPassed(
    claim: RegisteredClaim,
    context: VerificationContext,
  ): VerificationResult {
    const evidence: string[] = [];
    const contradictions: string[] = [];
    let confidence = 0;

    // Extract test name if possible
    const testNameMatch = claim.content.match(/test\s+['"`]?([^'"`\s]+)['"`]?/i);
    const testName = testNameMatch ? testNameMatch[1] : null;

    if (context.testResults) {
      if (testName) {
        // Look for specific test
        const matchingTest = context.testResults.find((t) =>
          t.testName.toLowerCase().includes(testName.toLowerCase()),
        );
        if (matchingTest) {
          if (matchingTest.passed) {
            evidence.push(`Test "${matchingTest.testName}" passed in ${matchingTest.duration}ms`);
            confidence += 0.8;
          } else {
            contradictions.push(`Test "${matchingTest.testName}" failed: ${matchingTest.error}`);
          }
        }
      } else {
        // General test check
        const passedCount = context.testResults.filter((t) => t.passed).length;
        const totalCount = context.testResults.length;
        if (passedCount === totalCount && totalCount > 0) {
          evidence.push(`All ${totalCount} test(s) passed`);
          confidence += 0.6;
        } else if (passedCount > 0) {
          evidence.push(`${passedCount}/${totalCount} test(s) passed`);
          confidence += 0.3;
        }
      }
    }

    // Check command results for test commands
    if (context.commandResults) {
      const testCommands = context.commandResults.filter((c) =>
        /test|jest|mocha|vitest|pytest|cargo test|go test/i.test(c.command),
      );
      for (const cmd of testCommands) {
        if (cmd.exitCode === 0) {
          evidence.push(`Test command succeeded: ${cmd.command.substring(0, 50)}`);
          confidence += 0.2;
        } else {
          contradictions.push(`Test command failed with exit code ${cmd.exitCode}`);
        }
      }
    }

    if (claim.evidence) {
      evidence.push(...claim.evidence.map((e) => `Claim evidence: ${e}`));
    }

    return this.buildResult(confidence, evidence, contradictions);
  }

  /**
   * Verify a command_run claim
   */
  private verifyCommandRun(
    claim: RegisteredClaim,
    context: VerificationContext,
  ): VerificationResult {
    const evidence: string[] = [];
    const contradictions: string[] = [];
    let confidence = 0;

    // Extract command from claim
    const commandMatch = claim.content.match(/`([^`]+)`|'([^']+)'|"([^"]+)"|ran\s+(\S+)/i);
    const commandPattern = commandMatch
      ? commandMatch[1] || commandMatch[2] || commandMatch[3] || commandMatch[4]
      : null;

    if (context.commandResults) {
      if (commandPattern) {
        // Look for matching command
        const matchingCmd = context.commandResults.find((c) => c.command.includes(commandPattern));
        if (matchingCmd) {
          evidence.push(
            `Found matching command execution: ${matchingCmd.command.substring(0, 100)}`,
          );
          confidence += 0.5;
          if (matchingCmd.exitCode === 0) {
            evidence.push(`Command completed successfully (exit code 0)`);
            confidence += 0.3;
          } else {
            evidence.push(`Command exited with code ${matchingCmd.exitCode}`);
            confidence += 0.2;
          }
        } else {
          contradictions.push(`No matching command found for pattern: ${commandPattern}`);
        }
      } else {
        // Just check if any commands were run
        if (context.commandResults.length > 0) {
          evidence.push(`Found ${context.commandResults.length} command execution(s)`);
          confidence += 0.3;
        }
      }
    }

    // Check MCP execute operations
    if (context.mcpOperations) {
      const execOps = context.mcpOperations.filter((op) => op.operation === 'execute');
      if (execOps.length > 0) {
        evidence.push(`Found ${execOps.length} MCP execute operation(s)`);
        confidence += 0.2;
      }
    }

    if (claim.evidence) {
      evidence.push(...claim.evidence.map((e) => `Claim evidence: ${e}`));
    }

    return this.buildResult(confidence, evidence, contradictions);
  }

  /**
   * Verify an error_found claim
   */
  private verifyErrorFound(
    claim: RegisteredClaim,
    context: VerificationContext,
  ): VerificationResult {
    const evidence: string[] = [];
    const contradictions: string[] = [];
    let confidence = 0;

    // Check error logs
    if (context.errorLogs && context.errorLogs.length > 0) {
      evidence.push(`Found ${context.errorLogs.length} error(s) in logs`);
      confidence += 0.4;

      // Look for matching error message
      const errorPattern = claim.content.toLowerCase();
      const matchingError = context.errorLogs.find(
        (e) =>
          e.message.toLowerCase().includes(errorPattern) ||
          errorPattern.includes(e.message.toLowerCase().substring(0, 50)),
      );
      if (matchingError) {
        evidence.push(`Found matching error: ${matchingError.message.substring(0, 100)}`);
        confidence += 0.3;
      }
    }

    // Check command results for errors
    if (context.commandResults) {
      const failedCmds = context.commandResults.filter((c) => c.exitCode !== 0);
      if (failedCmds.length > 0) {
        evidence.push(`Found ${failedCmds.length} failed command(s)`);
        confidence += 0.2;
      }

      // Check stderr
      const stderrCmds = context.commandResults.filter((c) => c.stderr && c.stderr.length > 0);
      if (stderrCmds.length > 0) {
        evidence.push(`Found ${stderrCmds.length} command(s) with stderr output`);
        confidence += 0.1;
      }
    }

    // Check test results for failures
    if (context.testResults) {
      const failedTests = context.testResults.filter((t) => !t.passed);
      if (failedTests.length > 0) {
        evidence.push(`Found ${failedTests.length} failing test(s)`);
        confidence += 0.2;
      }
    }

    if (claim.evidence) {
      evidence.push(...claim.evidence.map((e) => `Claim evidence: ${e}`));
    }

    return this.buildResult(confidence, evidence, contradictions);
  }

  /**
   * Generic verification for unknown claim types
   */
  private genericVerification(
    claim: RegisteredClaim,
    context: VerificationContext,
  ): VerificationResult {
    const evidence: string[] = [];
    const contradictions: string[] = [];
    let confidence = 0;

    // Basic checks
    if (claim.evidence && claim.evidence.length > 0) {
      evidence.push(...claim.evidence.map((e) => `Claim evidence: ${e}`));
      confidence += 0.3;
    }

    // Check for any MCP activity
    if (context.mcpOperations && context.mcpOperations.length > 0) {
      const successfulOps = context.mcpOperations.filter((op) => op.success);
      if (successfulOps.length > 0) {
        evidence.push(`Found ${successfulOps.length} successful MCP operation(s)`);
        confidence += 0.2;
      }
    }

    // Check for any command activity
    if (context.commandResults && context.commandResults.length > 0) {
      evidence.push(`Found ${context.commandResults.length} command execution(s)`);
      confidence += 0.1;
    }

    return this.buildResult(confidence, evidence, contradictions);
  }

  /**
   * Cross-validate claim with other agent claims
   */
  private crossValidateWithOtherAgents(
    claim: RegisteredClaim,
    currentResult: VerificationResult,
    otherClaims: Claim[],
  ): VerificationResult {
    const evidence = [...currentResult.evidence];
    const contradictions = [...currentResult.contradictions];
    let confidence = currentResult.confidence;

    // Find corroborating claims from other agents
    const corroboratingClaims = otherClaims.filter(
      (other) =>
        other.agentId !== claim.agentId &&
        other.taskId === claim.taskId &&
        this.claimsRelated(claim, other),
    );

    if (corroboratingClaims.length > 0) {
      evidence.push(`${corroboratingClaims.length} other agent(s) made similar claims`);
      confidence = Math.min(1.0, confidence + 0.1 * corroboratingClaims.length);
    }

    // Find contradicting claims
    const contradictingClaims = otherClaims.filter(
      (other) =>
        other.agentId !== claim.agentId &&
        other.taskId === claim.taskId &&
        this.claimsContradict(claim, other),
    );

    if (contradictingClaims.length > 0) {
      contradictions.push(`${contradictingClaims.length} other agent(s) made contradicting claims`);
      confidence = Math.max(0, confidence - 0.15 * contradictingClaims.length);
    }

    return this.buildResult(confidence, evidence, contradictions);
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Generate a unique claim ID
   */
  private generateClaimId(claim: Claim): string {
    this.claimCounter++;
    const timestamp = Date.now().toString(36);
    const counter = this.claimCounter.toString(36).padStart(4, '0');
    return `clm_${claim.agentId}_${claim.taskId}_${timestamp}_${counter}`;
  }

  /**
   * Find related claims in the registry
   */
  private findRelatedClaims(claim: Claim): string[] {
    const related: string[] = [];

    for (const [id, existing] of this.claims) {
      if (existing.taskId === claim.taskId && existing.agentId !== claim.agentId) {
        if (this.claimsRelated(claim, existing)) {
          related.push(id);
        }
      }
    }

    return related;
  }

  /**
   * Check if two claims are related
   */
  private claimsRelated(claim1: Claim, claim2: Claim): boolean {
    // Same claim type for same task
    if (claim1.claimType === claim2.claimType) {
      return true;
    }

    // Related claim types
    const relatedTypes: Record<ClaimType, ClaimType[]> = {
      [ClaimType.FILE_CREATED]: [ClaimType.CODE_ADDED, ClaimType.FILE_MODIFIED],
      [ClaimType.FILE_MODIFIED]: [ClaimType.CODE_ADDED, ClaimType.BUG_FIXED],
      [ClaimType.CODE_ADDED]: [ClaimType.FILE_CREATED, ClaimType.FILE_MODIFIED],
      [ClaimType.BUG_FIXED]: [ClaimType.TEST_PASSED, ClaimType.FILE_MODIFIED],
      [ClaimType.TEST_PASSED]: [ClaimType.BUG_FIXED],
      [ClaimType.COMMAND_RUN]: [ClaimType.TEST_PASSED, ClaimType.ERROR_FOUND],
      [ClaimType.ERROR_FOUND]: [ClaimType.BUG_FIXED],
    };

    return relatedTypes[claim1.claimType]?.includes(claim2.claimType) ?? false;
  }

  /**
   * Check if two claims contradict each other
   */
  private claimsContradict(claim1: Claim, claim2: Claim): boolean {
    // Opposing claim types
    const oppositions: Record<ClaimType, ClaimType[]> = {
      [ClaimType.BUG_FIXED]: [ClaimType.ERROR_FOUND],
      [ClaimType.TEST_PASSED]: [ClaimType.ERROR_FOUND],
      [ClaimType.ERROR_FOUND]: [ClaimType.BUG_FIXED, ClaimType.TEST_PASSED],
      [ClaimType.FILE_CREATED]: [],
      [ClaimType.FILE_MODIFIED]: [],
      [ClaimType.CODE_ADDED]: [],
      [ClaimType.COMMAND_RUN]: [],
    };

    return oppositions[claim1.claimType]?.includes(claim2.claimType) ?? false;
  }

  /**
   * Extract file path from claim content
   */
  private extractFilePath(content: string): string | null {
    // Common patterns for file paths
    const patterns = [
      /['"`]([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)['"`]/,
      /file\s+([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i,
      /created?\s+([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i,
      /modified?\s+([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i,
      /([a-zA-Z0-9_-]+\/[a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/,
      /([a-zA-Z]:\\[a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i,
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Build a verification result from components
   */
  private buildResult(
    confidence: number,
    evidence: string[],
    contradictions: string[],
  ): VerificationResult {
    // Cap confidence
    confidence = Math.min(1.0, Math.max(0, confidence));

    // Determine status
    let status: VerificationStatus;
    if (contradictions.length > 0 && evidence.length === 0) {
      status = 'contradicted';
    } else if (contradictions.length > 0 && evidence.length > 0) {
      status = 'partial';
    } else if (confidence >= this.config.minConfidenceThreshold) {
      status = 'verified';
    } else if (evidence.length > 0) {
      status = 'partial';
    } else {
      status = 'unverified';
    }

    return {
      verified: status === 'verified',
      confidence,
      evidence,
      contradictions,
      status,
    };
  }

  /**
   * Calculate average confidence across all verified claims
   */
  private calculateAverageConfidence(): number {
    const verifiedClaims = Array.from(this.claims.values()).filter(
      (c) => c.status === 'verified' || c.status === 'partial',
    );

    if (verifiedClaims.length === 0) return 0;

    // We need to re-verify to get confidence, or store it
    // For simplicity, assume average based on status
    let totalConfidence = 0;
    for (const claim of verifiedClaims) {
      switch (claim.status) {
        case 'verified':
          totalConfidence += 0.9;
          break;
        case 'partial':
          totalConfidence += 0.5;
          break;
        default:
          break;
      }
    }

    return totalConfidence / verifiedClaims.length;
  }

  /**
   * Log verification result
   */
  private logVerificationResult(claimId: string, result: VerificationResult): void {
    const statusColor = {
      verified: chalk.green,
      unverified: chalk.red,
      contradicted: chalk.red,
      partial: chalk.yellow,
      pending: chalk.gray,
    };

    const color = statusColor[result.status] || chalk.white;

    console.log(chalk.cyan(`[ClaimVerification] Result for ${claimId}:`));
    console.log(color(`  Status: ${result.status.toUpperCase()}`));
    console.log(chalk.gray(`  Confidence: ${(result.confidence * 100).toFixed(1)}%`));

    if (result.evidence.length > 0) {
      console.log(chalk.green('  Evidence:'));
      for (const e of result.evidence) console.log(chalk.gray(`    - ${e}`));
    }

    if (result.contradictions.length > 0) {
      console.log(chalk.red('  Contradictions:'));
      for (const c of result.contradictions) console.log(chalk.gray(`    - ${c}`));
    }
  }
}

// =============================================================================
// SINGLETON & CONVENIENCE FUNCTIONS
// =============================================================================

/** Default instance */
export const claimVerificationSystem = new ClaimVerificationSystem();

/**
 * Register a claim using the default instance
 */
export function registerClaim(claim: Claim): string {
  return claimVerificationSystem.registerClaim(claim);
}

/**
 * Verify a claim using the default instance
 */
export function verifyClaim(claimId: string, context: VerificationContext): VerificationResult {
  return claimVerificationSystem.verifyClaim(claimId, context);
}

/**
 * Get verification stats from the default instance
 */
export function getVerificationStats(): VerificationStats {
  return claimVerificationSystem.getStats();
}

/**
 * Log verification summary
 */
export function logVerificationSummary(): void {
  const stats = claimVerificationSystem.getStats();

  console.log(chalk.cyan('\n[ClaimVerification] Summary:'));
  console.log(chalk.gray(`  Total claims: ${stats.totalClaims}`));
  console.log(chalk.green(`  Verified: ${stats.verifiedClaims}`));
  console.log(chalk.yellow(`  Partial: ${stats.partialClaims}`));
  console.log(chalk.red(`  Unverified: ${stats.unverifiedClaims}`));
  console.log(chalk.red(`  Contradicted: ${stats.contradictedClaims}`));
  console.log(chalk.gray(`  Pending: ${stats.pendingClaims}`));
  console.log(chalk.cyan(`  Verification rate: ${(stats.verificationRate * 100).toFixed(1)}%`));
  console.log(chalk.cyan(`  Average confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`));
}

// =============================================================================
// PHASE D VERIFICATION INTEGRATION
// =============================================================================

/**
 * Verify all claims for a task - used in Phase D
 * @param taskId The task to verify
 * @param context Verification context
 * @returns Map of claim IDs to results
 */
export function verifyTaskClaims(
  taskId: number,
  context: VerificationContext,
): Map<string, VerificationResult> {
  const claims = claimVerificationSystem.getClaimsByTask(taskId);
  const results = new Map<string, VerificationResult>();

  for (const claim of claims) {
    results.set(claim.claimId, claimVerificationSystem.verifyClaim(claim.claimId, context));
  }

  return results;
}

/**
 * Get Phase D verification report for a task
 */
export function getPhaseDVerificationReport(taskId: number): {
  taskId: number;
  totalClaims: number;
  verifiedClaims: number;
  issues: string[];
  overallConfidence: number;
  recommendation: 'accept' | 'review' | 'reject';
} {
  const claims = claimVerificationSystem.getClaimsByTask(taskId);
  const issues: string[] = [];
  let totalConfidence = 0;
  let verifiedCount = 0;

  for (const claim of claims) {
    if (claim.status === 'verified') {
      verifiedCount++;
      totalConfidence += 0.9;
    } else if (claim.status === 'partial') {
      totalConfidence += 0.5;
      issues.push(`Partial verification: ${claim.content.substring(0, 50)}...`);
    } else if (claim.status === 'contradicted') {
      issues.push(`Contradicted claim: ${claim.content.substring(0, 50)}...`);
    } else if (claim.status === 'unverified') {
      issues.push(`Unverified claim: ${claim.content.substring(0, 50)}...`);
    }
  }

  const overallConfidence = claims.length > 0 ? totalConfidence / claims.length : 0;
  const verificationRate = claims.length > 0 ? verifiedCount / claims.length : 0;

  let recommendation: 'accept' | 'review' | 'reject';
  if (verificationRate >= 0.8 && overallConfidence >= 0.7) {
    recommendation = 'accept';
  } else if (verificationRate >= 0.5 || overallConfidence >= 0.5) {
    recommendation = 'review';
  } else {
    recommendation = 'reject';
  }

  return {
    taskId,
    totalClaims: claims.length,
    verifiedClaims: verifiedCount,
    issues,
    overallConfidence,
    recommendation,
  };
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default ClaimVerificationSystem;

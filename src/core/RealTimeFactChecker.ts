/**
 * RealTimeFactChecker - Solution 46: Real-Time Fact Verification
 *
 * Performs real-time verification of claims during agent execution.
 * Validates claims against actual file system state, executed commands,
 * and outputs from other agents in the swarm.
 *
 * Integration: Used by GraphProcessor.ts during Phase B execution
 * to verify agent claims before accepting them as facts.
 */

import chalk from 'chalk';
import { logger } from './LiveLogger.js';

// =============================================================================
// INTERFACES & TYPES
// =============================================================================

/**
 * Result of a fact check operation
 */
export interface FactCheckResult {
  /** Whether the claim was verified as true */
  verified: boolean;
  /** Confidence level (0.0 - 1.0) */
  confidence: number;
  /** Source of verification (e.g., "fileSystem", "commandLog", "agentConsensus") */
  source?: string;
  /** Any contradicting evidence found */
  contradicts?: string[];
  /** Timestamp when the check was performed */
  timestamp: number;
  /** The original claim that was checked */
  claim?: string;
  /** Additional details about the check */
  details?: string;
}

/**
 * Context for performing fact checks
 */
export interface CheckContext {
  /** Map of file paths to their existence status */
  fileSystem: Map<string, boolean>;
  /** List of commands that have been executed */
  executedCommands: string[];
  /** Map of agent task IDs to their outputs */
  agentOutputs: Map<number, string>;
  /** Optional: File contents cache for content verification */
  fileContents?: Map<string, string>;
  /** Optional: MCP tool call log */
  mcpCalls?: MCPCallRecord[];
  /** Optional: Error log for the session */
  errorLog?: ErrorRecord[];
}

/**
 * Record of an MCP tool call
 */
export interface MCPCallRecord {
  /** Tool name that was called */
  tool: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
  /** Whether the call succeeded */
  success: boolean;
  /** Timestamp of the call */
  timestamp: number;
  /** Result or error message */
  result?: string;
}

/**
 * Record of an error during execution
 */
export interface ErrorRecord {
  /** Error message */
  message: string;
  /** Source of the error (agent, command, etc.) */
  source: string;
  /** Timestamp when the error occurred */
  timestamp: number;
  /** Whether the error was recovered from */
  recovered: boolean;
}

/**
 * Configuration for the fact checker
 */
export interface FactCheckerConfig {
  /** Minimum confidence threshold for verification (0.0 - 1.0) */
  minConfidenceThreshold: number;
  /** Enable debug logging */
  debug: boolean;
  /** Maximum age of claims to consider (in ms) */
  maxClaimAge: number;
  /** Enable cross-agent validation */
  enableCrossAgentValidation: boolean;
  /** Strict mode - require explicit evidence */
  strictMode: boolean;
}

/**
 * Claim types for categorization
 */
export enum ClaimCategory {
  FILE_EXISTS = 'file_exists',
  FILE_CREATED = 'file_created',
  FILE_MODIFIED = 'file_modified',
  COMMAND_EXECUTED = 'command_executed',
  AGENT_OUTPUT = 'agent_output',
  CODE_SYNTAX = 'code_syntax',
  DEPENDENCY = 'dependency',
  GENERAL = 'general',
}

/**
 * Internal tracking entry for a fact check
 */
interface FactCheckEntry {
  /** Unique ID for this check */
  checkId: string;
  /** Task ID this check belongs to */
  taskId: number;
  /** The claim being checked */
  claim: string;
  /** Category of the claim */
  category: ClaimCategory;
  /** Result of the check */
  result: FactCheckResult;
  /** When the check was performed */
  checkedAt: Date;
}

/**
 * Statistics for the fact checker
 */
export interface FactCheckerStats {
  /** Total checks performed */
  totalChecks: number;
  /** Verified claims */
  verifiedClaims: number;
  /** Unverified claims */
  unverifiedClaims: number;
  /** Contradicted claims */
  contradictedClaims: number;
  /** Average confidence */
  averageConfidence: number;
  /** Verification rate */
  verificationRate: number;
  /** Checks by category */
  checksByCategory: Record<ClaimCategory, number>;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: FactCheckerConfig = {
  minConfidenceThreshold: 0.6,
  debug: false,
  maxClaimAge: 3600000, // 1 hour
  enableCrossAgentValidation: true,
  strictMode: false,
};

// =============================================================================
// CLAIM DETECTION PATTERNS
// =============================================================================

/**
 * Patterns for detecting different types of claims
 */
const CLAIM_PATTERNS = {
  fileExists: [
    /file\s+['"`]?([^'"`\s]+)['"`]?\s+exists/i,
    /exists?\s+(?:at|in)?\s*['"`]?([^'"`\s]+)['"`]?/i,
    /found\s+(?:file|path)?\s*['"`]?([^'"`\s]+)['"`]?/i,
    /['"`]([^'"`\s]+\.[a-z0-9]+)['"`]\s+is\s+(?:present|available)/i,
  ],
  fileCreated: [
    /created?\s+(?:file|directory)?\s*['"`]?([^'"`\s]+)['"`]?/i,
    /wrote\s+(?:to|file)?\s*['"`]?([^'"`\s]+)['"`]?/i,
    /generated?\s+['"`]?([^'"`\s]+)['"`]?/i,
    /added\s+(?:new\s+)?file\s+['"`]?([^'"`\s]+)['"`]?/i,
  ],
  fileModified: [
    /modified?\s+['"`]?([^'"`\s]+)['"`]?/i,
    /updated?\s+['"`]?([^'"`\s]+)['"`]?/i,
    /changed?\s+['"`]?([^'"`\s]+)['"`]?/i,
    /edited?\s+['"`]?([^'"`\s]+)['"`]?/i,
  ],
  commandExecuted: [
    /(?:ran|executed?|run)\s+[`'"]([^`'"]+)[`'"]/i,
    /command\s+[`'"]([^`'"]+)[`'"]\s+(?:completed|succeeded|finished)/i,
    /\$\s*([a-z0-9_-]+(?:\s+[^\n]+)?)/i,
    /(?:npm|yarn|pnpm|cargo|go|pip|python)\s+[a-z]+/i,
  ],
  agentClaimed: [
    /agent\s+#?(\d+)\s+(?:said|claimed|reported|output)/i,
    /task\s+#?(\d+)\s+(?:result|output|response)/i,
    /according\s+to\s+(?:agent|task)\s+#?(\d+)/i,
  ],
};

// =============================================================================
// REAL-TIME FACT CHECKER CLASS
// =============================================================================

/**
 * RealTimeFactChecker - Performs real-time verification of claims during agent execution
 */
export class RealTimeFactChecker {
  private config: FactCheckerConfig;
  private checkLog: Map<number, FactCheckEntry[]> = new Map();
  private activeTaskIds: Set<number> = new Set();
  private checkCounter: number = 0;

  constructor(config: Partial<FactCheckerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // PUBLIC METHODS
  // ===========================================================================

  /**
   * Start checking for a specific task
   * Initializes the check log for the task
   * @param taskId The task ID to start checking for
   */
  startChecking(taskId: number): void {
    if (!this.checkLog.has(taskId)) {
      this.checkLog.set(taskId, []);
    }
    this.activeTaskIds.add(taskId);

    if (this.config.debug) {
      logger.system(`[FactChecker] Started checking for task ${taskId}`);
    }
  }

  /**
   * Stop checking for a specific task
   * @param taskId The task ID to stop checking for
   */
  stopChecking(taskId: number): void {
    this.activeTaskIds.delete(taskId);

    if (this.config.debug) {
      logger.system(`[FactChecker] Stopped checking for task ${taskId}`);
    }
  }

  /**
   * Check a claim against the current context
   * @param claim The claim to verify
   * @param context The current execution context
   * @param taskId Optional task ID to associate with the check
   * @returns The fact check result
   */
  checkClaim(claim: string, context: CheckContext, taskId?: number): FactCheckResult {
    const _timestamp = Date.now();
    const category = this.categorizeClam(claim);

    let result: FactCheckResult;

    switch (category) {
      case ClaimCategory.FILE_EXISTS:
      case ClaimCategory.FILE_CREATED:
      case ClaimCategory.FILE_MODIFIED:
        result = this.checkFileSystemClaim(claim, context, category);
        break;
      case ClaimCategory.COMMAND_EXECUTED:
        result = this.checkCommandClaim(claim, context);
        break;
      case ClaimCategory.AGENT_OUTPUT:
        result = this.checkAgentOutputClaim(claim, context);
        break;
      default:
        result = this.checkGeneralClaim(claim, context);
    }

    // Store the check result if we have a task ID
    if (taskId !== undefined) {
      this.recordCheck(taskId, claim, category, result);
    }

    if (this.config.debug) {
      this.logCheckResult(claim, result, category);
    }

    return result;
  }

  /**
   * Batch check multiple claims
   * @param claims Array of claims to check
   * @param context The current execution context
   * @param taskId Optional task ID
   * @returns Array of fact check results
   */
  batchCheckClaims(claims: string[], context: CheckContext, taskId?: number): FactCheckResult[] {
    return claims.map((claim) => this.checkClaim(claim, context, taskId));
  }

  /**
   * Extract and check claims from a text response
   * @param response The agent response text
   * @param context The current execution context
   * @param taskId Optional task ID
   * @returns Array of fact check results for detected claims
   */
  checkResponseClaims(response: string, context: CheckContext, taskId?: number): FactCheckResult[] {
    const claims = this.extractClaims(response);
    return this.batchCheckClaims(claims, context, taskId);
  }

  /**
   * Get the check log for a specific task
   * @param taskId The task ID
   * @returns Array of fact check results for the task
   */
  getCheckLog(taskId: number): FactCheckResult[] {
    const entries = this.checkLog.get(taskId) || [];
    return entries.map((entry) => entry.result);
  }

  /**
   * Get detailed check entries for a task
   * @param taskId The task ID
   * @returns Array of detailed fact check entries
   */
  getDetailedCheckLog(taskId: number): FactCheckEntry[] {
    return this.checkLog.get(taskId) || [];
  }

  /**
   * Get overall statistics
   * @returns Fact checker statistics
   */
  getStats(): FactCheckerStats {
    const allEntries = Array.from(this.checkLog.values()).flat();
    const verified = allEntries.filter((e) => e.result.verified);
    const unverified = allEntries.filter(
      (e) => !e.result.verified && (!e.result.contradicts || e.result.contradicts.length === 0),
    );
    const contradicted = allEntries.filter(
      (e) => e.result.contradicts && e.result.contradicts.length > 0,
    );

    const totalConfidence = allEntries.reduce((sum, e) => sum + e.result.confidence, 0);

    const checksByCategory: Record<ClaimCategory, number> = {
      [ClaimCategory.FILE_EXISTS]: 0,
      [ClaimCategory.FILE_CREATED]: 0,
      [ClaimCategory.FILE_MODIFIED]: 0,
      [ClaimCategory.COMMAND_EXECUTED]: 0,
      [ClaimCategory.AGENT_OUTPUT]: 0,
      [ClaimCategory.CODE_SYNTAX]: 0,
      [ClaimCategory.DEPENDENCY]: 0,
      [ClaimCategory.GENERAL]: 0,
    };

    for (const entry of allEntries) {
      checksByCategory[entry.category]++;
    }

    return {
      totalChecks: allEntries.length,
      verifiedClaims: verified.length,
      unverifiedClaims: unverified.length,
      contradictedClaims: contradicted.length,
      averageConfidence: allEntries.length > 0 ? totalConfidence / allEntries.length : 0,
      verificationRate: allEntries.length > 0 ? verified.length / allEntries.length : 0,
      checksByCategory,
    };
  }

  /**
   * Clear all check logs
   */
  clearAllLogs(): void {
    this.checkLog.clear();
    this.activeTaskIds.clear();
    this.checkCounter = 0;
  }

  /**
   * Clear check log for a specific task
   * @param taskId The task ID to clear
   */
  clearTaskLog(taskId: number): void {
    this.checkLog.delete(taskId);
    this.activeTaskIds.delete(taskId);
  }

  /**
   * Update configuration
   * @param config Partial configuration to update
   */
  setConfig(config: Partial<FactCheckerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   * @returns Current configuration
   */
  getConfig(): FactCheckerConfig {
    return { ...this.config };
  }

  /**
   * Check if a task is actively being checked
   * @param taskId The task ID
   * @returns Whether the task is being actively checked
   */
  isActiveTask(taskId: number): boolean {
    return this.activeTaskIds.has(taskId);
  }

  // ===========================================================================
  // SPECIFIC CLAIM VERIFICATION METHODS
  // ===========================================================================

  /**
   * Check file system related claims (exists, created, modified)
   */
  private checkFileSystemClaim(
    claim: string,
    context: CheckContext,
    category: ClaimCategory,
  ): FactCheckResult {
    const filePath = this.extractFilePath(claim);
    const contradicts: string[] = [];
    let verified = false;
    let confidence = 0;
    let source = 'fileSystem';
    let details = '';

    if (!filePath) {
      return {
        verified: false,
        confidence: 0,
        source: 'parse_error',
        contradicts: ['Could not extract file path from claim'],
        timestamp: Date.now(),
        claim,
        details: 'Failed to parse file path from claim text',
      };
    }

    // Check against fileSystem map
    const fileExists = context.fileSystem.get(filePath);

    if (category === ClaimCategory.FILE_EXISTS) {
      if (fileExists === true) {
        verified = true;
        confidence = 0.9;
        details = `File "${filePath}" confirmed to exist in file system map`;
      } else if (fileExists === false) {
        verified = false;
        contradicts.push(`File "${filePath}" does not exist in file system map`);
        confidence = 0.1;
        details = `File "${filePath}" explicitly marked as non-existent`;
      } else {
        // Unknown - not in map
        verified = false;
        confidence = 0.3;
        details = `File "${filePath}" status unknown (not in file system map)`;
      }
    } else if (
      category === ClaimCategory.FILE_CREATED ||
      category === ClaimCategory.FILE_MODIFIED
    ) {
      // For created/modified, we need to check MCP calls or commands
      if (context.mcpCalls) {
        const relevantCalls = context.mcpCalls.filter(
          (call) =>
            (call.tool.includes('write') ||
              call.tool.includes('create') ||
              call.tool.includes('edit')) &&
            call.success &&
            JSON.stringify(call.args).includes(filePath),
        );

        if (relevantCalls.length > 0) {
          verified = true;
          confidence = 0.85;
          source = 'mcpCalls';
          details = `Found ${relevantCalls.length} MCP write/create operation(s) for "${filePath}"`;
        }
      }

      // Also check executed commands
      if (!verified && context.executedCommands.length > 0) {
        const writeCommands = context.executedCommands.filter(
          (cmd) =>
            (cmd.includes('echo') && cmd.includes('>')) ||
            cmd.includes('touch') ||
            cmd.includes('mkdir') ||
            cmd.includes('cp ') ||
            cmd.includes('mv '),
        );

        if (writeCommands.some((cmd) => cmd.includes(filePath))) {
          verified = true;
          confidence = 0.7;
          source = 'executedCommands';
          details = `Found command that may have created/modified "${filePath}"`;
        }
      }

      // Finally check file existence
      if (!verified && fileExists === true) {
        verified = true;
        confidence = 0.5; // Lower confidence - file exists but we didn't see it created
        details = `File "${filePath}" exists but creation/modification not directly observed`;
      }
    }

    return {
      verified,
      confidence,
      source,
      contradicts: contradicts.length > 0 ? contradicts : undefined,
      timestamp: Date.now(),
      claim,
      details,
    };
  }

  /**
   * Check command execution claims
   */
  private checkCommandClaim(claim: string, context: CheckContext): FactCheckResult {
    const command = this.extractCommand(claim);
    const contradicts: string[] = [];
    let verified = false;
    let confidence = 0;
    let details = '';

    if (!command) {
      return {
        verified: false,
        confidence: 0,
        source: 'parse_error',
        contradicts: ['Could not extract command from claim'],
        timestamp: Date.now(),
        claim,
        details: 'Failed to parse command from claim text',
      };
    }

    // Check against executedCommands list
    const matchingCommands = context.executedCommands.filter((executed) => {
      // Exact match
      if (executed === command) return true;
      // Contains match (for partial commands)
      if (executed.includes(command) || command.includes(executed)) return true;
      // First word match (command name)
      const executedCmd = executed.split(/\s+/)[0];
      const claimedCmd = command.split(/\s+/)[0];
      return executedCmd === claimedCmd;
    });

    if (matchingCommands.length > 0) {
      verified = true;
      // Higher confidence for exact match
      const exactMatch = matchingCommands.some((m) => m === command);
      confidence = exactMatch ? 0.95 : 0.75;
      details = `Found matching command in execution log: "${matchingCommands[0]}"`;
    } else {
      // Check MCP calls for shell/exec operations
      if (context.mcpCalls) {
        const execCalls = context.mcpCalls.filter(
          (call) =>
            (call.tool.includes('shell') ||
              call.tool.includes('exec') ||
              call.tool.includes('command')) &&
            call.success,
        );

        if (execCalls.some((call) => JSON.stringify(call.args).includes(command.split(/\s+/)[0]))) {
          verified = true;
          confidence = 0.7;
          details = `Found related MCP shell/exec call`;
        }
      }

      if (!verified) {
        contradicts.push(`Command "${command}" not found in execution log`);
        details = `Command not found in ${context.executedCommands.length} recorded commands`;
      }
    }

    return {
      verified,
      confidence,
      source: 'executedCommands',
      contradicts: contradicts.length > 0 ? contradicts : undefined,
      timestamp: Date.now(),
      claim,
      details,
    };
  }

  /**
   * Check claims about other agent outputs
   */
  private checkAgentOutputClaim(claim: string, context: CheckContext): FactCheckResult {
    const agentIdMatch = claim.match(/(?:agent|task)\s*#?(\d+)/i);
    const contradicts: string[] = [];
    let verified = false;
    let confidence = 0;
    let details = '';

    if (!agentIdMatch) {
      return {
        verified: false,
        confidence: 0,
        source: 'parse_error',
        contradicts: ['Could not extract agent/task ID from claim'],
        timestamp: Date.now(),
        claim,
        details: 'Failed to parse agent/task ID from claim text',
      };
    }

    const taskId = parseInt(agentIdMatch[1], 10);
    const agentOutput = context.agentOutputs.get(taskId);

    if (agentOutput !== undefined) {
      // Agent output exists - check if claim content matches
      const claimContent = this.extractClaimContent(claim);

      if (claimContent && agentOutput.toLowerCase().includes(claimContent.toLowerCase())) {
        verified = true;
        confidence = 0.85;
        details = `Claim content found in agent #${taskId} output`;
      } else if (claimContent) {
        // Output exists but content doesn't match
        verified = false;
        confidence = 0.4;
        contradicts.push(`Claimed content not found in agent #${taskId} output`);
        details = `Agent #${taskId} output exists but claimed content not found`;
      } else {
        // Can't extract claim content but output exists
        verified = true;
        confidence = 0.6;
        details = `Agent #${taskId} has output (content verification not possible)`;
      }
    } else {
      contradicts.push(`No output found for agent/task #${taskId}`);
      details = `Agent #${taskId} not found in agentOutputs map`;
    }

    return {
      verified,
      confidence,
      source: 'agentOutputs',
      contradicts: contradicts.length > 0 ? contradicts : undefined,
      timestamp: Date.now(),
      claim,
      details,
    };
  }

  /**
   * Check general claims that don't fit specific categories
   */
  private checkGeneralClaim(claim: string, context: CheckContext): FactCheckResult {
    let verified = false;
    let confidence = 0.3; // Default low confidence for general claims
    const contradicts: string[] = [];
    let details = 'General claim - limited verification possible';

    // Check if claim mentions any known files
    for (const [filePath, exists] of context.fileSystem) {
      if (claim.includes(filePath)) {
        if (exists) {
          confidence += 0.2;
          details = `Claim mentions existing file: ${filePath}`;
        } else {
          contradicts.push(`Claim mentions non-existent file: ${filePath}`);
        }
      }
    }

    // Check if claim mentions any executed commands
    for (const cmd of context.executedCommands) {
      const cmdName = cmd.split(/\s+/)[0];
      if (claim.toLowerCase().includes(cmdName.toLowerCase())) {
        confidence += 0.15;
        details = `Claim references executed command: ${cmdName}`;
      }
    }

    // Check against error log for contradiction
    if (context.errorLog) {
      const relatedErrors = context.errorLog.filter(
        (err) =>
          claim.toLowerCase().includes(err.source.toLowerCase()) ||
          err.message.toLowerCase().includes(claim.toLowerCase().substring(0, 30)),
      );

      if (relatedErrors.length > 0 && !relatedErrors.some((e) => e.recovered)) {
        contradicts.push(`Related error found: ${relatedErrors[0].message}`);
        confidence = Math.max(0, confidence - 0.3);
      }
    }

    // Consider verified if confidence is above threshold
    verified = confidence >= this.config.minConfidenceThreshold;

    return {
      verified,
      confidence: Math.min(1, confidence),
      source: 'general',
      contradicts: contradicts.length > 0 ? contradicts : undefined,
      timestamp: Date.now(),
      claim,
      details,
    };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Categorize a claim based on its content
   */
  private categorizeClam(claim: string): ClaimCategory {
    const lowerClaim = claim.toLowerCase();

    // Check file existence patterns
    for (const pattern of CLAIM_PATTERNS.fileExists) {
      if (pattern.test(claim)) return ClaimCategory.FILE_EXISTS;
    }

    // Check file created patterns
    for (const pattern of CLAIM_PATTERNS.fileCreated) {
      if (pattern.test(claim)) return ClaimCategory.FILE_CREATED;
    }

    // Check file modified patterns
    for (const pattern of CLAIM_PATTERNS.fileModified) {
      if (pattern.test(claim)) return ClaimCategory.FILE_MODIFIED;
    }

    // Check command executed patterns
    for (const pattern of CLAIM_PATTERNS.commandExecuted) {
      if (pattern.test(claim)) return ClaimCategory.COMMAND_EXECUTED;
    }

    // Check agent output patterns
    for (const pattern of CLAIM_PATTERNS.agentClaimed) {
      if (pattern.test(claim)) return ClaimCategory.AGENT_OUTPUT;
    }

    // Check for code/syntax related keywords
    if (/\b(syntax|compile[sd]?|parsed?|valid|error|warning)\b/i.test(lowerClaim)) {
      return ClaimCategory.CODE_SYNTAX;
    }

    // Check for dependency related keywords
    if (/\b(depend|import|require|install|package|module)\b/i.test(lowerClaim)) {
      return ClaimCategory.DEPENDENCY;
    }

    return ClaimCategory.GENERAL;
  }

  /**
   * Extract file path from a claim
   */
  private extractFilePath(claim: string): string | null {
    const patterns = [
      /['"`]([a-zA-Z0-9_\-./\\:]+\.[a-zA-Z0-9]+)['"`]/,
      /file\s+['"`]?([a-zA-Z0-9_\-./\\:]+\.[a-zA-Z0-9]+)['"`]?/i,
      /(?:created?|modified?|updated?|wrote|exists?)\s+['"`]?([a-zA-Z0-9_\-./\\:]+\.[a-zA-Z0-9]+)['"`]?/i,
      /([a-zA-Z0-9_-]+\/[a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/,
      /([a-zA-Z]:\\[a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i,
      /(\.\/[a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/,
    ];

    for (const pattern of patterns) {
      const match = claim.match(pattern);
      if (match?.[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Extract command from a claim
   */
  private extractCommand(claim: string): string | null {
    const patterns = [
      /(?:ran|executed?|run)\s+[`'"]([^`'"]+)[`'"]/i,
      /command\s+[`'"]([^`'"]+)[`'"]/i,
      /`([^`]+)`/,
      /'([^']+)'/,
      /"([^"]+)"/,
    ];

    for (const pattern of patterns) {
      const match = claim.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    // Try to extract command-like patterns
    const cmdPattern =
      /\b(npm|yarn|pnpm|cargo|go|pip|python|node|npx|git|make|docker)\s+[a-z]+(?:\s+[^\n.,;]+)?/i;
    const cmdMatch = claim.match(cmdPattern);
    if (cmdMatch) {
      return cmdMatch[0].trim();
    }

    return null;
  }

  /**
   * Extract the core content of a claim (for matching against outputs)
   */
  private extractClaimContent(claim: string): string | null {
    // Remove common claim prefixes/suffixes
    const content = claim
      .replace(/(?:agent|task)\s*#?\d+\s*(?:said|claimed|reported|output)/gi, '')
      .replace(/according\s+to\s+(?:agent|task)\s*#?\d+/gi, '')
      .replace(/that\s+/gi, '')
      .trim();

    // Extract quoted content if present
    const quotedMatch = content.match(/['"`]([^'"`]+)['"`]/);
    if (quotedMatch) {
      return quotedMatch[1];
    }

    // Return the cleaned content if it's meaningful
    if (content.length > 10) {
      return content.substring(0, 100); // Limit length for matching
    }

    return null;
  }

  /**
   * Extract all claims from a response text
   */
  private extractClaims(response: string): string[] {
    const claims: string[] = [];
    const sentences = response.split(/[.!?]\s+/);

    for (const sentence of sentences) {
      // Check if sentence contains a claim-like pattern
      const hasClaimPattern = Object.values(CLAIM_PATTERNS).some((patterns) =>
        patterns.some((pattern) => pattern.test(sentence)),
      );

      if (hasClaimPattern) {
        claims.push(sentence.trim());
      }
    }

    return claims;
  }

  /**
   * Record a fact check in the log
   */
  private recordCheck(
    taskId: number,
    claim: string,
    category: ClaimCategory,
    result: FactCheckResult,
  ): void {
    if (!this.checkLog.has(taskId)) {
      this.checkLog.set(taskId, []);
    }

    this.checkCounter++;
    const entry: FactCheckEntry = {
      checkId: `fc_${taskId}_${this.checkCounter}_${Date.now().toString(36)}`,
      taskId,
      claim,
      category,
      result,
      checkedAt: new Date(),
    };

    this.checkLog.get(taskId)?.push(entry);
  }

  /**
   * Log a check result (debug mode)
   */
  private logCheckResult(claim: string, result: FactCheckResult, category: ClaimCategory): void {
    const statusIcon = result.verified ? chalk.green('[VERIFIED]') : chalk.red('[UNVERIFIED]');
    const confidenceColor =
      result.confidence >= 0.7 ? chalk.green : result.confidence >= 0.4 ? chalk.yellow : chalk.red;

    console.log(chalk.cyan(`\n[FactChecker] Claim Check:`));
    console.log(chalk.gray(`  Category: ${category}`));
    console.log(
      chalk.gray(`  Claim: "${claim.substring(0, 80)}${claim.length > 80 ? '...' : ''}"`),
    );
    console.log(`  Status: ${statusIcon}`);
    console.log(`  Confidence: ${confidenceColor(`${(result.confidence * 100).toFixed(1)}%`)}`);
    console.log(chalk.gray(`  Source: ${result.source}`));

    if (result.details) {
      console.log(chalk.gray(`  Details: ${result.details}`));
    }

    if (result.contradicts && result.contradicts.length > 0) {
      console.log(chalk.red(`  Contradictions:`));
      for (const c of result.contradicts) console.log(chalk.red(`    - ${c}`));
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE & CONVENIENCE FUNCTIONS
// =============================================================================

/** Default singleton instance */
export const realTimeFactChecker = new RealTimeFactChecker();

/**
 * Start checking for a task using the default instance
 * @param taskId The task ID to start checking for
 */
export function startChecking(taskId: number): void {
  realTimeFactChecker.startChecking(taskId);
}

/**
 * Stop checking for a task using the default instance
 * @param taskId The task ID to stop checking for
 */
export function stopChecking(taskId: number): void {
  realTimeFactChecker.stopChecking(taskId);
}

/**
 * Check a claim using the default instance
 * @param claim The claim to verify
 * @param context The current execution context
 * @param taskId Optional task ID
 * @returns The fact check result
 */
export function checkClaim(claim: string, context: CheckContext, taskId?: number): FactCheckResult {
  return realTimeFactChecker.checkClaim(claim, context, taskId);
}

/**
 * Get the check log for a task using the default instance
 * @param taskId The task ID
 * @returns Array of fact check results
 */
export function getCheckLog(taskId: number): FactCheckResult[] {
  return realTimeFactChecker.getCheckLog(taskId);
}

/**
 * Check response claims using the default instance
 * @param response The agent response text
 * @param context The current execution context
 * @param taskId Optional task ID
 * @returns Array of fact check results
 */
export function checkResponseClaims(
  response: string,
  context: CheckContext,
  taskId?: number,
): FactCheckResult[] {
  return realTimeFactChecker.checkResponseClaims(response, context, taskId);
}

/**
 * Get fact checker statistics using the default instance
 * @returns Fact checker statistics
 */
export function getFactCheckerStats(): FactCheckerStats {
  return realTimeFactChecker.getStats();
}

/**
 * Log a fact checker summary
 */
export function logFactCheckerSummary(): void {
  const stats = realTimeFactChecker.getStats();

  console.log(chalk.cyan('\n[FactChecker] Summary:'));
  console.log(chalk.gray(`  Total checks: ${stats.totalChecks}`));
  console.log(chalk.green(`  Verified: ${stats.verifiedClaims}`));
  console.log(chalk.red(`  Unverified: ${stats.unverifiedClaims}`));
  console.log(chalk.red(`  Contradicted: ${stats.contradictedClaims}`));
  console.log(chalk.cyan(`  Verification rate: ${(stats.verificationRate * 100).toFixed(1)}%`));
  console.log(chalk.cyan(`  Average confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`));

  console.log(chalk.gray('\n  Checks by category:'));
  for (const [category, count] of Object.entries(stats.checksByCategory)) {
    if (count > 0) {
      console.log(chalk.gray(`    ${category}: ${count}`));
    }
  }
}

// =============================================================================
// GRAPHPROCESSOR INTEGRATION HELPERS
// =============================================================================

/**
 * Create a CheckContext from GraphProcessor execution state
 * @param fileSystemState Map or array of file paths
 * @param executedCommands Array of executed commands
 * @param agentOutputs Map of task IDs to outputs
 * @param mcpCalls Optional MCP call records
 * @returns A properly formatted CheckContext
 */
export function createCheckContext(
  fileSystemState: Map<string, boolean> | string[],
  executedCommands: string[],
  agentOutputs: Map<number, string> | Record<number, string>,
  mcpCalls?: MCPCallRecord[],
): CheckContext {
  // Convert array to Map if needed
  let fileSystem: Map<string, boolean>;
  if (Array.isArray(fileSystemState)) {
    fileSystem = new Map(fileSystemState.map((path) => [path, true]));
  } else {
    fileSystem = fileSystemState;
  }

  // Convert Record to Map if needed
  let outputs: Map<number, string>;
  if (agentOutputs instanceof Map) {
    outputs = agentOutputs;
  } else {
    outputs = new Map(Object.entries(agentOutputs).map(([k, v]) => [parseInt(k, 10), v]));
  }

  return {
    fileSystem,
    executedCommands,
    agentOutputs: outputs,
    mcpCalls,
  };
}

/**
 * Quick verification helper for GraphProcessor
 * Checks a claim and returns a simple boolean with minimum confidence
 * @param claim The claim to verify
 * @param context The execution context
 * @param minConfidence Minimum confidence for verification (default: 0.6)
 * @returns Whether the claim is verified with sufficient confidence
 */
export function quickVerify(
  claim: string,
  context: CheckContext,
  minConfidence: number = 0.6,
): boolean {
  const result = realTimeFactChecker.checkClaim(claim, context);
  return result.verified && result.confidence >= minConfidence;
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default RealTimeFactChecker;

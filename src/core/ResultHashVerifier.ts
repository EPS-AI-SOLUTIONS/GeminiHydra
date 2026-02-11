/**
 * ResultHashVerifier - Solution 26: Result Hash Verification
 *
 * Creates cryptographic hashes of results to detect tampering or hallucination drift.
 * Tracks hash chains across phases to ensure result integrity.
 *
 * Features:
 * - SHA-256 cryptographic hashing of task results
 * - Hash chain tracking for multi-phase verification
 * - Tampering detection between phases
 * - Metadata tracking for audit trails
 *
 * @module ResultHashVerifier
 */

import crypto from 'node:crypto';
import chalk from 'chalk';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Metadata associated with a stored hash
 */
export interface HashMetadata {
  /** Unix timestamp when the hash was created */
  timestamp: number;
  /** Identifier of the agent that produced the result */
  agentId: string;
  /** Execution phase (PRE-A, A, B, C, D) */
  phase: string;
  /** Optional parent hash for chain verification */
  parentHash?: string;
  /** Optional content length for sanity checks */
  contentLength?: number;
  /** Optional content preview (first 100 chars, truncated) */
  contentPreview?: string;
}

/**
 * Stored hash entry with full metadata
 */
export interface HashEntry {
  /** The SHA-256 hash of the content */
  hash: string;
  /** Metadata about the hash */
  metadata: HashMetadata;
  /** Chain sequence number (increments per phase) */
  chainIndex: number;
}

/**
 * Result of integrity verification
 */
export interface IntegrityResult {
  /** Whether the content matches the stored hash */
  valid: boolean;
  /** The expected hash from storage */
  expectedHash: string;
  /** The actual hash of the provided content */
  actualHash: string;
  /** Detailed message about the verification */
  message: string;
  /** Original metadata if available */
  metadata?: HashMetadata;
  /** Chain verification result if applicable */
  chainValid?: boolean;
}

/**
 * Chain verification result for multi-phase tracking
 */
export interface ChainVerificationResult {
  /** Whether the entire chain is valid */
  valid: boolean;
  /** Number of entries in the chain */
  chainLength: number;
  /** Index of first broken link (if invalid) */
  brokenAt?: number;
  /** Details about each link in the chain */
  links: {
    phase: string;
    hash: string;
    valid: boolean;
    timestamp: number;
  }[];
}

/**
 * Batch verification result
 */
export interface BatchVerificationResult {
  /** Total tasks verified */
  total: number;
  /** Number of valid hashes */
  valid: number;
  /** Number of invalid/tampered hashes */
  invalid: number;
  /** Number of missing hashes */
  missing: number;
  /** Details per task */
  details: Map<number, IntegrityResult>;
}

// =============================================================================
// RESULT HASH VERIFIER CLASS
// =============================================================================

/**
 * ResultHashVerifier - Cryptographic hash verification for task results
 *
 * Provides tamper detection and integrity verification for agent outputs.
 * Tracks hash chains across execution phases to detect hallucination drift.
 */
export class ResultHashVerifier {
  /** Storage for task hashes: taskId -> HashEntry[] (supports multiple phases) */
  private hashStore: Map<number, HashEntry[]> = new Map();

  /** Global hash chain for session-wide verification */
  private globalChain: string[] = [];

  /** Whether to log verification operations */
  private verbose: boolean;

  /** Algorithm used for hashing */
  private readonly algorithm = 'sha256';

  /** Salt for additional security (optional) */
  private salt: string;

  /**
   * Create a new ResultHashVerifier instance
   * @param verbose - Enable verbose logging (default: false)
   * @param salt - Optional salt for hash generation
   */
  constructor(verbose: boolean = false, salt: string = '') {
    this.verbose = verbose;
    this.salt = salt;
  }

  // ===========================================================================
  // CORE HASHING METHODS
  // ===========================================================================

  /**
   * Generate a SHA-256 hash of the content
   * @param taskId - Task identifier for context
   * @param content - Content to hash
   * @returns The hexadecimal hash string
   */
  hashResult(taskId: number, content: string): string {
    // Create deterministic input: taskId + salt + content
    const input = `${taskId}:${this.salt}:${content}`;

    // Generate SHA-256 hash
    const hash = crypto.createHash(this.algorithm).update(input, 'utf8').digest('hex');

    if (this.verbose) {
      console.log(chalk.gray(`[Hash] Task #${taskId}: ${hash.substring(0, 16)}...`));
    }

    return hash;
  }

  /**
   * Compute hash for content (alias for simple hashing without task context)
   * Used by Swarm for quick hash computation
   * @param content - Content to hash
   * @returns The hexadecimal hash string
   */
  computeHash(content: string): string {
    const input = `${this.salt}:${content}`;
    return crypto.createHash(this.algorithm).update(input, 'utf8').digest('hex');
  }

  /**
   * Register multiple hashes at once
   * Used by Swarm to batch register result hashes
   * @param hashEntries - Array of {id, hash} objects
   */
  registerHashes(hashEntries: Array<{ id: number | string; hash: string }>): void {
    for (const entry of hashEntries) {
      const taskId = typeof entry.id === 'number' ? entry.id : parseInt(entry.id, 10);
      if (!this.hashStore.has(taskId)) {
        this.hashStore.set(taskId, []);
      }
      this.hashStore.get(taskId)?.push({
        hash: entry.hash,
        metadata: {
          timestamp: Date.now(),
          phase: 'registered',
          agentId: 'swarm',
        },
        chainIndex: this.hashStore.get(taskId)?.length ?? 0,
      });
      this.globalChain.push(entry.hash);
    }
    if (this.verbose) {
      console.log(chalk.cyan(`[Hash] Registered ${hashEntries.length} hashes`));
    }
  }

  /**
   * Generate hash with additional context (agent, phase, timestamp)
   * @param taskId - Task identifier
   * @param content - Content to hash
   * @param metadata - Additional metadata to include in hash
   * @returns The hexadecimal hash string
   */
  hashResultWithContext(taskId: number, content: string, metadata: Partial<HashMetadata>): string {
    // Include metadata in hash for stronger verification
    const contextString = JSON.stringify({
      taskId,
      agentId: metadata.agentId || 'unknown',
      phase: metadata.phase || 'unknown',
      timestamp: metadata.timestamp || Date.now(),
    });

    const input = `${contextString}:${this.salt}:${content}`;

    return crypto.createHash(this.algorithm).update(input, 'utf8').digest('hex');
  }

  // ===========================================================================
  // STORAGE METHODS
  // ===========================================================================

  /**
   * Store a hash with its metadata
   * @param taskId - Task identifier
   * @param hash - The hash to store
   * @param metadata - Associated metadata
   */
  storeHash(taskId: number, hash: string, metadata: HashMetadata): void {
    // Get existing entries for this task
    const entries = this.hashStore.get(taskId) || [];

    // Determine chain index
    const chainIndex = entries.length;

    // Get parent hash if this is a chain continuation
    const parentHash =
      chainIndex > 0
        ? entries[chainIndex - 1].hash
        : this.globalChain.length > 0
          ? this.globalChain[this.globalChain.length - 1]
          : undefined;

    // Create entry with parent hash for chain tracking
    const entry: HashEntry = {
      hash,
      metadata: {
        ...metadata,
        parentHash,
      },
      chainIndex,
    };

    // Store entry
    entries.push(entry);
    this.hashStore.set(taskId, entries);

    // Update global chain
    this.globalChain.push(hash);

    if (this.verbose) {
      console.log(
        chalk.cyan(
          `[Hash Store] Task #${taskId} Phase ${metadata.phase}: ` +
            `${hash.substring(0, 16)}... (chain index: ${chainIndex})`,
        ),
      );
    }
  }

  /**
   * Store hash directly from content (convenience method)
   * @param taskId - Task identifier
   * @param content - Content to hash and store
   * @param metadata - Associated metadata
   * @returns The generated hash
   */
  storeResultHash(taskId: number, content: string, metadata: HashMetadata): string {
    const hash = this.hashResult(taskId, content);

    // Add content length and preview to metadata
    const enrichedMetadata: HashMetadata = {
      ...metadata,
      contentLength: content.length,
      contentPreview: content.substring(0, 100).replace(/\n/g, ' '),
    };

    this.storeHash(taskId, hash, enrichedMetadata);
    return hash;
  }

  // ===========================================================================
  // VERIFICATION METHODS
  // ===========================================================================

  /**
   * Verify content integrity against stored hash
   * @param taskId - Task identifier
   * @param content - Content to verify
   * @param phase - Optional phase to verify against (defaults to latest)
   * @returns Integrity verification result
   */
  verifyIntegrity(taskId: number, content: string, phase?: string): IntegrityResult {
    const entries = this.hashStore.get(taskId);

    if (!entries || entries.length === 0) {
      return {
        valid: false,
        expectedHash: '',
        actualHash: this.hashResult(taskId, content),
        message: `No hash stored for task #${taskId}`,
        chainValid: false,
      };
    }

    // Find the entry to verify against
    let entry: HashEntry;
    if (phase) {
      const phaseEntry = entries.find((e) => e.metadata.phase === phase);
      if (!phaseEntry) {
        return {
          valid: false,
          expectedHash: '',
          actualHash: this.hashResult(taskId, content),
          message: `No hash found for task #${taskId} phase ${phase}`,
        };
      }
      entry = phaseEntry;
    } else {
      // Use latest entry
      entry = entries[entries.length - 1];
    }

    // Calculate actual hash
    const actualHash = this.hashResult(taskId, content);
    const valid = actualHash === entry.hash;

    // Log result
    if (this.verbose) {
      if (valid) {
        console.log(chalk.green(`[Verify] Task #${taskId}: Integrity OK`));
      } else {
        console.log(
          chalk.red(
            `[Verify] Task #${taskId}: TAMPERED! ` +
              `Expected: ${entry.hash.substring(0, 16)}... ` +
              `Got: ${actualHash.substring(0, 16)}...`,
          ),
        );
      }
    }

    return {
      valid,
      expectedHash: entry.hash,
      actualHash,
      message: valid
        ? `Task #${taskId} integrity verified`
        : `Task #${taskId} content has been modified since phase ${entry.metadata.phase}`,
      metadata: entry.metadata,
      chainValid: this.verifyChainLink(entry),
    };
  }

  /**
   * Verify a single chain link
   * @param entry - Hash entry to verify
   * @returns Whether the chain link is valid
   */
  private verifyChainLink(entry: HashEntry): boolean {
    if (!entry.metadata.parentHash) {
      // First entry in chain, always valid
      return true;
    }

    // Find parent hash in global chain
    const parentIndex = this.globalChain.indexOf(entry.metadata.parentHash);
    const currentIndex = this.globalChain.indexOf(entry.hash);

    // Valid if parent exists and comes before current
    return parentIndex !== -1 && currentIndex !== -1 && parentIndex < currentIndex;
  }

  /**
   * Verify the entire hash chain for a task
   * @param taskId - Task identifier
   * @returns Chain verification result
   */
  verifyChain(taskId: number): ChainVerificationResult {
    const entries = this.hashStore.get(taskId);

    if (!entries || entries.length === 0) {
      return {
        valid: false,
        chainLength: 0,
        links: [],
      };
    }

    const links: ChainVerificationResult['links'] = [];
    let valid = true;
    let brokenAt: number | undefined;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      let linkValid = true;

      // Verify chain continuity (except for first entry)
      if (i > 0) {
        const expectedParent = entries[i - 1].hash;
        if (entry.metadata.parentHash !== expectedParent) {
          linkValid = false;
          if (valid) {
            valid = false;
            brokenAt = i;
          }
        }
      }

      links.push({
        phase: entry.metadata.phase,
        hash: entry.hash,
        valid: linkValid,
        timestamp: entry.metadata.timestamp,
      });
    }

    return {
      valid,
      chainLength: entries.length,
      brokenAt,
      links,
    };
  }

  /**
   * Batch verify multiple tasks
   * @param taskContents - Map of taskId to content
   * @returns Batch verification result
   */
  batchVerify(taskContents: Map<number, string>): BatchVerificationResult {
    const details = new Map<number, IntegrityResult>();
    let valid = 0;
    let invalid = 0;
    let missing = 0;

    for (const [taskId, content] of taskContents) {
      const result = this.verifyIntegrity(taskId, content);
      details.set(taskId, result);

      if (!this.hashStore.has(taskId)) {
        missing++;
      } else if (result.valid) {
        valid++;
      } else {
        invalid++;
      }
    }

    return {
      total: taskContents.size,
      valid,
      invalid,
      missing,
      details,
    };
  }

  // ===========================================================================
  // UTILITY METHODS
  // ===========================================================================

  /**
   * Get all hash entries for a task
   * @param taskId - Task identifier
   * @returns Array of hash entries or undefined
   */
  getTaskHashes(taskId: number): HashEntry[] | undefined {
    return this.hashStore.get(taskId);
  }

  /**
   * Get the latest hash for a task
   * @param taskId - Task identifier
   * @returns Latest hash entry or undefined
   */
  getLatestHash(taskId: number): HashEntry | undefined {
    const entries = this.hashStore.get(taskId);
    return entries ? entries[entries.length - 1] : undefined;
  }

  /**
   * Check if a task has any stored hashes
   * @param taskId - Task identifier
   * @returns Whether hashes exist for this task
   */
  hasHash(taskId: number): boolean {
    const entries = this.hashStore.get(taskId);
    return entries !== undefined && entries.length > 0;
  }

  /**
   * Get the global hash chain
   * @returns Copy of the global hash chain
   */
  getGlobalChain(): string[] {
    return [...this.globalChain];
  }

  /**
   * Get statistics about stored hashes
   * @returns Hash store statistics
   */
  getStats(): {
    totalTasks: number;
    totalHashes: number;
    hashesPerTask: Map<number, number>;
    phases: Set<string>;
  } {
    const hashesPerTask = new Map<number, number>();
    const phases = new Set<string>();
    let totalHashes = 0;

    for (const [taskId, entries] of this.hashStore) {
      hashesPerTask.set(taskId, entries.length);
      totalHashes += entries.length;
      for (const e of entries) phases.add(e.metadata.phase);
    }

    return {
      totalTasks: this.hashStore.size,
      totalHashes,
      hashesPerTask,
      phases,
    };
  }

  /**
   * Clear all stored hashes
   */
  clear(): void {
    this.hashStore.clear();
    this.globalChain = [];

    if (this.verbose) {
      console.log(chalk.yellow('[Hash] All hashes cleared'));
    }
  }

  /**
   * Clear hashes for a specific task
   * @param taskId - Task identifier
   */
  clearTask(taskId: number): void {
    this.hashStore.delete(taskId);

    if (this.verbose) {
      console.log(chalk.yellow(`[Hash] Task #${taskId} hashes cleared`));
    }
  }

  /**
   * Export all hashes for persistence
   * @returns Serializable hash data
   */
  export(): {
    hashes: [number, HashEntry[]][];
    globalChain: string[];
    exportedAt: number;
  } {
    return {
      hashes: Array.from(this.hashStore.entries()),
      globalChain: this.globalChain,
      exportedAt: Date.now(),
    };
  }

  /**
   * Import previously exported hashes
   * @param data - Exported hash data
   */
  import(data: {
    hashes: [number, HashEntry[]][];
    globalChain: string[];
    exportedAt: number;
  }): void {
    this.hashStore = new Map(data.hashes);
    this.globalChain = data.globalChain;

    if (this.verbose) {
      console.log(
        chalk.cyan(
          `[Hash] Imported ${this.hashStore.size} tasks, ` +
            `${this.globalChain.length} chain entries ` +
            `(exported at ${new Date(data.exportedAt).toISOString()})`,
        ),
      );
    }
  }

  /**
   * Generate a verification report
   * @returns Human-readable verification report
   */
  generateReport(): string {
    const stats = this.getStats();
    const lines: string[] = [
      '='.repeat(60),
      'RESULT HASH VERIFICATION REPORT',
      '='.repeat(60),
      '',
      `Total Tasks: ${stats.totalTasks}`,
      `Total Hashes: ${stats.totalHashes}`,
      `Phases Tracked: ${Array.from(stats.phases).join(', ')}`,
      `Global Chain Length: ${this.globalChain.length}`,
      '',
      '-'.repeat(60),
      'PER-TASK BREAKDOWN:',
      '-'.repeat(60),
    ];

    for (const [taskId, entries] of this.hashStore) {
      const chainResult = this.verifyChain(taskId);
      const statusIcon = chainResult.valid ? '[OK]' : '[!!]';

      lines.push(`\nTask #${taskId} ${statusIcon}`);
      lines.push(`  Entries: ${entries.length}`);
      lines.push(`  Chain Valid: ${chainResult.valid}`);

      for (const entry of entries) {
        lines.push(
          `    Phase ${entry.metadata.phase}: ${entry.hash.substring(0, 16)}... ` +
            `(${entry.metadata.agentId}, ${new Date(entry.metadata.timestamp).toISOString()})`,
        );
      }
    }

    lines.push('');
    lines.push('='.repeat(60));

    return lines.join('\n');
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Default ResultHashVerifier instance for global use
 */
export const resultHashVerifier = new ResultHashVerifier(false);

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Quick hash of content for a task
 * @param taskId - Task identifier
 * @param content - Content to hash
 * @returns SHA-256 hash
 */
export function hashTaskResult(taskId: number, content: string): string {
  return resultHashVerifier.hashResult(taskId, content);
}

/**
 * Store and hash a task result
 * @param taskId - Task identifier
 * @param content - Content to hash and store
 * @param agentId - Agent that produced the result
 * @param phase - Execution phase
 * @returns The generated hash
 */
export function storeTaskHash(
  taskId: number,
  content: string,
  agentId: string,
  phase: string,
): string {
  return resultHashVerifier.storeResultHash(taskId, content, {
    timestamp: Date.now(),
    agentId,
    phase,
  });
}

/**
 * Verify task result integrity
 * @param taskId - Task identifier
 * @param content - Content to verify
 * @returns Integrity verification result
 */
export function verifyTaskIntegrity(taskId: number, content: string): IntegrityResult {
  return resultHashVerifier.verifyIntegrity(taskId, content);
}

/**
 * Log verification results with colors
 * @param result - Integrity result to log
 */
export function logVerificationResult(result: IntegrityResult): void {
  if (result.valid) {
    console.log(chalk.green(`[Integrity] ${result.message}`));
  } else {
    console.log(chalk.red(`[Integrity] ${result.message}`));
    console.log(chalk.red(`  Expected: ${result.expectedHash.substring(0, 32)}...`));
    console.log(chalk.red(`  Actual:   ${result.actualHash.substring(0, 32)}...`));
    if (result.metadata) {
      console.log(
        chalk.yellow(
          `  Original: Phase ${result.metadata.phase}, ` +
            `Agent ${result.metadata.agentId}, ` +
            `${new Date(result.metadata.timestamp).toISOString()}`,
        ),
      );
    }
  }
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  ResultHashVerifier,
  resultHashVerifier,
  hashTaskResult,
  storeTaskHash,
  verifyTaskIntegrity,
  logVerificationResult,
};

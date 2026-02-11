/**
 * FactExtractionPipeline - Solution #37
 * Extracts verifiable facts from agent responses for validation
 *
 * This pipeline parses agent outputs to identify claims that can be
 * programmatically verified, enabling automated fact-checking of
 * file operations, code changes, test results, and other assertions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Types of facts that can be extracted from agent responses
 */
export enum FactType {
  FILE_EXISTS = 'file_exists',
  FILE_MODIFIED = 'file_modified',
  FILE_CREATED = 'file_created',
  FILE_DELETED = 'file_deleted',
  FUNCTION_CREATED = 'function_created',
  FUNCTION_MODIFIED = 'function_modified',
  CLASS_CREATED = 'class_created',
  TEST_RESULT = 'test_result',
  ERROR_FOUND = 'error_found',
  COMMAND_EXECUTED = 'command_executed',
  DEPENDENCY_ADDED = 'dependency_added',
  DEPENDENCY_REMOVED = 'dependency_removed',
  CONFIG_CHANGED = 'config_changed',
  CLAIM_MADE = 'claim_made',
  CODE_PATTERN = 'code_pattern',
  IMPORT_ADDED = 'import_added',
  EXPORT_ADDED = 'export_added',
  VARIABLE_DEFINED = 'variable_defined',
}

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Represents an extracted fact from agent response
 */
export interface ExtractedFact {
  /** Type of fact extracted */
  type: FactType;

  /** The content/description of the fact */
  content: string;

  /** Confidence score (0-1) in extraction accuracy */
  confidence: number;

  /** Whether this fact can be programmatically verified */
  verifiable: boolean;

  /** Result of verification if performed */
  verification?: VerificationResult;

  /** Additional metadata about the fact */
  metadata?: FactMetadata;

  /** Line number or position where fact was found in response */
  sourcePosition?: number;

  /** Original text snippet that led to this extraction */
  sourceText?: string;
}

/**
 * Result of verifying a fact
 */
export interface VerificationResult {
  /** Whether the fact was verified as true */
  verified: boolean;

  /** Explanation of verification result */
  explanation: string;

  /** Timestamp of verification */
  timestamp: number;

  /** Method used for verification */
  method: VerificationMethod;

  /** Any error encountered during verification */
  error?: string;
}

/**
 * Methods available for fact verification
 */
export type VerificationMethod =
  | 'filesystem_check'
  | 'ast_analysis'
  | 'pattern_match'
  | 'command_execution'
  | 'dependency_check'
  | 'manual'
  | 'heuristic';

/**
 * Additional metadata about extracted facts
 */
export interface FactMetadata {
  /** File path if applicable */
  filePath?: string;

  /** Function or symbol name */
  symbolName?: string;

  /** Line numbers affected */
  lineNumbers?: number[];

  /** Related facts (by index) */
  relatedFacts?: number[];

  /** Command executed */
  command?: string;

  /** Test name or description */
  testName?: string;

  /** Error message if applicable */
  errorMessage?: string;

  /** Package/dependency name */
  packageName?: string;

  /** Version if applicable */
  version?: string;
}

/**
 * Context for verification operations
 */
export interface VerificationContext {
  /** Working directory for file operations */
  workingDirectory: string;

  /** Whether to actually execute commands */
  executeCommands: boolean;

  /** Maximum time for verification (ms) */
  timeout: number;

  /** File extensions to consider */
  fileExtensions?: string[];

  /** Directories to exclude */
  excludeDirs?: string[];

  /** Previous facts for cross-reference */
  previousFacts?: ExtractedFact[];

  /** Custom verification functions */
  customVerifiers?: Map<FactType, FactVerifier>;
}

/**
 * Custom verifier function type
 */
export type FactVerifier = (
  fact: ExtractedFact,
  context: VerificationContext,
) => Promise<VerificationResult>;

/**
 * Extraction pattern definition
 */
interface ExtractionPattern {
  /** Pattern type */
  type: FactType;

  /** Regex patterns to match */
  patterns: RegExp[];

  /** Confidence multiplier (0-1) */
  confidenceMultiplier: number;

  /** Extractor function to get metadata */
  extractor: (match: RegExpMatchArray) => Partial<FactMetadata>;

  /** Whether results are verifiable */
  verifiable: boolean;
}

/**
 * Extraction statistics
 */
export interface ExtractionStats {
  totalFacts: number;
  byType: Record<FactType, number>;
  verifiableFacts: number;
  averageConfidence: number;
  extractionTime: number;
}

// ============================================================================
// EXTRACTION PATTERNS
// ============================================================================

const EXTRACTION_PATTERNS: ExtractionPattern[] = [
  // File creation patterns
  {
    type: FactType.FILE_CREATED,
    patterns: [
      /(?:Created|created|Creating|creating|wrote|Write|Written|written)\s+(?:file|new file)?\s*[`'":]?\s*([^\s`'"]+\.[a-zA-Z]+)/gi,
      /(?:Added|adding)\s+(?:new\s+)?file\s*[`'":]?\s*([^\s`'"]+\.[a-zA-Z]+)/gi,
      /(?:Generated|generating)\s+(?:file)?\s*[`'":]?\s*([^\s`'"]+\.[a-zA-Z]+)/gi,
      /File\s+[`'":]?([^\s`'"]+\.[a-zA-Z]+)[`'"]?\s+(?:has been\s+)?created/gi,
    ],
    confidenceMultiplier: 0.9,
    extractor: (match) => ({ filePath: match[1]?.trim() }),
    verifiable: true,
  },

  // File modification patterns
  {
    type: FactType.FILE_MODIFIED,
    patterns: [
      /(?:Modified|modified|Modifying|modifying|Updated|updated|Updating|updating|Changed|changed)\s+(?:file)?\s*[`'":]?\s*([^\s`'"]+\.[a-zA-Z]+)/gi,
      /(?:Edited|editing)\s+(?:file)?\s*[`'":]?\s*([^\s`'"]+\.[a-zA-Z]+)/gi,
      /File\s+[`'":]?([^\s`'"]+\.[a-zA-Z]+)[`'"]?\s+(?:has been\s+)?(?:modified|updated|changed)/gi,
    ],
    confidenceMultiplier: 0.85,
    extractor: (match) => ({ filePath: match[1]?.trim() }),
    verifiable: true,
  },

  // File deletion patterns
  {
    type: FactType.FILE_DELETED,
    patterns: [
      /(?:Deleted|deleted|Deleting|deleting|Removed|removed|Removing|removing)\s+(?:file)?\s*[`'":]?\s*([^\s`'"]+\.[a-zA-Z]+)/gi,
      /File\s+[`'":]?([^\s`'"]+\.[a-zA-Z]+)[`'"]?\s+(?:has been\s+)?(?:deleted|removed)/gi,
    ],
    confidenceMultiplier: 0.9,
    extractor: (match) => ({ filePath: match[1]?.trim() }),
    verifiable: true,
  },

  // Function creation patterns
  {
    type: FactType.FUNCTION_CREATED,
    patterns: [
      /(?:Created|created|Added|added|Implemented|implemented)\s+(?:function|method|async function)\s+[`'":]?\s*(\w+)/gi,
      /(?:New|new)\s+(?:function|method)\s+[`'":]?\s*(\w+)/gi,
      /(?:function|const|let|var)\s+(\w+)\s*(?:=\s*(?:async\s*)?\(|[(<])/gi,
      /(?:def|async def)\s+(\w+)\s*\(/gi,
    ],
    confidenceMultiplier: 0.8,
    extractor: (match) => ({ symbolName: match[1]?.trim() }),
    verifiable: true,
  },

  // Function modification patterns
  {
    type: FactType.FUNCTION_MODIFIED,
    patterns: [
      /(?:Modified|modified|Updated|updated|Refactored|refactored)\s+(?:function|method)\s+[`'":]?\s*(\w+)/gi,
      /(?:Changed|changed)\s+(?:the\s+)?(?:function|method)\s+[`'":]?\s*(\w+)/gi,
    ],
    confidenceMultiplier: 0.75,
    extractor: (match) => ({ symbolName: match[1]?.trim() }),
    verifiable: true,
  },

  // Class creation patterns
  {
    type: FactType.CLASS_CREATED,
    patterns: [
      /(?:Created|created|Added|added|Implemented|implemented)\s+(?:class|interface|type)\s+[`'":]?\s*(\w+)/gi,
      /(?:New|new)\s+(?:class|interface|type)\s+[`'":]?\s*(\w+)/gi,
      /(?:class|interface)\s+(\w+)\s*(?:extends|implements|\{|<)/gi,
    ],
    confidenceMultiplier: 0.85,
    extractor: (match) => ({ symbolName: match[1]?.trim() }),
    verifiable: true,
  },

  // Test result patterns
  {
    type: FactType.TEST_RESULT,
    patterns: [
      /(?:Tests?\s+)?(?:passed|passing|succeeded|successful|green)(?:\s*:?\s*(\d+))?/gi,
      /(?:Tests?\s+)?(?:failed|failing|red)(?:\s*:?\s*(\d+))?/gi,
      /(\d+)\s+(?:tests?\s+)?(?:passed|passing)/gi,
      /(\d+)\s+(?:tests?\s+)?(?:failed|failing)/gi,
      /All\s+tests\s+(?:passed|passed successfully)/gi,
      /Test\s+suite\s+(?:passed|failed)/gi,
    ],
    confidenceMultiplier: 0.95,
    extractor: (match) => ({
      testName: match[0],
    }),
    verifiable: true,
  },

  // Error patterns
  {
    type: FactType.ERROR_FOUND,
    patterns: [
      /(?:Error|error|ERROR):\s*(.+?)(?:\n|$)/gi,
      /(?:Exception|exception):\s*(.+?)(?:\n|$)/gi,
      /(?:Failed|failed|FAILED):\s*(.+?)(?:\n|$)/gi,
      /(?:TypeError|ReferenceError|SyntaxError|RangeError):\s*(.+?)(?:\n|$)/gi,
    ],
    confidenceMultiplier: 0.9,
    extractor: (match) => ({ errorMessage: match[1]?.trim() }),
    verifiable: false,
  },

  // Command execution patterns
  {
    type: FactType.COMMAND_EXECUTED,
    patterns: [
      /(?:Ran|ran|Running|running|Executed|executed|Executing|executing)\s+(?:command)?\s*[`'":]?\s*([^\n`'"]+)/gi,
      /\$\s*([^\n]+)/g,
      /```(?:bash|shell|sh|cmd|powershell)?\n([^\n]+)/gi,
      /(?:npm|yarn|pnpm|npx)\s+(?:run\s+)?(\w+)/gi,
    ],
    confidenceMultiplier: 0.85,
    extractor: (match) => ({ command: match[1]?.trim() }),
    verifiable: true,
  },

  // Dependency patterns
  {
    type: FactType.DEPENDENCY_ADDED,
    patterns: [
      /(?:Installed|installed|Installing|installing|Added|added)\s+(?:package|dependency|dep)?\s*[`'":]?\s*([@\w/-]+)(?:@([\d.]+))?/gi,
      /npm\s+(?:install|i)\s+([@\w/-]+)/gi,
      /yarn\s+add\s+([@\w/-]+)/gi,
    ],
    confidenceMultiplier: 0.9,
    extractor: (match) => ({
      packageName: match[1]?.trim(),
      version: match[2]?.trim(),
    }),
    verifiable: true,
  },

  // Import patterns
  {
    type: FactType.IMPORT_ADDED,
    patterns: [
      /import\s+(?:\{[^}]+\}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/gi,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/gi,
      /Added\s+import\s+(?:for\s+)?[`'":]?([^\s`'"]+)/gi,
    ],
    confidenceMultiplier: 0.85,
    extractor: (match) => ({ packageName: match[1]?.trim() }),
    verifiable: true,
  },

  // Export patterns
  {
    type: FactType.EXPORT_ADDED,
    patterns: [
      /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+(\w+)/gi,
      /(?:Added|adding)\s+export\s+(?:for\s+)?[`'":]?(\w+)/gi,
    ],
    confidenceMultiplier: 0.8,
    extractor: (match) => ({ symbolName: match[1]?.trim() }),
    verifiable: true,
  },

  // Config change patterns
  {
    type: FactType.CONFIG_CHANGED,
    patterns: [
      /(?:Updated|updated|Modified|modified|Changed|changed)\s+(?:config|configuration|settings?)\s+(?:in\s+)?[`'":]?\s*([^\s`'"]+\.(?:json|yaml|yml|toml|ini|conf))/gi,
      /(?:Set|set|Setting|setting)\s+(?:config|configuration)?\s*[`'":]?\s*(\w+)\s*(?:to|=)/gi,
    ],
    confidenceMultiplier: 0.85,
    extractor: (match) => ({
      filePath: match[1]?.includes('.') ? match[1]?.trim() : undefined,
      symbolName: match[1]?.trim(),
    }),
    verifiable: true,
  },

  // General claim patterns (lower confidence)
  {
    type: FactType.CLAIM_MADE,
    patterns: [
      /(?:This|this)\s+(?:will|should|does|is)\s+(.+?)(?:\.|$)/gi,
      /(?:The|the)\s+(?:code|implementation|solution)\s+(?:now|will)\s+(.+?)(?:\.|$)/gi,
      /(?:I|We)\s+(?:have|'ve)\s+(?:now\s+)?(.+?)(?:\.|$)/gi,
    ],
    confidenceMultiplier: 0.5,
    extractor: () => ({}),
    verifiable: false,
  },
];

// ============================================================================
// FACT EXTRACTION PIPELINE CLASS
// ============================================================================

/**
 * Pipeline for extracting verifiable facts from agent responses
 */
export class FactExtractionPipeline {
  private patterns: ExtractionPattern[];
  private extractedFacts: ExtractedFact[] = [];
  private verificationContext: VerificationContext;
  private debug: boolean;

  constructor(
    options: {
      customPatterns?: ExtractionPattern[];
      context?: Partial<VerificationContext>;
      debug?: boolean;
    } = {},
  ) {
    this.patterns = [...EXTRACTION_PATTERNS, ...(options.customPatterns || [])];
    this.debug = options.debug ?? false;

    this.verificationContext = {
      workingDirectory: options.context?.workingDirectory || process.cwd(),
      executeCommands: options.context?.executeCommands ?? false,
      timeout: options.context?.timeout || 5000,
      fileExtensions: options.context?.fileExtensions || [
        '.ts',
        '.js',
        '.tsx',
        '.jsx',
        '.py',
        '.json',
      ],
      excludeDirs: options.context?.excludeDirs || ['node_modules', '.git', 'dist', 'build'],
      previousFacts: options.context?.previousFacts || [],
      customVerifiers: options.context?.customVerifiers || new Map(),
    };
  }

  // --------------------------------------------------------------------------
  // EXTRACTION METHODS
  // --------------------------------------------------------------------------

  /**
   * Extract all facts from a response string
   */
  extractFacts(response: string): ExtractedFact[] {
    const startTime = Date.now();
    this.extractedFacts = [];

    if (!response || typeof response !== 'string') {
      return [];
    }

    this.log('Starting fact extraction...');

    const _lines = response.split('\n');

    for (const pattern of this.patterns) {
      for (const regex of pattern.patterns) {
        // Reset regex state
        regex.lastIndex = 0;

        for (let match = regex.exec(response); match !== null; match = regex.exec(response)) {
          const fact = this.createFact(match, pattern, response);

          // Avoid duplicates
          if (!this.isDuplicate(fact)) {
            this.extractedFacts.push(fact);
          }

          // Prevent infinite loops on zero-width matches
          if (match.index === regex.lastIndex) {
            regex.lastIndex++;
          }
        }
      }
    }

    // Sort by position in response
    this.extractedFacts.sort((a, b) => (a.sourcePosition || 0) - (b.sourcePosition || 0));

    // Find related facts
    this.linkRelatedFacts();

    const extractionTime = Date.now() - startTime;
    this.log(`Extracted ${this.extractedFacts.length} facts in ${extractionTime}ms`);

    return this.extractedFacts;
  }

  /**
   * Create a fact from a regex match
   */
  private createFact(
    match: RegExpExecArray,
    pattern: ExtractionPattern,
    fullResponse: string,
  ): ExtractedFact {
    const metadata = pattern.extractor(match);

    // Calculate base confidence from match quality
    let confidence = pattern.confidenceMultiplier;

    // Adjust confidence based on context
    if (metadata.filePath && this.looksLikeValidPath(metadata.filePath)) {
      confidence *= 1.1;
    }

    if (metadata.symbolName && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(metadata.symbolName)) {
      confidence *= 1.05;
    }

    // Cap at 1.0
    confidence = Math.min(confidence, 1.0);

    // Get source line number
    const textBefore = fullResponse.substring(0, match.index);
    const lineNumber = (textBefore.match(/\n/g) || []).length + 1;

    // Extract surrounding context
    const contextStart = Math.max(0, match.index - 50);
    const contextEnd = Math.min(fullResponse.length, match.index + match[0].length + 50);
    const sourceText = fullResponse.substring(contextStart, contextEnd).trim();

    return {
      type: pattern.type,
      content: this.formatContent(pattern.type, metadata),
      confidence: Math.round(confidence * 100) / 100,
      verifiable: pattern.verifiable,
      metadata,
      sourcePosition: lineNumber,
      sourceText,
    };
  }

  /**
   * Format fact content based on type and metadata
   */
  private formatContent(type: FactType, metadata: Partial<FactMetadata>): string {
    switch (type) {
      case FactType.FILE_CREATED:
        return `File created: ${metadata.filePath}`;
      case FactType.FILE_MODIFIED:
        return `File modified: ${metadata.filePath}`;
      case FactType.FILE_DELETED:
        return `File deleted: ${metadata.filePath}`;
      case FactType.FUNCTION_CREATED:
        return `Function created: ${metadata.symbolName}`;
      case FactType.FUNCTION_MODIFIED:
        return `Function modified: ${metadata.symbolName}`;
      case FactType.CLASS_CREATED:
        return `Class/Interface created: ${metadata.symbolName}`;
      case FactType.TEST_RESULT:
        return `Test result: ${metadata.testName}`;
      case FactType.ERROR_FOUND:
        return `Error: ${metadata.errorMessage}`;
      case FactType.COMMAND_EXECUTED:
        return `Command: ${metadata.command}`;
      case FactType.DEPENDENCY_ADDED:
        return `Dependency added: ${metadata.packageName}${metadata.version ? `@${metadata.version}` : ''}`;
      case FactType.IMPORT_ADDED:
        return `Import added: ${metadata.packageName}`;
      case FactType.EXPORT_ADDED:
        return `Export added: ${metadata.symbolName}`;
      case FactType.CONFIG_CHANGED:
        return `Config changed: ${metadata.filePath || metadata.symbolName}`;
      default:
        return JSON.stringify(metadata);
    }
  }

  /**
   * Check if a path looks valid
   */
  private looksLikeValidPath(pathStr: string): boolean {
    // Has extension
    if (!/\.\w{1,10}$/.test(pathStr)) return false;

    // No obviously invalid characters
    if (/[<>"|?*]/.test(pathStr)) return false;

    // Not too short or too long
    if (pathStr.length < 3 || pathStr.length > 256) return false;

    return true;
  }

  /**
   * Check if fact is duplicate of existing one
   */
  private isDuplicate(newFact: ExtractedFact): boolean {
    return this.extractedFacts.some(
      (existing) =>
        existing.type === newFact.type &&
        existing.content === newFact.content &&
        Math.abs((existing.sourcePosition || 0) - (newFact.sourcePosition || 0)) < 3,
    );
  }

  /**
   * Link related facts together
   */
  private linkRelatedFacts(): void {
    for (let i = 0; i < this.extractedFacts.length; i++) {
      const fact = this.extractedFacts[i];
      const related: number[] = [];

      for (let j = 0; j < this.extractedFacts.length; j++) {
        if (i === j) continue;

        const other = this.extractedFacts[j];

        // Same file
        if (fact.metadata?.filePath && fact.metadata.filePath === other.metadata?.filePath) {
          related.push(j);
        }

        // Same symbol
        if (fact.metadata?.symbolName && fact.metadata.symbolName === other.metadata?.symbolName) {
          related.push(j);
        }

        // Nearby in response
        if (Math.abs((fact.sourcePosition || 0) - (other.sourcePosition || 0)) <= 5) {
          related.push(j);
        }
      }

      if (related.length > 0) {
        fact.metadata = fact.metadata || {};
        fact.metadata.relatedFacts = [...new Set(related)];
      }
    }
  }

  // --------------------------------------------------------------------------
  // VERIFICATION METHODS
  // --------------------------------------------------------------------------

  /**
   * Verify a single fact
   */
  async verifyFact(fact: ExtractedFact, context?: Partial<VerificationContext>): Promise<boolean> {
    const ctx = { ...this.verificationContext, ...context };

    if (!fact.verifiable) {
      fact.verification = {
        verified: false,
        explanation: 'Fact is not verifiable',
        timestamp: Date.now(),
        method: 'manual',
      };
      return false;
    }

    this.log(`Verifying fact: ${fact.content}`);

    try {
      // Check for custom verifier
      const customVerifier = ctx.customVerifiers?.get(fact.type);
      if (customVerifier) {
        fact.verification = await customVerifier(fact, ctx);
        return fact.verification.verified;
      }

      // Use built-in verifiers
      switch (fact.type) {
        case FactType.FILE_CREATED:
        case FactType.FILE_EXISTS:
        case FactType.FILE_MODIFIED:
          return await this.verifyFileExists(fact, ctx);

        case FactType.FILE_DELETED:
          return await this.verifyFileDeleted(fact, ctx);

        case FactType.FUNCTION_CREATED:
        case FactType.CLASS_CREATED:
        case FactType.EXPORT_ADDED:
          return await this.verifySymbolExists(fact, ctx);

        case FactType.DEPENDENCY_ADDED:
          return await this.verifyDependency(fact, ctx);

        case FactType.IMPORT_ADDED:
          return await this.verifyImport(fact, ctx);

        case FactType.COMMAND_EXECUTED:
          return this.verifyCommand(fact, ctx);

        default:
          fact.verification = {
            verified: false,
            explanation: `No verifier for type: ${fact.type}`,
            timestamp: Date.now(),
            method: 'manual',
          };
          return false;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      fact.verification = {
        verified: false,
        explanation: `Verification error: ${msg}`,
        timestamp: Date.now(),
        method: 'heuristic',
        error: msg,
      };
      return false;
    }
  }

  /**
   * Verify all extracted facts
   */
  async verifyAllFacts(
    context?: Partial<VerificationContext>,
  ): Promise<Map<ExtractedFact, boolean>> {
    const results = new Map<ExtractedFact, boolean>();

    for (const fact of this.extractedFacts) {
      const verified = await this.verifyFact(fact, context);
      results.set(fact, verified);
    }

    return results;
  }

  /**
   * Verify file exists
   */
  private async verifyFileExists(fact: ExtractedFact, ctx: VerificationContext): Promise<boolean> {
    const filePath = fact.metadata?.filePath;
    if (!filePath) {
      fact.verification = {
        verified: false,
        explanation: 'No file path in metadata',
        timestamp: Date.now(),
        method: 'filesystem_check',
      };
      return false;
    }

    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(ctx.workingDirectory, filePath);

    const exists = fs.existsSync(fullPath);

    fact.verification = {
      verified: exists,
      explanation: exists ? `File exists at: ${fullPath}` : `File not found at: ${fullPath}`,
      timestamp: Date.now(),
      method: 'filesystem_check',
    };

    return exists;
  }

  /**
   * Verify file was deleted
   */
  private async verifyFileDeleted(fact: ExtractedFact, ctx: VerificationContext): Promise<boolean> {
    const filePath = fact.metadata?.filePath;
    if (!filePath) {
      fact.verification = {
        verified: false,
        explanation: 'No file path in metadata',
        timestamp: Date.now(),
        method: 'filesystem_check',
      };
      return false;
    }

    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(ctx.workingDirectory, filePath);

    const exists = fs.existsSync(fullPath);

    fact.verification = {
      verified: !exists,
      explanation: !exists
        ? `File successfully deleted: ${fullPath}`
        : `File still exists at: ${fullPath}`,
      timestamp: Date.now(),
      method: 'filesystem_check',
    };

    return !exists;
  }

  /**
   * Verify symbol exists in codebase
   */
  private async verifySymbolExists(
    fact: ExtractedFact,
    ctx: VerificationContext,
  ): Promise<boolean> {
    const symbolName = fact.metadata?.symbolName;
    if (!symbolName) {
      fact.verification = {
        verified: false,
        explanation: 'No symbol name in metadata',
        timestamp: Date.now(),
        method: 'pattern_match',
      };
      return false;
    }

    // Create patterns for different symbol types
    const patterns = [
      new RegExp(`function\\s+${symbolName}\\s*[(<]`, 'g'),
      new RegExp(`const\\s+${symbolName}\\s*=`, 'g'),
      new RegExp(`let\\s+${symbolName}\\s*=`, 'g'),
      new RegExp(`class\\s+${symbolName}\\s*[{<]`, 'g'),
      new RegExp(`interface\\s+${symbolName}\\s*[{<]`, 'g'),
      new RegExp(`type\\s+${symbolName}\\s*=`, 'g'),
      new RegExp(
        `export\\s+(?:default\\s+)?(?:function|class|const|let|interface|type)\\s+${symbolName}`,
        'g',
      ),
    ];

    // Check in related file if specified
    if (fact.metadata?.filePath) {
      const fullPath = path.isAbsolute(fact.metadata.filePath)
        ? fact.metadata.filePath
        : path.join(ctx.workingDirectory, fact.metadata.filePath);

      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          for (const pattern of patterns) {
            if (pattern.test(content)) {
              fact.verification = {
                verified: true,
                explanation: `Symbol '${symbolName}' found in ${fullPath}`,
                timestamp: Date.now(),
                method: 'pattern_match',
              };
              return true;
            }
          }
        } catch (_error) {
          // Continue to search in working directory
        }
      }
    }

    // Search in working directory
    const searchResult = await this.searchForPattern(
      ctx.workingDirectory,
      patterns,
      ctx.fileExtensions || [],
      ctx.excludeDirs || [],
    );

    if (searchResult.found) {
      fact.verification = {
        verified: true,
        explanation: `Symbol '${symbolName}' found in: ${searchResult.file}`,
        timestamp: Date.now(),
        method: 'pattern_match',
      };
      return true;
    }

    fact.verification = {
      verified: false,
      explanation: `Symbol '${symbolName}' not found in codebase`,
      timestamp: Date.now(),
      method: 'pattern_match',
    };
    return false;
  }

  /**
   * Verify dependency is installed
   */
  private async verifyDependency(fact: ExtractedFact, ctx: VerificationContext): Promise<boolean> {
    const packageName = fact.metadata?.packageName;
    if (!packageName) {
      fact.verification = {
        verified: false,
        explanation: 'No package name in metadata',
        timestamp: Date.now(),
        method: 'dependency_check',
      };
      return false;
    }

    const packageJsonPath = path.join(ctx.workingDirectory, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      fact.verification = {
        verified: false,
        explanation: 'package.json not found',
        timestamp: Date.now(),
        method: 'dependency_check',
      };
      return false;
    }

    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies,
      };

      const installed = packageName in deps;

      fact.verification = {
        verified: installed,
        explanation: installed
          ? `Package '${packageName}' is in package.json`
          : `Package '${packageName}' not found in package.json`,
        timestamp: Date.now(),
        method: 'dependency_check',
      };

      return installed;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      fact.verification = {
        verified: false,
        explanation: `Error reading package.json: ${msg}`,
        timestamp: Date.now(),
        method: 'dependency_check',
        error: msg,
      };
      return false;
    }
  }

  /**
   * Verify import exists in codebase
   */
  private async verifyImport(fact: ExtractedFact, ctx: VerificationContext): Promise<boolean> {
    const packageName = fact.metadata?.packageName;
    if (!packageName) {
      fact.verification = {
        verified: false,
        explanation: 'No import name in metadata',
        timestamp: Date.now(),
        method: 'pattern_match',
      };
      return false;
    }

    const patterns = [
      new RegExp(
        `import\\s+.*from\\s+['"]${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
        'g',
      ),
      new RegExp(
        `require\\s*\\(\\s*['"]${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]\\s*\\)`,
        'g',
      ),
    ];

    const searchResult = await this.searchForPattern(
      ctx.workingDirectory,
      patterns,
      ctx.fileExtensions || [],
      ctx.excludeDirs || [],
    );

    fact.verification = {
      verified: searchResult.found,
      explanation: searchResult.found
        ? `Import '${packageName}' found in: ${searchResult.file}`
        : `Import '${packageName}' not found in codebase`,
      timestamp: Date.now(),
      method: 'pattern_match',
    };

    return searchResult.found;
  }

  /**
   * Verify command was executed (heuristic)
   */
  private verifyCommand(fact: ExtractedFact, _ctx: VerificationContext): boolean {
    // Commands can't be verified after the fact without side effects
    // We can only verify the claim was made
    fact.verification = {
      verified: true,
      explanation: 'Command execution claimed (cannot verify retrospectively)',
      timestamp: Date.now(),
      method: 'heuristic',
    };
    return true;
  }

  /**
   * Search for pattern in files
   */
  private async searchForPattern(
    directory: string,
    patterns: RegExp[],
    extensions: string[],
    excludeDirs: string[],
  ): Promise<{ found: boolean; file?: string; line?: number }> {
    const searchFiles = (dir: string): string[] => {
      const results: string[] = [];

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            if (!excludeDirs.includes(entry.name)) {
              results.push(...searchFiles(fullPath));
            }
          } else if (entry.isFile()) {
            if (extensions.length === 0 || extensions.some((ext) => entry.name.endsWith(ext))) {
              results.push(fullPath);
            }
          }
        }
      } catch (_error) {
        // Ignore permission errors, etc.
      }

      return results;
    };

    const files = searchFiles(directory);

    for (const file of files.slice(0, 1000)) {
      // Limit to prevent huge searches
      try {
        const content = fs.readFileSync(file, 'utf-8');
        for (const pattern of patterns) {
          pattern.lastIndex = 0;
          if (pattern.test(content)) {
            return { found: true, file };
          }
        }
      } catch (_error) {
        // Skip unreadable files
      }
    }

    return { found: false };
  }

  // --------------------------------------------------------------------------
  // UTILITY METHODS
  // --------------------------------------------------------------------------

  /**
   * Get extraction statistics
   */
  getStats(): ExtractionStats {
    const byType: Record<FactType, number> = {} as Record<FactType, number>;

    for (const type of Object.values(FactType)) {
      byType[type] = this.extractedFacts.filter((f) => f.type === type).length;
    }

    const confidences = this.extractedFacts.map((f) => f.confidence);
    const avgConfidence =
      confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

    return {
      totalFacts: this.extractedFacts.length,
      byType,
      verifiableFacts: this.extractedFacts.filter((f) => f.verifiable).length,
      averageConfidence: Math.round(avgConfidence * 100) / 100,
      extractionTime: 0, // Would need to track this
    };
  }

  /**
   * Get facts by type
   */
  getFactsByType(type: FactType): ExtractedFact[] {
    return this.extractedFacts.filter((f) => f.type === type);
  }

  /**
   * Get verifiable facts only
   */
  getVerifiableFacts(): ExtractedFact[] {
    return this.extractedFacts.filter((f) => f.verifiable);
  }

  /**
   * Get verified facts
   */
  getVerifiedFacts(): ExtractedFact[] {
    return this.extractedFacts.filter((f) => f.verification?.verified === true);
  }

  /**
   * Get unverified/failed facts
   */
  getUnverifiedFacts(): ExtractedFact[] {
    return this.extractedFacts.filter((f) => f.verifiable && f.verification?.verified !== true);
  }

  /**
   * Get all extracted facts
   */
  getAllFacts(): ExtractedFact[] {
    return [...this.extractedFacts];
  }

  /**
   * Clear extracted facts
   */
  clear(): void {
    this.extractedFacts = [];
  }

  /**
   * Generate summary report
   */
  generateReport(): string {
    const stats = this.getStats();
    const lines: string[] = [];

    lines.push('=== FACT EXTRACTION REPORT ===');
    lines.push(`Total facts extracted: ${stats.totalFacts}`);
    lines.push(`Verifiable facts: ${stats.verifiableFacts}`);
    lines.push(`Average confidence: ${(stats.averageConfidence * 100).toFixed(1)}%`);
    lines.push('');

    lines.push('BY TYPE:');
    for (const [type, count] of Object.entries(stats.byType)) {
      if (count > 0) {
        lines.push(`  ${type}: ${count}`);
      }
    }
    lines.push('');

    if (this.extractedFacts.some((f) => f.verification)) {
      const verified = this.getVerifiedFacts().length;
      const failed = this.getUnverifiedFacts().length;

      lines.push('VERIFICATION RESULTS:');
      lines.push(`  Verified: ${verified}`);
      lines.push(`  Failed: ${failed}`);
      lines.push('');
    }

    lines.push('EXTRACTED FACTS:');
    for (const fact of this.extractedFacts) {
      const status = fact.verification?.verified ? '[OK]' : fact.verification ? '[FAIL]' : '[ ]';
      lines.push(`  ${status} [${(fact.confidence * 100).toFixed(0)}%] ${fact.content}`);
    }

    return lines.join('\n');
  }

  /**
   * Log message if debug enabled
   */
  private log(message: string): void {
    if (this.debug) {
      console.log(chalk.gray(`[FactExtraction] ${message}`));
    }
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick extraction without creating instance
 */
export function extractFacts(
  response: string,
  options?: {
    workingDirectory?: string;
    debug?: boolean;
  },
): ExtractedFact[] {
  const pipeline = new FactExtractionPipeline({
    context: { workingDirectory: options?.workingDirectory },
    debug: options?.debug,
  });
  return pipeline.extractFacts(response);
}

/**
 * Extract and verify facts
 */
export async function extractAndVerifyFacts(
  response: string,
  options?: {
    workingDirectory?: string;
    debug?: boolean;
  },
): Promise<{
  facts: ExtractedFact[];
  verified: number;
  failed: number;
}> {
  const pipeline = new FactExtractionPipeline({
    context: { workingDirectory: options?.workingDirectory },
    debug: options?.debug,
  });

  const facts = pipeline.extractFacts(response);
  await pipeline.verifyAllFacts();

  return {
    facts,
    verified: pipeline.getVerifiedFacts().length,
    failed: pipeline.getUnverifiedFacts().length,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default FactExtractionPipeline;

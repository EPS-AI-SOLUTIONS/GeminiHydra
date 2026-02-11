/**
 * FactualGrounding - Validates agent responses are grounded in actual data
 * Solution #23: Factual Grounding Check
 *
 * Detects hallucinations by verifying claims against available context.
 * Prevents agents from making up files, functions, classes, or other entities.
 */

import chalk from 'chalk';

/**
 * Result of a grounding check
 */
export interface GroundingResult {
  /** Whether the response is sufficiently grounded */
  isGrounded: boolean;
  /** Claims that have evidence in the context */
  groundedClaims: string[];
  /** Claims that lack evidence in the context */
  ungroundedClaims: string[];
  /** Grounding score from 0 to 1 */
  score: number;
  /** Detailed breakdown of claim analysis */
  details?: ClaimAnalysis[];
  /** Warnings about potentially problematic claims */
  warnings?: string[];
}

/**
 * Detailed analysis of a single claim
 */
export interface ClaimAnalysis {
  /** The original claim text */
  claim: string;
  /** Type of claim (file, function, class, variable, etc.) */
  type: ClaimType;
  /** The entity being referenced */
  entity: string;
  /** Whether evidence was found */
  hasEvidence: boolean;
  /** The evidence found (if any) */
  evidence?: string;
  /** Confidence in the assessment (0-1) */
  confidence: number;
}

/**
 * Types of claims that can be detected
 */
export type ClaimType =
  | 'file'
  | 'function'
  | 'class'
  | 'method'
  | 'variable'
  | 'interface'
  | 'type'
  | 'module'
  | 'package'
  | 'directory'
  | 'config'
  | 'api'
  | 'database'
  | 'unknown';

/**
 * Configuration options for the grounding checker
 */
export interface GroundingCheckerOptions {
  /** Minimum score to consider response grounded (0-1) */
  minGroundingScore?: number;
  /** Whether to use strict matching (exact vs fuzzy) */
  strictMatching?: boolean;
  /** Whether to include detailed analysis in results */
  includeDetails?: boolean;
  /** Custom claim patterns to detect */
  customPatterns?: ClaimPattern[];
  /** Enable debug logging */
  debug?: boolean;
  /** Language for pattern matching (supports 'en' and 'pl') */
  language?: 'en' | 'pl' | 'both';
}

/**
 * Pattern for detecting claims in text
 */
export interface ClaimPattern {
  /** Regex pattern to match */
  pattern: RegExp;
  /** Type of claim this pattern detects */
  type: ClaimType;
  /** Capture group index for the entity name */
  entityGroup: number;
  /** Human-readable description */
  description: string;
}

/**
 * Default claim patterns for English and Polish
 */
const DEFAULT_PATTERNS: ClaimPattern[] = [
  // English patterns
  {
    pattern: /(?:in|the)\s+file\s+[`"']?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`"']?/gi,
    type: 'file',
    entityGroup: 1,
    description: 'File reference (English)',
  },
  {
    pattern: /(?:function|method|func)\s+[`"']?([a-zA-Z_][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'function',
    entityGroup: 1,
    description: 'Function reference (English)',
  },
  {
    pattern: /(?:class|Class)\s+[`"']?([A-Z][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'class',
    entityGroup: 1,
    description: 'Class reference (English)',
  },
  {
    pattern: /(?:interface|Interface)\s+[`"']?([A-Z][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'interface',
    entityGroup: 1,
    description: 'Interface reference (English)',
  },
  {
    pattern: /(?:type|Type)\s+[`"']?([A-Z][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'type',
    entityGroup: 1,
    description: 'Type reference (English)',
  },
  {
    pattern: /(?:variable|const|let|var)\s+[`"']?([a-zA-Z_][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'variable',
    entityGroup: 1,
    description: 'Variable reference (English)',
  },
  {
    pattern: /(?:module|package)\s+[`"']?([a-zA-Z_][a-zA-Z0-9_\-./]*)[`"']?/gi,
    type: 'module',
    entityGroup: 1,
    description: 'Module/package reference (English)',
  },
  {
    pattern: /(?:directory|folder|dir)\s+[`"']?([a-zA-Z0-9_\-./\\]+)[`"']?/gi,
    type: 'directory',
    entityGroup: 1,
    description: 'Directory reference (English)',
  },
  {
    pattern: /\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g,
    type: 'method',
    entityGroup: 1,
    description: 'Method call',
  },

  // Polish patterns
  {
    pattern: /w\s+pliku\s+[`"']?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`"']?/gi,
    type: 'file',
    entityGroup: 1,
    description: 'File reference (Polish: w pliku X)',
  },
  {
    pattern: /plik\s+[`"']?([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)[`"']?/gi,
    type: 'file',
    entityGroup: 1,
    description: 'File reference (Polish: plik X)',
  },
  {
    pattern: /funkcja\s+[`"']?([a-zA-Z_][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'function',
    entityGroup: 1,
    description: 'Function reference (Polish: funkcja Y)',
  },
  {
    pattern: /funkcji\s+[`"']?([a-zA-Z_][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'function',
    entityGroup: 1,
    description: 'Function reference (Polish: funkcji Y)',
  },
  {
    pattern: /klasa\s+[`"']?([A-Z][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'class',
    entityGroup: 1,
    description: 'Class reference (Polish: klasa Z)',
  },
  {
    pattern: /klasie\s+[`"']?([A-Z][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'class',
    entityGroup: 1,
    description: 'Class reference (Polish: w klasie Z)',
  },
  {
    pattern: /klasy\s+[`"']?([A-Z][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'class',
    entityGroup: 1,
    description: 'Class reference (Polish: klasy Z)',
  },
  {
    pattern: /metoda\s+[`"']?([a-zA-Z_][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'method',
    entityGroup: 1,
    description: 'Method reference (Polish: metoda X)',
  },
  {
    pattern: /metodzie\s+[`"']?([a-zA-Z_][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'method',
    entityGroup: 1,
    description: 'Method reference (Polish: w metodzie X)',
  },
  {
    pattern: /interfejs\s+[`"']?([A-Z][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'interface',
    entityGroup: 1,
    description: 'Interface reference (Polish: interfejs X)',
  },
  {
    pattern: /typ\s+[`"']?([A-Z][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'type',
    entityGroup: 1,
    description: 'Type reference (Polish: typ X)',
  },
  {
    pattern: /zmienna\s+[`"']?([a-zA-Z_][a-zA-Z0-9_]*)[`"']?/gi,
    type: 'variable',
    entityGroup: 1,
    description: 'Variable reference (Polish: zmienna X)',
  },
  {
    pattern: /katalog(?:u|iem)?\s+[`"']?([a-zA-Z0-9_\-./\\]+)[`"']?/gi,
    type: 'directory',
    entityGroup: 1,
    description: 'Directory reference (Polish: katalog/katalogu/katalogiem X)',
  },
  {
    pattern: /folderze?\s+[`"']?([a-zA-Z0-9_\-./\\]+)[`"']?/gi,
    type: 'directory',
    entityGroup: 1,
    description: 'Folder reference (Polish: folder/folderze X)',
  },

  // Code-specific patterns (language-agnostic)
  {
    pattern: /import\s+(?:\{[^}]*\}\s+from\s+)?[`"']([^`"']+)[`"']/gi,
    type: 'module',
    entityGroup: 1,
    description: 'Import statement',
  },
  {
    pattern: /require\s*\(\s*[`"']([^`"']+)[`"']\s*\)/gi,
    type: 'module',
    entityGroup: 1,
    description: 'Require statement',
  },
  {
    pattern: /export\s+(?:class|interface|type|function|const)\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
    type: 'unknown',
    entityGroup: 1,
    description: 'Export statement',
  },
];

/**
 * BUG-006 FIX: Whitelist of standard library functions/methods/modules
 * These should NEVER be flagged as hallucinations
 */
const STANDARD_LIBRARY_WHITELIST = new Set([
  // JavaScript built-in methods
  'stringify',
  'parse',
  'tostring',
  'valueof',
  'indexof',
  'includes',
  'slice',
  'splice',
  'push',
  'pop',
  'shift',
  'unshift',
  'map',
  'filter',
  'reduce',
  'foreach',
  'find',
  'findindex',
  'some',
  'every',
  'join',
  'split',
  'replace',
  'match',
  'test',
  'exec',
  'keys',
  'values',
  'entries',
  'assign',
  'freeze',
  'seal',
  'create',
  'defineproperty',
  'getownpropertynames',
  'promise',
  'then',
  'catch',
  'finally',
  'resolve',
  'reject',
  'all',
  'race',
  'allsettled',
  'settimeout',
  'setinterval',
  'cleartimeout',
  'clearinterval',
  'requestanimationframe',
  'fetch',
  'json',
  'text',
  'blob',
  'arraybuffer',
  'formdata',
  'console',
  'log',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'table',
  'dir',
  'math',
  'floor',
  'ceil',
  'round',
  'abs',
  'min',
  'max',
  'random',
  'sqrt',
  'pow',
  'date',
  'now',
  'gettime',
  'toiso',
  'toisostring',
  'tolocaledatestring',
  'array',
  'object',
  'string',
  'number',
  'boolean',
  'symbol',
  'bigint',
  'function',
  'regexp',
  'error',
  'typeerror',
  'syntaxerror',
  'rangeerror',
  'referenceerror',
  'map',
  'set',
  'weakmap',
  'weakset',
  'proxy',
  'reflect',
  'buffer',
  'uint8array',
  'int32array',
  'float64array',
  'arraybuffer',
  'dataview',
  'nan',
  'infinity',
  'undefined',
  'null',
  'globalthis',
  'this',
  // Node.js built-in modules/functions
  'fs',
  'path',
  'os',
  'util',
  'http',
  'https',
  'url',
  'querystring',
  'crypto',
  'zlib',
  'child_process',
  'cluster',
  'dgram',
  'dns',
  'domain',
  'events',
  'net',
  'readline',
  'stream',
  'tls',
  'tty',
  'v8',
  'vm',
  'worker_threads',
  'perf_hooks',
  'readfile',
  'writefile',
  'readdir',
  'mkdir',
  'rmdir',
  'stat',
  'existssync',
  'accesssync',
  'dirname',
  'basename',
  'extname',
  'join',
  'resolve',
  'relative',
  'isabsolute',
  'normalize',
  'promisify',
  'inspect',
  'format',
  'deprecate',
  'inherits',
  'exec',
  'execsync',
  'spawn',
  'fork',
  'execfile',
  'createserver',
  'listen',
  'get',
  'post',
  'put',
  'delete',
  'request',
  'response',
  'emit',
  'on',
  'once',
  'off',
  'removelistener',
  'addlistener',
  'removealllisteners',
  'pipe',
  'unpipe',
  'read',
  'write',
  'end',
  'destroy',
  'close',
  // TypeScript specific
  'partial',
  'required',
  'readonly',
  'record',
  'pick',
  'omit',
  'exclude',
  'extract',
  'nonnullable',
  'returntype',
  'parameters',
  'constructorparameters',
  'instancetype',
  // Common patterns
  'createpayload',
  'runcommand',
  'executecommand',
  'handleerror',
  'validateinput',
  'init',
  'initialize',
  'setup',
  'configure',
  'start',
  'stop',
  'reset',
  'clear',
  'get',
  'set',
  'add',
  'remove',
  'update',
  'delete',
  'create',
  'destroy',
  'load',
  'save',
  'import',
  'export',
  'parse',
  'serialize',
  'deserialize',
  'encode',
  'decode',
  'encrypt',
  'decrypt',
  'hash',
  'sign',
  'verify',
  'connect',
  'disconnect',
  'send',
  'receive',
  'subscribe',
  'unsubscribe',
  'publish',
  'validate',
  'sanitize',
  'normalize',
  'transform',
  'convert',
  'format',
  'tostring',
  'tojson',
  'fromjson',
  'clone',
  'copy',
  'merge',
  'extend',
]);

/**
 * Default configuration
 */
const DEFAULT_OPTIONS: Required<GroundingCheckerOptions> = {
  minGroundingScore: 0.7,
  strictMatching: false,
  includeDetails: true,
  customPatterns: [],
  debug: false,
  language: 'both',
};

/**
 * FactualGroundingChecker - Validates claims in responses against context
 */
export class FactualGroundingChecker {
  private options: Required<GroundingCheckerOptions>;
  private patterns: ClaimPattern[];
  private contextIndex: Map<string, Set<string>> = new Map();

  constructor(options: GroundingCheckerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.patterns = [...DEFAULT_PATTERNS, ...this.options.customPatterns];
  }

  /**
   * Check if a response is grounded in the available context
   */
  checkGrounding(response: string, availableContext: string[]): GroundingResult {
    // Build index from context
    this.buildContextIndex(availableContext);

    // Extract claims from response
    const claims = this.extractClaims(response);

    if (claims.length === 0) {
      return {
        isGrounded: true,
        groundedClaims: [],
        ungroundedClaims: [],
        score: 1.0,
        details: [],
        warnings: [],
      };
    }

    // Analyze each claim
    const analyses: ClaimAnalysis[] = claims.map((claim) => this.analyzeClaim(claim));

    // Calculate results
    const groundedClaims = analyses
      .filter((a) => a.hasEvidence)
      .map((a) => `${a.type}: ${a.entity}`);

    const ungroundedClaims = analyses
      .filter((a) => !a.hasEvidence)
      .map((a) => `${a.type}: ${a.entity}`);

    const score = this.calculateScore(analyses);
    const isGrounded = score >= this.options.minGroundingScore;

    // Generate warnings
    const warnings = this.generateWarnings(analyses, ungroundedClaims);

    if (this.options.debug) {
      this.logDebugInfo(analyses, score, isGrounded);
    }

    const result: GroundingResult = {
      isGrounded,
      groundedClaims,
      ungroundedClaims,
      score,
      warnings,
    };

    if (this.options.includeDetails) {
      result.details = analyses;
    }

    return result;
  }

  /**
   * Build an index of entities from the context for fast lookup
   */
  private buildContextIndex(context: string[]): void {
    this.contextIndex.clear();

    // Initialize sets for each type
    const types: ClaimType[] = [
      'file',
      'function',
      'class',
      'method',
      'variable',
      'interface',
      'type',
      'module',
      'directory',
      'config',
      'api',
      'database',
    ];
    for (const type of types) {
      this.contextIndex.set(type, new Set());
    }

    const fullContext = context.join('\n');

    // Extract entities from context using patterns
    for (const pattern of this.patterns) {
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
      for (let match = regex.exec(fullContext); match !== null; match = regex.exec(fullContext)) {
        const entity = match[pattern.entityGroup];
        if (entity) {
          this.contextIndex.get(pattern.type)?.add(entity.toLowerCase());
          // Also add without extension for files
          if (pattern.type === 'file') {
            const baseName = entity.replace(/\.[^.]+$/, '');
            this.contextIndex.get('file')?.add(baseName.toLowerCase());
          }
        }
      }
    }

    // Also do a simple word-based extraction for common patterns
    this.extractSimplePatterns(fullContext);
  }

  /**
   * Extract simple patterns like CamelCase classes, file paths, etc.
   */
  private extractSimplePatterns(context: string): void {
    // CamelCase identifiers (likely classes/interfaces/types)
    const camelCasePattern = /\b([A-Z][a-zA-Z0-9]*(?:[A-Z][a-zA-Z0-9]*)+)\b/g;
    for (
      let match = camelCasePattern.exec(context);
      match !== null;
      match = camelCasePattern.exec(context)
    ) {
      this.contextIndex.get('class')?.add(match[1].toLowerCase());
      this.contextIndex.get('interface')?.add(match[1].toLowerCase());
      this.contextIndex.get('type')?.add(match[1].toLowerCase());
    }

    // File paths
    const filePathPattern = /([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\.[a-zA-Z0-9]+)/g;
    for (
      let match = filePathPattern.exec(context);
      match !== null;
      match = filePathPattern.exec(context)
    ) {
      this.contextIndex.get('file')?.add(match[1].toLowerCase());
    }

    // Function definitions in various languages
    const funcPatterns = [
      /function\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
      /const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g,
      /def\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
      /fn\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
      /func\s+([a-zA-Z_][a-zA-Z0-9_]*)/g,
    ];
    for (const pattern of funcPatterns) {
      for (let match = pattern.exec(context); match !== null; match = pattern.exec(context)) {
        this.contextIndex.get('function')?.add(match[1].toLowerCase());
      }
    }
  }

  /**
   * Extract claims from response text
   */
  private extractClaims(
    response: string,
  ): Array<{ text: string; type: ClaimType; entity: string }> {
    const claims: Array<{ text: string; type: ClaimType; entity: string }> = [];
    const seen = new Set<string>();

    for (const pattern of this.patterns) {
      const regex = new RegExp(pattern.pattern.source, pattern.pattern.flags);
      for (let match = regex.exec(response); match !== null; match = regex.exec(response)) {
        const entity = match[pattern.entityGroup];
        if (entity) {
          const key = `${pattern.type}:${entity.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            claims.push({
              text: match[0],
              type: pattern.type,
              entity,
            });
          }
        }
      }
    }

    return claims;
  }

  /**
   * Analyze a single claim against the context
   */
  private analyzeClaim(claim: { text: string; type: ClaimType; entity: string }): ClaimAnalysis {
    const entityLower = claim.entity.toLowerCase();
    const typeSet = this.contextIndex.get(claim.type);

    let hasEvidence = false;
    let evidence: string | undefined;
    let confidence = 0;

    // BUG-006 FIX: Check whitelist first - standard library entities are always valid
    if (STANDARD_LIBRARY_WHITELIST.has(entityLower)) {
      return {
        claim: claim.text,
        type: claim.type,
        entity: claim.entity,
        hasEvidence: true, // Always trust standard library
        evidence: `[standard library: ${claim.entity}]`,
        confidence: 1.0,
      };
    }

    if (typeSet) {
      if (this.options.strictMatching) {
        // Exact match
        hasEvidence = typeSet.has(entityLower);
        confidence = hasEvidence ? 1.0 : 0.0;
      } else {
        // Fuzzy match
        for (const contextEntity of typeSet) {
          const similarity = this.calculateSimilarity(entityLower, contextEntity);
          if (similarity > 0.8) {
            hasEvidence = true;
            evidence = contextEntity;
            confidence = similarity;
            break;
          }
        }

        // If no match in primary type, check related types
        if (!hasEvidence) {
          const relatedTypes = this.getRelatedTypes(claim.type);
          for (const relatedType of relatedTypes) {
            const relatedSet = this.contextIndex.get(relatedType);
            if (relatedSet) {
              for (const contextEntity of relatedSet) {
                const similarity = this.calculateSimilarity(entityLower, contextEntity);
                if (similarity > 0.8) {
                  hasEvidence = true;
                  evidence = contextEntity;
                  confidence = similarity * 0.9; // Slightly lower confidence for related types
                  break;
                }
              }
            }
            if (hasEvidence) break;
          }
        }
      }
    }

    return {
      claim: claim.text,
      type: claim.type,
      entity: claim.entity,
      hasEvidence,
      evidence,
      confidence: hasEvidence ? confidence : 0,
    };
  }

  /**
   * Get related types for fuzzy matching
   */
  private getRelatedTypes(type: ClaimType): ClaimType[] {
    const relations: Record<ClaimType, ClaimType[]> = {
      function: ['method'],
      method: ['function'],
      class: ['interface', 'type'],
      interface: ['class', 'type'],
      type: ['class', 'interface'],
      file: ['module'],
      module: ['file', 'package'],
      package: ['module'],
      variable: [],
      directory: [],
      config: ['file'],
      api: ['function', 'method'],
      database: [],
      unknown: [],
    };
    return relations[type] || [];
  }

  /**
   * Calculate similarity between two strings (Levenshtein-based)
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    // Check for substring match
    if (a.includes(b) || b.includes(a)) {
      return 0.9;
    }

    // Levenshtein distance
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    const distance = matrix[b.length][a.length];
    const maxLen = Math.max(a.length, b.length);
    return 1 - distance / maxLen;
  }

  /**
   * Calculate overall grounding score
   */
  private calculateScore(analyses: ClaimAnalysis[]): number {
    if (analyses.length === 0) return 1.0;

    // Weight by confidence
    const totalWeight = analyses.reduce((sum, a) => sum + (a.hasEvidence ? a.confidence : 1), 0);
    const groundedWeight = analyses.reduce((sum, a) => sum + (a.hasEvidence ? a.confidence : 0), 0);

    return groundedWeight / totalWeight;
  }

  /**
   * Generate warnings for problematic claims
   */
  private generateWarnings(analyses: ClaimAnalysis[], ungroundedClaims: string[]): string[] {
    const warnings: string[] = [];

    if (ungroundedClaims.length > 0) {
      warnings.push(`Found ${ungroundedClaims.length} claim(s) without evidence in context`);
    }

    // Check for specific patterns
    const fileHallucinations = analyses.filter((a) => a.type === 'file' && !a.hasEvidence);
    if (fileHallucinations.length > 0) {
      warnings.push(
        `Potential file hallucinations: ${fileHallucinations.map((a) => a.entity).join(', ')}`,
      );
    }

    const classHallucinations = analyses.filter(
      (a) => (a.type === 'class' || a.type === 'interface') && !a.hasEvidence,
    );
    if (classHallucinations.length > 0) {
      warnings.push(
        `Potential class/interface hallucinations: ${classHallucinations.map((a) => a.entity).join(', ')}`,
      );
    }

    const functionHallucinations = analyses.filter(
      (a) => (a.type === 'function' || a.type === 'method') && !a.hasEvidence,
    );
    if (functionHallucinations.length > 0) {
      warnings.push(
        `Potential function/method hallucinations: ${functionHallucinations.map((a) => a.entity).join(', ')}`,
      );
    }

    return warnings;
  }

  /**
   * Log debug information
   */
  private logDebugInfo(analyses: ClaimAnalysis[], score: number, isGrounded: boolean): void {
    console.log(chalk.cyan('\n[FactualGrounding] Debug Info:'));
    console.log(chalk.gray(`  Total claims: ${analyses.length}`));
    console.log(chalk.gray(`  Grounded: ${analyses.filter((a) => a.hasEvidence).length}`));
    console.log(chalk.gray(`  Ungrounded: ${analyses.filter((a) => !a.hasEvidence).length}`));
    console.log(chalk.gray(`  Score: ${(score * 100).toFixed(1)}%`));
    console.log(chalk.gray(`  Is grounded: ${isGrounded ? chalk.green('YES') : chalk.red('NO')}`));

    if (analyses.length > 0) {
      console.log(chalk.gray('\n  Claims:'));
      for (const analysis of analyses) {
        const status = analysis.hasEvidence ? chalk.green('[OK]') : chalk.red('[!!]');
        console.log(chalk.gray(`    ${status} ${analysis.type}: ${analysis.entity}`));
        if (analysis.evidence) {
          console.log(chalk.gray(`        Evidence: ${analysis.evidence}`));
        }
      }
    }
  }

  /**
   * Update configuration
   */
  setOptions(options: Partial<GroundingCheckerOptions>): void {
    this.options = { ...this.options, ...options };
    if (options.customPatterns) {
      this.patterns = [...DEFAULT_PATTERNS, ...options.customPatterns];
    }
  }

  /**
   * Add custom patterns
   */
  addPatterns(patterns: ClaimPattern[]): void {
    this.patterns.push(...patterns);
  }

  /**
   * Get current configuration
   */
  getOptions(): Required<GroundingCheckerOptions> {
    return { ...this.options };
  }

  /**
   * Clear the context index
   */
  clearIndex(): void {
    this.contextIndex.clear();
  }

  /**
   * Register a task for factual grounding validation
   * This is a stub method - actual grounding check happens via checkGrounding()
   */
  registerTask(taskId: number, taskDescription: string, rootDir?: string): void {
    // Store task context for later validation
    if (!this.registeredTasks) {
      this.registeredTasks = new Map();
    }
    this.registeredTasks.set(taskId, {
      taskId,
      taskDescription,
      rootDir,
      registeredAt: Date.now(),
    });
  }

  /**
   * Validate a response against registered task context
   * @param taskId - The task ID to validate against
   * @param responseText - The response text to validate
   * @returns Validation result with isGrounded flag and issues array
   */
  validateResponse(
    taskId: number,
    responseText: string,
  ): { isGrounded: boolean; issues: string[] } {
    const issues: string[] = [];
    let isGrounded = true;

    // Get registered task context
    const taskContext = this.registeredTasks?.get(taskId);

    if (!taskContext) {
      // No context registered, do basic validation
      const claims = this.extractClaims(responseText);
      for (const claim of claims) {
        const analysis = this.analyzeClaim(claim);
        if (!analysis.hasEvidence && analysis.confidence > 0.5) {
          issues.push(`Ungrounded claim: "${claim.text.substring(0, 50)}..."`);
          if (issues.length >= 3) {
            isGrounded = false;
          }
        }
      }
    } else {
      // Use task context for grounding check
      const context = `Task: ${taskContext.taskDescription}\nRoot: ${taskContext.rootDir || 'not specified'}`;
      const result = this.checkGrounding(responseText, [context]);
      isGrounded = result.isGrounded;
      if (result.warnings) {
        issues.push(...result.warnings);
      }
      if (result.ungroundedClaims) {
        for (const claim of result.ungroundedClaims) {
          issues.push(`Ungrounded: ${claim.substring(0, 60)}...`);
        }
      }
    }

    return { isGrounded, issues };
  }

  private registeredTasks?: Map<
    number,
    { taskId: number; taskDescription: string; rootDir?: string; registeredAt: number }
  >;
}

/**
 * Quick validation function for simple use cases
 */
export function validateGrounding(
  response: string,
  context: string[],
  minScore: number = 0.7,
): boolean {
  const checker = new FactualGroundingChecker({ minGroundingScore: minScore });
  const result = checker.checkGrounding(response, context);
  return result.isGrounded;
}

/**
 * Get detailed grounding analysis
 */
export function analyzeGrounding(response: string, context: string[]): GroundingResult {
  const checker = new FactualGroundingChecker({ includeDetails: true });
  return checker.checkGrounding(response, context);
}

// Default instance for convenience
export const factualGroundingChecker = new FactualGroundingChecker();

export default FactualGroundingChecker;

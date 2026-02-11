/**
 * OutputSanitizer - Sanitizes all agent outputs before final report synthesis
 * Solution 28: Output Sanitization
 *
 * This module filters agent responses to remove:
 * - Speculative language ("mozna by", "prawdopodobnie", "byc moze")
 * - Generic/placeholder names (file1.ts, Class1, etc.)
 * - Unverified claims and fabricated content
 *
 * Usage:
 *   import { outputSanitizer, sanitizeOutput } from './OutputSanitizer.js';
 *   const result = sanitizeOutput(agentResponse, { removeSpeculativeLanguage: true });
 */

import chalk from 'chalk';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Configuration options for output sanitization
 */
export interface SanitizeOptions {
  /** Remove speculative phrases like "mozna by", "prawdopodobnie", "byc moze" */
  removeSpeculativeLanguage: boolean;
  /** Replace generic names (file1.ts, Class1) with "[NAZWA_NIEZNANA]" marker */
  removeGenericNames: boolean;
  /** Add warnings when content seems fabricated */
  removeUnverifiedClaims: boolean;
  /** Enable verbose logging of sanitization */
  verbose?: boolean;
  /** Custom patterns to remove (in addition to defaults) */
  customPatterns?: RegExp[];
  /** Whitelist patterns that should NOT be replaced */
  whitelist?: RegExp[];
}

/**
 * Result of sanitization process
 */
export interface SanitizedOutput {
  /** Sanitized content */
  content: string;
  /** List of patterns that were removed/replaced */
  removedPatterns: string[];
  /** Warnings added to the output */
  warningsAdded: string[];
  /** Statistics about the sanitization */
  stats: SanitizationStats;
}

/**
 * Statistics from sanitization process
 */
export interface SanitizationStats {
  /** Total number of patterns matched */
  totalMatches: number;
  /** Number of speculative phrases removed */
  speculativeRemoved: number;
  /** Number of generic names replaced */
  genericNamesReplaced: number;
  /** Number of unverified claims flagged */
  unverifiedClaimsFlagged: number;
  /** Original content length */
  originalLength: number;
  /** Sanitized content length */
  sanitizedLength: number;
  /** Percentage of content modified */
  modificationPercent: number;
}

// =============================================================================
// PATTERN DEFINITIONS
// =============================================================================

/**
 * Speculative language patterns (Polish and English)
 * These indicate uncertainty or proposals instead of facts
 */
const SPECULATIVE_PATTERNS: { pattern: RegExp; replacement: string; description: string }[] = [
  // Polish speculative phrases
  { pattern: /\bmozna by\b/gi, replacement: '', description: 'mozna by' },
  { pattern: /\bmoze by\b/gi, replacement: '', description: 'moze by' },
  { pattern: /\bprawdopodobnie\b/gi, replacement: '', description: 'prawdopodobnie' },
  { pattern: /\bbyc moze\b/gi, replacement: '', description: 'byc moze' },
  { pattern: /\bbyc może\b/gi, replacement: '', description: 'byc moze' },
  { pattern: /\bsugeruje\b/gi, replacement: '', description: 'sugeruje' },
  { pattern: /\bsugeruję\b/gi, replacement: '', description: 'sugeruje' },
  { pattern: /\bwarto by\b/gi, replacement: '', description: 'warto by' },
  { pattern: /\bnalezaloby\b/gi, replacement: '', description: 'nalezaloby' },
  { pattern: /\bnależałoby\b/gi, replacement: '', description: 'nalezaloby' },
  { pattern: /\bmozliwe ze\b/gi, replacement: '', description: 'mozliwe ze' },
  { pattern: /\bmożliwe że\b/gi, replacement: '', description: 'mozliwe ze' },
  { pattern: /\bchyba\b/gi, replacement: '', description: 'chyba' },
  { pattern: /\bpewnie\b/gi, replacement: '', description: 'pewnie' },
  { pattern: /\braczej\b/gi, replacement: '', description: 'raczej' },
  { pattern: /\bzakladam\b/gi, replacement: '', description: 'zakladam' },
  { pattern: /\bzakładam\b/gi, replacement: '', description: 'zakladam' },
  { pattern: /\bzakladajac\b/gi, replacement: '', description: 'zakladajac' },
  { pattern: /\bzakładając\b/gi, replacement: '', description: 'zakladajac' },

  // Polish proposal phrases (agent proposes instead of executes)
  {
    pattern: /\bmozna\s+(?:dodac|zaimplementowac|stworzyc|napisac)\b/gi,
    replacement: '[PROPOZYCJA]',
    description: 'mozna + action',
  },
  {
    pattern: /\bmożna\s+(?:dodać|zaimplementować|stworzyć|napisać)\b/gi,
    replacement: '[PROPOZYCJA]',
    description: 'mozna + action',
  },
  {
    pattern: /\bproponuje\s+(?:dodac|zaimplementowac|stworzyc|napisac)\b/gi,
    replacement: '[PROPOZYCJA]',
    description: 'proponuje + action',
  },
  {
    pattern: /\bproponuję\s+(?:dodać|zaimplementować|stworzyć|napisać)\b/gi,
    replacement: '[PROPOZYCJA]',
    description: 'proponuje + action',
  },

  // English speculative phrases
  { pattern: /\bprobably\b/gi, replacement: '', description: 'probably' },
  { pattern: /\bperhaps\b/gi, replacement: '', description: 'perhaps' },
  { pattern: /\bmaybe\b/gi, replacement: '', description: 'maybe' },
  { pattern: /\bmight\b/gi, replacement: '', description: 'might' },
  { pattern: /\bcould be\b/gi, replacement: '', description: 'could be' },
  { pattern: /\bI think\b/gi, replacement: '', description: 'I think' },
  { pattern: /\bI believe\b/gi, replacement: '', description: 'I believe' },
  { pattern: /\bI assume\b/gi, replacement: '', description: 'I assume' },
  { pattern: /\bassuming\b/gi, replacement: '', description: 'assuming' },
  { pattern: /\bshould work\b/gi, replacement: '', description: 'should work' },

  // English proposal phrases
  { pattern: /\byou could\b/gi, replacement: '[SUGGESTION]', description: 'you could' },
  { pattern: /\byou can\b/gi, replacement: '[SUGGESTION]', description: 'you can' },
  { pattern: /\byou should\b/gi, replacement: '[SUGGESTION]', description: 'you should' },
  {
    pattern: /\byou might want to\b/gi,
    replacement: '[SUGGESTION]',
    description: 'you might want to',
  },
  {
    pattern: /\bconsider\s+(?:adding|implementing|creating|using)\b/gi,
    replacement: '[SUGGESTION]',
    description: 'consider + action',
  },
];

/**
 * Generic name patterns that indicate hallucination
 */
const GENERIC_NAME_PATTERNS: { pattern: RegExp; description: string }[] = [
  // Files with numbers
  {
    pattern:
      /\b(?:file|class|component|module|service|helper|util|test|spec)\d+\.(ts|js|tsx|jsx|py|java)\b/gi,
    description: 'numbered file',
  },

  // Classes with numbers
  {
    pattern:
      /\b(?:Class|File|Test|Helper|Utils?|Service|Component|Module|Handler|Manager|Controller|Factory)\d+\b/g,
    description: 'numbered class',
  },

  // Common placeholders
  {
    pattern: /\b(?:foo|bar|baz|qux|quux|corge|grault|garply|waldo|fred|plugh|xyzzy|thud)\b/gi,
    description: 'placeholder name',
  },

  // Example/sample files
  {
    pattern: /\b(?:example|sample|demo|dummy|mock|fake|temp|tmp)\d*\.(ts|js|tsx|jsx)\b/gi,
    description: 'example file',
  },

  // Generic function names
  {
    pattern: /\bfunction\s+(?:doSomething|handleIt|processData|myFunction|testFunc|func\d+)\b/gi,
    description: 'generic function',
  },

  // Fake paths
  {
    pattern:
      /(?:\/path\/to\/|C:\\path\\to\\|\/your\/|\/user\/project\/|src\/components\/Example)/gi,
    description: 'fake path',
  },

  // MyXxx pattern often used as example
  { pattern: /\bMy[A-Z][a-zA-Z]+\d*\.(ts|js|tsx|jsx)\b/g, description: 'MyXxx file pattern' },
];

/**
 * Patterns indicating unverified/fabricated claims
 */
const UNVERIFIED_CLAIM_PATTERNS: { pattern: RegExp; warning: string }[] = [
  // Claims about file contents without evidence
  {
    pattern:
      /(?:plik|file)\s+(?:zawiera|contains)\s+[^.]+(?:klasy?|classes?|funkcj[ei]|functions?)/gi,
    warning: '[NIEZWERYFIKOWANE: Twierdzenie o zawartosci pliku bez cytatu]',
  },

  // Vague implementation claims
  {
    pattern:
      /(?:zaimplementowano|implemented|dodano|added)\s+(?:logike|logic|funkcjonalnosc|functionality)/gi,
    warning: '[NIEZWERYFIKOWANE: Ogolne twierdzenie o implementacji]',
  },

  // Unspecified "changes made"
  {
    pattern: /(?:wprowadzono|made)\s+(?:zmiany|changes)\s+(?:w|in|to)\s+[^.]+/gi,
    warning: '[NIEZWERYFIKOWANE: Nieokreslone zmiany]',
  },

  // Future-oriented statements (proposal not execution)
  {
    pattern:
      /\b(?:I will|I would|I'll|I'm going to|Let me)\s+(?:create|write|implement|add|fix)\b/gi,
    warning: '[OSTRZEZENIE: Agent proponuje zamiast wykonac]',
  },
  {
    pattern:
      /\b(?:Moge|Bede|Zamierzam|Powinienem)\s+(?:stworzyc|napisac|zaimplementowac|dodac)\b/gi,
    warning: '[OSTRZEZENIE: Agent proponuje zamiast wykonac]',
  },

  // Example code indicators
  {
    pattern: /(?:na przyklad|for example|oto przyklad|here's an example|przykladowo)/gi,
    warning: '[OSTRZEZENIE: Kod moze byc przykladem, nie rzeczywista implementacja]',
  },

  // Hypothetical responses
  {
    pattern: /(?:if you want|jesli chcesz|optionally|opcjonalnie|alternatively|alternatywnie)/gi,
    warning: '[UWAGA: Odpowiedz hipotetyczna]',
  },
];

/**
 * Whitelist patterns - real project files/names that should not be flagged
 */
const DEFAULT_WHITELIST: RegExp[] = [
  /index\.(ts|js|tsx|jsx)$/i,
  /main\.(ts|js|tsx|jsx)$/i,
  /App\.(ts|js|tsx|jsx)$/i,
  /utils?\.(ts|js)$/i,
  /helpers?\.(ts|js)$/i,
  /types?\.(ts|d\.ts)$/i,
  /config\.(ts|js|json)$/i,
  /package\.json$/i,
  /tsconfig\.json$/i,
  /\.env$/i,
  /README\.md$/i,
];

// =============================================================================
// MARKER CONSTANT
// =============================================================================

/** Marker used to replace unknown/generic names */
export const UNKNOWN_NAME_MARKER = '[NAZWA_NIEZNANA]';

// =============================================================================
// OUTPUT SANITIZER CLASS
// =============================================================================

/**
 * OutputSanitizer class for cleaning agent outputs
 */
export class OutputSanitizer {
  private options: SanitizeOptions;
  private whitelist: RegExp[];

  constructor(defaultOptions?: Partial<SanitizeOptions>) {
    this.options = {
      removeSpeculativeLanguage: true,
      removeGenericNames: true,
      removeUnverifiedClaims: true,
      verbose: false,
      ...defaultOptions,
    };
    this.whitelist = [...DEFAULT_WHITELIST, ...(defaultOptions?.whitelist || [])];
  }

  /**
   * Main sanitization method
   */
  sanitize(content: string, options?: Partial<SanitizeOptions>): SanitizedOutput {
    const opts = { ...this.options, ...options };
    const whitelist = [...this.whitelist, ...(opts.whitelist || [])];

    let sanitized = content;
    const removedPatterns: string[] = [];
    const warningsAdded: string[] = [];
    const stats: SanitizationStats = {
      totalMatches: 0,
      speculativeRemoved: 0,
      genericNamesReplaced: 0,
      unverifiedClaimsFlagged: 0,
      originalLength: content.length,
      sanitizedLength: 0,
      modificationPercent: 0,
    };

    // 1. Remove speculative language
    if (opts.removeSpeculativeLanguage) {
      for (const { pattern, replacement, description } of SPECULATIVE_PATTERNS) {
        const matches = sanitized.match(pattern);
        if (matches && matches.length > 0) {
          stats.speculativeRemoved += matches.length;
          stats.totalMatches += matches.length;
          removedPatterns.push(`[SPECULATIVE] ${description}: ${matches.length} occurrence(s)`);

          if (opts.verbose) {
            console.log(
              chalk.yellow(
                `[Sanitizer] Removing speculative: "${description}" (${matches.length}x)`,
              ),
            );
          }

          // Replace with empty or marker, then clean up multiple spaces
          sanitized = sanitized.replace(pattern, replacement);
        }
      }

      // Add custom patterns
      if (opts.customPatterns) {
        for (const pattern of opts.customPatterns) {
          const matches = sanitized.match(pattern);
          if (matches && matches.length > 0) {
            stats.speculativeRemoved += matches.length;
            stats.totalMatches += matches.length;
            removedPatterns.push(`[CUSTOM] pattern: ${matches.length} occurrence(s)`);
            sanitized = sanitized.replace(pattern, '');
          }
        }
      }
    }

    // 2. Replace generic names with marker
    if (opts.removeGenericNames) {
      for (const { pattern, description } of GENERIC_NAME_PATTERNS) {
        const matches = sanitized.match(pattern);
        if (matches && matches.length > 0) {
          // Filter out whitelisted matches
          const filteredMatches = matches.filter((m) => !whitelist.some((wp) => wp.test(m)));

          if (filteredMatches.length > 0) {
            stats.genericNamesReplaced += filteredMatches.length;
            stats.totalMatches += filteredMatches.length;
            removedPatterns.push(`[GENERIC] ${description}: ${filteredMatches.join(', ')}`);

            if (opts.verbose) {
              console.log(
                chalk.red(`[Sanitizer] Generic name detected: "${filteredMatches.join(', ')}"`),
              );
            }

            // Replace each non-whitelisted match with marker
            for (const match of filteredMatches) {
              sanitized = sanitized.replace(
                new RegExp(this.escapeRegex(match), 'g'),
                UNKNOWN_NAME_MARKER,
              );
            }
          }
        }
      }
    }

    // 3. Add warnings for unverified claims
    if (opts.removeUnverifiedClaims) {
      for (const { pattern, warning } of UNVERIFIED_CLAIM_PATTERNS) {
        const matches = sanitized.match(pattern);
        if (matches && matches.length > 0) {
          stats.unverifiedClaimsFlagged += matches.length;
          stats.totalMatches += matches.length;

          // Add warning inline after each match (only first occurrence to avoid spam)
          const firstMatch = matches[0];
          if (!sanitized.includes(warning)) {
            sanitized = sanitized.replace(firstMatch, `${firstMatch} ${warning}`);
            warningsAdded.push(warning);

            if (opts.verbose) {
              console.log(chalk.magenta(`[Sanitizer] Added warning: ${warning}`));
            }
          }
        }
      }
    }

    // 4. Clean up multiple spaces and empty lines created by removals
    sanitized = sanitized
      .replace(/ {2,}/g, ' ')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();

    // Calculate final stats
    stats.sanitizedLength = sanitized.length;
    stats.modificationPercent = Math.round(
      ((stats.originalLength - stats.sanitizedLength) / stats.originalLength) * 100,
    );

    return {
      content: sanitized,
      removedPatterns,
      warningsAdded,
      stats,
    };
  }

  /**
   * Quick check if content contains suspicious patterns
   */
  hasSuspiciousContent(content: string): boolean {
    // Check for generic names
    for (const { pattern } of GENERIC_NAME_PATTERNS) {
      if (pattern.test(content)) {
        // Reset lastIndex for global patterns
        pattern.lastIndex = 0;
        const matches = content.match(pattern);
        if (matches) {
          // Check if any match is not whitelisted
          if (matches.some((m) => !this.whitelist.some((wp) => wp.test(m)))) {
            return true;
          }
        }
      }
    }

    // Check for heavy speculative language
    let speculativeCount = 0;
    for (const { pattern } of SPECULATIVE_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        speculativeCount += matches.length;
      }
    }

    // If more than 3 speculative phrases, flag as suspicious
    return speculativeCount > 3;
  }

  /**
   * Get sanitization summary for logging
   */
  getSummary(result: SanitizedOutput): string {
    const lines: string[] = [
      '=== OUTPUT SANITIZATION SUMMARY ===',
      `Original: ${result.stats.originalLength} chars`,
      `Sanitized: ${result.stats.sanitizedLength} chars (${result.stats.modificationPercent}% change)`,
      `Total matches: ${result.stats.totalMatches}`,
      `  - Speculative removed: ${result.stats.speculativeRemoved}`,
      `  - Generic names replaced: ${result.stats.genericNamesReplaced}`,
      `  - Unverified claims flagged: ${result.stats.unverifiedClaimsFlagged}`,
    ];

    if (result.removedPatterns.length > 0) {
      lines.push('Patterns removed:');
      for (const p of result.removedPatterns) lines.push(`  ${p}`);
    }

    if (result.warningsAdded.length > 0) {
      lines.push('Warnings added:');
      for (const w of result.warningsAdded) lines.push(`  ${w}`);
    }

    return lines.join('\n');
  }

  /**
   * Escape special regex characters in string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

// =============================================================================
// SINGLETON INSTANCE & CONVENIENCE FUNCTIONS
// =============================================================================

/** Global OutputSanitizer instance */
export const outputSanitizer = new OutputSanitizer();

/**
 * Convenience function to sanitize content
 */
export function sanitizeOutput(
  content: string,
  options?: Partial<SanitizeOptions>,
): SanitizedOutput {
  return outputSanitizer.sanitize(content, options);
}

/**
 * Quick check for suspicious content
 */
export function hasSuspiciousPatterns(content: string): boolean {
  return outputSanitizer.hasSuspiciousContent(content);
}

/**
 * Sanitize multiple outputs (e.g., from multiple agents)
 */
export function sanitizeMultipleOutputs(
  outputs: { id: number | string; content: string }[],
  options?: Partial<SanitizeOptions>,
): { id: number | string; result: SanitizedOutput }[] {
  return outputs.map((output) => ({
    id: output.id,
    result: outputSanitizer.sanitize(output.content, options),
  }));
}

/**
 * Log sanitization results to console
 */
export function logSanitizationResults(result: SanitizedOutput, prefix: string = ''): void {
  if (result.stats.totalMatches === 0) {
    console.log(chalk.green(`${prefix}[Sanitizer] No suspicious patterns found`));
    return;
  }

  const color =
    result.stats.genericNamesReplaced > 0
      ? chalk.red
      : result.stats.speculativeRemoved > 3
        ? chalk.yellow
        : chalk.gray;

  console.log(
    color(
      `${prefix}[Sanitizer] Modified: ${result.stats.modificationPercent}% | ` +
        `Generic: ${result.stats.genericNamesReplaced} | ` +
        `Speculative: ${result.stats.speculativeRemoved} | ` +
        `Unverified: ${result.stats.unverifiedClaimsFlagged}`,
    ),
  );

  if (result.warningsAdded.length > 0) {
    console.log(chalk.yellow(`${prefix}  Warnings: ${result.warningsAdded.join(', ')}`));
  }
}

// =============================================================================
// DEFAULT EXPORT
// =============================================================================

export default {
  OutputSanitizer,
  outputSanitizer,
  sanitizeOutput,
  hasSuspiciousPatterns,
  sanitizeMultipleOutputs,
  logSanitizationResults,
  UNKNOWN_NAME_MARKER,
  SPECULATIVE_PATTERNS,
  GENERIC_NAME_PATTERNS,
  UNVERIFIED_CLAIM_PATTERNS,
};

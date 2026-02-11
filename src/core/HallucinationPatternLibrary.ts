/**
 * HallucinationPatternLibrary - Solution #38
 * Comprehensive library of known hallucination patterns categorized by type.
 * Used to detect potential AI hallucinations in generated content.
 */

import chalk from 'chalk';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Categories of hallucination patterns
 */
export type HallucinationCategory =
  | 'generic_names'
  | 'fake_paths'
  | 'speculative_language'
  | 'proposal_language'
  | 'placeholder_content'
  | 'fabricated_details'
  | 'vague_claims';

/**
 * Severity levels for pattern matches
 */
export type PatternSeverity = 'low' | 'medium' | 'high';

/**
 * Pattern definition with metadata
 */
export interface HallucinationPattern {
  pattern: string; // Regex pattern string
  category: HallucinationCategory;
  severity: PatternSeverity;
  description: string; // Human-readable description
  compiled?: RegExp; // Compiled regex (cached)
}

/**
 * Result of pattern matching
 */
export interface PatternMatch {
  pattern: string;
  category: HallucinationCategory;
  severity: PatternSeverity;
  matched: string; // The actual matched text
  position: number; // Position in content
  description: string;
  context?: string; // Surrounding context (optional)
}

/**
 * Summary statistics for pattern analysis
 */
export interface PatternAnalysisSummary {
  totalMatches: number;
  byCategory: Record<HallucinationCategory, number>;
  bySeverity: Record<PatternSeverity, number>;
  riskScore: number; // 0-100, higher = more suspicious
  topPatterns: PatternMatch[];
  recommendation: string;
}

// ============================================================================
// DEFAULT PATTERNS LIBRARY (50+ patterns)
// ============================================================================

const DEFAULT_PATTERNS: HallucinationPattern[] = [
  // -------------------------------------------------------------------------
  // GENERIC NAMES (15 patterns)
  // -------------------------------------------------------------------------
  {
    pattern: '\\b(file1|file2|file3|fileA|fileB)\\.(ts|js|py|txt)\\b',
    category: 'generic_names',
    severity: 'high',
    description: 'Generic numbered file names (file1.ts, file2.js)',
  },
  {
    pattern: '\\b(Class1|Class2|ClassA|ClassB|MyClass|SampleClass)\\b',
    category: 'generic_names',
    severity: 'high',
    description: 'Generic class names',
  },
  {
    pattern: '\\b(test1|test2|testA|testB|testFile|testClass)\\b',
    category: 'generic_names',
    severity: 'medium',
    description: 'Generic test names',
  },
  {
    pattern: '\\b(helper|helpers|utils|utilities|common|misc)\\.(ts|js|py)\\b',
    category: 'generic_names',
    severity: 'low',
    description: 'Generic utility file names',
  },
  {
    pattern: '\\b(foo|bar|baz|qux|quux)\\b',
    category: 'generic_names',
    severity: 'medium',
    description: 'Placeholder variable names',
  },
  {
    pattern: '\\b(temp|tmp|temp1|temp2|tempVar)\\b',
    category: 'generic_names',
    severity: 'medium',
    description: 'Temporary variable names',
  },
  {
    pattern: '\\b(data|value|result|item|element|obj|object)\\d+\\b',
    category: 'generic_names',
    severity: 'medium',
    description: 'Numbered generic variable names',
  },
  {
    pattern: '\\b(func1|func2|function1|function2|myFunction|doSomething)\\b',
    category: 'generic_names',
    severity: 'high',
    description: 'Generic function names',
  },
  {
    pattern: '\\b(Component1|Component2|MyComponent|SampleComponent)\\b',
    category: 'generic_names',
    severity: 'high',
    description: 'Generic React component names',
  },
  {
    pattern: '\\b(module1|module2|myModule|sampleModule)\\b',
    category: 'generic_names',
    severity: 'medium',
    description: 'Generic module names',
  },
  {
    pattern: '\\b(handler|processor|manager|service)\\d+\\b',
    category: 'generic_names',
    severity: 'medium',
    description: 'Numbered handler/service names',
  },
  {
    pattern: '\\b(index|main|app|entry)\\d+\\.(ts|js|tsx|jsx)\\b',
    category: 'generic_names',
    severity: 'medium',
    description: 'Numbered entry point files',
  },
  {
    pattern: '\\bexample(File|Class|Function|Component|Module)?\\d*\\b',
    category: 'generic_names',
    severity: 'high',
    description: 'Example placeholder names',
  },
  {
    pattern: '\\bsample(File|Class|Function|Component|Data)?\\d*\\b',
    category: 'generic_names',
    severity: 'high',
    description: 'Sample placeholder names',
  },
  {
    pattern: '\\b(placeholder|dummy|mock|fake|stub)\\w*\\b',
    category: 'generic_names',
    severity: 'medium',
    description: 'Explicit placeholder indicators',
  },

  // -------------------------------------------------------------------------
  // FAKE PATHS (10 patterns)
  // -------------------------------------------------------------------------
  {
    pattern: '/path/to/[a-z]+',
    category: 'fake_paths',
    severity: 'high',
    description: 'Generic Unix path placeholder (/path/to/...)',
  },
  {
    pattern: 'C:\\\\(your|my|user)\\\\',
    category: 'fake_paths',
    severity: 'high',
    description: 'Generic Windows path placeholder (C:\\your\\...)',
  },
  {
    pattern: '~/?(example|sample|your|my)/',
    category: 'fake_paths',
    severity: 'high',
    description: 'Home directory placeholder paths',
  },
  {
    pattern: '/home/(user|username|yourname)/',
    category: 'fake_paths',
    severity: 'high',
    description: 'Generic home directory paths',
  },
  {
    pattern: '/var/(www|lib)/example',
    category: 'fake_paths',
    severity: 'medium',
    description: 'Example system paths',
  },
  {
    pattern: '\\./?(example|sample|test)-?\\w*/',
    category: 'fake_paths',
    severity: 'medium',
    description: 'Relative example paths',
  },
  {
    pattern: 'src/(example|sample|your)/',
    category: 'fake_paths',
    severity: 'medium',
    description: 'Generic source directory paths',
  },
  {
    pattern: '<path[/-]?to[/-]?[a-z]*>',
    category: 'fake_paths',
    severity: 'high',
    description: 'Angle bracket path placeholders',
  },
  {
    pattern: '\\[path[/-]?to[/-]?[a-z]*\\]',
    category: 'fake_paths',
    severity: 'high',
    description: 'Square bracket path placeholders',
  },
  {
    pattern: '\\{\\s*(path|file|dir|folder)\\s*\\}',
    category: 'fake_paths',
    severity: 'high',
    description: 'Curly brace path placeholders',
  },

  // -------------------------------------------------------------------------
  // SPECULATIVE LANGUAGE (10 patterns)
  // -------------------------------------------------------------------------
  {
    pattern: '\\b(probably|likely|possibly|perhaps|maybe)\\b',
    category: 'speculative_language',
    severity: 'medium',
    description: 'Uncertain probability words',
  },
  {
    pattern: '\\bmight\\s+(be|have|need|require|work)\\b',
    category: 'speculative_language',
    severity: 'medium',
    description: 'Speculative "might" statements',
  },
  {
    pattern: '\\bcould\\s+(be|have|potentially|possibly)\\b',
    category: 'speculative_language',
    severity: 'medium',
    description: 'Speculative "could" statements',
  },
  {
    pattern: '\\bI\\s+(think|believe|assume|guess|suspect)\\b',
    category: 'speculative_language',
    severity: 'high',
    description: 'First-person speculation',
  },
  {
    pattern: '\\b(it\\s+seems|appears\\s+to|looks\\s+like)\\b',
    category: 'speculative_language',
    severity: 'medium',
    description: 'Appearance-based speculation',
  },
  {
    pattern: '\\b(not\\s+sure|uncertain|unclear|unsure)\\b',
    category: 'speculative_language',
    severity: 'high',
    description: 'Explicit uncertainty expressions',
  },
  {
    pattern: '\\b(if\\s+I\\s+recall|from\\s+memory|as\\s+far\\s+as\\s+I\\s+know)\\b',
    category: 'speculative_language',
    severity: 'high',
    description: 'Memory-based uncertainty',
  },
  {
    pattern: '\\b(typically|usually|generally|often|sometimes)\\s+(?:this|it|you)\\b',
    category: 'speculative_language',
    severity: 'low',
    description: 'Generalized frequency words',
  },
  {
    pattern: '\\b(should\\s+work|should\\s+be|might\\s+work)\\b',
    category: 'speculative_language',
    severity: 'medium',
    description: 'Uncertain outcome predictions',
  },
  {
    pattern: '\\b(in\\s+theory|theoretically|hypothetically)\\b',
    category: 'speculative_language',
    severity: 'medium',
    description: 'Theoretical qualifiers',
  },

  // -------------------------------------------------------------------------
  // PROPOSAL LANGUAGE (8 patterns)
  // -------------------------------------------------------------------------
  {
    pattern: '\\bI\\s+will\\s+(create|add|implement|write|build)\\b',
    category: 'proposal_language',
    severity: 'medium',
    description: 'Future action proposals',
  },
  {
    pattern: '\\byou\\s+should\\s+(add|create|implement|consider|try)\\b',
    category: 'proposal_language',
    severity: 'low',
    description: 'Suggestion statements',
  },
  {
    pattern: '\\b(consider|let\\s+me\\s+suggest|I\\s+suggest|I\\s+recommend)\\b',
    category: 'proposal_language',
    severity: 'low',
    description: 'Explicit suggestions',
  },
  {
    pattern: '\\b(we\\s+could|you\\s+could|one\\s+could)\\s+(add|create|implement)\\b',
    category: 'proposal_language',
    severity: 'medium',
    description: 'Conditional proposals',
  },
  {
    pattern: "\\b(here's\\s+how|this\\s+is\\s+how)\\s+(you\\s+)?would\\b",
    category: 'proposal_language',
    severity: 'low',
    description: 'Instructional proposals',
  },
  {
    pattern: '\\b(would\\s+look\\s+like|might\\s+look\\s+like|could\\s+look\\s+like)\\b',
    category: 'proposal_language',
    severity: 'medium',
    description: 'Hypothetical examples',
  },
  {
    pattern: '\\b(for\\s+example|for\\s+instance|such\\s+as)\\s*:\\s*$',
    category: 'proposal_language',
    severity: 'low',
    description: 'Example introductions (may precede fabrication)',
  },
  {
    pattern: '\\b(you\\s+may\\s+want\\s+to|you\\s+might\\s+want\\s+to)\\b',
    category: 'proposal_language',
    severity: 'low',
    description: 'Soft suggestion phrases',
  },

  // -------------------------------------------------------------------------
  // PLACEHOLDER CONTENT (8 patterns)
  // -------------------------------------------------------------------------
  {
    pattern: '\\b(TODO|FIXME|XXX|HACK|BUG)\\b:?',
    category: 'placeholder_content',
    severity: 'high',
    description: 'Code comment placeholders',
  },
  {
    pattern: '\\b(implement\\s+here|add\\s+code\\s+here|your\\s+code\\s+here)\\b',
    category: 'placeholder_content',
    severity: 'high',
    description: 'Explicit implementation placeholders',
  },
  {
    pattern: '\\.\\.\\.\\s*(add|more|etc|implement|continue)',
    category: 'placeholder_content',
    severity: 'high',
    description: 'Ellipsis with continuation hint',
  },
  {
    pattern: '//\\s*(placeholder|stub|mock|fake)',
    category: 'placeholder_content',
    severity: 'high',
    description: 'Placeholder comments',
  },
  {
    pattern: '\\b(lorem\\s+ipsum|dummy\\s+text|sample\\s+text)\\b',
    category: 'placeholder_content',
    severity: 'medium',
    description: 'Lorem ipsum placeholders',
  },
  {
    pattern: '<insert\\s+[^>]+\\s+here>',
    category: 'placeholder_content',
    severity: 'high',
    description: 'Insert placeholder tags',
  },
  {
    pattern: '\\[\\s*(insert|add|your)\\s+[^\\]]+\\s*\\]',
    category: 'placeholder_content',
    severity: 'high',
    description: 'Bracketed insertion placeholders',
  },
  {
    pattern: 'throw\\s+new\\s+Error\\([\'"]not\\s+implemented',
    category: 'placeholder_content',
    severity: 'medium',
    description: 'Not implemented error stubs',
  },

  // -------------------------------------------------------------------------
  // FABRICATED DETAILS (7 patterns)
  // -------------------------------------------------------------------------
  {
    pattern: '\\berror\\s*:\\s*[A-Z]{2,}\\d{3,}\\b',
    category: 'fabricated_details',
    severity: 'high',
    description: 'Suspicious error codes (ERR001, ABC123)',
  },
  {
    pattern: '\\bversion\\s*[:\\s]*(\\d+\\.)?99\\.\\d+',
    category: 'fabricated_details',
    severity: 'medium',
    description: 'Suspicious version numbers (.99.x)',
  },
  {
    pattern: '\\b(port|id)\\s*[:\\s]*12345\\b',
    category: 'fabricated_details',
    severity: 'medium',
    description: 'Common placeholder numbers (12345)',
  },
  {
    pattern: '\\babc123|test123|pass(word)?123\\b',
    category: 'fabricated_details',
    severity: 'medium',
    description: 'Generic credential placeholders',
  },
  {
    pattern: '\\b(example|sample|test)@(example|test|mail)\\.(com|org)\\b',
    category: 'fabricated_details',
    severity: 'medium',
    description: 'Placeholder email addresses',
  },
  {
    pattern: '\\b(xxx|yyy|zzz){2,}\\b',
    category: 'fabricated_details',
    severity: 'high',
    description: 'Repeated placeholder characters',
  },
  {
    pattern: '\\b1\\.2\\.3\\.4\\b|\\b0\\.0\\.0\\.0\\b',
    category: 'fabricated_details',
    severity: 'medium',
    description: 'Placeholder IP addresses',
  },

  // -------------------------------------------------------------------------
  // VAGUE CLAIMS (7 patterns)
  // -------------------------------------------------------------------------
  {
    pattern: '\\b(some|several|various|multiple|many)\\s+(files?|changes?|updates?)\\b',
    category: 'vague_claims',
    severity: 'medium',
    description: 'Vague quantity references',
  },
  {
    pattern: '\\b(and\\s+so\\s+on|etc\\.|et\\s+cetera|and\\s+more)\\b',
    category: 'vague_claims',
    severity: 'low',
    description: 'Trailing continuation phrases',
  },
  {
    pattern: '\\b(somewhere|something|somehow|someone)\\b',
    category: 'vague_claims',
    severity: 'medium',
    description: 'Indefinite reference words',
  },
  {
    pattern: '\\b(a\\s+few|a\\s+couple|a\\s+number\\s+of)\\s+(things?|items?|changes?)\\b',
    category: 'vague_claims',
    severity: 'medium',
    description: 'Imprecise quantity phrases',
  },
  {
    pattern: '\\b(in\\s+the\\s+right\\s+place|where\\s+needed|as\\s+appropriate)\\b',
    category: 'vague_claims',
    severity: 'medium',
    description: 'Vague location references',
  },
  {
    pattern: '\\b(similar|related|relevant)\\s+(files?|code|changes?)\\b',
    category: 'vague_claims',
    severity: 'low',
    description: 'Imprecise similarity references',
  },
  {
    pattern: '\\b(the\\s+usual|standard|typical)\\s+(way|approach|method)\\b',
    category: 'vague_claims',
    severity: 'low',
    description: 'Vague methodology references',
  },
];

// ============================================================================
// HALLUCINATION PATTERN LIBRARY CLASS
// ============================================================================

export class HallucinationPatternLibrary {
  private patterns: HallucinationPattern[] = [];
  private compiledPatterns: Map<string, RegExp> = new Map();
  private categoryWeights: Map<HallucinationCategory, number>;
  private severityWeights: Map<PatternSeverity, number>;

  constructor() {
    // Initialize with default patterns
    this.patterns = [...DEFAULT_PATTERNS];
    this.compileAllPatterns();

    // Category weights for risk scoring
    this.categoryWeights = new Map([
      ['generic_names', 0.8],
      ['fake_paths', 1.0],
      ['speculative_language', 0.6],
      ['proposal_language', 0.4],
      ['placeholder_content', 0.9],
      ['fabricated_details', 0.85],
      ['vague_claims', 0.5],
    ]);

    // Severity multipliers
    this.severityWeights = new Map([
      ['low', 1],
      ['medium', 2],
      ['high', 3],
    ]);

    console.log(
      chalk.gray(`[HallucinationLibrary] Initialized with ${this.patterns.length} patterns`),
    );
  }

  /**
   * Compile all regex patterns for efficient matching
   */
  private compileAllPatterns(): void {
    this.compiledPatterns.clear();
    for (const pattern of this.patterns) {
      try {
        const compiled = new RegExp(pattern.pattern, 'gi');
        this.compiledPatterns.set(pattern.pattern, compiled);
        pattern.compiled = compiled;
      } catch (_error) {
        console.log(chalk.yellow(`[HallucinationLibrary] Invalid pattern: ${pattern.pattern}`));
      }
    }
  }

  /**
   * Check content for hallucination patterns
   */
  checkForPatterns(content: string): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const seenMatches = new Set<string>(); // Avoid duplicates

    for (const pattern of this.patterns) {
      const regex = pattern.compiled || this.compiledPatterns.get(pattern.pattern);
      if (!regex) continue;

      // Reset regex state
      regex.lastIndex = 0;

      for (let match = regex.exec(content); match !== null; match = regex.exec(content)) {
        const matchKey = `${pattern.pattern}:${match.index}:${match[0]}`;

        if (!seenMatches.has(matchKey)) {
          seenMatches.add(matchKey);

          // Extract context (50 chars before and after)
          const contextStart = Math.max(0, match.index - 50);
          const contextEnd = Math.min(content.length, match.index + match[0].length + 50);
          const context = content.substring(contextStart, contextEnd);

          matches.push({
            pattern: pattern.pattern,
            category: pattern.category,
            severity: pattern.severity,
            matched: match[0],
            position: match.index,
            description: pattern.description,
            context: context.replace(/\n/g, ' ').trim(),
          });
        }

        // Prevent infinite loops on zero-width matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }
    }

    // Sort by position
    matches.sort((a, b) => a.position - b.position);

    return matches;
  }

  /**
   * Add a new pattern to the library
   */
  addPattern(
    pattern: string,
    category: HallucinationCategory,
    options: {
      severity?: PatternSeverity;
      description?: string;
    } = {},
  ): boolean {
    const { severity = 'medium', description = 'Custom pattern' } = options;

    // Validate regex
    try {
      const compiled = new RegExp(pattern, 'gi');

      // Check for duplicates
      if (this.patterns.some((p) => p.pattern === pattern)) {
        console.log(chalk.yellow(`[HallucinationLibrary] Pattern already exists: ${pattern}`));
        return false;
      }

      const newPattern: HallucinationPattern = {
        pattern,
        category,
        severity,
        description,
        compiled,
      };

      this.patterns.push(newPattern);
      this.compiledPatterns.set(pattern, compiled);

      console.log(
        chalk.green(`[HallucinationLibrary] Added pattern: ${pattern} (${category}/${severity})`),
      );

      return true;
    } catch (_error) {
      console.log(chalk.red(`[HallucinationLibrary] Invalid regex pattern: ${pattern}`));
      return false;
    }
  }

  /**
   * Remove a pattern from the library
   */
  removePattern(pattern: string): boolean {
    const index = this.patterns.findIndex((p) => p.pattern === pattern);
    if (index === -1) {
      return false;
    }

    this.patterns.splice(index, 1);
    this.compiledPatterns.delete(pattern);
    return true;
  }

  /**
   * Get all patterns in a specific category
   */
  getPatternsByCategory(category: HallucinationCategory): HallucinationPattern[] {
    return this.patterns.filter((p) => p.category === category);
  }

  /**
   * Get all patterns with a specific severity
   */
  getPatternsBySeverity(severity: PatternSeverity): HallucinationPattern[] {
    return this.patterns.filter((p) => p.severity === severity);
  }

  /**
   * Analyze content and provide summary statistics
   */
  analyzeContent(content: string): PatternAnalysisSummary {
    const matches = this.checkForPatterns(content);

    // Initialize category counts
    const byCategory: Record<HallucinationCategory, number> = {
      generic_names: 0,
      fake_paths: 0,
      speculative_language: 0,
      proposal_language: 0,
      placeholder_content: 0,
      fabricated_details: 0,
      vague_claims: 0,
    };

    // Initialize severity counts
    const bySeverity: Record<PatternSeverity, number> = {
      low: 0,
      medium: 0,
      high: 0,
    };

    // Calculate weighted risk score
    let _totalWeight = 0;
    let weightedSum = 0;

    for (const match of matches) {
      byCategory[match.category]++;
      bySeverity[match.severity]++;

      const categoryWeight = this.categoryWeights.get(match.category) || 0.5;
      const severityWeight = this.severityWeights.get(match.severity) || 1;

      _totalWeight += categoryWeight * severityWeight;
      weightedSum += categoryWeight * severityWeight;
    }

    // Normalize risk score (0-100)
    // More matches = higher risk, with diminishing returns
    const riskScore = Math.min(100, Math.round((1 - Math.exp(-weightedSum / 10)) * 100));

    // Get top patterns (unique by pattern, sorted by severity)
    const patternCounts = new Map<string, { count: number; match: PatternMatch }>();
    for (const match of matches) {
      const existing = patternCounts.get(match.pattern);
      if (existing) {
        existing.count++;
      } else {
        patternCounts.set(match.pattern, { count: 1, match });
      }
    }

    const topPatterns = Array.from(patternCounts.values())
      .sort((a, b) => {
        // Sort by severity first, then by count
        const severityA = this.severityWeights.get(a.match.severity) || 0;
        const severityB = this.severityWeights.get(b.match.severity) || 0;
        if (severityA !== severityB) return severityB - severityA;
        return b.count - a.count;
      })
      .slice(0, 5)
      .map((p) => p.match);

    // Generate recommendation
    let recommendation: string;
    if (riskScore >= 70) {
      recommendation =
        'HIGH RISK: Content contains many hallucination indicators. Manual verification strongly recommended.';
    } else if (riskScore >= 40) {
      recommendation =
        'MODERATE RISK: Some hallucination patterns detected. Review flagged sections carefully.';
    } else if (riskScore >= 20) {
      recommendation = 'LOW RISK: Few hallucination indicators. Spot-check the flagged items.';
    } else {
      recommendation = 'MINIMAL RISK: Very few or no hallucination patterns detected.';
    }

    return {
      totalMatches: matches.length,
      byCategory,
      bySeverity,
      riskScore,
      topPatterns,
      recommendation,
    };
  }

  /**
   * Get total pattern count
   */
  getPatternCount(): number {
    return this.patterns.length;
  }

  /**
   * Get all patterns (read-only copy)
   */
  getAllPatterns(): readonly HallucinationPattern[] {
    return [...this.patterns];
  }

  /**
   * Get category statistics
   */
  getCategoryStats(): Record<HallucinationCategory, number> {
    const stats: Record<HallucinationCategory, number> = {
      generic_names: 0,
      fake_paths: 0,
      speculative_language: 0,
      proposal_language: 0,
      placeholder_content: 0,
      fabricated_details: 0,
      vague_claims: 0,
    };

    for (const pattern of this.patterns) {
      stats[pattern.category]++;
    }

    return stats;
  }

  /**
   * Export patterns to JSON
   */
  exportPatterns(): string {
    return JSON.stringify(
      this.patterns.map((p) => ({
        pattern: p.pattern,
        category: p.category,
        severity: p.severity,
        description: p.description,
      })),
      null,
      2,
    );
  }

  /**
   * Import patterns from JSON
   */
  importPatterns(json: string): number {
    try {
      const imported = JSON.parse(json) as HallucinationPattern[];
      let addedCount = 0;

      for (const pattern of imported) {
        if (pattern.pattern && pattern.category) {
          const success = this.addPattern(pattern.pattern, pattern.category, {
            severity: pattern.severity,
            description: pattern.description,
          });
          if (success) addedCount++;
        }
      }

      console.log(chalk.green(`[HallucinationLibrary] Imported ${addedCount} patterns`));

      return addedCount;
    } catch (error) {
      console.log(chalk.red(`[HallucinationLibrary] Failed to import patterns: ${error}`));
      return 0;
    }
  }

  /**
   * Reset to default patterns
   */
  resetToDefaults(): void {
    this.patterns = [...DEFAULT_PATTERNS];
    this.compileAllPatterns();
    console.log(
      chalk.gray(`[HallucinationLibrary] Reset to ${this.patterns.length} default patterns`),
    );
  }

  /**
   * Format analysis summary for display
   */
  formatSummary(summary: PatternAnalysisSummary): string {
    const lines: string[] = [];

    lines.push('=== HALLUCINATION PATTERN ANALYSIS ===');
    lines.push(`Total Matches: ${summary.totalMatches}`);
    lines.push(`Risk Score: ${summary.riskScore}/100`);
    lines.push('');

    lines.push('BY CATEGORY:');
    for (const [category, count] of Object.entries(summary.byCategory)) {
      if (count > 0) {
        lines.push(`  ${category}: ${count}`);
      }
    }
    lines.push('');

    lines.push('BY SEVERITY:');
    lines.push(`  High: ${summary.bySeverity.high}`);
    lines.push(`  Medium: ${summary.bySeverity.medium}`);
    lines.push(`  Low: ${summary.bySeverity.low}`);
    lines.push('');

    if (summary.topPatterns.length > 0) {
      lines.push('TOP PATTERNS:');
      for (const match of summary.topPatterns) {
        lines.push(`  [${match.severity.toUpperCase()}] ${match.description}`);
        lines.push(`    Matched: "${match.matched}"`);
      }
      lines.push('');
    }

    lines.push(`RECOMMENDATION: ${summary.recommendation}`);

    return lines.join('\n');
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const hallucinationLibrary = new HallucinationPatternLibrary();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick check for hallucination patterns
 */
export function checkHallucinations(content: string): PatternMatch[] {
  return hallucinationLibrary.checkForPatterns(content);
}

/**
 * Get full analysis summary
 */
export function analyzeHallucinations(content: string): PatternAnalysisSummary {
  return hallucinationLibrary.analyzeContent(content);
}

/**
 * Check if content has high hallucination risk
 */
export function hasHighHallucinationRisk(content: string, threshold = 50): boolean {
  const summary = hallucinationLibrary.analyzeContent(content);
  return summary.riskScore >= threshold;
}

// ============================================================================
// EXPORTED PATTERN LIBRARY FOR OTHER MODULES
// ============================================================================

export const HALLUCINATION_CATEGORIES: HallucinationCategory[] = [
  'generic_names',
  'fake_paths',
  'speculative_language',
  'proposal_language',
  'placeholder_content',
  'fabricated_details',
  'vague_claims',
];

export const PATTERN_SEVERITIES: PatternSeverity[] = ['low', 'medium', 'high'];

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  HallucinationPatternLibrary,
  hallucinationLibrary,
  checkHallucinations,
  analyzeHallucinations,
  hasHighHallucinationRisk,
  HALLUCINATION_CATEGORIES,
  PATTERN_SEVERITIES,
  DEFAULT_PATTERNS,
};

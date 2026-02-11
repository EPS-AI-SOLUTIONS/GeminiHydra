/**
 * CitationEnforcer - Solution 36: Enforces proper citations in final reports
 *
 * Ensures all claims in the final report have proper [Zadanie #X] or [Task #X]
 * citations, detects hallucinations, and can auto-add missing citations.
 *
 * GeminiHydra Protocol v14.0 "School of the Wolf"
 */

import chalk from 'chalk';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Source information from agent execution
 */
export interface Source {
  taskId: number;
  agentId: string;
  content: string;
}

/**
 * Result of citation enforcement
 */
export interface EnforcementResult {
  valid: boolean;
  citedClaims: number;
  uncitedClaims: number;
  addedCitations: string[];
  warnings: string[];
  hallucinations: HallucinationDetail[];
  citationCoverage: number; // 0-100 percentage
}

/**
 * Detail about a detected hallucination
 */
export interface HallucinationDetail {
  claim: string;
  location: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Claim extracted from report
 */
interface ExtractedClaim {
  text: string;
  lineNumber: number;
  type: ClaimType;
  hasCitation: boolean;
  citationTaskId?: number;
}

/**
 * Types of claims that require citations
 */
type ClaimType =
  | 'file_reference' // References to specific files
  | 'code_result' // Results about code analysis
  | 'modification' // Claims about modifications made
  | 'error_report' // Error/issue reports
  | 'command_execution' // Shell command results
  | 'analysis_result' // Analysis findings
  | 'general_claim'; // Other claims

/**
 * Citation match result
 */
interface CitationMatch {
  taskId: number;
  confidence: number; // 0-1
  matchedContent: string;
}

// =============================================================================
// PATTERNS
// =============================================================================

/**
 * Citation format patterns - supports both Polish and English
 */
const CITATION_PATTERNS = [
  /\[Zadanie\s*#?(\d+)\]/gi, // [Zadanie #1] or [Zadanie 1]
  /\[Task\s*#?(\d+)\]/gi, // [Task #1] or [Task 1]
  /\(Zadanie\s*#?(\d+)\)/gi, // (Zadanie #1)
  /\(Task\s*#?(\d+)\)/gi, // (Task #1)
  /\[#(\d+)\]/g, // [#1] short form
];

/**
 * Patterns that indicate claims requiring citations
 */
const CLAIM_PATTERNS: { pattern: RegExp; type: ClaimType; requiresCitation: boolean }[] = [
  // File references
  {
    pattern: /(?:plik|file|w pliku|in file)\s+["`']?[\w/.-]+\.\w+["`']?/gi,
    type: 'file_reference',
    requiresCitation: true,
  },
  {
    pattern: /(?:src|lib|app|components|services|utils?)\/[\w/-]+\.\w+/g,
    type: 'file_reference',
    requiresCitation: true,
  },

  // Modifications
  {
    pattern:
      /(?:zmodyfikowano|dodano|usuni(?:eto|to)|naprawiono|zmieniono|utworzono|zaktualizowano)/gi,
    type: 'modification',
    requiresCitation: true,
  },
  {
    pattern:
      /(?:modified|added|removed|deleted|fixed|changed|created|updated)\s+(?:the\s+)?(?:file|function|class|component|module)/gi,
    type: 'modification',
    requiresCitation: true,
  },

  // Code results
  {
    pattern:
      /(?:funkcja|function|metoda|method|klasa|class|interfejs|interface|komponent|component)\s+["`']?\w+["`']?/gi,
    type: 'code_result',
    requiresCitation: true,
  },
  {
    pattern: /(?:implementuje|implements|rozszerza|extends|eksportuje|exports)\s+\w+/gi,
    type: 'code_result',
    requiresCitation: true,
  },

  // Error reports
  {
    pattern: /(?:b(?:l|ł)(?:a|ą)d|error|warning|ostrze(?:z|ż)enie|problem|issue)\s*:?\s*.{10,80}/gi,
    type: 'error_report',
    requiresCitation: true,
  },
  {
    pattern: /(?:nie uda(?:lo|ło) si(?:e|ę)|failed to|couldn't|unable to|cannot)/gi,
    type: 'error_report',
    requiresCitation: true,
  },

  // Command execution
  {
    pattern: /(?:wykonano|executed|ran|uruchomiono)\s+(?:komend(?:e|ę)|command|polecenie)/gi,
    type: 'command_execution',
    requiresCitation: true,
  },
  {
    pattern: /\$\s*\w+|npm\s+\w+|git\s+\w+|pnpm\s+\w+|yarn\s+\w+/g,
    type: 'command_execution',
    requiresCitation: true,
  },

  // Analysis results
  {
    pattern: /(?:analiza|analysis|wynik|result|znaleziono|found)\s*:?\s*.{10,60}/gi,
    type: 'analysis_result',
    requiresCitation: true,
  },
  {
    pattern: /(?:zawiera|contains|sk(?:l|ł)ada si(?:e|ę) z|consists of|includes)\s+\d+\s+\w+/gi,
    type: 'analysis_result',
    requiresCitation: true,
  },
];

/**
 * Patterns that indicate hallucinated content
 */
const HALLUCINATION_INDICATORS = [
  {
    pattern: /(?:file|plik)\d+\.(ts|js|tsx|jsx)/gi,
    reason: 'Generic numbered filename',
    severity: 'high' as const,
  },
  {
    pattern: /(?:Class|Component|Service|Handler|Module)\d+/g,
    reason: 'Generic numbered class name',
    severity: 'high' as const,
  },
  {
    pattern: /\/path\/to\/|C:\\path\\to\\/gi,
    reason: 'Template file path',
    severity: 'critical' as const,
  },
  {
    pattern: /example\.(?:ts|js|tsx|jsx)/gi,
    reason: 'Example filename',
    severity: 'medium' as const,
  },
  {
    pattern: /foo|bar|baz|qux/gi,
    reason: 'Placeholder variable name',
    severity: 'medium' as const,
  },
  {
    pattern: /\[TODO\]|\[PLACEHOLDER\]|\[INSERT\]/gi,
    reason: 'Placeholder marker',
    severity: 'critical' as const,
  },
  {
    pattern: /(?:somewhere|gdzies|jakis plik|some file)/gi,
    reason: 'Vague location reference',
    severity: 'medium' as const,
  },
];

// =============================================================================
// CITATIONENFORCER CLASS
// =============================================================================

/**
 * CitationEnforcer - Enforces proper citations in final reports
 */
export class CitationEnforcer {
  private verbose: boolean;

  constructor(options: { verbose?: boolean } = {}) {
    this.verbose = options.verbose ?? false;
  }

  /**
   * Main enforcement method - validates citations in report
   */
  enforceCitations(report: string, availableSources: Source[]): EnforcementResult {
    const startTime = Date.now();

    if (this.verbose) {
      console.log(chalk.cyan('\n[CitationEnforcer] Starting citation enforcement...'));
      console.log(chalk.gray(`  Report length: ${report.length} chars`));
      console.log(chalk.gray(`  Available sources: ${availableSources.length}`));
    }

    // Extract all claims from report
    const claims = this.extractClaims(report);

    // Separate cited and uncited claims
    const citedClaims = claims.filter((c) => c.hasCitation);
    const uncitedClaims = claims.filter((c) => !c.hasCitation);

    // Detect hallucinations
    const hallucinations = this.detectHallucinations(report, availableSources);

    // Generate warnings
    const warnings = this.generateWarnings(claims, hallucinations, availableSources);

    // Track what citations were added (for addMissingCitations method)
    const addedCitations: string[] = [];

    // Calculate coverage
    const totalRequiringCitation = claims.filter(
      (c) => CLAIM_PATTERNS.find((p) => p.type === c.type)?.requiresCitation,
    ).length;
    const citationCoverage =
      totalRequiringCitation > 0
        ? Math.round((citedClaims.length / totalRequiringCitation) * 100)
        : 100;

    // Determine validity
    const hasCriticalHallucinations = hallucinations.some((h) => h.severity === 'critical');
    const valid = !hasCriticalHallucinations && citationCoverage >= 50 && hallucinations.length < 5;

    const duration = Date.now() - startTime;
    if (this.verbose) {
      console.log(chalk.cyan(`[CitationEnforcer] Completed in ${duration}ms`));
      console.log(chalk.gray(`  Cited claims: ${citedClaims.length}`));
      console.log(chalk.gray(`  Uncited claims: ${uncitedClaims.length}`));
      console.log(chalk.gray(`  Coverage: ${citationCoverage}%`));
      console.log(chalk.gray(`  Hallucinations: ${hallucinations.length}`));
    }

    return {
      valid,
      citedClaims: citedClaims.length,
      uncitedClaims: uncitedClaims.length,
      addedCitations,
      warnings,
      hallucinations,
      citationCoverage,
    };
  }

  /**
   * Add missing citations to report where possible
   */
  addMissingCitations(report: string, sources: Source[]): string {
    if (sources.length === 0) {
      return report;
    }

    const _enhancedReport = report;
    const lines = report.split('\n');
    const modifications: { lineNumber: number; originalLine: string; newLine: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip lines that already have citations
      if (this.lineHasCitation(line)) {
        continue;
      }

      // Check if line contains a claim that needs citation
      const claims = this.extractClaimsFromLine(line, i + 1);

      for (const claim of claims) {
        if (claim.hasCitation) continue;

        // Try to match claim to a source
        const match = this.findBestSourceMatch(claim.text, sources);

        if (match && match.confidence >= 0.5) {
          // Add citation at the end of the claim
          const citation = ` [Zadanie #${match.taskId}]`;
          const newLine = this.insertCitationAfterClaim(line, claim.text, citation);

          if (newLine !== line) {
            modifications.push({
              lineNumber: i,
              originalLine: line,
              newLine,
            });
          }
        }
      }
    }

    // Apply modifications (from end to start to preserve line numbers)
    const resultLines = [...lines];
    for (const mod of modifications.reverse()) {
      resultLines[mod.lineNumber] = mod.newLine;
    }

    if (this.verbose && modifications.length > 0) {
      console.log(chalk.green(`[CitationEnforcer] Added ${modifications.length} citations`));
    }

    return resultLines.join('\n');
  }

  /**
   * Extract all claims from the report
   */
  private extractClaims(report: string): ExtractedClaim[] {
    const claims: ExtractedClaim[] = [];
    const lines = report.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineClaims = this.extractClaimsFromLine(lines[i], i + 1);
      claims.push(...lineClaims);
    }

    return claims;
  }

  /**
   * Extract claims from a single line
   */
  private extractClaimsFromLine(line: string, lineNumber: number): ExtractedClaim[] {
    const claims: ExtractedClaim[] = [];
    const seenTexts = new Set<string>();

    for (const { pattern, type } of CLAIM_PATTERNS) {
      // Reset pattern lastIndex for global patterns
      pattern.lastIndex = 0;

      for (let match = pattern.exec(line); match !== null; match = pattern.exec(line)) {
        const text = match[0];

        // Skip duplicates
        if (seenTexts.has(text.toLowerCase())) continue;
        seenTexts.add(text.toLowerCase());

        // Check if there's a citation near this claim
        const hasCitation = this.checkCitationNearby(line, match.index);
        const citationTaskId = hasCitation
          ? this.extractCitationTaskId(line, match.index)
          : undefined;

        claims.push({
          text,
          lineNumber,
          type,
          hasCitation,
          citationTaskId,
        });
      }
    }

    return claims;
  }

  /**
   * Check if a line has any citation
   */
  private lineHasCitation(line: string): boolean {
    return CITATION_PATTERNS.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(line);
    });
  }

  /**
   * Check if there's a citation near the given position
   */
  private checkCitationNearby(line: string, position: number): boolean {
    // Look for citation within 100 chars after the position
    const searchArea = line.substring(position, position + 100);

    return CITATION_PATTERNS.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(searchArea);
    });
  }

  /**
   * Extract the task ID from a nearby citation
   */
  private extractCitationTaskId(line: string, position: number): number | undefined {
    const searchArea = line.substring(position, position + 100);

    for (const pattern of CITATION_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(searchArea);
      if (match?.[1]) {
        return parseInt(match[1], 10);
      }
    }

    return undefined;
  }

  /**
   * Detect hallucinations - claims that don't match any source
   */
  private detectHallucinations(report: string, sources: Source[]): HallucinationDetail[] {
    const hallucinations: HallucinationDetail[] = [];
    const lines = report.split('\n');

    // Create searchable source content
    const sourceContent = sources.map((s) => s.content.toLowerCase()).join('\n');

    // Check for hallucination indicator patterns
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const indicator of HALLUCINATION_INDICATORS) {
        indicator.pattern.lastIndex = 0;

        for (
          let match = indicator.pattern.exec(line);
          match !== null;
          match = indicator.pattern.exec(line)
        ) {
          hallucinations.push({
            claim: match[0],
            location: `Line ${i + 1}`,
            reason: indicator.reason,
            severity: indicator.severity,
          });
        }
      }
    }

    // Check for file references that don't exist in sources
    const filePattern = /(?:src|lib|app|components|services|utils?)\/[\w/-]+\.\w+/g;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      filePattern.lastIndex = 0;

      for (let match = filePattern.exec(line); match !== null; match = filePattern.exec(line)) {
        const filePath = match[0].toLowerCase();

        // Check if this file appears in any source
        if (!sourceContent.includes(filePath)) {
          // Check for partial matches (filename only)
          const fileName = filePath.split('/').pop() || '';
          if (!sourceContent.includes(fileName)) {
            hallucinations.push({
              claim: match[0],
              location: `Line ${i + 1}`,
              reason: 'File not found in agent results',
              severity: 'high',
            });
          }
        }
      }
    }

    // Deduplicate hallucinations
    return this.deduplicateHallucinations(hallucinations);
  }

  /**
   * Remove duplicate hallucinations
   */
  private deduplicateHallucinations(hallucinations: HallucinationDetail[]): HallucinationDetail[] {
    const seen = new Map<string, HallucinationDetail>();

    for (const h of hallucinations) {
      const key = `${h.claim.toLowerCase()}:${h.reason}`;
      const existing = seen.get(key);

      // Keep the one with higher severity
      if (!existing || this.severityRank(h.severity) > this.severityRank(existing.severity)) {
        seen.set(key, h);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Get numeric rank for severity
   */
  private severityRank(severity: 'low' | 'medium' | 'high' | 'critical'): number {
    const ranks = { low: 1, medium: 2, high: 3, critical: 4 };
    return ranks[severity];
  }

  /**
   * Find the best matching source for a claim
   */
  private findBestSourceMatch(claim: string, sources: Source[]): CitationMatch | null {
    const claimLower = claim.toLowerCase();
    let bestMatch: CitationMatch | null = null;
    let bestConfidence = 0;

    for (const source of sources) {
      const sourceLower = source.content.toLowerCase();

      // Calculate confidence based on matching
      let confidence = 0;

      // Exact match
      if (sourceLower.includes(claimLower)) {
        confidence = 1.0;
      } else {
        // Word-based matching
        const claimWords = claimLower.split(/\s+/).filter((w) => w.length > 3);
        const matchedWords = claimWords.filter((word) => sourceLower.includes(word));

        if (claimWords.length > 0) {
          confidence = matchedWords.length / claimWords.length;
        }
      }

      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestMatch = {
          taskId: source.taskId,
          confidence,
          matchedContent: claim,
        };
      }
    }

    return bestMatch;
  }

  /**
   * Insert citation after a claim in a line
   */
  private insertCitationAfterClaim(line: string, claim: string, citation: string): string {
    const index = line.indexOf(claim);
    if (index === -1) return line;

    const endIndex = index + claim.length;

    // Check if there's already a citation right after
    const afterClaim = line.substring(endIndex, endIndex + 20);
    if (
      CITATION_PATTERNS.some((p) => {
        p.lastIndex = 0;
        return p.test(afterClaim);
      })
    ) {
      return line;
    }

    return line.substring(0, endIndex) + citation + line.substring(endIndex);
  }

  /**
   * Generate warnings based on analysis
   */
  private generateWarnings(
    claims: ExtractedClaim[],
    hallucinations: HallucinationDetail[],
    sources: Source[],
  ): string[] {
    const warnings: string[] = [];

    // Warning for low citation coverage
    const citableClaiims = claims.filter(
      (c) => CLAIM_PATTERNS.find((p) => p.type === c.type)?.requiresCitation,
    );
    const citedCount = citableClaiims.filter((c) => c.hasCitation).length;
    const coverage = citableClaiims.length > 0 ? (citedCount / citableClaiims.length) * 100 : 100;

    if (coverage < 30) {
      warnings.push(
        `Niskie pokrycie cytatami: ${coverage.toFixed(0)}% twierdzeń ma cytaty [Zadanie #X]`,
      );
    } else if (coverage < 60) {
      warnings.push(
        `Umiarkowane pokrycie cytatami: ${coverage.toFixed(0)}% - rozważ dodanie więcej cytatów`,
      );
    }

    // Warning for hallucinations
    const criticalHallucinations = hallucinations.filter((h) => h.severity === 'critical');
    const highHallucinations = hallucinations.filter((h) => h.severity === 'high');

    if (criticalHallucinations.length > 0) {
      warnings.push(
        `KRYTYCZNE: ${criticalHallucinations.length} potencjalnych halucynacji wymagających natychmiastowej korekty`,
      );
    }

    if (highHallucinations.length > 0) {
      warnings.push(
        `WYSOKIE: ${highHallucinations.length} podejrzanych twierdzeń niepotwierdzonych w źródłach`,
      );
    }

    // Warning for uncited file references
    const uncitedFiles = claims.filter((c) => c.type === 'file_reference' && !c.hasCitation);
    if (uncitedFiles.length > 3) {
      warnings.push(`${uncitedFiles.length} odniesień do plików bez cytatu źródłowego`);
    }

    // Warning for uncited modifications
    const uncitedMods = claims.filter((c) => c.type === 'modification' && !c.hasCitation);
    if (uncitedMods.length > 0) {
      warnings.push(`${uncitedMods.length} twierdzeń o modyfikacjach bez cytatu źródłowego`);
    }

    // Warning if no sources available
    if (sources.length === 0) {
      warnings.push('Brak dostępnych źródeł do weryfikacji - nie można zwalidować twierdzeń');
    }

    return warnings;
  }

  /**
   * Log enforcement results to console
   */
  logResults(result: EnforcementResult): void {
    const statusColor = result.valid ? chalk.green : chalk.red;
    const statusText = result.valid ? 'VALID' : 'NEEDS CORRECTION';

    console.log(chalk.cyan(`\n${'='.repeat(60)}`));
    console.log(chalk.cyan('  CITATION ENFORCEMENT RESULTS'));
    console.log(chalk.cyan('='.repeat(60)));

    console.log(statusColor(`\nStatus: ${statusText}`));
    console.log(chalk.gray(`Citation Coverage: ${result.citationCoverage}%`));
    console.log(chalk.gray(`Cited Claims: ${result.citedClaims}`));
    console.log(chalk.gray(`Uncited Claims: ${result.uncitedClaims}`));

    if (result.hallucinations.length > 0) {
      console.log(chalk.yellow(`\nHallucinations Detected: ${result.hallucinations.length}`));

      const critical = result.hallucinations.filter((h) => h.severity === 'critical');
      const high = result.hallucinations.filter((h) => h.severity === 'high');
      const medium = result.hallucinations.filter((h) => h.severity === 'medium');

      if (critical.length > 0) {
        console.log(chalk.red(`  CRITICAL (${critical.length}):`));
        for (const h of critical.slice(0, 3)) {
          console.log(chalk.red(`    - "${h.claim}" at ${h.location}: ${h.reason}`));
        }
      }

      if (high.length > 0) {
        console.log(chalk.yellow(`  HIGH (${high.length}):`));
        for (const h of high.slice(0, 3)) {
          console.log(chalk.yellow(`    - "${h.claim}" at ${h.location}: ${h.reason}`));
        }
      }

      if (medium.length > 0 && this.verbose) {
        console.log(chalk.gray(`  MEDIUM (${medium.length}):`));
        for (const h of medium.slice(0, 2)) {
          console.log(chalk.gray(`    - "${h.claim}": ${h.reason}`));
        }
      }
    }

    if (result.warnings.length > 0) {
      console.log(chalk.yellow('\nWarnings:'));
      for (const warning of result.warnings) {
        console.log(chalk.yellow(`  - ${warning}`));
      }
    }

    if (result.addedCitations.length > 0) {
      console.log(chalk.green(`\nCitations Added: ${result.addedCitations.length}`));
    }

    console.log(chalk.cyan(`\n${'='.repeat(60)}`));
  }

  /**
   * Validate a single claim against sources
   */
  validateClaim(
    claim: string,
    sources: Source[],
  ): { valid: boolean; matchedSource?: Source; confidence: number } {
    const match = this.findBestSourceMatch(claim, sources);

    if (!match) {
      return { valid: false, confidence: 0 };
    }

    const matchedSource = sources.find((s) => s.taskId === match.taskId);

    return {
      valid: match.confidence >= 0.5,
      matchedSource,
      confidence: match.confidence,
    };
  }

  /**
   * Get summary statistics
   */
  getSummary(result: EnforcementResult): string {
    const lines = [
      `Citation Coverage: ${result.citationCoverage}%`,
      `Claims: ${result.citedClaims} cited, ${result.uncitedClaims} uncited`,
      `Hallucinations: ${result.hallucinations.length} detected`,
      `Status: ${result.valid ? 'VALID' : 'NEEDS CORRECTION'}`,
    ];

    return lines.join('\n');
  }
}

// =============================================================================
// SINGLETON INSTANCE & HELPER FUNCTIONS
// =============================================================================

/**
 * Default citation enforcer instance
 */
export const citationEnforcer = new CitationEnforcer({ verbose: false });

/**
 * Quick enforce citations
 */
export function enforceCitations(report: string, sources: Source[]): EnforcementResult {
  return citationEnforcer.enforceCitations(report, sources);
}

/**
 * Quick add missing citations
 */
export function addMissingCitations(report: string, sources: Source[]): string {
  return citationEnforcer.addMissingCitations(report, sources);
}

/**
 * Check if report has sufficient citations
 */
export function hasProperCitations(report: string, sources: Source[], threshold = 50): boolean {
  const result = citationEnforcer.enforceCitations(report, sources);
  return result.citationCoverage >= threshold;
}

/**
 * Log citation enforcement results
 */
export function logCitationResults(result: EnforcementResult): void {
  citationEnforcer.logResults(result);
}

/**
 * Create sources from execution results
 */
export function createSourcesFromResults(
  results: Array<{ id: number; agentId?: string; content: string }>,
): Source[] {
  return results.map((r) => ({
    taskId: r.id,
    agentId: r.agentId || 'unknown',
    content: r.content,
  }));
}

export default {
  CitationEnforcer,
  citationEnforcer,
  enforceCitations,
  addMissingCitations,
  hasProperCitations,
  logCitationResults,
  createSourcesFromResults,
};

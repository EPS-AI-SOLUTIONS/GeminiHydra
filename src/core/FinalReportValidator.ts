/**
 * FinalReportValidator - Solution 30: Comprehensive validation of final synthesis reports
 *
 * Performs thorough validation of the final report before showing to user.
 * Detects hallucinations, unsupported claims, generic names, and objective drift.
 *
 * GeminiHydra Protocol v14.0 "School of the Wolf"
 */

import chalk from 'chalk';
import type { ExecutionResult } from '../types/index.js';

// =============================================================================
// INTERFACES
// =============================================================================

/**
 * Severity levels for validation issues
 */
export type ValidationSeverity = 'critical' | 'warning' | 'info';

/**
 * Types of validation issues that can be detected
 */
export type ValidationIssueType =
  | 'objective_mismatch' // Report doesn't address original objective
  | 'unsupported_claim' // Claim not backed by agent data
  | 'generic_name' // file1.ts, Class1, etc.
  | 'speculative_language' // "might", "probably", "could"
  | 'missing_source' // Information without [Task #X] citation
  | 'fabricated_file' // File mentioned but not in agent results
  | 'fabricated_code' // Code block not from agent results
  | 'placeholder_content' // TODO, FIXME, implement here
  | 'proposal_instead_action' // "I will", "you should" instead of "done"
  | 'missing_section' // Required report section missing
  | 'inconsistent_status' // Report says success but results show failure
  | 'phantom_artefact'; // Artifact mentioned but never produced

/**
 * Individual validation issue
 */
export interface ValidationIssue {
  type: ValidationIssueType;
  severity: ValidationSeverity;
  description: string;
  location: string; // Where in the report this was found
  suggestion?: string; // How to fix the issue
  matchedText?: string; // The problematic text that triggered this
}

/**
 * Complete validation result
 */
export interface ValidationResult {
  isValid: boolean; // True if no critical issues and score >= 60
  issues: ValidationIssue[];
  score: number; // 0-100, higher is better
  recommendations: string[];
  stats: ValidationStats;
}

/**
 * Validation statistics
 */
export interface ValidationStats {
  totalChecks: number;
  passedChecks: number;
  criticalIssues: number;
  warningIssues: number;
  infoIssues: number;
  citationCoverage: number; // Percentage of claims with [Task #X] citations
  objectiveAlignment: number; // 0-100, how well report addresses objective
}

// =============================================================================
// VALIDATION PATTERNS
// =============================================================================

/**
 * Configurable patterns for detecting speculative/uncertain language.
 *
 * Each entry has:
 * - `pattern`: A RegExp (should use `gi` flags for global, case-insensitive matching)
 * - `severity`: The validation severity level when matched
 *
 * Export this so it can be customized per project:
 * ```ts
 * import { SPECULATIVE_LANGUAGE_PATTERNS } from './FinalReportValidator.js';
 * SPECULATIVE_LANGUAGE_PATTERNS.push({ pattern: /\bmaybe\b/gi, severity: 'warning' });
 * ```
 */
export const SPECULATIVE_LANGUAGE_PATTERNS: Array<{
  pattern: RegExp;
  severity: ValidationSeverity;
}> = [
  { pattern: /\b(?:might|may|could|possibly|perhaps|probably)\b/gi, severity: 'warning' },
  { pattern: /\b(?:I think|I believe|I assume|I guess)\b/gi, severity: 'warning' },
  { pattern: /\b(?:myslę|sądzę|zakładam|prawdopodobnie|być może|chyba)\b/gi, severity: 'warning' },
  { pattern: /\b(?:should work|powinno działać|hopefully|mam nadzieję)\b/gi, severity: 'info' },
];

/**
 * Patterns for detecting proposal instead of action
 */
const PROPOSAL_PATTERNS = [
  {
    pattern:
      /\b(?:I will|I would|I can|Let me|I'll|I'm going to)\s+(?:create|write|implement|add|fix)\b/gi,
    severity: 'critical' as const,
  },
  {
    pattern: /\b(?:you should|you could|you can|you might want to)\b/gi,
    severity: 'warning' as const,
  },
  {
    pattern:
      /\b(?:Mogę|Będę|Zamierzam|Powinienem|Można)\s+(?:stworzyć|napisać|zaimplementować|dodać)\b/gi,
    severity: 'critical' as const,
  },
  { pattern: /\b(?:powinieneś|możesz|warto|rozważ)\b/gi, severity: 'warning' as const },
];

/**
 * Patterns for detecting generic/placeholder names
 */
const GENERIC_NAME_PATTERNS = [
  {
    pattern:
      /\b(?:file|class|component|module|service|helper|util|test)\d+\.(ts|js|tsx|jsx|py)\b/gi,
    severity: 'critical' as const,
  },
  {
    pattern: /\b(?:Class|Component|Service|Helper|Utils?|Handler|Manager)\d+\b/g,
    severity: 'critical' as const,
  },
  {
    pattern:
      /\b(?:foo|bar|baz|qux|example|sample|demo|test|dummy|mock|fake)\w*\.(ts|js|tsx|jsx)\b/gi,
    severity: 'warning' as const,
  },
  {
    pattern: /\b(?:MyClass|MyComponent|MyService|MyFunction|MyHelper)\b/g,
    severity: 'warning' as const,
  },
  {
    pattern: /\b(?:function|method|variable|value|result|data)\d+\b/gi,
    severity: 'warning' as const,
  },
];

/**
 * Patterns for detecting placeholder content
 */
const PLACEHOLDER_PATTERNS = [
  {
    pattern: /\b(?:TODO|FIXME|XXX|HACK|implement here|add code here)\b/gi,
    severity: 'critical' as const,
  },
  {
    pattern: /\b(?:placeholder|example code|sample code|boilerplate)\b/gi,
    severity: 'warning' as const,
  },
  { pattern: /\.\.\.\s*(?:implementation|code|logic)/gi, severity: 'warning' as const },
];

/**
 * Patterns for detecting fake/template paths
 */
const FAKE_PATH_PATTERNS = [
  {
    pattern: /(?:\/path\/to\/|C:\\path\\to\\|\/your\/|\/user\/project\/)/gi,
    severity: 'critical' as const,
  },
  { pattern: /\[path\]|\[filename\]|\[directory\]/gi, severity: 'critical' as const },
  { pattern: /src\/components\/Example/gi, severity: 'warning' as const },
];

/**
 * Required sections in a valid report
 */
const REQUIRED_SECTIONS = [
  { section: '## Podsumowanie', severity: 'critical' as const },
  { section: '## Zgodność z celem', severity: 'critical' as const },
  { section: '## Wyniki', severity: 'critical' as const },
  { section: '## Problemy', severity: 'warning' as const },
  { section: '## Rekomendacje', severity: 'info' as const },
];

// =============================================================================
// FINALREPORTVALIDATOR CLASS
// =============================================================================

/**
 * FinalReportValidator - Validates synthesis reports before showing to user
 */
export class FinalReportValidator {
  private verbose: boolean;

  constructor(options: { verbose?: boolean } = {}) {
    this.verbose = options.verbose ?? false;
  }

  /**
   * Main validation method - performs all checks on the report
   */
  validateReport(
    report: string,
    originalObjective: string,
    agentResults: ExecutionResult[],
  ): ValidationResult {
    const issues: ValidationIssue[] = [];
    const startTime = Date.now();

    if (this.verbose) {
      console.log(chalk.cyan('\n[FinalReportValidator] Starting validation...'));
      console.log(chalk.gray(`  Report length: ${report.length} chars`));
      console.log(chalk.gray(`  Original objective: "${originalObjective.substring(0, 50)}..."`));
      console.log(chalk.gray(`  Agent results: ${agentResults.length}`));
    }

    // 1. Check objective alignment
    const objectiveIssues = this.checkObjectiveAlignment(report, originalObjective);
    issues.push(...objectiveIssues);

    // 2. Check for unsupported claims (files/code not in agent results)
    const unsupportedIssues = this.checkUnsupportedClaims(report, agentResults);
    issues.push(...unsupportedIssues);

    // 3. Check for generic/placeholder names
    const genericNameIssues = this.checkGenericNames(report);
    issues.push(...genericNameIssues);

    // 4. Check for speculative language
    const speculativeIssues = this.checkSpeculativeLanguage(report);
    issues.push(...speculativeIssues);

    // 5. Check for proposal instead of action
    const proposalIssues = this.checkProposalLanguage(report);
    issues.push(...proposalIssues);

    // 6. Check for placeholder content
    const placeholderIssues = this.checkPlaceholderContent(report);
    issues.push(...placeholderIssues);

    // 7. Check for missing citations
    const citationIssues = this.checkCitations(report);
    issues.push(...citationIssues);

    // 8. Check required sections
    const sectionIssues = this.checkRequiredSections(report);
    issues.push(...sectionIssues);

    // 9. Check status consistency
    const consistencyIssues = this.checkStatusConsistency(report, agentResults);
    issues.push(...consistencyIssues);

    // 10. Check for fake paths
    const fakePathIssues = this.checkFakePaths(report);
    issues.push(...fakePathIssues);

    // Calculate statistics
    const stats = this.calculateStats(issues, report, originalObjective);

    // Calculate overall score
    const score = this.calculateScore(issues, stats);

    // Generate recommendations
    const recommendations = this.generateRecommendations(issues, stats);

    // Determine if valid (no critical issues and score >= 60)
    const criticalCount = issues.filter((i) => i.severity === 'critical').length;
    const isValid = criticalCount === 0 && score >= 60;

    const duration = Date.now() - startTime;
    if (this.verbose) {
      console.log(chalk.cyan(`[FinalReportValidator] Completed in ${duration}ms`));
      console.log(chalk.gray(`  Score: ${score}/100 | Valid: ${isValid}`));
      console.log(chalk.gray(`  Issues: ${issues.length} (${criticalCount} critical)`));
    }

    return {
      isValid,
      issues,
      score,
      recommendations,
      stats,
    };
  }

  /**
   * Check if report addresses the original objective
   */
  private checkObjectiveAlignment(report: string, objective: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const reportLower = report.toLowerCase();
    const objectiveLower = objective.toLowerCase();

    // Extract key terms from objective (words > 4 chars)
    const keyTerms = objectiveLower
      .split(/\s+/)
      .filter((word) => word.length > 4)
      .filter(
        (word) => !/^(which|where|about|should|could|would|there|their|these|those)$/.test(word),
      );

    // Count how many key terms appear in report
    let foundTerms = 0;
    const missingTerms: string[] = [];

    for (const term of keyTerms) {
      if (reportLower.includes(term)) {
        foundTerms++;
      } else {
        missingTerms.push(term);
      }
    }

    const coverage = keyTerms.length > 0 ? (foundTerms / keyTerms.length) * 100 : 100;

    if (coverage < 30) {
      issues.push({
        type: 'objective_mismatch',
        severity: 'critical',
        description: `Raport nie adresuje oryginalnego celu (pokrycie: ${coverage.toFixed(0)}%)`,
        location: 'Cały raport',
        suggestion: `Upewnij się, że raport odnosi się do: "${objective}"`,
        matchedText: missingTerms.slice(0, 5).join(', '),
      });
    } else if (coverage < 60) {
      issues.push({
        type: 'objective_mismatch',
        severity: 'warning',
        description: `Częściowe pokrycie celu (${coverage.toFixed(0)}%)`,
        location: 'Cały raport',
        suggestion: `Brakujące terminy: ${missingTerms.slice(0, 3).join(', ')}`,
      });
    }

    // Check if report mentions objective explicitly
    if (!report.includes('ORYGINALNY CEL') && !report.includes('Original objective')) {
      issues.push({
        type: 'objective_mismatch',
        severity: 'info',
        description: 'Raport nie zawiera jawnego odniesienia do oryginalnego celu',
        location: 'Nagłówek raportu',
        suggestion: 'Dodaj sekcję z oryginalnym celem użytkownika',
      });
    }

    return issues;
  }

  /**
   * Check for claims not supported by agent results
   */
  private checkUnsupportedClaims(
    report: string,
    agentResults: ExecutionResult[],
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Extract all content from agent results for comparison
    const agentContent = agentResults
      .filter((r) => r.success)
      .map((r) => (r.logs ?? []).join('\n'))
      .join('\n')
      .toLowerCase();

    // Extract file paths mentioned in report
    const reportFilePaths =
      report.match(/(?:src|lib|app|components|services|utils?)\/[\w/-]+\.\w+/g) || [];
    const uniqueFilePaths = [...new Set(reportFilePaths)];

    for (const filePath of uniqueFilePaths) {
      // Check if this file was actually mentioned in agent results
      if (!agentContent.includes(filePath.toLowerCase())) {
        issues.push({
          type: 'fabricated_file',
          severity: 'critical',
          description: `Plik "${filePath}" nie pojawia się w wynikach agentów`,
          location: 'Sekcja wyników',
          suggestion: 'Usuń lub zweryfikuj źródło tej informacji',
          matchedText: filePath,
        });
      }
    }

    // Extract code blocks from report
    const codeBlocks = report.match(/```[\s\S]*?```/g) || [];

    for (const block of codeBlocks) {
      // Skip small blocks (likely just examples)
      if (block.length < 100) continue;

      // Check if this code appears in agent results
      const codeContent = block.replace(/```\w*/g, '').trim();
      const codeSnippet = codeContent.substring(0, 50).toLowerCase();

      if (codeSnippet.length > 20 && !agentContent.includes(codeSnippet)) {
        issues.push({
          type: 'fabricated_code',
          severity: 'warning',
          description: 'Blok kodu może nie pochodzić z wyników agentów',
          location: 'Blok kodu',
          suggestion: 'Dodaj cytowanie [Zadanie #X] lub usuń kod',
          matchedText: `${codeContent.substring(0, 80)}...`,
        });
      }
    }

    return issues;
  }

  /**
   * Check for generic/placeholder names
   */
  private checkGenericNames(report: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const { pattern, severity } of GENERIC_NAME_PATTERNS) {
      const matches = report.match(pattern);
      if (matches) {
        for (const match of [...new Set(matches)].slice(0, 3)) {
          issues.push({
            type: 'generic_name',
            severity,
            description: `Generyczna/placeholder nazwa: "${match}"`,
            location: 'W treści raportu',
            suggestion: 'Użyj rzeczywistych nazw z wyników agentów',
            matchedText: match,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Check for speculative/uncertain language.
   * Uses the exported SPECULATIVE_LANGUAGE_PATTERNS array so patterns can be
   * customized at runtime before validation runs.
   */
  private checkSpeculativeLanguage(report: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const { pattern, severity } of SPECULATIVE_LANGUAGE_PATTERNS) {
      // Reset lastIndex in case the regex is stateful from a previous run
      pattern.lastIndex = 0;
      const matches = report.match(pattern);
      if (matches && matches.length > 2) {
        issues.push({
          type: 'speculative_language',
          severity,
          description: `Język spekulatywny: ${matches.length} wystąpień`,
          location: 'W treści raportu',
          suggestion: 'Zastąp spekulacje konkretnymi faktami z wyników agentów',
          matchedText: matches.slice(0, 3).join(', '),
        });
      }
    }

    return issues;
  }

  /**
   * Check for proposal language instead of actions
   */
  private checkProposalLanguage(report: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const { pattern, severity } of PROPOSAL_PATTERNS) {
      const matches = report.match(pattern);
      if (matches) {
        for (const match of [...new Set(matches)].slice(0, 2)) {
          issues.push({
            type: 'proposal_instead_action',
            severity,
            description: `Propozycja zamiast akcji: "${match}"`,
            location: 'W treści raportu',
            suggestion: 'Opisz co ZOSTAŁO zrobione, nie co MOŻNA zrobić',
            matchedText: match,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Check for placeholder content
   */
  private checkPlaceholderContent(report: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const { pattern, severity } of PLACEHOLDER_PATTERNS) {
      const matches = report.match(pattern);
      if (matches) {
        for (const match of [...new Set(matches)]) {
          issues.push({
            type: 'placeholder_content',
            severity,
            description: `Placeholder w raporcie: "${match}"`,
            location: 'W treści raportu',
            suggestion: 'Usuń placeholder lub zamień na rzeczywistą treść',
            matchedText: match,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Check for proper citations [Task #X]
   */
  private checkCitations(report: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Find citation patterns
    const citationPattern = /\[(?:Zadanie|Task)\s*#?\d+\]/gi;
    const citations = report.match(citationPattern) || [];

    // Find claim patterns that should have citations
    const claimPatterns = [
      /plik\s+[\w/.-]+\.(ts|js|tsx|jsx)/gi,
      /funkcja\s+\w+/gi,
      /klasa\s+\w+/gi,
      /komponent\s+\w+/gi,
      /interfejs\s+\w+/gi,
      /zmodyfikowano|dodano|usunięto|naprawiono/gi,
    ];

    let claimCount = 0;
    for (const pattern of claimPatterns) {
      const matches = report.match(pattern);
      if (matches) {
        claimCount += matches.length;
      }
    }

    const citationRatio = claimCount > 0 ? citations.length / claimCount : 1;

    if (citationRatio < 0.3 && claimCount > 3) {
      issues.push({
        type: 'missing_source',
        severity: 'warning',
        description: `Niskie pokrycie cytatami: ${citations.length} cytatów dla ${claimCount} twierdzeń`,
        location: 'Sekcja Wyniki',
        suggestion: 'Dodaj [Zadanie #X] do każdego twierdzenia',
      });
    }

    // Check for claims without nearby citation
    const lines = report.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Check if line has a file path claim but no citation
      if (/(?:plik|file)\s+[\w/.-]+\.(ts|js)/i.test(line) && !citationPattern.test(line)) {
        issues.push({
          type: 'missing_source',
          severity: 'info',
          description: 'Twierdzenie o pliku bez cytatu źródłowego',
          location: `Linia ${i + 1}`,
          suggestion: 'Dodaj [Zadanie #X] po twierdzeniu',
          matchedText: line.substring(0, 60),
        });
      }
    }

    return issues;
  }

  /**
   * Check for required report sections
   */
  private checkRequiredSections(report: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const { section, severity } of REQUIRED_SECTIONS) {
      // Check for various spellings
      const patterns = [
        section,
        section.replace('## ', '**'),
        section.replace('## ', '### '),
        section.toLowerCase(),
      ];

      const found = patterns.some((p) => report.toLowerCase().includes(p.toLowerCase()));

      if (!found) {
        issues.push({
          type: 'missing_section',
          severity,
          description: `Brakująca sekcja: ${section}`,
          location: 'Struktura raportu',
          suggestion: `Dodaj sekcję "${section}" do raportu`,
        });
      }
    }

    return issues;
  }

  /**
   * Check for status consistency between report and results
   */
  private checkStatusConsistency(
    report: string,
    agentResults: ExecutionResult[],
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const reportLower = report.toLowerCase();

    const successCount = agentResults.filter((r) => r.success).length;
    const failCount = agentResults.length - successCount;
    const successRatio = agentResults.length > 0 ? successCount / agentResults.length : 0;

    // Check if report claims success but results show failures
    const claimsSuccess = /(?:sukces|powodzeni|zrealizowano|ukończono|gotowe)/i.test(reportLower);
    const claimsFailure = /(?:błąd|niepowodzeni|nie udało|failed|error)/i.test(reportLower);

    if (claimsSuccess && successRatio < 0.5) {
      issues.push({
        type: 'inconsistent_status',
        severity: 'critical',
        description: `Raport twierdzi sukces, ale ${failCount}/${agentResults.length} zadań zakończyło się błędem`,
        location: 'Sekcja Podsumowanie',
        suggestion: 'Zaktualizuj status zgodnie z rzeczywistymi wynikami',
      });
    }

    if (claimsFailure && successRatio > 0.8) {
      issues.push({
        type: 'inconsistent_status',
        severity: 'warning',
        description: `Raport sugeruje problemy, ale ${successCount}/${agentResults.length} zadań zakończyło się sukcesem`,
        location: 'Sekcja Podsumowanie',
        suggestion: 'Zweryfikuj czy status jest prawidłowy',
      });
    }

    return issues;
  }

  /**
   * Check for fake/template paths
   */
  private checkFakePaths(report: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (const { pattern, severity } of FAKE_PATH_PATTERNS) {
      const matches = report.match(pattern);
      if (matches) {
        for (const match of [...new Set(matches)]) {
          issues.push({
            type: 'fabricated_file',
            severity,
            description: `Fikcyjna/szablonowa ścieżka: "${match}"`,
            location: 'W treści raportu',
            suggestion: 'Użyj rzeczywistych ścieżek z wyników agentów',
            matchedText: match,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Calculate validation statistics
   */
  private calculateStats(
    issues: ValidationIssue[],
    report: string,
    objective: string,
  ): ValidationStats {
    const criticalIssues = issues.filter((i) => i.severity === 'critical').length;
    const warningIssues = issues.filter((i) => i.severity === 'warning').length;
    const infoIssues = issues.filter((i) => i.severity === 'info').length;

    // Calculate citation coverage
    const citationPattern = /\[(?:Zadanie|Task)\s*#?\d+\]/gi;
    const citations = report.match(citationPattern) || [];
    const claimPattern = /(?:plik|funkcja|klasa|komponent|zmodyfikowano|dodano)/gi;
    const claims = report.match(claimPattern) || [];
    const citationCoverage =
      claims.length > 0 ? Math.min(100, (citations.length / claims.length) * 100) : 100;

    // Calculate objective alignment
    const objectiveTerms = objective
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const reportLower = report.toLowerCase();
    const foundTerms = objectiveTerms.filter((t) => reportLower.includes(t)).length;
    const objectiveAlignment =
      objectiveTerms.length > 0 ? (foundTerms / objectiveTerms.length) * 100 : 100;

    return {
      totalChecks: 10, // Number of different check types
      passedChecks: 10 - Math.min(10, criticalIssues + Math.floor(warningIssues / 2)),
      criticalIssues,
      warningIssues,
      infoIssues,
      citationCoverage: Math.round(citationCoverage),
      objectiveAlignment: Math.round(objectiveAlignment),
    };
  }

  /**
   * Calculate overall validation score
   */
  private calculateScore(issues: ValidationIssue[], stats: ValidationStats): number {
    let score = 100;

    // Deduct for issues based on severity
    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical':
          score -= 20;
          break;
        case 'warning':
          score -= 8;
          break;
        case 'info':
          score -= 2;
          break;
      }
    }

    // Bonus for good citation coverage
    if (stats.citationCoverage >= 80) {
      score += 5;
    }

    // Bonus for good objective alignment
    if (stats.objectiveAlignment >= 80) {
      score += 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate recommendations based on issues found
   */
  private generateRecommendations(issues: ValidationIssue[], stats: ValidationStats): string[] {
    const recommendations: string[] = [];

    // Group issues by type
    const issuesByType = new Map<ValidationIssueType, ValidationIssue[]>();
    for (const issue of issues) {
      if (!issuesByType.has(issue.type)) {
        issuesByType.set(issue.type, []);
      }
      issuesByType.get(issue.type)?.push(issue);
    }

    // Generate recommendations based on most common issues
    if (issuesByType.has('generic_name')) {
      recommendations.push(
        'Zamień generyczne nazwy (file1.ts, Class1) na rzeczywiste nazwy z projektu',
      );
    }

    if (issuesByType.has('fabricated_file') || issuesByType.has('fabricated_code')) {
      recommendations.push('Usuń lub zweryfikuj pliki/kod które nie pochodzą z wyników agentów');
    }

    if (issuesByType.has('missing_source') && stats.citationCoverage < 50) {
      recommendations.push('Dodaj cytaty [Zadanie #X] do każdego twierdzenia o plikach/kodzie');
    }

    if (issuesByType.has('speculative_language')) {
      recommendations.push('Zastąp język spekulatywny (może, prawdopodobnie) konkretnymi faktami');
    }

    if (issuesByType.has('proposal_instead_action')) {
      recommendations.push(
        'Opisz wykonane akcje, nie propozycje ("zrobiono" zamiast "można zrobić")',
      );
    }

    if (issuesByType.has('objective_mismatch') && stats.objectiveAlignment < 60) {
      recommendations.push('Upewnij się że raport bezpośrednio odnosi się do oryginalnego celu');
    }

    if (issuesByType.has('missing_section')) {
      const missingSections = issuesByType
        .get('missing_section')
        ?.map((i) => i.matchedText || i.description)
        .slice(0, 3);
      recommendations.push(`Dodaj brakujące sekcje: ${missingSections?.join(', ')}`);
    }

    if (issuesByType.has('inconsistent_status')) {
      recommendations.push('Skoryguj status raportu zgodnie z rzeczywistymi wynikami zadań');
    }

    // Add general recommendations if none specific
    if (recommendations.length === 0 && issues.length > 0) {
      recommendations.push('Przejrzyj i popraw wykryte problemy przed prezentacją użytkownikowi');
    }

    return recommendations;
  }

  /**
   * Generate a corrected version of the report based on issues found
   */
  generateCorrectedReport(report: string, issues: ValidationIssue[]): string {
    let correctedReport = report;

    // Sort issues by severity (critical first)
    const sortedIssues = [...issues].sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });

    // Apply corrections based on issue type
    for (const issue of sortedIssues) {
      switch (issue.type) {
        case 'generic_name':
          // Replace generic names with placeholder warnings
          if (issue.matchedText) {
            correctedReport = correctedReport.replace(
              new RegExp(escapeRegex(issue.matchedText), 'g'),
              `[WERYFIKUJ: ${issue.matchedText}]`,
            );
          }
          break;

        case 'speculative_language':
          // Mark speculative language
          if (issue.matchedText) {
            const words = issue.matchedText.split(', ');
            for (const word of words) {
              correctedReport = correctedReport.replace(
                new RegExp(`\\b${escapeRegex(word)}\\b`, 'gi'),
                `**[?]** ${word}`,
              );
            }
          }
          break;

        case 'fabricated_file':
          // Mark fabricated files
          if (issue.matchedText) {
            correctedReport = correctedReport.replace(
              new RegExp(escapeRegex(issue.matchedText), 'g'),
              `**[NIEWERYFIKOWANY]** ${issue.matchedText}`,
            );
          }
          break;

        case 'proposal_instead_action':
          // Mark proposals
          if (issue.matchedText) {
            correctedReport = correctedReport.replace(
              issue.matchedText,
              `**[PROPOZYCJA, NIE AKCJA]** ${issue.matchedText}`,
            );
          }
          break;
      }
    }

    // Add validation summary at the top
    const criticalCount = issues.filter((i) => i.severity === 'critical').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;

    if (criticalCount > 0 || warningCount > 0) {
      const validationHeader = `
> **UWAGA WALIDACYJNA**
> Wykryto ${criticalCount} krytycznych i ${warningCount} ostrzeżeń.
> Elementy oznaczone [WERYFIKUJ], [NIEWERYFIKOWANY], [?] wymagają sprawdzenia.

`;
      correctedReport = validationHeader + correctedReport;
    }

    return correctedReport;
  }

  /**
   * Log validation results to console
   */
  logResults(result: ValidationResult): void {
    const statusColor = result.isValid
      ? chalk.green
      : result.score >= 40
        ? chalk.yellow
        : chalk.red;
    const statusText = result.isValid ? 'VALID' : 'NEEDS REVIEW';

    console.log(chalk.cyan(`\n${'='.repeat(60)}`));
    console.log(chalk.cyan('  FINAL REPORT VALIDATION'));
    console.log(chalk.cyan('='.repeat(60)));

    console.log(statusColor(`\nStatus: ${statusText} | Score: ${result.score}/100`));
    console.log(
      chalk.gray(`Checks: ${result.stats.passedChecks}/${result.stats.totalChecks} passed`),
    );
    console.log(chalk.gray(`Citation Coverage: ${result.stats.citationCoverage}%`));
    console.log(chalk.gray(`Objective Alignment: ${result.stats.objectiveAlignment}%`));

    if (result.issues.length > 0) {
      console.log(chalk.yellow(`\nIssues Found: ${result.issues.length}`));

      // Group by severity
      const critical = result.issues.filter((i) => i.severity === 'critical');
      const warnings = result.issues.filter((i) => i.severity === 'warning');
      const info = result.issues.filter((i) => i.severity === 'info');

      if (critical.length > 0) {
        console.log(chalk.red(`\n  CRITICAL (${critical.length}):`));
        for (const issue of critical.slice(0, 5)) {
          console.log(chalk.red(`    - ${issue.description}`));
          if (issue.matchedText) {
            console.log(chalk.gray(`      "${issue.matchedText.substring(0, 50)}..."`));
          }
        }
      }

      if (warnings.length > 0) {
        console.log(chalk.yellow(`\n  WARNINGS (${warnings.length}):`));
        for (const issue of warnings.slice(0, 5)) {
          console.log(chalk.yellow(`    - ${issue.description}`));
        }
      }

      if (info.length > 0 && this.verbose) {
        console.log(chalk.gray(`\n  INFO (${info.length}):`));
        for (const issue of info.slice(0, 3)) {
          console.log(chalk.gray(`    - ${issue.description}`));
        }
      }
    }

    if (result.recommendations.length > 0) {
      console.log(chalk.cyan('\n  RECOMMENDATIONS:'));
      for (const rec of result.recommendations) {
        console.log(chalk.white(`    - ${rec}`));
      }
    }

    console.log(chalk.cyan(`\n${'='.repeat(60)}`));
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Default validator instance
 */
export const finalReportValidator = new FinalReportValidator({ verbose: false });

/**
 * Quick validation function
 */
export function validateFinalReport(
  report: string,
  originalObjective: string,
  agentResults: ExecutionResult[],
): ValidationResult {
  return finalReportValidator.validateReport(report, originalObjective, agentResults);
}

/**
 * Quick check if report is valid
 */
export function isReportValid(
  report: string,
  originalObjective: string,
  agentResults: ExecutionResult[],
): boolean {
  const result = finalReportValidator.validateReport(report, originalObjective, agentResults);
  return result.isValid;
}

export default {
  FinalReportValidator,
  finalReportValidator,
  validateFinalReport,
  isReportValid,
  SPECULATIVE_LANGUAGE_PATTERNS,
};

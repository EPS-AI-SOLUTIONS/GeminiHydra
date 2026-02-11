/**
 * PromptClarityScorer - Solution 44
 *
 * Scores how clear and unambiguous a prompt is before execution.
 * Ensures prompts are actionable.
 *
 * Features:
 * - Detects vague language and missing specifics
 * - Identifies ambiguous references
 * - Checks sentence complexity
 * - Validates presence of action verbs
 * - Provides improvement suggestions
 */

import chalk from 'chalk';

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Types of clarity issues that can be detected
 */
export type ClarityIssueType =
  | 'vague_language'
  | 'missing_specifics'
  | 'ambiguous_reference'
  | 'complex_sentence'
  | 'missing_action_verb'
  | 'unclear_scope'
  | 'missing_context'
  | 'contradictory_statements'
  | 'incomplete_instruction';

/**
 * Detailed information about a clarity issue
 */
export interface ClarityIssue {
  type: ClarityIssueType;
  description: string;
  position?: number; // Character position in the prompt
  word?: string; // The problematic word/phrase
  severity: 'low' | 'medium' | 'high';
  impact: number; // Score impact (0-20)
}

/**
 * Complete clarity analysis result
 */
export interface ClarityScore {
  score: number; // 0-100 overall clarity score
  issues: ClarityIssue[]; // All detected issues
  suggestions: string[]; // Improvement suggestions
  isActionable: boolean; // true if score >= 60

  // Detailed breakdown
  breakdown: ClarityBreakdown;

  // Meta information
  wordCount: number;
  sentenceCount: number;
  avgWordsPerSentence: number;
  processingTimeMs: number;
}

/**
 * Score breakdown by category
 */
export interface ClarityBreakdown {
  specificity: number; // 0-100: How specific is the prompt?
  actionability: number; // 0-100: Are there clear action verbs?
  unambiguity: number; // 0-100: Free from ambiguous references?
  simplicity: number; // 0-100: Sentence complexity manageable?
  completeness: number; // 0-100: All necessary info present?
}

/**
 * Configuration for the scorer
 */
export interface PromptClarityScorerConfig {
  enableLogging: boolean;
  minActionableScore: number; // Default: 60
  maxSentenceWords: number; // Default: 30
  customVagueWords?: string[];
  customActionVerbs?: string[];
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/**
 * Words and phrases indicating vague language
 */
export const VAGUE_WORDS = [
  // Extremely vague
  'something',
  'stuff',
  'things',
  'whatever',
  'somehow',
  'somewhere',
  'everything',
  'anything',
  'nothing',
  'everything else',

  // Moderately vague
  'maybe',
  'perhaps',
  'possibly',
  'probably',
  'might',
  'could be',
  'sort of',
  'kind of',
  'like',
  'basically',
  'essentially',
  'generally',

  // Polish equivalents
  'cos',
  'coz',
  'jakos',
  'gdzies',
  'kiedys',
  'moze',
  'pewnie',
  'jakies',
  'pare',
  'troche',
  'nieco',
  'w sumie',
  'w zasadzie',

  // Quantity vagueness
  'some',
  'few',
  'many',
  'lots',
  'bunch',
  'various',
  'several',
  'a bit',
  'a little',
  'a lot',
  'most',
  'numerous',

  // Quality vagueness
  'good',
  'bad',
  'nice',
  'great',
  'okay',
  'fine',
  'decent',
  'better',
  'worse',
  'best',
  'worst',
  'proper',
  'appropriate',

  // Hedging
  'i think',
  'i guess',
  'i suppose',
  'i believe',
  'seems like',
  'appears to',
  'looks like',
  'might be',
  'should be',
];

/**
 * Ambiguous pronouns and references
 */
const AMBIGUOUS_REFERENCES = [
  // Pronouns without clear antecedent (checked in context)
  { word: 'it', pattern: /\bit\b/gi },
  {
    word: 'this',
    pattern:
      /\bthis\b(?!\s+(file|function|class|method|variable|code|project|directory|folder|error|bug))/gi,
  },
  {
    word: 'that',
    pattern:
      /\bthat\b(?!\s+(file|function|class|method|variable|code|project|directory|folder|error|bug))/gi,
  },
  { word: 'they', pattern: /\bthey\b/gi },
  { word: 'them', pattern: /\bthem\b/gi },
  {
    word: 'those',
    pattern: /\bthose\b(?!\s+(files|functions|classes|methods|variables|errors|bugs))/gi,
  },
  {
    word: 'these',
    pattern: /\bthese\b(?!\s+(files|functions|classes|methods|variables|errors|bugs))/gi,
  },

  // Polish equivalents
  {
    word: 'to',
    pattern: /\bto\b(?!\s+(plik|funkcja|klasa|metoda|zmienna|kod|projekt|katalog|blad))/gi,
  },
  { word: 'te', pattern: /\bte\b(?!\s+(pliki|funkcje|klasy|metody|zmienne|bledy))/gi },
  { word: 'tamto', pattern: /\btamto\b/gi },
  { word: 'tamte', pattern: /\btamte\b/gi },
];

/**
 * Action verbs that indicate clear instructions
 */
export const ACTION_VERBS = [
  // Creation
  'create',
  'make',
  'build',
  'generate',
  'write',
  'add',
  'implement',
  'develop',
  'design',
  'construct',
  'produce',
  'compose',

  // Modification
  'update',
  'modify',
  'change',
  'edit',
  'fix',
  'repair',
  'correct',
  'refactor',
  'improve',
  'enhance',
  'optimize',
  'adjust',
  'revise',

  // Deletion
  'delete',
  'remove',
  'clear',
  'clean',
  'erase',
  'drop',
  'eliminate',

  // Analysis
  'analyze',
  'check',
  'verify',
  'validate',
  'test',
  'review',
  'examine',
  'inspect',
  'audit',
  'assess',
  'evaluate',
  'investigate',
  'debug',

  // Movement/Organization
  'move',
  'copy',
  'rename',
  'reorganize',
  'restructure',
  'merge',
  'split',

  // Configuration
  'configure',
  'setup',
  'install',
  'deploy',
  'enable',
  'disable',

  // Information
  'find',
  'search',
  'list',
  'show',
  'display',
  'explain',
  'describe',
  'document',
  'summarize',
  'compare',
  'extract',

  // Polish equivalents
  'stworz',
  'utworz',
  'napisz',
  'dodaj',
  'zaimplementuj',
  'zbuduj',
  'zaktualizuj',
  'zmien',
  'edytuj',
  'napraw',
  'popraw',
  'zoptymalizuj',
  'usun',
  'wyczysc',
  'skasuj',
  'przeanalizuj',
  'sprawdz',
  'zweryfikuj',
  'przetestuj',
  'zbadaj',
  'przenies',
  'skopiuj',
  'zmien nazwe',
  'polacz',
  'rozdziel',
  'skonfiguruj',
  'zainstaluj',
  'wdroź',
  'znajdz',
  'wyszukaj',
  'pokaz',
  'wyswietl',
  'wyjasni',
  'opisz',
];

/**
 * Specific nouns that indicate clear scope
 */
export const SPECIFIC_NOUNS = [
  // Code artifacts
  'file',
  'function',
  'class',
  'method',
  'variable',
  'constant',
  'module',
  'component',
  'interface',
  'type',
  'enum',
  'struct',
  'package',
  'library',
  'dependency',
  'import',
  'export',

  // Project structure
  'directory',
  'folder',
  'path',
  'project',
  'repository',
  'repo',
  'branch',
  'commit',
  'config',
  'configuration',
  'settings',

  // Content
  'test',
  'spec',
  'documentation',
  'readme',
  'comment',
  'annotation',
  'api',
  'endpoint',
  'route',
  'handler',
  'controller',
  'service',

  // Technical
  'database',
  'table',
  'schema',
  'query',
  'index',
  'migration',
  'server',
  'client',
  'request',
  'response',
  'error',
  'exception',

  // Polish equivalents
  'plik',
  'funkcja',
  'klasa',
  'metoda',
  'zmienna',
  'stala',
  'modul',
  'komponent',
  'interfejs',
  'typ',
  'katalog',
  'sciezka',
  'projekt',
  'repozytorium',
  'galaz',
  'commit',
  'konfiguracja',
  'test',
  'dokumentacja',
  'komentarz',
  'baza danych',
  'tabela',
  'serwer',
  'klient',
  'zapytanie',
  'odpowiedz',
  'blad',
  'wyjatek',
];

/**
 * Patterns indicating incomplete instructions
 */
const INCOMPLETE_PATTERNS = [
  /\bwith\s*$/i,
  /\busing\s*$/i,
  /\blike\s*$/i,
  /\bsuch as\s*$/i,
  /\bfor\s+(example|instance)\s*$/i,
  /\betc\.?\s*$/i,
  /\.{3}\s*$/, // Trailing ellipsis
  /\band\s+(so\s+)?on\s*$/i,
  /\band\s+more\s*$/i,
  /\band\s+stuff\s*$/i,

  // Polish
  /\bitd\.?\s*$/i,
  /\bitp\.?\s*$/i,
  /\bi\s+tak\s+dalej\s*$/i,
  /\bi\s+inne\s*$/i,
];

// ============================================================================
// PROMPT CLARITY SCORER CLASS
// ============================================================================

/**
 * PromptClarityScorer - Analyzes and scores prompt clarity
 */
export class PromptClarityScorer {
  private config: PromptClarityScorerConfig;
  private vagueWordSet: Set<string>;
  private actionVerbSet: Set<string>;
  private specificNounSet: Set<string>;

  constructor(config: Partial<PromptClarityScorerConfig> = {}) {
    this.config = {
      enableLogging: config.enableLogging ?? true,
      minActionableScore: config.minActionableScore ?? 60,
      maxSentenceWords: config.maxSentenceWords ?? 30,
      customVagueWords: config.customVagueWords,
      customActionVerbs: config.customActionVerbs,
    };

    // Build word sets for efficient lookup
    this.vagueWordSet = new Set([
      ...VAGUE_WORDS.map((w) => w.toLowerCase()),
      ...(config.customVagueWords || []).map((w) => w.toLowerCase()),
    ]);

    this.actionVerbSet = new Set([
      ...ACTION_VERBS.map((w) => w.toLowerCase()),
      ...(config.customActionVerbs || []).map((w) => w.toLowerCase()),
    ]);

    this.specificNounSet = new Set(SPECIFIC_NOUNS.map((w) => w.toLowerCase()));
  }

  /**
   * Main scoring method - analyzes prompt clarity
   */
  scoreClarity(prompt: string): ClarityScore {
    const startTime = Date.now();
    const issues: ClarityIssue[] = [];
    const suggestions: string[] = [];

    // Basic text analysis
    const words = this.tokenize(prompt);
    const sentences = this.splitSentences(prompt);
    const wordCount = words.length;
    const sentenceCount = sentences.length;
    const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;

    // Run all checks
    this.checkVagueLanguage(prompt, words, issues);
    this.checkMissingSpecifics(prompt, words, issues);
    this.checkAmbiguousReferences(prompt, issues);
    this.checkSentenceComplexity(sentences, issues);
    this.checkActionVerbs(prompt, words, issues);
    this.checkIncompleteInstructions(prompt, issues);
    this.checkContradictions(prompt, issues);

    // Calculate breakdown scores
    const breakdown = this.calculateBreakdown(prompt, words, issues);

    // Calculate overall score (weighted average)
    const score = this.calculateOverallScore(breakdown, issues);

    // Generate suggestions based on issues
    this.generateSuggestions(issues, breakdown, suggestions);

    const processingTimeMs = Date.now() - startTime;

    const result: ClarityScore = {
      score,
      issues,
      suggestions,
      isActionable: score >= this.config.minActionableScore,
      breakdown,
      wordCount,
      sentenceCount,
      avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
      processingTimeMs,
    };

    if (this.config.enableLogging) {
      this.logResult(result);
    }

    return result;
  }

  // ==========================================================================
  // DETECTION METHODS
  // ==========================================================================

  private checkVagueLanguage(prompt: string, words: string[], issues: ClarityIssue[]): void {
    const promptLower = prompt.toLowerCase();

    for (const vagueWord of this.vagueWordSet) {
      // Check for multi-word phrases
      if (vagueWord.includes(' ')) {
        if (promptLower.includes(vagueWord)) {
          const pos = promptLower.indexOf(vagueWord);
          issues.push({
            type: 'vague_language',
            description: `Vague phrase "${vagueWord}" makes the intent unclear`,
            position: pos,
            word: vagueWord,
            severity: this.getVagueSeverity(vagueWord),
            impact: this.getVagueImpact(vagueWord),
          });
        }
      } else {
        // Single word check
        for (let i = 0; i < words.length; i++) {
          if (words[i].toLowerCase() === vagueWord) {
            const pos = this.findWordPosition(prompt, vagueWord, i);
            issues.push({
              type: 'vague_language',
              description: `Vague word "${vagueWord}" - consider being more specific`,
              position: pos,
              word: vagueWord,
              severity: this.getVagueSeverity(vagueWord),
              impact: this.getVagueImpact(vagueWord),
            });
            break; // Only report first occurrence
          }
        }
      }
    }
  }

  private checkMissingSpecifics(prompt: string, words: string[], issues: ClarityIssue[]): void {
    const promptLower = prompt.toLowerCase();

    // Check for specific nouns
    const hasSpecificNouns = words.some((w) => this.specificNounSet.has(w.toLowerCase()));

    // Check for file paths or names
    const hasFilePath =
      /[/\\][\w.-]+\.[a-z]{1,5}|[\w.-]+\.(ts|js|tsx|jsx|py|rs|go|java|cpp|c|h|css|html|json|yaml|yml|md|txt)/i.test(
        prompt,
      );

    // Check for function/class names (PascalCase or camelCase or snake_case)
    const hasCodeIdentifier =
      /\b[A-Z][a-z]+[A-Z][a-z]+\b|\b[a-z]+[A-Z][a-z]+\b|\b[a-z]+_[a-z]+\b/.test(prompt);

    // Check for specific numbers/values
    const _hasSpecificValues = /\b\d+(\.\d+)?\b/.test(prompt);

    // Check for quoted strings (specific values)
    const _hasQuotedStrings = /"[^"]+"|'[^']+'/.test(prompt);

    if (!hasSpecificNouns && !hasFilePath && !hasCodeIdentifier) {
      issues.push({
        type: 'missing_specifics',
        description: 'No specific code artifacts mentioned (file, function, class, etc.)',
        severity: 'high',
        impact: 15,
      });
    }

    // Check for action without target
    const actionPattern = /\b(create|make|add|update|fix|delete|remove)\b/i;
    const targetPattern =
      /\b(file|function|class|method|variable|component|test|module|directory)\b/i;

    if (actionPattern.test(promptLower) && !targetPattern.test(promptLower) && !hasFilePath) {
      issues.push({
        type: 'missing_specifics',
        description: 'Action verb found but no clear target specified',
        severity: 'medium',
        impact: 10,
      });
    }
  }

  private checkAmbiguousReferences(prompt: string, issues: ClarityIssue[]): void {
    for (const ref of AMBIGUOUS_REFERENCES) {
      const matches = prompt.matchAll(ref.pattern);
      for (const match of matches) {
        // Check if reference appears at start or without clear antecedent
        const pos = match.index || 0;
        const textBefore = prompt.substring(Math.max(0, pos - 50), pos);

        // Check if there's a clear noun before this reference
        const hasAntecedent = SPECIFIC_NOUNS.some((noun) =>
          new RegExp(`\\b${noun}\\b`, 'i').test(textBefore),
        );

        if (!hasAntecedent) {
          issues.push({
            type: 'ambiguous_reference',
            description: `Ambiguous reference "${ref.word}" - unclear what it refers to`,
            position: pos,
            word: ref.word,
            severity: pos < 30 ? 'high' : 'medium', // More severe at start
            impact: pos < 30 ? 12 : 8,
          });
          break; // Only report first unclear reference per word
        }
      }
    }
  }

  private checkSentenceComplexity(sentences: string[], issues: ClarityIssue[]): void {
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const words = this.tokenize(sentence);

      if (words.length > this.config.maxSentenceWords) {
        issues.push({
          type: 'complex_sentence',
          description: `Sentence ${i + 1} is very long (${words.length} words) - consider breaking it up`,
          position: this.findSentencePosition(sentences, i),
          severity: words.length > 50 ? 'high' : 'medium',
          impact: Math.min(10, Math.floor((words.length - this.config.maxSentenceWords) / 5) * 2),
        });
      }

      // Check for nested clauses (multiple commas)
      const commaCount = (sentence.match(/,/g) || []).length;
      if (commaCount >= 4) {
        issues.push({
          type: 'complex_sentence',
          description: `Sentence ${i + 1} has many clauses - may be hard to parse`,
          position: this.findSentencePosition(sentences, i),
          severity: 'low',
          impact: 5,
        });
      }
    }
  }

  private checkActionVerbs(prompt: string, words: string[], issues: ClarityIssue[]): void {
    const hasActionVerb = words.some((w) => this.actionVerbSet.has(w.toLowerCase()));

    // Also check for common command patterns
    const _hasCommandPattern = /^(please\s+)?(can\s+you\s+)?(help\s+me\s+)?/i.test(prompt);
    const actionAfterPattern = /\b(please|can you|help me)\s+\w+/i.test(prompt);

    if (!hasActionVerb && !actionAfterPattern) {
      issues.push({
        type: 'missing_action_verb',
        description: 'No clear action verb found - what should be done?',
        severity: 'high',
        impact: 15,
      });
    }

    // Check for conflicting actions
    const actionMatches = words.filter((w) => this.actionVerbSet.has(w.toLowerCase()));
    if (actionMatches.length > 3) {
      issues.push({
        type: 'unclear_scope',
        description: `Multiple actions requested (${actionMatches.length}) - consider splitting into separate tasks`,
        severity: 'medium',
        impact: 8,
      });
    }
  }

  private checkIncompleteInstructions(prompt: string, issues: ClarityIssue[]): void {
    for (const pattern of INCOMPLETE_PATTERNS) {
      if (pattern.test(prompt)) {
        const match = prompt.match(pattern);
        issues.push({
          type: 'incomplete_instruction',
          description: 'Prompt appears incomplete - trailing pattern detected',
          position: match ? prompt.indexOf(match[0]) : prompt.length - 10,
          severity: 'medium',
          impact: 10,
        });
        break;
      }
    }

    // Check for questions without enough context
    if (/^(what|how|why|when|where|which|who)\b/i.test(prompt) && prompt.split(/\s+/).length < 5) {
      issues.push({
        type: 'missing_context',
        description: 'Question is too brief - provide more context',
        severity: 'medium',
        impact: 10,
      });
    }
  }

  private checkContradictions(prompt: string, issues: ClarityIssue[]): void {
    // Common contradiction patterns
    const contradictions = [
      { patterns: [/\bdo\b/i, /\bdon'?t\b/i], desc: "Conflicting do/don't instructions" },
      { patterns: [/\badd\b/i, /\bremove\b/i], desc: 'Both add and remove mentioned' },
      { patterns: [/\bcreate\b/i, /\bdelete\b/i], desc: 'Both create and delete mentioned' },
      { patterns: [/\benable\b/i, /\bdisable\b/i], desc: 'Both enable and disable mentioned' },
      { patterns: [/\ball\b/i, /\bnone\b/i], desc: 'Conflicting all/none scope' },
    ];

    for (const { patterns, desc } of contradictions) {
      if (patterns.every((p) => p.test(prompt))) {
        // Check if they're in the same sentence (more likely contradiction)
        const sentences = this.splitSentences(prompt);
        const inSameSentence = sentences.some((s) => patterns.every((p) => p.test(s)));

        if (inSameSentence) {
          issues.push({
            type: 'contradictory_statements',
            description: desc,
            severity: 'high',
            impact: 12,
          });
        }
      }
    }
  }

  // ==========================================================================
  // SCORING CALCULATIONS
  // ==========================================================================

  private calculateBreakdown(
    prompt: string,
    words: string[],
    issues: ClarityIssue[],
  ): ClarityBreakdown {
    const _promptLower = prompt.toLowerCase();

    // Specificity (0-100)
    let specificity = 50; // Base score
    const hasFilePath = /[/\\][\w.-]+\.[a-z]{1,5}/i.test(prompt);
    const hasCodeIdentifier = /\b[A-Z][a-z]+[A-Z][a-z]+\b|\b[a-z]+[A-Z][a-z]+\b/.test(prompt);
    const specificNounCount = words.filter((w) => this.specificNounSet.has(w.toLowerCase())).length;

    specificity += hasFilePath ? 20 : 0;
    specificity += hasCodeIdentifier ? 15 : 0;
    specificity += Math.min(15, specificNounCount * 5);
    specificity -= issues.filter((i) => i.type === 'missing_specifics').length * 15;
    specificity = Math.max(0, Math.min(100, specificity));

    // Actionability (0-100)
    let actionability = 40; // Base score
    const actionVerbCount = words.filter((w) => this.actionVerbSet.has(w.toLowerCase())).length;
    actionability += Math.min(40, actionVerbCount * 20);
    actionability -= issues.filter((i) => i.type === 'missing_action_verb').length * 30;
    actionability -= issues.filter((i) => i.type === 'unclear_scope').length * 10;
    actionability = Math.max(0, Math.min(100, actionability));

    // Unambiguity (0-100)
    let unambiguity = 80; // Start high, deduct for issues
    unambiguity -= issues.filter((i) => i.type === 'ambiguous_reference').length * 12;
    unambiguity -= issues.filter((i) => i.type === 'vague_language').length * 8;
    unambiguity -= issues.filter((i) => i.type === 'contradictory_statements').length * 20;
    unambiguity = Math.max(0, Math.min(100, unambiguity));

    // Simplicity (0-100)
    let simplicity = 100; // Start perfect, deduct for complexity
    simplicity -= issues
      .filter((i) => i.type === 'complex_sentence')
      .reduce((sum, i) => sum + i.impact, 0);
    const avgWords = words.length / Math.max(1, this.splitSentences(prompt).length);
    if (avgWords > 25) simplicity -= 10;
    if (avgWords > 35) simplicity -= 15;
    simplicity = Math.max(0, Math.min(100, simplicity));

    // Completeness (0-100)
    let completeness = 70; // Base score
    completeness -= issues.filter((i) => i.type === 'incomplete_instruction').length * 20;
    completeness -= issues.filter((i) => i.type === 'missing_context').length * 15;
    if (words.length < 5) completeness -= 20;
    if (words.length >= 10) completeness += 10;
    if (words.length >= 20) completeness += 10;
    completeness = Math.max(0, Math.min(100, completeness));

    return {
      specificity,
      actionability,
      unambiguity,
      simplicity,
      completeness,
    };
  }

  private calculateOverallScore(breakdown: ClarityBreakdown, issues: ClarityIssue[]): number {
    // Weighted average of breakdown scores
    const weights = {
      specificity: 0.25,
      actionability: 0.25,
      unambiguity: 0.2,
      simplicity: 0.15,
      completeness: 0.15,
    };

    let score =
      breakdown.specificity * weights.specificity +
      breakdown.actionability * weights.actionability +
      breakdown.unambiguity * weights.unambiguity +
      breakdown.simplicity * weights.simplicity +
      breakdown.completeness * weights.completeness;

    // Apply high-severity issue penalties
    const highSeverityCount = issues.filter((i) => i.severity === 'high').length;
    if (highSeverityCount > 0) {
      score -= highSeverityCount * 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  // ==========================================================================
  // SUGGESTION GENERATION
  // ==========================================================================

  private generateSuggestions(
    issues: ClarityIssue[],
    breakdown: ClarityBreakdown,
    suggestions: string[],
  ): void {
    // Add suggestions based on issues
    const issueTypes = new Set(issues.map((i) => i.type));

    if (issueTypes.has('vague_language')) {
      const vagueWords = issues
        .filter((i) => i.type === 'vague_language')
        .map((i) => i.word)
        .filter(Boolean)
        .slice(0, 3);

      if (vagueWords.length > 0) {
        suggestions.push(
          `Replace vague words (${vagueWords.join(', ')}) with specific terms or values`,
        );
      }
    }

    if (issueTypes.has('missing_specifics')) {
      suggestions.push('Specify exact file names, function names, or class names to target');
    }

    if (issueTypes.has('ambiguous_reference')) {
      suggestions.push('Clarify what "it", "this", or "that" refers to by using explicit names');
    }

    if (issueTypes.has('missing_action_verb')) {
      suggestions.push(
        'Start with a clear action verb: create, update, fix, delete, analyze, etc.',
      );
    }

    if (issueTypes.has('complex_sentence')) {
      suggestions.push('Break long sentences into shorter, focused instructions');
    }

    if (issueTypes.has('incomplete_instruction')) {
      suggestions.push('Complete the instruction - avoid trailing "etc." or ellipsis');
    }

    if (issueTypes.has('contradictory_statements')) {
      suggestions.push('Remove contradicting instructions - split into separate tasks if needed');
    }

    // Add breakdown-specific suggestions
    if (breakdown.specificity < 50) {
      suggestions.push(
        'Add specific details: file paths, line numbers, variable names, or error messages',
      );
    }

    if (breakdown.completeness < 50 && !suggestions.some((s) => s.includes('context'))) {
      suggestions.push('Provide more context about what you want to achieve');
    }

    // Limit suggestions
    if (suggestions.length > 5) {
      suggestions.length = 5;
    }

    // Add positive reinforcement if score is good
    if (issues.length === 0) {
      suggestions.push('Prompt is clear and well-structured!');
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  private tokenize(text: string): string[] {
    return text
      .split(/[\s\n\r\t]+/)
      .map((w) => w.replace(/^[^\w]+|[^\w]+$/g, ''))
      .filter((w) => w.length > 0);
  }

  private splitSentences(text: string): string[] {
    return text
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  private findWordPosition(text: string, word: string, occurrence: number): number {
    let pos = -1;
    let count = 0;
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
      if (count === occurrence) {
        pos = match.index;
        break;
      }
      count++;
    }

    return pos;
  }

  private findSentencePosition(sentences: string[], index: number): number {
    let pos = 0;
    for (let i = 0; i < index; i++) {
      pos += sentences[i].length + 1; // +1 for separator
    }
    return pos;
  }

  private getVagueSeverity(word: string): 'low' | 'medium' | 'high' {
    const highVague = ['something', 'stuff', 'things', 'whatever', 'somehow'];
    const lowVague = ['maybe', 'perhaps', 'possibly', 'probably'];

    if (highVague.includes(word.toLowerCase())) return 'high';
    if (lowVague.includes(word.toLowerCase())) return 'low';
    return 'medium';
  }

  private getVagueImpact(word: string): number {
    const highVague = ['something', 'stuff', 'things', 'whatever', 'somehow'];
    const lowVague = ['maybe', 'perhaps', 'possibly', 'probably'];

    if (highVague.includes(word.toLowerCase())) return 12;
    if (lowVague.includes(word.toLowerCase())) return 4;
    return 8;
  }

  private logResult(result: ClarityScore): void {
    const scoreColor = result.score >= 80 ? 'green' : result.score >= 60 ? 'yellow' : 'red';
    const icon = result.isActionable ? 'OK' : '!!';

    console.log(
      chalk[scoreColor](
        `[ClarityScorer] [${icon}] Score: ${result.score}/100 | ` +
          `S:${result.breakdown.specificity} A:${result.breakdown.actionability} ` +
          `U:${result.breakdown.unambiguity} Si:${result.breakdown.simplicity} ` +
          `C:${result.breakdown.completeness} | ${result.issues.length} issues`,
      ),
    );

    if (result.issues.length > 0 && result.score < 70) {
      console.log(
        chalk.gray(
          `[ClarityScorer] Issues: ${result.issues
            .slice(0, 3)
            .map((i) => i.type)
            .join(', ')}` +
            (result.issues.length > 3 ? ` (+${result.issues.length - 3} more)` : ''),
        ),
      );
    }
  }

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  /**
   * Update configuration
   */
  setConfig(config: Partial<PromptClarityScorerConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.customVagueWords) {
      for (const word of config.customVagueWords) {
        this.vagueWordSet.add(word.toLowerCase());
      }
    }

    if (config.customActionVerbs) {
      for (const word of config.customActionVerbs) {
        this.actionVerbSet.add(word.toLowerCase());
      }
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PromptClarityScorerConfig {
    return { ...this.config };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Default singleton instance
 */
export const promptClarityScorer = new PromptClarityScorer();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick clarity check - returns score only
 */
export function getPromptClarityScore(prompt: string): number {
  return promptClarityScorer.scoreClarity(prompt).score;
}

/**
 * Check if prompt is actionable (score >= 60)
 */
export function isPromptActionable(prompt: string): boolean {
  return promptClarityScorer.scoreClarity(prompt).isActionable;
}

/**
 * Get improvement suggestions for a prompt
 */
export function getPromptSuggestions(prompt: string): string[] {
  return promptClarityScorer.scoreClarity(prompt).suggestions;
}

/**
 * Get detailed clarity analysis
 */
export function analyzePromptClarity(prompt: string): ClarityScore {
  return promptClarityScorer.scoreClarity(prompt);
}

/**
 * Format clarity score as human-readable string
 */
export function formatClarityScore(score: ClarityScore): string {
  const lines: string[] = [];

  // Header
  const icon = score.isActionable ? 'OK' : '!!';
  lines.push(`=== PROMPT CLARITY SCORE: ${score.score}/100 [${icon}] ===`);
  lines.push(`Actionable: ${score.isActionable ? 'Yes' : 'No (needs improvement)'}`);
  lines.push('');

  // Breakdown
  lines.push('BREAKDOWN:');
  lines.push(`  Specificity:    ${score.breakdown.specificity}%`);
  lines.push(`  Actionability:  ${score.breakdown.actionability}%`);
  lines.push(`  Unambiguity:    ${score.breakdown.unambiguity}%`);
  lines.push(`  Simplicity:     ${score.breakdown.simplicity}%`);
  lines.push(`  Completeness:   ${score.breakdown.completeness}%`);
  lines.push('');

  // Issues
  if (score.issues.length > 0) {
    lines.push(`ISSUES (${score.issues.length}):`);
    for (const issue of score.issues.slice(0, 5)) {
      const severity = issue.severity === 'high' ? '!!' : issue.severity === 'medium' ? '!' : '-';
      lines.push(`  [${severity}] ${issue.description}`);
    }
    if (score.issues.length > 5) {
      lines.push(`  ... and ${score.issues.length - 5} more`);
    }
    lines.push('');
  }

  // Suggestions
  if (score.suggestions.length > 0) {
    lines.push('SUGGESTIONS:');
    for (const suggestion of score.suggestions) {
      lines.push(`  * ${suggestion}`);
    }
    lines.push('');
  }

  // Stats
  lines.push(
    `Stats: ${score.wordCount} words, ${score.sentenceCount} sentences, ${score.avgWordsPerSentence} avg words/sentence`,
  );
  lines.push(`Processed in ${score.processingTimeMs}ms`);

  return lines.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  PromptClarityScorer,
  promptClarityScorer,
  getPromptClarityScore,
  isPromptActionable,
  getPromptSuggestions,
  analyzePromptClarity,
  formatClarityScore,
  VAGUE_WORDS,
  ACTION_VERBS,
  SPECIFIC_NOUNS,
};

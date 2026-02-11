/**
 * ResponseCoherenceAnalyzer - Solution #41: Response Coherence Analysis
 *
 * Analyzes if a response is internally coherent and logically consistent.
 * Performs multiple checks:
 * 1. Contradictions - Does the response contradict itself?
 * 2. Topic drift - Does it stay on topic throughout?
 * 3. Logical flow - Do statements follow logically?
 * 4. Completeness - Are all claims concluded?
 * 5. Consistency - Are file/function names used consistently?
 */

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Represents a coherence issue found in the response
 */
export interface CoherenceIssue {
  /** Type of coherence issue */
  type:
    | 'contradiction'
    | 'topic_drift'
    | 'logical_gap'
    | 'incomplete_claim'
    | 'inconsistent_naming'
    | 'ambiguity';
  /** Human-readable description of the issue */
  description: string;
  /** Location in the response where issue was found */
  location: string;
  /** Severity level */
  severity: 'low' | 'medium' | 'high';
}

/**
 * Result of coherence analysis
 */
export interface CoherenceAnalysis {
  /** Whether the response is coherent overall */
  coherent: boolean;
  /** Coherence score from 0-100 */
  score: number;
  /** List of issues found */
  issues: CoherenceIssue[];
  /** Suggestions for improving coherence */
  suggestions: string[];
  /** Breakdown of scores by category */
  breakdown?: CoherenceBreakdown;
}

/**
 * Breakdown of coherence scores by category
 */
export interface CoherenceBreakdown {
  contradictions: number;
  topicCoherence: number;
  logicalFlow: number;
  completeness: number;
  namingConsistency: number;
}

/**
 * Configuration options for the analyzer
 */
export interface CoherenceAnalyzerConfig {
  /** Minimum score to be considered coherent (0-100) */
  coherenceThreshold?: number;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Custom patterns to check for contradictions */
  customContradictionPatterns?: string[][];
  /** Ignore certain issue types */
  ignoreIssueTypes?: CoherenceIssue['type'][];
}

// ============================================================================
// Helper Types
// ============================================================================

interface SentenceInfo {
  text: string;
  index: number;
  position: number;
}

interface NameOccurrence {
  name: string;
  context: string;
  position: number;
}

// ============================================================================
// ResponseCoherenceAnalyzer Class
// ============================================================================

/**
 * Analyzes response coherence and logical consistency
 */
export class ResponseCoherenceAnalyzer {
  private config: Required<CoherenceAnalyzerConfig>;

  // Contradiction patterns: [positive assertion, negative assertion]
  private readonly contradictionPatterns: string[][] = [
    ['is', 'is not'],
    ['are', 'are not'],
    ['will', 'will not'],
    ['can', 'cannot'],
    ['should', 'should not'],
    ['must', 'must not'],
    ['does', 'does not'],
    ['always', 'never'],
    ['all', 'none'],
    ['every', 'no'],
    ['true', 'false'],
    ['correct', 'incorrect'],
    ['valid', 'invalid'],
    ['possible', 'impossible'],
    ['required', 'optional'],
    ['exists', 'does not exist'],
    ['available', 'unavailable'],
    ['enabled', 'disabled'],
    ['active', 'inactive'],
    ['success', 'failure'],
    ['synchronous', 'asynchronous'],
    ['mutable', 'immutable'],
    ['public', 'private'],
    ['static', 'dynamic'],
  ];

  // Topic indicator keywords for drift detection
  private readonly topicKeywords = new Set([
    'however',
    'but',
    'although',
    'nevertheless',
    'on the other hand',
    'in contrast',
    'alternatively',
    'meanwhile',
    'incidentally',
    'by the way',
    'speaking of',
    'unrelated',
    'separately',
  ]);

  // Logical connectors for flow analysis
  private readonly logicalConnectors = new Set([
    'therefore',
    'thus',
    'hence',
    'consequently',
    'as a result',
    'because',
    'since',
    'so',
    'accordingly',
    'for this reason',
    'it follows that',
    'which means',
    'leading to',
    'resulting in',
  ]);

  // Incomplete claim indicators
  private readonly incompleteIndicators = [
    /\b(will be|to be) (discussed|covered|explained|shown|demonstrated)\b/i,
    /\b(more|further) (details|information) (later|below|following)\b/i,
    /\b(see|refer to) (the )?(section|chapter|part|appendix)\b/i,
    /\b(as mentioned|as stated|as described) (above|earlier|previously)\b/i,
    /\b(TODO|FIXME|TBD|WIP)\b/,
    /\.\.\./,
    /\betc\.?\b/i,
  ];

  constructor(config: CoherenceAnalyzerConfig = {}) {
    this.config = {
      coherenceThreshold: config.coherenceThreshold ?? 70,
      verbose: config.verbose ?? false,
      customContradictionPatterns: config.customContradictionPatterns ?? [],
      ignoreIssueTypes: config.ignoreIssueTypes ?? [],
    };

    // Add custom patterns
    if (this.config.customContradictionPatterns.length > 0) {
      this.contradictionPatterns.push(...this.config.customContradictionPatterns);
    }
  }

  /**
   * Main method: Analyze the coherence of a response
   */
  analyzeCoherence(response: string): CoherenceAnalysis {
    if (!response || response.trim().length === 0) {
      return {
        coherent: false,
        score: 0,
        issues: [
          {
            type: 'incomplete_claim',
            description: 'Response is empty',
            location: 'entire response',
            severity: 'high',
          },
        ],
        suggestions: ['Provide a non-empty response'],
      };
    }

    const issues: CoherenceIssue[] = [];

    // Run all checks
    const contradictionIssues = this.checkContradictions(response);
    const topicDriftIssues = this.checkTopicDrift(response);
    const logicalFlowIssues = this.checkLogicalFlow(response);
    const completenessIssues = this.checkCompleteness(response);
    const namingIssues = this.checkNamingConsistency(response);

    // Combine issues, filtering out ignored types
    const allIssues = [
      ...contradictionIssues,
      ...topicDriftIssues,
      ...logicalFlowIssues,
      ...completenessIssues,
      ...namingIssues,
    ];

    for (const issue of allIssues) {
      if (!this.config.ignoreIssueTypes.includes(issue.type)) {
        issues.push(issue);
      }
    }

    // Calculate scores
    const breakdown = this.calculateBreakdown(
      contradictionIssues,
      topicDriftIssues,
      logicalFlowIssues,
      completenessIssues,
      namingIssues,
    );

    const score = this.calculateOverallScore(breakdown, issues);
    const coherent = score >= this.config.coherenceThreshold;
    const suggestions = this.generateSuggestions(issues, breakdown);

    if (this.config.verbose) {
      this.logAnalysis(response, score, issues, breakdown);
    }

    return {
      coherent,
      score,
      issues,
      suggestions,
      breakdown,
    };
  }

  // ============================================================================
  // Contradiction Detection
  // ============================================================================

  private checkContradictions(response: string): CoherenceIssue[] {
    const issues: CoherenceIssue[] = [];
    const sentences = this.extractSentences(response);

    // Check each sentence pair for contradictions
    for (let i = 0; i < sentences.length; i++) {
      for (let j = i + 1; j < sentences.length; j++) {
        const contradiction = this.findContradiction(sentences[i], sentences[j]);
        if (contradiction) {
          issues.push({
            type: 'contradiction',
            description: contradiction.description,
            location: `Sentences ${i + 1} and ${j + 1}`,
            severity: this.getContradictionSeverity(sentences[i], sentences[j]),
          });
        }
      }
    }

    // Check for within-sentence contradictions
    for (let i = 0; i < sentences.length; i++) {
      const internalContradiction = this.checkInternalContradiction(sentences[i]);
      if (internalContradiction) {
        issues.push({
          type: 'contradiction',
          description: internalContradiction,
          location: `Sentence ${i + 1}`,
          severity: 'medium',
        });
      }
    }

    return issues;
  }

  private findContradiction(
    sent1: SentenceInfo,
    sent2: SentenceInfo,
  ): { description: string } | null {
    const text1 = sent1.text.toLowerCase();
    const text2 = sent2.text.toLowerCase();

    // Extract subject-verb-object patterns and compare
    for (const [positive, negative] of this.contradictionPatterns) {
      // Check if same subject has contradicting predicates
      const subjectMatch = this.extractCommonSubject(text1, text2);
      if (subjectMatch) {
        const hasPositive1 = text1.includes(positive);
        const hasNegative1 = text1.includes(negative);
        const hasPositive2 = text2.includes(positive);
        const hasNegative2 = text2.includes(negative);

        if ((hasPositive1 && hasNegative2) || (hasNegative1 && hasPositive2)) {
          return {
            description: `Contradicting statements about "${subjectMatch}": "${positive}" vs "${negative}"`,
          };
        }
      }
    }

    // Check for numeric contradictions
    const numericContradiction = this.checkNumericContradiction(text1, text2);
    if (numericContradiction) {
      return { description: numericContradiction };
    }

    return null;
  }

  private extractCommonSubject(text1: string, text2: string): string | null {
    // Extract nouns/subjects from both sentences
    const words1 = new Set(text1.match(/\b[a-z]{3,}\b/gi) || []);
    const words2 = new Set(text2.match(/\b[a-z]{3,}\b/gi) || []);

    // Find common significant words
    const commonWords: string[] = [];
    for (const word of words1) {
      if (words2.has(word) && !this.isStopWord(word)) {
        commonWords.push(word);
      }
    }

    return commonWords.length > 0 ? commonWords[0] : null;
  }

  private checkNumericContradiction(text1: string, text2: string): string | null {
    // Extract numbers with context
    const numPattern = /(\b\w+\b)\s*(?:is|are|equals?|=)\s*(\d+(?:\.\d+)?)/gi;

    const nums1 = new Map<string, number>();
    const nums2 = new Map<string, number>();

    for (let match = numPattern.exec(text1); match !== null; match = numPattern.exec(text1)) {
      nums1.set(match[1].toLowerCase(), parseFloat(match[2]));
    }
    numPattern.lastIndex = 0;
    for (let match = numPattern.exec(text2); match !== null; match = numPattern.exec(text2)) {
      nums2.set(match[1].toLowerCase(), parseFloat(match[2]));
    }

    for (const [key, value1] of nums1) {
      if (nums2.has(key) && nums2.get(key) !== value1) {
        return `Contradicting values for "${key}": ${value1} vs ${nums2.get(key)}`;
      }
    }

    return null;
  }

  private checkInternalContradiction(sentence: SentenceInfo): string | null {
    const text = sentence.text.toLowerCase();

    // Check for self-contradicting patterns
    const selfContradictPatterns = [
      {
        pattern: /\b(is|are)\s+(?:both\s+)?(\w+)\s+and\s+(?:not\s+)?\2\b/i,
        desc: 'Self-contradicting property',
      },
      {
        pattern: /\b(always|never)\s+\w+\s+but\s+sometimes\b/i,
        desc: 'Contradicting frequency terms',
      },
      {
        pattern: /\b(all|every)\s+\w+\s+except\s+(?:some|most|many)\b/i,
        desc: 'Contradicting quantifiers',
      },
    ];

    for (const { pattern, desc } of selfContradictPatterns) {
      if (pattern.test(text)) {
        return desc;
      }
    }

    return null;
  }

  private getContradictionSeverity(
    sent1: SentenceInfo,
    sent2: SentenceInfo,
  ): 'low' | 'medium' | 'high' {
    // Closer sentences with contradictions are more severe
    const distance = Math.abs(sent1.index - sent2.index);
    if (distance <= 2) return 'high';
    if (distance <= 5) return 'medium';
    return 'low';
  }

  // ============================================================================
  // Topic Drift Detection
  // ============================================================================

  private checkTopicDrift(response: string): CoherenceIssue[] {
    const issues: CoherenceIssue[] = [];
    const paragraphs = response.split(/\n\s*\n/).filter((p) => p.trim());

    if (paragraphs.length < 2) {
      return issues;
    }

    // Extract main topics from first paragraph
    const mainTopics = this.extractTopics(paragraphs[0]);

    // Check subsequent paragraphs for topic drift
    for (let i = 1; i < paragraphs.length; i++) {
      const paragraphTopics = this.extractTopics(paragraphs[i]);
      const overlap = this.calculateTopicOverlap(mainTopics, paragraphTopics);

      if (overlap < 0.2) {
        // Check if drift is signaled
        const driftSignaled = this.checkDriftSignal(paragraphs[i]);

        if (!driftSignaled) {
          issues.push({
            type: 'topic_drift',
            description: `Paragraph ${i + 1} appears to drift from the main topic without transition`,
            location: `Paragraph ${i + 1}`,
            severity: overlap < 0.1 ? 'high' : 'medium',
          });
        }
      }
    }

    return issues;
  }

  private extractTopics(text: string): Set<string> {
    const words = text.toLowerCase().match(/\b[a-z]{4,}\b/gi) || [];
    const topics = new Set<string>();

    for (const word of words) {
      if (!this.isStopWord(word)) {
        topics.add(word);
      }
    }

    return topics;
  }

  private calculateTopicOverlap(topics1: Set<string>, topics2: Set<string>): number {
    if (topics1.size === 0 || topics2.size === 0) return 0;

    let overlap = 0;
    for (const topic of topics1) {
      if (topics2.has(topic)) {
        overlap++;
      }
    }

    return overlap / Math.min(topics1.size, topics2.size);
  }

  private checkDriftSignal(paragraph: string): boolean {
    const lowerParagraph = paragraph.toLowerCase();
    return Array.from(this.topicKeywords).some((keyword) => lowerParagraph.includes(keyword));
  }

  // ============================================================================
  // Logical Flow Analysis
  // ============================================================================

  private checkLogicalFlow(response: string): CoherenceIssue[] {
    const issues: CoherenceIssue[] = [];
    const sentences = this.extractSentences(response);

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].text.toLowerCase();

      // Check for logical connectors without proper antecedent
      for (const connector of this.logicalConnectors) {
        if (sentence.includes(connector)) {
          // Check if there's a proper setup
          const hasProperSetup = this.checkLogicalSetup(sentences, i, connector);
          if (!hasProperSetup) {
            issues.push({
              type: 'logical_gap',
              description: `Logical connector "${connector}" used without clear premise`,
              location: `Sentence ${i + 1}`,
              severity: 'medium',
            });
          }
        }
      }

      // Check for unsupported conclusions
      if (this.isConclusionStatement(sentence)) {
        const hasSupport = this.checkConclusionSupport(sentences, i);
        if (!hasSupport) {
          issues.push({
            type: 'logical_gap',
            description: 'Conclusion stated without supporting arguments',
            location: `Sentence ${i + 1}`,
            severity: 'medium',
          });
        }
      }
    }

    return issues;
  }

  private checkLogicalSetup(
    sentences: SentenceInfo[],
    currentIndex: number,
    _connector: string,
  ): boolean {
    // Look back up to 3 sentences for a logical setup
    const lookbackRange = Math.min(3, currentIndex);

    for (let i = currentIndex - 1; i >= currentIndex - lookbackRange; i--) {
      const prevSentence = sentences[i].text.toLowerCase();

      // Check for cause indicators
      if (/\b(because|since|due to|as|given that|if)\b/.test(prevSentence)) {
        return true;
      }

      // Check for shared subjects/topics
      const currentTopics = this.extractTopics(sentences[currentIndex].text);
      const prevTopics = this.extractTopics(prevSentence);
      if (this.calculateTopicOverlap(currentTopics, prevTopics) > 0.3) {
        return true;
      }
    }

    return currentIndex === 0; // First sentence gets a pass
  }

  private isConclusionStatement(sentence: string): boolean {
    const conclusionPatterns = [
      /\b(therefore|thus|hence|consequently|in conclusion)\b/,
      /\b(we can (see|conclude|determine|infer))\b/,
      /\b(this (shows|proves|demonstrates|indicates))\b/,
      /\b(the (result|conclusion|finding) is)\b/,
    ];

    return conclusionPatterns.some((pattern) => pattern.test(sentence));
  }

  private checkConclusionSupport(_sentences: SentenceInfo[], conclusionIndex: number): boolean {
    // Need at least 2 sentences before a conclusion
    return conclusionIndex >= 2;
  }

  // ============================================================================
  // Completeness Check
  // ============================================================================

  private checkCompleteness(response: string): CoherenceIssue[] {
    const issues: CoherenceIssue[] = [];

    // Check for incomplete claim indicators
    for (const pattern of this.incompleteIndicators) {
      const match = response.match(pattern);
      if (match) {
        issues.push({
          type: 'incomplete_claim',
          description: `Incomplete reference: "${match[0]}" without resolution`,
          location: this.findLocation(response, match[0]),
          severity: 'low',
        });
      }
    }

    // Check for unfinished lists
    const listPattern = /(?:^|\n)\s*(?:\d+\.|[-*])\s+.+$/gm;
    const lists = response.match(listPattern) || [];
    if (lists.length > 0) {
      const lastListItem = lists[lists.length - 1];
      if (lastListItem.length < 10) {
        issues.push({
          type: 'incomplete_claim',
          description: 'List appears to be incomplete or truncated',
          location: 'End of list',
          severity: 'medium',
        });
      }
    }

    // Check for unclosed code blocks
    const codeBlockOpens = (response.match(/```\w*/g) || []).length;
    const codeBlockCloses = (response.match(/```\s*$/gm) || []).length;
    if (codeBlockOpens > codeBlockCloses) {
      issues.push({
        type: 'incomplete_claim',
        description: 'Unclosed code block detected',
        location: 'Code block',
        severity: 'high',
      });
    }

    // Check for unfinished sentences
    const sentences = this.extractSentences(response);
    for (let i = 0; i < sentences.length; i++) {
      const sent = sentences[i].text.trim();
      if (sent.length > 10 && !sent.match(/[.!?:;]$/)) {
        issues.push({
          type: 'incomplete_claim',
          description: 'Sentence appears unfinished',
          location: `Sentence ${i + 1}`,
          severity: 'medium',
        });
      }
    }

    return issues;
  }

  // ============================================================================
  // Naming Consistency Check
  // ============================================================================

  private checkNamingConsistency(response: string): CoherenceIssue[] {
    const issues: CoherenceIssue[] = [];

    // Extract all identifiers (file names, function names, variables, etc.)
    const identifiers = this.extractIdentifiers(response);

    // Group by base name to find inconsistencies
    const groups = this.groupSimilarIdentifiers(identifiers);

    for (const [baseName, variations] of groups) {
      if (variations.length > 1) {
        const uniqueVariations = [...new Set(variations.map((v) => v.name))];
        if (uniqueVariations.length > 1) {
          issues.push({
            type: 'inconsistent_naming',
            description: `Inconsistent naming: "${uniqueVariations.join('", "')}"`,
            location: `Multiple occurrences of "${baseName}"`,
            severity: 'medium',
          });
        }
      }
    }

    // Check for case inconsistencies in the same identifier
    const caseInconsistencies = this.checkCaseConsistency(response);
    issues.push(...caseInconsistencies);

    return issues;
  }

  private extractIdentifiers(response: string): NameOccurrence[] {
    const identifiers: NameOccurrence[] = [];

    // Extract code identifiers (camelCase, snake_case, PascalCase)
    const identifierPattern =
      /\b([a-z][a-zA-Z0-9_]*[A-Z][a-zA-Z0-9]*|[a-z]+_[a-z_]+|[A-Z][a-z]+[A-Z][a-zA-Z]*)\b/g;

    // Extract file paths and names
    const filePattern =
      /\b[\w.-]+\.(ts|js|tsx|jsx|py|java|go|rs|cpp|c|h|css|scss|json|yaml|yml|md|txt)\b/gi;

    // Extract function calls
    const functionPattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;

    for (
      let match = identifierPattern.exec(response);
      match !== null;
      match = identifierPattern.exec(response)
    ) {
      identifiers.push({
        name: match[1],
        context: response.substring(
          Math.max(0, match.index - 20),
          match.index + match[0].length + 20,
        ),
        position: match.index,
      });
    }

    for (
      let match = filePattern.exec(response);
      match !== null;
      match = filePattern.exec(response)
    ) {
      identifiers.push({
        name: match[0],
        context: response.substring(
          Math.max(0, match.index - 20),
          match.index + match[0].length + 20,
        ),
        position: match.index,
      });
    }

    for (
      let match = functionPattern.exec(response);
      match !== null;
      match = functionPattern.exec(response)
    ) {
      identifiers.push({
        name: match[1],
        context: response.substring(
          Math.max(0, match.index - 20),
          match.index + match[0].length + 20,
        ),
        position: match.index,
      });
    }

    return identifiers;
  }

  private groupSimilarIdentifiers(identifiers: NameOccurrence[]): Map<string, NameOccurrence[]> {
    const groups = new Map<string, NameOccurrence[]>();

    for (const id of identifiers) {
      // Normalize: lowercase, remove underscores/hyphens
      const baseName = id.name.toLowerCase().replace(/[-_]/g, '');

      if (!groups.has(baseName)) {
        groups.set(baseName, []);
      }
      groups.get(baseName)?.push(id);
    }

    return groups;
  }

  private checkCaseConsistency(response: string): CoherenceIssue[] {
    const issues: CoherenceIssue[] = [];

    // Find words that appear with different casings
    const words = response.match(/\b[a-zA-Z]{4,}\b/g) || [];
    const caseMap = new Map<string, Set<string>>();

    for (const word of words) {
      const lower = word.toLowerCase();
      if (!caseMap.has(lower)) {
        caseMap.set(lower, new Set());
      }
      caseMap.get(lower)?.add(word);
    }

    for (const [lower, variations] of caseMap) {
      if (variations.size > 1) {
        const variationsArray = [...variations];
        // Check if it's just capitalization at start of sentence vs elsewhere
        const isCapitalizationIssue =
          variationsArray.length === 2 &&
          variationsArray[0].toLowerCase() === variationsArray[1].toLowerCase() &&
          (variationsArray[0][0] === variationsArray[0][0].toUpperCase() ||
            variationsArray[1][0] === variationsArray[1][0].toUpperCase());

        if (!isCapitalizationIssue && this.isLikelyCodeIdentifier(lower)) {
          issues.push({
            type: 'inconsistent_naming',
            description: `Inconsistent casing: "${variationsArray.join('", "')}"`,
            location: `Multiple occurrences`,
            severity: 'low',
          });
        }
      }
    }

    return issues;
  }

  private isLikelyCodeIdentifier(word: string): boolean {
    // Check if word looks like a code identifier
    const codePatterns = [
      /^get[A-Z]/,
      /^set[A-Z]/,
      /^is[A-Z]/,
      /^has[A-Z]/,
      /[A-Z][a-z]+[A-Z]/, // camelCase
      /_[a-z]/, // snake_case
      /^[A-Z][a-z]+$/, // PascalCase component
    ];

    return codePatterns.some((pattern) => pattern.test(word));
  }

  // ============================================================================
  // Scoring and Suggestions
  // ============================================================================

  private calculateBreakdown(
    contradictions: CoherenceIssue[],
    topicDrift: CoherenceIssue[],
    logicalFlow: CoherenceIssue[],
    completeness: CoherenceIssue[],
    naming: CoherenceIssue[],
  ): CoherenceBreakdown {
    const scoreFromIssues = (issues: CoherenceIssue[]): number => {
      if (issues.length === 0) return 100;

      let penalty = 0;
      for (const issue of issues) {
        switch (issue.severity) {
          case 'high':
            penalty += 30;
            break;
          case 'medium':
            penalty += 15;
            break;
          case 'low':
            penalty += 5;
            break;
        }
      }

      return Math.max(0, 100 - penalty);
    };

    return {
      contradictions: scoreFromIssues(contradictions),
      topicCoherence: scoreFromIssues(topicDrift),
      logicalFlow: scoreFromIssues(logicalFlow),
      completeness: scoreFromIssues(completeness),
      namingConsistency: scoreFromIssues(naming),
    };
  }

  private calculateOverallScore(breakdown: CoherenceBreakdown, issues: CoherenceIssue[]): number {
    // Weighted average of breakdown scores
    const weights = {
      contradictions: 0.3, // Most important
      logicalFlow: 0.25, // Second most important
      completeness: 0.2, // Third
      topicCoherence: 0.15, // Fourth
      namingConsistency: 0.1, // Least weighted
    };

    let score = 0;
    score += breakdown.contradictions * weights.contradictions;
    score += breakdown.logicalFlow * weights.logicalFlow;
    score += breakdown.completeness * weights.completeness;
    score += breakdown.topicCoherence * weights.topicCoherence;
    score += breakdown.namingConsistency * weights.namingConsistency;

    // Apply additional penalty for high-severity issues
    const highSeverityCount = issues.filter((i) => i.severity === 'high').length;
    score = score * (1 - highSeverityCount * 0.1);

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  private generateSuggestions(issues: CoherenceIssue[], breakdown: CoherenceBreakdown): string[] {
    const suggestions: string[] = [];

    // Group issues by type
    const issuesByType = new Map<string, CoherenceIssue[]>();
    for (const issue of issues) {
      if (!issuesByType.has(issue.type)) {
        issuesByType.set(issue.type, []);
      }
      issuesByType.get(issue.type)?.push(issue);
    }

    // Generate type-specific suggestions
    if (issuesByType.has('contradiction')) {
      const count = issuesByType.get('contradiction')?.length;
      suggestions.push(
        `Review ${count} contradicting statement(s) and ensure consistent messaging throughout the response.`,
      );
    }

    if (issuesByType.has('topic_drift')) {
      suggestions.push('Add transition phrases when changing topics to maintain narrative flow.');
    }

    if (issuesByType.has('logical_gap')) {
      suggestions.push(
        'Ensure logical connectors (therefore, thus, because) have clear premises and conclusions.',
      );
    }

    if (issuesByType.has('incomplete_claim')) {
      suggestions.push('Complete all references and ensure no claims are left unfinished.');
    }

    if (issuesByType.has('inconsistent_naming')) {
      suggestions.push(
        'Standardize naming conventions for identifiers, functions, and file names.',
      );
    }

    // Add breakdown-specific suggestions
    if (breakdown.contradictions < 70) {
      suggestions.push('Consider rephrasing statements that may appear contradictory.');
    }

    if (breakdown.logicalFlow < 70) {
      suggestions.push(
        'Strengthen the logical structure with clearer cause-and-effect relationships.',
      );
    }

    if (breakdown.completeness < 70) {
      suggestions.push('Ensure all started thoughts and lists are completed.');
    }

    return suggestions.length > 0
      ? suggestions
      : ['Response appears coherent. No major suggestions.'];
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private extractSentences(text: string): SentenceInfo[] {
    // Split on sentence boundaries while preserving context
    const sentencePattern = /[^.!?]+[.!?]+/g;
    const sentences: SentenceInfo[] = [];

    let index = 0;

    for (
      let match = sentencePattern.exec(text);
      match !== null;
      match = sentencePattern.exec(text)
    ) {
      sentences.push({
        text: match[0].trim(),
        index: index++,
        position: match.index,
      });
    }

    // Handle text without proper sentence endings
    if (sentences.length === 0 && text.trim().length > 0) {
      sentences.push({
        text: text.trim(),
        index: 0,
        position: 0,
      });
    }

    return sentences;
  }

  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'up',
      'about',
      'into',
      'over',
      'after',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'dare',
      'ought',
      'used',
      'this',
      'that',
      'these',
      'those',
      'it',
      'its',
      'they',
      'them',
      'their',
      'we',
      'us',
      'our',
      'you',
      'your',
      'he',
      'she',
      'him',
      'her',
      'his',
      'hers',
      'which',
      'what',
      'who',
      'whom',
      'whose',
      'when',
      'where',
      'why',
      'how',
      'all',
      'each',
      'every',
      'both',
      'few',
      'more',
      'most',
      'other',
      'some',
      'such',
      'no',
      'not',
      'only',
      'own',
      'same',
      'so',
      'than',
      'too',
      'very',
      'just',
      'also',
    ]);

    return stopWords.has(word.toLowerCase());
  }

  private findLocation(response: string, match: string): string {
    const index = response.indexOf(match);
    if (index === -1) return 'unknown location';

    const before = response.substring(0, index);
    const lineNumber = (before.match(/\n/g) || []).length + 1;
    const sentenceNumber = (before.match(/[.!?]/g) || []).length + 1;

    return `Line ${lineNumber}, around sentence ${sentenceNumber}`;
  }

  private logAnalysis(
    _response: string,
    score: number,
    issues: CoherenceIssue[],
    breakdown: CoherenceBreakdown,
  ): void {
    console.log('\n[CoherenceAnalyzer] Analysis Results:');
    console.log(`  Overall Score: ${score}/100`);
    console.log('  Breakdown:');
    console.log(`    - Contradictions: ${breakdown.contradictions}/100`);
    console.log(`    - Topic Coherence: ${breakdown.topicCoherence}/100`);
    console.log(`    - Logical Flow: ${breakdown.logicalFlow}/100`);
    console.log(`    - Completeness: ${breakdown.completeness}/100`);
    console.log(`    - Naming Consistency: ${breakdown.namingConsistency}/100`);
    console.log(`  Issues Found: ${issues.length}`);

    if (issues.length > 0) {
      console.log('  Issue Details:');
      for (const issue of issues.slice(0, 5)) {
        console.log(`    [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}`);
      }
      if (issues.length > 5) {
        console.log(`    ... and ${issues.length - 5} more issues`);
      }
    }
  }

  // ============================================================================
  // Configuration Methods
  // ============================================================================

  /**
   * Update analyzer configuration
   */
  updateConfig(config: Partial<CoherenceAnalyzerConfig>): void {
    this.config = {
      ...this.config,
      ...config,
      customContradictionPatterns:
        config.customContradictionPatterns ?? this.config.customContradictionPatterns,
      ignoreIssueTypes: config.ignoreIssueTypes ?? this.config.ignoreIssueTypes,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<CoherenceAnalyzerConfig> {
    return { ...this.config };
  }

  /**
   * Add custom contradiction pattern
   */
  addContradictionPattern(positive: string, negative: string): void {
    this.contradictionPatterns.push([positive, negative]);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default singleton instance for easy usage
 */
export const responseCoherenceAnalyzer = new ResponseCoherenceAnalyzer();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick coherence check - returns true if response is coherent
 */
export function isCoherent(response: string, threshold: number = 70): boolean {
  const analysis = responseCoherenceAnalyzer.analyzeCoherence(response);
  return analysis.score >= threshold;
}

/**
 * Get coherence score for a response
 */
export function getCoherenceScore(response: string): number {
  return responseCoherenceAnalyzer.analyzeCoherence(response).score;
}

/**
 * Analyze coherence with custom configuration
 */
export function analyzeCoherence(
  response: string,
  config?: CoherenceAnalyzerConfig,
): CoherenceAnalysis {
  const analyzer = new ResponseCoherenceAnalyzer(config);
  return analyzer.analyzeCoherence(response);
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  ResponseCoherenceAnalyzer,
  responseCoherenceAnalyzer,
  isCoherent,
  getCoherenceScore,
  analyzeCoherence,
};

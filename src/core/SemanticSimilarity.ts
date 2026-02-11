/**
 * SemanticSimilarity - Solution 32
 * Semantic Similarity Checker for Agent Response Validation
 *
 * Checks if agent response semantically matches the task request.
 * Uses TF-IDF-like scoring, concept extraction, and phrase matching.
 */

import chalk from 'chalk';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

/**
 * Result of semantic similarity check
 */
export interface SimilarityResult {
  /** Overall similarity score (0.0 - 1.0) */
  score: number;
  /** Concepts from task that were found in response */
  matchedConcepts: string[];
  /** Concepts from task that were NOT found in response */
  missingConcepts: string[];
  /** Whether the response is considered relevant (score >= 0.6) */
  isRelevant: boolean;
  /** Breakdown of scoring factors */
  scoreBreakdown?: ScoreBreakdown;
}

/**
 * Detailed breakdown of scoring components
 */
export interface ScoreBreakdown {
  /** Score from exact concept matches */
  conceptMatchScore: number;
  /** Score from TF-IDF weighted matches */
  tfidfScore: number;
  /** Score from phrase/n-gram matching */
  phraseMatchScore: number;
  /** Score from word order similarity */
  orderScore: number;
  /** Penalty for irrelevant content */
  irrelevancePenalty: number;
}

/**
 * Extracted concept with metadata
 */
interface ExtractedConcept {
  term: string;
  type: 'noun' | 'verb' | 'technical' | 'action' | 'entity';
  importance: number; // 0.0 - 1.0
  position: number; // Original position in text
}

/**
 * Configuration for similarity checker
 */
export interface SimilarityConfig {
  /** Minimum score to be considered relevant (default: 0.6) */
  relevanceThreshold: number;
  /** Weight for concept matching (default: 0.35) */
  conceptWeight: number;
  /** Weight for TF-IDF scoring (default: 0.25) */
  tfidfWeight: number;
  /** Weight for phrase matching (default: 0.25) */
  phraseWeight: number;
  /** Weight for word order (default: 0.15) */
  orderWeight: number;
  /** Enable verbose logging */
  verbose: boolean;
}

// =============================================================================
// LINGUISTIC PATTERNS AND STOP WORDS
// =============================================================================

/**
 * Stop words to filter out (Polish and English)
 */
const STOP_WORDS = new Set([
  // English
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
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
  'can',
  'of',
  'at',
  'by',
  'for',
  'with',
  'about',
  'against',
  'between',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'to',
  'from',
  'up',
  'down',
  'in',
  'out',
  'on',
  'off',
  'over',
  'under',
  'again',
  'further',
  'then',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'few',
  'more',
  'most',
  'other',
  'some',
  'such',
  'no',
  'nor',
  'not',
  'only',
  'own',
  'same',
  'so',
  'than',
  'too',
  'very',
  'just',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'i',
  'me',
  'my',
  'myself',
  'we',
  'our',
  'ours',
  'ourselves',
  'you',
  'your',
  'yours',
  'yourself',
  'he',
  'him',
  'his',
  'himself',
  'she',
  'her',
  'hers',
  'herself',
  'they',
  'them',
  'their',
  'theirs',
  'themselves',
  'what',
  'which',
  'who',
  'whom',
  'if',
  'as',
  // Polish
  'i',
  'w',
  'z',
  'na',
  'do',
  'od',
  'po',
  'o',
  'za',
  'nie',
  'to',
  'jest',
  'ale',
  'jak',
  'co',
  'sie',
  'ten',
  'ta',
  'te',
  'tym',
  'tej',
  'tego',
  'dla',
  'ze',
  'przy',
  'by',
  'czy',
  'lub',
  'oraz',
  'bez',
  'pod',
  'nad',
  'przed',
  'miedzy',
  'przez',
  'podczas',
  'po',
  'az',
  'tylko',
  'tez',
  'juz',
  'jeszcze',
  'bardzo',
  'tak',
  'wiec',
  'jednak',
  'ze',
  'kiedy',
  'gdzie',
  'bo',
  'gdyz',
  'poniewaz',
]);

/**
 * Technical term patterns (programming, DevOps, etc.)
 */
const TECHNICAL_PATTERNS = [
  // Programming languages
  /\b(?:typescript|javascript|python|rust|go|java|c\+\+|csharp|ruby|php|swift|kotlin)\b/gi,
  // Frameworks/Libraries
  /\b(?:react|vue|angular|node|express|django|flask|spring|rails|laravel|tauri)\b/gi,
  // Tools
  /\b(?:git|docker|kubernetes|npm|yarn|pnpm|cargo|pip|maven|gradle|webpack|vite)\b/gi,
  // Concepts
  /\b(?:api|rest|graphql|websocket|http|tcp|udp|dns|ssl|tls|oauth|jwt)\b/gi,
  // Data
  /\b(?:json|xml|yaml|csv|sql|nosql|mongodb|postgres|redis|elasticsearch)\b/gi,
  // Actions
  /\b(?:implement|refactor|optimize|debug|test|deploy|build|compile|install|configure)\b/gi,
  // File types
  /\b(?:\.ts|\.tsx|\.js|\.jsx|\.py|\.rs|\.go|\.java|\.md|\.json|\.yaml|\.yml)\b/gi,
  // Code patterns
  /\b(?:function|class|interface|type|const|let|var|async|await|import|export)\b/gi,
  // Architecture
  /\b(?:component|module|service|controller|model|view|repository|factory|singleton)\b/gi,
];

/**
 * Action verb patterns
 */
const ACTION_PATTERNS = [
  /\b(?:create|add|remove|delete|update|modify|change|fix|repair|solve)\b/gi,
  /\b(?:read|write|save|load|fetch|send|receive|process|handle|execute)\b/gi,
  /\b(?:analyze|check|verify|validate|test|review|examine|inspect|audit)\b/gi,
  /\b(?:install|configure|setup|deploy|build|compile|run|start|stop|restart)\b/gi,
  /\b(?:stworz|dodaj|usun|zaktualizuj|zmodyfikuj|napraw|rozwiaz|przeczytaj)\b/gi,
  /\b(?:zapisz|wczytaj|pobierz|wyslij|przetworz|wykonaj|sprawdz|zweryfikuj)\b/gi,
];

/**
 * Entity patterns (file paths, URLs, identifiers)
 */
const ENTITY_PATTERNS = [
  // File paths
  /(?:[\w-]+\/)+[\w-]+\.[\w]+/g,
  // URLs
  /https?:\/\/[^\s]+/g,
  // CamelCase/PascalCase identifiers
  /\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g,
  // snake_case identifiers
  /\b[a-z]+(?:_[a-z]+)+\b/g,
  // Package names
  /\b@[\w-]+\/[\w-]+\b/g,
];

// =============================================================================
// SEMANTIC SIMILARITY CHECKER CLASS
// =============================================================================

/**
 * SemanticSimilarityChecker - Main class for checking semantic similarity
 * between task requests and agent responses
 */
export class SemanticSimilarityChecker {
  private config: SimilarityConfig;

  constructor(config: Partial<SimilarityConfig> = {}) {
    this.config = {
      relevanceThreshold: config.relevanceThreshold ?? 0.6,
      conceptWeight: config.conceptWeight ?? 0.35,
      tfidfWeight: config.tfidfWeight ?? 0.25,
      phraseWeight: config.phraseWeight ?? 0.25,
      orderWeight: config.orderWeight ?? 0.15,
      verbose: config.verbose ?? false,
    };
  }

  /**
   * Check semantic similarity between task and response
   */
  checkSimilarity(task: string, response: string): SimilarityResult {
    // Extract concepts from both texts
    const taskConcepts = this.extractConcepts(task);
    const responseConcepts = this.extractConcepts(response);

    // Calculate different similarity scores
    const conceptMatchResult = this.calculateConceptMatch(taskConcepts, responseConcepts);
    const tfidfScore = this.calculateTFIDFSimilarity(task, response);
    const phraseMatchScore = this.calculatePhraseMatch(task, response);
    const orderScore = this.calculateOrderSimilarity(taskConcepts, responseConcepts);
    const irrelevancePenalty = this.calculateIrrelevancePenalty(taskConcepts, responseConcepts);

    // Calculate weighted final score
    const weightedScore =
      conceptMatchResult.score * this.config.conceptWeight +
      tfidfScore * this.config.tfidfWeight +
      phraseMatchScore * this.config.phraseWeight +
      orderScore * this.config.orderWeight -
      irrelevancePenalty * 0.1;

    // Clamp score to [0, 1]
    const finalScore = Math.max(0, Math.min(1, weightedScore));

    const result: SimilarityResult = {
      score: Math.round(finalScore * 100) / 100,
      matchedConcepts: conceptMatchResult.matched,
      missingConcepts: conceptMatchResult.missing,
      isRelevant: finalScore >= this.config.relevanceThreshold,
      scoreBreakdown: {
        conceptMatchScore: Math.round(conceptMatchResult.score * 100) / 100,
        tfidfScore: Math.round(tfidfScore * 100) / 100,
        phraseMatchScore: Math.round(phraseMatchScore * 100) / 100,
        orderScore: Math.round(orderScore * 100) / 100,
        irrelevancePenalty: Math.round(irrelevancePenalty * 100) / 100,
      },
    };

    if (this.config.verbose) {
      this.logResult(task, response, result);
    }

    return result;
  }

  /**
   * Extract key concepts from text
   */
  private extractConcepts(text: string): ExtractedConcept[] {
    const concepts: ExtractedConcept[] = [];
    const seen = new Set<string>();
    const position = 0;

    // 1. Extract technical terms
    for (const pattern of TECHNICAL_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
        const term = match[0].toLowerCase();
        if (!seen.has(term)) {
          seen.add(term);
          concepts.push({
            term,
            type: 'technical',
            importance: 0.9,
            position: match.index,
          });
        }
      }
    }

    // 2. Extract action verbs
    for (const pattern of ACTION_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
        const term = match[0].toLowerCase();
        if (!seen.has(term)) {
          seen.add(term);
          concepts.push({
            term,
            type: 'action',
            importance: 0.85,
            position: match.index,
          });
        }
      }
    }

    // 3. Extract entities (paths, URLs, identifiers)
    for (const pattern of ENTITY_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
        const term = match[0].toLowerCase();
        if (!seen.has(term) && term.length > 2) {
          seen.add(term);
          concepts.push({
            term,
            type: 'entity',
            importance: 0.8,
            position: match.index,
          });
        }
      }
    }

    // 4. Extract remaining nouns and verbs (simple heuristic)
    const words = text.toLowerCase().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i].replace(/[^a-z0-9\u0080-\u024F]/gi, '');

      if (word.length < 3 || STOP_WORDS.has(word) || seen.has(word)) {
        continue;
      }

      // Simple POS heuristics:
      // - Nouns often follow articles or adjectives
      // - Verbs often start sentences or follow pronouns
      const prevWord = i > 0 ? words[i - 1] : '';
      const isLikelyNoun = ['the', 'a', 'an', 'this', 'that', 'my', 'your', 'our'].includes(
        prevWord,
      );
      const isLikelyVerb = ['i', 'we', 'you', 'they', 'he', 'she', 'it', 'to'].includes(prevWord);

      if (isLikelyNoun) {
        seen.add(word);
        concepts.push({
          term: word,
          type: 'noun',
          importance: 0.6,
          position: position + i,
        });
      } else if (isLikelyVerb) {
        seen.add(word);
        concepts.push({
          term: word,
          type: 'verb',
          importance: 0.65,
          position: position + i,
        });
      } else if (word.length >= 4) {
        // Unknown but significant word
        seen.add(word);
        concepts.push({
          term: word,
          type: 'noun', // Default to noun
          importance: 0.4,
          position: position + i,
        });
      }
    }

    // Sort by importance (descending)
    return concepts.sort((a, b) => b.importance - a.importance);
  }

  /**
   * Calculate concept match score
   */
  private calculateConceptMatch(
    taskConcepts: ExtractedConcept[],
    responseConcepts: ExtractedConcept[],
  ): { score: number; matched: string[]; missing: string[] } {
    if (taskConcepts.length === 0) {
      return { score: 1.0, matched: [], missing: [] };
    }

    const responseTerms = new Set(responseConcepts.map((c) => c.term));
    const matched: string[] = [];
    const missing: string[] = [];
    let totalWeight = 0;
    let matchedWeight = 0;

    for (const concept of taskConcepts) {
      totalWeight += concept.importance;

      // Check for exact match or partial match
      if (responseTerms.has(concept.term)) {
        matched.push(concept.term);
        matchedWeight += concept.importance;
      } else {
        // Check for partial/fuzzy match
        let foundPartial = false;
        for (const responseTerm of responseTerms) {
          if (this.isFuzzyMatch(concept.term, responseTerm)) {
            matched.push(concept.term);
            matchedWeight += concept.importance * 0.8; // Partial match gets 80%
            foundPartial = true;
            break;
          }
        }
        if (!foundPartial) {
          missing.push(concept.term);
        }
      }
    }

    const score = totalWeight > 0 ? matchedWeight / totalWeight : 0;
    return { score, matched, missing };
  }

  /**
   * Check if two terms are a fuzzy match
   */
  private isFuzzyMatch(term1: string, term2: string): boolean {
    // Exact containment
    if (term1.includes(term2) || term2.includes(term1)) {
      return true;
    }

    // Levenshtein distance for short terms
    if (term1.length <= 8 && term2.length <= 8) {
      const distance = this.levenshteinDistance(term1, term2);
      const maxLen = Math.max(term1.length, term2.length);
      return distance <= Math.floor(maxLen * 0.3);
    }

    // Stem matching for longer terms
    const stem1 = this.getStem(term1);
    const stem2 = this.getStem(term2);
    return stem1 === stem2;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Get simple word stem (Porter-like stemming)
   */
  private getStem(word: string): string {
    // Remove common suffixes
    const suffixes = ['ing', 'ed', 'er', 'est', 'ly', 'tion', 'ness', 'ment', 'able', 'ible'];
    let stem = word.toLowerCase();

    for (const suffix of suffixes) {
      if (stem.endsWith(suffix) && stem.length > suffix.length + 2) {
        stem = stem.slice(0, -suffix.length);
        break;
      }
    }

    return stem;
  }

  /**
   * Calculate TF-IDF-like similarity
   */
  private calculateTFIDFSimilarity(task: string, response: string): number {
    const taskTerms = this.tokenize(task);
    const responseTerms = this.tokenize(response);

    if (taskTerms.length === 0 || responseTerms.length === 0) {
      return 0;
    }

    // Calculate term frequencies
    const taskTF = this.calculateTF(taskTerms);
    const responseTF = this.calculateTF(responseTerms);

    // Calculate IDF (using task terms as document)
    const allTerms = new Set([...taskTerms, ...responseTerms]);
    const idf = this.calculateIDF(allTerms, [taskTerms, responseTerms]);

    // Calculate TF-IDF vectors
    const taskVector = this.calculateTFIDF(taskTF, idf);
    const responseVector = this.calculateTFIDF(responseTF, idf);

    // Calculate cosine similarity
    return this.cosineSimilarity(taskVector, responseVector);
  }

  /**
   * Tokenize text into terms
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/\s+/)
      .map((word) => word.replace(/[^a-z0-9\u0080-\u024F]/gi, ''))
      .filter((word) => word.length >= 2 && !STOP_WORDS.has(word));
  }

  /**
   * Calculate term frequency
   */
  private calculateTF(terms: string[]): Map<string, number> {
    const tf = new Map<string, number>();
    for (const term of terms) {
      tf.set(term, (tf.get(term) || 0) + 1);
    }
    // Normalize by document length
    for (const [term, count] of tf.entries()) {
      tf.set(term, count / terms.length);
    }
    return tf;
  }

  /**
   * Calculate inverse document frequency
   */
  private calculateIDF(terms: Set<string>, documents: string[][]): Map<string, number> {
    const idf = new Map<string, number>();
    const numDocs = documents.length;

    for (const term of terms) {
      let docCount = 0;
      for (const doc of documents) {
        if (doc.includes(term)) {
          docCount++;
        }
      }
      // Standard IDF formula: log(N / (df + 1)) + 1
      idf.set(term, Math.log(numDocs / (docCount + 1)) + 1);
    }

    return idf;
  }

  /**
   * Calculate TF-IDF scores
   */
  private calculateTFIDF(tf: Map<string, number>, idf: Map<string, number>): Map<string, number> {
    const tfidf = new Map<string, number>();
    for (const [term, tfScore] of tf.entries()) {
      const idfScore = idf.get(term) || 1;
      tfidf.set(term, tfScore * idfScore);
    }
    return tfidf;
  }

  /**
   * Calculate cosine similarity between two TF-IDF vectors
   */
  private cosineSimilarity(vec1: Map<string, number>, vec2: Map<string, number>): number {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    const allTerms = new Set([...vec1.keys(), ...vec2.keys()]);

    for (const term of allTerms) {
      const v1 = vec1.get(term) || 0;
      const v2 = vec2.get(term) || 0;
      dotProduct += v1 * v2;
      norm1 += v1 * v1;
      norm2 += v2 * v2;
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator > 0 ? dotProduct / denominator : 0;
  }

  /**
   * Calculate phrase/n-gram match score
   */
  private calculatePhraseMatch(task: string, response: string): number {
    // Generate n-grams (bigrams and trigrams)
    const taskBigrams = this.getNGrams(task.toLowerCase(), 2);
    const taskTrigrams = this.getNGrams(task.toLowerCase(), 3);
    const responseLower = response.toLowerCase();

    let matchedBigrams = 0;
    let matchedTrigrams = 0;

    for (const bigram of taskBigrams) {
      if (responseLower.includes(bigram)) {
        matchedBigrams++;
      }
    }

    for (const trigram of taskTrigrams) {
      if (responseLower.includes(trigram)) {
        matchedTrigrams++;
      }
    }

    const bigramScore = taskBigrams.length > 0 ? matchedBigrams / taskBigrams.length : 0;
    const trigramScore = taskTrigrams.length > 0 ? matchedTrigrams / taskTrigrams.length : 0;

    // Weight trigrams higher (more specific)
    return bigramScore * 0.4 + trigramScore * 0.6;
  }

  /**
   * Generate n-grams from text
   */
  private getNGrams(text: string, n: number): string[] {
    const words = text.split(/\s+/).filter((w) => w.length >= 2);
    const ngrams: string[] = [];

    for (let i = 0; i <= words.length - n; i++) {
      const ngram = words.slice(i, i + n).join(' ');
      if (ngram.length >= n * 2) {
        // Minimum meaningful length
        ngrams.push(ngram);
      }
    }

    return ngrams;
  }

  /**
   * Calculate word order similarity
   */
  private calculateOrderSimilarity(
    taskConcepts: ExtractedConcept[],
    responseConcepts: ExtractedConcept[],
  ): number {
    if (taskConcepts.length < 2 || responseConcepts.length < 2) {
      return 0.5; // Neutral score for short texts
    }

    // Get ordered terms from task that appear in response
    const responseTermSet = new Set(responseConcepts.map((c) => c.term));
    const commonTaskTerms = taskConcepts
      .filter((c) => responseTermSet.has(c.term))
      .map((c) => c.term);

    if (commonTaskTerms.length < 2) {
      return 0.3; // Low score if few common terms
    }

    // Check if order is preserved in response
    const responseTermList = responseConcepts.map((c) => c.term);
    let preservedPairs = 0;
    let totalPairs = 0;

    for (let i = 0; i < commonTaskTerms.length - 1; i++) {
      for (let j = i + 1; j < commonTaskTerms.length; j++) {
        const term1 = commonTaskTerms[i];
        const term2 = commonTaskTerms[j];

        const pos1 = responseTermList.indexOf(term1);
        const pos2 = responseTermList.indexOf(term2);

        if (pos1 !== -1 && pos2 !== -1) {
          totalPairs++;
          if (pos1 < pos2) {
            preservedPairs++;
          }
        }
      }
    }

    return totalPairs > 0 ? preservedPairs / totalPairs : 0.5;
  }

  /**
   * Calculate penalty for irrelevant content
   */
  private calculateIrrelevancePenalty(
    taskConcepts: ExtractedConcept[],
    responseConcepts: ExtractedConcept[],
  ): number {
    if (responseConcepts.length === 0) {
      return 0;
    }

    const taskTerms = new Set(taskConcepts.map((c) => c.term));
    let irrelevantCount = 0;
    let _totalImportance = 0;

    for (const concept of responseConcepts) {
      _totalImportance += concept.importance;
      if (!taskTerms.has(concept.term) && concept.importance > 0.5) {
        // Check if it's a fuzzy match
        let isFuzzy = false;
        for (const taskTerm of taskTerms) {
          if (this.isFuzzyMatch(concept.term, taskTerm)) {
            isFuzzy = true;
            break;
          }
        }
        if (!isFuzzy) {
          irrelevantCount++;
        }
      }
    }

    // Penalty based on proportion of irrelevant high-importance terms
    const highImportanceCount = responseConcepts.filter((c) => c.importance > 0.5).length;
    return highImportanceCount > 0 ? irrelevantCount / highImportanceCount : 0;
  }

  /**
   * Log similarity result
   */
  private logResult(task: string, response: string, result: SimilarityResult): void {
    console.log(chalk.cyan('\n[SemanticSimilarity] Analysis Results:'));
    console.log(chalk.gray(`  Task (${task.length} chars): "${task.substring(0, 50)}..."`));
    console.log(
      chalk.gray(`  Response (${response.length} chars): "${response.substring(0, 50)}..."`),
    );
    console.log(chalk.white(`  Score: ${(result.score * 100).toFixed(1)}%`));
    console.log(
      result.isRelevant ? chalk.green(`  Relevant: YES`) : chalk.yellow(`  Relevant: NO`),
    );

    if (result.scoreBreakdown) {
      console.log(chalk.gray('  Breakdown:'));
      console.log(
        chalk.gray(
          `    - Concept Match: ${(result.scoreBreakdown.conceptMatchScore * 100).toFixed(1)}%`,
        ),
      );
      console.log(
        chalk.gray(`    - TF-IDF: ${(result.scoreBreakdown.tfidfScore * 100).toFixed(1)}%`),
      );
      console.log(
        chalk.gray(
          `    - Phrase Match: ${(result.scoreBreakdown.phraseMatchScore * 100).toFixed(1)}%`,
        ),
      );
      console.log(
        chalk.gray(`    - Order: ${(result.scoreBreakdown.orderScore * 100).toFixed(1)}%`),
      );
      console.log(
        chalk.gray(
          `    - Irrelevance Penalty: ${(result.scoreBreakdown.irrelevancePenalty * 100).toFixed(1)}%`,
        ),
      );
    }

    if (result.matchedConcepts.length > 0) {
      console.log(
        chalk.green(
          `  Matched (${result.matchedConcepts.length}): ${result.matchedConcepts.slice(0, 10).join(', ')}`,
        ),
      );
    }
    if (result.missingConcepts.length > 0) {
      console.log(
        chalk.yellow(
          `  Missing (${result.missingConcepts.length}): ${result.missingConcepts.slice(0, 10).join(', ')}`,
        ),
      );
    }
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<SimilarityConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SimilarityConfig {
    return { ...this.config };
  }
}

// =============================================================================
// SINGLETON INSTANCE AND CONVENIENCE FUNCTIONS
// =============================================================================

/** Global SemanticSimilarityChecker instance */
export const semanticSimilarityChecker = new SemanticSimilarityChecker();

/**
 * Quick similarity check (convenience function)
 */
export function checkSimilarity(task: string, response: string): SimilarityResult {
  return semanticSimilarityChecker.checkSimilarity(task, response);
}

/**
 * Check if response is relevant to task
 */
export function isResponseRelevant(task: string, response: string, threshold?: number): boolean {
  const result = semanticSimilarityChecker.checkSimilarity(task, response);
  return threshold !== undefined ? result.score >= threshold : result.isRelevant;
}

/**
 * Get missing concepts from response
 */
export function getMissingConcepts(task: string, response: string): string[] {
  const result = semanticSimilarityChecker.checkSimilarity(task, response);
  return result.missingConcepts;
}

/**
 * Validate agent response for relevance
 * Returns detailed validation result
 */
export function validateAgentResponse(
  task: string,
  response: string,
  agentName?: string,
): {
  isValid: boolean;
  score: number;
  feedback: string;
  missingConcepts: string[];
} {
  const result = semanticSimilarityChecker.checkSimilarity(task, response);

  let feedback: string;
  if (result.score >= 0.8) {
    feedback = 'Excellent match - response directly addresses the task';
  } else if (result.score >= 0.6) {
    feedback = 'Good match - response is relevant but may be incomplete';
  } else if (result.score >= 0.4) {
    feedback = 'Partial match - response partially addresses the task';
  } else if (result.score >= 0.2) {
    feedback = 'Weak match - response has limited relevance to task';
  } else {
    feedback = 'Poor match - response may not address the task';
  }

  if (result.missingConcepts.length > 0) {
    feedback += `. Missing concepts: ${result.missingConcepts.slice(0, 5).join(', ')}`;
  }

  if (agentName) {
    console.log(
      chalk.gray(
        `[SemanticSimilarity] ${agentName}: ${result.isRelevant ? 'PASS' : 'WARN'} (${(result.score * 100).toFixed(0)}%)`,
      ),
    );
  }

  return {
    isValid: result.isRelevant,
    score: result.score,
    feedback,
    missingConcepts: result.missingConcepts,
  };
}

/**
 * Create a new SemanticSimilarityChecker with custom config
 */
export function createSimilarityChecker(
  config?: Partial<SimilarityConfig>,
): SemanticSimilarityChecker {
  return new SemanticSimilarityChecker(config);
}

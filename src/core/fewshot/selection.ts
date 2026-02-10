/**
 * FewShot Selection - Dynamic example selection, scoring, and category detection
 *
 * @module fewshot/selection
 */

import type { ExampleUsageStats } from './types.js';
import { EXTENDED_FEW_SHOT_EXAMPLES } from './extended-examples.js';
import { AGENT_SPECIFIC_EXAMPLES } from './agent-examples.js';

// ============================================================================
// KEYWORD WEIGHTS
// ============================================================================

const KEYWORD_WEIGHTS: Record<string, number> = {
  // High-priority keywords (exact match critical)
  'security': 2.0,
  'bezpieczeństwo': 2.0,
  'test': 1.8,
  'debug': 1.8,
  'błąd': 1.8,
  'error': 1.8,
  'api': 1.5,
  'performance': 1.5,
  'wydajność': 1.5,

  // Standard keywords
  'refactor': 1.2,
  'dokumentacja': 1.2,
  'architektura': 1.2,
  'plan': 1.2
};

// ============================================================================
// SEMANTIC SIMILARITY
// ============================================================================

/**
 * Calculate semantic similarity between task and example keywords
 */
function calculateSemanticSimilarity(task: string, keywords: string[]): number {
  const taskLower = task.toLowerCase();
  const taskWords = new Set(taskLower.split(/\s+/));

  let score = 0;
  let maxPossibleScore = 0;

  for (const keyword of keywords) {
    const weight = KEYWORD_WEIGHTS[keyword] || 1.0;
    maxPossibleScore += weight;

    // Exact match in task
    if (taskLower.includes(keyword.toLowerCase())) {
      score += weight;
    }
    // Partial match (keyword word in task words)
    else if ([...taskWords].some(word =>
      word.includes(keyword.toLowerCase()) ||
      keyword.toLowerCase().includes(word)
    )) {
      score += weight * 0.5;
    }
  }

  return maxPossibleScore > 0 ? score / maxPossibleScore : 0;
}

// ============================================================================
// EXAMPLE SELECTION
// ============================================================================

/**
 * Select best matching examples for a given task
 * Uses semantic similarity to find most relevant examples
 */
export function selectBestExamples(
  task: string,
  category: string,
  count: number = 2
): Array<{ input: string; output: string }> {
  const examples = EXTENDED_FEW_SHOT_EXAMPLES[category];

  if (!examples || examples.length === 0) {
    return [];
  }

  const scoredExamples = examples.map(example => ({
    example,
    score: calculateSemanticSimilarity(task, example.keywords) * example.effectiveness
  }));

  scoredExamples.sort((a, b) => b.score - a.score);

  return scoredExamples
    .slice(0, count)
    .map(({ example }) => ({
      input: example.input,
      output: example.output
    }));
}

/**
 * Get agent-specific examples
 */
export function getAgentSpecificExamples(
  agentName: string,
  task?: string
): Array<{ input: string; output: string }> {
  const agentExamples = AGENT_SPECIFIC_EXAMPLES[agentName];

  if (!agentExamples || agentExamples.length === 0) {
    return [];
  }

  if (task) {
    const scoredExamples = agentExamples.map(example => ({
      example,
      score: calculateSemanticSimilarity(task, example.keywords)
    }));

    scoredExamples.sort((a, b) => b.score - a.score);

    return scoredExamples.map(({ example }) => ({
      input: example.input,
      output: example.output
    }));
  }

  return agentExamples.map(({ input, output }) => ({ input, output }));
}

// ============================================================================
// EXAMPLE QUALITY SCORING
// ============================================================================

const exampleUsageStats: Map<string, ExampleUsageStats> = new Map();

/**
 * Record example usage
 */
export function recordExampleUsage(
  category: string,
  exampleIndex: number,
  wasSuccessful: boolean
): void {
  const key = `${category}:${exampleIndex}`;
  const existing = exampleUsageStats.get(key);

  if (existing) {
    existing.usageCount++;
    if (wasSuccessful) existing.successCount++;
    existing.lastUsed = new Date();
  } else {
    exampleUsageStats.set(key, {
      category,
      exampleIndex,
      usageCount: 1,
      successCount: wasSuccessful ? 1 : 0,
      lastUsed: new Date()
    });
  }
}

/**
 * Calculate effectiveness score for an example
 */
export function scoreExampleEffectiveness(
  category: string,
  exampleIndex: number
): number {
  const examples = EXTENDED_FEW_SHOT_EXAMPLES[category];
  if (!examples || !examples[exampleIndex]) {
    return 0;
  }

  const baseEffectiveness = examples[exampleIndex].effectiveness;
  const key = `${category}:${exampleIndex}`;
  const stats = exampleUsageStats.get(key);

  if (!stats || stats.usageCount < 3) {
    return baseEffectiveness;
  }

  const actualSuccessRate = stats.successCount / stats.usageCount;
  const usageWeight = Math.min(stats.usageCount / 10, 0.8);

  return (baseEffectiveness * (1 - usageWeight)) + (actualSuccessRate * usageWeight);
}

/**
 * Get examples sorted by effectiveness for a category
 */
export function getTopEffectiveExamples(
  category: string,
  count: number = 3
): Array<{ input: string; output: string; score: number }> {
  const examples = EXTENDED_FEW_SHOT_EXAMPLES[category];
  if (!examples) return [];

  const scoredExamples = examples.map((example, index) => ({
    input: example.input,
    output: example.output,
    score: scoreExampleEffectiveness(category, index)
  }));

  scoredExamples.sort((a, b) => b.score - a.score);

  return scoredExamples.slice(0, count);
}

// ============================================================================
// CATEGORY DETECTION
// ============================================================================

/**
 * Detect the best example category for a given task
 */
export function detectExampleCategory(task: string): string | null {
  const taskLower = task.toLowerCase();

  const categoryPatterns: Record<string, RegExp[]> = {
    debugging: [
      /debug/i, /błąd/i, /error/i, /exception/i, /crash/i,
      /nie działa/i, /problem/i, /undefined/i, /null/i
    ],
    testing: [
      /test/i, /testy/i, /jednostkow/i, /integracyjn/i,
      /jest/i, /mocha/i, /assert/i, /expect/i
    ],
    refactoring: [
      /refaktor/i, /refactor/i, /przepisz/i, /ulepsz/i,
      /clean/i, /popraw/i, /duplikac/i, /dry/i
    ],
    api_design: [
      /api/i, /endpoint/i, /rest/i, /graphql/i,
      /zaprojektuj.*api/i, /design.*api/i
    ],
    security: [
      /security/i, /bezpiecze/i, /xss/i, /sql injection/i,
      /podatn/i, /vulnerab/i, /auth/i
    ],
    performance: [
      /wydajn/i, /performance/i, /optymali/i, /wolne/i,
      /slow/i, /szybk/i, /cache/i
    ],
    documentation: [
      /dokumentac/i, /doc/i, /jsdoc/i, /readme/i,
      /opisz/i, /wyjaśnij/i, /explain/i
    ]
  };

  const scores: Record<string, number> = {};

  for (const [category, patterns] of Object.entries(categoryPatterns)) {
    scores[category] = patterns.reduce((score, pattern) => {
      return score + (pattern.test(taskLower) ? 1 : 0);
    }, 0);
  }

  const maxScore = Math.max(...Object.values(scores));

  if (maxScore === 0) {
    return null;
  }

  return Object.entries(scores).find(([, score]) => score === maxScore)?.[0] || null;
}

// ============================================================================
// COMBINED API
// ============================================================================

/**
 * Get the best few-shot examples for a task, combining all strategies
 */
export function getBestFewShotExamples(
  task: string,
  agentName?: string,
  maxExamples: number = 2
): string {
  const examples: Array<{ input: string; output: string }> = [];

  // 1. Try to get agent-specific examples first
  if (agentName && AGENT_SPECIFIC_EXAMPLES[agentName]) {
    const agentExamples = getAgentSpecificExamples(agentName, task);
    if (agentExamples.length > 0) {
      examples.push(agentExamples[0]);
    }
  }

  // 2. Detect category and get category-specific examples
  const category = detectExampleCategory(task);
  if (category && examples.length < maxExamples) {
    const categoryExamples = selectBestExamples(task, category, maxExamples - examples.length);
    examples.push(...categoryExamples);
  }

  // 3. If still not enough, try effectiveness-based selection
  if (examples.length < maxExamples && category) {
    const effectiveExamples = getTopEffectiveExamples(category, maxExamples - examples.length);
    for (const ex of effectiveExamples) {
      if (!examples.some(e => e.input === ex.input)) {
        examples.push({ input: ex.input, output: ex.output });
      }
    }
  }

  if (examples.length === 0) {
    return '';
  }

  const formatted = examples.map((ex, idx) =>
    `--- PRZYKŁAD ${idx + 1} ---
ZADANIE: ${ex.input}

OCZEKIWANA ODPOWIEDŹ:
${ex.output}
--- KONIEC PRZYKŁADU ${idx + 1} ---`
  ).join('\n\n');

  return `\nPRZYKŁADY POPRAWNYCH ODPOWIEDZI (ucz się z nich!):\n${formatted}\n`;
}

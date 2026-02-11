/**
 * IntentDetection.ts - Feature #23: Intent Detection
 *
 * Understands user's true intent from their input.
 * Provides pattern-based intent classification and entity extraction.
 *
 * Part of ConversationLayer refactoring - extracted from lines 286-391
 */

import chalk from 'chalk';

// ============================================================
// Types & Interfaces
// ============================================================

export type IntentCategory =
  | 'code_generation'
  | 'code_modification'
  | 'code_review'
  | 'debugging'
  | 'explanation'
  | 'documentation'
  | 'testing'
  | 'refactoring'
  | 'deployment'
  | 'research'
  | 'question'
  | 'conversation'
  | 'file_operation'
  | 'git_operation'
  | 'unknown';

export interface DetectedIntent {
  primary: IntentCategory;
  secondary: IntentCategory[];
  confidence: number;
  entities: Record<string, string>;
  suggestedAgents: string[];
  reasoning: string;
}

// ============================================================
// Intent Patterns
// ============================================================

const INTENT_PATTERNS: Record<IntentCategory, RegExp[]> = {
  code_generation: [
    /napisz|stwórz|wygeneruj|zaimplementuj|dodaj/i,
    /create|write|generate|implement|add/i,
  ],
  code_modification: [
    /zmień|zmodyfikuj|popraw|ulepsz|napraw/i,
    /change|modify|fix|improve|update/i,
  ],
  code_review: [/sprawdź|przejrzyj|review|oceń/i, /review|check|audit|evaluate/i],
  debugging: [/debug|błąd|error|nie działa|crash/i, /debug|error|bug|crash|broken/i],
  explanation: [/wyjaśnij|wytłumacz|jak działa|co to/i, /explain|how does|what is|describe/i],
  documentation: [/dokumentacja|readme|komentarz|opisz/i, /docs|documentation|readme|comment/i],
  testing: [/test|testy|przetestuj|jednostkowy/i, /test|testing|unit test|integration/i],
  refactoring: [/refaktor|przebuduj|oczyść|uporządkuj/i, /refactor|restructure|clean|organize/i],
  deployment: [/deploy|wdróż|produkcja|release/i, /deploy|release|production|publish/i],
  research: [/znajdź|szukaj|sprawdź|zbadaj/i, /find|search|research|investigate/i],
  question: [/czy|jak|dlaczego|kiedy|co/i, /is|how|why|when|what/i],
  conversation: [/hej|cześć|dzięki|ok|super/i, /hi|hello|thanks|ok|great/i],
  file_operation: [/plik|folder|katalog|skopiuj|przenieś/i, /file|folder|directory|copy|move/i],
  git_operation: [/commit|push|pull|branch|merge/i, /commit|push|pull|branch|merge/i],
  unknown: [],
};

// ============================================================
// Intent to Agent Mapping
// ============================================================

const INTENT_AGENT_MAP: Record<IntentCategory, string[]> = {
  code_generation: ['triss', 'yennefer', 'geralt'],
  code_modification: ['triss', 'lambert', 'geralt'],
  code_review: ['lambert', 'regis', 'philippa'],
  debugging: ['lambert', 'triss', 'eskel'],
  explanation: ['regis', 'dijkstra', 'vesemir'],
  documentation: ['regis', 'vesemir', 'ciri'],
  testing: ['lambert', 'eskel', 'triss'],
  refactoring: ['yennefer', 'triss', 'vesemir'],
  deployment: ['eskel', 'geralt', 'dijkstra'],
  research: ['regis', 'dijkstra', 'ciri'],
  question: ['regis', 'vesemir', 'dijkstra'],
  conversation: ['regis', 'ciri', 'vesemir'],
  file_operation: ['eskel', 'geralt', 'ciri'],
  git_operation: ['eskel', 'geralt', 'triss'],
  unknown: ['dijkstra', 'regis', 'geralt'],
};

// ============================================================
// Intent Detection Functions
// ============================================================

/**
 * Detect the primary intent from user input
 */
export async function detectIntent(input: string): Promise<DetectedIntent> {
  const scores = {} as Record<IntentCategory, number>;

  // Pattern matching
  for (const [category, patterns] of Object.entries(INTENT_PATTERNS)) {
    scores[category as IntentCategory] = 0;
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        scores[category as IntentCategory] += 1;
      }
    }
  }

  // Find top intents
  const sorted = Object.entries(scores)
    .filter(([_, score]) => score > 0)
    .sort(([_, a], [__, b]) => b - a);

  const primary = (sorted[0]?.[0] || 'unknown') as IntentCategory;
  const secondary = sorted.slice(1, 3).map(([cat]) => cat as IntentCategory);

  // Extract entities (basic)
  const entities: Record<string, string> = {};

  // File paths
  const pathMatch = input.match(/[A-Za-z]:\\[^\s]+|\/[^\s]+\.[a-z]+/gi);
  if (pathMatch) entities.paths = pathMatch.join(', ');

  // Function/class names
  const identifierMatch = input.match(
    /(?:funkcja|function|class|klasa)\s+([A-Za-z_][A-Za-z0-9_]*)/gi,
  );
  if (identifierMatch) entities.identifiers = identifierMatch.join(', ');

  // Numbers
  const numberMatch = input.match(/\d+/g);
  if (numberMatch) entities.numbers = numberMatch.join(', ');

  const confidence = sorted[0] ? Math.min(sorted[0][1] / 2, 1) : 0.3;

  console.log(
    chalk.gray(`[IntentDetection] Primary: ${primary} (${(confidence * 100).toFixed(0)}%)`),
  );

  return {
    primary,
    secondary,
    confidence,
    entities,
    suggestedAgents: INTENT_AGENT_MAP[primary] || INTENT_AGENT_MAP.unknown,
    reasoning: `Detected ${primary} intent based on keyword patterns`,
  };
}

/**
 * Get suggested agents for a given intent category
 */
export function getSuggestedAgents(intent: IntentCategory): string[] {
  return INTENT_AGENT_MAP[intent] || INTENT_AGENT_MAP.unknown;
}

/**
 * Get all available intent categories
 */
export function getIntentCategories(): IntentCategory[] {
  return Object.keys(INTENT_PATTERNS) as IntentCategory[];
}

/**
 * Check if input matches a specific intent
 */
export function matchesIntent(input: string, intent: IntentCategory): boolean {
  const patterns = INTENT_PATTERNS[intent];
  return patterns.some((pattern) => pattern.test(input));
}

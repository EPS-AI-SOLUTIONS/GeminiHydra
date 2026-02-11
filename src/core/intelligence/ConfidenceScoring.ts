/**
 * ConfidenceScoring - Feature #3 (Enhanced)
 * Advanced confidence scoring with robust JSON parsing,
 * expanded metrics, calibration, and uncertainty quantification
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import { GEMINI_MODELS } from '../../config/models.config.js';
import { geminiSemaphore, withRetry } from '../TrafficControl.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const INTELLIGENCE_MODEL = GEMINI_MODELS.FLASH;

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Extended confidence score with 7 dimensions
 */
export interface ConfidenceScore {
  // Core metrics (0-100)
  overall: number;
  factualAccuracy: number;
  completeness: number;
  relevance: number;

  // Extended metrics (0-100)
  coherence: number; // Logical consistency and flow
  specificity: number; // Concreteness vs vagueness
  actionability: number; // Can user act on this?
  sourceCitation: number; // References to sources

  // Uncertainty quantification
  confidence: {
    lower: number; // Lower bound (95% CI)
    upper: number; // Upper bound (95% CI)
    stdDev: number; // Standard deviation
  };

  // Meta information
  needsClarification: boolean;
  clarificationQuestions: string[];
  explanation: ScoreExplanation;

  // Calibration data
  calibrated: boolean;
  calibrationAdjustment: number;
  rawScore: number;
}

/**
 * Explanation for each score dimension
 */
export interface ScoreExplanation {
  overall: string;
  factualAccuracy: string;
  completeness: string;
  relevance: string;
  coherence: string;
  specificity: string;
  actionability: string;
  sourceCitation: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}

/**
 * Calibration history entry
 */
interface CalibrationEntry {
  timestamp: number;
  taskType: string;
  predictedScore: number;
  actualOutcome: number; // 0-100 based on user feedback
}

/**
 * Multi-model comparison result
 */
export interface MultiModelConfidence {
  primary: ConfidenceScore;
  secondary?: ConfidenceScore;
  agreement: number; // How much models agree (0-100)
  divergenceAreas: string[];
}

// ============================================================================
// CALIBRATION CACHE (In-memory, survives within session)
// ============================================================================

class CalibrationCache {
  private history: CalibrationEntry[] = [];
  private maxEntries = 100;
  private taskTypeOffsets: Map<string, number> = new Map();

  addEntry(entry: CalibrationEntry): void {
    this.history.push(entry);
    if (this.history.length > this.maxEntries) {
      this.history.shift();
    }
    this.recalculateOffsets();
  }

  private recalculateOffsets(): void {
    const byType = new Map<string, CalibrationEntry[]>();

    for (const entry of this.history) {
      const entries = byType.get(entry.taskType) || [];
      entries.push(entry);
      byType.set(entry.taskType, entries);
    }

    for (const [taskType, entries] of byType) {
      if (entries.length >= 3) {
        // Calculate average offset (actual - predicted)
        const offsets = entries.map((e) => e.actualOutcome - e.predictedScore);
        const avgOffset = offsets.reduce((a, b) => a + b, 0) / offsets.length;
        this.taskTypeOffsets.set(taskType, avgOffset);
      }
    }
  }

  getOffset(taskType: string): number {
    return this.taskTypeOffsets.get(taskType) || 0;
  }

  getStats(): { totalEntries: number; taskTypes: string[]; avgAccuracy: number } {
    if (this.history.length === 0) {
      return { totalEntries: 0, taskTypes: [], avgAccuracy: 0 };
    }

    const errors = this.history.map((e) => Math.abs(e.actualOutcome - e.predictedScore));
    const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;

    return {
      totalEntries: this.history.length,
      taskTypes: [...this.taskTypeOffsets.keys()],
      avgAccuracy: 100 - avgError,
    };
  }
}

const calibrationCache = new CalibrationCache();

// ============================================================================
// ROBUST JSON PARSING
// ============================================================================

/**
 * Extract JSON from potentially malformed response
 */
function extractJSON(text: string): string {
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

  // Try to find JSON object boundaries
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
  }

  // Fix common JSON issues
  cleaned = cleaned
    // Remove trailing commas before } or ]
    .replace(/,\s*([}\]])/g, '$1')
    // Fix unquoted keys
    .replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
    // Fix single quotes to double quotes (but not within strings)
    .replace(/'([^']+)'(\s*[,}\]])/g, '"$1"$2')
    // Remove control characters
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char sanitization
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    // Fix newlines in strings
    .replace(/\n/g, '\\n')
    // Remove BOM
    .replace(/^\uFEFF/, '');

  return cleaned.trim();
}

/**
 * Safe number extraction with bounds
 */
function safeNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return Math.max(min, Math.min(max, Math.round(value)));
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return Math.max(min, Math.min(max, Math.round(parsed)));
    }
  }
  return fallback;
}

/**
 * Safe string extraction
 */
function safeString(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return fallback;
  return String(value);
}

/**
 * Safe array extraction
 */
function safeStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === 'string').slice(0, 10);
  }
  return fallback;
}

/**
 * Parse JSON with multiple fallback strategies
 */
function robustJSONParse(text: string): Record<string, unknown> {
  const strategies = [
    // Strategy 1: Direct parse
    () => JSON.parse(text),

    // Strategy 2: Extract and parse
    () => JSON.parse(extractJSON(text)),

    // Strategy 3: Fix truncated JSON
    () => {
      let fixed = extractJSON(text);
      // Count open braces/brackets
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      const openBrackets = (fixed.match(/\[/g) || []).length;
      const closeBrackets = (fixed.match(/\]/g) || []).length;

      // Add missing closing brackets/braces
      fixed += ']'.repeat(Math.max(0, openBrackets - closeBrackets));
      fixed += '}'.repeat(Math.max(0, openBraces - closeBraces));

      return JSON.parse(fixed);
    },

    // Strategy 4: Extract numbers with regex
    () => {
      const numbers: Record<string, number> = {};
      const patterns = [
        /factualAccuracy["\s:]+(\d+)/i,
        /completeness["\s:]+(\d+)/i,
        /relevance["\s:]+(\d+)/i,
        /coherence["\s:]+(\d+)/i,
        /specificity["\s:]+(\d+)/i,
        /actionability["\s:]+(\d+)/i,
        /sourceCitation["\s:]+(\d+)/i,
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          const key = pattern.source.split('[')[0].toLowerCase();
          numbers[key] = parseInt(match[1], 10);
        }
      }

      if (Object.keys(numbers).length >= 2) {
        return numbers;
      }
      throw new Error('Not enough numbers extracted');
    },
  ];

  for (const strategy of strategies) {
    try {
      const result = strategy();
      if (result && typeof result === 'object') {
        return result as Record<string, unknown>;
      }
    } catch {
      // Try next strategy
    }
  }

  // All strategies failed - return empty object
  console.log(chalk.yellow('[Confidence] All JSON parsing strategies failed'));
  return {};
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_SCORE: ConfidenceScore = {
  overall: 50,
  factualAccuracy: 50,
  completeness: 50,
  relevance: 50,
  coherence: 50,
  specificity: 50,
  actionability: 50,
  sourceCitation: 0,
  confidence: {
    lower: 40,
    upper: 60,
    stdDev: 15,
  },
  needsClarification: true,
  clarificationQuestions: ['Czy mozesz podac wiecej szczegolow?'],
  explanation: {
    overall: 'Nie udalo sie w pelni ocenic odpowiedzi',
    factualAccuracy: 'Brak wystarczajacych danych do oceny faktow',
    completeness: 'Kompletnosc trudna do okreslenia',
    relevance: 'Trafnosc wymaga dalszej analizy',
    coherence: 'Spojnosc na srednim poziomie',
    specificity: 'Konkretnosc niejasna',
    actionability: 'Wykonalnosc do weryfikacji',
    sourceCitation: 'Brak odniesien do zrodel',
    strengths: [],
    weaknesses: ['Wymagana jest dodatkowa weryfikacja'],
    suggestions: ['Dostarczenie wiecej kontekstu pomoze w lepszej ocenie'],
  },
  calibrated: false,
  calibrationAdjustment: 0,
  rawScore: 50,
};

// ============================================================================
// TASK TYPE DETECTION
// ============================================================================

function detectTaskType(task: string): string {
  const taskLower = task.toLowerCase();

  if (
    taskLower.includes('kod') ||
    taskLower.includes('code') ||
    taskLower.includes('program') ||
    taskLower.includes('funkcj')
  ) {
    return 'coding';
  }
  if (
    taskLower.includes('analiz') ||
    taskLower.includes('zbadaj') ||
    taskLower.includes('sprawdz')
  ) {
    return 'analysis';
  }
  if (
    taskLower.includes('napisz') ||
    taskLower.includes('stworz') ||
    taskLower.includes('wygeneruj')
  ) {
    return 'creative';
  }
  if (taskLower.includes('wyjasni') || taskLower.includes('opisz') || taskLower.includes('co to')) {
    return 'explanation';
  }
  if (taskLower.includes('napraw') || taskLower.includes('debug') || taskLower.includes('blad')) {
    return 'debugging';
  }

  return 'general';
}

// ============================================================================
// MAIN SCORING FUNCTIONS
// ============================================================================

/**
 * Score confidence in a response with robust error handling
 */
export async function scoreConfidence(task: string, response: string): Promise<ConfidenceScore> {
  return robustScoreConfidence(task, response);
}

/**
 * Robust confidence scoring with retry and fallbacks
 */
export async function robustScoreConfidence(
  task: string,
  response: string,
  options: {
    retries?: number;
    timeout?: number;
    includeExplanation?: boolean;
  } = {},
): Promise<ConfidenceScore> {
  const { retries = 2, timeout: _timeout = 30000, includeExplanation = true } = options;

  console.log(chalk.magenta('[Confidence] Scoring response confidence (enhanced)...'));

  const taskType = detectTaskType(task);
  const responsePreview = response.substring(0, 3000);

  const prompt = `Jestes ekspertem w ocenie jakosci odpowiedzi AI. Ocen ponizszą odpowiedz na 7 wymiarach (0-100).

ZADANIE: ${task}

ODPOWIEDZ DO OCENY:
${responsePreview}

WYMIARY OCENY:
1. factualAccuracy (0-100): Poprawnosc merytoryczna i faktograficzna
2. completeness (0-100): Pelnosc odpowiedzi, wszystkie aspekty uwzglednione
3. relevance (0-100): Trafnosc odpowiedzi wzgledem pytania
4. coherence (0-100): Spojnosc logiczna, plynnosc argumentacji
5. specificity (0-100): Konkretnosc, unikanie ogolnikow
6. actionability (0-100): Wykonalnosc - czy uzytkownik moze dzialac?
7. sourceCitation (0-100): Odniesienia do zrodel (0 jesli brak potrzeby)

DODATKOWE ELEMENTY:
- needsClarification: true/false - czy potrzeba dodatkowych informacji
- clarificationQuestions: lista pytan dla wyjasnienia (max 3)
${
  includeExplanation
    ? `- explanations: krotkie wyjasnienie kazdej oceny (1 zdanie)
- strengths: 2-3 mocne strony odpowiedzi
- weaknesses: 1-2 slabe strony
- suggestions: 1-2 sugestie poprawy`
    : ''
}

FORMAT ODPOWIEDZI (TYLKO JSON, bez markdown):
{
  "factualAccuracy": 85,
  "completeness": 70,
  "relevance": 90,
  "coherence": 80,
  "specificity": 75,
  "actionability": 65,
  "sourceCitation": 40,
  "needsClarification": false,
  "clarificationQuestions": []${
    includeExplanation
      ? `,
  "explanations": {
    "factualAccuracy": "Fakty sa poprawne...",
    "completeness": "Odpowiedz jest kompletna...",
    "relevance": "Dobrze odpowiada na pytanie...",
    "coherence": "Logicznie spojne...",
    "specificity": "Dosc konkretne...",
    "actionability": "Mozna na tej podstawie dzialac...",
    "sourceCitation": "Brak odniesien..."
  },
  "strengths": ["Mocna strona 1", "Mocna strona 2"],
  "weaknesses": ["Slaba strona 1"],
  "suggestions": ["Sugestia 1"]`
      : ''
  }
}`;

  try {
    const result = await withRetry(
      async () => {
        return await geminiSemaphore.withPermit(async () => {
          const model = genAI.getGenerativeModel({
            model: INTELLIGENCE_MODEL,
            generationConfig: {
              temperature: 1.0, // Temperature locked at 1.0 for Gemini - do not change
              maxOutputTokens: 1024,
              topP: 0.9,
            },
          });

          const res = await model.generateContent(prompt);
          return res.response.text();
        });
      },
      {
        maxRetries: retries,
        baseDelay: 1000,
        onRetry: (attempt, error) => {
          console.log(chalk.yellow(`[Confidence] Retry ${attempt}: ${error.message}`));
        },
      },
    );

    // Robust parsing
    const parsed = robustJSONParse(result);

    // Extract scores with validation
    const factualAccuracy = safeNumber(parsed.factualAccuracy, 0, 100, 50);
    const completeness = safeNumber(parsed.completeness, 0, 100, 50);
    const relevance = safeNumber(parsed.relevance, 0, 100, 50);
    const coherence = safeNumber(parsed.coherence, 0, 100, 50);
    const specificity = safeNumber(parsed.specificity, 0, 100, 50);
    const actionability = safeNumber(parsed.actionability, 0, 100, 50);
    const sourceCitation = safeNumber(parsed.sourceCitation, 0, 100, 0);

    // Calculate weighted overall score
    const rawOverall = Math.round(
      factualAccuracy * 0.25 +
        completeness * 0.15 +
        relevance * 0.2 +
        coherence * 0.15 +
        specificity * 0.1 +
        actionability * 0.1 +
        sourceCitation * 0.05,
    );

    // Apply calibration
    const calibrationOffset = calibrationCache.getOffset(taskType);
    const calibratedOverall = Math.max(
      0,
      Math.min(100, Math.round(rawOverall + calibrationOffset)),
    );

    // Calculate uncertainty
    const scores = [
      factualAccuracy,
      completeness,
      relevance,
      coherence,
      specificity,
      actionability,
    ];
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // 95% confidence interval
    const marginOfError = 1.96 * (stdDev / Math.sqrt(scores.length));
    const lowerBound = Math.max(0, Math.round(calibratedOverall - marginOfError - 5));
    const upperBound = Math.min(100, Math.round(calibratedOverall + marginOfError + 5));

    // Extract explanations
    const explanations = parsed.explanations as Record<string, string> | undefined;
    const explanation: ScoreExplanation = {
      overall: `Wynik ${calibratedOverall}% bazuje na wazonej sredniej 7 wymiarow`,
      factualAccuracy: safeString(explanations?.factualAccuracy, 'Ocena poprawnosci faktow'),
      completeness: safeString(explanations?.completeness, 'Ocena kompletnosci'),
      relevance: safeString(explanations?.relevance, 'Ocena trafnosci'),
      coherence: safeString(explanations?.coherence, 'Ocena spojnosci'),
      specificity: safeString(explanations?.specificity, 'Ocena konkretnosci'),
      actionability: safeString(explanations?.actionability, 'Ocena wykonalnosci'),
      sourceCitation: safeString(explanations?.sourceCitation, 'Ocena odniesien do zrodel'),
      strengths: safeStringArray(parsed.strengths, ['Odpowiedz zostala udzielona']),
      weaknesses: safeStringArray(parsed.weaknesses, []),
      suggestions: safeStringArray(parsed.suggestions, []),
    };

    const needsClarification = parsed.needsClarification === true || calibratedOverall < 60;
    const clarificationQuestions = safeStringArray(
      parsed.clarificationQuestions,
      needsClarification ? ['Czy mozesz podac wiecej szczegolow?'] : [],
    );

    const score: ConfidenceScore = {
      overall: calibratedOverall,
      factualAccuracy,
      completeness,
      relevance,
      coherence,
      specificity,
      actionability,
      sourceCitation,
      confidence: {
        lower: lowerBound,
        upper: upperBound,
        stdDev: Math.round(stdDev * 10) / 10,
      },
      needsClarification,
      clarificationQuestions,
      explanation,
      calibrated: calibrationOffset !== 0,
      calibrationAdjustment: calibrationOffset,
      rawScore: rawOverall,
    };

    // Log summary
    console.log(
      chalk.gray(
        `[Confidence] Score: ${calibratedOverall}% [${lowerBound}-${upperBound}] ` +
          `(F:${factualAccuracy} C:${completeness} R:${relevance} Co:${coherence} ` +
          `S:${specificity} A:${actionability} Src:${sourceCitation})`,
      ),
    );

    if (score.calibrated) {
      console.log(
        chalk.gray(
          `[Confidence] Calibration adjustment: ${calibrationOffset > 0 ? '+' : ''}${calibrationOffset}`,
        ),
      );
    }

    return score;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[Confidence] Scoring failed after retries: ${msg}`));
    return {
      ...DEFAULT_SCORE,
      explanation: {
        ...DEFAULT_SCORE.explanation,
        overall: `Blad oceny: ${msg}`,
      },
    };
  }
}

// ============================================================================
// CALIBRATION FUNCTIONS
// ============================================================================

/**
 * Record actual outcome for calibration
 */
export function recordCalibration(
  task: string,
  predictedScore: number,
  actualOutcome: number, // 0-100, e.g., user satisfaction
): void {
  const taskType = detectTaskType(task);

  calibrationCache.addEntry({
    timestamp: Date.now(),
    taskType,
    predictedScore,
    actualOutcome,
  });

  console.log(
    chalk.gray(
      `[Confidence] Calibration recorded: predicted=${predictedScore}, actual=${actualOutcome}, type=${taskType}`,
    ),
  );
}

/**
 * Apply calibration to a raw score
 */
export function calibrateScore(
  rawScore: number,
  task: string,
): { calibrated: number; adjustment: number } {
  const taskType = detectTaskType(task);
  const adjustment = calibrationCache.getOffset(taskType);

  return {
    calibrated: Math.max(0, Math.min(100, Math.round(rawScore + adjustment))),
    adjustment,
  };
}

/**
 * Get calibration statistics
 */
export function getCalibrationStats(): {
  totalEntries: number;
  taskTypes: string[];
  avgAccuracy: number;
} {
  return calibrationCache.getStats();
}

// ============================================================================
// SCORE EXPLANATION
// ============================================================================

/**
 * Generate human-readable explanation for a score
 */
export function explainScore(score: ConfidenceScore): string {
  const lines: string[] = [];

  // Overall assessment
  let overallAssessment: string;
  if (score.overall >= 85) {
    overallAssessment = 'Odpowiedz wysokiej jakosci';
  } else if (score.overall >= 70) {
    overallAssessment = 'Odpowiedz dobra, z drobnymi zastrzezeniami';
  } else if (score.overall >= 50) {
    overallAssessment = 'Odpowiedz sredniej jakosci, wymaga weryfikacji';
  } else {
    overallAssessment = 'Odpowiedz ponizej standardu, zalecana poprawka';
  }

  lines.push(`=== OCENA PEWNOSCI: ${score.overall}% ===`);
  lines.push(`Przedzial ufnosci: ${score.confidence.lower}% - ${score.confidence.upper}%`);
  lines.push(`Wniosek: ${overallAssessment}`);
  lines.push('');

  // Dimension breakdown
  lines.push('WYMIARY:');
  lines.push(
    `  Poprawnosc faktow:  ${score.factualAccuracy}% - ${score.explanation.factualAccuracy}`,
  );
  lines.push(`  Kompletnosc:        ${score.completeness}% - ${score.explanation.completeness}`);
  lines.push(`  Trafnosc:           ${score.relevance}% - ${score.explanation.relevance}`);
  lines.push(`  Spojnosc:           ${score.coherence}% - ${score.explanation.coherence}`);
  lines.push(`  Konkretnosc:        ${score.specificity}% - ${score.explanation.specificity}`);
  lines.push(`  Wykonalnosc:        ${score.actionability}% - ${score.explanation.actionability}`);
  lines.push(
    `  Zrodla:             ${score.sourceCitation}% - ${score.explanation.sourceCitation}`,
  );
  lines.push('');

  // Strengths
  if (score.explanation.strengths.length > 0) {
    lines.push('MOCNE STRONY:');
    for (const strength of score.explanation.strengths) {
      lines.push(`  + ${strength}`);
    }
    lines.push('');
  }

  // Weaknesses
  if (score.explanation.weaknesses.length > 0) {
    lines.push('DO POPRAWY:');
    for (const weakness of score.explanation.weaknesses) {
      lines.push(`  - ${weakness}`);
    }
    lines.push('');
  }

  // Suggestions
  if (score.explanation.suggestions.length > 0) {
    lines.push('SUGESTIE:');
    for (const suggestion of score.explanation.suggestions) {
      lines.push(`  * ${suggestion}`);
    }
    lines.push('');
  }

  // Clarification
  if (score.needsClarification && score.clarificationQuestions.length > 0) {
    lines.push('PYTANIA WYJASNIAJACE:');
    for (const question of score.clarificationQuestions) {
      lines.push(`  ? ${question}`);
    }
    lines.push('');
  }

  // Calibration info
  if (score.calibrated) {
    lines.push(
      `[Kalibracja: ${score.calibrationAdjustment > 0 ? '+' : ''}${score.calibrationAdjustment}, wynik surowy: ${score.rawScore}%]`,
    );
  }

  return lines.join('\n');
}

/**
 * Generate compact one-line summary
 */
export function summarizeScore(score: ConfidenceScore): string {
  const emoji = score.overall >= 70 ? 'OK' : score.overall >= 50 ? '??' : '!!';
  return (
    `[${emoji}] ${score.overall}% (${score.confidence.lower}-${score.confidence.upper}) | ` +
    `F:${score.factualAccuracy} C:${score.completeness} R:${score.relevance} ` +
    `Co:${score.coherence} S:${score.specificity}` +
    (score.needsClarification ? ' | NEEDS CLARIFICATION' : '')
  );
}

// ============================================================================
// MULTI-MODEL CONFIDENCE (Optional secondary validation)
// ============================================================================

/**
 * Compare confidence across multiple models (stub for extension)
 */
export async function multiModelConfidence(
  task: string,
  response: string,
  _secondaryModel?: string,
): Promise<MultiModelConfidence> {
  // Primary scoring
  const primary = await robustScoreConfidence(task, response);

  // For now, just return primary
  // In future, can add Ollama or other model comparison
  return {
    primary,
    agreement: 100,
    divergenceAreas: [],
  };
}

// ============================================================================
// QUICK SCORING (Lightweight version for high throughput)
// ============================================================================

/**
 * Quick heuristic-based scoring without LLM call
 */
export function quickScore(
  task: string,
  response: string,
): Pick<ConfidenceScore, 'overall' | 'completeness' | 'specificity'> {
  // Length-based completeness heuristic
  const taskWords = task.split(/\s+/).length;
  const responseWords = response.split(/\s+/).length;
  const lengthRatio = Math.min(1, responseWords / Math.max(taskWords * 3, 50));
  const completeness = Math.round(lengthRatio * 100);

  // Specificity heuristic (numbers, code, specific terms)
  const hasNumbers = /\d+/.test(response);
  const hasCode = /```|`[^`]+`|function|const|let|var|=>/.test(response);
  const hasLists = /^[\s]*[-*\d+.]\s/m.test(response);
  const specificityScore = (hasNumbers ? 25 : 0) + (hasCode ? 35 : 0) + (hasLists ? 20 : 0) + 20;
  const specificity = Math.min(100, specificityScore);

  // Overall based on length and format
  const overall = Math.round((completeness + specificity) / 2);

  return { overall, completeness, specificity };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  scoreConfidence,
  robustScoreConfidence,
  recordCalibration,
  calibrateScore,
  getCalibrationStats,
  explainScore,
  summarizeScore,
  multiModelConfidence,
  quickScore,
  DEFAULT_SCORE,
};

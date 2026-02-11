/**
 * SelfReflection - Advanced Self-Reflection with Reflexion Framework
 *
 * Implementation based on "Reflexion: Language Agents with Verbal Reinforcement Learning"
 * (Shinn et al., 2023) - achieving 91% on HumanEval
 *
 * Key components:
 * 1. Episodic Memory - stores lessons learned from past attempts
 * 2. Verbal Reinforcement Learning - agent learns from its own failures
 * 3. Trajectory Replay - ability to return to earlier checkpoints
 * 4. Self-Evaluation - agent evaluates its own outputs
 *
 * Also includes simpler SelfReflectionEngine for basic reflection needs.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import { GEMINI_MODELS } from '../../config/models.config.js';
import { GEMINIHYDRA_DIR } from '../../config/paths.config.js';
import { geminiSemaphore } from '../TrafficControl.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const INTELLIGENCE_MODEL = GEMINI_MODELS.FLASH;

// Memory storage path
const REFLEXION_MEMORY_DIR = path.join(GEMINIHYDRA_DIR, 'reflexion');
const REFLEXION_MEMORY_FILE = path.join(REFLEXION_MEMORY_DIR, 'episodic-memory.json');

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Basic reflection result
 */
export interface ReflectionResult {
  /** Original response before reflection */
  originalResponse: string;
  /** Reflections/analysis of weaknesses */
  reflections: string[];
  /** Reflection text (for legacy compatibility) */
  reflection?: string;
  /** Improved response after reflection */
  improvedResponse: string;
  /** Confidence improvement (0-100) */
  confidenceImprovement: number;
  /** Alias for confidenceImprovement */
  confidenceGain?: number;
}

/**
 * Configuration for reflection engine
 */
export interface ReflectionConfig {
  /** Model used for reflection */
  model?: string;
  /** Generation temperature */
  temperature?: number;
  /** Maximum output tokens */
  maxOutputTokens?: number;
  /** Minimum improvement threshold to accept change */
  minImprovementThreshold?: number;
  /** Whether to log progress */
  verbose?: boolean;
}

/**
 * Evaluation criteria for responses
 */
export interface ReflectionCriteria {
  accuracy: number; // Factual accuracy (0-100)
  completeness: number; // Response completeness (0-100)
  clarity: number; // Clarity of message (0-100)
  relevance: number; // Relevance to task (0-100)
  actionability: number; // Practical usefulness (0-100)
}

/**
 * A lesson learned from a reflection attempt
 */
export interface ReflexionLesson {
  id: string;
  taskPattern: string; // Pattern/category of the task
  errorType: string; // Type of error encountered
  lesson: string; // What was learned
  correction: string; // How to fix this type of error
  successRate: number; // How often this lesson helped (0-1)
  usageCount: number; // How many times this lesson was applied
  created: Date;
  lastUsed: Date;
}

/**
 * A trajectory checkpoint for replay
 */
export interface TrajectoryCheckpoint {
  id: string;
  iteration: number;
  response: string;
  evaluation: EvaluationResult;
  reflections: string[];
  timestamp: Date;
}

/**
 * Evaluation result from self-evaluation
 */
export interface EvaluationResult {
  score: number; // 0-100
  isCorrect: boolean; // Binary correctness
  errors: string[]; // List of identified errors
  missingElements: string[]; // What's missing from the response
  strengths: string[]; // What's good about the response
  suggestions: string[]; // How to improve
}

/**
 * Complete reflexion memory store
 */
export interface ReflexionMemory {
  lessons: ReflexionLesson[];
  version: number;
  totalReflections: number;
  successfulReflections: number;
  lastUpdated: Date;
}

/**
 * Extended reflection result with full Reflexion data
 */
export interface ReflexionResult extends ReflectionResult {
  trajectory: TrajectoryCheckpoint[];
  lessonsLearned: ReflexionLesson[];
  lessonsApplied: ReflexionLesson[];
  finalEvaluation: EvaluationResult;
  iterations: number;
  earlyStop: boolean;
  earlyStopReason?: string;
}

/**
 * Options for reflexion loop
 */
export interface ReflexionOptions {
  maxIterations?: number;
  earlyStopThreshold?: number;
  minScore?: number;
  enableTrajectoryReplay?: boolean;
  enableMemory?: boolean;
}

// ============================================================================
// Reflexion Memory Manager
// ============================================================================

class ReflexionMemoryManager {
  private memory: ReflexionMemory = {
    lessons: [],
    version: 1,
    totalReflections: 0,
    successfulReflections: 0,
    lastUpdated: new Date(),
  };
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(REFLEXION_MEMORY_DIR, { recursive: true });
      const data = await fs.readFile(REFLEXION_MEMORY_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      this.memory = {
        ...parsed,
        lessons: parsed.lessons.map((l: ReflexionLesson) => ({
          ...l,
          created: new Date(l.created),
          lastUsed: new Date(l.lastUsed),
        })),
        lastUpdated: new Date(parsed.lastUpdated),
      };
    } catch {
      // File doesn't exist, use default
    }

    this.initialized = true;
  }

  async save(): Promise<void> {
    this.memory.lastUpdated = new Date();
    await fs.writeFile(REFLEXION_MEMORY_FILE, JSON.stringify(this.memory, null, 2));
  }

  /**
   * Add a new lesson to memory
   */
  async addLesson(
    lesson: Omit<ReflexionLesson, 'id' | 'created' | 'lastUsed' | 'usageCount' | 'successRate'>,
  ): Promise<string> {
    const id = `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const similar = this.findSimilarLessons(lesson.taskPattern, lesson.errorType);
    if (similar.length > 0) {
      const existing = similar[0];
      existing.lesson = lesson.lesson;
      existing.correction = lesson.correction;
      existing.lastUsed = new Date();
      await this.save();
      return existing.id;
    }

    const newLesson: ReflexionLesson = {
      ...lesson,
      id,
      successRate: 0.5,
      usageCount: 0,
      created: new Date(),
      lastUsed: new Date(),
    };

    this.memory.lessons.push(newLesson);

    if (this.memory.lessons.length > 100) {
      this.memory.lessons = this.memory.lessons
        .sort((a, b) => b.successRate * b.usageCount - a.successRate * a.usageCount)
        .slice(0, 100);
    }

    await this.save();
    return id;
  }

  /**
   * Find lessons relevant to a task
   */
  findRelevantLessons(taskDescription: string, limit: number = 5): ReflexionLesson[] {
    const words = taskDescription
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 2);

    const scored = this.memory.lessons.map((lesson) => {
      const patternWords = lesson.taskPattern.toLowerCase().split(/\W+/);
      const matchCount = words.filter((w) => patternWords.includes(w)).length;
      const score = (matchCount / Math.max(words.length, 1)) * lesson.successRate;
      return { lesson, score };
    });

    return scored
      .filter((s) => s.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.lesson);
  }

  /**
   * Find lessons for a specific error type
   */
  findSimilarLessons(taskPattern: string, errorType: string): ReflexionLesson[] {
    return this.memory.lessons.filter(
      (l) =>
        l.taskPattern.toLowerCase().includes(taskPattern.toLowerCase()) ||
        l.errorType.toLowerCase() === errorType.toLowerCase(),
    );
  }

  /**
   * Update lesson success rate based on outcome
   */
  async updateLessonOutcome(lessonId: string, wasSuccessful: boolean): Promise<void> {
    const lesson = this.memory.lessons.find((l) => l.id === lessonId);
    if (!lesson) return;

    lesson.usageCount++;
    lesson.lastUsed = new Date();

    const alpha = 0.3;
    lesson.successRate = alpha * (wasSuccessful ? 1 : 0) + (1 - alpha) * lesson.successRate;

    await this.save();
  }

  /**
   * Record a reflection attempt
   */
  async recordReflection(successful: boolean): Promise<void> {
    this.memory.totalReflections++;
    if (successful) {
      this.memory.successfulReflections++;
    }
    await this.save();
  }

  /**
   * Get memory statistics
   */
  getStats(): { lessons: number; successRate: number; totalReflections: number } {
    return {
      lessons: this.memory.lessons.length,
      successRate:
        this.memory.totalReflections > 0
          ? this.memory.successfulReflections / this.memory.totalReflections
          : 0,
      totalReflections: this.memory.totalReflections,
    };
  }

  /**
   * Export lessons as context string
   */
  exportLessonsAsContext(lessons: ReflexionLesson[]): string {
    if (lessons.length === 0) return '';

    let context = '## Lekcje z poprzednich prób (Reflexion Memory)\n\n';
    for (const lesson of lessons) {
      context += `### ${lesson.errorType}\n`;
      context += `- Problem: ${lesson.lesson}\n`;
      context += `- Rozwiązanie: ${lesson.correction}\n`;
      context += `- Skuteczność: ${(lesson.successRate * 100).toFixed(0)}%\n\n`;
    }
    return context;
  }

  /**
   * Clear all lessons
   */
  async clear(): Promise<void> {
    this.memory = {
      lessons: [],
      version: 1,
      totalReflections: 0,
      successfulReflections: 0,
      lastUpdated: new Date(),
    };
    await this.save();
  }
}

// Global memory instance
const reflexionMemory = new ReflexionMemoryManager();

// ============================================================================
// Self-Evaluation Function
// ============================================================================

/**
 * Self-evaluate a response against the task requirements
 */
async function selfEvaluate(
  task: string,
  response: string,
  previousErrors?: string[],
): Promise<EvaluationResult> {
  const previousContext =
    previousErrors && previousErrors.length > 0
      ? `\n\nPOPRZEDNIE BŁĘDY DO UNIKNIĘCIA:\n${previousErrors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`
      : '';

  const evaluationPrompt = `Jesteś surowym ewaluatorem AI. Oceń poniższą odpowiedź.

ZADANIE: ${task}
${previousContext}

ODPOWIEDŹ DO OCENY:
${response}

INSTRUKCJE EWALUACJI:
1. Sprawdź czy odpowiedź jest POPRAWNA (realizuje zadanie)
2. Zidentyfikuj WSZYSTKIE błędy (nawet małe)
3. Znajdź BRAKUJĄCE elementy
4. Oceń MOCNE strony
5. Podaj KONKRETNE sugestie poprawy

FORMAT (JSON):
{
  "score": 0-100,
  "isCorrect": true/false,
  "errors": ["błąd 1", "błąd 2"],
  "missingElements": ["brakujący element 1"],
  "strengths": ["mocna strona 1"],
  "suggestions": ["sugestia 1", "sugestia 2"]
}

Bądź SUROWY ale SPRAWIEDLIWY. Zwróć TYLKO JSON.`;

  try {
    const result = await geminiSemaphore.withPermit(async () => {
      const model = genAI.getGenerativeModel({
        model: INTELLIGENCE_MODEL,
        generationConfig: { temperature: 1.0, maxOutputTokens: 2048 }, // Temperature locked at 1.0 for Gemini - do not change
      });
      const response = await model.generateContent(evaluationPrompt);
      return response.response.text();
    });

    const jsonStr = result
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(jsonStr);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[Evaluate] Evaluation failed: ${msg}`));
    return {
      score: 50,
      isCorrect: false,
      errors: ['Nie udało się przeprowadzić ewaluacji'],
      missingElements: [],
      strengths: [],
      suggestions: ['Spróbuj ponownie'],
    };
  }
}

// ============================================================================
// Learn from Failure Function
// ============================================================================

/**
 * Extract lessons from a failed attempt (Verbal Reinforcement Learning)
 */
async function learnFromFailure(
  task: string,
  failedResponse: string,
  evaluation: EvaluationResult,
): Promise<ReflexionLesson[]> {
  const learningPrompt = `Jesteś ekspertem od uczenia maszynowego. Przeanalizuj nieudaną próbę i wyciągnij wnioski.

ZADANIE: ${task}

NIEUDANA ODPOWIEDŹ:
${failedResponse}

WYKRYTE BŁĘDY:
${evaluation.errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}

BRAKUJĄCE ELEMENTY:
${evaluation.missingElements.map((e, i) => `${i + 1}. ${e}`).join('\n')}

INSTRUKCJE:
1. Zidentyfikuj WZORZEC błędu (np. "brak walidacji", "złe typy", "niekompletna logika")
2. Sformułuj LEKCJE na przyszłość
3. Podaj KONKRETNE rozwiązania

FORMAT (JSON array):
[
  {
    "taskPattern": "typ zadania gdzie występuje problem",
    "errorType": "kategoria błędu",
    "lesson": "co poszło nie tak",
    "correction": "jak to naprawić w przyszłości"
  }
]

Wyciągnij 1-3 NAJWAŻNIEJSZYCH lekcji. Zwróć TYLKO JSON array.`;

  try {
    const result = await geminiSemaphore.withPermit(async () => {
      const model = genAI.getGenerativeModel({
        model: INTELLIGENCE_MODEL,
        generationConfig: { temperature: 1.0, maxOutputTokens: 2048 }, // Temperature locked at 1.0 for Gemini - do not change
      });
      const response = await model.generateContent(learningPrompt);
      return response.response.text();
    });

    const jsonStr = result
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const lessons = JSON.parse(jsonStr);

    const savedLessons: ReflexionLesson[] = [];
    for (const lesson of lessons) {
      const _id = await reflexionMemory.addLesson(lesson);
      const savedLesson = reflexionMemory.findSimilarLessons(
        lesson.taskPattern,
        lesson.errorType,
      )[0];
      if (savedLesson) {
        savedLessons.push(savedLesson);
      }
    }

    console.log(chalk.cyan(`[Learn] Extracted ${savedLessons.length} lessons from failure`));
    return savedLessons;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[Learn] Failed to extract lessons: ${msg}`));
    return [];
  }
}

// ============================================================================
// Trajectory Replay Function
// ============================================================================

/**
 * Find the best checkpoint to replay from
 */
function findBestCheckpoint(trajectory: TrajectoryCheckpoint[]): TrajectoryCheckpoint | null {
  if (trajectory.length === 0) return null;

  const candidates = trajectory.slice(0, -1);
  if (candidates.length === 0) return null;

  return candidates.reduce((best, current) =>
    current.evaluation.score > best.evaluation.score ? current : best,
  );
}

// ============================================================================
// Main Reflexion Loop
// ============================================================================

/**
 * Full Reflexion loop with episodic memory and verbal reinforcement learning
 * Based on "Reflexion: Language Agents with Verbal Reinforcement Learning"
 */
export async function reflexionLoop(
  task: string,
  initialResponse: string,
  options: ReflexionOptions = {},
): Promise<ReflexionResult> {
  const {
    maxIterations = 5,
    earlyStopThreshold = 5,
    minScore = 95,
    enableTrajectoryReplay = true,
    enableMemory = true,
  } = options;

  console.log(chalk.magenta('[Reflexion] Starting Reflexion loop...'));
  console.log(
    chalk.gray(
      `[Reflexion] Max iterations: ${maxIterations}, Early stop: <${earlyStopThreshold}%, Target: ${minScore}%`,
    ),
  );

  if (enableMemory) {
    await reflexionMemory.init();
  }

  let currentResponse = initialResponse;
  const trajectory: TrajectoryCheckpoint[] = [];
  const lessonsLearned: ReflexionLesson[] = [];
  const lessonsApplied: ReflexionLesson[] = [];
  const reflections: string[] = [];
  let previousErrors: string[] = [];
  let lastScore = 0;
  let earlyStop = false;
  let earlyStopReason: string | undefined;

  if (enableMemory) {
    const relevantLessons = reflexionMemory.findRelevantLessons(task);
    if (relevantLessons.length > 0) {
      console.log(
        chalk.cyan(`[Reflexion] Found ${relevantLessons.length} relevant lessons from memory`),
      );
      lessonsApplied.push(...relevantLessons);
    }
  }

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    console.log(chalk.gray(`\n[Reflexion] === Iteration ${iteration + 1}/${maxIterations} ===`));

    const evaluation = await selfEvaluate(task, currentResponse, previousErrors);
    console.log(chalk.gray(`[Reflexion] Evaluation score: ${evaluation.score}%`));

    trajectory.push({
      id: `checkpoint-${iteration}`,
      iteration,
      response: currentResponse,
      evaluation,
      reflections: [...reflections],
      timestamp: new Date(),
    });

    if (evaluation.score >= minScore) {
      earlyStop = true;
      earlyStopReason = `Target score reached (${evaluation.score}% >= ${minScore}%)`;
      console.log(chalk.green(`[Reflexion] ${earlyStopReason}`));
      break;
    }

    const improvement = evaluation.score - lastScore;
    if (iteration > 0 && improvement < earlyStopThreshold && improvement >= 0) {
      if (enableTrajectoryReplay && trajectory.length > 2) {
        const bestCheckpoint = findBestCheckpoint(trajectory);
        if (bestCheckpoint && bestCheckpoint.evaluation.score > evaluation.score) {
          console.log(
            chalk.yellow(
              `[Reflexion] Replaying from checkpoint ${bestCheckpoint.iteration} (score: ${bestCheckpoint.evaluation.score}%)`,
            ),
          );
          currentResponse = bestCheckpoint.response;
          previousErrors = bestCheckpoint.evaluation.errors;
          continue;
        }
      }

      earlyStop = true;
      earlyStopReason = `Improvement too small (${improvement.toFixed(1)}% < ${earlyStopThreshold}%)`;
      console.log(chalk.yellow(`[Reflexion] ${earlyStopReason}`));
      break;
    }

    lastScore = evaluation.score;

    if (!evaluation.isCorrect && enableMemory) {
      const newLessons = await learnFromFailure(task, currentResponse, evaluation);
      lessonsLearned.push(...newLessons);
    }

    const lessonsContext = enableMemory
      ? reflexionMemory.exportLessonsAsContext([...lessonsApplied, ...lessonsLearned])
      : '';

    const reflectionPrompt = `Jesteś ekspertem AI. Ulepsz odpowiedź na podstawie ewaluacji.

ZADANIE: ${task}

${lessonsContext}

OBECNA ODPOWIEDŹ:
${currentResponse}

EWALUACJA (score: ${evaluation.score}%):
- Błędy: ${evaluation.errors.join(', ') || 'brak'}
- Brakuje: ${evaluation.missingElements.join(', ') || 'nic'}
- Mocne strony: ${evaluation.strengths.join(', ') || 'brak'}
- Sugestie: ${evaluation.suggestions.join(', ') || 'brak'}

POPRZEDNIE BŁĘDY DO UNIKNIĘCIA:
${previousErrors.map((e, i) => `${i + 1}. ${e}`).join('\n') || 'brak'}

INSTRUKCJE:
1. NAPRAW wszystkie wykryte błędy
2. DODAJ brakujące elementy
3. ZACHOWAJ mocne strony
4. ZASTOSUJ sugestie
5. NIE POWTARZAJ poprzednich błędów

FORMAT (JSON):
{
  "reflection": "krótka analiza co poprawiam",
  "improvedResponse": "ulepszona odpowiedź",
  "fixedErrors": ["naprawiony błąd 1", "naprawiony błąd 2"],
  "addedElements": ["dodany element 1"]
}

Zwróć TYLKO JSON.`;

    try {
      const result = await geminiSemaphore.withPermit(async () => {
        const model = genAI.getGenerativeModel({
          model: INTELLIGENCE_MODEL,
          generationConfig: { temperature: 1.0, maxOutputTokens: 8192 }, // Temperature locked at 1.0 for Gemini - do not change
        });
        const response = await model.generateContent(reflectionPrompt);
        return response.response.text();
      });

      const jsonStr = result
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const parsed = JSON.parse(jsonStr);

      reflections.push(`Iteracja ${iteration + 1}: ${parsed.reflection}`);
      currentResponse = parsed.improvedResponse;
      previousErrors = [...previousErrors, ...evaluation.errors];

      console.log(
        chalk.gray(
          `[Reflexion] Fixed: ${parsed.fixedErrors?.length || 0} errors, Added: ${parsed.addedElements?.length || 0} elements`,
        ),
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`[Reflexion] Iteration ${iteration + 1} failed: ${msg}`));
    }
  }

  const finalEvaluation = await selfEvaluate(task, currentResponse, previousErrors);

  if (enableMemory) {
    const wasSuccessful = finalEvaluation.score >= minScore || finalEvaluation.isCorrect;
    await reflexionMemory.recordReflection(wasSuccessful);

    for (const lesson of lessonsApplied) {
      await reflexionMemory.updateLessonOutcome(lesson.id, wasSuccessful);
    }
  }

  const totalImprovement = finalEvaluation.score - (trajectory[0]?.evaluation.score || 0);

  console.log(chalk.green(`\n[Reflexion] Completed after ${trajectory.length} iterations`));
  console.log(
    chalk.green(
      `[Reflexion] Final score: ${finalEvaluation.score}% (${totalImprovement >= 0 ? '+' : ''}${totalImprovement.toFixed(1)}%)`,
    ),
  );
  console.log(
    chalk.green(
      `[Reflexion] Lessons learned: ${lessonsLearned.length}, Applied: ${lessonsApplied.length}`,
    ),
  );

  return {
    originalResponse: initialResponse,
    reflections,
    reflection: reflections.join('\n'),
    improvedResponse: currentResponse,
    confidenceImprovement: totalImprovement,
    confidenceGain: totalImprovement,
    trajectory,
    lessonsLearned,
    lessonsApplied,
    finalEvaluation,
    iterations: trajectory.length,
    earlyStop,
    earlyStopReason,
  };
}

// ============================================================================
// Simple Self-Reflect Function
// ============================================================================

/**
 * Simple self-reflection loop to improve response quality
 * Uses Gemini Flash for fast iterations
 */
export async function selfReflect(
  task: string,
  initialResponse: string,
  maxIterations: number = 3,
): Promise<ReflectionResult> {
  console.log(chalk.magenta('[Reflect] Starting self-reflection loop...'));

  let currentResponse = initialResponse;
  const reflections: string[] = [];
  let totalImprovement = 0;

  for (let i = 0; i < maxIterations; i++) {
    const reflectionPrompt = `Jesteś krytykiem AI. Oceń i ulepsz poniższą odpowiedź.

ZADANIE: ${task}

OBECNA ODPOWIEDŹ:
${currentResponse}

INSTRUKCJE:
1. Zidentyfikuj SŁABE PUNKTY odpowiedzi
2. Zaproponuj KONKRETNE ULEPSZENIA
3. Napisz ULEPSZONĄ WERSJĘ

FORMAT (JSON):
{
  "weaknesses": ["słaby punkt 1", "słaby punkt 2"],
  "improvements": ["ulepszenie 1", "ulepszenie 2"],
  "improvedResponse": "ulepszona odpowiedź",
  "improvementScore": 0-100
}

Odpowiadaj PO POLSKU. Zwróć TYLKO JSON.`;

    try {
      const response = await geminiSemaphore.withPermit(async () => {
        const model = genAI.getGenerativeModel({
          model: INTELLIGENCE_MODEL,
          generationConfig: { temperature: 1.0, maxOutputTokens: 4096 }, // Temperature locked at 1.0 for Gemini - do not change
        });
        const result = await model.generateContent(reflectionPrompt);
        return result.response.text();
      });

      const jsonStr = response
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const parsed = JSON.parse(jsonStr);

      reflections.push(`Iteracja ${i + 1}: ${parsed.weaknesses.join(', ')}`);

      if (parsed.improvementScore > 5) {
        currentResponse = parsed.improvedResponse;
        totalImprovement += parsed.improvementScore;
        console.log(
          chalk.gray(`[Reflect] Iteration ${i + 1}: +${parsed.improvementScore}% improvement`),
        );
      } else {
        console.log(chalk.gray(`[Reflect] Iteration ${i + 1}: No significant improvement needed`));
        break;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`[Reflect] Iteration ${i + 1} failed: ${msg}`));
      break;
    }
  }

  console.log(chalk.green(`[Reflect] Completed with ${reflections.length} reflections`));

  return {
    originalResponse: initialResponse,
    reflections,
    reflection: reflections.join('\n'),
    improvedResponse: currentResponse,
    confidenceImprovement: totalImprovement,
    confidenceGain: totalImprovement,
  };
}

// ============================================================================
// SelfReflectionEngine Class (for object-oriented usage)
// ============================================================================

/**
 * SelfReflectionEngine class for object-oriented usage
 * Wraps the functional API with stateful configuration
 */
export class SelfReflectionEngine {
  private config: Required<ReflectionConfig>;
  private reflectionHistory: Map<string, ReflectionResult[]> = new Map();

  constructor(config: ReflectionConfig = {}) {
    this.config = {
      model: config.model || INTELLIGENCE_MODEL,
      temperature: config.temperature || 0.3,
      maxOutputTokens: config.maxOutputTokens || 4096,
      minImprovementThreshold: config.minImprovementThreshold || 15,
      verbose: config.verbose ?? true,
    };
  }

  /**
   * Perform reflection on a response
   */
  async reflect(response: string, task: string): Promise<ReflectionResult> {
    const result = await selfReflect(task, response, 2);
    this.addToHistory(task, result);
    return result;
  }

  /**
   * Advanced reflexion with episodic memory
   */
  async reflexion(
    response: string,
    task: string,
    options?: ReflexionOptions,
  ): Promise<ReflexionResult> {
    const result = await reflexionLoop(task, response, {
      maxIterations: options?.maxIterations || 3,
      minScore: options?.minScore || 85,
      ...options,
    });
    this.addToHistory(task, result);
    return result;
  }

  /**
   * Check if task requires reflection
   */
  shouldReflect(task: string): boolean {
    const taskLower = task.toLowerCase();

    const complexIndicators = [
      'implementuj',
      'implement',
      'zaprojektuj',
      'design',
      'architektura',
      'architecture',
      'strategia',
      'strategy',
      'analiz',
      'analy',
      'ocen',
      'evaluat',
      'review',
      'optymalizuj',
      'optimiz',
      'refaktor',
      'refactor',
      'rozwiąż',
      'solve',
      'napraw',
      'fix',
      'debug',
      'plan',
      'roadmap',
      'proposal',
      'propozycja',
      'porównaj',
      'compare',
      'wybierz',
      'choose',
      'select',
      'wyjaśnij dlaczego',
      'explain why',
      'uzasadnij',
      'justify',
      'złożony',
      'complex',
      'trudny',
      'difficult',
      'skomplikowany',
    ];

    const simpleIndicators = [
      'pokaż',
      'show',
      'wyświetl',
      'display',
      'list',
      'ile',
      'how many',
      'policz',
      'count',
      'tak lub nie',
      'yes or no',
      'czy',
      'is it',
      'hello',
      'cześć',
      'hi',
      'witaj',
      'pomoc',
      'help',
      'instrukcja',
      'manual',
      'wersja',
      'version',
      'status',
    ];

    if (task.length < 30) {
      return false;
    }

    if (simpleIndicators.some((indicator) => taskLower.includes(indicator))) {
      return false;
    }

    if (complexIndicators.some((indicator) => taskLower.includes(indicator))) {
      return true;
    }

    return task.length > 100;
  }

  /**
   * Iterative improvement with multiple reflections
   */
  async iterativeImprovement(
    response: string,
    task: string,
    maxIterations: number = 3,
  ): Promise<string> {
    if (this.config.verbose) {
      console.log(
        chalk.cyan(
          `[SelfReflection] Starting iterative improvement (max ${maxIterations} iterations)...`,
        ),
      );
    }

    let currentResponse = response;
    let totalImprovement = 0;

    for (let i = 0; i < maxIterations; i++) {
      const result = await this.reflect(currentResponse, task);

      if (result.confidenceImprovement < this.config.minImprovementThreshold) {
        if (this.config.verbose) {
          console.log(
            chalk.gray(
              `[SelfReflection] Iteration ${i + 1}: Improvement below threshold. Stopping.`,
            ),
          );
        }
        break;
      }

      currentResponse = result.improvedResponse;
      totalImprovement += result.confidenceImprovement;

      if (totalImprovement >= 80) {
        if (this.config.verbose) {
          console.log(
            chalk.green(
              `[SelfReflection] High quality achieved (+${totalImprovement}%). Stopping.`,
            ),
          );
        }
        break;
      }
    }

    return currentResponse;
  }

  /**
   * Add result to history
   */
  private addToHistory(task: string, result: ReflectionResult): void {
    const taskKey = task.substring(0, 100);

    if (!this.reflectionHistory.has(taskKey)) {
      this.reflectionHistory.set(taskKey, []);
    }

    const history = this.reflectionHistory.get(taskKey);
    if (history) {
      history.push(result);

      if (history.length > 10) {
        history.shift();
      }
    }
  }

  /**
   * Get reflection history for a task
   */
  getHistory(task: string): ReflectionResult[] {
    const taskKey = task.substring(0, 100);
    return this.reflectionHistory.get(taskKey) || [];
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.reflectionHistory.clear();
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ReflectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<ReflectionConfig> {
    return { ...this.config };
  }

  /**
   * Get engine statistics
   */
  getStats(): {
    totalReflections: number;
    uniqueTasks: number;
    averageImprovement: number;
  } {
    let totalReflections = 0;
    let totalImprovement = 0;

    for (const history of this.reflectionHistory.values()) {
      totalReflections += history.length;
      totalImprovement += history.reduce((sum, r) => sum + r.confidenceImprovement, 0);
    }

    return {
      totalReflections,
      uniqueTasks: this.reflectionHistory.size,
      averageImprovement:
        totalReflections > 0 ? Math.round(totalImprovement / totalReflections) : 0,
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get Reflexion memory statistics
 */
export async function getReflexionStats(): Promise<{
  lessons: number;
  successRate: number;
  totalReflections: number;
}> {
  await reflexionMemory.init();
  return reflexionMemory.getStats();
}

/**
 * Clear Reflexion memory
 */
export async function clearReflexionMemory(): Promise<void> {
  await fs.rm(REFLEXION_MEMORY_FILE, { force: true });
  console.log(chalk.yellow('[Reflexion] Memory cleared'));
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Singleton instance of SelfReflectionEngine
 */
export const selfReflection = new SelfReflectionEngine();

// ============================================================================
// Exports
// ============================================================================

export { reflexionMemory, selfEvaluate, learnFromFailure, findBestCheckpoint };

export default {
  selfReflect,
  reflexionLoop,
  learnFromFailure,
  selfEvaluate,
  getReflexionStats,
  clearReflexionMemory,
  reflexionMemory,
  selfReflection,
  SelfReflectionEngine,
};

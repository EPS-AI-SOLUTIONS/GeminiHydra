/**
 * ChainOfThought - Feature #1 (Enhanced)
 * Advanced Chain-of-Thought reasoning with:
 * - Automatic "Let's think step by step" for complex tasks
 * - Meta-cognitive prompting - agent evaluates quality of own steps
 * - Self-consistency - generate 3 CoT paths and select best
 * - Adaptive CoT depth - adjust number of steps to complexity
 *
 * @author GeminiHydra Team
 * @version 2.0.0
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import { GEMINI_MODELS } from '../../config/models.config.js';
import { geminiSemaphore } from '../TrafficControl.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const INTELLIGENCE_MODEL = GEMINI_MODELS.FLASH;

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface ChainOfThoughtResult {
  steps: string[];
  finalAnswer: string;
  reasoning: string;
}

export interface AdvancedCoTResult extends ChainOfThoughtResult {
  /** Quality score from meta-cognitive evaluation (0-100) */
  qualityScore: number;
  /** Meta-cognitive assessment of reasoning quality */
  metaCognitiveAssessment: string;
  /** Confidence level in the answer */
  confidence: 'low' | 'medium' | 'high';
  /** Number of reasoning iterations performed */
  iterations: number;
  /** Detected complexity level */
  detectedComplexity: ComplexityLevel;
}

export interface SelfConsistentCoTResult extends AdvancedCoTResult {
  /** All generated reasoning paths */
  allPaths: ChainOfThoughtResult[];
  /** Votes for each unique answer */
  answerVotes: Map<string, number>;
  /** Agreement score between paths (0-1) */
  consistencyScore: number;
  /** Which path was selected as best */
  selectedPathIndex: number;
}

export type ComplexityLevel = 'trivial' | 'low' | 'medium' | 'high' | 'extreme';

export interface CoTOptions {
  /** Temperature for generation (default: 0.25 for precision) */
  temperature?: number;
  /** Maximum output tokens */
  maxOutputTokens?: number;
  /** Enable automatic complexity detection */
  autoDetectComplexity?: boolean;
  /** Force specific complexity level */
  forceComplexity?: ComplexityLevel;
  /** Enable meta-cognitive evaluation */
  enableMetaCognition?: boolean;
  /** Number of paths for self-consistency (default: 3) */
  selfConsistencyPaths?: number;
  /** Language for responses */
  language?: 'pl' | 'en';
  /** Custom step-by-step trigger phrase */
  stepByStepTrigger?: string;
}

// ============================================================================
// COMPLEXITY DETECTION
// ============================================================================

/**
 * Complexity indicators with weights for automatic detection
 */
const COMPLEXITY_INDICATORS = {
  extreme: {
    keywords: [
      'zaimplementuj od podstaw',
      'zaprojektuj system',
      'architektura mikroserwisow',
      'implement from scratch',
      'design system',
      'microservices architecture',
      'pelna refaktoryzacja',
      'full refactoring',
      'enterprise',
      'distributed system',
    ],
    weight: 5,
  },
  high: {
    keywords: [
      'zaimplementuj',
      'zaprojektuj',
      'zrefaktoryzuj',
      'zoptymalizuj',
      'zintegruj',
      'implement',
      'design',
      'refactor',
      'optimize',
      'integrate',
      'migrate',
      'zlozony',
      'complex',
      'comprehensive',
      'wieloetapowy',
      'multi-step',
    ],
    weight: 4,
  },
  medium: {
    keywords: [
      'napraw',
      'popraw',
      'dodaj',
      'rozszerz',
      'zaktualizuj',
      'przeanalizuj',
      'fix',
      'improve',
      'add',
      'extend',
      'update',
      'analyze',
      'review',
      'stworz',
      'create',
      'napisz',
      'write',
      'debug',
    ],
    weight: 2,
  },
  low: {
    keywords: [
      'sprawdz',
      'check',
      'list',
      'wylistuj',
      'pokaz',
      'show',
      'find',
      'znajdz',
      'explain',
      'wyjasni',
      'describe',
      'opisz',
    ],
    weight: 1,
  },
};

/**
 * Advanced complexity detection using multiple heuristics
 */
export function detectComplexity(task: string): ComplexityLevel {
  const lowercaseTask = task.toLowerCase();
  const words = task.split(/\s+/);
  const wordCount = words.length;

  // Score accumulator
  let complexityScore = 0;

  // 1. Keyword analysis
  for (const [_level, config] of Object.entries(COMPLEXITY_INDICATORS)) {
    const matchCount = config.keywords.filter((kw) => lowercaseTask.includes(kw)).length;
    complexityScore += matchCount * config.weight;
  }

  // 2. Length heuristics
  if (wordCount > 100) complexityScore += 4;
  else if (wordCount > 50) complexityScore += 2;
  else if (wordCount > 25) complexityScore += 1;

  // 3. Multiple requirements detection
  const commaCount = (task.match(/,/g) || []).length;
  const conjunctionCount = (task.match(/\bi\b|\boraz\b|\band\b|\balso\b/gi) || []).length;
  const numberedItems = (task.match(/\d+[.)]/g) || []).length;

  if (numberedItems >= 5) complexityScore += 3;
  else if (numberedItems >= 3) complexityScore += 2;

  if (commaCount >= 4 || conjunctionCount >= 3) complexityScore += 2;

  // 4. Technical depth indicators
  const technicalTerms = [
    'api',
    'database',
    'sql',
    'typescript',
    'javascript',
    'python',
    'async',
    'await',
    'promise',
    'callback',
    'regex',
    'algorithm',
    'performance',
    'security',
    'authentication',
    'encryption',
  ];
  const techTermCount = technicalTerms.filter((t) => lowercaseTask.includes(t)).length;
  complexityScore += Math.min(techTermCount, 3);

  // 5. Question complexity
  const questionWords = (
    task.match(/\b(jak|dlaczego|kiedy|gdzie|how|why|when|where|what)\b/gi) || []
  ).length;
  if (questionWords >= 3) complexityScore += 2;

  // Map score to complexity level
  if (complexityScore >= 12) return 'extreme';
  if (complexityScore >= 8) return 'high';
  if (complexityScore >= 4) return 'medium';
  if (complexityScore >= 2) return 'low';
  return 'trivial';
}

/**
 * Get recommended number of reasoning steps based on complexity
 */
export function getRecommendedSteps(complexity: ComplexityLevel): number {
  const stepMap: Record<ComplexityLevel, number> = {
    trivial: 1,
    low: 2,
    medium: 3,
    high: 5,
    extreme: 7,
  };
  return stepMap[complexity];
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

/**
 * Build the "Let's think step by step" prompt based on complexity
 */
function buildStepByStepPrompt(
  task: string,
  complexity: ComplexityLevel,
  options: CoTOptions,
): string {
  const lang = options.language || 'pl';
  const trigger =
    options.stepByStepTrigger ||
    (lang === 'pl' ? 'Przemyslmy to krok po kroku.' : "Let's think step by step.");

  const recommendedSteps = getRecommendedSteps(complexity);

  const templates: Record<ComplexityLevel, Record<'pl' | 'en', string>> = {
    trivial: {
      pl: `ZADANIE: ${task}\n\nOdpowiedz bezposrednio i zwiezle.`,
      en: `TASK: ${task}\n\nRespond directly and concisely.`,
    },
    low: {
      pl: `${trigger}

ZADANIE: ${task}

STRUKTURA ODPOWIEDZI:
1. Zrozumienie: [co dokladnie trzeba zrobic]
2. Rozwiazanie: [konkretna odpowiedz/wynik]

Odpowiedz PO POLSKU.`,
      en: `${trigger}

TASK: ${task}

RESPONSE STRUCTURE:
1. Understanding: [what exactly needs to be done]
2. Solution: [concrete answer/result]`,
    },
    medium: {
      pl: `${trigger}

ZADANIE: ${task}

STRUKTURA ODPOWIEDZI (uzyj dokladnie ${recommendedSteps} krokow):
1. ANALIZA: Zidentyfikuj glowne elementy zadania
2. PLAN: Okresl strategie rozwiazania
3. WYKONANIE: Zaimplementuj rozwiazanie

Na koncu podaj FINALNY WYNIK.

Odpowiedz PO POLSKU.`,
      en: `${trigger}

TASK: ${task}

RESPONSE STRUCTURE (use exactly ${recommendedSteps} steps):
1. ANALYSIS: Identify main elements of the task
2. PLAN: Define solution strategy
3. EXECUTION: Implement the solution

Provide FINAL RESULT at the end.`,
    },
    high: {
      pl: `${trigger}

To jest zlozone zadanie wymagajace systematycznego podejscia.

ZADANIE: ${task}

WYMAGANA STRUKTURA ODPOWIEDZI (${recommendedSteps} krokow):

**Krok 1: DEKOMPOZYCJA PROBLEMU**
[Rozloz zadanie na mniejsze, zarzadzalne czesci]

**Krok 2: ANALIZA WYMAGAN**
[Zidentyfikuj wszystkie wymagania, ograniczenia i zaleznosci]

**Krok 3: PROJEKTOWANIE ROZWIAZANIA**
[Opracuj strategie i architekture rozwiazania]

**Krok 4: IMPLEMENTACJA**
[Wykonaj konkretne dzialania / napisz kod / stworz rozwiazanie]

**Krok 5: WERYFIKACJA I OPTYMALIZACJA**
[Sprawdz poprawnosc, kompletnosc i mozliwosci usprawnienia]

**FINALNY WYNIK:**
[Kompletne, gotowe do uzycia rozwiazanie]

WAZNE: Kazdy krok musi zawierac KONKRETNE tresci. Odpowiedz PO POLSKU.`,
      en: `${trigger}

This is a complex task requiring a systematic approach.

TASK: ${task}

REQUIRED RESPONSE STRUCTURE (${recommendedSteps} steps):

**Step 1: PROBLEM DECOMPOSITION**
[Break down the task into smaller, manageable parts]

**Step 2: REQUIREMENTS ANALYSIS**
[Identify all requirements, constraints, and dependencies]

**Step 3: SOLUTION DESIGN**
[Develop strategy and architecture for the solution]

**Step 4: IMPLEMENTATION**
[Execute specific actions / write code / create solution]

**Step 5: VERIFICATION AND OPTIMIZATION**
[Check correctness, completeness, and improvement opportunities]

**FINAL RESULT:**
[Complete, ready-to-use solution]

IMPORTANT: Each step must contain CONCRETE content.`,
    },
    extreme: {
      pl: `${trigger}

To jest wysoce zlozone zadanie wymagajace rozbudowanej analizy i systematycznego podejscia.

ZADANIE: ${task}

WYMAGANA STRUKTURA ODPOWIEDZI (${recommendedSteps} krokow):

**Krok 1: ANALIZA KONTEKSTU**
[Zrozum szerszy kontekst i cel zadania]

**Krok 2: DEKOMPOZYCJA PROBLEMU**
[Rozloz na komponenty i zidentyfikuj zaleznosci]

**Krok 3: ANALIZA WYMAGAN**
[Funkcjonalne, niefunkcjonalne, ograniczenia]

**Krok 4: BADANIE ALTERNATYW**
[Rozważ różne podejscia i ich tradeoffs]

**Krok 5: PROJEKTOWANIE ARCHITEKTURY**
[Szczegolowy plan rozwiazania z uzasadnieniem]

**Krok 6: IMPLEMENTACJA SZCZEGOLOWA**
[Konkretny kod/rozwiazanie z komentarzami]

**Krok 7: WALIDACJA I EDGE CASES**
[Testowanie, obsluga bledow, przypadki brzegowe]

**FINALNY WYNIK:**
[Kompletne, produkcyjne rozwiazanie]

**PODSUMOWANIE DECYZJI:**
[Kluczowe wybory i ich uzasadnienie]

KRYTYCZNE: Kazdy krok musi byc szczegolowy i merytoryczny. Odpowiedz PO POLSKU.`,
      en: `${trigger}

This is a highly complex task requiring extensive analysis and systematic approach.

TASK: ${task}

REQUIRED RESPONSE STRUCTURE (${recommendedSteps} steps):

**Step 1: CONTEXT ANALYSIS**
[Understand broader context and goal]

**Step 2: PROBLEM DECOMPOSITION**
[Break into components and identify dependencies]

**Step 3: REQUIREMENTS ANALYSIS**
[Functional, non-functional, constraints]

**Step 4: ALTERNATIVES EXPLORATION**
[Consider different approaches and their tradeoffs]

**Step 5: ARCHITECTURE DESIGN**
[Detailed solution plan with justification]

**Step 6: DETAILED IMPLEMENTATION**
[Concrete code/solution with comments]

**Step 7: VALIDATION AND EDGE CASES**
[Testing, error handling, edge cases]

**FINAL RESULT:**
[Complete, production-ready solution]

**DECISION SUMMARY:**
[Key choices and their justification]

CRITICAL: Each step must be detailed and substantive.`,
    },
  };

  return templates[complexity][lang];
}

/**
 * Build meta-cognitive evaluation prompt
 */
function buildMetaCognitivePrompt(
  originalTask: string,
  reasoning: ChainOfThoughtResult,
  language: 'pl' | 'en',
): string {
  const templates = {
    pl: `ZADANIE META-KOGNITYWNE: Ocen jakosc ponizszego rozumowania.

ORYGINALNE ZADANIE:
${originalTask}

PRZEPROWADZONE ROZUMOWANIE:
Kroki:
${reasoning.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Uzasadnienie: ${reasoning.reasoning}
Odpowiedz: ${reasoning.finalAnswer}

OCEN NASTEPUJACE ASPEKTY (skala 0-100):

1. KOMPLETNOSC: Czy wszystkie aspekty zadania zostaly uwzglednione?
2. LOGICZNOSC: Czy kroki sa logicznie powiazane i spójne?
3. POPRAWNOSC: Czy rozumowanie i wnioski sa poprawne?
4. JASNOSC: Czy rozumowanie jest jasne i zrozumiale?
5. PRAKTYCZNOSC: Czy finalna odpowiedz jest praktyczna i uzyteczna?

FORMAT ODPOWIEDZI (tylko JSON):
{
  "scores": {
    "completeness": <0-100>,
    "logic": <0-100>,
    "correctness": <0-100>,
    "clarity": <0-100>,
    "practicality": <0-100>
  },
  "overallScore": <0-100>,
  "confidence": "<low|medium|high>",
  "assessment": "<szczegolowa ocena w 2-3 zdaniach>",
  "improvements": ["<sugestia 1>", "<sugestia 2>"]
}`,
    en: `META-COGNITIVE TASK: Evaluate the quality of the reasoning below.

ORIGINAL TASK:
${originalTask}

CONDUCTED REASONING:
Steps:
${reasoning.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Justification: ${reasoning.reasoning}
Answer: ${reasoning.finalAnswer}

EVALUATE THE FOLLOWING ASPECTS (scale 0-100):

1. COMPLETENESS: Were all aspects of the task addressed?
2. LOGIC: Are the steps logically connected and coherent?
3. CORRECTNESS: Is the reasoning and conclusions correct?
4. CLARITY: Is the reasoning clear and understandable?
5. PRACTICALITY: Is the final answer practical and useful?

RESPONSE FORMAT (JSON only):
{
  "scores": {
    "completeness": <0-100>,
    "logic": <0-100>,
    "correctness": <0-100>,
    "clarity": <0-100>,
    "practicality": <0-100>
  },
  "overallScore": <0-100>,
  "confidence": "<low|medium|high>",
  "assessment": "<detailed assessment in 2-3 sentences>",
  "improvements": ["<suggestion 1>", "<suggestion 2>"]
}`,
  };

  return templates[language];
}

/**
 * Build consistency voting prompt
 */
function buildConsistencyVotingPrompt(
  task: string,
  paths: ChainOfThoughtResult[],
  language: 'pl' | 'en',
): string {
  const pathsText = paths
    .map(
      (p, i) => `
--- SCIEZKA ${i + 1} ---
Kroki: ${p.steps.join(' -> ')}
Odpowiedz: ${p.finalAnswer}
---`,
    )
    .join('\n');

  const templates = {
    pl: `ZADANIE WYBORU NAJLEPSZEJ SCIEZKI ROZUMOWANIA

ORYGINALNE ZADANIE:
${task}

WYGENEROWANE SCIEZKI ROZUMOWANIA:
${pathsText}

Przeanalizuj wszystkie sciezki i wybierz NAJLEPSZA.

FORMAT ODPOWIEDZI (tylko JSON):
{
  "selectedPath": <numer sciezki 1-${paths.length}>,
  "consistencyScore": <0-1, jak bardzo sciezki sa zgodne>,
  "reasoning": "<dlaczego ta sciezka jest najlepsza>",
  "commonElements": ["<wspolne elementy miedzy sciezkami>"],
  "divergencePoints": ["<gdzie sciezki sie roznia>"]
}`,
    en: `TASK: SELECT THE BEST REASONING PATH

ORIGINAL TASK:
${task}

GENERATED REASONING PATHS:
${pathsText}

Analyze all paths and select the BEST one.

RESPONSE FORMAT (JSON only):
{
  "selectedPath": <path number 1-${paths.length}>,
  "consistencyScore": <0-1, how consistent the paths are>,
  "reasoning": "<why this path is the best>",
  "commonElements": ["<common elements between paths>"],
  "divergencePoints": ["<where paths diverge>"]
}`,
  };

  return templates[language];
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Execute basic Chain-of-Thought reasoning (backward compatible)
 */
export async function chainOfThought(
  task: string,
  context: string = '',
): Promise<ChainOfThoughtResult> {
  console.log(chalk.magenta('[CoT] Activating Chain-of-Thought reasoning...'));

  const prompt = `Jestes ekspertem w rozwiazywaniu zlozonych problemow. Uzyj metody CHAIN-OF-THOUGHT.

ZADANIE: ${task}
${context ? `KONTEKST: ${context}` : ''}

INSTRUKCJE:
1. Rozbij problem na KONKRETNE KROKI myslowe
2. Dla kazdego kroku wyjasnij swoje rozumowanie
3. Na koncu podaj FINALNA ODPOWIEDZ

FORMAT ODPOWIEDZI (JSON):
{
  "steps": [
    "Krok 1: [opis kroku i rozumowanie]",
    "Krok 2: [opis kroku i rozumowanie]",
    "..."
  ],
  "reasoning": "Podsumowanie calego procesu myslowego",
  "finalAnswer": "Konkretna odpowiedz/rozwiazanie"
}

Odpowiadaj PO POLSKU. Zwroc TYLKO JSON.`;

  try {
    const response = await geminiSemaphore.withPermit(async () => {
      const model = genAI.getGenerativeModel({
        model: INTELLIGENCE_MODEL,
        generationConfig: { temperature: 1.0, maxOutputTokens: 4096 }, // Temperature locked at 1.0 for Gemini - do not change
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    const jsonStr = response
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(jsonStr) as ChainOfThoughtResult;

    console.log(chalk.green(`[CoT] Completed with ${parsed.steps.length} reasoning steps`));
    return parsed;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[CoT] Failed: ${msg}`));
    return {
      steps: ['Bezposrednia analiza'],
      reasoning: 'Chain-of-Thought nie powiodlo sie, uzyto bezposredniej odpowiedzi',
      finalAnswer: task,
    };
  }
}

/**
 * Execute a single CoT pass with given options
 */
async function executeCoTPass(
  task: string,
  context: string,
  complexity: ComplexityLevel,
  options: CoTOptions,
  passIndex: number = 0,
): Promise<ChainOfThoughtResult> {
  const temperature = options.temperature ?? 0.25;
  // Slightly vary temperature for different passes to get diverse results
  const _adjustedTemp = Math.min(0.4, temperature + passIndex * 0.05);

  const prompt = buildStepByStepPrompt(task, complexity, options);
  const fullPrompt = context ? `${prompt}\n\nKONTEKST:\n${context}` : prompt;

  const jsonInstructions = `

WAZNE: Odpowiedz w formacie JSON:
{
  "steps": ["Krok 1: ...", "Krok 2: ...", ...],
  "reasoning": "Podsumowanie rozumowania",
  "finalAnswer": "Finalna odpowiedz/rozwiazanie"
}

Zwroc TYLKO JSON, bez dodatkowego tekstu.`;

  try {
    const response = await geminiSemaphore.withPermit(async () => {
      const model = genAI.getGenerativeModel({
        model: INTELLIGENCE_MODEL,
        generationConfig: {
          temperature: 1.0, // Temperature locked at 1.0 for Gemini - do not change
          maxOutputTokens: options.maxOutputTokens ?? 8192,
        },
      });
      const result = await model.generateContent(fullPrompt + jsonInstructions);
      return result.response.text();
    });

    const jsonStr = response
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(jsonStr) as ChainOfThoughtResult;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[CoT] Pass ${passIndex + 1} failed: ${msg}`));
    return {
      steps: [`Bezposrednia analiza (pass ${passIndex + 1})`],
      reasoning: `Proba ${passIndex + 1} nie powiodla sie`,
      finalAnswer: task,
    };
  }
}

/**
 * Execute meta-cognitive evaluation of reasoning
 */
async function executeMetaCognition(
  task: string,
  reasoning: ChainOfThoughtResult,
  options: CoTOptions,
): Promise<{
  qualityScore: number;
  assessment: string;
  confidence: 'low' | 'medium' | 'high';
  improvements: string[];
}> {
  const language = options.language ?? 'pl';
  const prompt = buildMetaCognitivePrompt(task, reasoning, language);

  try {
    const response = await geminiSemaphore.withPermit(async () => {
      const model = genAI.getGenerativeModel({
        model: INTELLIGENCE_MODEL,
        generationConfig: { temperature: 1.0, maxOutputTokens: 2048 }, // Temperature locked at 1.0 for Gemini - do not change
      });
      const result = await model.generateContent(prompt);
      return result.response.text();
    });

    const jsonStr = response
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(jsonStr);

    return {
      qualityScore: parsed.overallScore ?? 70,
      assessment: parsed.assessment ?? 'Brak oceny',
      confidence: parsed.confidence ?? 'medium',
      improvements: parsed.improvements ?? [],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[CoT Meta] Evaluation failed: ${msg}`));
    return {
      qualityScore: 50,
      assessment: 'Nie udalo sie przeprowadzic oceny meta-kognitywnej',
      confidence: 'low',
      improvements: [],
    };
  }
}

/**
 * Advanced Chain-of-Thought with automatic complexity detection and meta-cognition
 */
export async function advancedChainOfThought(
  task: string,
  context: string = '',
  options: CoTOptions = {},
): Promise<AdvancedCoTResult> {
  console.log(chalk.magenta('[CoT Advanced] Initiating advanced reasoning...'));

  // 1. Detect or use forced complexity
  const complexity =
    options.forceComplexity ??
    (options.autoDetectComplexity !== false ? detectComplexity(task) : 'medium');
  console.log(chalk.cyan(`[CoT Advanced] Detected complexity: ${complexity}`));

  // 2. Skip CoT for trivial tasks
  if (complexity === 'trivial' && !options.forceComplexity) {
    console.log(chalk.gray('[CoT Advanced] Trivial task - using direct response'));
    const directResult: AdvancedCoTResult = {
      steps: ['Bezposrednia odpowiedz'],
      finalAnswer: task,
      reasoning: 'Zadanie jest proste - odpowiedz bezposrednia',
      qualityScore: 80,
      metaCognitiveAssessment: 'Proste zadanie nie wymaga zlozonego rozumowania',
      confidence: 'high',
      iterations: 1,
      detectedComplexity: complexity,
    };
    return directResult;
  }

  // 3. Execute primary CoT pass
  const primaryResult = await executeCoTPass(task, context, complexity, options);
  console.log(chalk.green(`[CoT Advanced] Primary pass: ${primaryResult.steps.length} steps`));

  // 4. Optional meta-cognitive evaluation
  let metaResult: {
    qualityScore: number;
    assessment: string;
    confidence: 'low' | 'medium' | 'high';
    improvements: string[];
  } = {
    qualityScore: 70,
    assessment: 'Brak oceny meta-kognitywnej',
    confidence: 'medium',
    improvements: [],
  };

  if (options.enableMetaCognition !== false && complexity !== 'low') {
    console.log(chalk.cyan('[CoT Advanced] Running meta-cognitive evaluation...'));
    metaResult = await executeMetaCognition(task, primaryResult, options);
    console.log(chalk.green(`[CoT Advanced] Quality score: ${metaResult.qualityScore}/100`));

    // 5. If quality is low, retry with improvements hint
    if (metaResult.qualityScore < 60 && metaResult.improvements.length > 0) {
      console.log(chalk.yellow('[CoT Advanced] Quality low - attempting improvement...'));

      const improvedContext = `${context}\n\nPOPRAW NASTEPUJACE ASPEKTY:\n${metaResult.improvements.map((i) => `- ${i}`).join('\n')}`;
      const improvedResult = await executeCoTPass(task, improvedContext, complexity, options, 1);

      // Re-evaluate
      const improvedMeta = await executeMetaCognition(task, improvedResult, options);

      if (improvedMeta.qualityScore > metaResult.qualityScore) {
        console.log(
          chalk.green(
            `[CoT Advanced] Improvement successful: ${metaResult.qualityScore} -> ${improvedMeta.qualityScore}`,
          ),
        );
        return {
          ...improvedResult,
          qualityScore: improvedMeta.qualityScore,
          metaCognitiveAssessment: improvedMeta.assessment,
          confidence: improvedMeta.confidence,
          iterations: 2,
          detectedComplexity: complexity,
        };
      }
    }
  }

  return {
    ...primaryResult,
    qualityScore: metaResult.qualityScore,
    metaCognitiveAssessment: metaResult.assessment,
    confidence: metaResult.confidence,
    iterations: 1,
    detectedComplexity: complexity,
  };
}

/**
 * Self-Consistent Chain-of-Thought
 * Generates multiple reasoning paths and selects the best/most consistent answer
 */
export async function selfConsistentCoT(
  task: string,
  context: string = '',
  options: CoTOptions = {},
): Promise<SelfConsistentCoTResult> {
  const pathCount = options.selfConsistencyPaths ?? 3;
  console.log(chalk.magenta(`[CoT Self-Consistent] Generating ${pathCount} reasoning paths...`));

  // 1. Detect complexity
  const complexity =
    options.forceComplexity ??
    (options.autoDetectComplexity !== false ? detectComplexity(task) : 'medium');
  console.log(chalk.cyan(`[CoT Self-Consistent] Complexity: ${complexity}`));

  // 2. Generate multiple paths in parallel
  const pathPromises: Promise<ChainOfThoughtResult>[] = [];
  for (let i = 0; i < pathCount; i++) {
    pathPromises.push(executeCoTPass(task, context, complexity, options, i));
  }

  const allPaths = await Promise.all(pathPromises);
  console.log(chalk.green(`[CoT Self-Consistent] Generated ${allPaths.length} paths`));

  // 3. Vote on answers
  const answerVotes = new Map<string, number>();
  for (const path of allPaths) {
    const answer = path.finalAnswer.trim().toLowerCase().substring(0, 200);
    answerVotes.set(answer, (answerVotes.get(answer) || 0) + 1);
  }

  // 4. Use LLM to select best path
  let selectedPathIndex = 0;
  let consistencyScore = 0;

  try {
    const votingPrompt = buildConsistencyVotingPrompt(task, allPaths, options.language ?? 'pl');

    const votingResponse = await geminiSemaphore.withPermit(async () => {
      const model = genAI.getGenerativeModel({
        model: INTELLIGENCE_MODEL,
        generationConfig: { temperature: 1.0, maxOutputTokens: 2048 }, // Temperature locked at 1.0 for Gemini - do not change
      });
      const result = await model.generateContent(votingPrompt);
      return result.response.text();
    });

    const jsonStr = votingResponse
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const votingResult = JSON.parse(jsonStr);

    selectedPathIndex = Math.max(0, Math.min(pathCount - 1, (votingResult.selectedPath || 1) - 1));
    consistencyScore = votingResult.consistencyScore ?? 0.5;

    console.log(
      chalk.green(
        `[CoT Self-Consistent] Selected path ${selectedPathIndex + 1}, consistency: ${(consistencyScore * 100).toFixed(0)}%`,
      ),
    );
  } catch (_error: unknown) {
    console.log(chalk.yellow(`[CoT Self-Consistent] Voting failed, using most common answer`));

    // Fallback: select path with most common answer
    let maxVotes = 0;
    for (const [answer, votes] of answerVotes.entries()) {
      if (votes > maxVotes) {
        maxVotes = votes;
        for (let i = 0; i < allPaths.length; i++) {
          if (allPaths[i].finalAnswer.trim().toLowerCase().substring(0, 200) === answer) {
            selectedPathIndex = i;
            break;
          }
        }
      }
    }
    consistencyScore = maxVotes / pathCount;
  }

  const selectedPath = allPaths[selectedPathIndex];

  // 5. Meta-cognitive evaluation of selected path
  let metaResult = {
    qualityScore: 70,
    assessment: 'Sciezka wybrana przez glosowanie spojna',
    confidence: 'medium' as 'low' | 'medium' | 'high',
  };

  if (options.enableMetaCognition !== false) {
    const meta = await executeMetaCognition(task, selectedPath, options);
    metaResult = {
      qualityScore: meta.qualityScore,
      assessment: meta.assessment,
      confidence: meta.confidence,
    };
  }

  // Boost confidence if paths are consistent
  let finalConfidence: 'low' | 'medium' | 'high' = metaResult.confidence;
  if (consistencyScore > 0.8) {
    finalConfidence = 'high';
  } else if (consistencyScore < 0.4 && finalConfidence === 'high') {
    finalConfidence = 'medium';
  }

  return {
    ...selectedPath,
    qualityScore: metaResult.qualityScore,
    metaCognitiveAssessment: metaResult.assessment,
    confidence: finalConfidence,
    iterations: pathCount,
    detectedComplexity: complexity,
    allPaths,
    answerVotes,
    consistencyScore,
    selectedPathIndex,
  };
}

/**
 * Adaptive Chain-of-Thought
 * Automatically adjusts CoT depth and strategy based on task complexity
 */
export async function adaptiveCoT(
  task: string,
  context: string = '',
  options: CoTOptions = {},
): Promise<AdvancedCoTResult | SelfConsistentCoTResult> {
  console.log(chalk.magenta('[CoT Adaptive] Starting adaptive reasoning...'));

  // Detect complexity
  const complexity = options.forceComplexity ?? detectComplexity(task);
  console.log(chalk.cyan(`[CoT Adaptive] Detected complexity: ${complexity}`));

  // Adaptive strategy selection
  switch (complexity) {
    case 'trivial':
      // Direct response, no CoT needed
      console.log(chalk.gray('[CoT Adaptive] Trivial -> Direct response'));
      return advancedChainOfThought(task, context, {
        ...options,
        forceComplexity: 'trivial',
        enableMetaCognition: false,
      });

    case 'low':
      // Simple CoT without meta-cognition
      console.log(chalk.gray('[CoT Adaptive] Low -> Simple CoT'));
      return advancedChainOfThought(task, context, {
        ...options,
        forceComplexity: 'low',
        enableMetaCognition: false,
      });

    case 'medium':
      // Standard CoT with meta-cognition
      console.log(chalk.gray('[CoT Adaptive] Medium -> Standard CoT + Meta'));
      return advancedChainOfThought(task, context, {
        ...options,
        forceComplexity: 'medium',
        enableMetaCognition: true,
      });

    case 'high':
      // Self-consistent CoT with 3 paths
      console.log(chalk.gray('[CoT Adaptive] High -> Self-Consistent (3 paths)'));
      return selfConsistentCoT(task, context, {
        ...options,
        forceComplexity: 'high',
        selfConsistencyPaths: 3,
        enableMetaCognition: true,
      });

    case 'extreme':
      // Self-consistent CoT with 5 paths for maximum reliability
      console.log(chalk.gray('[CoT Adaptive] Extreme -> Self-Consistent (5 paths)'));
      return selfConsistentCoT(task, context, {
        ...options,
        forceComplexity: 'extreme',
        selfConsistencyPaths: 5,
        enableMetaCognition: true,
      });

    default:
      return advancedChainOfThought(task, context, options);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format CoT result for display
 */
export function formatCoTResult(result: ChainOfThoughtResult | AdvancedCoTResult): string {
  const lines: string[] = [];

  lines.push(chalk.bold('=== Chain-of-Thought Result ==='));
  lines.push('');

  lines.push(chalk.cyan('Steps:'));
  result.steps.forEach((step, i) => {
    lines.push(`  ${i + 1}. ${step}`);
  });
  lines.push('');

  lines.push(chalk.cyan('Reasoning:'));
  lines.push(`  ${result.reasoning}`);
  lines.push('');

  lines.push(chalk.green('Final Answer:'));
  lines.push(`  ${result.finalAnswer}`);

  // Advanced result extras
  if ('qualityScore' in result) {
    lines.push('');
    lines.push(chalk.yellow('--- Meta-Cognitive Assessment ---'));
    lines.push(`Quality Score: ${result.qualityScore}/100`);
    lines.push(`Confidence: ${result.confidence}`);
    lines.push(`Complexity: ${result.detectedComplexity}`);
    lines.push(`Iterations: ${result.iterations}`);
    lines.push(`Assessment: ${result.metaCognitiveAssessment}`);
  }

  // Self-consistent extras
  if ('consistencyScore' in result) {
    const scResult = result as SelfConsistentCoTResult;
    lines.push(`Consistency Score: ${(scResult.consistencyScore * 100).toFixed(0)}%`);
    lines.push(`Selected Path: ${scResult.selectedPathIndex + 1}/${scResult.allPaths.length}`);
  }

  return lines.join('\n');
}

/**
 * Check if a task should use CoT based on heuristics
 */
export function shouldUseCoT(task: string): boolean {
  const complexity = detectComplexity(task);
  return complexity !== 'trivial';
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Core functions (backward compatible)
  chainOfThought,

  // Advanced functions
  advancedChainOfThought,
  selfConsistentCoT,
  adaptiveCoT,

  // Utility functions
  detectComplexity,
  getRecommendedSteps,
  formatCoTResult,
  shouldUseCoT,

  // Types re-exported for convenience
  // (types are exported via 'export interface' above)
};

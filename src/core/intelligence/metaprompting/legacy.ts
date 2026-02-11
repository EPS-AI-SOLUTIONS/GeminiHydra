/**
 * Legacy API for MetaPrompting
 *
 * Backward-compatible functions for older code that used the legacy API:
 * - classifyTaskType
 * - generateMetaPrompt
 * - executeWithMetaPrompt
 * - getPromptTemplate
 *
 * @module core/intelligence/metaprompting/legacy
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODELS } from '../../../config/models.config.js';
import { geminiSemaphore } from '../../TrafficControl.js';
import { MetaPrompter } from './MetaPrompter.js';
import type { MetaPromptResult, TaskType } from './types.js';

// Initialize Gemini client for legacy API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const INTELLIGENCE_MODEL = GEMINI_MODELS.FLASH;

// Legacy metaPrompter instance used by generateMetaPrompt
const legacyMetaPrompter = new MetaPrompter({
  language: 'pl',
  temperature: 0.4,
});

/**
 * Task type patterns for classification
 */
const TASK_PATTERNS: Record<TaskType, RegExp[]> = {
  analysis: [/analiz/i, /zbadaj/i, /ocen/i, /porownaj/i, /wykryj/i],
  creative: [/napisz/i, /stworz/i, /wymysl/i, /zaprojektuj/i, /opowiedz/i],
  coding: [/kod/i, /funkcj/i, /implement/i, /napraw/i, /refaktor/i, /typescript/i, /javascript/i],
  research: [/znajdz/i, /wyszukaj/i, /sprawdz/i, /zbierz/i, /zgromadz/i],
  planning: [/zaplanuj/i, /rozloz/i, /harmonogram/i, /strategia/i, /krok/i],
  debugging: [/debug/i, /blad/i, /error/i, /napraw/i, /dlaczego nie/i],
  explanation: [/wyjasn/i, /opowiedz/i, /jak dziala/i, /co to/i, /dlaczego/i],
  transformation: [/przeksztalc/i, /konwertuj/i, /zmien/i, /przetlumacz/i, /formatuj/i],
  evaluation: [/ocen/i, /zrecenzuj/i, /sprawdz jakosc/i, /czy dobrze/i],
  unknown: [],
};

/**
 * Technique recommendations per task type
 */
const TECHNIQUE_MAP: Record<TaskType, string[]> = {
  analysis: ['Chain-of-Thought', 'Multi-Perspective', 'Structured Output'],
  creative: ['Few-Shot Examples', 'Role-Playing', 'Brainstorming'],
  coding: ['Step-by-Step', 'Code Review', 'Test-Driven'],
  research: ['Query Decomposition', 'Source Verification', 'Summarization'],
  planning: ['Tree-of-Thoughts', 'Dependency Analysis', 'Risk Assessment'],
  debugging: ['Root Cause Analysis', 'Hypothesis Testing', 'Trace Analysis'],
  explanation: ['Analogies', 'Progressive Complexity', 'Visual Representation'],
  transformation: ['Template-Based', 'Rule Application', 'Validation'],
  evaluation: ['Criteria-Based', 'Comparative Analysis', 'Scoring Rubric'],
  unknown: ['Chain-of-Thought', 'Self-Reflection'],
};

/**
 * Classify task type based on content
 */
export function classifyTaskType(task: string): TaskType {
  const taskLower = task.toLowerCase();

  for (const [type, patterns] of Object.entries(TASK_PATTERNS) as [TaskType, RegExp[]][]) {
    if (type === 'unknown') continue;
    for (const pattern of patterns) {
      if (pattern.test(taskLower)) {
        return type;
      }
    }
  }

  return 'unknown';
}

/**
 * Generate optimized prompt using meta-prompting (legacy API)
 */
export async function generateMetaPrompt(
  task: string,
  context: string = '',
): Promise<MetaPromptResult> {
  const taskType = classifyTaskType(task);
  const techniques = TECHNIQUE_MAP[taskType];

  try {
    const result = await legacyMetaPrompter.optimizePrompt(task, context);

    return {
      originalTask: task,
      taskType,
      optimizedPrompt: result.optimizedPrompt,
      suggestedTechniques: techniques,
      expectedOutputFormat: 'text',
      confidence: Math.round(result.expectedGain * 100),
    };
  } catch (_error: unknown) {
    return {
      originalTask: task,
      taskType,
      optimizedPrompt: enhancePromptManually(task, taskType),
      suggestedTechniques: techniques,
      expectedOutputFormat: 'text',
      confidence: 50,
    };
  }
}

/**
 * Manual prompt enhancement fallback
 */
function enhancePromptManually(task: string, taskType: TaskType): string {
  const prefixes: Record<TaskType, string> = {
    analysis:
      'Przeprowadz szczegolowa analize nastepujacego problemu. Przedstaw wnioski w formie punktowej:\n\n',
    creative:
      'Wykorzystaj swoja kreatywnosc do wykonania nastepujacego zadania. Badz oryginalny i innowacyjny:\n\n',
    coding:
      'Napisz czysty, dobrze udokumentowany kod dla nastepujacego zadania. Uwzglednij obsluge bledow:\n\n',
    research: 'Zbierz i zsyntetyzuj informacje na temat:\n\n',
    planning: 'Stworz szczegolowy plan wykonania. Uwzglednij zaleznosci i ryzyka:\n\n',
    debugging: 'Zidentyfikuj przyczyne problemu i zaproponuj rozwiazanie:\n\n',
    explanation: 'Wyjasni w prosty i zrozumialy sposob:\n\n',
    transformation: 'Przeksztalc nastepujaca tresc zgodnie z wymaganiami:\n\n',
    evaluation: 'Ocen ponizsze wedlug jasnych kryteriow:\n\n',
    unknown: 'Wykonaj nastepujace zadanie najlepiej jak potrafisz:\n\n',
  };

  const suffixes: Record<TaskType, string> = {
    analysis: '\n\nFormat: lista wnioskow z uzasadnieniem',
    creative: '\n\nFormat: kreatywna odpowiedz z uzasadnieniem wyborow',
    coding: '\n\nFormat: kod z komentarzami i przykladem uzycia',
    research: '\n\nFormat: podsumowanie z zrodlami',
    planning: '\n\nFormat: numerowana lista krokow z timeline',
    debugging: '\n\nFormat: przyczyna -> rozwiazanie -> zapobieganie',
    explanation: '\n\nFormat: wyjasnienie od prostego do zlozonego',
    transformation: '\n\nFormat: przetworzona tresc',
    evaluation: '\n\nFormat: ocena z punktacja i uzasadnieniem',
    unknown: '',
  };

  return prefixes[taskType] + task + suffixes[taskType];
}

/**
 * Apply meta-prompting and execute (legacy API)
 */
export async function executeWithMetaPrompt(
  task: string,
  context: string = '',
): Promise<{ result: string; metaInfo: MetaPromptResult }> {
  const metaInfo = await generateMetaPrompt(task, context);

  try {
    const response = await geminiSemaphore.withPermit(async () => {
      const model = genAI.getGenerativeModel({
        model: INTELLIGENCE_MODEL,
        generationConfig: { temperature: 1.0, maxOutputTokens: 4096 }, // Temperature locked at 1.0 for Gemini - do not change
      });
      const result = await model.generateContent(metaInfo.optimizedPrompt);
      return result.response.text();
    });

    return {
      result: response.trim(),
      metaInfo,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      result: `Blad wykonania: ${msg}`,
      metaInfo,
    };
  }
}

/**
 * Generate prompt template for specific task type (legacy API)
 */
export function getPromptTemplate(taskType: TaskType): string {
  const templates: Record<TaskType, string> = {
    analysis: `Przeanalizuj {TEMAT} uwzgledniajac:
1. Kontekst i tlo
2. Kluczowe elementy
3. Zaleznosci i powiazania
4. Wnioski i rekomendacje

Format odpowiedzi: strukturalna analiza z punktami`,

    creative: `Stworz {TEMAT} uwzgledniajac:
- Oryginalnosc i innowacyjnosc
- Spojnosc z kontekstem
- Estetyka/jakosc
- Praktycznosc

Badz kreatywny i oryginalny.`,

    coding: `Zaimplementuj {TEMAT}:
1. Analiza wymagan
2. Projekt rozwiazania
3. Implementacja (czysty kod)
4. Testy i walidacja
5. Dokumentacja

Jezyk: {JEZYK}
Format: kod z komentarzami`,

    research: `Zbadaj {TEMAT}:
1. Zbierz informacje
2. Zweryfikuj zrodla
3. Zsyntetyzuj wnioski
4. Przedstaw podsumowanie

Format: raport z odniesieniami`,

    planning: `Zaplanuj {TEMAT}:
1. Cel i zakres
2. Kroki wykonania
3. Zaleznosci
4. Timeline
5. Ryzyka i mitygacja

Format: plan projektowy`,

    debugging: `Zdebuguj {TEMAT}:
1. Opis problemu
2. Reprodukcja
3. Analiza przyczyn
4. Rozwiazanie
5. Zapobieganie

Format: raport debugowania`,

    explanation: `Wyjasn {TEMAT}:
1. Prosta definicja
2. Jak to dziala
3. Przyklady
4. Zastosowania
5. Powiazane koncepty

Format: wyjasnienie progresywne`,

    transformation: `Przeksztalc {TEMAT}:
- Wejscie: {FORMAT_WE}
- Wyjscie: {FORMAT_WY}
- Zasady transformacji

Format: przetworzona tresc`,

    evaluation: `Ocen {TEMAT} wedlug kryteriow:
1. {KRYTERIUM_1}
2. {KRYTERIUM_2}
3. {KRYTERIUM_3}

Skala: 1-10
Format: ocena z uzasadnieniem`,

    unknown: `Wykonaj zadanie: {TEMAT}
Opisz swoje podejscie i przedstaw wynik.`,
  };

  return templates[taskType];
}

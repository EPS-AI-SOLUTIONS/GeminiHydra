/**
 * AnalogicalReasoning - Feature #10
 * Find analogies from past experiences to improve task solving
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import { GEMINI_MODELS } from '../../config/models.config.js';
import { geminiSemaphore } from '../TrafficControl.js';
import { knowledgeGraph } from './KnowledgeGraph.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const INTELLIGENCE_MODEL = GEMINI_MODELS.FLASH;

export interface Analogy {
  sourcePattern: string;
  targetApplication: string;
  similarity: number;
  suggestedApproach: string;
}

/**
 * Find analogies from past experiences
 */
export async function findAnalogies(
  currentTask: string,
  pastExperiences: string[] = [],
): Promise<Analogy[]> {
  console.log(chalk.magenta('[Analogy] Searching for similar patterns...'));

  // Get related knowledge from graph
  const relatedKnowledge = knowledgeGraph.findRelated(currentTask, 5);
  const experiences = [...pastExperiences, ...relatedKnowledge.map((n) => n.content)];

  if (experiences.length === 0) {
    console.log(chalk.gray('[Analogy] No past experiences to compare'));
    return [];
  }

  const prompt = `Znajdź ANALOGIE między obecnym zadaniem a przeszłymi doświadczeniami.

OBECNE ZADANIE: ${currentTask}

PRZESZŁE DOŚWIADCZENIA:
${experiences
  .slice(0, 5)
  .map((e, i) => `${i + 1}. ${e}`)
  .join('\n')}

INSTRUKCJE:
1. Znajdź PODOBIEŃSTWA między zadaniem a doświadczeniami
2. Zaproponuj jak wykorzystać te analogie
3. Oceń siłę podobieństwa (0-100)

FORMAT (JSON):
{
  "analogies": [
    {
      "sourcePattern": "Wzorzec z przeszłości",
      "targetApplication": "Jak zastosować do obecnego zadania",
      "similarity": 75,
      "suggestedApproach": "Sugerowane podejście"
    }
  ]
}

Odpowiadaj PO POLSKU. Zwróć TYLKO JSON.`;

  try {
    const result = await geminiSemaphore.withPermit(async () => {
      const model = genAI.getGenerativeModel({
        model: INTELLIGENCE_MODEL,
        generationConfig: { temperature: 1.0, maxOutputTokens: 1024 }, // Temperature locked at 1.0 for Gemini - do not change
      });
      const res = await model.generateContent(prompt);
      return res.response.text();
    });

    const jsonStr = result
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const parsed = JSON.parse(jsonStr);

    const analogies = (parsed.analogies || []) as Analogy[];
    console.log(chalk.green(`[Analogy] Found ${analogies.length} relevant analogies`));

    return analogies.filter((a) => a.similarity > 50);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[Analogy] Failed: ${msg}`));
    return [];
  }
}

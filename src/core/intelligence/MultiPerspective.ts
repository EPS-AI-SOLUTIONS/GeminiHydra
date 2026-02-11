/**
 * MultiPerspective - Feature #4
 * Multi-perspective analysis (simulated multi-agent)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import { GEMINI_MODELS } from '../../config/models.config.js';
import { geminiSemaphore } from '../TrafficControl.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const INTELLIGENCE_MODEL = GEMINI_MODELS.FLASH;

export interface Perspective {
  viewpoint: string;
  analysis: string;
  recommendation: string;
  confidence: number;
}

export interface MultiPerspectiveResult {
  perspectives: Perspective[];
  consensus: string;
  disagreements: string[];
  finalRecommendation: string;
}

/**
 * Analyze from multiple perspectives (simulated multi-agent)
 */
export async function multiPerspectiveAnalysis(
  task: string,
  perspectives: string[] = ['Optymista', 'Pesymista', 'Pragmatyk'],
): Promise<MultiPerspectiveResult> {
  console.log(
    chalk.magenta(`[MultiPerspective] Analyzing from ${perspectives.length} viewpoints...`),
  );

  const analysisPromises = perspectives.map(async (viewpoint) => {
    const prompt = `Jesteś ekspertem z perspektywą: ${viewpoint.toUpperCase()}

ZADANIE DO ANALIZY: ${task}

Przeanalizuj zadanie Z TWOJEJ PERSPEKTYWY (${viewpoint}).

FORMAT (JSON):
{
  "viewpoint": "${viewpoint}",
  "analysis": "Twoja analiza z perspektywy ${viewpoint}",
  "recommendation": "Twoja rekomendacja",
  "confidence": 0-100
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
      return JSON.parse(jsonStr) as Perspective;
    } catch (_error: unknown) {
      return {
        viewpoint,
        analysis: `Analiza ${viewpoint} nie powiodła się`,
        recommendation: 'Brak rekomendacji',
        confidence: 0,
      };
    }
  });

  const perspectiveResults = await Promise.all(analysisPromises);

  // Synthesize perspectives
  const _recommendations = perspectiveResults.map((p) => p.recommendation);
  const _analyses = perspectiveResults.map((p) => `${p.viewpoint}: ${p.analysis}`);

  // Find consensus and disagreements
  const disagreements: string[] = [];
  if (perspectiveResults.length >= 2) {
    for (let i = 0; i < perspectiveResults.length; i++) {
      for (let j = i + 1; j < perspectiveResults.length; j++) {
        if (Math.abs(perspectiveResults[i].confidence - perspectiveResults[j].confidence) > 30) {
          disagreements.push(
            `${perspectiveResults[i].viewpoint} vs ${perspectiveResults[j].viewpoint}`,
          );
        }
      }
    }
  }

  // Build consensus
  const avgConfidence =
    perspectiveResults.reduce((sum, p) => sum + p.confidence, 0) / perspectiveResults.length;
  const consensus =
    avgConfidence > 70
      ? 'Wysoka zgodność między perspektywami'
      : avgConfidence > 50
        ? 'Umiarkowana zgodność, pewne różnice zdań'
        : 'Niska zgodność, znaczące różnice w ocenie';

  console.log(chalk.green(`[MultiPerspective] Completed: ${consensus}`));

  return {
    perspectives: perspectiveResults,
    consensus,
    disagreements,
    finalRecommendation:
      perspectiveResults.sort((a, b) => b.confidence - a.confidence)[0]?.recommendation ||
      'Brak rekomendacji',
  };
}

/**
 * ConsensusEngine - Feature #17: Multi-Model Consensus
 * Queries multiple models and selects best response for critical tasks
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';
import { scoreResponseQuality, ExpectedResponseType } from './QualityScoring.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface ConsensusResult {
  selectedResponse: string;
  responses: Array<{ model: string; response: string; score: number }>;
  confidence: number;
}

export async function getConsensus(
  prompt: string,
  models: string[] = ['gemini-3-pro-preview'],
  expectedType: ExpectedResponseType = 'text'
): Promise<ConsensusResult> {
  const responses: Array<{ model: string; response: string; score: number }> = [];

  // Query all models in parallel
  const promises = models.map(async modelName => {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const response = result.response.text();
      const quality = scoreResponseQuality(response, expectedType);

      return { model: modelName, response, score: quality.overall };
    } catch (error) {
      return { model: modelName, response: '', score: 0 };
    }
  });

  const results = await Promise.all(promises);
  responses.push(...results.filter(r => r.response.length > 0));

  // Select best response
  responses.sort((a, b) => b.score - a.score);
  const best = responses[0] || { model: '', response: '', score: 0 };

  // Calculate confidence (how much better is best vs average)
  const avgScore = responses.reduce((sum, r) => sum + r.score, 0) / responses.length;
  const confidence = avgScore > 0 ? best.score / avgScore : 0;

  return {
    selectedResponse: best.response,
    responses,
    confidence
  };
}

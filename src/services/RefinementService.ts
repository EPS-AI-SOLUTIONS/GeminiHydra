/**
 * GeminiHydra - Refinement Service (Phase B-A)
 * Translation & Refinement using gemini-3-flash-preview
 * - Translates non-English objectives to English
 * - Classifies task difficulty
 * - Selects optimal local model for execution
 */

import type {
  LLMProvider,
  RefinementResult,
  TaskDifficulty,
  ChatMessage,
} from '../types/index.js';
import { LlamaCppProvider } from '../providers/LlamaCppProvider.js';

const REFINEMENT_PROMPT = `You are a task analyzer. Analyze the given objective and respond in JSON format.

Tasks:
1. Detect if the text is in English. If not, translate it to English.
2. Classify the task difficulty:
   - simple: Basic operations, simple questions, straightforward tasks
   - moderate: Multi-step tasks, requires some reasoning, coding tasks
   - complex: Complex analysis, architectural decisions, multi-file changes
3. Recommend a local LLM model based on difficulty (llama-cpp-python/GGUF naming):
   - simple: llama-3.2-1b, qwen2.5-1.5b, phi-3-mini, tinyllama-1.1b
   - moderate: llama-3.2-3b, qwen2.5-7b, mistral-7b, codellama-7b
   - complex: llama-3.1-8b, qwen2.5-14b, deepseek-coder-6.7b, codellama-13b

Respond ONLY with valid JSON:
{
  "originalObjective": "original text",
  "translatedObjective": "English text (same as original if already English)",
  "language": "detected language code (en, pl, de, etc.)",
  "difficulty": "simple|moderate|complex",
  "recommendedModel": "model name",
  "context": "brief context about why this difficulty was chosen"
}`;

export class RefinementService {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  /**
   * Analyze and refine the objective (Phase B-A)
   */
  async refine(objective: string): Promise<RefinementResult> {
    const messages: ChatMessage[] = [
      { role: 'system', content: REFINEMENT_PROMPT },
      { role: 'user', content: `Analyze this objective:\n\n${objective}` },
    ];

    try {
      const response = await this.provider.createChatCompletion({ messages });
      const content = response.choices[0]?.message?.content || '';

      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this.createFallback(objective);
      }

      const result = JSON.parse(jsonMatch[0]) as RefinementResult;

      // Validate and normalize
      return {
        originalObjective: result.originalObjective || objective,
        translatedObjective: result.translatedObjective || objective,
        language: result.language || 'en',
        difficulty: this.normalizeDifficulty(result.difficulty),
        recommendedModel:
          result.recommendedModel || LlamaCppProvider.getRecommendedModel(result.difficulty || 'moderate'),
        context: result.context,
      };
    } catch (error) {
      console.error('Refinement error:', error);
      return this.createFallback(objective);
    }
  }

  /**
   * Quick language detection without full refinement
   */
  async detectLanguage(text: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'Detect the language of the text. Respond with ONLY the ISO 639-1 language code (en, pl, de, fr, etc.).',
      },
      { role: 'user', content: text },
    ];

    try {
      const response = await this.provider.createChatCompletion({
        messages,
        max_tokens: 10,
      });
      const code = response.choices[0]?.message?.content?.trim().toLowerCase() || 'en';
      return code.slice(0, 2);
    } catch {
      return 'en';
    }
  }

  /**
   * Classify difficulty only
   */
  async classifyDifficulty(objective: string): Promise<TaskDifficulty> {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `Classify the task difficulty. Respond with ONLY one word:
- simple: Basic operations, simple questions
- moderate: Multi-step tasks, coding tasks
- complex: Complex analysis, architectural decisions`,
      },
      { role: 'user', content: objective },
    ];

    try {
      const response = await this.provider.createChatCompletion({
        messages,
        max_tokens: 10,
      });
      const result = response.choices[0]?.message?.content?.trim().toLowerCase() || 'moderate';
      return this.normalizeDifficulty(result as TaskDifficulty);
    } catch {
      return 'moderate';
    }
  }

  private normalizeDifficulty(difficulty: string | TaskDifficulty): TaskDifficulty {
    const normalized = String(difficulty).toLowerCase().trim();
    if (normalized === 'simple' || normalized === 'easy') return 'simple';
    if (normalized === 'complex' || normalized === 'hard' || normalized === 'difficult')
      return 'complex';
    return 'moderate';
  }

  private createFallback(objective: string): RefinementResult {
    return {
      originalObjective: objective,
      translatedObjective: objective,
      language: 'en',
      difficulty: 'moderate',
      recommendedModel: LlamaCppProvider.getRecommendedModel('moderate'),
      context: 'Fallback - unable to analyze objective',
    };
  }
}

// Singleton pattern
let refinementServiceInstance: RefinementService | null = null;

export function getRefinementService(provider: LLMProvider): RefinementService {
  if (!refinementServiceInstance) {
    refinementServiceInstance = new RefinementService(provider);
  }
  return refinementServiceInstance;
}

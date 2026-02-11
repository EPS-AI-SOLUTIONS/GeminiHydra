/**
 * GeminiCLI Integration
 * Wrapper for @google/gemini-cli-core tools and features
 */

import { type ChatSession, type GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';
import { GEMINI_MODELS } from '../config/models.config.js';

// Available Gemini 3 models (latest only) - Model metadata (kept for backwards compatibility)
export const GEMINI_MODELS_META = {
  // Gemini 3 (Latest - Primary)
  [GEMINI_MODELS.PRO]: { name: 'Gemini 3 Pro', tier: 'pro', speed: 'medium', quality: 'best' },
  [GEMINI_MODELS.FLASH]: {
    name: 'Gemini 3 Flash',
    tier: 'flash',
    speed: 'fast',
    quality: 'excellent',
  },
};

// Default model selection (Gemini 3 only)
export const DEFAULT_MODEL = GEMINI_MODELS.FLASH;
export const BEST_MODEL = GEMINI_MODELS.PRO;
export const FASTEST_MODEL = GEMINI_MODELS.FLASH;

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * Select the best available model based on task type (Gemini 3 only)
 */
export function selectModel(
  taskType: 'planning' | 'coding' | 'analysis' | 'quick' | 'creative',
): string {
  switch (taskType) {
    case 'planning':
      return GEMINI_MODELS.FLASH; // Fast strategic planning
    case 'coding':
      return GEMINI_MODELS.PRO; // Best for code generation
    case 'analysis':
      return GEMINI_MODELS.PRO; // Best for deep analysis
    case 'quick':
      return GEMINI_MODELS.FLASH; // Fast for simple tasks
    case 'creative':
      return GEMINI_MODELS.FLASH; // Good balance for creative tasks
    default:
      return DEFAULT_MODEL;
  }
}

/**
 * Generate content using Gemini API
 */
export async function generate(
  prompt: string,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  } = {},
): Promise<string> {
  const { model = DEFAULT_MODEL, maxTokens = 8192, systemPrompt } = options;

  const geminiModel = genAI.getGenerativeModel({
    model,
    generationConfig: {
      temperature: 1.0, // Temperature locked at 1.0 for Gemini - do not change
      maxOutputTokens: maxTokens,
    },
  });

  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  const result = await geminiModel.generateContent(fullPrompt);
  return result.response.text();
}

/**
 * Generate with streaming
 */
export async function* generateStream(
  prompt: string,
  options: {
    model?: string;
    temperature?: number;
    systemPrompt?: string;
  } = {},
): AsyncGenerator<string> {
  const { model = DEFAULT_MODEL, systemPrompt } = options;

  const geminiModel = genAI.getGenerativeModel({
    model,
    generationConfig: { temperature: 1.0 }, // Temperature locked at 1.0 for Gemini - do not change
  });

  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  const result = await geminiModel.generateContentStream(fullPrompt);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      yield text;
    }
  }
}

/**
 * List available models from API
 */
export async function listModels(): Promise<Array<{ name: string; displayName: string }>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const data = await response.json();
  return data.models.map((m: Record<string, unknown>) => ({
    name: (m.name as string).replace('models/', ''),
    displayName: m.displayName as string,
  }));
}

/**
 * Check if model is available
 */
export async function isModelAvailable(modelName: string): Promise<boolean> {
  try {
    const models = await listModels();
    return models.some((m) => m.name === modelName || m.name === `models/${modelName}`);
  } catch {
    return false;
  }
}

/**
 * Get the best available model (checks API) - Gemini 3 only
 */
export async function getBestAvailableModel(): Promise<string> {
  const preferredModels = [GEMINI_MODELS.PRO, GEMINI_MODELS.FLASH];

  try {
    const models = await listModels();
    const availableNames = models.map((m) => m.name);

    for (const model of preferredModels) {
      if (availableNames.includes(model)) {
        return model;
      }
    }
  } catch {
    // Fallback to default
  }

  return DEFAULT_MODEL;
}

/**
 * Chat session with history
 */
export class GeminiChat {
  private model: GenerativeModel;
  private chat: ChatSession;

  constructor(modelName: string = DEFAULT_MODEL) {
    this.model = genAI.getGenerativeModel({ model: modelName });
    this.chat = this.model.startChat();
  }

  async send(message: string): Promise<string> {
    const result = await this.chat.sendMessage(message);
    return result.response.text();
  }

  async *sendStream(message: string): AsyncGenerator<string> {
    const result = await this.chat.sendMessageStream(message);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield text;
      }
    }
  }

  getHistory() {
    return this.chat.getHistory();
  }
}

// Export default
export default {
  GEMINI_MODELS: GEMINI_MODELS_META,
  DEFAULT_MODEL,
  BEST_MODEL,
  FASTEST_MODEL,
  selectModel,
  generate,
  generateStream,
  listModels,
  isModelAvailable,
  getBestAvailableModel,
  GeminiChat,
};

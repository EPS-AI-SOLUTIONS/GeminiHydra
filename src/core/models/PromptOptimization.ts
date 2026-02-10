/**
 * PromptOptimization - Feature #19: Model-Specific Prompt Optimization
 * Optimizes prompts for different model characteristics
 *
 * GEMINI 3 OPTIMIZED: Temperatures use MODEL_TEMPERATURES from config
 * Gemini 3 models use 1.0+ (recommended default), local models use 0.7
 */

import { MODEL_TEMPERATURES } from '../../config/temperatures.config.js';

export interface ModelPromptConfig {
  systemPrefix: string;
  responseFormat: string;
  temperature: number;
  styleHints: string;
}

export const MODEL_PROMPT_CONFIGS: Record<string, ModelPromptConfig> = {
  'gemini-3-pro-preview': {
    systemPrefix: 'You are a highly capable AI assistant.',
    responseFormat: 'Provide detailed, well-structured responses.',
    temperature: MODEL_TEMPERATURES.flagship,  // 1.0 for Gemini 3
    styleHints: 'Be thorough and analytical.'
  },
  'gemini-3-flash-preview': {
    systemPrefix: 'You are a fast, efficient AI assistant.',
    responseFormat: 'Be concise and direct.',
    temperature: MODEL_TEMPERATURES.fast_scout,  // 1.1 for faster exploration
    styleHints: 'Prioritize speed and clarity.'
  },
  'qwen3:4b': {
    systemPrefix: 'You are a helpful assistant.',
    responseFormat: 'Keep responses focused and practical.',
    temperature: MODEL_TEMPERATURES.local,  // 0.7 for local models
    styleHints: 'Be straightforward.'
  },
  'qwen3:8b': {
    systemPrefix: 'You are a coding assistant.',
    responseFormat: 'Focus on code and technical details.',
    temperature: MODEL_TEMPERATURES.local,  // 0.7 for local models
    styleHints: 'Provide working code with minimal explanation.'
  }
};

export function optimizePromptForModel(prompt: string, model: string): string {
  const config = MODEL_PROMPT_CONFIGS[model] || MODEL_PROMPT_CONFIGS['gemini-3-pro-preview'];

  return `${config.systemPrefix}

${config.styleHints}
${config.responseFormat}

${prompt}`;
}

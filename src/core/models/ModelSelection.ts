/**
 * ModelSelection - Feature #11: Dynamic Model Selection
 * Automatically selects optimal model based on task complexity
 *
 * GEMINI 3 OPTIMIZED: Uses TEMPERATURE_PRESETS from config
 * Temperature 0 replaced with PRECISE (0.8) for Gemini 3 compatibility
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';
import { GEMINI_MODELS } from '../../config/models.config.js';
import type { TaskComplexity } from '../agent/types.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Re-export for backwards compatibility (canonical definition is in agent/types.ts)
export type { TaskComplexity } from '../agent/types.js';

export interface ModelSelectionResult {
  model: string;
  complexity: TaskComplexity;
  reason: string;
}

/**
 * Classify task complexity using fast model
 */
export async function classifyComplexity(taskText: string): Promise<TaskComplexity> {
  try {
    const classifier = genAI.getGenerativeModel({
      model: GEMINI_MODELS.FLASH,
      generationConfig: { temperature: 1.0, maxOutputTokens: 20 }, // Temperature locked at 1.0 for Gemini - do not change
    });

    const prompt = `Classify this task complexity. Reply with ONE word only: trivial, simple, medium, complex, or critical.
Task: ${taskText.substring(0, 300)}
Complexity:`;

    const result = await classifier.generateContent(prompt);
    const response = result.response.text().toLowerCase().trim();

    const validLevels: TaskComplexity[] = ['trivial', 'simple', 'medium', 'complex', 'critical'];
    return validLevels.find((level) => response.includes(level)) || 'medium';
  } catch {
    return 'medium';
  }
}

/**
 * Select optimal model for task
 */
export function selectModelForTask(
  complexity: TaskComplexity,
  _agentType: string = 'general',
): ModelSelectionResult {
  const modelMap: Record<TaskComplexity, { model: string; reason: string }> = {
    trivial: { model: GEMINI_MODELS.FLASH, reason: 'Fast model for trivial tasks' },
    simple: { model: GEMINI_MODELS.FLASH, reason: 'Flash model for simple tasks' },
    medium: { model: GEMINI_MODELS.FLASH, reason: 'Balanced model for medium tasks' },
    complex: { model: GEMINI_MODELS.PRO, reason: 'Pro model for complex tasks' },
    critical: { model: GEMINI_MODELS.PRO, reason: 'Best model for critical tasks' },
  };

  const selection = modelMap[complexity];
  return { ...selection, complexity };
}

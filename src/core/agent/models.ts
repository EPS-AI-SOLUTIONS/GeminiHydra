/**
 * Agent - Model management, routing, and personas
 *
 * GenAI instance, model tiers, Dijkstra chain,
 * task classification, and agent personas.
 *
 * @module core/agent/models
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import 'dotenv/config';
import { AgentRole, AgentPersona } from '../../types/index.js';
import { getBestAvailableModel, DEFAULT_MODEL } from '../GeminiCLI.js';
import { GEMINI_MODELS } from '../../config/models.config.js';
import type { TaskComplexity } from './types.js';

// ============================================================================
// GEMINI CLIENT
// ============================================================================

/** Shared GoogleGenerativeAI instance */
export const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ============================================================================
// MODEL CHAINS AND TIERS
// ============================================================================

/**
 * DIJKSTRA GEMINI-ONLY CHAIN
 * Ported from AgentSwarm.psm1 lines 354-427
 * Dijkstra NEVER uses Ollama - only Gemini with fallback chain
 */
export const DIJKSTRA_CHAIN = [
  { name: GEMINI_MODELS.PRO, role: 'Flagowiec (Flagship)', temperature: 1.0 },
  { name: GEMINI_MODELS.PRO, role: 'Pierwszy oficer (First Officer)', temperature: 1.0 },
  { name: GEMINI_MODELS.FLASH, role: 'Szybki zwiadowca (Fast Scout)', temperature: 1.1 },
  { name: GEMINI_MODELS.FLASH, role: 'Ostatnia deska ratunku (Last Resort)', temperature: 1.2 }
];

/** Model tiers for intelligent routing (Gemini 3 only) */
export const MODEL_TIERS = {
  classifier: GEMINI_MODELS.FLASH, // Fast classification
  fast: GEMINI_MODELS.FLASH,       // Fast for simple tasks
  standard: GEMINI_MODELS.FLASH,   // Balanced
  pro: GEMINI_MODELS.FLASH,        // Quality
  best: GEMINI_MODELS.PRO          // Best quality (for critical tasks)
};

// ============================================================================
// MODEL INITIALIZATION
// ============================================================================

/** Dynamic model selection state */
let availableModels: Set<string> = new Set();
let modelInitialized = false;

/**
 * Initialize available models from Gemini API (lazy, fast)
 * Note: We skip fetching full model list for speed - use predefined tiers
 */
export async function initializeGeminiModels(): Promise<void> {
  if (modelInitialized) return;

  try {
    // Just check if we have a working model, don't fetch full list (saves ~500ms)
    const bestModel = await getBestAvailableModel();
    console.log(chalk.cyan(`[Gemini] Best available model: ${bestModel}`));

    // Pre-populate with known working models - Gemini 3 only
    availableModels.add(GEMINI_MODELS.FLASH);
    availableModels.add(GEMINI_MODELS.PRO);

    modelInitialized = true;
  } catch (error) {
    console.warn(chalk.yellow('[Gemini] Could not verify models, using defaults'));
    modelInitialized = true;
  }
}

// ============================================================================
// TASK CLASSIFICATION AND MODEL SELECTION
// ============================================================================

/**
 * Classify task complexity using ultra-fast model
 */
export async function classifyTaskComplexity(task: string): Promise<TaskComplexity> {
  try {
    const classifierModel = genAI.getGenerativeModel({
      model: MODEL_TIERS.classifier,
      generationConfig: { temperature: 0, maxOutputTokens: 20 }
    });

    const prompt = `Classify this task complexity. Reply with ONLY one word: trivial, simple, medium, complex, or critical.

Task: ${task.substring(0, 500)}

Complexity:`;

    const result = await classifierModel.generateContent(prompt);
    const response = result.response.text().toLowerCase().trim();

    const validLevels: TaskComplexity[] = ['trivial', 'simple', 'medium', 'complex', 'critical'];
    const matched = validLevels.find(level => response.includes(level));

    return matched || 'medium';
  } catch (error) {
    // If classifier fails, default to medium
    return 'medium';
  }
}

/**
 * Select optimal model based on task complexity
 */
export function selectModelForComplexity(complexity: TaskComplexity): string {
  const modelMap: Record<TaskComplexity, string> = {
    trivial: MODEL_TIERS.fast,
    simple: MODEL_TIERS.fast,
    medium: MODEL_TIERS.standard,
    complex: MODEL_TIERS.pro,
    critical: MODEL_TIERS.best
  };

  const selectedModel = modelMap[complexity];

  // Check if selected model is available, fallback to next best
  if (availableModels.size > 0 && !availableModels.has(selectedModel)) {
    // Fallback chain
    const fallbacks = [MODEL_TIERS.pro, MODEL_TIERS.standard, MODEL_TIERS.fast, DEFAULT_MODEL];
    for (const fallback of fallbacks) {
      if (availableModels.has(fallback)) {
        return fallback;
      }
    }
  }

  return selectedModel;
}

// ============================================================================
// AGENT PERSONAS
// ============================================================================

export const AGENT_PERSONAS: Record<AgentRole, AgentPersona> = {
  dijkstra: { name: 'dijkstra', role: 'Strategist', model: 'gemini-cloud', description: 'Master strategist using Gemini 3 Flash. Create JSON plans.' },
  geralt:   { name: 'geralt',   role: 'Security',   model: 'qwen3:4b',        description: 'Oversee security. VETO unsafe changes.' },
  yennefer: { name: 'yennefer', role: 'Architect',  model: 'qwen3:4b',        description: 'Focus on design patterns and code purity.' },
  triss:    { name: 'triss',    role: 'QA',         model: 'qwen3:4b',        description: 'QA role. Create test scenarios.' },
  vesemir:  { name: 'vesemir',  role: 'Mentor',     model: 'qwen3:4b',        description: 'Mentor. Review plans.' },
  jaskier:  { name: 'jaskier',  role: 'Bard',       model: 'qwen3:4b',        description: 'Translate technical reports into summaries.' },
  ciri:     { name: 'ciri',     role: 'Scout',      model: 'qwen3:0.6b',      description: 'Speed role. Execute simple, atomic tasks.' },
  eskel:    { name: 'eskel',    role: 'DevOps',     model: 'qwen3:4b',        description: 'DevOps specialist. Build and deploy.' },
  lambert:  { name: 'lambert',  role: 'Debugger',   model: 'qwen3:4b',        description: 'Debugger. Analyze and fix errors.' },
  zoltan:   { name: 'zoltan',   role: 'Data',       model: 'qwen3:4b',        description: 'Data master. Analyze JSON/CSV/YML.' },
  regis:    { name: 'regis',    role: 'Researcher', model: 'gemini-cloud',     description: 'Synthesizer and Researcher. Deep analysis with Gemini.' },
  philippa: { name: 'philippa', role: 'API',        model: 'qwen3:8b',        description: 'API specialist.' },
  serena:   { name: 'serena',   role: 'CodeIntel',  model: 'gemini-cloud',     description: 'Code Intelligence via real Serena MCP. LSP-powered symbol search, refactoring, deep code analysis.' }
};

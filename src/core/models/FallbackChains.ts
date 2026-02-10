/**
 * FallbackChains - Feature #12: Agent-Specific Fallback Chains
 * Defines fallback model chains for different agent types
 *
 * GEMINI 3 OPTIMIZED: Temperatures adjusted to use MODEL_TEMPERATURES
 * from temperatures.config.ts (min 0.7 for Gemini 3, local models can be lower)
 */

import { GEMINI_MODELS } from '../../config/models.config.js';
import { MODEL_TEMPERATURES } from '../../config/temperatures.config.js';

export interface FallbackChainEntry {
  model: string;
  temperature: number;
  role: string;
}

export const AGENT_FALLBACK_CHAINS: Record<string, FallbackChainEntry[]> = {
  Dijkstra: [
    { model: GEMINI_MODELS.PRO, temperature: MODEL_TEMPERATURES.flagship, role: 'Flagship' },
    { model: GEMINI_MODELS.PRO, temperature: MODEL_TEMPERATURES.first_officer, role: 'First Officer' },
    { model: GEMINI_MODELS.FLASH, temperature: MODEL_TEMPERATURES.fast_scout, role: 'Fast Scout' },
    { model: GEMINI_MODELS.FLASH, temperature: MODEL_TEMPERATURES.last_resort, role: 'Last Resort' }
  ],
  Regis: [
    { model: GEMINI_MODELS.PRO, temperature: MODEL_TEMPERATURES.flagship, role: 'Deep Research' },
    { model: GEMINI_MODELS.FLASH, temperature: MODEL_TEMPERATURES.fast_scout, role: 'Quick Analysis' }
  ],
  Yennefer: [
    { model: 'qwen3:4b', temperature: MODEL_TEMPERATURES.local, role: 'Code Primary' },
    { model: GEMINI_MODELS.FLASH, temperature: MODEL_TEMPERATURES.fast_scout, role: 'Fallback' }
  ],
  Lambert: [
    { model: 'qwen3:4b', temperature: MODEL_TEMPERATURES.local, role: 'Debug Primary' },
    { model: GEMINI_MODELS.FLASH, temperature: MODEL_TEMPERATURES.flagship, role: 'Fallback' }
  ],
  default: [
    { model: 'qwen3:4b', temperature: MODEL_TEMPERATURES.local, role: 'Local Primary' },
    { model: GEMINI_MODELS.FLASH, temperature: MODEL_TEMPERATURES.fast_scout, role: 'Cloud Fallback' }
  ]
};

export function getFallbackChain(agentName: string): FallbackChainEntry[] {
  return AGENT_FALLBACK_CHAINS[agentName] || AGENT_FALLBACK_CHAINS.default;
}

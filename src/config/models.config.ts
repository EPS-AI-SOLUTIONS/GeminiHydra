/**
 * GeminiHydra - AI Models Configuration
 * Configuration for Gemini and Qwen3 (llama.cpp) models
 */

// ============================================================================
// GEMINI MODELS
// ============================================================================

export const GEMINI_MODELS = {
  /** Gemini 3 Pro Preview - High quality, slower */
  PRO: 'gemini-3-pro-preview',
  /** Gemini 3 Flash Preview - Fast, good quality */
  FLASH: 'gemini-3-flash-preview',
} as const;

export type GeminiModel = (typeof GEMINI_MODELS)[keyof typeof GEMINI_MODELS];

// ============================================================================
// LLAMA MODELS (Local - GGUF format for llama.cpp / Qwen3 series)
// ============================================================================

export const LLAMA_MODELS = {
  /** Qwen3 4B - Primary workhorse, thinking mode, 256K context */
  QWEN3_4B: 'Qwen3-4B-Q4_K_M.gguf',
  /** Qwen3 1.7B - Fast lightweight model, 32K context */
  QWEN3_1_7B: 'Qwen3-1.7B-Q4_K_M.gguf',
  /** Qwen3 8B - High quality model, 128K context */
  QWEN3_8B: 'Qwen3-8B-Q4_K_M.gguf',
  /** Qwen3 0.6B - Ultra-fast scout model, 32K context */
  QWEN3_0_6B: 'Qwen3-0.6B-Q4_K_M.gguf',
  /** Qwen3 14B - Premium quality for complex tasks */
  QWEN3_14B: 'Qwen3-14B-Q4_K_M.gguf',
} as const;

export type LlamaModel = (typeof LLAMA_MODELS)[keyof typeof LLAMA_MODELS];

// Backwards compatibility aliases (Ollama -> Llama)
export const OLLAMA_MODELS = LLAMA_MODELS;
export type OllamaModel = LlamaModel;

// HuggingFace repo mappings for downloading
export const LLAMA_REPOS: Record<string, string> = {
  [LLAMA_MODELS.QWEN3_4B]: 'Qwen/Qwen3-4B-GGUF',
  [LLAMA_MODELS.QWEN3_1_7B]: 'Qwen/Qwen3-1.7B-GGUF',
  [LLAMA_MODELS.QWEN3_8B]: 'Qwen/Qwen3-8B-GGUF',
  [LLAMA_MODELS.QWEN3_0_6B]: 'Qwen/Qwen3-0.6B-GGUF',
  [LLAMA_MODELS.QWEN3_14B]: 'Qwen/Qwen3-14B-GGUF',
};

// ============================================================================
// MODEL SELECTION
// ============================================================================

/** Default model for general tasks */
export const DEFAULT_MODEL = GEMINI_MODELS.PRO;

/** Fast model for quick operations (cost-effective) */
export const FAST_MODEL = GEMINI_MODELS.PRO;

/** Quality model for complex reasoning */
export const QUALITY_MODEL = GEMINI_MODELS.PRO;

/** Local model for offline/free operations */
export const LOCAL_MODEL = LLAMA_MODELS.QWEN3_4B;

/** Coding-focused local model */
export const CODING_MODEL = LLAMA_MODELS.QWEN3_8B;

// ============================================================================
// MODEL PRICING (per 1M tokens, USD)
// ============================================================================

export interface ModelPricing {
  input: number;
  output: number;
  cachedInput?: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Gemini 3 Preview models
  [GEMINI_MODELS.PRO]: {
    input: 1.25,
    output: 5.0,
    cachedInput: 0.3125,
  },
  [GEMINI_MODELS.FLASH]: {
    input: 0.075,
    output: 0.30,
    cachedInput: 0.01875,
  },
  // Qwen3 models (free, local)
  [LLAMA_MODELS.QWEN3_4B]: {
    input: 0,
    output: 0,
  },
  [LLAMA_MODELS.QWEN3_1_7B]: {
    input: 0,
    output: 0,
  },
  [LLAMA_MODELS.QWEN3_8B]: {
    input: 0,
    output: 0,
  },
  [LLAMA_MODELS.QWEN3_0_6B]: {
    input: 0,
    output: 0,
  },
  [LLAMA_MODELS.QWEN3_14B]: {
    input: 0,
    output: 0,
  },
};

// ============================================================================
// MODEL CAPABILITIES
// ============================================================================

export interface ModelCapabilities {
  maxTokens: number;
  contextWindow: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
  quantization?: string;
  gpuLayers?: number;
}

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  [GEMINI_MODELS.PRO]: {
    maxTokens: 8192,
    contextWindow: 1000000,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  [GEMINI_MODELS.FLASH]: {
    maxTokens: 8192,
    contextWindow: 1000000,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  [LLAMA_MODELS.QWEN3_4B]: {
    maxTokens: 8192,
    contextWindow: 262144,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
    quantization: 'Q4_K_M',
    gpuLayers: 99,
  },
  [LLAMA_MODELS.QWEN3_1_7B]: {
    maxTokens: 4096,
    contextWindow: 32768,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
    quantization: 'Q4_K_M',
    gpuLayers: 99,
  },
  [LLAMA_MODELS.QWEN3_8B]: {
    maxTokens: 8192,
    contextWindow: 131072,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
    quantization: 'Q4_K_M',
    gpuLayers: 99,
  },
  [LLAMA_MODELS.QWEN3_0_6B]: {
    maxTokens: 2048,
    contextWindow: 32768,
    supportsVision: false,
    supportsTools: false,
    supportsStreaming: true,
    quantization: 'Q4_K_M',
    gpuLayers: 99,
  },
  [LLAMA_MODELS.QWEN3_14B]: {
    maxTokens: 8192,
    contextWindow: 131072,
    supportsVision: false,
    supportsTools: true,
    supportsStreaming: true,
    quantization: 'Q4_K_M',
    gpuLayers: 35, // Reduced for 8GB VRAM
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate cost for a given number of tokens
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens: number = 0
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  const cachedCost = pricing.cachedInput
    ? (cachedInputTokens / 1_000_000) * pricing.cachedInput
    : 0;

  return inputCost + outputCost + cachedCost;
}

/**
 * Get model capabilities
 */
export function getModelCapabilities(model: string): ModelCapabilities | null {
  return MODEL_CAPABILITIES[model] || null;
}

/**
 * Check if model is a local llama.cpp model
 */
export function isLocalModel(model: string): boolean {
  return Object.values(LLAMA_MODELS).includes(model as LlamaModel);
}

/**
 * Check if model is a llama.cpp model
 */
export function isLlamaModel(model: string): boolean {
  return Object.values(LLAMA_MODELS).includes(model as LlamaModel);
}

/**
 * Check if model is a Gemini model
 */
export function isGeminiModel(model: string): boolean {
  return Object.values(GEMINI_MODELS).includes(model as GeminiModel);
}

/**
 * Get HuggingFace repo for a llama model
 */
export function getLlamaRepo(model: string): string | null {
  return LLAMA_REPOS[model] || null;
}

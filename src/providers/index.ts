/**
 * GeminiHydra - Provider Module Exports
 */

// Base provider
export * from './base-provider.js';

// Registry
export * from './registry.js';

// MCP Llama provider (primary)
export * from './McpLlamaProvider.js';

// Legacy providers - explicit exports to avoid conflicts
export {
  GeminiProvider,
  createGeminiProviders,
  GEMINI_MODELS,
  type GeminiModelAlias,
} from './GeminiProvider.js';

export {
  LlamaCppProvider,
  createLlamaCppProvider,
  LLAMA_CPP_MODELS,
  type LlamaCppConfig,
  type LlamaCppServerInfo,
} from './LlamaCppProvider.js';

export {
  SerenaProvider,
  createSerenaProvider,
  type SerenaProviderConfig,
} from './SerenaProvider.js';

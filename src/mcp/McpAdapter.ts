/**
 * GeminiHydra - MCP Adapter for CLI
 * Bridges CLI with MCP llama-cpp tools available in the environment
 *
 * This adapter creates mock implementations that use console-based
 * interaction for standalone CLI usage, or can be replaced with actual
 * MCP tool calls when running in an MCP environment (like Claude Code).
 */

import type { McpToolCaller } from '../providers/McpLlamaProvider.js';

/**
 * Create a stub MCP caller that throws descriptive errors
 * This is used when MCP tools are not available (standalone CLI mode)
 */
export function createStubMcpCaller(): McpToolCaller {
  const notAvailable = (toolName: string) => {
    throw new Error(
      `MCP tool '${toolName}' not available. ` +
      `GeminiHydra requires MCP llama-cpp tools to be available in the runtime environment. ` +
      `Run this in an MCP-enabled environment (like Claude Code) or provide a GEMINI_API_KEY for legacy mode.`
    );
  };

  return {
    llama_chat: async () => notAvailable('llama_chat'),
    llama_generate: async () => notAvailable('llama_generate'),
    llama_generate_fast: async () => notAvailable('llama_generate_fast'),
    llama_json: async () => notAvailable('llama_json'),
    llama_analyze: async () => notAvailable('llama_analyze'),
    llama_code: async () => notAvailable('llama_code'),
    llama_vision: async () => notAvailable('llama_vision'),
    llama_embed: async () => notAvailable('llama_embed'),
  };
}

/**
 * Check if MCP tools are likely available
 * In a real MCP environment, the tools would be injected
 */
export function isMcpEnvironment(): boolean {
  // Check for MCP-specific environment variables or global objects
  // This is a heuristic - in real MCP environments, tools are injected
  return typeof (globalThis as any).mcp !== 'undefined' ||
         process.env.MCP_ENABLED === 'true';
}

/**
 * Get environment mode description
 */
export function getEnvironmentMode(): 'mcp' | 'legacy' | 'stub' {
  if (isMcpEnvironment()) {
    return 'mcp';
  }
  if (process.env.GEMINI_API_KEY) {
    return 'legacy';
  }
  return 'stub';
}

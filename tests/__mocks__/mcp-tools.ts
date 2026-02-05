/**
 * Mock MCP Tools for testing
 * Provides mock implementations of all MCP llama-cpp tools
 */

import { vi } from 'vitest';
import type { McpToolCaller } from '../../src/providers/McpLlamaProvider.js';

/**
 * Create a mock MCP tool caller with configurable responses
 */
export function createMockMcpCaller(options: {
  chatResponse?: string;
  generateResponse?: string;
  jsonResponse?: unknown;
  analyzeResponse?: unknown;
  codeResponse?: unknown;
  visionResponse?: string;
  embedResponse?: number[][];
  shouldFail?: boolean;
  failureMessage?: string;
} = {}): McpToolCaller {
  const {
    chatResponse = 'Mock chat response',
    generateResponse = 'Mock generated text',
    jsonResponse = { result: 'mock' },
    analyzeResponse = { sentiment: { label: 'positive', score: 0.9 } },
    codeResponse = { code: 'console.log("mock")' },
    visionResponse = 'Mock image description',
    embedResponse = [[0.1, 0.2, 0.3]],
    shouldFail = false,
    failureMessage = 'Mock failure'
  } = options;

  const maybeReject = async <T>(value: T): Promise<T> => {
    if (shouldFail) {
      throw new Error(failureMessage);
    }
    return value;
  };

  return {
    llama_chat: vi.fn().mockImplementation(async () =>
      maybeReject({ content: chatResponse, model: 'mock-model' })
    ),

    llama_generate: vi.fn().mockImplementation(async () =>
      maybeReject({ text: generateResponse, model: 'mock-model' })
    ),

    llama_generate_fast: vi.fn().mockImplementation(async () =>
      maybeReject({ text: generateResponse, model: 'mock-model' })
    ),

    llama_json: vi.fn().mockImplementation(async () =>
      maybeReject(jsonResponse)
    ),

    llama_analyze: vi.fn().mockImplementation(async () =>
      maybeReject(analyzeResponse)
    ),

    llama_code: vi.fn().mockImplementation(async () =>
      maybeReject(codeResponse)
    ),

    llama_vision: vi.fn().mockImplementation(async () =>
      maybeReject({ description: visionResponse })
    ),

    llama_embed: vi.fn().mockImplementation(async () =>
      maybeReject({ embeddings: embedResponse })
    ),
  };
}

/**
 * Create a mock MCP caller that tracks call history
 */
export function createTrackedMcpCaller(): McpToolCaller & { getCallHistory: () => Array<{ tool: string; params: unknown }> } {
  const callHistory: Array<{ tool: string; params: unknown }> = [];

  const trackCall = (tool: string) => (params: unknown) => {
    callHistory.push({ tool, params });
    return Promise.resolve({ content: 'tracked', text: 'tracked', model: 'tracked' });
  };

  const caller = {
    llama_chat: vi.fn().mockImplementation(trackCall('llama_chat')),
    llama_generate: vi.fn().mockImplementation(trackCall('llama_generate')),
    llama_generate_fast: vi.fn().mockImplementation(trackCall('llama_generate_fast')),
    llama_json: vi.fn().mockImplementation(trackCall('llama_json')),
    llama_analyze: vi.fn().mockImplementation(trackCall('llama_analyze')),
    llama_code: vi.fn().mockImplementation(trackCall('llama_code')),
    llama_vision: vi.fn().mockImplementation(trackCall('llama_vision')),
    llama_embed: vi.fn().mockImplementation(trackCall('llama_embed')),
    getCallHistory: () => callHistory,
  };

  return caller as McpToolCaller & { getCallHistory: () => Array<{ tool: string; params: unknown }> };
}

/**
 * Reset all mocks on a mock MCP caller
 */
export function resetMcpMocks(caller: McpToolCaller): void {
  Object.values(caller).forEach(fn => {
    if (typeof fn === 'function' && 'mockReset' in fn) {
      (fn as ReturnType<typeof vi.fn>).mockReset();
    }
  });
}

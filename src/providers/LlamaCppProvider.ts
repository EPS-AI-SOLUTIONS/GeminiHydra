/**
 * GeminiHydra - LlamaCpp Provider
 * llama-cpp-python server adapter (OpenAI-compatible API)
 * https://llama-cpp-python.readthedocs.io/en/latest/server/
 *
 * Default server: python -m llama_cpp.server --model <path> --port 8000
 */

import type {
  LLMProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  TaskDifficulty,
} from '../types/index.js';

// Recommended models by difficulty (GGUF format)
export const LLAMA_CPP_MODELS: Record<TaskDifficulty, readonly string[]> = {
  trivial: [
    'qwen3-0.6b',
    'qwen3-1.7b',
  ],
  simple: [
    'qwen3-0.6b',
    'qwen3-1.7b',
  ],
  medium: [
    'qwen3-4b',
    'qwen3-8b',
  ],
  complex: [
    'qwen3-14b',
    'qwen3-32b',
  ],
  moderate: [
    'qwen3-4b',
    'qwen3-8b',
  ],
  expert: [
    'qwen3-14b',
    'qwen3-32b',
  ],
  critical: [
    'qwen3-14b',
    'qwen3-32b',
  ],
};

export interface LlamaCppConfig {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  timeout?: number;
}

export interface LlamaCppServerInfo {
  model: string;
  contextLength: number;
  nGpuLayers: number;
}

export class LlamaCppProvider implements LLMProvider {
  name = 'llama-cpp';
  model: string;
  private baseUrl: string;
  private apiKey?: string;
  private timeout: number;

  constructor(config: LlamaCppConfig = {}) {
    this.baseUrl = (config.baseUrl || 'http://localhost:8081').replace(/\/$/, '');
    this.model = config.model || 'default';
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 120000;
  }

  isAvailable(): boolean {
    return true;
  }

  /**
   * Check if llama-cpp-python server is running
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get available models from server
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        headers: this.getHeaders(),
      });
      if (!response.ok) return [];
      const data = await response.json() as { data: Array<{ id: string }> };
      return data.data.map(m => m.id);
    } catch {
      return [];
    }
  }

  /**
   * Get server info (model, context, GPU layers)
   */
  async getServerInfo(): Promise<LlamaCppServerInfo | null> {
    try {
      const models = await this.getAvailableModels();
      if (models.length === 0) return null;

      return {
        model: models[0],
        contextLength: 0, // Not directly available from API
        nGpuLayers: 0,
      };
    } catch {
      return null;
    }
  }

  async createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const url = `${this.baseUrl}/v1/chat/completions`;

    const body = {
      model: request.model || this.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 2048,
      stream: false,
      stop: request.stop,
      top_p: request.top_p ?? 0.95,
      frequency_penalty: request.frequency_penalty ?? 0,
      presence_penalty: request.presence_penalty ?? 0,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`llama-cpp-python error: ${response.status} - ${error}`);
    }

    const data = await response.json() as ChatCompletionResponse;
    return data;
  }

  async *createChatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncIterable<ChatCompletionChunk> {
    const url = `${this.baseUrl}/v1/chat/completions`;

    const body = {
      model: request.model || this.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.max_tokens ?? 2048,
      stream: true,
      stop: request.stop,
      top_p: request.top_p ?? 0.95,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`llama-cpp-python error: ${response.status} - ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const chunk = JSON.parse(trimmed.slice(6)) as ChatCompletionChunk;
            yield chunk;
          } catch {
            // Skip malformed chunks
          }
        }
      }
    }
  }

  /**
   * Create new provider with different model
   */
  withModel(model: string): LlamaCppProvider {
    return new LlamaCppProvider({
      baseUrl: this.baseUrl,
      model,
      apiKey: this.apiKey,
      timeout: this.timeout,
    });
  }

  /**
   * Get recommended model for task difficulty
   */
  static getRecommendedModel(difficulty: TaskDifficulty): string {
    const models = LLAMA_CPP_MODELS[difficulty];
    return models[0];
  }

  /**
   * Get all models for difficulty level
   */
  static getModelsForDifficulty(difficulty: TaskDifficulty): readonly string[] {
    return LLAMA_CPP_MODELS[difficulty];
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }
}

/**
 * Factory function for creating LlamaCpp provider from environment
 */
export function createLlamaCppProvider(config?: LlamaCppConfig): LlamaCppProvider {
  return new LlamaCppProvider({
    baseUrl: config?.baseUrl || process.env.LLAMA_CPP_URL || 'http://localhost:8081',
    model: config?.model || process.env.LLAMA_CPP_MODEL || 'default',
    apiKey: config?.apiKey || process.env.LLAMA_CPP_API_KEY,
    timeout: config?.timeout || parseInt(process.env.LLAMA_CPP_TIMEOUT || '120000', 10),
  });
}

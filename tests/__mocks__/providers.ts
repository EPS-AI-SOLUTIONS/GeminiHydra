/**
 * Mock Providers for testing
 * Provides mock implementations of LLM providers
 */

import { vi } from 'vitest';
import type {
  LLMProvider,
  ExtendedLLMProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ProviderResult,
  HealthCheckResult,
} from '../../src/types/provider.js';

/**
 * Mock LLM Provider for testing
 */
export class MockLLMProvider implements ExtendedLLMProvider {
  name: string;
  model: string;
  private _available: boolean;
  private _healthy: boolean;
  private _latency: number;
  private _response: string;
  private _shouldFail: boolean;
  private _failureMessage: string;

  constructor(options: {
    name?: string;
    model?: string;
    available?: boolean;
    healthy?: boolean;
    latency?: number;
    response?: string;
    shouldFail?: boolean;
    failureMessage?: string;
  } = {}) {
    this.name = options.name ?? 'mock-provider';
    this.model = options.model ?? 'mock-model';
    this._available = options.available ?? true;
    this._healthy = options.healthy ?? true;
    this._latency = options.latency ?? 100;
    this._response = options.response ?? 'Mock response';
    this._shouldFail = options.shouldFail ?? false;
    this._failureMessage = options.failureMessage ?? 'Mock provider failure';
  }

  isAvailable(): boolean {
    return this._available;
  }

  async createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    if (this._shouldFail) {
      throw new Error(this._failureMessage);
    }

    await this.simulateLatency();

    return {
      id: `mock-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: this._response,
        },
        finish_reason: 'stop',
      }],
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };
  }

  async *createChatCompletionStream(request: ChatCompletionRequest): AsyncIterable<ChatCompletionChunk> {
    if (this._shouldFail) {
      throw new Error(this._failureMessage);
    }

    const words = this._response.split(' ');
    for (const word of words) {
      yield {
        id: `mock-stream-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: this.model,
        choices: [{
          index: 0,
          delta: { content: word + ' ' },
          finish_reason: null,
        }],
      };
    }

    yield {
      id: `mock-stream-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop',
      }],
    };
  }

  async generateJson<T>(prompt: string, schema: object): Promise<T> {
    if (this._shouldFail) {
      throw new Error(this._failureMessage);
    }
    return { result: 'mock-json' } as T;
  }

  async analyzeText(text: string, task: string, options?: Record<string, unknown>): Promise<unknown> {
    if (this._shouldFail) {
      throw new Error(this._failureMessage);
    }
    return { analysis: 'mock-analysis', task };
  }

  async analyzeCode(task: string, codeOrDescription: string, language?: string): Promise<string> {
    if (this._shouldFail) {
      throw new Error(this._failureMessage);
    }
    return `Mock code analysis for ${task}`;
  }

  async healthCheck(): Promise<boolean> {
    return this._healthy;
  }

  // Test helpers
  setAvailable(available: boolean): void {
    this._available = available;
  }

  setHealthy(healthy: boolean): void {
    this._healthy = healthy;
  }

  setLatency(latency: number): void {
    this._latency = latency;
  }

  setResponse(response: string): void {
    this._response = response;
  }

  setShouldFail(shouldFail: boolean, message?: string): void {
    this._shouldFail = shouldFail;
    if (message) {
      this._failureMessage = message;
    }
  }

  private async simulateLatency(): Promise<void> {
    if (this._latency > 0) {
      await new Promise(resolve => setTimeout(resolve, this._latency));
    }
  }
}

/**
 * Create a mock provider with spy functions
 */
export function createSpyProvider(baseProvider?: MockLLMProvider): MockLLMProvider & {
  createChatCompletionSpy: ReturnType<typeof vi.fn>;
  healthCheckSpy: ReturnType<typeof vi.fn>;
} {
  const provider = baseProvider ?? new MockLLMProvider();

  const createChatCompletionSpy = vi.fn(provider.createChatCompletion.bind(provider));
  const healthCheckSpy = vi.fn(provider.healthCheck.bind(provider));

  provider.createChatCompletion = createChatCompletionSpy;
  provider.healthCheck = healthCheckSpy;

  return Object.assign(provider, {
    createChatCompletionSpy,
    healthCheckSpy,
  });
}

/**
 * Create multiple mock providers for testing selection strategies
 */
export function createMockProviderSet(count: number = 3): MockLLMProvider[] {
  return Array.from({ length: count }, (_, i) =>
    new MockLLMProvider({
      name: `provider-${i}`,
      model: `model-${i}`,
      latency: 100 * (i + 1),
    })
  );
}

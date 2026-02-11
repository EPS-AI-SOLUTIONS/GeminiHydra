/**
 * GeminiHydra - Gemini Provider
 * Fix: Mapping futuristic "Gemini 3" keys to working Gemini 2.0 models
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GeminiError, getErrorMessage, RateLimitError } from '../core/errors.js';
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  LLMProvider,
} from '../types/index.js';

// Available Gemini models (Updated February 2026)
export const GEMINI_MODELS = {
  // Gemini 3 Series (Preview - Current)
  'gemini-3-pro-preview': 'gemini-3-pro-preview',
  'gemini-3-flash-preview': 'gemini-3-flash-preview',

  // Legacy aliases
  'gemini-2.5-pro': 'gemini-3-pro-preview',
  'gemini-2.5-flash': 'gemini-3-pro-preview',
  'gemini-2.0-pro': 'gemini-3-pro-preview',
  'gemini-2.0-flash': 'gemini-3-pro-preview',

  // Convenient aliases
  pro: 'gemini-3-pro-preview',
  flash: 'gemini-3-pro-preview',
} as const;

export type GeminiModelAlias = keyof typeof GEMINI_MODELS;

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  model: string;
  private client: GoogleGenerativeAI;

  constructor(apiKey: string, model: string = 'gemini-3-pro-preview') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = this.resolveModel(model);
  }

  private resolveModel(model: string): string {
    if (model in GEMINI_MODELS) {
      return GEMINI_MODELS[model as GeminiModelAlias];
    }
    return model;
  }

  isAvailable(): boolean {
    return true;
  }

  async createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const modelName = request.model ? this.resolveModel(request.model) : this.model;
    const model = this.client.getGenerativeModel({ model: modelName });

    const { systemInstruction, contents } = this.convertMessages(request.messages);

    // Chat start with strict systemInstruction format (Content object)
    const chat = model.startChat({
      history: contents.slice(0, -1),
      systemInstruction: systemInstruction
        ? {
            role: 'system',
            parts: [{ text: systemInstruction }],
          }
        : undefined,
    });

    try {
      const lastMessage = contents[contents.length - 1];
      const result = await chat.sendMessage(lastMessage.parts[0].text);
      const responseText = result.response.text();

      return {
        id: `gemini-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: modelName,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: responseText,
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      // (#21, #24) Structured error codes + RESOURCE_EXHAUSTED handling
      if (msg.includes('429') || msg.includes('rate limit') || msg.includes('RESOURCE_EXHAUSTED')) {
        throw new RateLimitError(`Gemini rate limit (${modelName}): ${msg}`);
      }
      throw new GeminiError(`Gemini API Error (${modelName}): ${msg}`, {
        cause: error instanceof Error ? error : undefined,
        context: { model: modelName },
      });
    }
  }

  async *createChatCompletionStream(
    request: ChatCompletionRequest,
  ): AsyncIterable<ChatCompletionChunk> {
    const modelName = request.model ? this.resolveModel(request.model) : this.model;
    const model = this.client.getGenerativeModel({ model: modelName });

    const { systemInstruction, contents } = this.convertMessages(request.messages);

    const chat = model.startChat({
      history: contents.slice(0, -1),
      systemInstruction: systemInstruction
        ? {
            role: 'system',
            parts: [{ text: systemInstruction }],
          }
        : undefined,
    });

    const lastMessage = contents[contents.length - 1];
    const result = await chat.sendMessageStream(lastMessage.parts[0].text);

    const id = `gemini-stream-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      yield {
        id,
        object: 'chat.completion.chunk',
        created,
        model: modelName,
        choices: [
          {
            index: 0,
            delta: { content: text },
            finish_reason: null,
          },
        ],
      };
    }

    yield {
      id,
      object: 'chat.completion.chunk',
      created,
      model: modelName,
      choices: [
        {
          index: 0,
          delta: {},
          finish_reason: 'stop',
        },
      ],
    };
  }

  private convertMessages(messages: ChatMessage[]): {
    systemInstruction?: string;
    contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  } {
    let systemInstruction: string | undefined;
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction = msg.content;
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    if (contents.length === 0) {
      contents.push({ role: 'user', parts: [{ text: '' }] });
    }

    return { systemInstruction, contents };
  }

  withModel(model: string): GeminiProvider {
    const apiKey = (this.client as unknown as { apiKey: string }).apiKey;
    return new GeminiProvider(apiKey, model);
  }
}

export function createGeminiProviders(apiKey: string) {
  return {
    phaseA: new GeminiProvider(apiKey, 'gemini-3-pro-preview'),
    phaseBA: new GeminiProvider(apiKey, 'gemini-3-pro-preview'),
    phaseC: new GeminiProvider(apiKey, 'gemini-3-pro-preview'),
    phaseD: new GeminiProvider(apiKey, 'gemini-3-pro-preview'),
  };
}

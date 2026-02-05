/**
 * GeminiHydra - Gemini Provider
 * Fix: Mapping futuristic "Gemini 3" keys to working Gemini 2.0 models
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  LLMProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatMessage,
} from '../types/index.js';

// Available Gemini models (Updated February 2026)
export const GEMINI_MODELS = {
  // Gemini 3 Series (Current - Preview)
  'gemini-3-pro-preview': 'gemini-3-pro-preview',
  'gemini-3-flash-preview': 'gemini-3-flash-preview',
  'gemini-3-pro-image-preview': 'gemini-3-pro-image-preview',

  // Gemini 2.5 Series (Stable)
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',

  // Gemini 2.0 Series (Deprecated March 2026)
  'gemini-2.0-flash': 'gemini-2.0-flash',

  // Legacy aliases
  'gemini-2.0-pro': 'gemini-2.5-pro',
  'gemini-2.0-pro-exp-02-05': 'gemini-2.5-pro',

  // Convenient aliases
  'pro': 'gemini-3-pro-preview',
  'flash': 'gemini-3-flash-preview',
} as const;

export type GeminiModelAlias = keyof typeof GEMINI_MODELS;

export class GeminiProvider implements LLMProvider {
  name = 'gemini';
  model: string;
  private client: GoogleGenerativeAI;

  constructor(apiKey: string, model: string = 'gemini-3-flash-preview') {
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
      systemInstruction: systemInstruction ? {
        role: 'system',
        parts: [{ text: systemInstruction }]
      } : undefined,
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
    } catch (error: any) {
      throw new Error(`Gemini API Error (${modelName}): ${error.message}`);
    }
  }

  async *createChatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncIterable<ChatCompletionChunk> {
    const modelName = request.model ? this.resolveModel(request.model) : this.model;
    const model = this.client.getGenerativeModel({ model: modelName });

    const { systemInstruction, contents } = this.convertMessages(request.messages);

    const chat = model.startChat({
      history: contents.slice(0, -1),
      systemInstruction: systemInstruction ? {
        role: 'system',
        parts: [{ text: systemInstruction }]
      } : undefined,
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
    const apiKey = (this.client as any).apiKey;
    return new GeminiProvider(apiKey, model);
  }
}

export function createGeminiProviders(apiKey: string) {
  return {
    phaseA: new GeminiProvider(apiKey, 'gemini-3-pro-preview'),
    phaseBA: new GeminiProvider(apiKey, 'gemini-3-flash-preview'),
    phaseC: new GeminiProvider(apiKey, 'gemini-3-flash-preview'),
    phaseD: new GeminiProvider(apiKey, 'gemini-3-flash-preview'),
  };
}
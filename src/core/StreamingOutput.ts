/**
 * StreamingOutput - Real-time streaming responses
 * Feature #1: Streaming Output
 */

import { type GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import 'dotenv/config';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface StreamingOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  onToken?: (token: string) => void;
  onComplete?: (fullText: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Stream response from Gemini API token by token
 */
export async function streamGeminiResponse(
  prompt: string,
  options: StreamingOptions = {},
): Promise<string> {
  const {
    model = 'gemini-3-pro-preview',
    temperature: _temperature = 0.3,
    maxTokens = 4096,
    onToken = (t) => process.stdout.write(t),
    onComplete = () => {},
    onError = (e) => console.error(chalk.red(e.message)),
  } = options;

  try {
    const geminiModel = genAI.getGenerativeModel({
      model,
      generationConfig: {
        temperature: 1.0, // Temperature locked at 1.0 for Gemini - do not change
        maxOutputTokens: maxTokens,
      },
    });

    const result = await geminiModel.generateContentStream(prompt);

    let fullText = '';

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      onToken(chunkText);
    }

    onComplete(fullText);
    return fullText;
  } catch (error: unknown) {
    onError(error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/**
 * Stream with spinner for non-TTY environments
 */
export async function streamWithFallback(
  prompt: string,
  options: StreamingOptions = {},
): Promise<string> {
  // Check if stdout is TTY (interactive terminal)
  if (process.stdout.isTTY) {
    return streamGeminiResponse(prompt, options);
  } else {
    // Non-TTY: collect and return at once
    const geminiModel = genAI.getGenerativeModel({
      model: options.model || 'gemini-3-pro-preview',
    });
    const result = await geminiModel.generateContent(prompt);
    return result.response.text();
  }
}

/**
 * Streaming chat session
 */
export class StreamingChat {
  private model: GenerativeModel;
  private history: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  constructor(modelName: string = 'gemini-3-pro-preview') {
    this.model = genAI.getGenerativeModel({ model: modelName });
  }

  async sendStreaming(message: string, onToken: (token: string) => void): Promise<string> {
    const chat = this.model.startChat({ history: this.history });

    const result = await chat.sendMessageStream(message);
    let fullResponse = '';

    for await (const chunk of result.stream) {
      const text = chunk.text();
      fullResponse += text;
      onToken(text);
    }

    // Update history
    this.history.push({ role: 'user', parts: [{ text: message }] });
    this.history.push({ role: 'model', parts: [{ text: fullResponse }] });

    return fullResponse;
  }

  clearHistory(): void {
    this.history = [];
  }
}

export default {
  streamGeminiResponse,
  streamWithFallback,
  StreamingChat,
};

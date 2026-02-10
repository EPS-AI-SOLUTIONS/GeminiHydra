/**
 * Stream Simulator for Playwright E2E Tests
 *
 * Simulates streaming responses from Ollama, Gemini, and Swarm agents
 * to test real-time message handling in the UI.
 */

import type { Page } from '@playwright/test';
import { emitTauriEvent } from './tauri-mocks';

interface StreamOptions {
  chunkSize?: number;
  delayMs?: number;
  eventType?: 'ollama-event' | 'swarm-data' | 'gemini-stream';
}

interface AgentMessage {
  name: string;
  message: string;
  model?: string;
}

/**
 * Stream Simulator class for simulating LLM responses
 */
export class StreamSimulator {
  constructor(private page: Page) {}

  /**
   * Emit a single stream chunk
   */
  async emitChunk(
    chunk: string,
    done: boolean = false,
    eventType: 'ollama-event' | 'swarm-data' | 'gemini-stream' = 'swarm-data'
  ): Promise<void> {
    await emitTauriEvent(this.page, eventType, { chunk, done });
  }

  /**
   * Emit a stream error
   */
  async emitError(
    error: string,
    eventType: 'ollama-event' | 'swarm-data' | 'gemini-stream' = 'swarm-data'
  ): Promise<void> {
    await emitTauriEvent(this.page, eventType, { chunk: '', done: true, error });
  }

  /**
   * Simulate a typing response (character by character or chunk by chunk)
   */
  async simulateTypingResponse(text: string, options: StreamOptions = {}): Promise<void> {
    const { chunkSize = 15, delayMs = 30, eventType = 'swarm-data' } = options;

    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }

    for (const chunk of chunks) {
      await this.emitChunk(chunk, false, eventType);
      if (delayMs > 0) {
        await this.page.waitForTimeout(delayMs);
      }
    }

    // Send completion signal
    await this.emitChunk('', true, eventType);
  }

  /**
   * Simulate a full response instantly (for faster tests)
   */
  async simulateInstantResponse(text: string, eventType: StreamOptions['eventType'] = 'swarm-data'): Promise<void> {
    await this.emitChunk(text, false, eventType);
    await this.emitChunk('', true, eventType);
  }

  /**
   * Simulate an agent response with agent name prefix
   */
  async simulateAgentResponse(agent: AgentMessage): Promise<void> {
    const formatted = `\n[${agent.name}]: ${agent.message}\n`;
    await this.simulateTypingResponse(formatted, { delayMs: 20 });
  }

  /**
   * Simulate a full Swarm protocol with multiple agents
   */
  async simulateSwarmProtocol(agents: AgentMessage[]): Promise<void> {
    // Initial swarm message
    await this.emitChunk('Inicjuję Protokół Wilczej Zamieci (Wolf Swarm v3.0)... \n\n', false);
    await this.page.waitForTimeout(100);

    for (const agent of agents) {
      await this.simulateAgentResponse(agent);
      await this.page.waitForTimeout(50);
    }

    // Completion signal
    await this.emitChunk('\n[SWARM COMPLETED]', false);
    await this.emitChunk('', true);
  }

  /**
   * Simulate Ollama-style response
   */
  async simulateOllamaResponse(text: string, options: Omit<StreamOptions, 'eventType'> = {}): Promise<void> {
    await this.simulateTypingResponse(text, { ...options, eventType: 'ollama-event' });
  }

  /**
   * Simulate Gemini-style response
   */
  async simulateGeminiResponse(text: string, options: Omit<StreamOptions, 'eventType'> = {}): Promise<void> {
    await this.simulateTypingResponse(text, { ...options, eventType: 'gemini-stream' });
  }

  /**
   * Simulate a response with markdown content
   */
  async simulateMarkdownResponse(): Promise<void> {
    const markdown = `# Heading 1

This is a **bold** and *italic* text.

## Code Example

\`\`\`python
def hello():
    print("Hello, World!")
\`\`\`

### List

- Item 1
- Item 2
- Item 3

> This is a blockquote

| Column 1 | Column 2 |
|----------|----------|
| Value 1  | Value 2  |
`;
    await this.simulateTypingResponse(markdown, { chunkSize: 30 });
  }

  /**
   * Simulate a response with code block for execution
   */
  async simulateCodeResponse(language: string, code: string): Promise<void> {
    const response = `Oto kod do wykonania:

\`\`\`${language}
${code}
\`\`\`

Możesz go uruchomić klikając przycisk "Run".`;
    await this.simulateTypingResponse(response);
  }

  /**
   * Simulate a response with [EXECUTE: "cmd"] pattern
   */
  async simulateExecuteResponse(command: string, explanation: string = ''): Promise<void> {
    const response = `${explanation}

[EXECUTE: "${command}"]`;
    await this.simulateTypingResponse(response);
  }

  /**
   * Simulate connection timeout/error
   */
  async simulateTimeout(afterMs: number = 1000): Promise<void> {
    await this.page.waitForTimeout(afterMs);
    await this.emitError('Connection timeout');
  }

  /**
   * Simulate partial response then error
   */
  async simulatePartialThenError(partialText: string, error: string): Promise<void> {
    await this.emitChunk(partialText, false);
    await this.page.waitForTimeout(100);
    await this.emitError(error);
  }
}

/**
 * Create sample agent messages for Swarm testing
 */
export function createSwarmAgentMessages(): AgentMessage[] {
  return [
    {
      name: 'Dijkstra',
      message: 'Analizuję zadanie i tworzę strategię...',
      model: 'gemini:dynamic',
    },
    {
      name: 'Geralt',
      message: 'Sprawdzam bezpieczeństwo operacji. Nie wykryto zagrożeń.',
      model: 'qwen3:4b',
    },
    {
      name: 'Yennefer',
      message: 'Proponuję użycie wzorca projektowego Observer.',
      model: 'qwen3:4b',
    },
    {
      name: 'Triss',
      message: 'Przygotowuję testy jednostkowe dla nowej funkcjonalności.',
      model: 'qwen3:4b',
    },
    {
      name: 'Jaskier',
      message: 'Wszystko gotowe! Zadanie wykonane z powodzeniem.',
      model: 'qwen3:4b',
    },
  ];
}

/**
 * Create a quick stream simulator for a page
 */
export function createStreamSimulator(page: Page): StreamSimulator {
  return new StreamSimulator(page);
}

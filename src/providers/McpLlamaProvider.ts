/**
 * GeminiHydra - MCP Llama Provider
 * Provider that uses MCP llama-cpp tools for LLM operations
 *
 * Available MCP tools:
 * - llama_chat: Conversation with message history
 * - llama_generate: Text generation
 * - llama_json: Structured JSON output with schema
 * - llama_code: Code generation/analysis
 * - llama_analyze: Text analysis (sentiment, summary, etc.)
 * - llama_function_call: OpenAI-style function calling
 * - llama_vision: Image analysis
 * - llama_generate_fast: Speculative decoding for faster generation
 */

import type {
  LLMProvider,
  ExtendedLLMProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatMessage,
  McpLlamaConfig,
  McpModelId,
} from '../types/index.js';

// MCP tool result types
interface McpChatResult {
  content: string;
  model?: string;
}

interface McpGenerateResult {
  text: string;
  model?: string;
}

interface McpAnalyzeResult {
  sentiment?: { label: string; score: number };
  summary?: string;
  keywords?: string[];
  translation?: string;
  sourceLanguage?: string;
  entities?: Array<{ text: string; type: string }>;
  classification?: { category: string; confidence: number };
}

interface McpCodeResult {
  code?: string;
  explanation?: string;
  suggestions?: string[];
  review?: { issues: string[]; improvements: string[] };
}

/**
 * MCP Tool caller interface
 * This will be injected at runtime by the Swarm orchestrator
 */
export interface McpToolCaller {
  llama_chat(params: {
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    max_tokens?: number;
  }): Promise<McpChatResult>;

  llama_generate(params: {
    prompt: string;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    stop?: string[];
  }): Promise<McpGenerateResult>;

  llama_generate_fast(params: {
    prompt: string;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
  }): Promise<McpGenerateResult>;

  llama_json<T>(params: {
    prompt: string;
    schema: object;
    max_tokens?: number;
  }): Promise<T>;

  llama_analyze(params: {
    text: string;
    task: 'sentiment' | 'summary' | 'keywords' | 'classification' | 'translation' | 'entities';
    categories?: string[];
    target_language?: string;
  }): Promise<McpAnalyzeResult>;

  llama_code(params: {
    task: 'generate' | 'explain' | 'refactor' | 'document' | 'review' | 'fix';
    code?: string;
    description?: string;
    language?: string;
  }): Promise<McpCodeResult>;

  llama_vision(params: {
    image: string;
    prompt?: string;
    max_tokens?: number;
  }): Promise<{ description: string }>;

  llama_embed(params: {
    text?: string;
    texts?: string[];
  }): Promise<{ embeddings: number[][] }>;
}

/**
 * Default MCP tool caller that throws errors
 * Will be replaced by actual implementation at runtime
 */
let globalMcpCaller: McpToolCaller | null = null;

/**
 * Set the global MCP tool caller
 * This should be called once at application startup
 */
export function setMcpToolCaller(caller: McpToolCaller): void {
  globalMcpCaller = caller;
}

/**
 * Get the global MCP tool caller
 */
export function getMcpToolCaller(): McpToolCaller {
  if (!globalMcpCaller) {
    throw new Error('MCP tool caller not initialized. Call setMcpToolCaller() first.');
  }
  return globalMcpCaller;
}

/**
 * MCP Llama Provider
 * Implements LLMProvider interface using MCP llama-cpp tools
 */
export class McpLlamaProvider implements ExtendedLLMProvider {
  name = 'mcp-llama';
  model: string;
  private config: Required<McpLlamaConfig>;

  constructor(config: McpLlamaConfig = {}) {
    this.config = {
      defaultModel: config.defaultModel ?? 'main',
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 2048,
      useFastGeneration: config.useFastGeneration ?? false,
    };
    this.model = this.config.defaultModel;
  }

  isAvailable(): boolean {
    return globalMcpCaller !== null;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const mcp = getMcpToolCaller();
      // Simple health check - try to generate a single token
      await mcp.llama_generate({
        prompt: 'Hi',
        max_tokens: 1,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create chat completion using llama_chat MCP tool
   */
  async createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const mcp = getMcpToolCaller();

    const result = await mcp.llama_chat({
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: request.max_tokens ?? this.config.maxTokens,
    });

    return this.formatChatResponse(result.content, request.model);
  }

  /**
   * Create chat completion with streaming
   * Note: MCP tools don't support true streaming, so we simulate it
   */
  async *createChatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncIterable<ChatCompletionChunk> {
    const mcp = getMcpToolCaller();
    const prompt = this.messagesToPrompt(request.messages);

    let result: McpGenerateResult;

    if (this.config.useFastGeneration) {
      result = await mcp.llama_generate_fast({
        prompt,
        temperature: request.temperature ?? this.config.temperature,
        max_tokens: request.max_tokens ?? this.config.maxTokens,
        top_p: 0.95,
      });
    } else {
      result = await mcp.llama_generate({
        prompt,
        temperature: request.temperature ?? this.config.temperature,
        max_tokens: request.max_tokens ?? this.config.maxTokens,
        stop: request.stop,
      });
    }

    // Simulate streaming by yielding the full result as one chunk
    yield this.formatStreamChunk(result.text, false);
    yield this.formatStreamChunk('', true);
  }

  /**
   * Generate structured JSON output using llama_json
   */
  async generateJson<T>(prompt: string, schema: object): Promise<T> {
    const mcp = getMcpToolCaller();
    return await mcp.llama_json<T>({
      prompt,
      schema,
      max_tokens: this.config.maxTokens,
    });
  }

  /**
   * Analyze text using llama_analyze
   */
  async analyzeText(
    text: string,
    task: 'sentiment' | 'summary' | 'keywords' | 'classification' | 'translation' | 'entities',
    options?: { categories?: string[]; targetLanguage?: string }
  ): Promise<McpAnalyzeResult> {
    const mcp = getMcpToolCaller();
    return await mcp.llama_analyze({
      text,
      task,
      categories: options?.categories,
      target_language: options?.targetLanguage,
    });
  }

  /**
   * Generate or analyze code using llama_code
   */
  async analyzeCode(
    task: 'generate' | 'explain' | 'refactor' | 'document' | 'review' | 'fix',
    codeOrDescription: string,
    language?: string
  ): Promise<string> {
    const mcp = getMcpToolCaller();
    const result = await mcp.llama_code({
      task,
      code: task === 'generate' ? undefined : codeOrDescription,
      description: task === 'generate' ? codeOrDescription : undefined,
      language: language ?? 'typescript',
    });

    // Return the most relevant field based on task
    if (result.code) return result.code;
    if (result.explanation) return result.explanation;
    if (result.suggestions) return result.suggestions.join('\n');
    if (result.review) {
      return `Issues:\n${result.review.issues.join('\n')}\n\nImprovements:\n${result.review.improvements.join('\n')}`;
    }
    return JSON.stringify(result);
  }

  /**
   * Analyze image using llama_vision
   */
  async analyzeImage(imagePath: string, prompt?: string): Promise<string> {
    const mcp = getMcpToolCaller();
    const result = await mcp.llama_vision({
      image: imagePath,
      prompt: prompt ?? 'Describe this image in detail.',
      max_tokens: this.config.maxTokens,
    });
    return result.description;
  }

  /**
   * Get text embeddings using llama_embed
   */
  async getEmbeddings(texts: string[]): Promise<number[][]> {
    const mcp = getMcpToolCaller();
    const result = await mcp.llama_embed({ texts });
    return result.embeddings;
  }

  /**
   * Create a new provider instance with a different model
   */
  withModel(model: McpModelId): McpLlamaProvider {
    return new McpLlamaProvider({
      ...this.config,
      defaultModel: model,
    });
  }

  /**
   * Create a new provider instance with fast generation enabled
   */
  withFastGeneration(): McpLlamaProvider {
    return new McpLlamaProvider({
      ...this.config,
      useFastGeneration: true,
    });
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private messagesToPrompt(messages: ChatMessage[]): string {
    return messages
      .map(m => {
        switch (m.role) {
          case 'system':
            return `System: ${m.content}`;
          case 'user':
            return `User: ${m.content}`;
          case 'assistant':
            return `Assistant: ${m.content}`;
          default:
            return m.content;
        }
      })
      .join('\n\n') + '\n\nAssistant:';
  }

  private formatChatResponse(content: string, model?: string): ChatCompletionResponse {
    return {
      id: `mcp-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: model ?? this.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
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
  }

  private formatStreamChunk(content: string, isLast: boolean): ChatCompletionChunk {
    return {
      id: `mcp-stream-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: this.model,
      choices: [
        {
          index: 0,
          delta: isLast ? {} : { content },
          finish_reason: isLast ? 'stop' : null,
        },
      ],
    };
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create MCP Llama providers for all pipeline phases
 */
export function createMcpLlamaProviders(): {
  phaseA: McpLlamaProvider;
  phaseBA: McpLlamaProvider;
  phaseB: McpLlamaProvider;
  phaseC: McpLlamaProvider;
  phaseD: McpLlamaProvider;
} {
  return {
    // Phase A: Planning - use functionary for complex reasoning
    phaseA: new McpLlamaProvider({ defaultModel: 'functionary' }),
    // Phase B-A: Refinement - use main
    phaseBA: new McpLlamaProvider({ defaultModel: 'main' }),
    // Phase B: Execution - use main (can be changed based on difficulty)
    phaseB: new McpLlamaProvider({ defaultModel: 'main' }),
    // Phase C: Healing - use main
    phaseC: new McpLlamaProvider({ defaultModel: 'main' }),
    // Phase D: Synthesis - use main
    phaseD: new McpLlamaProvider({ defaultModel: 'main' }),
  };
}

/**
 * Create a single MCP Llama provider with custom config
 */
export function createMcpLlamaProvider(config?: McpLlamaConfig): McpLlamaProvider {
  return new McpLlamaProvider(config);
}

/**
 * Get recommended model for task difficulty
 */
export function getRecommendedModel(difficulty: 'simple' | 'moderate' | 'complex'): McpModelId {
  switch (difficulty) {
    case 'simple':
      return 'main';
    case 'moderate':
      return 'main';
    case 'complex':
      return 'functionary';
    default:
      return 'main';
  }
}

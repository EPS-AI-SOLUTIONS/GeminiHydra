/**
 * GeminiHydra - Serena Provider
 * LLMProvider wrapper that augments responses with Serena code intelligence
 * Enables semantic code operations for agents
 */

import type {
  LLMProvider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from '../types/index.js';
import { SerenaService, createSerenaService, type SerenaConfig } from '../mcp/index.js';

export interface SerenaProviderConfig {
  baseProvider: LLMProvider;
  serenaConfig?: SerenaConfig;
  enableTools?: boolean;
}

// Serena tools that can be called by the model
const SERENA_TOOLS = [
  {
    name: 'find_symbol',
    description: 'Find a symbol (function, class, variable) by name',
    parameters: {
      name: { type: 'string', description: 'Name of the symbol to find' },
      kind: { type: 'string', description: 'Optional: type of symbol (function, class, variable)' },
    },
    required: ['name'],
  },
  {
    name: 'find_referencing_symbols',
    description: 'Find all references to a symbol in the codebase',
    parameters: {
      symbol_name: { type: 'string', description: 'Name of the symbol to find references for' },
    },
    required: ['symbol_name'],
  },
  {
    name: 'get_symbols_overview',
    description: 'Get an overview of symbols in a file or directory',
    parameters: {
      path: { type: 'string', description: 'Optional path to analyze' },
    },
    required: [],
  },
  {
    name: 'read_file',
    description: 'Read the content of a file',
    parameters: {
      path: { type: 'string', description: 'Path to the file' },
    },
    required: ['path'],
  },
  {
    name: 'search_for_pattern',
    description: 'Search for a pattern in code',
    parameters: {
      pattern: { type: 'string', description: 'Pattern to search for' },
      path: { type: 'string', description: 'Optional path to search in' },
    },
    required: ['pattern'],
  },
  {
    name: 'insert_after_symbol',
    description: 'Insert code after a symbol',
    parameters: {
      symbol_name: { type: 'string', description: 'Name of the symbol' },
      content: { type: 'string', description: 'Code to insert' },
    },
    required: ['symbol_name', 'content'],
  },
  {
    name: 'replace_symbol_body',
    description: 'Replace the body of a function or class',
    parameters: {
      symbol_name: { type: 'string', description: 'Name of the symbol' },
      new_body: { type: 'string', description: 'New body content' },
    },
    required: ['symbol_name', 'new_body'],
  },
  {
    name: 'rename_symbol',
    description: 'Rename a symbol across the project',
    parameters: {
      old_name: { type: 'string', description: 'Current name' },
      new_name: { type: 'string', description: 'New name' },
    },
    required: ['old_name', 'new_name'],
  },
];

/**
 * Provider that wraps another provider and adds Serena code intelligence
 */
export class SerenaProvider implements LLMProvider {
  readonly name: string;
  readonly model: string;

  private baseProvider: LLMProvider;
  private serena: SerenaService;
  private enableTools: boolean;
  private connected = false;

  constructor(config: SerenaProviderConfig) {
    this.baseProvider = config.baseProvider;
    this.name = `serena+${config.baseProvider.name}`;
    this.model = config.baseProvider.model;
    this.enableTools = config.enableTools ?? true;
    this.serena = createSerenaService(config.serenaConfig);
  }

  /**
   * Ensure Serena is connected
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      this.connected = await this.serena.connect();
    }
  }

  isAvailable(): boolean {
    return this.baseProvider.isAvailable();
  }

  /**
   * Create chat completion with optional Serena tool calling
   */
  async createChatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    // If tools are enabled, check for tool calls in the response
    if (this.enableTools) {
      await this.ensureConnected();

      // Add system message about available Serena tools
      const enhancedMessages = this.addToolsContext(request.messages);

      // Get response from base provider
      const response = await this.baseProvider.createChatCompletion({
        ...request,
        messages: enhancedMessages,
      });

      // Check if response contains tool calls and execute them
      const content = response.choices[0]?.message?.content || '';
      const toolCallResult = await this.processToolCalls(content);

      if (toolCallResult) {
        // Add tool results and get final response
        const finalMessages = [
          ...enhancedMessages,
          { role: 'assistant' as const, content },
          { role: 'user' as const, content: `Tool result:\n${toolCallResult}` },
        ];

        return this.baseProvider.createChatCompletion({
          ...request,
          messages: finalMessages,
        });
      }

      return response;
    }

    return this.baseProvider.createChatCompletion(request);
  }

  /**
   * Create streaming chat completion
   */
  async *createChatCompletionStream(
    request: ChatCompletionRequest
  ): AsyncIterable<ChatCompletionChunk> {
    if (this.baseProvider.createChatCompletionStream) {
      if (this.enableTools) {
        await this.ensureConnected();
        const enhancedMessages = this.addToolsContext(request.messages);
        yield* this.baseProvider.createChatCompletionStream({
          ...request,
          messages: enhancedMessages,
        });
      } else {
        yield* this.baseProvider.createChatCompletionStream(request);
      }
    }
  }

  /**
   * Add Serena tools context to messages
   */
  private addToolsContext(
    messages: ChatCompletionRequest['messages']
  ): ChatCompletionRequest['messages'] {
    const toolsDescription = SERENA_TOOLS.map(
      (t) => `- ${t.name}: ${t.description}`
    ).join('\n');

    const systemMessage = messages.find((m) => m.role === 'system');
    const otherMessages = messages.filter((m) => m.role !== 'system');

    const toolsContext = `
You have access to Serena code intelligence tools. To use a tool, include a JSON block in your response:
\`\`\`serena
{"tool": "tool_name", "args": {"param": "value"}}
\`\`\`

Available tools:
${toolsDescription}

Use these tools when you need to:
- Find or analyze code symbols
- Search for patterns in the codebase
- Read file contents
- Modify code (insert, replace, rename)
`;

    const enhancedSystem = systemMessage
      ? { ...systemMessage, content: `${systemMessage.content}\n\n${toolsContext}` }
      : { role: 'system' as const, content: toolsContext };

    return [enhancedSystem, ...otherMessages];
  }

  /**
   * Process tool calls in response content
   */
  private async processToolCalls(content: string): Promise<string | null> {
    const toolCallRegex = /```serena\s*([\s\S]*?)```/g;
    const matches = [...content.matchAll(toolCallRegex)];

    if (matches.length === 0) return null;

    const results: string[] = [];

    for (const match of matches) {
      try {
        const toolCall = JSON.parse(match[1].trim()) as {
          tool: string;
          args: Record<string, unknown>;
        };

        console.log(`[Serena] Calling tool: ${toolCall.tool}`);
        const result = await this.serena.callTool(toolCall.tool, toolCall.args);
        results.push(`[${toolCall.tool}]:\n${result}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.push(`[Error]: ${errorMsg}`);
      }
    }

    return results.join('\n\n');
  }

  /**
   * Direct access to Serena service for manual operations
   */
  getSerena(): SerenaService {
    return this.serena;
  }

  /**
   * Disconnect Serena
   */
  async disconnect(): Promise<void> {
    await this.serena.disconnect();
    this.connected = false;
  }
}

/**
 * Create Serena-enhanced provider
 */
export function createSerenaProvider(
  baseProvider: LLMProvider,
  serenaConfig?: SerenaConfig
): SerenaProvider {
  return new SerenaProvider({
    baseProvider,
    serenaConfig,
    enableTools: true,
  });
}

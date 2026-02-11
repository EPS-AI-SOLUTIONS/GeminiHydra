/**
 * SerenaAgent - Dedicated agent for code intelligence using REAL Serena MCP server
 *
 * This agent ALWAYS uses the actual Serena MCP server (not NativeCodeIntelligence).
 * It provides LSP-powered code intelligence capabilities through the MCP protocol.
 *
 * Agent: Serena (Code Intelligence Specialist)
 */

import chalk from 'chalk';
import { mcpManager } from '../mcp/index.js';

// ============================================================
// Serena MCP Tool Names
// ============================================================

/**
 * All available Serena MCP tools
 * These are the REAL tools from the Serena Python MCP server
 */
export const SERENA_TOOLS = {
  // Symbol Tools (symbol_tools.py)
  FIND_SYMBOL: 'serena__find_symbol',
  GET_SYMBOLS_OVERVIEW: 'serena__get_symbols_overview',
  FIND_REFERENCING_SYMBOLS: 'serena__find_referencing_symbols',
  REPLACE_SYMBOL_BODY: 'serena__replace_symbol_body',
  INSERT_AFTER_SYMBOL: 'serena__insert_after_symbol',
  INSERT_BEFORE_SYMBOL: 'serena__insert_before_symbol',
  RENAME_SYMBOL: 'serena__rename_symbol',

  // File Tools (file_tools.py)
  READ_FILE: 'serena__read_file',
  LIST_DIR: 'serena__list_dir',
  FIND_FILE: 'serena__find_file',
  SEARCH_FOR_PATTERN: 'serena__search_for_pattern',
  REPLACE_CONTENT: 'serena__replace_content',
  CREATE_TEXT_FILE: 'serena__create_text_file',

  // Memory Tools (memory_tools.py)
  LIST_MEMORIES: 'serena__list_memories',
  READ_MEMORY: 'serena__read_memory',
  WRITE_MEMORY: 'serena__write_memory',
  DELETE_MEMORY: 'serena__delete_memory',

  // Config/Workflow Tools (config_tools.py, workflow_tools.py)
  ACTIVATE_PROJECT: 'serena__activate_project',
  ADD_PROJECT: 'serena__add_project',
  INITIAL_INSTRUCTIONS: 'serena__initial_instructions',
} as const;

// ============================================================
// Types
// ============================================================

export interface SerenaSymbol {
  name: string;
  kind: string;
  location: {
    uri: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  };
  body?: string;
  info?: string;
}

export interface SerenaSearchResult {
  file: string;
  line: number;
  column: number;
  match: string;
  context?: string;
}

export interface SerenaAgentStatus {
  connected: boolean;
  serverName: string;
  tools: string[];
  projectRoot: string;
}

// ============================================================
// SerenaAgent Class
// ============================================================

export class SerenaAgent {
  private initialized: boolean = false;
  private projectRoot: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
  }

  // ============================================================
  // Connection Management
  // ============================================================

  /**
   * Ensure Serena MCP server is connected
   */
  async ensureConnection(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      // Initialize MCP with project root
      await mcpManager.init({ projectRoot: this.projectRoot });

      // Check if Serena server is connected
      const status = mcpManager.getServerStatus('serena');
      if (status !== 'connected') {
        console.log(chalk.yellow('[SerenaAgent] Serena MCP not connected'));
        console.log(chalk.gray('[SerenaAgent] Make sure serena server is configured in .mcp.json'));
        return false;
      }

      this.initialized = true;
      console.log(chalk.green('[SerenaAgent] Connected to real Serena MCP server'));
      return true;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`[SerenaAgent] Connection failed: ${msg}`));
      return false;
    }
  }

  /**
   * Execute a Serena MCP tool directly
   */
  async callSerenaTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    const connected = await this.ensureConnection();
    if (!connected) {
      throw new Error('Serena MCP server not connected');
    }

    console.log(chalk.cyan(`[SerenaAgent] Calling ${toolName}...`));

    try {
      const result = await mcpManager.callTool(toolName, params);

      if (!result.success || result.isError) {
        const contentArray = result.content as Array<{ type?: string; text?: string }> | undefined;
        const errorText = contentArray?.[0]?.text || 'Unknown error';
        throw new Error(`Serena tool failed: ${errorText}`);
      }

      // Extract content from MCP result
      if (result.content && Array.isArray(result.content)) {
        const textContent = result.content.find((c: Record<string, unknown>) => c.type === 'text');
        if (textContent) {
          try {
            return JSON.parse(textContent.text);
          } catch {
            return textContent.text;
          }
        }
      }

      return result.content;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`[SerenaAgent] Tool error: ${msg}`));
      throw error;
    }
  }

  // ============================================================
  // Symbol Operations (LSP-powered)
  // ============================================================

  /**
   * Find symbols by pattern using LSP
   */
  async findSymbol(
    pattern: string,
    options?: {
      relativePath?: string;
      includeBody?: boolean;
      includeInfo?: boolean;
      depth?: number;
    },
  ): Promise<SerenaSymbol[]> {
    return (await this.callSerenaTool(SERENA_TOOLS.FIND_SYMBOL, {
      name_path_pattern: pattern,
      relative_path: options?.relativePath || '',
      include_body: options?.includeBody ?? false,
      include_info: options?.includeInfo ?? true,
      depth: options?.depth ?? 0,
    })) as SerenaSymbol[];
  }

  /**
   * Get symbols overview (outline) of a file
   */
  async getSymbolsOverview(relativePath: string, depth: number = 0): Promise<unknown> {
    return this.callSerenaTool(SERENA_TOOLS.GET_SYMBOLS_OVERVIEW, {
      relative_path: relativePath,
      depth,
    });
  }

  /**
   * Find all references to a symbol
   */
  async findReferences(namePath: string, relativePath: string): Promise<unknown[]> {
    return (await this.callSerenaTool(SERENA_TOOLS.FIND_REFERENCING_SYMBOLS, {
      name_path: namePath,
      relative_path: relativePath,
    })) as unknown[];
  }

  /**
   * Rename a symbol across the project
   */
  async renameSymbol(namePath: string, relativePath: string, newName: string): Promise<string> {
    return (await this.callSerenaTool(SERENA_TOOLS.RENAME_SYMBOL, {
      name_path: namePath,
      relative_path: relativePath,
      new_name: newName,
    })) as string;
  }

  /**
   * Replace the body of a symbol
   */
  async replaceSymbolBody(namePath: string, relativePath: string, newBody: string): Promise<void> {
    await this.callSerenaTool(SERENA_TOOLS.REPLACE_SYMBOL_BODY, {
      name_path: namePath,
      relative_path: relativePath,
      body: newBody,
    });
  }

  /**
   * Insert content after a symbol
   */
  async insertAfterSymbol(namePath: string, relativePath: string, content: string): Promise<void> {
    await this.callSerenaTool(SERENA_TOOLS.INSERT_AFTER_SYMBOL, {
      name_path: namePath,
      relative_path: relativePath,
      body: content,
    });
  }

  /**
   * Insert content before a symbol
   */
  async insertBeforeSymbol(namePath: string, relativePath: string, content: string): Promise<void> {
    await this.callSerenaTool(SERENA_TOOLS.INSERT_BEFORE_SYMBOL, {
      name_path: namePath,
      relative_path: relativePath,
      body: content,
    });
  }

  // ============================================================
  // Search Operations
  // ============================================================

  /**
   * Search for pattern in code using regex
   */
  async searchPattern(
    pattern: string,
    options?: {
      relativePath?: string;
      filePattern?: string;
      restrictToCode?: boolean;
    },
  ): Promise<SerenaSearchResult[]> {
    return (await this.callSerenaTool(SERENA_TOOLS.SEARCH_FOR_PATTERN, {
      substring_pattern: pattern,
      relative_path: options?.relativePath,
      file_pattern: options?.filePattern,
      restrict_search_to_code_files: options?.restrictToCode ?? true,
    })) as SerenaSearchResult[];
  }

  // ============================================================
  // File Operations
  // ============================================================

  /**
   * Read file contents
   */
  async readFile(relativePath: string): Promise<string> {
    return (await this.callSerenaTool(SERENA_TOOLS.READ_FILE, {
      relative_path: relativePath,
    })) as string;
  }

  /**
   * List directory contents
   */
  async listDir(relativePath: string = '.'): Promise<unknown> {
    return this.callSerenaTool(SERENA_TOOLS.LIST_DIR, {
      relative_path: relativePath,
    });
  }

  /**
   * Find files by pattern
   */
  async findFile(pattern: string, relativePath?: string): Promise<string[]> {
    return (await this.callSerenaTool(SERENA_TOOLS.FIND_FILE, {
      pattern,
      relative_path: relativePath,
    })) as string[];
  }

  /**
   * Replace content in a file
   */
  async replaceContent(
    relativePath: string,
    oldContent: string,
    newContent: string,
  ): Promise<void> {
    await this.callSerenaTool(SERENA_TOOLS.REPLACE_CONTENT, {
      relative_path: relativePath,
      old_content: oldContent,
      new_content: newContent,
    });
  }

  /**
   * Create a new text file
   */
  async createFile(relativePath: string, content: string): Promise<void> {
    await this.callSerenaTool(SERENA_TOOLS.CREATE_TEXT_FILE, {
      relative_path: relativePath,
      content,
    });
  }

  // ============================================================
  // Memory Operations (Serena's .serena/memories/)
  // ============================================================

  /**
   * List all memories
   */
  async listMemories(): Promise<string[]> {
    return (await this.callSerenaTool(SERENA_TOOLS.LIST_MEMORIES, {})) as string[];
  }

  /**
   * Read a memory by name
   */
  async readMemory(name: string): Promise<string> {
    return (await this.callSerenaTool(SERENA_TOOLS.READ_MEMORY, { name })) as string;
  }

  /**
   * Write/update a memory
   */
  async writeMemory(name: string, content: string): Promise<void> {
    await this.callSerenaTool(SERENA_TOOLS.WRITE_MEMORY, { name, content });
  }

  /**
   * Delete a memory
   */
  async deleteMemory(name: string): Promise<void> {
    await this.callSerenaTool(SERENA_TOOLS.DELETE_MEMORY, { name });
  }

  // ============================================================
  // Project Management
  // ============================================================

  /**
   * Activate a Serena project
   */
  async activateProject(projectName: string): Promise<void> {
    await this.callSerenaTool(SERENA_TOOLS.ACTIVATE_PROJECT, {
      project: projectName,
    });
  }

  /**
   * Get initial instructions from Serena
   */
  async getInitialInstructions(): Promise<string> {
    return (await this.callSerenaTool(SERENA_TOOLS.INITIAL_INSTRUCTIONS, {})) as string;
  }

  // ============================================================
  // Status & Info
  // ============================================================

  /**
   * Check if connected to Serena MCP
   */
  isConnected(): boolean {
    return this.initialized;
  }

  /**
   * Get agent status
   */
  getStatus(): SerenaAgentStatus {
    return {
      connected: this.initialized,
      serverName: 'serena',
      tools: Object.values(SERENA_TOOLS),
      projectRoot: this.projectRoot,
    };
  }

  /**
   * Get list of available Serena MCP tools
   */
  getAvailableTools(): string[] {
    return Object.values(SERENA_TOOLS);
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const serenaAgent = new SerenaAgent();
export default serenaAgent;

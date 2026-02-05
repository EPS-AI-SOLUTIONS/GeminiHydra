/**
 * GeminiHydra - Serena Service
 * High-level wrapper for Serena MCP tools
 * Provides semantic code operations: find symbols, edit code, navigate references
 */

import { McpClient, McpTool, McpToolCallResult, createSerenaClient } from './McpClient.js';

// Serena tool result types
export interface SymbolInfo {
  name: string;
  kind: string;
  location: {
    file: string;
    line: number;
    column?: number;
  };
  documentation?: string;
}

export interface FileInfo {
  path: string;
  size?: number;
  modified?: string;
}

export interface SerenaConfig {
  projectPath?: string;
  autoConnect?: boolean;
}

export class SerenaService {
  private client: McpClient;
  private connected = false;
  private projectPath: string;

  constructor(config: SerenaConfig = {}) {
    this.projectPath = config.projectPath || process.cwd();
    this.client = createSerenaClient(this.projectPath);

    if (config.autoConnect) {
      this.connect().catch((err) => {
        console.error('[Serena] Auto-connect failed:', err.message);
      });
    }
  }

  /**
   * Connect to Serena MCP server
   */
  async connect(): Promise<boolean> {
    if (this.connected) return true;

    try {
      console.log(`[Serena] Connecting to project: ${this.projectPath}`);
      await this.client.connect();
      this.connected = true;
      console.log('[Serena] Connected successfully');
      return true;
    } catch (err) {
      console.error('[Serena] Connection failed:', err);
      return false;
    }
  }

  /**
   * Ensure connected before operations
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      const success = await this.connect();
      if (!success) {
        throw new Error('Failed to connect to Serena');
      }
    }
  }

  /**
   * Get available Serena tools
   */
  async getTools(): Promise<McpTool[]> {
    await this.ensureConnected();
    return this.client.getTools();
  }

  /**
   * Find symbol by name (function, class, variable, etc.)
   * Uses name_path_pattern for Serena API
   */
  async findSymbol(namePathPattern: string, includeBody: boolean = false, depth?: number): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('find_symbol', {
      name_path_pattern: namePathPattern,
      include_body: includeBody,
      ...(depth !== undefined && { depth }),
    });
    return this.extractText(result);
  }

  /**
   * Find all references to a symbol
   */
  async findReferencingSymbols(namePath: string): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('find_referencing_symbols', {
      name_path: namePath,
    });
    return this.extractText(result);
  }

  /**
   * Get overview of symbols in a file or directory
   */
  async getSymbolsOverview(relativePath: string = '.'): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('get_symbols_overview', {
      relative_path: relativePath,
    });
    return this.extractText(result);
  }

  /**
   * Read file content
   */
  async readFile(relativePath: string): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('read_file', {
      relative_path: relativePath,
    });
    return this.extractText(result);
  }

  /**
   * List directory contents
   */
  async listDir(relativePath: string = '.', recursive: boolean = false): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('list_dir', {
      relative_path: relativePath,
      recursive,
    });
    return this.extractText(result);
  }

  /**
   * Find file by name pattern
   */
  async findFile(fileMask: string, relativePath?: string): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('find_file', {
      file_mask: fileMask,
      ...(relativePath && { relative_path: relativePath }),
    });
    return this.extractText(result);
  }

  /**
   * Search for pattern in code (uses substring_pattern)
   */
  async searchForPattern(substringPattern: string, relativePath?: string): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('search_for_pattern', {
      substring_pattern: substringPattern,
      ...(relativePath && { relative_path: relativePath }),
    });
    return this.extractText(result);
  }

  /**
   * Insert code after a symbol
   */
  async insertAfterSymbol(namePath: string, content: string): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('insert_after_symbol', {
      name_path: namePath,
      content,
    });
    return this.extractText(result);
  }

  /**
   * Insert code before a symbol
   */
  async insertBeforeSymbol(namePath: string, content: string): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('insert_before_symbol', {
      name_path: namePath,
      content,
    });
    return this.extractText(result);
  }

  /**
   * Replace symbol body (function/class implementation)
   */
  async replaceSymbolBody(namePath: string, newBody: string): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('replace_symbol_body', {
      name_path: namePath,
      new_body: newBody,
    });
    return this.extractText(result);
  }

  /**
   * Replace content in file
   */
  async replaceContent(
    relativePath: string,
    pattern: string,
    replacement: string,
    useRegex: boolean = false
  ): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('replace_content', {
      relative_path: relativePath,
      pattern,
      replacement,
      use_regex: useRegex,
    });
    return this.extractText(result);
  }

  /**
   * Rename a symbol across the project
   */
  async renameSymbol(namePath: string, newName: string): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('rename_symbol', {
      name_path: namePath,
      new_name: newName,
    });
    return this.extractText(result);
  }

  /**
   * Create a new text file
   */
  async createTextFile(relativePath: string, content: string): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('create_text_file', {
      relative_path: relativePath,
      content,
    });
    return this.extractText(result);
  }

  /**
   * Execute shell command
   */
  async executeShellCommand(command: string): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('execute_shell_command', {
      command,
    });
    return this.extractText(result);
  }

  /**
   * Activate a project by name (from serena_config.yml)
   */
  async activateProject(projectName: string): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool('activate_project', {
      project: projectName,
    });
    return this.extractText(result);
  }

  /**
   * Call any tool by name
   */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<string> {
    await this.ensureConnected();
    const result = await this.client.callTool(name, args);
    return this.extractText(result);
  }

  /**
   * Extract text content from MCP tool result
   */
  private extractText(result: McpToolCallResult): string {
    if (result.isError) {
      const errorText = result.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('\n');
      throw new Error(errorText || 'Unknown error');
    }

    return result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
  }

  /**
   * Disconnect from Serena
   */
  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
      console.log('[Serena] Disconnected');
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton instance
let serenaInstance: SerenaService | null = null;

/**
 * Get or create Serena service instance
 */
export function getSerenaService(config?: SerenaConfig): SerenaService {
  if (!serenaInstance) {
    serenaInstance = new SerenaService(config);
  }
  return serenaInstance;
}

/**
 * Create new Serena service instance
 */
export function createSerenaService(config?: SerenaConfig): SerenaService {
  return new SerenaService(config);
}

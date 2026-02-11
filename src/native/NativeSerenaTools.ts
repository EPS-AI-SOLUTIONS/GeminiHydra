/**
 * NativeSerenaTools - Unified registry of native Serena-compatible tools
 *
 * Provides all Serena MCP tools as native TypeScript implementations:
 * - Symbol operations (find_symbol, get_symbols_overview, find_referencing_symbols)
 * - File operations (find_file, list_dir, read_file, create_file)
 * - Search operations (search_for_pattern)
 * - Memory operations (read_memory, write_memory, list_memories, delete_memory)
 * - Edit operations (replace_content, replace_symbol_body, insert_before/after_symbol)
 */

import chalk from 'chalk';
import type { MCPToolInputSchema } from '../mcp/MCPTypes.js';
import { type NativeCodeIntelligence, nativeCodeIntelligence } from './NativeCodeIntelligence.js';
import { createGlob, type GlobOptions, type NativeGlob } from './NativeGlob.js';
import { createGrep, type GrepOptions, type NativeGrep } from './NativeGrep.js';

// ============================================================
// Types
// ============================================================

export interface NativeToolDefinition {
  /** Tool name (without server prefix) */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for input parameters */
  inputSchema: MCPToolInputSchema;
  /** Handler function */
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export interface NativeToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface NativeSerenaToolsConfig {
  rootDir: string;
  enableLSP?: boolean;
}

// ============================================================
// Tool Definitions
// ============================================================

function createToolDefinitions(
  nativeGlob: NativeGlob,
  nativeGrep: NativeGrep,
  nativeCode: NativeCodeIntelligence,
): NativeToolDefinition[] {
  return [
    // ========================================================
    // Symbol Operations
    // ========================================================
    {
      name: 'find_symbol',
      description:
        'Find symbol by name across workspace using LSP or regex fallback. Returns symbol locations, types, and signatures.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Symbol name or pattern to search for',
          },
          kind: {
            type: 'string',
            description:
              'Filter by symbol kind: function, class, interface, type, variable, method',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results to return (default: 50)',
          },
        },
        required: ['pattern'],
      },
      handler: async (params) => {
        const symbols = await nativeCode.findSymbol(params.pattern as string);

        // Filter by kind if specified
        let filtered = symbols;
        if (params.kind) {
          const kindLower = (params.kind as string).toLowerCase();
          filtered = symbols.filter((s) => {
            const symbolKind = getSymbolKindName(s.kind).toLowerCase();
            return symbolKind.includes(kindLower);
          });
        }

        // Limit results
        const maxResults = (params.maxResults as number) || 50;
        return filtered.slice(0, maxResults);
      },
    },

    {
      name: 'get_symbols_overview',
      description:
        'Get an overview of all symbols (classes, functions, variables) defined in file(s). Useful for understanding code structure.',
      inputSchema: {
        type: 'object',
        properties: {
          patterns: {
            type: 'array',
            description: 'File glob patterns to analyze (e.g., ["**/*.ts", "src/**/*.js"])',
          },
          depth: {
            type: 'number',
            description: 'Depth of nested symbols to include (0 = top-level only)',
          },
        },
      },
      handler: async (params) => {
        const patterns = (params.patterns as string[] | undefined) || ['**/*.{ts,tsx,js,jsx}'];
        return nativeCode.getSymbolsOverview(patterns);
      },
    },

    {
      name: 'find_referencing_symbols',
      description:
        'Find all references to a symbol at a specific location. Returns symbols that reference the target.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'File containing the symbol (relative to project root)',
          },
          line: {
            type: 'number',
            description: 'Line number (1-indexed)',
          },
          character: {
            type: 'number',
            description: 'Column position (0-indexed)',
          },
        },
        required: ['filePath', 'line', 'character'],
      },
      handler: async (params) => {
        // Convert to 0-indexed for LSP
        const line = Number(params.line) - 1;
        return nativeCode.findReferences(params.filePath as string, line, Number(params.character));
      },
    },

    // ========================================================
    // File Operations
    // ========================================================
    {
      name: 'find_file',
      description:
        'Find files matching glob pattern. Supports patterns like "**/*.ts", "{src,lib}/**/*.{js,jsx}", "!**/node_modules/**"',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern to match files',
          },
          ignore: {
            type: 'array',
            description: 'Patterns to ignore (e.g., ["**/node_modules/**"])',
          },
          maxDepth: {
            type: 'number',
            description: 'Maximum directory depth to search',
          },
          sortByMtime: {
            type: 'boolean',
            description: 'Sort results by modification time (newest first)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results',
          },
        },
        required: ['pattern'],
      },
      handler: async (params) => {
        const options: GlobOptions = {
          pattern: params.pattern as string,
          ignore: params.ignore as string[] | undefined,
          maxDepth: params.maxDepth as number | undefined,
          sortByMtime: params.sortByMtime !== false,
          limit: params.limit as number | undefined,
        };

        const results = await nativeGlob.glob(options);
        return results.map((r) => ({
          path: r.relativePath,
          mtime: r.mtime?.toISOString(),
          size: r.size,
        }));
      },
    },

    {
      name: 'list_dir',
      description: 'List directory contents with optional recursion and file filtering.',
      inputSchema: {
        type: 'object',
        properties: {
          relative_path: {
            type: 'string',
            description: 'Directory path relative to project root (use "." for root)',
          },
          recursive: {
            type: 'boolean',
            description: 'Whether to list recursively',
          },
          file_mask: {
            type: 'string',
            description: 'File pattern filter (e.g., "*.ts")',
          },
        },
      },
      handler: async (params) => {
        const dirPath = (params.relative_path as string) || '.';
        const entries = await nativeCode.listDir(dirPath);

        // Filter by file_mask if provided
        if (params.file_mask) {
          const pattern = (params.file_mask as string).replace(/\*/g, '.*').replace(/\?/g, '.');
          const regex = new RegExp(`^${pattern}$`, 'i');
          return {
            entries: entries.filter((e) => e.type === 'directory' || regex.test(e.name)),
          };
        }

        return { entries };
      },
    },

    {
      name: 'read_file',
      description:
        'Read file contents. For code files, symbolic operations like find_symbol are preferred.',
      inputSchema: {
        type: 'object',
        properties: {
          relative_path: {
            type: 'string',
            description: 'File path relative to project root',
          },
          start_line: {
            type: 'number',
            description: 'Start line (0-indexed, optional)',
          },
          end_line: {
            type: 'number',
            description: 'End line (0-indexed, inclusive, optional)',
          },
        },
        required: ['relative_path'],
      },
      handler: async (params) => {
        // BUG-008 FIX: Handle multiple param names for path
        const filePath = (params.relative_path || params.path || params.file || params.filename) as
          | string
          | undefined;

        if (!filePath) {
          throw new Error(`read_file requires a path. Received params: ${JSON.stringify(params)}`);
        }

        const content = await nativeCode.readFile(filePath);

        if (params.start_line !== undefined || params.end_line !== undefined) {
          const lines = content.split('\n');
          const start = (params.start_line as number) || 0;
          const end =
            params.end_line !== undefined ? (params.end_line as number) + 1 : lines.length;
          return lines.slice(start, end).join('\n');
        }

        return content;
      },
    },

    {
      name: 'create_text_file',
      description: 'Create or overwrite a text file.',
      inputSchema: {
        type: 'object',
        properties: {
          relative_path: {
            type: 'string',
            description: 'File path relative to project root',
          },
          content: {
            type: 'string',
            description: 'Content to write',
          },
        },
        required: ['relative_path', 'content'],
      },
      handler: async (params) => {
        await nativeCode.createFile(params.relative_path as string, params.content as string);
        return { success: true, path: params.relative_path as string };
      },
    },

    // ========================================================
    // Search Operations
    // ========================================================
    {
      name: 'search_for_pattern',
      description:
        'Search for regex pattern in files (grep-like). Supports context lines, case insensitivity, and file type filtering.',
      inputSchema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Regex pattern to search for',
          },
          glob: {
            type: 'string',
            description: 'File glob pattern filter (e.g., "**/*.ts")',
          },
          type: {
            type: 'string',
            description: 'File type: js, ts, py, rust, go, java, etc.',
          },
          ignoreCase: {
            type: 'boolean',
            description: 'Case insensitive search',
          },
          multiline: {
            type: 'boolean',
            description: 'Enable multiline matching (pattern can span lines)',
          },
          context: {
            type: 'number',
            description: 'Number of context lines before and after match',
          },
          outputMode: {
            type: 'string',
            description: 'Output mode: content (default), files_with_matches, count',
          },
          maxResults: {
            type: 'number',
            description: 'Maximum number of results',
          },
        },
        required: ['pattern'],
      },
      handler: async (params) => {
        // BUG-007 FIX: Accept both 'pattern' and 'substring_pattern' (Serena MCP compatibility)
        const searchPattern = (params.pattern ||
          params.substring_pattern ||
          params.query ||
          '') as string;

        if (!searchPattern) {
          throw new Error(
            `search_for_pattern requires a pattern. Received params: ${JSON.stringify(params)}`,
          );
        }

        const options: GrepOptions = {
          pattern: searchPattern,
          glob: params.glob as string | undefined,
          type: params.type as string | undefined,
          ignoreCase: params.ignoreCase as boolean | undefined,
          multiline: params.multiline as boolean | undefined,
          context: params.context as number | undefined,
          outputMode: (params.outputMode as GrepOptions['outputMode']) || 'content',
          maxResults: (params.maxResults as number) || 100,
        };

        return nativeGrep.grep(options);
      },
    },

    // ========================================================
    // Edit Operations
    // ========================================================
    {
      name: 'replace_content',
      description: 'Replace content in a file using literal string or regex pattern.',
      inputSchema: {
        type: 'object',
        properties: {
          relative_path: {
            type: 'string',
            description: 'File path relative to project root',
          },
          needle: {
            type: 'string',
            description: 'String or regex pattern to search for',
          },
          replacement: {
            type: 'string',
            description: 'Replacement text',
          },
          mode: {
            type: 'string',
            description: 'Search mode: literal or regex (default: literal)',
          },
          replaceAll: {
            type: 'boolean',
            description: 'Replace all occurrences (default: false)',
          },
        },
        required: ['relative_path', 'needle', 'replacement'],
      },
      handler: async (params) => {
        const result = await nativeCode.replaceContent(
          params.relative_path as string,
          params.needle as string,
          params.replacement as string,
          {
            isRegex: (params.mode as string) === 'regex',
            replaceAll: (params.replaceAll as boolean) || false,
          },
        );
        return result;
      },
    },

    {
      name: 'replace_symbol_body',
      description: 'Replace the entire body of a symbol (function, class, etc.).',
      inputSchema: {
        type: 'object',
        properties: {
          relative_path: {
            type: 'string',
            description: 'File path containing the symbol',
          },
          symbol_name: {
            type: 'string',
            description: 'Name of the symbol to replace',
          },
          new_body: {
            type: 'string',
            description: 'New symbol body (including signature)',
          },
        },
        required: ['relative_path', 'symbol_name', 'new_body'],
      },
      handler: async (params) => {
        return nativeCode.replaceSymbolBody(
          params.relative_path as string,
          params.symbol_name as string,
          params.new_body as string,
        );
      },
    },

    {
      name: 'insert_before_symbol',
      description: 'Insert content before a symbol definition.',
      inputSchema: {
        type: 'object',
        properties: {
          relative_path: {
            type: 'string',
            description: 'File path containing the symbol',
          },
          symbol_name: {
            type: 'string',
            description: 'Name of the symbol',
          },
          content: {
            type: 'string',
            description: 'Content to insert',
          },
        },
        required: ['relative_path', 'symbol_name', 'content'],
      },
      handler: async (params) => {
        return nativeCode.insertBeforeSymbol(
          params.relative_path as string,
          params.symbol_name as string,
          params.content as string,
        );
      },
    },

    {
      name: 'insert_after_symbol',
      description: 'Insert content after a symbol definition.',
      inputSchema: {
        type: 'object',
        properties: {
          relative_path: {
            type: 'string',
            description: 'File path containing the symbol',
          },
          symbol_name: {
            type: 'string',
            description: 'Name of the symbol',
          },
          content: {
            type: 'string',
            description: 'Content to insert',
          },
        },
        required: ['relative_path', 'symbol_name', 'content'],
      },
      handler: async (params) => {
        return nativeCode.insertAfterSymbol(
          params.relative_path as string,
          params.symbol_name as string,
          params.content as string,
        );
      },
    },

    // ========================================================
    // Memory Operations
    // ========================================================
    {
      name: 'list_memories',
      description: 'List all project memories/notes.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        return nativeCode.listMemories();
      },
    },

    {
      name: 'read_memory',
      description: 'Read a specific memory by key.',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Memory key to read',
          },
        },
        required: ['key'],
      },
      handler: async (params) => {
        const value = await nativeCode.readMemory(params.key as string);
        return value !== null
          ? { key: params.key as string, value }
          : { error: 'Memory not found' };
      },
    },

    {
      name: 'write_memory',
      description: 'Write/update a project memory.',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Memory key',
          },
          value: {
            type: 'string',
            description: 'Memory value/content',
          },
        },
        required: ['key', 'value'],
      },
      handler: async (params) => {
        await nativeCode.writeMemory(params.key as string, params.value as string);
        return { success: true, key: params.key as string };
      },
    },

    {
      name: 'delete_memory',
      description: 'Delete a project memory.',
      inputSchema: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            description: 'Memory key to delete',
          },
        },
        required: ['key'],
      },
      handler: async (params) => {
        const deleted = await nativeCode.deleteMemory(params.key as string);
        return { success: deleted, key: params.key as string };
      },
    },

    // ========================================================
    // Navigation Operations
    // ========================================================
    {
      name: 'go_to_definition',
      description: 'Go to definition of symbol at position.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'File path',
          },
          line: {
            type: 'number',
            description: 'Line number (1-indexed)',
          },
          character: {
            type: 'number',
            description: 'Column (0-indexed)',
          },
        },
        required: ['filePath', 'line', 'character'],
      },
      handler: async (params) => {
        const line = Number(params.line) - 1; // Convert to 0-indexed
        return nativeCode.goToDefinition(params.filePath as string, line, Number(params.character));
      },
    },

    {
      name: 'rename_symbol',
      description: 'Rename a symbol across the entire project.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'File containing the symbol',
          },
          line: {
            type: 'number',
            description: 'Line number (1-indexed)',
          },
          character: {
            type: 'number',
            description: 'Column (0-indexed)',
          },
          newName: {
            type: 'string',
            description: 'New name for the symbol',
          },
        },
        required: ['filePath', 'line', 'character', 'newName'],
      },
      handler: async (params) => {
        const line = Number(params.line) - 1; // Convert to 0-indexed
        return nativeCode.renameSymbol(
          params.filePath as string,
          line,
          Number(params.character),
          params.newName as string,
        );
      },
    },
  ];
}

// ============================================================
// Helper Functions
// ============================================================

function getSymbolKindName(kind: number): string {
  const names: Record<number, string> = {
    1: 'File',
    2: 'Module',
    3: 'Namespace',
    4: 'Package',
    5: 'Class',
    6: 'Method',
    7: 'Property',
    8: 'Field',
    9: 'Constructor',
    10: 'Enum',
    11: 'Interface',
    12: 'Function',
    13: 'Variable',
    14: 'Constant',
    15: 'String',
    16: 'Number',
    17: 'Boolean',
    18: 'Array',
    19: 'Object',
    20: 'Key',
    21: 'Null',
    22: 'EnumMember',
    23: 'Struct',
    24: 'Event',
    25: 'Operator',
    26: 'TypeParameter',
  };
  return names[kind] || 'Unknown';
}

// ============================================================
// NativeSerenaTools Class
// ============================================================

export class NativeSerenaTools {
  private tools: Map<string, NativeToolDefinition> = new Map();
  private nativeGlob: NativeGlob;
  private nativeGrep: NativeGrep;
  private nativeCode: NativeCodeIntelligence;
  private initialized: boolean = false;
  private rootDir: string;

  constructor(config: NativeSerenaToolsConfig) {
    this.rootDir = config.rootDir;
    this.nativeGlob = createGlob(config.rootDir);
    this.nativeGrep = createGrep(config.rootDir);
    this.nativeCode = nativeCodeIntelligence;
  }

  /**
   * Initialize the tools registry
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Initialize NativeCodeIntelligence
    await this.nativeCode.init(this.rootDir);

    // Register all tools
    const toolDefs = createToolDefinitions(this.nativeGlob, this.nativeGrep, this.nativeCode);

    for (const tool of toolDefs) {
      this.tools.set(tool.name, tool);
    }

    this.initialized = true;
    console.log(chalk.cyan(`[NativeSerenaTools] Initialized ${this.tools.size} tools`));
  }

  /**
   * Register a custom tool
   */
  registerTool(tool: NativeToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get tool by name
   */
  getTool(name: string): NativeToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools
   */
  getAllTools(): NativeToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool by name
   */
  async executeTool(name: string, params: Record<string, unknown>): Promise<NativeToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
      };
    }

    try {
      const data = await tool.handler(params);
      return {
        success: true,
        data,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: msg,
      };
    }
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get tool count
   */
  getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Get tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Print status
   */
  printStatus(): void {
    console.log(chalk.cyan('\n=== Native Serena Tools ===\n'));
    console.log(chalk.gray(`  Root: ${this.rootDir}`));
    console.log(chalk.gray(`  Initialized: ${this.initialized}`));
    console.log(chalk.gray(`  Tools: ${this.tools.size}`));
    console.log(chalk.gray('\n  Available Tools:'));

    for (const [name, tool] of this.tools) {
      console.log(chalk.gray(`    - ${name}: ${tool.description.substring(0, 60)}...`));
    }
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    if (this.nativeCode.isInitialized()) {
      await this.nativeCode.shutdown();
    }
    this.initialized = false;
  }
}

// ============================================================
// Factory Functions
// ============================================================

/**
 * Create a new NativeSerenaTools instance
 */
export function createNativeSerenaTools(rootDir: string): NativeSerenaTools {
  return new NativeSerenaTools({ rootDir });
}

// ============================================================
// Singleton Instance
// ============================================================

let _nativeSerenaToolsInstance: NativeSerenaTools | null = null;

/**
 * Get or create singleton instance
 */
export function getNativeSerenaTools(rootDir?: string): NativeSerenaTools {
  if (!_nativeSerenaToolsInstance) {
    _nativeSerenaToolsInstance = createNativeSerenaTools(rootDir || process.cwd());
  }
  return _nativeSerenaToolsInstance;
}

/**
 * Singleton export
 */
export const nativeSerenaTools = getNativeSerenaTools();

export default nativeSerenaTools;

/**
 * NativeToolsServer - Virtual MCP server for native Serena-compatible tools
 *
 * Provides all native tools through the MCP interface:
 * - Registers tools in MCPToolRegistry
 * - Handles tool execution
 * - Supports full Serena alias compatibility
 */

import path from 'node:path';
import chalk from 'chalk';
import { createDocumentToolDefinitions } from '../native/NativeDocumentTools.js';
import {
  createNativeSerenaTools,
  type NativeSerenaTools,
  type NativeToolResult,
} from '../native/NativeSerenaTools.js';
import { sanitizeNumericParams } from './MCPAliases.js';
import { mcpToolRegistry } from './MCPToolRegistry.js';
import type { MCPTool, MCPToolResult } from './MCPTypes.js';

// ============================================================
// Constants
// ============================================================

export const NATIVE_SERVER_NAME = 'native';

// ============================================================
// Native Tool Aliases (Serena-compatible)
// ============================================================

export const NATIVE_TOOL_ALIASES: Record<string, string> = {
  // === Glob (file finding) ===
  glob: 'native__find_file',
  find: 'native__find_file',
  files: 'native__find_file',

  // === Grep (content search) ===
  grep: 'native__search_for_pattern',
  search: 'native__search_for_pattern',
  rg: 'native__search_for_pattern',

  // === Code Operations (Serena-compatible) ===
  'code:find': 'native__find_symbol',
  'code:symbol': 'native__find_symbol',
  'code:overview': 'native__get_symbols_overview',
  'code:symbols': 'native__get_symbols_overview',
  'code:search': 'native__search_for_pattern',
  'code:pattern': 'native__search_for_pattern',
  'code:file': 'native__find_file',
  'code:refs': 'native__find_referencing_symbols',
  'code:def': 'native__go_to_definition',
  'code:replace': 'native__replace_content',

  // === Serena Full Compatibility ===
  // File Operations
  'serena:ls': 'native__list_dir',
  'serena:list': 'native__list_dir',
  'serena:read': 'native__read_file',
  'serena:cat': 'native__read_file',
  'serena:write': 'native__create_text_file',
  'serena:create': 'native__create_text_file',
  'serena:find': 'native__find_file',

  // Symbol Operations
  'serena:symbol': 'native__find_symbol',
  'serena:sym': 'native__find_symbol',
  'serena:refs': 'native__find_referencing_symbols',
  'serena:references': 'native__find_referencing_symbols',
  'serena:outline': 'native__get_symbols_overview',
  'serena:overview': 'native__get_symbols_overview',

  // Code Search
  'serena:search': 'native__search_for_pattern',
  'serena:grep': 'native__search_for_pattern',
  'serena:pattern': 'native__search_for_pattern',

  // Code Editing
  'serena:edit': 'native__replace_content',
  'serena:replace': 'native__replace_content',
  'serena:replaceSymbol': 'native__replace_symbol_body',
  'serena:insertBefore': 'native__insert_before_symbol',
  'serena:insertAfter': 'native__insert_after_symbol',

  // Navigation
  'serena:goto': 'native__go_to_definition',
  'serena:def': 'native__go_to_definition',
  'serena:rename': 'native__rename_symbol',

  // Memory
  'serena:memories': 'native__list_memories',
  'serena:memlist': 'native__list_memories',
  'serena:memread': 'native__read_memory',
  'serena:memwrite': 'native__write_memory',
  'serena:memdel': 'native__delete_memory',

  // === Document Operations ===
  'doc:word': 'native__create_word_document',
  'doc:create-word': 'native__create_word_document',
  'doc:edit-word': 'native__edit_word_document',
  'doc:txt2word': 'native__convert_txt_to_word',
  'doc:excel': 'native__create_excel_file',
  'doc:create-excel': 'native__create_excel_file',
  'doc:edit-excel': 'native__edit_excel_file',
  'doc:csv2excel': 'native__convert_csv_to_excel',
  'doc:pdf': 'native__create_pdf_file',
  'doc:create-pdf': 'native__create_pdf_file',
  word: 'native__create_word_document',
  excel: 'native__create_excel_file',
  pdf: 'native__create_pdf_file',

  // === Native Prefix (new style) ===
  'native:find': 'native__find_symbol',
  'native:search': 'native__search_for_pattern',
  'native:glob': 'native__find_file',
  'native:grep': 'native__search_for_pattern',
  'native:ls': 'native__list_dir',
  'native:read': 'native__read_file',
  'native:write': 'native__create_text_file',
  'native:overview': 'native__get_symbols_overview',
  'native:refs': 'native__find_referencing_symbols',
  'native:replace': 'native__replace_content',
  'native:rename': 'native__rename_symbol',
  'native:mem': 'native__list_memories',
};

// ============================================================
// Parameter Sanitization Utilities
// ============================================================

/** Parameter keys that represent filesystem paths */
const PATH_PARAM_KEYS = new Set([
  'filepath',
  'file_path',
  'filePath',
  'path',
  'source_path',
  'target_path',
  'sourcePath',
  'targetPath',
  'directory',
  'dir',
  'root',
  'rootDir',
  'cwd',
  'workingDirectory',
]);

/** Parameter keys that represent filenames (not full paths) */
const FILENAME_PARAM_KEYS = new Set([
  'filename',
  'fileName',
  'name',
  'file',
  'sheetName',
  'sheet_name',
  'sheet',
]);

/** Maximum allowed filename length (prevents filesystem issues) */
const MAX_FILENAME_LENGTH = 255;

/** Maximum allowed full path length (Windows MAX_PATH) */
const MAX_PATH_LENGTH = 260;

/**
 * Get allowed directories for path validation.
 * Includes the project root and common safe user directories.
 */
function getAllowedDirs(rootDir: string): string[] {
  const os = require('node:os');
  return [
    path.resolve(rootDir),
    path.join(os.homedir(), 'Documents'),
    path.join(os.homedir(), 'Desktop'),
    path.join(os.homedir(), 'Downloads'),
    os.tmpdir(),
  ];
}

/**
 * Sanitize a filesystem path with multiple security layers:
 * 1. Reject empty/invalid input
 * 2. Remove null bytes (can bypass C-based path checks in native code)
 * 3. Remove control characters (can confuse terminal/logging)
 * 4. Defense-in-depth: reject raw '..' traversal sequences before resolution
 * 5. Normalize and resolve to absolute path
 * 6. Enforce maximum path length
 * 7. Validate resolved path stays within allowed directories
 */
function sanitizePath(value: string, rootDir: string): string {
  if (!value || typeof value !== 'string') {
    throw new Error('Path security violation: path must be a non-empty string');
  }

  // Layer 1: Remove null bytes
  let sanitized = value.replace(/\0/g, '');

  // Layer 2: Remove control characters (keep tabs/newlines but strip others)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char sanitization
  sanitized = sanitized.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');

  // Layer 3: Defense-in-depth - reject paths containing '..' traversal sequences
  const forwardSlashPath = sanitized.replace(/\\/g, '/');
  if (
    forwardSlashPath.includes('/../') ||
    forwardSlashPath.startsWith('../') ||
    forwardSlashPath.endsWith('/..') ||
    forwardSlashPath === '..'
  ) {
    throw new Error(
      `Path security violation: "${value}" contains directory traversal sequences (..)`,
    );
  }

  // Layer 4: Normalize slashes and resolve to absolute
  sanitized = path.normalize(sanitized);
  const resolved = path.resolve(rootDir, sanitized);

  // Layer 5: Enforce maximum path length
  if (resolved.length > MAX_PATH_LENGTH) {
    throw new Error(
      `Path security violation: resolved path exceeds maximum length of ${MAX_PATH_LENGTH} characters`,
    );
  }

  // Layer 6: Verify the resolved path stays within allowed directories
  const allowedDirs = getAllowedDirs(rootDir);
  const isAllowed = allowedDirs.some((baseDir) => {
    const normalizedBase = path.resolve(baseDir) + path.sep;
    const normalizedResolved = resolved + path.sep;
    return normalizedResolved.startsWith(normalizedBase) || resolved === path.resolve(baseDir);
  });

  if (!isAllowed) {
    throw new Error(
      `Path security violation: "${value}" resolves to "${resolved}" which is outside allowed directories: ${allowedDirs.join(', ')}`,
    );
  }

  return resolved;
}

/**
 * Sanitize a filename (not a full path) with multiple security layers:
 * 1. Reject empty/invalid input
 * 2. Remove null bytes
 * 3. Remove control characters
 * 4. Remove Windows-illegal characters
 * 5. Remove directory traversal sequences
 * 6. Remove path separator characters (slashes)
 * 7. Remove leading dots (hidden file creation)
 * 8. Enforce maximum filename length
 * 9. Reject empty result after sanitization
 */
function sanitizeFilename(value: string): string {
  if (!value || typeof value !== 'string') {
    throw new Error('Filename security violation: filename must be a non-empty string');
  }

  const sanitized = value
    .replace(/\0/g, '') // null bytes
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char sanitization
    .replace(/[\u0000-\u001f\u007f]/g, '') // control characters
    .replace(/[<>:"|?*]/g, '') // Windows-illegal characters
    .replace(/\.\./g, '') // directory traversal
    .replace(/[/\\]/g, '') // any slash characters (path separators)
    .replace(/^\.+/, '') // leading dots (hidden files)
    .trim();

  if (sanitized.length === 0) {
    throw new Error(
      `Filename security violation: "${value}" results in empty filename after sanitization`,
    );
  }

  if (sanitized.length > MAX_FILENAME_LENGTH) {
    throw new Error(
      `Filename security violation: filename exceeds maximum length of ${MAX_FILENAME_LENGTH} characters`,
    );
  }

  return sanitized;
}

/**
 * Sanitize path/filename fields in a nested object (one level deep).
 * Used for operation objects inside arrays (e.g. Excel edit operations).
 */
function sanitizeNestedObject(
  obj: Record<string, unknown>,
  rootDir: string,
): Record<string, unknown> {
  const result = { ...obj };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value !== 'string') continue;

    if (PATH_PARAM_KEYS.has(key)) {
      result[key] = sanitizePath(value, rootDir);
    } else if (FILENAME_PARAM_KEYS.has(key)) {
      result[key] = sanitizeFilename(value);
    }
  }

  return result;
}

/**
 * Sanitize all parameters in a tool call before they reach the filesystem.
 * Applies path sanitization, filename sanitization, and numeric range validation.
 *
 * Handles:
 * - Top-level path/filename string parameters
 * - Numeric parameters (clamped to safe ranges via sanitizeNumericParams)
 * - Nested objects with path/filename fields inside arrays (one level deep)
 */
function sanitizeToolParams(
  params: Record<string, unknown>,
  rootDir: string,
): Record<string, unknown> {
  // First apply numeric range sanitization
  const sanitized = sanitizeNumericParams(params);

  // Then sanitize path, filename, and nested params
  for (const [key, value] of Object.entries(sanitized)) {
    if (typeof value === 'string') {
      if (PATH_PARAM_KEYS.has(key)) {
        sanitized[key] = sanitizePath(value, rootDir);
      } else if (FILENAME_PARAM_KEYS.has(key)) {
        sanitized[key] = sanitizeFilename(value);
      }
    }
    // Handle nested objects in arrays (e.g. operations arrays with path fields)
    else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          return sanitizeNestedObject(item as Record<string, unknown>, rootDir);
        }
        return item;
      });
    }
  }

  return sanitized;
}

// ============================================================
// NativeToolsServer Class
// ============================================================

export class NativeToolsServer {
  private tools: NativeSerenaTools;
  private registered: boolean = false;
  private rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir || process.cwd();
    this.tools = createNativeSerenaTools(this.rootDir);
  }

  /**
   * Initialize the native tools server
   */
  async init(): Promise<void> {
    if (this.registered) {
      console.log(chalk.gray('[NativeToolsServer] Already initialized'));
      return;
    }

    // Initialize native tools
    await this.tools.init();

    // Register document tools
    const docTools = createDocumentToolDefinitions();
    for (const tool of docTools) {
      this.tools.registerTool(tool);
    }

    // Register all native tools in MCPToolRegistry
    const allTools = this.tools.getAllTools();

    for (const tool of allTools) {
      const mcpTool: MCPTool = {
        name: tool.name,
        serverName: NATIVE_SERVER_NAME,
        description: `[Native] ${tool.description}`,
        inputSchema: tool.inputSchema,
      };

      mcpToolRegistry.registerTool(mcpTool);
    }

    this.registered = true;

    console.log(chalk.cyan(`[NativeToolsServer] Registered ${allTools.length} native tools`));
  }

  /**
   * Safely parse a value that may be a JSON string into an object.
   * Returns the parsed object on success, or the original value if parsing
   * fails or the value is not a string.
   */
  private safeJsonParse(value: unknown, context: string): unknown {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        chalk.yellow(
          `[NativeToolsServer] JSON.parse failed for ${context}: ${msg}. Using raw string value.`,
        ),
      );
      return value;
    }
  }

  /**
   * Pre-process params: if any known array/object params arrive as JSON strings,
   * parse them safely before passing to the tool handler.
   */
  private preprocessParams(params: Record<string, unknown>): Record<string, unknown> {
    const result = { ...params };

    // Known keys that may arrive as stringified JSON and should be objects/arrays
    const jsonParamKeys = ['operations', 'data', 'options', 'config', 'metadata', 'properties'];

    for (const key of jsonParamKeys) {
      if (key in result && typeof result[key] === 'string') {
        result[key] = this.safeJsonParse(result[key], `param "${key}"`);
      }
    }

    return result;
  }

  /**
   * Execute a native tool.
   *
   * Wraps the entire execution in a global try/catch so that no error
   * can crash the process. All failures are returned in MCP protocol
   * error format: { content: [{ type: "text", text: "Error: ..." }], isError: true }
   */
  async callTool(toolName: string, params: Record<string, unknown>): Promise<MCPToolResult> {
    // Global try/catch — nothing thrown inside this method can crash the server
    try {
      if (!this.registered) {
        await this.init();
      }

      // Pre-process params: safely parse any stringified JSON values
      let processedParams: Record<string, unknown>;
      try {
        processedParams = this.preprocessParams(params);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          chalk.red(
            `[NativeToolsServer] Parameter preprocessing failed for tool "${toolName}": ${msg}`,
          ),
        );
        return {
          success: false,
          content: [
            {
              type: 'text',
              text: `Error: Parameter preprocessing failed for tool "${toolName}": ${msg}`,
            },
          ],
          error: `Parameter preprocessing failed: ${msg}`,
          isError: true,
        };
      }

      // Sanitize all parameters before passing to native tools
      let sanitizedParams: Record<string, unknown>;
      try {
        sanitizedParams = sanitizeToolParams(processedParams, this.rootDir);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          chalk.red(
            `[NativeToolsServer] Parameter sanitization failed for tool "${toolName}": ${msg}`,
          ),
        );
        return {
          success: false,
          content: [
            {
              type: 'text',
              text: `Error: Parameter sanitization failed for tool "${toolName}": ${msg}`,
            },
          ],
          error: `Parameter sanitization failed: ${msg}`,
          isError: true,
        };
      }

      // Execute the tool
      let result: NativeToolResult;
      try {
        result = await this.tools.executeTool(toolName, sanitizedParams);
      } catch (execErr: unknown) {
        const execMessage = execErr instanceof Error ? execErr.message : String(execErr);
        console.error(
          chalk.red(`[NativeToolsServer] Tool execution threw for "${toolName}": ${execMessage}`),
        );
        return {
          success: false,
          content: [
            { type: 'text', text: `Error: Tool "${toolName}" threw an exception: ${execMessage}` },
          ],
          error: execMessage,
          isError: true,
        };
      }

      if (result.success) {
        return {
          success: true,
          content: result.data,
          isError: false,
        };
      } else {
        return {
          success: false,
          content: [{ type: 'text', text: `Error: Tool "${toolName}" failed: ${result.error}` }],
          error: result.error,
          isError: true,
        };
      }
    } catch (error: unknown) {
      // Last-resort catch: this should never be reached if the inner catches work,
      // but guarantees the server never crashes from a tool call.
      const errorMessage = error instanceof Error ? error.message : String(error);
      const paramKeys = Object.keys(params || {}).join(', ');
      console.error(
        chalk.red(
          `[NativeToolsServer] Unhandled error in callTool("${toolName}", {${paramKeys}}): ${errorMessage}`,
        ),
      );
      return {
        success: false,
        content: [
          {
            type: 'text',
            text: `Error: Unexpected failure executing tool "${toolName}": ${errorMessage}`,
          },
        ],
        error: errorMessage,
        isError: true,
      };
    }
  }

  /**
   * Get all native tools as MCP format
   */
  getAllTools(): MCPTool[] {
    return this.tools.getAllTools().map((tool) => ({
      name: tool.name,
      serverName: NATIVE_SERVER_NAME,
      description: `[Native] ${tool.description}`,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Get tool by name
   */
  getTool(name: string): MCPTool | undefined {
    const tool = this.tools.getTool(name);
    if (!tool) return undefined;

    return {
      name: tool.name,
      serverName: NATIVE_SERVER_NAME,
      description: `[Native] ${tool.description}`,
      inputSchema: tool.inputSchema,
    };
  }

  /**
   * Check if tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.getTool(name) !== undefined;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.registered;
  }

  /**
   * Get tool count
   */
  getToolCount(): number {
    return this.tools.getToolCount();
  }

  /**
   * Get tool names
   */
  getToolNames(): string[] {
    return this.tools.getToolNames();
  }

  /**
   * Resolve alias to full native tool name
   */
  resolveAlias(alias: string): string | null {
    const normalized = alias.toLowerCase().trim();
    return NATIVE_TOOL_ALIASES[normalized] || null;
  }

  /**
   * Check if alias points to native tool
   */
  isNativeAlias(alias: string): boolean {
    const normalized = alias.toLowerCase().trim();
    return normalized in NATIVE_TOOL_ALIASES;
  }

  /**
   * Get all aliases
   */
  getAllAliases(): Record<string, string> {
    return { ...NATIVE_TOOL_ALIASES };
  }

  /**
   * Get root directory
   */
  getRootDir(): string {
    return this.rootDir;
  }

  /**
   * Set root directory (reinitializes tools)
   */
  async setRootDir(dir: string): Promise<void> {
    if (dir !== this.rootDir) {
      this.rootDir = dir;
      this.registered = false;

      // Unregister old tools
      for (const name of this.tools.getToolNames()) {
        mcpToolRegistry.unregisterTool(NATIVE_SERVER_NAME, name);
      }

      // Recreate tools with new root
      this.tools = createNativeSerenaTools(dir);
      await this.init();
    }
  }

  /**
   * Print status
   */
  printStatus(): void {
    console.log(chalk.cyan('\n=== Native Tools Server ===\n'));
    console.log(chalk.gray(`  Root: ${this.rootDir}`));
    console.log(chalk.gray(`  Initialized: ${this.registered}`));
    console.log(chalk.gray(`  Tools: ${this.getToolCount()}`));
    console.log(chalk.gray(`  Aliases: ${Object.keys(NATIVE_TOOL_ALIASES).length}`));

    console.log(chalk.gray('\n  Tools:'));
    for (const name of this.getToolNames()) {
      console.log(chalk.gray(`    - ${NATIVE_SERVER_NAME}__${name}`));
    }

    console.log(chalk.gray('\n  Sample Aliases:'));
    const sampleAliases = Object.entries(NATIVE_TOOL_ALIASES).slice(0, 10);
    for (const [alias, target] of sampleAliases) {
      console.log(chalk.gray(`    ${alias} -> ${target}`));
    }
    if (Object.keys(NATIVE_TOOL_ALIASES).length > 10) {
      console.log(chalk.gray(`    ... and ${Object.keys(NATIVE_TOOL_ALIASES).length - 10} more`));
    }
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    if (this.registered) {
      // Unregister tools from MCPToolRegistry
      for (const name of this.getToolNames()) {
        mcpToolRegistry.unregisterTool(NATIVE_SERVER_NAME, name);
      }

      // Shutdown underlying tools
      await this.tools.shutdown();

      this.registered = false;
      console.log(chalk.cyan('[NativeToolsServer] Shutdown complete'));
    }
  }
}

// ============================================================
// Singleton Instance
// ============================================================

let _nativeToolsServerInstance: NativeToolsServer | null = null;

/**
 * Get or create singleton instance
 */
export function getNativeToolsServer(rootDir?: string): NativeToolsServer {
  if (!_nativeToolsServerInstance) {
    _nativeToolsServerInstance = new NativeToolsServer(rootDir);
  }
  return _nativeToolsServerInstance;
}

/**
 * Singleton export
 */
export const nativeToolsServer = getNativeToolsServer();

export default nativeToolsServer;

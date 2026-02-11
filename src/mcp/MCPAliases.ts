/**
 * MCP Aliases - Predefined tool shortcuts
 * Simplifies tool names for common operations
 *
 * IMPORTANT: Native Tools vs MCP Tools
 * =====================================
 * Some functionality has been migrated from MCP servers to native CLI commands:
 *
 * Native Tools (use CLI commands, NOT MCP aliases):
 * - /fs      - Native filesystem operations (read, write, list, search)
 * - /shell   - Native shell command execution
 * - /mem     - Native memory/knowledge graph operations
 * - /search  - Native code search
 *
 * The aliases below marked as [DEPRECATED] point to MCP servers that have been
 * replaced by native implementations. They are kept for backwards compatibility
 * but may not work if the corresponding MCP server is not running.
 */

// ============================================================
// Native Tool Reference (CLI Commands)
// ============================================================
// These are NOT MCP aliases - they are native CLI commands:
//
// Filesystem (native):
//   /fs list <path>        - List directory contents
//   /fs read <file>        - Read file contents
//   /fs write <file>       - Write to file
//   /fs search <pattern>   - Search for files
//   /fs tree <path>        - Show directory tree
//
// Shell (native):
//   /shell <command>       - Execute shell command
//   /shell run <cmd>       - Run command with output
//
// Memory (native):
//   /mem add <entity>      - Add entity to knowledge graph
//   /mem search <query>    - Search knowledge graph
//   /mem read              - Read full graph
//   /mem relate            - Create relations
//
// Search (native):
//   /search <pattern>      - Search codebase
//   /search files <glob>   - Find files by pattern
// ============================================================

// ============================================================
// MCP Tool Aliases
// ============================================================

const TOOL_ALIASES: Record<string, string> = {
  // ========== [DEPRECATED] Filesystem (fs:*) ==========
  // NOTE: These point to MCP filesystem server which has been replaced
  // by native /fs command. Use /fs command instead for better performance.
  'fs:ls': 'filesystem__list_directory', // DEPRECATED: Use /fs list
  'fs:list': 'filesystem__list_directory', // DEPRECATED: Use /fs list
  'fs:read': 'filesystem__read_file', // DEPRECATED: Use /fs read
  'fs:write': 'filesystem__write_file', // DEPRECATED: Use /fs write
  'fs:tree': 'filesystem__directory_tree', // DEPRECATED: Use /fs tree
  'fs:search': 'filesystem__search_files', // DEPRECATED: Use /fs search
  'fs:info': 'filesystem__get_file_info', // DEPRECATED: Use /fs info
  'fs:mkdir': 'filesystem__create_directory', // DEPRECATED: Use /fs mkdir
  'fs:mv': 'filesystem__move_file', // DEPRECATED: Use /fs mv
  'fs:cp': 'filesystem__copy_file', // DEPRECATED: Use /fs cp
  'fs:rm': 'filesystem__delete_file', // DEPRECATED: Use /fs rm

  // ========== [DEPRECATED] Memory (mem:*) ==========
  // NOTE: These point to MCP memory server which has been replaced
  // by native /mem command. Use /mem command instead.
  'mem:add': 'memory__create_entities', // DEPRECATED: Use /mem add
  'mem:create': 'memory__create_entities', // DEPRECATED: Use /mem add
  'mem:search': 'memory__search_nodes', // DEPRECATED: Use /mem search
  'mem:find': 'memory__search_nodes', // DEPRECATED: Use /mem search
  'mem:read': 'memory__read_graph', // DEPRECATED: Use /mem read
  'mem:graph': 'memory__read_graph', // DEPRECATED: Use /mem read
  'mem:relate': 'memory__create_relations', // DEPRECATED: Use /mem relate
  'mem:observe': 'memory__add_observations', // DEPRECATED: Use /mem observe
  'mem:delete': 'memory__delete_entities', // DEPRECATED: Use /mem delete

  // ========== Code/Serena (code:*) - NOW NATIVE ==========
  // NOTE: These now point to native implementations for better performance.
  // The native server provides full Serena-compatible functionality.
  'code:find': 'native__find_symbol',
  'code:symbol': 'native__find_symbol',
  'code:overview': 'native__get_symbols_overview',
  'code:symbols': 'native__get_symbols_overview',
  'code:replace': 'native__replace_content',
  'code:search': 'native__search_for_pattern',
  'code:pattern': 'native__search_for_pattern',
  'code:file': 'native__find_file',
  'code:refs': 'native__find_referencing_symbols',
  'code:def': 'native__go_to_definition',

  // ========== Serena Full (serena:*) - NOW NATIVE ==========
  // NOTE: Serena aliases now point to native implementations.
  // Full backwards compatibility maintained.

  // File Operations
  'serena:ls': 'native__list_dir',
  'serena:list': 'native__list_dir',
  'serena:read': 'native__read_file',
  'serena:cat': 'native__read_file',
  'serena:write': 'native__create_text_file',
  'serena:create': 'native__create_text_file',
  'serena:find': 'native__find_file',

  // Symbol Operations (LSP-powered with regex fallback)
  'serena:symbol': 'native__find_symbol',
  'serena:sym': 'native__find_symbol',
  'serena:refs': 'native__find_referencing_symbols',
  'serena:references': 'native__find_referencing_symbols',
  'serena:outline': 'native__get_symbols_overview',
  'serena:overview': 'native__get_symbols_overview',

  // Code Search (native grep)
  'serena:search': 'native__search_for_pattern',
  'serena:grep': 'native__search_for_pattern',
  'serena:pattern': 'native__search_for_pattern',

  // Code Editing (Symbol-aware)
  'serena:edit': 'native__replace_content',
  'serena:replace': 'native__replace_content',
  'serena:replaceSymbol': 'native__replace_symbol_body',
  'serena:insertBefore': 'native__insert_before_symbol',
  'serena:insertAfter': 'native__insert_after_symbol',

  // Navigation
  'serena:goto': 'native__go_to_definition',
  'serena:def': 'native__go_to_definition',
  'serena:rename': 'native__rename_symbol',

  // Memory Management
  'serena:memories': 'native__list_memories',
  'serena:memlist': 'native__list_memories',
  'serena:memread': 'native__read_memory',
  'serena:memwrite': 'native__write_memory',
  'serena:memdel': 'native__delete_memory',

  // ========== Native Tools (native:*) - NEW ==========
  // Direct access to native tool implementations
  'native:find': 'native__find_symbol',
  'native:symbol': 'native__find_symbol',
  'native:search': 'native__search_for_pattern',
  'native:grep': 'native__search_for_pattern',
  'native:glob': 'native__find_file',
  'native:file': 'native__find_file',
  'native:ls': 'native__list_dir',
  'native:read': 'native__read_file',
  'native:write': 'native__create_text_file',
  'native:overview': 'native__get_symbols_overview',
  'native:refs': 'native__find_referencing_symbols',
  'native:replace': 'native__replace_content',
  'native:rename': 'native__rename_symbol',
  'native:goto': 'native__go_to_definition',
  'native:mem': 'native__list_memories',
  'native:memread': 'native__read_memory',
  'native:memwrite': 'native__write_memory',

  // ========== Quick Shortcuts - NOW NATIVE ==========
  glob: 'native__find_file',
  grep: 'native__search_for_pattern',
  rg: 'native__search_for_pattern',

  // ========== [DEPRECATED] Desktop Commander (dc:*) ==========
  // NOTE: These point to MCP desktop-commander server which has been replaced
  // by native /shell command. Use /shell command instead.
  'dc:run': 'desktop-commander__start_process', // DEPRECATED: Use /shell
  'dc:exec': 'desktop-commander__start_process', // DEPRECATED: Use /shell
  'dc:kill': 'desktop-commander__kill_process', // DEPRECATED: Use /shell kill
  'dc:ps': 'desktop-commander__list_processes', // DEPRECATED: Use /shell ps
  'dc:read': 'desktop-commander__read_file', // DEPRECATED: Use /fs read
  'dc:write': 'desktop-commander__write_file', // DEPRECATED: Use /fs write
  'dc:ls': 'desktop-commander__list_directory', // DEPRECATED: Use /fs list
  'dc:search': 'desktop-commander__start_search', // DEPRECATED: Use /search

  // ========== Browser/Playwright (browser:*) - ACTIVE ==========
  'browser:open': 'playwright__browser_navigate',
  'browser:nav': 'playwright__browser_navigate',
  'browser:click': 'playwright__browser_click',
  'browser:type': 'playwright__browser_type',
  'browser:snap': 'playwright__browser_snapshot',
  'browser:shot': 'playwright__browser_take_screenshot',
  'browser:tabs': 'playwright__browser_tabs',

  // ========== Document Operations (doc:*) - NATIVE ==========
  // Word, Excel, PDF creation and editing via native implementations
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

  // ========== Quick shortcuts - MIGRATED TO NATIVE ==========
  list: 'native__list_dir',
  read: 'native__read_file',
  write: 'native__create_text_file',
  find: 'native__find_file',
  search: 'native__search_for_pattern',
  symbol: 'native__find_symbol',
  refs: 'native__find_referencing_symbols',
  overview: 'native__get_symbols_overview',
  replace: 'native__replace_content',

  // ========== [DEPRECATED] Shell shortcuts ==========
  run: 'desktop-commander__start_process', // DEPRECATED: Use /shell
  exec: 'desktop-commander__start_process', // DEPRECATED: Use /shell
};

// ============================================================
// Deprecated Alias Sets (for reference/cleanup)
// ============================================================

/**
 * List of deprecated alias prefixes that point to removed MCP servers.
 * These are kept for backwards compatibility but should be migrated to native commands.
 */
export const DEPRECATED_PREFIXES = ['fs:', 'mem:', 'dc:'] as const;

/**
 * Mapping of deprecated aliases to their native command equivalents
 */
export const NATIVE_ALTERNATIVES: Record<string, string> = {
  // Filesystem
  'fs:ls': '/fs list',
  'fs:list': '/fs list',
  'fs:read': '/fs read',
  'fs:write': '/fs write',
  'fs:tree': '/fs tree',
  'fs:search': '/fs search',
  'fs:info': '/fs info',
  'fs:mkdir': '/fs mkdir',
  'fs:mv': '/fs mv',
  'fs:cp': '/fs cp',
  'fs:rm': '/fs rm',

  // Memory
  'mem:add': '/mem add',
  'mem:create': '/mem add',
  'mem:search': '/mem search',
  'mem:find': '/mem search',
  'mem:read': '/mem read',
  'mem:graph': '/mem read',
  'mem:relate': '/mem relate',
  'mem:observe': '/mem observe',
  'mem:delete': '/mem delete',

  // Desktop Commander
  'dc:run': '/shell',
  'dc:exec': '/shell',
  'dc:kill': '/shell kill',
  'dc:ps': '/shell ps',
  'dc:read': '/fs read',
  'dc:write': '/fs write',
  'dc:ls': '/fs list',
  'dc:search': '/search',

  // Quick shortcuts
  list: '/fs list',
  read: '/fs read',
  write: '/fs write',
  run: '/shell',
  exec: '/shell',
};

// ============================================================
// Numeric Parameter Validation
// ============================================================

/**
 * Clamp a numeric value to a safe range.
 * Use this to validate numeric parameters from LLM input before passing
 * them to tool execution (e.g. maxResults, temperature, timeout, etc.).
 *
 * Handles edge cases from LLM output:
 * - NaN, Infinity, -Infinity -> defaults to min
 * - String numbers (e.g. "100") -> coerced to number then clamped
 * - Non-numeric types -> defaults to min
 * - Extremely large/small values -> clamped to range
 *
 * @param value - The numeric value to clamp (accepts number or string for coercion)
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns The value clamped to [min, max]
 */
export function clampNumber(value: number | string | unknown, min: number, max: number): number {
  // Coerce string numbers from LLM output (e.g. "100", "3.14")
  let num: number;
  if (typeof value === 'string') {
    num = Number(value);
  } else if (typeof value === 'number') {
    num = value;
  } else {
    return min; // Non-numeric type -> default to minimum
  }

  // Guard against NaN, Infinity, -Infinity
  if (!Number.isFinite(num)) {
    return min;
  }

  return Math.max(min, Math.min(max, num));
}

/**
 * Predefined safe ranges for common numeric parameters from LLM input.
 * Apply via: clampNumber(value, NUMERIC_LIMITS.maxResults.min, NUMERIC_LIMITS.maxResults.max)
 */
export const NUMERIC_LIMITS = {
  maxResults: { min: 1, max: 1000 },
  temperature: { min: 0, max: 2 },
  topK: { min: 1, max: 500 },
  topP: { min: 0, max: 1 },
  maxTokens: { min: 1, max: 100000 },
  timeout: { min: 1000, max: 600000 },
  depth: { min: 1, max: 20 },
  pageSize: { min: 1, max: 200 },
  lineNumber: { min: 0, max: 1000000 },
  contextLines: { min: 0, max: 50 },
} as const;

/**
 * Sanitize all numeric fields in a params object using a limits map.
 * Only clamps fields that exist in both params and limits.
 *
 * Handles LLM output quirks:
 * - String numbers (e.g. "100") are coerced and clamped
 * - NaN/Infinity values are replaced with the minimum
 * - Missing fields are left untouched
 *
 * @param params - Parameters object (will not be mutated)
 * @param limits - Map of field name to {min, max} ranges
 * @returns A new object with numeric fields clamped to safe ranges
 */
export function sanitizeNumericParams(
  params: Record<string, unknown>,
  limits: Record<string, { min: number; max: number }> = NUMERIC_LIMITS,
): Record<string, unknown> {
  const result = { ...params };

  for (const [key, range] of Object.entries(limits)) {
    if (!(key in result)) continue;

    const value = result[key];

    // Handle both number and string-number (LLM may send "100" instead of 100)
    if (typeof value === 'number' || typeof value === 'string') {
      result[key] = clampNumber(value, range.min, range.max);
    }
  }

  return result;
}

// ============================================================
// Alias Resolution
// ============================================================

/**
 * Resolve alias to full tool name
 * @param alias - Short alias (e.g., 'fs:read') or full name
 * @returns Full tool name (e.g., 'filesystem__read_file')
 */
export function resolveAlias(alias: string): string {
  const normalized = alias.toLowerCase().trim();
  return TOOL_ALIASES[normalized] || alias;
}

/**
 * Check if string is an alias
 */
export function isAlias(name: string): boolean {
  return name.toLowerCase() in TOOL_ALIASES;
}

/**
 * Check if alias is deprecated (points to removed MCP server)
 */
export function isDeprecatedAlias(alias: string): boolean {
  const normalized = alias.toLowerCase().trim();
  return (
    DEPRECATED_PREFIXES.some((prefix) => normalized.startsWith(prefix)) ||
    normalized in NATIVE_ALTERNATIVES
  );
}

/**
 * Get native alternative for deprecated alias
 */
export function getNativeAlternative(alias: string): string | null {
  const normalized = alias.toLowerCase().trim();
  return NATIVE_ALTERNATIVES[normalized] || null;
}

// ============================================================
// Alias Management
// ============================================================

/**
 * Add custom alias
 */
export function addAlias(alias: string, fullName: string): void {
  TOOL_ALIASES[alias.toLowerCase()] = fullName;
}

/**
 * Remove alias
 */
export function removeAlias(alias: string): boolean {
  const normalized = alias.toLowerCase();
  if (normalized in TOOL_ALIASES) {
    delete TOOL_ALIASES[normalized];
    return true;
  }
  return false;
}

/**
 * Get all registered aliases
 */
export function getAllAliases(): Record<string, string> {
  return { ...TOOL_ALIASES };
}

/**
 * Get aliases by prefix (e.g., 'fs:', 'mem:')
 */
export function getAliasesByPrefix(prefix: string): Record<string, string> {
  const result: Record<string, string> = {};
  const normalizedPrefix = prefix.toLowerCase();

  for (const [alias, fullName] of Object.entries(TOOL_ALIASES)) {
    if (alias.startsWith(normalizedPrefix)) {
      result[alias] = fullName;
    }
  }

  return result;
}

/**
 * Find alias for a full tool name (reverse lookup)
 */
export function findAliasForTool(toolName: string): string | null {
  const normalized = toolName.toLowerCase();

  for (const [alias, fullName] of Object.entries(TOOL_ALIASES)) {
    if (fullName.toLowerCase() === normalized) {
      return alias;
    }
  }

  return null;
}

/**
 * Get only active (non-deprecated) aliases
 */
export function getActiveAliases(): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [alias, fullName] of Object.entries(TOOL_ALIASES)) {
    if (!isDeprecatedAlias(alias)) {
      result[alias] = fullName;
    }
  }

  return result;
}

// ============================================================
// Exports
// ============================================================

export const MCP_ALIASES = TOOL_ALIASES;
export const PREDEFINED_ALIASES = TOOL_ALIASES;

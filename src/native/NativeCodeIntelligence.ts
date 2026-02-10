/**
 * NativeCodeIntelligence - Native code intelligence replacing Serena MCP
 *
 * ============================================================
 * SYMBOL SEARCH HIERARCHY - LEVEL 3 (COORDINATOR - USE THIS)
 * ============================================================
 *
 * This is the TOP level in the symbol search hierarchy and the PREFERRED entry point.
 * NativeCodeIntelligence coordinates between LSP and regex-based search.
 *
 * Hierarchy:
 *   1. NativeLSP.findSymbol()         - LSP protocol (lowest level)
 *   2. NativeSearch.searchSymbols()   - Regex fallback (for non-LSP files)
 *   3. NativeCodeIntelligence.findSymbol() - Coordinator (THIS FILE - PREFERRED)
 *
 * The findSymbol() method in this file:
 *   1. First tries nativeLSP.findSymbol() for accurate LSP-based results
 *   2. If LSP is not available or returns no results, falls back to regex search
 *   3. Returns unified SymbolInformation[] regardless of which method succeeded
 *
 * When to use:
 *   - This should be your DEFAULT choice for symbol search
 *   - Use NativeLSP directly only when you need raw LSP results
 *   - Use NativeSearch directly only for pattern-based content search
 *
 * Combines NativeLSP with file operations to provide:
 * - Symbol search and navigation (with automatic LSP/regex fallback)
 * - Code editing with symbol awareness
 * - Project-wide code analysis
 * - Pattern-based code search
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { nativeLSP, SymbolInformation, DocumentSymbol, SymbolKind, Location, Range } from './NativeLSP.js';
import { createSearch } from './NativeSearch.js';
import { NativeFileSystem, createFileSystem } from './nativefilesystem/NativeFileSystem.js';
import { escapeRegex } from '../utils/regex.js';

// ============================================================
// Types
// ============================================================

export interface SymbolOverview {
  file: string;
  symbols: SymbolSummary[];
}

export interface SymbolSummary {
  name: string;
  kind: string;
  line: number;
  detail?: string;
  children?: SymbolSummary[];
}

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
  context?: string;
}

export interface CodeEdit {
  file: string;
  range: Range;
  newText: string;
}

export interface ProjectMemory {
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// Symbol Kind Names
// ============================================================

function symbolKindToString(kind: SymbolKind): string {
  const names: Record<number, string> = {
    [SymbolKind.File]: 'File',
    [SymbolKind.Module]: 'Module',
    [SymbolKind.Namespace]: 'Namespace',
    [SymbolKind.Package]: 'Package',
    [SymbolKind.Class]: 'Class',
    [SymbolKind.Method]: 'Method',
    [SymbolKind.Property]: 'Property',
    [SymbolKind.Field]: 'Field',
    [SymbolKind.Constructor]: 'Constructor',
    [SymbolKind.Enum]: 'Enum',
    [SymbolKind.Interface]: 'Interface',
    [SymbolKind.Function]: 'Function',
    [SymbolKind.Variable]: 'Variable',
    [SymbolKind.Constant]: 'Constant',
    [SymbolKind.String]: 'String',
    [SymbolKind.Number]: 'Number',
    [SymbolKind.Boolean]: 'Boolean',
    [SymbolKind.Array]: 'Array',
    [SymbolKind.Object]: 'Object',
    [SymbolKind.Key]: 'Key',
    [SymbolKind.Null]: 'Null',
    [SymbolKind.EnumMember]: 'EnumMember',
    [SymbolKind.Struct]: 'Struct',
    [SymbolKind.Event]: 'Event',
    [SymbolKind.Operator]: 'Operator',
    [SymbolKind.TypeParameter]: 'TypeParameter'
  };
  return names[kind] || 'Unknown';
}

// ============================================================
// NativeCodeIntelligence Class
// ============================================================

export class NativeCodeIntelligence {
  private rootDir: string = process.cwd();
  private projectName: string = '';
  private memories = new Map<string, ProjectMemory>();
  private memoriesFile: string = '';
  private initialized = false;
  private nativeFs: NativeFileSystem | null = null;

  /**
   * Initialize for a project
   */
  async init(rootDir: string, projectName?: string): Promise<void> {
    this.rootDir = rootDir;
    this.projectName = projectName || path.basename(rootDir);
    this.memoriesFile = path.join(rootDir, '.gemini', 'memories.json');

    // Initialize NativeFileSystem for delegated file operations
    this.nativeFs = createFileSystem(rootDir, {
      blockedPaths: ['node_modules', '.git', 'dist', 'build']
    });

    // Initialize LSP
    await nativeLSP.init(rootDir);

    // Load existing memories
    await this.loadMemories();

    this.initialized = true;
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get project info
   */
  getProjectInfo(): { name: string; rootDir: string } {
    return {
      name: this.projectName,
      rootDir: this.rootDir
    };
  }

  // ============================================================
  // File Operations
  // ============================================================

  /**
   * List directory contents
   * Delegates to NativeFileSystem.listDirectory() as the canonical implementation
   */
  async listDir(dirPath: string = '.'): Promise<{ name: string; type: 'file' | 'directory'; size?: number }[]> {
    // Delegate to NativeFileSystem if initialized (canonical implementation)
    if (this.nativeFs) {
      const relativePath = path.isAbsolute(dirPath)
        ? path.relative(this.rootDir, dirPath)
        : dirPath;

      const entries = await this.nativeFs.listDirectory(relativePath, {
        includeHidden: true  // Match original behavior of showing all files
      });

      // Transform FileInfo[] to expected return type for backwards compatibility
      return entries.map(entry => ({
        name: entry.name,
        type: entry.isDirectory ? 'directory' as const : 'file' as const,
        size: entry.isFile ? entry.size : undefined
      }));
    }

    // Fallback for when not initialized (backwards compatibility)
    const fullPath = path.isAbsolute(dirPath)
      ? dirPath
      : path.join(this.rootDir, dirPath);

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });

    return entries.map(entry => {
      const entryPath = path.join(fullPath, entry.name);
      const result: { name: string; type: 'file' | 'directory'; size?: number } = {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file'
      };

      if (entry.isFile()) {
        try {
          result.size = fs.statSync(entryPath).size;
        } catch {
          // Ignore stat errors
        }
      }

      return result;
    });
  }

  /**
   * Find files matching pattern
   */
  async findFile(pattern: string): Promise<string[]> {
    const matches = await glob(pattern, {
      cwd: this.rootDir,
      ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**']
    });
    return matches;
  }

  /**
   * Read file content
   * Delegates to NativeFileSystem for consistent file handling
   */
  async readFile(filePath: string): Promise<string> {
    // Delegate to NativeFileSystem if initialized
    if (this.nativeFs) {
      // NativeFileSystem expects paths relative to rootDir or validates absolute paths
      const relativePath = path.isAbsolute(filePath)
        ? path.relative(this.rootDir, filePath)
        : filePath;
      return this.nativeFs.readFile(relativePath);
    }

    // Fallback for when not initialized (backwards compatibility)
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootDir, filePath);

    return fs.readFileSync(fullPath, 'utf-8');
  }

  /**
   * Create or overwrite a file
   */
  async createFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootDir, filePath);

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, content, 'utf-8');
  }

  // ============================================================
  // Symbol Operations (LSP-powered with regex fallback)
  // ============================================================

  /**
   * Find symbol by name - COORDINATOR METHOD
   *
   * ============================================================
   * SYMBOL SEARCH HIERARCHY - This is the PREFERRED entry point
   * ============================================================
   *
   * This method coordinates between different symbol search implementations:
   *
   * 1. FIRST: Try NativeLSP.findSymbol() (LSP protocol)
   *    - Most accurate results using Language Server Protocol
   *    - Requires language server to be running
   *    - Supports TypeScript, JavaScript, Python, Rust, Go
   *
   * 2. FALLBACK: Regex-based search (if LSP unavailable or no results)
   *    - Uses pattern matching to find symbol declarations
   *    - Works without language server setup
   *    - Less accurate but always available
   *    - Similar to NativeSearch.searchSymbols() but returns SymbolInformation[]
   *
   * @param query - The symbol name to search for
   * @returns Array of SymbolInformation from either LSP or regex search
   */
  async findSymbol(query: string): Promise<SymbolInformation[]> {
    // ============================================================
    // STEP 1: Try LSP first (most accurate)
    // ============================================================
    // NativeLSP.findSymbol() uses the workspace/symbol LSP request
    // to get accurate symbol information from language servers.
    try {
      const lspResults = await nativeLSP.findSymbol(query);
      if (lspResults.length > 0) {
        // LSP found results - return them (most accurate)
        return lspResults;
      }
    } catch {
      // LSP failed (e.g., no language server running) - continue to fallback
    }

    // ============================================================
    // STEP 2: Fallback to regex-based search
    // ============================================================
    // If LSP is not available or returned no results, use regex patterns
    // to find symbol declarations. This is similar to NativeSearch.searchSymbols()
    // but returns SymbolInformation[] for API compatibility.
    const results: SymbolInformation[] = [];
    const pattern = new RegExp(`(class|function|interface|type|const|let|var|enum)\\s+${escapeRegex(query)}`, 'g');

    const files = await this.findFile('**/*.{ts,tsx,js,jsx,py,rs,go}');

    for (const file of files.slice(0, 100)) {
      try {
        const content = await this.readFile(file);
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const match = pattern.exec(line);
          if (match) {
            results.push({
              name: query,
              kind: this.inferSymbolKind(match[1]),
              location: {
                uri: nativeLSP.pathToUri(path.join(this.rootDir, file)),
                range: {
                  start: { line: i, character: match.index },
                  end: { line: i, character: match.index + match[0].length }
                }
              }
            });
          }
          pattern.lastIndex = 0;
        }
      } catch {
        // Skip files we can't read
      }
    }

    return results;
  }

  /**
   * Get symbols overview for files
   */
  async getSymbolsOverview(patterns?: string[]): Promise<SymbolOverview[]> {
    const filePatterns = patterns || ['**/*.{ts,tsx,js,jsx}'];
    const results: SymbolOverview[] = [];

    for (const pattern of filePatterns) {
      const files = await this.findFile(pattern);

      for (const file of files.slice(0, 50)) {
        try {
          const fullPath = path.join(this.rootDir, file);
          const symbols = await nativeLSP.getFileSymbols(fullPath);

          const summaries = this.convertToSymbolSummaries(symbols);

          if (summaries.length > 0) {
            results.push({
              file,
              symbols: summaries
            });
          }
        } catch {
          // Skip files we can't analyze
        }
      }
    }

    return results;
  }

  /**
   * Find references to symbol
   */
  async findReferences(filePath: string, line: number, character: number): Promise<Location[]> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootDir, filePath);

    return nativeLSP.findReferences(fullPath, line, character);
  }

  /**
   * Go to definition
   */
  async goToDefinition(filePath: string, line: number, character: number): Promise<Location | Location[] | null> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootDir, filePath);

    return nativeLSP.goToDefinition(fullPath, line, character);
  }

  // ============================================================
  // Code Search
  // ============================================================

  /**
   * Search for pattern in code
   *
   * Now delegates to NativeSearch.searchFiles() as the canonical search implementation.
   */
  async searchPattern(
    pattern: string,
    options: {
      glob?: string;
      isRegex?: boolean;
      caseSensitive?: boolean;
      maxResults?: number;
    } = {}
  ): Promise<SearchResult[]> {
    const {
      glob: fileGlob = '**/*.{ts,tsx,js,jsx,py,rs,go,java,c,cpp,h}',
      isRegex = false,
      caseSensitive = true,
      maxResults = 100
    } = options;

    // Use NativeSearch as canonical search implementation
    const search = createSearch(this.rootDir, {
      defaultIgnore: ['node_modules', '.git', 'dist', 'build', '__pycache__']
    });

    // Build the pattern - NativeSearch handles both regex and string patterns
    const searchPattern = isRegex
      ? new RegExp(pattern, caseSensitive ? 'g' : 'gi')
      : pattern;

    const searchResults = await search.searchFiles({
      pattern: searchPattern,
      glob: fileGlob,
      caseSensitive,
      maxResults,
      contextLines: 1
    });

    // Convert NativeSearch results to SearchResult format
    return searchResults.map(result => ({
      file: result.file,
      line: result.line,
      column: result.column,
      text: result.content.trim(),
      context: result.context
        ? (Array.isArray(result.context.before) ? result.context.before : [result.context.before])
            .concat([result.content])
            .concat(Array.isArray(result.context.after) ? result.context.after : [result.context.after])
            .map((line, i) => {
              const lineNum = result.line - (Array.isArray(result.context!.before) ? result.context!.before.length : 1) + i;
              const marker = lineNum === result.line ? '>' : ' ';
              return `${marker} ${lineNum}: ${line}`;
            })
            .join('\n')
        : undefined
    }));
  }

  // ============================================================
  // Code Editing
  // ============================================================

  /**
   * Replace content in file
   */
  async replaceContent(
    filePath: string,
    searchPattern: string,
    replacement: string,
    options: { isRegex?: boolean; replaceAll?: boolean } = {}
  ): Promise<{ success: boolean; replacements: number }> {
    const { isRegex = false, replaceAll = false } = options;

    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootDir, filePath);

    let content = await this.readFile(fullPath);
    const originalContent = content;

    const regex = isRegex
      ? new RegExp(searchPattern, replaceAll ? 'g' : '')
      : new RegExp(escapeRegex(searchPattern), replaceAll ? 'g' : '');

    const matches = content.match(regex) || [];
    content = content.replace(regex, replacement);

    if (content !== originalContent) {
      await this.createFile(fullPath, content);
      return { success: true, replacements: replaceAll ? matches.length : (matches.length > 0 ? 1 : 0) };
    }

    return { success: false, replacements: 0 };
  }

  /**
   * Replace symbol body (function, class, etc.)
   */
  async replaceSymbolBody(
    filePath: string,
    symbolName: string,
    newBody: string
  ): Promise<{ success: boolean; message: string }> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootDir, filePath);

    // Get file symbols
    const symbols = await nativeLSP.getFileSymbols(fullPath);
    const symbol = this.findSymbolByName(symbols, symbolName);

    if (!symbol) {
      return { success: false, message: `Symbol '${symbolName}' not found` };
    }

    const range = 'range' in symbol ? symbol.range : symbol.location.range;
    const content = await this.readFile(fullPath);
    const lines = content.split('\n');

    // Replace the symbol range with new body
    const before = lines.slice(0, range.start.line).join('\n');
    const lineStart = lines[range.start.line].substring(0, range.start.character);
    const lineEnd = lines[range.end.line].substring(range.end.character);
    const after = lines.slice(range.end.line + 1).join('\n');

    const newContent = before +
      (before ? '\n' : '') +
      lineStart +
      newBody +
      lineEnd +
      (after ? '\n' : '') +
      after;

    await this.createFile(fullPath, newContent);

    return { success: true, message: `Replaced symbol '${symbolName}'` };
  }

  /**
   * Insert before symbol
   */
  async insertBeforeSymbol(
    filePath: string,
    symbolName: string,
    textToInsert: string
  ): Promise<{ success: boolean; message: string }> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootDir, filePath);

    const symbols = await nativeLSP.getFileSymbols(fullPath);
    const symbol = this.findSymbolByName(symbols, symbolName);

    if (!symbol) {
      return { success: false, message: `Symbol '${symbolName}' not found` };
    }

    const range = 'range' in symbol ? symbol.range : symbol.location.range;
    const content = await this.readFile(fullPath);
    const lines = content.split('\n');

    // Insert before the symbol's start line
    const insertLine = range.start.line;
    lines.splice(insertLine, 0, textToInsert);

    await this.createFile(fullPath, lines.join('\n'));

    return { success: true, message: `Inserted before symbol '${symbolName}'` };
  }

  /**
   * Insert after symbol
   */
  async insertAfterSymbol(
    filePath: string,
    symbolName: string,
    textToInsert: string
  ): Promise<{ success: boolean; message: string }> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootDir, filePath);

    const symbols = await nativeLSP.getFileSymbols(fullPath);
    const symbol = this.findSymbolByName(symbols, symbolName);

    if (!symbol) {
      return { success: false, message: `Symbol '${symbolName}' not found` };
    }

    const range = 'range' in symbol ? symbol.range : symbol.location.range;
    const content = await this.readFile(fullPath);
    const lines = content.split('\n');

    // Insert after the symbol's end line
    const insertLine = range.end.line + 1;
    lines.splice(insertLine, 0, textToInsert);

    await this.createFile(fullPath, lines.join('\n'));

    return { success: true, message: `Inserted after symbol '${symbolName}'` };
  }

  /**
   * Rename symbol across project
   */
  async renameSymbol(
    filePath: string,
    line: number,
    character: number,
    newName: string
  ): Promise<{ success: boolean; filesChanged: number; edits: number }> {
    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.rootDir, filePath);

    const changes = await nativeLSP.renameSymbol(fullPath, line, character, newName);

    if (!changes) {
      return { success: false, filesChanged: 0, edits: 0 };
    }

    let totalEdits = 0;

    for (const [file, edits] of changes) {
      let content = await this.readFile(file);

      // Apply edits in reverse order to preserve positions
      const sortedEdits = [...edits].sort((a, b) => {
        if (a.range.start.line !== b.range.start.line) {
          return b.range.start.line - a.range.start.line;
        }
        return b.range.start.character - a.range.start.character;
      });

      for (const edit of sortedEdits) {
        content = this.applyEdit(content, edit.range, edit.newText);
        totalEdits++;
      }

      await this.createFile(file, content);
    }

    return {
      success: true,
      filesChanged: changes.size,
      edits: totalEdits
    };
  }

  // ============================================================
  // Project Memories
  // ============================================================

  /**
   * List all memories
   */
  async listMemories(): Promise<ProjectMemory[]> {
    return Array.from(this.memories.values());
  }

  /**
   * Read a memory
   */
  async readMemory(key: string): Promise<string | null> {
    const memory = this.memories.get(key);
    return memory?.value ?? null;
  }

  /**
   * Write a memory
   */
  async writeMemory(key: string, value: string): Promise<void> {
    const now = new Date();
    const existing = this.memories.get(key);

    this.memories.set(key, {
      key,
      value,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });

    await this.saveMemories();
  }

  /**
   * Delete a memory
   */
  async deleteMemory(key: string): Promise<boolean> {
    const deleted = this.memories.delete(key);
    if (deleted) {
      await this.saveMemories();
    }
    return deleted;
  }

  /**
   * Load memories from disk
   */
  private async loadMemories(): Promise<void> {
    try {
      if (fs.existsSync(this.memoriesFile)) {
        const content = fs.readFileSync(this.memoriesFile, 'utf-8');
        const data = JSON.parse(content);

        for (const item of data) {
          this.memories.set(item.key, {
            key: item.key,
            value: item.value,
            createdAt: new Date(item.createdAt),
            updatedAt: new Date(item.updatedAt)
          });
        }
      }
    } catch {
      // Start with empty memories
    }
  }

  /**
   * Save memories to disk
   */
  private async saveMemories(): Promise<void> {
    const dir = path.dirname(this.memoriesFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = Array.from(this.memories.values());
    fs.writeFileSync(this.memoriesFile, JSON.stringify(data, null, 2));
  }

  // ============================================================
  // Utilities
  // ============================================================

  /**
   * Convert LSP symbols to summaries
   */
  private convertToSymbolSummaries(symbols: DocumentSymbol[] | SymbolInformation[]): SymbolSummary[] {
    return symbols.map(symbol => {
      if ('range' in symbol) {
        // DocumentSymbol
        const summary: SymbolSummary = {
          name: symbol.name,
          kind: symbolKindToString(symbol.kind),
          line: symbol.range.start.line + 1,
          detail: symbol.detail
        };

        if (symbol.children) {
          summary.children = this.convertToSymbolSummaries(symbol.children);
        }

        return summary;
      } else {
        // SymbolInformation
        return {
          name: symbol.name,
          kind: symbolKindToString(symbol.kind),
          line: symbol.location.range.start.line + 1,
          detail: symbol.containerName
        };
      }
    });
  }

  /**
   * Find symbol by name in symbol tree
   */
  private findSymbolByName(
    symbols: DocumentSymbol[] | SymbolInformation[],
    name: string
  ): DocumentSymbol | SymbolInformation | null {
    for (const symbol of symbols) {
      if (symbol.name === name) {
        return symbol;
      }

      if ('children' in symbol && symbol.children) {
        const found = this.findSymbolByName(symbol.children, name);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * Infer symbol kind from keyword
   */
  private inferSymbolKind(keyword: string): SymbolKind {
    const mapping: Record<string, SymbolKind> = {
      'class': SymbolKind.Class,
      'function': SymbolKind.Function,
      'interface': SymbolKind.Interface,
      'type': SymbolKind.Interface,
      'const': SymbolKind.Constant,
      'let': SymbolKind.Variable,
      'var': SymbolKind.Variable,
      'enum': SymbolKind.Enum
    };
    return mapping[keyword] || SymbolKind.Variable;
  }

  /**
   * Get context around a line
   */
  private getLineContext(lines: string[], lineIndex: number, contextLines: number): string {
    const start = Math.max(0, lineIndex - contextLines);
    const end = Math.min(lines.length, lineIndex + contextLines + 1);

    return lines
      .slice(start, end)
      .map((line, i) => {
        const lineNum = start + i + 1;
        const marker = lineNum === lineIndex + 1 ? '>' : ' ';
        return `${marker} ${lineNum}: ${line}`;
      })
      .join('\n');
  }

  /**
   * Apply a text edit to content
   */
  private applyEdit(content: string, range: Range, newText: string): string {
    const lines = content.split('\n');

    const before = lines.slice(0, range.start.line).join('\n');
    const lineStart = lines[range.start.line].substring(0, range.start.character);
    const lineEnd = lines[range.end.line].substring(range.end.character);
    const after = lines.slice(range.end.line + 1).join('\n');

    return before +
      (before ? '\n' : '') +
      lineStart +
      newText +
      lineEnd +
      (after ? '\n' : '') +
      after;
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    await nativeLSP.shutdown();
    this.initialized = false;
  }
}

// ============================================================
// Singleton Export
// ============================================================

// Singleton instance (lazy initialization)
let _nativeCodeIntelligenceInstance: NativeCodeIntelligence | null = null;

export function getNativeCodeIntelligence(): NativeCodeIntelligence {
  if (!_nativeCodeIntelligenceInstance) {
    _nativeCodeIntelligenceInstance = new NativeCodeIntelligence();
  }
  return _nativeCodeIntelligenceInstance;
}

export const nativeCodeIntelligence = getNativeCodeIntelligence();

export default nativeCodeIntelligence;

/**
 * NativeSearch - Advanced search capabilities for GeminiHydra
 * Unified search across files, code, and memory
 *
 * ============================================================
 * SYMBOL SEARCH HIERARCHY - LEVEL 2 (REGEX FALLBACK)
 * ============================================================
 *
 * This is the MIDDLE level in the symbol search hierarchy.
 * NativeSearch provides regex-based symbol search as a fallback when LSP is unavailable.
 *
 * Hierarchy:
 *   1. NativeLSP.findSymbol()         - LSP protocol (lowest level)
 *   2. NativeSearch.searchSymbols()   - Regex fallback (THIS FILE - for non-LSP files)
 *   3. NativeCodeIntelligence.findSymbol() - Coordinator (tries LSP first, falls back to regex)
 *
 * This file provides:
 * - Regex-based symbol detection using language-specific patterns
 * - File content search with context lines
 * - Fuzzy file search
 * - Incremental search for large codebases
 *
 * When to use:
 * - For files/languages without LSP support
 * - For fast pattern-based searches
 * - When LSP servers are not running or unavailable
 *
 * The searchSymbols() method uses regex patterns (SYMBOL_PATTERNS) to detect
 * common code constructs like functions, classes, interfaces, etc.
 * This is less accurate than LSP but works without language server setup.
 *
 * For general symbol search, prefer NativeCodeIntelligence.findSymbol() which
 * coordinates between LSP and regex-based search automatically.
 *
 * Features:
 * - Regex and literal search
 * - File content search with context
 * - Symbol/code search (regex-based for common languages)
 * - Fuzzy matching
 * - Search result ranking
 * - Incremental search
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { escapeRegex } from '../utils/regex.js';
import type { SearchMatch } from './types.js';

// ============================================================
// Types
// ============================================================

// Re-export SearchMatch from shared types
export type { SearchMatch } from './types.js';

export interface FileSearchOptions {
  pattern: string | RegExp;
  paths?: string[];
  glob?: string;
  ignorePatterns?: string[];
  caseSensitive?: boolean;
  wholeWord?: boolean;
  maxResults?: number;
  contextLines?: number;
  includeHidden?: boolean;
}

export interface SymbolMatch {
  name: string;
  type:
    | 'function'
    | 'class'
    | 'variable'
    | 'interface'
    | 'type'
    | 'method'
    | 'property'
    | 'import'
    | 'export';
  file: string;
  line: number;
  signature?: string;
  score?: number;
}

export interface SymbolSearchOptions {
  pattern: string;
  types?: SymbolMatch['type'][];
  paths?: string[];
  glob?: string;
  maxResults?: number;
}

export interface FuzzyMatch<T> {
  item: T;
  score: number;
  matches: number[][];
}

export interface NativeSearchConfig {
  rootDir: string;
  defaultIgnore?: string[];
  maxFileSize?: number;
  defaultContextLines?: number;
}

// ============================================================
// Symbol Patterns (for common languages)
// ============================================================

const SYMBOL_PATTERNS: Record<string, Record<string, RegExp>> = {
  typescript: {
    function: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    class: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g,
    interface: /(?:export\s+)?interface\s+(\w+)/g,
    type: /(?:export\s+)?type\s+(\w+)/g,
    variable: /(?:export\s+)?(?:const|let|var)\s+(\w+)/g,
    method: /(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/g,
  },
  javascript: {
    function: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    class: /(?:export\s+)?class\s+(\w+)/g,
    variable: /(?:export\s+)?(?:const|let|var)\s+(\w+)/g,
    method: /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g,
  },
  python: {
    function: /def\s+(\w+)\s*\(/g,
    class: /class\s+(\w+)/g,
    variable: /^(\w+)\s*=/gm,
    method: /def\s+(\w+)\s*\(self/g,
  },
  rust: {
    function: /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g,
    struct: /(?:pub\s+)?struct\s+(\w+)/g,
    enum: /(?:pub\s+)?enum\s+(\w+)/g,
    trait: /(?:pub\s+)?trait\s+(\w+)/g,
    impl: /impl(?:<[^>]+>)?\s+(\w+)/g,
  },
};

// ============================================================
// NativeSearch Class
// ============================================================

export class NativeSearch {
  private config: Required<NativeSearchConfig>;

  constructor(config: NativeSearchConfig) {
    this.config = {
      rootDir: path.resolve(config.rootDir),
      defaultIgnore: config.defaultIgnore || [
        'node_modules',
        '.git',
        'dist',
        'build',
        '__pycache__',
      ],
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
      defaultContextLines: config.defaultContextLines || 2,
    };
  }

  // ============================================================
  // File Content Search
  // ============================================================

  /**
   * Search file contents
   */
  async searchFiles(options: FileSearchOptions): Promise<SearchMatch[]> {
    const {
      pattern,
      caseSensitive = false,
      wholeWord = false,
      maxResults = 100,
      contextLines: _contextLines = this.config.defaultContextLines,
      includeHidden: _includeHidden = false,
    } = options;

    // Build regex
    let regex: RegExp;
    if (pattern instanceof RegExp) {
      regex = pattern;
    } else {
      let patternStr = escapeRegex(pattern);
      if (wholeWord) {
        patternStr = `\\b${patternStr}\\b`;
      }
      regex = new RegExp(patternStr, caseSensitive ? 'g' : 'gi');
    }

    // Get files to search
    const files = await this.getFilesToSearch(options);
    const matches: SearchMatch[] = [];

    for (const file of files) {
      if (matches.length >= maxResults) break;

      try {
        const absolutePath = path.join(this.config.rootDir, file);
        const stats = await fs.stat(absolutePath);

        if (stats.size > this.config.maxFileSize) continue;

        const content = await fs.readFile(absolutePath, 'utf-8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];

          for (let match = regex.exec(line); match !== null; match = regex.exec(line)) {
            const searchMatch: SearchMatch = {
              file,
              line: i + 1,
              column: match.index + 1,
              content: line,
              matchedText: match[0],
            };

            if (_contextLines > 0) {
              const beforeStart = Math.max(0, i - _contextLines);
              const afterEnd = Math.min(lines.length - 1, i + _contextLines);

              searchMatch.context = {
                before: lines.slice(beforeStart, i),
                after: lines.slice(i + 1, afterEnd + 1),
              };
            }

            matches.push(searchMatch);

            if (matches.length >= maxResults) break;

            // Prevent infinite loop for non-global regex
            if (!regex.global) break;
          }

          // Reset for next line
          regex.lastIndex = 0;
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return matches;
  }

  /**
   * Quick grep-like search
   */
  async grep(pattern: string, glob?: string): Promise<SearchMatch[]> {
    return this.searchFiles({
      pattern,
      glob: glob || '**/*',
      maxResults: 50,
      contextLines: 1,
    });
  }

  // ============================================================
  // Symbol Search
  // ============================================================

  /**
   * Search for code symbols
   */
  async searchSymbols(options: SymbolSearchOptions): Promise<SymbolMatch[]> {
    const { pattern, types, maxResults = 100 } = options;

    const files = await this.getFilesToSearch({
      pattern: '',
      glob: options.glob || '**/*.{ts,tsx,js,jsx,py,rs}',
      paths: options.paths,
    });

    const matches: SymbolMatch[] = [];
    const patternRegex = new RegExp(pattern, 'i');

    for (const file of files) {
      if (matches.length >= maxResults) break;

      try {
        const absolutePath = path.join(this.config.rootDir, file);
        const content = await fs.readFile(absolutePath, 'utf-8');
        const ext = path.extname(file).slice(1);

        // Determine language
        const lang = this.detectLanguage(ext);
        if (!lang) continue;

        const patterns = SYMBOL_PATTERNS[lang];
        if (!patterns) continue;

        const lines = content.split('\n');

        for (const [symbolType, regex] of Object.entries(patterns)) {
          if (types && !types.includes(symbolType as SymbolMatch['type'])) {
            continue;
          }

          for (let match = regex.exec(content); match !== null; match = regex.exec(content)) {
            const name = match[1];

            if (patternRegex.test(name)) {
              // Find line number
              const beforeMatch = content.slice(0, match.index);
              const lineNumber = beforeMatch.split('\n').length;

              matches.push({
                name,
                type: symbolType as SymbolMatch['type'],
                file,
                line: lineNumber,
                signature: lines[lineNumber - 1]?.trim(),
                score: this.calculateSymbolScore(name, pattern),
              });

              if (matches.length >= maxResults) break;
            }
          }

          // Reset regex
          regex.lastIndex = 0;
        }
      } catch {
        // Skip files that can't be processed
      }
    }

    // Sort by score
    return matches.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  /**
   * Find function/class definition
   */
  async findDefinition(name: string): Promise<SymbolMatch | null> {
    const matches = await this.searchSymbols({
      pattern: `^${name}$`,
      maxResults: 1,
    });
    return matches[0] || null;
  }

  /**
   * Find all references to a symbol
   */
  async findReferences(name: string, glob?: string): Promise<SearchMatch[]> {
    return this.searchFiles({
      pattern: `\\b${escapeRegex(name)}\\b`,
      glob: glob || '**/*.{ts,tsx,js,jsx,py,rs}',
      wholeWord: true,
      maxResults: 100,
    });
  }

  // ============================================================
  // Fuzzy Search
  // ============================================================

  /**
   * Fuzzy search strings
   */
  fuzzyMatch<T>(items: T[], query: string, accessor: (item: T) => string): FuzzyMatch<T>[] {
    const results: FuzzyMatch<T>[] = [];
    const queryLower = query.toLowerCase();

    for (const item of items) {
      const str = accessor(item).toLowerCase();
      const result = this.fuzzyScore(str, queryLower);

      if (result.score > 0) {
        results.push({
          item,
          score: result.score,
          matches: result.matches,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Fuzzy file search
   */
  async fuzzyFindFile(query: string, maxResults: number = 20): Promise<FuzzyMatch<string>[]> {
    const files = await this.getFilesToSearch({
      pattern: '',
      glob: '**/*',
    });

    return this.fuzzyMatch(files, query, (f) => path.basename(f)).slice(0, maxResults);
  }

  // ============================================================
  // Incremental Search
  // ============================================================

  /**
   * Create incremental searcher for large codebases
   */
  createIncrementalSearcher(options: FileSearchOptions): AsyncGenerator<SearchMatch> {
    return this.incrementalSearch(options);
  }

  private async *incrementalSearch(options: FileSearchOptions): AsyncGenerator<SearchMatch> {
    const files = await this.getFilesToSearch(options);

    for (const file of files) {
      const matches = await this.searchFiles({
        ...options,
        paths: [file],
        maxResults: 100,
      });

      for (const match of matches) {
        yield match;
      }
    }
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private async getFilesToSearch(options: FileSearchOptions): Promise<string[]> {
    const { glob: globPattern, paths, ignorePatterns = [], includeHidden = false } = options;

    if (paths && paths.length > 0) {
      return paths;
    }

    // Use simple recursive directory walk instead of glob
    const files: string[] = [];
    const ignore = [...this.config.defaultIgnore, ...ignorePatterns];

    const walk = async (dir: string, relativePath: string = ''): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(relativePath, entry.name);

        // Skip ignored
        if (ignore.some((i) => entry.name.includes(i) || relPath.includes(i))) {
          continue;
        }

        // Skip hidden unless requested
        if (!includeHidden && entry.name.startsWith('.')) {
          continue;
        }

        if (entry.isDirectory()) {
          await walk(fullPath, relPath);
        } else if (entry.isFile()) {
          // Simple glob matching
          if (globPattern) {
            const ext = path.extname(entry.name);
            // Extract extensions from glob like "**/*.{ts,js}"
            const extMatch = globPattern.match(/\*\.(\{[^}]+\}|\w+)$/);
            if (extMatch) {
              const allowedExts = extMatch[1]
                .replace(/[{}]/g, '')
                .split(',')
                .map((e) => `.${e}`);
              if (!allowedExts.includes(ext)) {
                continue;
              }
            }
          }
          files.push(relPath);
        }
      }
    };

    await walk(this.config.rootDir);
    return files;
  }

  private detectLanguage(ext: string): string | null {
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      rs: 'rust',
    };
    return langMap[ext] || null;
  }

  private calculateSymbolScore(name: string, pattern: string): number {
    const nameLower = name.toLowerCase();
    const patternLower = pattern.toLowerCase();

    // Exact match
    if (name === pattern) return 100;
    if (nameLower === patternLower) return 95;

    // Starts with
    if (nameLower.startsWith(patternLower)) return 80;

    // Contains
    if (nameLower.includes(patternLower)) return 60;

    // Fuzzy
    return this.fuzzyScore(nameLower, patternLower).score;
  }

  private fuzzyScore(str: string, query: string): { score: number; matches: number[][] } {
    if (query.length === 0) return { score: 0, matches: [] };

    let score = 0;
    let queryIndex = 0;
    let matchStart = -1;
    const matches: number[][] = [];

    for (let i = 0; i < str.length && queryIndex < query.length; i++) {
      if (str[i] === query[queryIndex]) {
        if (matchStart < 0) matchStart = i;
        queryIndex++;
        score += 1;

        // Bonus for consecutive matches
        if (i > 0 && str[i - 1] === query[queryIndex - 2]) {
          score += 2;
        }

        // Bonus for word boundary
        if (i === 0 || !str[i - 1].match(/\w/)) {
          score += 3;
        }
      } else if (matchStart >= 0) {
        matches.push([matchStart, i - 1]);
        matchStart = -1;
      }
    }

    if (matchStart >= 0) {
      matches.push([matchStart, str.length - 1]);
    }

    // Penalize if not all query chars matched
    if (queryIndex < query.length) {
      score = 0;
    }

    return { score, matches };
  }

  // ============================================================
  // Status
  // ============================================================

  printStatus(): void {
    console.log(chalk.cyan('\n=== Native Search ===\n'));
    console.log(chalk.gray(`  Root: ${this.config.rootDir}`));
    console.log(
      chalk.gray(`  Max File Size: ${(this.config.maxFileSize / 1024 / 1024).toFixed(1)}MB`),
    );
    console.log(chalk.gray(`  Default Context Lines: ${this.config.defaultContextLines}`));
    console.log(chalk.gray(`  Ignored: ${this.config.defaultIgnore.join(', ')}`));
  }
}

// ============================================================
// Factory Function
// ============================================================

export function createSearch(rootDir: string, options?: Partial<NativeSearchConfig>): NativeSearch {
  return new NativeSearch({ rootDir, ...options });
}

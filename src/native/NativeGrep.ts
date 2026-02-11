/**
 * NativeGrep - Ripgrep-like search for GeminiHydra
 *
 * Provides powerful content search with:
 * - Regex and literal pattern matching
 * - Case insensitivity
 * - Multiline matching
 * - Context lines (before/after)
 * - File type filtering
 * - Multiple output modes: content, files_with_matches, count
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { escapeRegex } from '../utils/regex.js';
import { createGlob, type NativeGlob } from './NativeGlob.js';

// ============================================================
// Types
// ============================================================

export interface GrepOptions {
  /** Regex pattern to search for */
  pattern: string;
  /** Base path to search in */
  path?: string;
  /** File glob pattern filter */
  glob?: string;
  /** File type: "js", "py", "ts", "go", "rust", etc. */
  type?: string;
  /** Case insensitive search (-i) */
  ignoreCase?: boolean;
  /** Multiline mode - pattern can span lines (-U) */
  multiline?: boolean;
  /** Match whole words only (-w) */
  wordBoundary?: boolean;
  /** Treat pattern as literal string (-F) */
  literal?: boolean;
  /** Invert match - return non-matching lines (-v) */
  invertMatch?: boolean;
  /** Lines before match (-B) */
  contextBefore?: number;
  /** Lines after match (-A) */
  contextAfter?: number;
  /** Lines before and after match (-C) */
  context?: number;
  /** Maximum results (head_limit) */
  maxResults?: number;
  /** Skip first N results */
  offset?: number;
  /** Output mode */
  outputMode?: 'content' | 'files_with_matches' | 'count';
  /** Show line numbers (default: true) */
  showLineNumbers?: boolean;
  /** Include file names in output (default: true) */
  showFileNames?: boolean;
}

export interface GrepMatch {
  /** File path (relative) */
  file: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column (1-indexed) */
  column: number;
  /** Full line content */
  content: string;
  /** Matched text */
  matchedText: string;
  /** Context lines */
  context?: {
    before: string[];
    after: string[];
  };
}

export interface GrepFilesResult {
  files: string[];
  totalMatches: number;
}

export interface GrepCountResult {
  counts: Map<string, number>;
  totalMatches: number;
  totalFiles: number;
}

export type GrepResult = GrepMatch[] | GrepFilesResult | GrepCountResult;

export interface GrepStats {
  filesSearched: number;
  filesMatched: number;
  totalMatches: number;
  elapsedMs: number;
}

export interface NativeGrepConfig {
  rootDir: string;
  maxFileSize?: number;
  defaultIgnore?: string[];
}

// ============================================================
// File Type Extensions
// ============================================================

const FILE_TYPE_EXTENSIONS: Record<string, string[]> = {
  js: ['.js', '.mjs', '.cjs'],
  jsx: ['.jsx'],
  ts: ['.ts', '.mts', '.cts'],
  tsx: ['.tsx'],
  typescript: ['.ts', '.tsx', '.mts', '.cts'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  py: ['.py', '.pyw', '.pyi'],
  python: ['.py', '.pyw', '.pyi'],
  rust: ['.rs'],
  rs: ['.rs'],
  go: ['.go'],
  java: ['.java'],
  c: ['.c', '.h'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx', '.h'],
  csharp: ['.cs'],
  cs: ['.cs'],
  php: ['.php', '.phtml'],
  ruby: ['.rb', '.rake', '.gemspec'],
  rb: ['.rb'],
  swift: ['.swift'],
  kotlin: ['.kt', '.kts'],
  scala: ['.scala', '.sc'],
  elixir: ['.ex', '.exs'],
  erlang: ['.erl', '.hrl'],
  haskell: ['.hs', '.lhs'],
  lua: ['.lua'],
  perl: ['.pl', '.pm'],
  r: ['.r', '.R'],
  julia: ['.jl'],
  dart: ['.dart'],
  vue: ['.vue'],
  svelte: ['.svelte'],
  html: ['.html', '.htm', '.xhtml'],
  css: ['.css', '.scss', '.sass', '.less'],
  json: ['.json', '.jsonc'],
  yaml: ['.yaml', '.yml'],
  toml: ['.toml'],
  xml: ['.xml', '.xsl', '.xslt'],
  md: ['.md', '.markdown'],
  markdown: ['.md', '.markdown'],
  sql: ['.sql'],
  sh: ['.sh', '.bash', '.zsh'],
  bash: ['.sh', '.bash'],
  ps1: ['.ps1', '.psm1', '.psd1'],
  powershell: ['.ps1', '.psm1', '.psd1'],
  dockerfile: ['Dockerfile', '.dockerfile'],
  makefile: ['Makefile', 'makefile', '*.mk'],
  zig: ['.zig'],
  nim: ['.nim'],
  pascal: ['.pas', '.pp'],
  fortran: ['.f', '.f90', '.f95', '.f03', '.f08'],
  groovy: ['.groovy', '.gvy', '.gy', '.gsh'],
};

// ============================================================
// NativeGrep Class
// ============================================================

export class NativeGrep {
  private rootDir: string;
  private maxFileSize: number;
  private nativeGlob: NativeGlob;
  private lastStats: GrepStats | null = null;

  constructor(config: NativeGrepConfig) {
    this.rootDir = path.resolve(config.rootDir);
    this.maxFileSize = config.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.nativeGlob = createGlob(this.rootDir, {
      defaultIgnore: config.defaultIgnore,
    });
  }

  // ============================================================
  // Main Grep Method
  // ============================================================

  /**
   * Search for pattern in files
   */
  async grep(options: GrepOptions): Promise<GrepResult> {
    const startTime = Date.now();
    const {
      pattern,
      path: basePath = '.',
      glob: fileGlob,
      type,
      ignoreCase = false,
      multiline = false,
      wordBoundary = false,
      literal = false,
      invertMatch = false,
      contextBefore = 0,
      contextAfter = 0,
      context = 0,
      maxResults,
      offset = 0,
      outputMode = 'content',
      showLineNumbers: _showLineNumbers = true,
      showFileNames: _showFileNames = true,
    } = options;

    // Build regex
    let regexPattern = literal ? escapeRegex(pattern) : pattern;
    if (wordBoundary) {
      regexPattern = `\\b${regexPattern}\\b`;
    }

    let flags = 'g';
    if (ignoreCase) flags += 'i';
    if (multiline) flags += 'ms';

    const regex = new RegExp(regexPattern, flags);

    // Determine context lines
    const ctxBefore = context || contextBefore;
    const ctxAfter = context || contextAfter;

    // Get files to search
    const files = await this.getFilesToSearch(basePath, fileGlob, type);

    // Search based on output mode
    let result: GrepResult;

    switch (outputMode) {
      case 'files_with_matches':
        result = await this.searchFilesWithMatches(files, regex, invertMatch);
        break;
      case 'count':
        result = await this.searchCount(files, regex, invertMatch);
        break;
      default:
        result = await this.searchContent(
          files,
          regex,
          invertMatch,
          ctxBefore,
          ctxAfter,
          maxResults,
          offset,
        );
        break;
    }

    // Update stats
    const elapsedMs = Date.now() - startTime;
    this.lastStats = {
      filesSearched: files.length,
      filesMatched: this.getFilesMatched(result),
      totalMatches: this.getTotalMatches(result),
      elapsedMs,
    };

    return result;
  }

  // ============================================================
  // Search Methods by Output Mode
  // ============================================================

  private async searchContent(
    files: string[],
    regex: RegExp,
    invertMatch: boolean,
    ctxBefore: number,
    ctxAfter: number,
    maxResults?: number,
    offset: number = 0,
  ): Promise<GrepMatch[]> {
    const matches: GrepMatch[] = [];
    let skipped = 0;

    for (const file of files) {
      if (maxResults && matches.length >= maxResults) break;

      const fileMatches = await this.searchFile(file, regex, invertMatch, ctxBefore, ctxAfter);

      for (const match of fileMatches) {
        if (skipped < offset) {
          skipped++;
          continue;
        }

        matches.push(match);

        if (maxResults && matches.length >= maxResults) break;
      }
    }

    return matches;
  }

  private async searchFilesWithMatches(
    files: string[],
    regex: RegExp,
    invertMatch: boolean,
  ): Promise<GrepFilesResult> {
    const matchingFiles: string[] = [];
    let totalMatches = 0;

    for (const file of files) {
      try {
        const absolutePath = path.join(this.rootDir, file);
        const content = await fs.readFile(absolutePath, 'utf-8');

        const hasMatch = regex.test(content);
        regex.lastIndex = 0; // Reset for next file

        if (invertMatch ? !hasMatch : hasMatch) {
          matchingFiles.push(file);

          // Count matches in this file
          const fileMatches = content.match(regex);
          totalMatches += fileMatches?.length || 0;
        }
      } catch {
        // Skip files we can't read
      }
    }

    return { files: matchingFiles, totalMatches };
  }

  private async searchCount(
    files: string[],
    regex: RegExp,
    invertMatch: boolean,
  ): Promise<GrepCountResult> {
    const counts = new Map<string, number>();
    let totalMatches = 0;
    let totalFiles = 0;

    for (const file of files) {
      try {
        const absolutePath = path.join(this.rootDir, file);
        const content = await fs.readFile(absolutePath, 'utf-8');

        if (invertMatch) {
          // Count non-matching lines
          const lines = content.split('\n');
          let count = 0;
          for (const line of lines) {
            if (!regex.test(line)) {
              count++;
            }
            regex.lastIndex = 0;
          }
          if (count > 0) {
            counts.set(file, count);
            totalMatches += count;
            totalFiles++;
          }
        } else {
          // Count matches
          const matches = content.match(regex);
          if (matches && matches.length > 0) {
            counts.set(file, matches.length);
            totalMatches += matches.length;
            totalFiles++;
          }
        }
      } catch {
        // Skip files we can't read
      }
    }

    return { counts, totalMatches, totalFiles };
  }

  // ============================================================
  // Single File Search
  // ============================================================

  private async searchFile(
    file: string,
    regex: RegExp,
    invertMatch: boolean,
    ctxBefore: number,
    ctxAfter: number,
  ): Promise<GrepMatch[]> {
    const matches: GrepMatch[] = [];

    try {
      const absolutePath = path.join(this.rootDir, file);
      const stat = await fs.stat(absolutePath);

      if (stat.size > this.maxFileSize) {
        return matches;
      }

      const content = await fs.readFile(absolutePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Handle invert match
        if (invertMatch) {
          if (!regex.test(line)) {
            matches.push({
              file,
              line: i + 1,
              column: 1,
              content: line,
              matchedText: '',
              context: this.getContext(lines, i, ctxBefore, ctxAfter),
            });
          }
          regex.lastIndex = 0;
          continue;
        }

        // Normal match
        for (let match = regex.exec(line); match !== null; match = regex.exec(line)) {
          matches.push({
            file,
            line: i + 1,
            column: match.index + 1,
            content: line,
            matchedText: match[0],
            context:
              ctxBefore > 0 || ctxAfter > 0
                ? this.getContext(lines, i, ctxBefore, ctxAfter)
                : undefined,
          });

          // Prevent infinite loop for zero-length matches
          if (match[0].length === 0) {
            regex.lastIndex++;
          }

          // For non-global regex, break after first match
          if (!regex.global) break;
        }

        // Reset for next line
        regex.lastIndex = 0;
      }
    } catch {
      // Skip files we can't read
    }

    return matches;
  }

  // ============================================================
  // Convenience Methods
  // ============================================================

  /**
   * Simple search (returns matches)
   */
  async search(pattern: string, glob?: string): Promise<GrepMatch[]> {
    return this.grep({
      pattern,
      glob: glob || '**/*',
      outputMode: 'content',
      maxResults: 100,
    }) as Promise<GrepMatch[]>;
  }

  /**
   * Get files with matches
   */
  async filesWithMatches(pattern: string, glob?: string): Promise<string[]> {
    const result = (await this.grep({
      pattern,
      glob: glob || '**/*',
      outputMode: 'files_with_matches',
    })) as GrepFilesResult;
    return result.files;
  }

  /**
   * Count matches
   */
  async count(pattern: string, glob?: string): Promise<Map<string, number>> {
    const result = (await this.grep({
      pattern,
      glob: glob || '**/*',
      outputMode: 'count',
    })) as GrepCountResult;
    return result.counts;
  }

  /**
   * Multiline search
   */
  async multilineSearch(pattern: string, glob?: string): Promise<GrepMatch[]> {
    return this.grep({
      pattern,
      glob: glob || '**/*',
      multiline: true,
      outputMode: 'content',
      maxResults: 100,
    }) as Promise<GrepMatch[]>;
  }

  /**
   * Case insensitive search
   */
  async searchIgnoreCase(pattern: string, glob?: string): Promise<GrepMatch[]> {
    return this.grep({
      pattern,
      glob: glob || '**/*',
      ignoreCase: true,
      outputMode: 'content',
      maxResults: 100,
    }) as Promise<GrepMatch[]>;
  }

  /**
   * Search with context
   */
  async searchWithContext(
    pattern: string,
    context: number = 2,
    glob?: string,
  ): Promise<GrepMatch[]> {
    return this.grep({
      pattern,
      glob: glob || '**/*',
      context,
      outputMode: 'content',
      maxResults: 50,
    }) as Promise<GrepMatch[]>;
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private async getFilesToSearch(
    basePath: string,
    fileGlob?: string,
    type?: string,
  ): Promise<string[]> {
    let pattern: string;

    if (type && FILE_TYPE_EXTENSIONS[type.toLowerCase()]) {
      const extensions = FILE_TYPE_EXTENSIONS[type.toLowerCase()];
      if (extensions.length === 1) {
        pattern = `**/*${extensions[0]}`;
      } else {
        pattern = `**/*.{${extensions.map((e) => e.replace(/^\./, '')).join(',')}}`;
      }
    } else if (fileGlob) {
      pattern = fileGlob;
    } else {
      // Default: all text files
      pattern = '**/*';
    }

    const searchPath = path.isAbsolute(basePath) ? path.relative(this.rootDir, basePath) : basePath;

    const results = await this.nativeGlob.glob({
      pattern,
      path: searchPath,
      onlyFiles: true,
      sortByMtime: false,
    });

    return results.map((r) => r.relativePath);
  }

  private getContext(
    lines: string[],
    lineIndex: number,
    ctxBefore: number,
    ctxAfter: number,
  ): { before: string[]; after: string[] } | undefined {
    if (ctxBefore === 0 && ctxAfter === 0) {
      return undefined;
    }

    const beforeStart = Math.max(0, lineIndex - ctxBefore);
    const afterEnd = Math.min(lines.length - 1, lineIndex + ctxAfter);

    return {
      before: lines.slice(beforeStart, lineIndex),
      after: lines.slice(lineIndex + 1, afterEnd + 1),
    };
  }

  private getFilesMatched(result: GrepResult): number {
    if (Array.isArray(result)) {
      const files = new Set(result.map((m) => m.file));
      return files.size;
    } else if ('files' in result) {
      return result.files.length;
    } else if ('counts' in result) {
      return result.totalFiles;
    }
    return 0;
  }

  private getTotalMatches(result: GrepResult): number {
    if (Array.isArray(result)) {
      return result.length;
    } else if ('totalMatches' in result) {
      return result.totalMatches;
    }
    return 0;
  }

  // ============================================================
  // Stats and Status
  // ============================================================

  /**
   * Get stats from last grep operation
   */
  getStats(): GrepStats | null {
    return this.lastStats;
  }

  /**
   * Print status
   */
  printStatus(): void {
    console.log(chalk.cyan('\n=== Native Grep ===\n'));
    console.log(chalk.gray(`  Root: ${this.rootDir}`));
    console.log(chalk.gray(`  Max File Size: ${(this.maxFileSize / 1024 / 1024).toFixed(1)}MB`));
    console.log(chalk.gray(`  Supported Types: ${Object.keys(FILE_TYPE_EXTENSIONS).length}`));

    if (this.lastStats) {
      console.log(chalk.gray(`\n  Last Query:`));
      console.log(chalk.gray(`    Files Searched: ${this.lastStats.filesSearched}`));
      console.log(chalk.gray(`    Files Matched: ${this.lastStats.filesMatched}`));
      console.log(chalk.gray(`    Total Matches: ${this.lastStats.totalMatches}`));
      console.log(chalk.gray(`    Time: ${this.lastStats.elapsedMs}ms`));
    }
  }

  /**
   * Get supported file types
   */
  getSupportedTypes(): string[] {
    return Object.keys(FILE_TYPE_EXTENSIONS);
  }

  /**
   * Get extensions for a type
   */
  getExtensionsForType(type: string): string[] | undefined {
    return FILE_TYPE_EXTENSIONS[type.toLowerCase()];
  }
}

// ============================================================
// Factory Functions
// ============================================================

/**
 * Create a new NativeGrep instance
 */
export function createGrep(rootDir: string, options?: Partial<NativeGrepConfig>): NativeGrep {
  return new NativeGrep({ rootDir, ...options });
}

// ============================================================
// Singleton Instance
// ============================================================

let _nativeGrepInstance: NativeGrep | null = null;

/**
 * Get or create singleton instance
 */
export function getNativeGrep(rootDir?: string): NativeGrep {
  if (!_nativeGrepInstance) {
    _nativeGrepInstance = createGrep(rootDir || process.cwd());
  }
  return _nativeGrepInstance;
}

/**
 * Singleton export
 */
export const nativeGrep = getNativeGrep();

export default nativeGrep;

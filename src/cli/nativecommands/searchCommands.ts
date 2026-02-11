/**
 * NativeCommands - Search commands
 *
 * Simple grep-like text search (NOT LSP semantic search).
 * Commands: grep, symbol, file, refs
 *
 * @module cli/nativecommands/searchCommands
 */

import {
  type CommandResult,
  createFailedMessage,
  error,
  getTools,
  highlightMatch,
  Spinner,
  success,
  truncate,
} from './helpers.js';

// ============================================================
// Search Commands
// ============================================================
//
// IMPORTANT - Search command distinction:
// - /search grep = Simple grep-like text search (plain text pattern matching)
// - /fs search = Same as /search grep (simple text search)
// - /grep = Alias for /search grep
// - /serena search = LSP-powered semantic code search (in SerenaCommands.ts)
//
// ============================================================

export const searchCommands = {
  /**
   * Grep-like search (simple text pattern matching)
   * NOTE: For LSP-powered semantic search, use /serena search instead
   */
  async grep(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /search grep <pattern> [glob]');
    }

    const [pattern, glob] = args;
    const spinner = new Spinner(`Searching for "${pattern}"...`);

    try {
      const tools = getTools();
      spinner.start();
      const matches = await tools.search.grep(pattern, glob);
      spinner.stop();

      const results = matches.slice(0, 30).map((m) => ({
        file: m.file,
        line: m.line,
        content: highlightMatch(truncate(m.content, 60), pattern),
      }));

      return success(
        {
          results,
          showing: Math.min(30, matches.length),
        },
        `Found ${matches.length} matches`,
      );
    } catch (err) {
      spinner.stop();
      return error(createFailedMessage('search', err));
    }
  },

  /**
   * Find symbol definitions
   */
  async symbol(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /search symbol <name> [type]');
    }

    const [pattern, type] = args;
    const spinner = new Spinner(`Finding symbols matching "${pattern}"...`);

    try {
      const tools = getTools();
      spinner.start();
      const symbols = await tools.search.searchSymbols({
        pattern,
        // biome-ignore lint/suspicious/noExplicitAny: user-provided string cast to symbol type enum
        types: type ? [type as any] : undefined,
        maxResults: 20,
      });
      spinner.stop();

      const results = symbols.map((s) => ({
        name: s.name,
        type: s.type,
        file: s.file,
        line: s.line,
        signature: truncate(s.signature || '', 50),
      }));

      return success({ results }, `Found ${symbols.length} symbols`);
    } catch (err) {
      spinner.stop();
      return error(createFailedMessage('search symbols', err));
    }
  },

  /**
   * Find file by fuzzy matching
   */
  async file(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /search file <query>');
    }

    const query = args.join(' ');

    try {
      const tools = getTools();
      const matches = await tools.search.fuzzyFindFile(query, 15);

      const results = matches.map((m) => ({
        file: m.item,
        score: m.score.toFixed(1),
      }));

      return success({ results }, `Files matching "${query}"`);
    } catch (err) {
      return error(createFailedMessage('search files', err));
    }
  },

  /**
   * Find references to a symbol
   */
  async refs(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /search refs <name> [glob]');
    }

    const [name, glob] = args;
    const spinner = new Spinner(`Finding references to "${name}"...`);

    try {
      const tools = getTools();
      spinner.start();
      const refs = await tools.search.findReferences(name, glob);
      spinner.stop();

      const results = refs.slice(0, 30).map((r) => ({
        file: r.file,
        line: r.line,
        content: highlightMatch(truncate(r.content, 60), name),
      }));

      return success(
        {
          results,
          showing: Math.min(30, refs.length),
        },
        `Found ${refs.length} references to "${name}"`,
      );
    } catch (err) {
      spinner.stop();
      return error(createFailedMessage('find references', err));
    }
  },
};

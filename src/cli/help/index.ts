/**
 * Help System Module - Main handler, registration, and re-exports
 *
 * @module help
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import chalk from 'chalk';
import { getBooleanFlag, getStringFlag, parseArgs } from '../CommandHelpers.js';
import {
  type CommandContext,
  type CommandResult,
  commandRegistry,
  error,
  success,
} from '../CommandRegistry.js';

// Re-export exporters
export { exportToJSON, exportToMarkdown } from './exporters.js';
// Re-export formatting
export { formatArg, formatSignature } from './formatting.js';
// Re-export generators
export {
  generateCategoryHelp,
  generateCommandHelp,
  generateFullReference,
  generateOverview,
  searchHelp,
} from './generators.js';
// Re-export registry and config
export {
  categoryConfig,
  getCategoryDisplay,
  helpMetaRegistry,
} from './HelpMetaRegistry.js';

// Re-export interactive
export { runInteractiveHelp } from './interactive.js';
// Re-export all types
export type {
  CategoryConfig,
  CommandExample,
  CommandHelpMeta,
  ExportFormat,
} from './types.js';

import {
  exportToJSON as _exportToJSON,
  exportToMarkdown as _exportToMarkdown,
} from './exporters.js';
import {
  generateCategoryHelp as _generateCategoryHelp,
  generateCommandHelp as _generateCommandHelp,
  generateFullReference as _generateFullReference,
  generateOverview as _generateOverview,
  searchHelp as _searchHelp,
} from './generators.js';
// Local imports for handler (needed because re-exports don't create local bindings)
import { helpMetaRegistry } from './HelpMetaRegistry.js';
import { runInteractiveHelp as _runInteractiveHelp } from './interactive.js';
import type { CommandExample } from './types.js';

// ============================================================
// Main Help Handler
// ============================================================

async function helpHandler(ctx: CommandContext): Promise<CommandResult> {
  const { positional, flags } = parseArgs(ctx.args);

  if (getBooleanFlag(flags, 'interactive', 'i')) {
    await _runInteractiveHelp();
    return success(null, 'Interactive help session ended');
  }

  if (getBooleanFlag(flags, 'export', 'e') || getStringFlag(flags, 'export')) {
    const format = getStringFlag(flags, 'format', 'f') || 'markdown';
    const filename =
      typeof flags.export === 'string'
        ? flags.export
        : getStringFlag(flags, 'output', 'o') ||
          `help-reference.${format === 'json' ? 'json' : 'md'}`;

    let content: string;
    if (format === 'json') {
      content = _exportToJSON();
    } else {
      content = _exportToMarkdown();
    }

    try {
      const outputPath = path.resolve(ctx.cwd, filename);
      await fs.writeFile(outputPath, content, 'utf-8');
      return success({ path: outputPath, format }, `Help exported to: ${outputPath}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return error(`Failed to export help: ${msg}`);
    }
  }

  if (getBooleanFlag(flags, 'all', 'a')) {
    console.log(_generateFullReference());
    return success(null, 'Full reference displayed');
  }

  const searchQuery = getStringFlag(flags, 'search', 's');
  if (searchQuery) {
    console.log(_searchHelp(searchQuery));
    return success(null, 'Search results displayed');
  }

  const category = getStringFlag(flags, 'category', 'c');
  if (category) {
    console.log(_generateCategoryHelp(category));
    return success(null, 'Category help displayed');
  }

  if (positional.length > 0) {
    const cmdName = positional[0].replace(/^\//, '');
    console.log(_generateCommandHelp(cmdName));
    return success(null, 'Command help displayed');
  }

  console.log(_generateOverview());
  return success(null, 'Help overview displayed');
}

export { helpHandler };

// ============================================================
// Command Registration
// ============================================================

export function registerHelpCommand(): void {
  commandRegistry.register({
    name: 'help',
    aliases: ['?', 'h'],
    description: 'Show help information',
    usage: '[command] [--all] [--category <name>] [--search <query>] [--interactive] [--export]',
    category: 'general',
    args: [
      {
        name: 'command',
        description: 'Command name to get help for',
        required: false,
      },
    ],
    handler: helpHandler,
  });

  initializeHelpMetadata();

  console.log(chalk.gray('[CLI] Help system registered'));
}

// ============================================================
// Helper Functions
// ============================================================

export function addCommandExamples(commandName: string, examples: CommandExample[]): void {
  const existing = helpMetaRegistry.get(commandName);
  if (existing?.examples) {
    helpMetaRegistry.register(commandName, {
      examples: [...existing.examples, ...examples],
    });
  } else {
    helpMetaRegistry.register(commandName, { examples });
  }
}

export function addCommandNotes(commandName: string, notes: string[]): void {
  const existing = helpMetaRegistry.get(commandName);
  if (existing?.notes) {
    helpMetaRegistry.register(commandName, {
      notes: [...existing.notes, ...notes],
    });
  } else {
    helpMetaRegistry.register(commandName, { notes });
  }
}

export function setCommandSeeAlso(commandName: string, seeAlso: string[]): void {
  helpMetaRegistry.register(commandName, { seeAlso });
}

export function deprecateCommand(commandName: string, message?: string): void {
  helpMetaRegistry.register(commandName, {
    deprecated: true,
    deprecatedMessage:
      message || 'This command is deprecated and may be removed in future versions',
  });
}

// ============================================================
// Initialize Default Help Metadata
// ============================================================

function initializeHelpMetadata(): void {
  helpMetaRegistry.register('help', {
    examples: [
      { command: '/help', description: 'Show general help overview' },
      { command: '/help sessions', description: 'Get help for sessions command' },
      { command: '/help --all', description: 'List all available commands' },
      { command: '/help --category ai', description: 'Show AI-related commands' },
      { command: '/help --search file', description: 'Search for file-related commands' },
      { command: '/help --interactive', description: 'Open interactive help browser' },
      { command: '/help --export docs/commands.md', description: 'Export help to markdown file' },
    ],
    notes: [
      'Use Tab for command autocompletion',
      'Commands starting with / are CLI commands',
      'Regular text is sent to the AI model',
    ],
    seeAlso: ['sessions', 'history', 'fs', 'shell'],
  });

  helpMetaRegistry.register('sessions', {
    examples: [
      { command: '/sessions list', description: 'List all chat sessions' },
      { command: '/sessions new "My Project"', description: 'Create new named session' },
      { command: '/sessions switch abc123', description: 'Switch to session by ID' },
      { command: '/sessions branch "experiment"', description: 'Fork current session' },
      { command: '/sessions export --format json', description: 'Export session to JSON' },
    ],
    notes: ['Sessions are automatically saved', 'Use /resume to quickly continue last session'],
    seeAlso: ['history', 'resume'],
  });

  helpMetaRegistry.register('fs', {
    examples: [
      { command: '/fs read src/index.ts', description: 'Read file contents' },
      { command: '/fs ls src --recursive', description: 'List directory recursively' },
      { command: '/fs write output.txt "Hello World"', description: 'Write to file' },
      { command: '/fs diagnose path/to/file', description: 'Diagnose path issues' },
      { command: '/fs encoding file.txt', description: 'Detect file encoding' },
    ],
    notes: [
      'Use --force to write to readonly files',
      'Use --encoding to specify file encoding',
      'Path diagnostics help troubleshoot access issues',
    ],
    seeAlso: ['shell', 'search'],
  });

  helpMetaRegistry.register('shell', {
    examples: [
      { command: '/shell run npm install', description: 'Run npm install' },
      { command: '/shell bg npm run dev', description: 'Start dev server in background' },
      { command: '/shell ps', description: 'List running processes' },
      { command: '/shell kill 1234', description: 'Kill process by PID' },
      { command: '/shell sysinfo', description: 'Show system information' },
    ],
    notes: [
      'Background processes continue after command returns',
      'Use /shell output <pid> to get process output',
    ],
    seeAlso: ['fs', 'native'],
  });

  helpMetaRegistry.register('search', {
    examples: [
      { command: '/search grep "TODO" "**/*.ts"', description: 'Search for TODO comments' },
      { command: '/search symbol useState', description: 'Find symbol definitions' },
      { command: '/search file app', description: 'Fuzzy find files' },
      { command: '/search refs handleClick', description: 'Find references to function' },
    ],
    notes: ['grep search is text-based', 'For LSP-powered semantic search, use /serena search'],
    seeAlso: ['fs', 'serena', 'grep'],
  });

  helpMetaRegistry.register('mem', {
    examples: [
      { command: '/mem set api_key sk-xxx', description: 'Store a value' },
      { command: '/mem get api_key', description: 'Retrieve a value' },
      { command: '/mem entity User class', description: 'Create entity' },
      { command: '/mem observe User "Has email field"', description: 'Add observation' },
      { command: '/mem relate User uses Database', description: 'Create relation' },
    ],
    notes: ['Memory is persisted across sessions', 'Use /mem save to force save to disk'],
    seeAlso: ['context', 'analyze'],
  });

  helpMetaRegistry.register('history', {
    examples: [
      { command: '/history show 20', description: 'Show last 20 messages' },
      { command: '/history search "error"', description: 'Search in history' },
      { command: '/history stats', description: 'Show session statistics' },
    ],
    seeAlso: ['sessions', 'resume'],
  });

  helpMetaRegistry.register('resume', {
    examples: [
      { command: '/resume', description: 'Resume last session' },
      { command: '/resume abc123', description: 'Resume specific session' },
    ],
    seeAlso: ['sessions', 'history'],
  });

  helpMetaRegistry.register('ollama', {
    examples: [
      { command: '/ollama', description: 'Show Ollama status' },
      { command: '/ollama-restart', description: 'Restart Ollama server' },
      { command: '/ollama-monitor start', description: 'Start health monitoring' },
    ],
    notes: [
      'Ollama provides local AI model inference',
      'Health monitoring auto-restarts on failures',
    ],
    seeAlso: ['ollama-restart', 'ollama-monitor'],
  });

  helpMetaRegistry.register('cmd', {
    examples: [
      { command: '/cmd list', description: 'List all commands' },
      { command: '/cmd list session', description: 'List session commands' },
      { command: '/cmd info fs', description: 'Show detailed info for /fs command' },
      { command: '/cmd diagnostics', description: 'Run full diagnostics' },
      { command: '/cmd diag validate', description: 'Validate registry consistency' },
      { command: '/cmd diag stats', description: 'Show command statistics' },
    ],
    notes: [
      'Use diagnostics to find issues with command registration',
      'Useful for debugging alias conflicts',
    ],
    seeAlso: ['help'],
  });

  helpMetaRegistry.register('native', {
    examples: [
      { command: '/native init', description: 'Initialize native tools for current directory' },
      {
        command: '/native init /path/to/project',
        description: 'Initialize for specific directory',
      },
      { command: '/native status', description: 'Show native tools status' },
      { command: '/native shutdown', description: 'Cleanup and shutdown tools' },
    ],
    notes: [
      'Native tools must be initialized before using /fs, /shell, /search, /mem',
      'Tools are initialized automatically on first use',
    ],
    seeAlso: ['fs', 'shell', 'search', 'mem'],
  });

  helpMetaRegistry.register('grep', {
    examples: [
      { command: '/grep "TODO"', description: 'Find all TODO comments' },
      {
        command: '/grep "import.*React" "**/*.tsx"',
        description: 'Find React imports in TSX files',
      },
      { command: '/grep "function" "src/**/*.ts"', description: 'Find functions in source files' },
    ],
    notes: [
      'Uses ripgrep for fast searching when available',
      'Supports glob patterns for file filtering',
      'For semantic code search, use /serena search',
    ],
    seeAlso: ['search', 'fs search', 'serena'],
  });

  helpMetaRegistry.register('serena', {
    examples: [
      { command: '/serena status', description: 'Show Serena connection status' },
      { command: '/serena symbols', description: 'List all symbols in project' },
      { command: '/serena search "handleClick"', description: 'Semantic search for symbol' },
      { command: '/serena refs useState', description: 'Find all references to useState' },
      { command: '/serena definition App', description: 'Go to definition of App' },
    ],
    notes: [
      'Serena provides LSP-powered code intelligence',
      'Requires Language Server Protocol support for your language',
      'Much more accurate than text-based search for code',
    ],
    seeAlso: ['search', 'analyze', 'context'],
  });

  helpMetaRegistry.register('context', {
    examples: [
      { command: '/context show', description: 'Show current context' },
      { command: '/context add src/App.tsx', description: 'Add file to context' },
      { command: '/context clear', description: 'Clear all context' },
      { command: '/context files', description: 'List files in context' },
    ],
    notes: [
      'Context helps the AI understand your codebase better',
      'Add relevant files before asking about specific code',
    ],
    seeAlso: ['analyze', 'memory'],
  });

  helpMetaRegistry.register('analyze', {
    examples: [
      { command: '/analyze', description: 'Analyze current directory' },
      { command: '/analyze src/', description: 'Analyze specific directory' },
      { command: '/analyze --deep', description: 'Run deep analysis' },
      { command: '/analyze --refresh', description: 'Refresh analysis cache' },
    ],
    notes: [
      'Creates a knowledge graph of your codebase',
      'Analysis results are cached for performance',
      'Use --refresh to update after code changes',
    ],
    seeAlso: ['context', 'memory', 'serena'],
  });

  helpMetaRegistry.register('mcpstatus', {
    examples: [
      { command: '/mcpstatus', description: 'Show all MCP server status' },
      { command: '/mcp', description: 'Alias for /mcpstatus' },
    ],
    notes: [
      'Most MCP servers have native replacements',
      'Use /fs, /shell, /search, /mem for native operations',
    ],
    seeAlso: ['ollama', 'serena', 'native'],
  });
}

// ============================================================
// Default Export
// ============================================================

// categoryConfig is re-exported above from HelpMetaRegistry
export default {
  registerHelpCommand,
  helpMetaRegistry,
};

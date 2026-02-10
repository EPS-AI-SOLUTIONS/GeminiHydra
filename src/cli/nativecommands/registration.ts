/**
 * NativeCommands - Command registration with CommandRegistry
 *
 * Registers all native command groups:
 *   /native, /fs, /shell, /search, /grep, /mem
 *
 * @module cli/nativecommands/registration
 */

import {
  chalk,
  commandRegistry,
  success,
  box
} from './helpers.js';
import { nativeCommands } from './nativeCommands.js';
import { fsCommands } from './fsCommands.js';
import { shellCommands } from './shellCommands.js';
import { searchCommands } from './searchCommands.js';
import { memoryCommands } from './memoryCommands.js';

// ============================================================
// Command Registration
// ============================================================

export function registerNativeCommands(): void {
  // Main native tools commands
  commandRegistry.register({
    name: 'native',
    aliases: [],
    description: 'Native tools management',
    usage: '/native <init|status|shutdown> [args]',
    handler: async (ctx) => {
      const [subcommand, ...args] = ctx.args;

      switch (subcommand) {
        case 'init':
          return nativeCommands.init(args);
        case 'status':
          return nativeCommands.status();
        case 'shutdown':
          return nativeCommands.shutdown();
        default:
          return success(
            box(
              `${chalk.cyan('Native Tools Commands')}\n\n` +
              `/native init [dir]  - Initialize native tools\n` +
              `/native status      - Show status\n` +
              `/native shutdown    - Shutdown tools\n\n` +
              `${chalk.cyan('Subcommand Groups')}\n\n` +
              `/fs    - File system operations\n` +
              `/shell - Shell/process operations\n` +
              `/search - Search operations\n` +
              `/mem   - Memory/knowledge graph`,
              'Native Tools'
            )
          );
      }
    }
  });

  // File system commands
  commandRegistry.register({
    name: 'fs',
    aliases: ['file'],
    description: 'File system operations',
    usage: '/fs <read|ls|write|info|search> [args]',
    handler: async (ctx) => {
      const [subcommand, ...args] = ctx.args;

      switch (subcommand) {
        case 'read':
          return fsCommands.read(args);
        case 'ls':
          return fsCommands.ls(args);
        case 'write':
          return fsCommands.write(args);
        case 'info':
          return fsCommands.info(args);
        case 'search':
          return fsCommands.search(args);
        case 'diagnose':
          return fsCommands.diagnose(args);
        case 'sysinfo':
          return fsCommands.sysinfo();
        case 'validate':
          return fsCommands.validate(args);
        case 'perms':
          return fsCommands.perms(args);
        case 'unblock':
          return fsCommands.unblock(args);
        case 'allow':
          return fsCommands.allow(args);
        case 'attrs':
          return fsCommands.attrs(args);
        case 'encoding':
          return fsCommands.encoding(args);
        default:
          return success(
            box(
              `${chalk.cyan('Basic Operations')}\n` +
              `/fs read <path> [--encoding enc]     - Read file contents\n` +
              `/fs write <path> <text> [--force] [--encoding enc]\n` +
              `                                     - Write to file\n` +
              `/fs ls [path] [-r]                   - List directory\n` +
              `/fs info <path>                      - Get file info\n` +
              `/fs search <pattern>                 - Simple text search\n\n` +
              `${chalk.cyan('Diagnostics')}\n` +
              `/fs diagnose <path> [-s]             - Full path diagnostics\n` +
              `/fs validate <path>                  - Validate path syntax\n` +
              `/fs perms <path>                     - Check permissions\n` +
              `/fs sysinfo                          - System filesystem info\n` +
              `/fs attrs <path> [--set|--unset ...]  - Show/set attributes\n` +
              `/fs encoding <path>                  - Detect file encoding\n\n` +
              `${chalk.cyan('Path Management')}\n` +
              `/fs unblock <path>                   - Unblock path (session)\n` +
              `/fs allow <path>                     - Allow path (session)\n\n` +
              `${chalk.gray('Flags:')}\n` +
              `${chalk.gray('  --force     Remove readonly attribute before writing')}\n` +
              `${chalk.gray('  --encoding  Specify encoding (utf-8, ascii, latin1, utf16le)')}\n\n` +
              `${chalk.gray('TIP: For LSP semantic search, use /serena search')}`,
              'File System'
            )
          );
      }
    }
  });

  // Shell commands (using ShellManager)
  commandRegistry.register({
    name: 'shell',
    aliases: ['sh'],
    description: 'Shell and process operations (using ShellManager)',
    usage: '/shell <run|bg|ps|kill|output|sysinfo|config|history|shells|escape|diagnostics> [args]',
    handler: async (ctx) => {
      const [subcommand, ...args] = ctx.args;

      switch (subcommand) {
        // Basic commands (using ShellManager)
        case 'run':
          return shellCommands.run(args);
        case 'bg':
          return shellCommands.bg(args);
        case 'ps':
          return shellCommands.ps(args);
        case 'kill':
          return shellCommands.kill(args);
        case 'output':
          return shellCommands.output(args);
        case 'sysinfo':
          return shellCommands.sysinfo();

        // ShellManager-specific commands
        case 'config':
        case 'cfg':
          return shellCommands.config(args);
        case 'history':
        case 'hist':
          return shellCommands.history(args);
        case 'shells':
          return shellCommands.shells();
        case 'escape':
          return shellCommands.escape(args);

        // Diagnostic commands (from ShellDiagnostics)
        case 'diagnostics':
        case 'diag':
          return shellCommands.diagnostics(args);
        case 'processes':
        case 'proc':
          return shellCommands.processes(args);
        case 'performance':
        case 'perf':
          return shellCommands.performance(args);
        case 'clear-history':
          return shellCommands.clearHistory();
        default:
          return success(
            box(
              `${chalk.cyan('Basic Commands')}\n` +
              `/shell run <cmd> [--timeout ms] [--shell type]\n` +
              `                              - Run command and wait\n` +
              `/shell bg <cmd>               - Run in background\n` +
              `/shell ps [status]            - List processes\n` +
              `/shell kill <pid>             - Kill process\n` +
              `/shell output <pid>           - Get process output\n` +
              `/shell sysinfo                - System information\n\n` +
              `${chalk.cyan('ShellManager Commands')}\n` +
              `/shell config [profile]       - Show/set configuration\n` +
              `       Profiles: default, secure, performance, debug\n` +
              `/shell history [query] [--limit N] [--clear]\n` +
              `                              - Command history\n` +
              `/shell shells                 - List available shells\n` +
              `/shell escape <string> [--shell type] [--quote]\n` +
              `                              - Escape/quote for shell\n\n` +
              `${chalk.cyan('Diagnostics')}\n` +
              `/shell diagnostics [-s|-h|-t] - Full shell diagnostics\n` +
              `/shell processes [--running|--completed|--error]\n` +
              `                              - Detailed process list\n` +
              `/shell performance [--hours N|--days N]\n` +
              `                              - Performance report\n` +
              `/shell clear-history          - Clear execution history`,
              'Shell (via ShellManager)'
            )
          );
      }
    }
  });

  // Search commands (simple grep-like text search)
  // NOTE: For LSP-powered semantic search, use /serena search (in SerenaCommands.ts)
  commandRegistry.register({
    name: 'search',
    aliases: ['s'],
    description: 'Simple text search operations (grep-like)',
    usage: '/search <grep|symbol|file|refs> [args]',
    handler: async (ctx) => {
      const [subcommand, ...args] = ctx.args;

      switch (subcommand) {
        case 'grep':
          return searchCommands.grep(args);
        case 'symbol':
          return searchCommands.symbol(args);
        case 'file':
          return searchCommands.file(args);
        case 'refs':
          return searchCommands.refs(args);
        default:
          return success(
            box(
              `/search grep <pattern> [glob]  - Search file contents (text)\n` +
              `/search symbol <name> [type]   - Find symbols\n` +
              `/search file <query>           - Fuzzy file search\n` +
              `/search refs <name> [glob]     - Find references\n\n` +
              `${chalk.gray('TIP: For LSP semantic search, use /serena search')}`,
              'Search (grep-like)'
            )
          );
      }
    }
  });

  // /grep command - alias for /search grep (simple text search)
  // NOTE: This is NOT the same as /serena search (LSP-powered)
  commandRegistry.register({
    name: 'grep',
    aliases: ['rg'],
    description: 'Simple grep-like text search (alias for /search grep)',
    usage: '/grep <pattern> [glob]',
    handler: async (ctx) => searchCommands.grep(ctx.args)
  });

  // Memory commands
  commandRegistry.register({
    name: 'mem',
    aliases: ['memory'],
    description: 'Memory and knowledge graph operations',
    usage: '/mem <set|get|find|entity|observe|relate|graph|save|load> [args]',
    handler: async (ctx) => {
      const [subcommand, ...args] = ctx.args;

      switch (subcommand) {
        case 'set':
          return memoryCommands.set(args);
        case 'get':
          return memoryCommands.get(args);
        case 'find':
          return memoryCommands.find(args);
        case 'entity':
          return memoryCommands.entity(args);
        case 'observe':
          return memoryCommands.observe(args);
        case 'relate':
          return memoryCommands.relate(args);
        case 'graph':
          return memoryCommands.graph();
        case 'save':
          return memoryCommands.save();
        case 'load':
          return memoryCommands.load();
        default:
          return success(
            box(
              `/mem set <key> <value>          - Store key-value\n` +
              `/mem get <key>                  - Retrieve value\n` +
              `/mem find <query>               - Search entities\n` +
              `/mem entity <name> <type>       - Create entity\n` +
              `/mem observe <entity> <text>    - Add observation\n` +
              `/mem relate <from> <rel> <to>   - Create relation\n` +
              `/mem graph                      - Show graph stats\n` +
              `/mem save                       - Save to disk\n` +
              `/mem load                       - Load from disk`,
              'Memory'
            )
          );
      }
    }
  });

  console.log(chalk.gray('[CLI] Native commands registered'));
}

/**
 * SubcommandExtension - Extension module for CommandRegistry
 *
 * Provides full subcommand support including:
 * - Subcommand registration with flag inheritance
 * - Routing: /parent subcommand args -> subcommand handler
 * - Subcommand aliases
 * - Help generation for subcommands
 */

import chalk from 'chalk';
import {
  Command,
  CommandArg,
  CommandContext,
  CommandHandler,
  CommandRegistry,
  CommandResult,
  FlagDefinition,
  success,
  error
} from './CommandRegistry.js';

// ============================================================================
// Subcommand Types
// ============================================================================

/**
 * Subcommand info with parent reference
 */
export interface SubcommandInfo {
  name: string;
  aliases: string[];
  description: string;
  parentCommand: string;
  usage?: string;
  args?: CommandArg[];
  hidden: boolean;
}

/**
 * Options for registering a subcommand
 */
export interface SubcommandOptions {
  /** Inherit flags from parent command (default: true) */
  inheritFlags?: boolean;
  /** Additional flags specific to this subcommand */
  additionalFlags?: FlagDefinition[];
}

/**
 * Extended subcommand with parent reference and options
 */
export interface Subcommand extends Command {
  parentName: string;
  inheritFlags: boolean;
}

/**
 * Extended command context for subcommands
 */
export interface SubcommandContext extends CommandContext {
  /** Parent command name */
  parentCommand: string;
  /** Subcommand name */
  subcommand: string;
}

// ============================================================================
// SubcommandRegistry - Extension class for managing subcommands
// ============================================================================

/**
 * SubcommandRegistry extends CommandRegistry with full subcommand support
 */
export class SubcommandRegistry {
  private registry: CommandRegistry;
  private subcommandAliasMap: Map<string, string> = new Map();
  private debugMode: boolean = false;

  constructor(registry: CommandRegistry) {
    this.registry = registry;
  }

  /**
   * Enable or disable debug mode
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  private debugLog(message: string): void {
    if (this.debugMode) {
      console.log(chalk.gray(`[SubcommandRegistry] ${message}`));
    }
  }

  // ============================================================================
  // Subcommand Registration
  // ============================================================================

  /**
   * Register a subcommand under a parent command
   *
   * @param parentNameOrAlias - Parent command name or alias
   * @param subcommand - Subcommand to register
   * @param options - Subcommand options (inheritFlags, additionalFlags)
   * @throws Error if parent command doesn't exist
   */
  registerSubcommand(
    parentNameOrAlias: string,
    subcommand: Command,
    options: SubcommandOptions = {}
  ): void {
    const parent = this.registry.get(parentNameOrAlias);
    if (!parent) {
      throw new Error(`Cannot register subcommand: parent command '${parentNameOrAlias}' not found`);
    }

    // Validate subcommand
    if (!subcommand.name) {
      throw new Error('Subcommand must have a name');
    }
    if (!subcommand.handler) {
      throw new Error(`Subcommand ${subcommand.name} must have a handler`);
    }

    // Initialize subcommands map if needed
    if (!parent.subcommands) {
      parent.subcommands = new Map();
    }

    // Apply flag inheritance
    const inheritFlags = options.inheritFlags !== false; // default true
    if (inheritFlags && parent.flags) {
      // Merge parent flags with subcommand flags
      const mergedFlags = [...(parent.flags || [])];
      if (subcommand.flags) {
        // Add subcommand-specific flags, avoiding duplicates
        for (const flag of subcommand.flags) {
          const exists = mergedFlags.some(f => f.long === flag.long);
          if (!exists) {
            mergedFlags.push(flag);
          }
        }
      }
      // Add additional flags from options
      if (options.additionalFlags) {
        for (const flag of options.additionalFlags) {
          const exists = mergedFlags.some(f => f.long === flag.long);
          if (!exists) {
            mergedFlags.push(flag);
          }
        }
      }
      subcommand.flags = mergedFlags;
    }

    // Store metadata on subcommand
    (subcommand as Subcommand).parentName = parent.name;
    (subcommand as Subcommand).inheritFlags = inheritFlags;

    // Register the subcommand
    parent.subcommands.set(subcommand.name, subcommand);
    this.debugLog(`Registered subcommand: ${parent.name} ${subcommand.name}`);

    // Register subcommand aliases
    for (const alias of subcommand.aliases || []) {
      const aliasKey = `${parent.name}:${alias}`;
      this.subcommandAliasMap.set(aliasKey, subcommand.name);
      this.debugLog(`  - Subcommand alias: ${aliasKey} -> ${subcommand.name}`);
    }
  }

  /**
   * Register multiple subcommands under a parent command
   */
  registerSubcommands(
    parentNameOrAlias: string,
    subcommands: Array<{ command: Command; options?: SubcommandOptions }>
  ): void {
    for (const { command, options } of subcommands) {
      this.registerSubcommand(parentNameOrAlias, command, options);
    }
  }

  // ============================================================================
  // Subcommand Retrieval
  // ============================================================================

  /**
   * Get all subcommands for a command
   *
   * @param commandNameOrAlias - Command name or alias
   * @returns Array of subcommands, or empty array if none
   */
  getSubcommands(commandNameOrAlias: string): Command[] {
    const command = this.registry.get(commandNameOrAlias);
    if (!command || !command.subcommands) {
      return [];
    }
    return Array.from(command.subcommands.values()).filter((cmd: Command) => !cmd.hidden);
  }

  /**
   * Get a specific subcommand by name or alias
   *
   * @param parentNameOrAlias - Parent command name or alias
   * @param subcommandNameOrAlias - Subcommand name or alias
   * @returns Subcommand or undefined
   */
  getSubcommand(parentNameOrAlias: string, subcommandNameOrAlias: string): Command | undefined {
    const parent = this.registry.get(parentNameOrAlias);
    if (!parent || !parent.subcommands) {
      return undefined;
    }

    // Check direct name first
    if (parent.subcommands.has(subcommandNameOrAlias)) {
      return parent.subcommands.get(subcommandNameOrAlias);
    }

    // Check aliases
    const aliasKey = `${parent.name}:${subcommandNameOrAlias}`;
    const realName = this.subcommandAliasMap.get(aliasKey);
    if (realName) {
      return parent.subcommands.get(realName);
    }

    return undefined;
  }

  /**
   * Check if a subcommand exists
   */
  hasSubcommand(parentNameOrAlias: string, subcommandNameOrAlias: string): boolean {
    return this.getSubcommand(parentNameOrAlias, subcommandNameOrAlias) !== undefined;
  }

  /**
   * Get subcommand info
   */
  getSubcommandInfo(parentNameOrAlias: string, subcommandNameOrAlias: string): SubcommandInfo | undefined {
    const parent = this.registry.get(parentNameOrAlias);
    if (!parent) return undefined;

    const subcommand = this.getSubcommand(parentNameOrAlias, subcommandNameOrAlias);
    if (!subcommand) return undefined;

    return {
      name: subcommand.name,
      aliases: subcommand.aliases || [],
      description: subcommand.description,
      parentCommand: parent.name,
      usage: subcommand.usage,
      args: subcommand.args,
      hidden: subcommand.hidden || false
    };
  }

  // ============================================================================
  // Subcommand Execution
  // ============================================================================

  /**
   * Execute a command with automatic subcommand routing
   *
   * Supports:
   * - /command args -> parent handler
   * - /command subcommand args -> subcommand handler
   * - /command help -> show subcommand help
   */
  async executeWithSubcommandRouting(
    nameOrAlias: string,
    ctx: Omit<CommandContext, 'flags'>,
    args: string[]
  ): Promise<CommandResult> {
    const command = this.registry.get(nameOrAlias);

    if (!command) {
      return error(`Unknown command: ${nameOrAlias}. Use /help to see available commands.`);
    }

    // Parse flags from args
    const { positional, flags } = this.parseArgs(args);

    // Check for subcommand routing
    if (positional.length > 0 && command.subcommands && command.subcommands.size > 0) {
      const potentialSubcommand = positional[0];

      // Handle special "help" subcommand
      if (potentialSubcommand === 'help' || potentialSubcommand === '?') {
        return success(null, this.getSubcommandHelp(command));
      }

      // Try to find and execute subcommand
      const subcommand = this.getSubcommand(command.name, potentialSubcommand);
      if (subcommand) {
        // Remove subcommand name from positional args
        const subArgs = positional.slice(1);

        const fullCtx: SubcommandContext = {
          cwd: ctx.cwd as string,
          args: subArgs,
          flags,
          rawArgs: subArgs.join(' '),
          parentCommand: command.name,
          subcommand: subcommand.name
        };

        try {
          return await subcommand.handler(fullCtx);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          return error(`Error executing ${command.name} ${subcommand.name}: ${errorMessage}`);
        }
      }
    }

    // No subcommand match, use default registry execution
    return this.registry.execute(nameOrAlias, ctx);
  }

  /**
   * Execute a specific subcommand directly
   */
  async executeSubcommand(
    parentNameOrAlias: string,
    subcommandNameOrAlias: string,
    ctx: Omit<CommandContext, 'flags'>,
    args: string[]
  ): Promise<CommandResult> {
    const parent = this.registry.get(parentNameOrAlias);
    if (!parent) {
      return error(`Unknown command: ${parentNameOrAlias}. Use /help to see available commands.`);
    }

    const subcommand = this.getSubcommand(parentNameOrAlias, subcommandNameOrAlias);
    if (!subcommand) {
      return error(`Unknown subcommand: ${subcommandNameOrAlias}. Use /${parent.name} help to see available subcommands.`);
    }

    const { positional, flags } = this.parseArgs(args);

    const fullCtx: SubcommandContext = {
      cwd: ctx.cwd as string,
      args: positional,
      flags,
      rawArgs: args.join(' '),
      parentCommand: parent.name,
      subcommand: subcommand.name
    };

    try {
      return await subcommand.handler(fullCtx);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return error(`Error executing ${parentNameOrAlias} ${subcommandNameOrAlias}: ${errorMessage}`);
    }
  }

  /**
   * Parse command arguments into positional args and flags
   */
  private parseArgs(args: string[]): {
    positional: string[];
    flags: Record<string, string | boolean>;
  } {
    const positional: string[] = [];
    const flags: Record<string, string | boolean> = {};

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        const nextArg = args[i + 1];
        if (nextArg && !nextArg.startsWith('-')) {
          flags[key] = nextArg;
          i++;
        } else {
          flags[key] = true;
        }
      } else if (arg.startsWith('-') && arg.length > 1) {
        const key = arg.slice(1);
        flags[key] = true;
      } else {
        positional.push(arg);
      }
    }

    return { positional, flags };
  }

  // ============================================================================
  // Help Generation
  // ============================================================================

  /**
   * Generate help text for subcommands of a command
   */
  getSubcommandHelp(command: Command): string {
    const lines: string[] = [];

    lines.push(chalk.bold.cyan(`\n Subcommands for /${command.name}\n`));
    lines.push(chalk.gray('─'.repeat(50)));
    lines.push('');
    lines.push(command.description);
    lines.push('');

    if (!command.subcommands || command.subcommands.size === 0) {
      lines.push(chalk.gray('  No subcommands available'));
      return lines.join('\n');
    }

    lines.push(chalk.bold('Available Subcommands:'));
    lines.push('');

    for (const [, subcmd] of command.subcommands) {
      if (subcmd.hidden) continue;

      // Subcommand name with aliases
      const aliasStr = subcmd.aliases && subcmd.aliases.length > 0
        ? chalk.gray(` (aliases: ${subcmd.aliases.join(', ')})`)
        : '';
      lines.push(`  ${chalk.yellow.bold(subcmd.name)}${aliasStr}`);

      // Description
      lines.push(`    ${subcmd.description}`);

      // Usage
      if (subcmd.usage) {
        lines.push(`    ${chalk.bold('Usage:')} ${chalk.cyan(`/${command.name} ${subcmd.name}`)} ${subcmd.usage}`);
      } else {
        lines.push(`    ${chalk.bold('Usage:')} ${chalk.cyan(`/${command.name} ${subcmd.name}`)} [args...]`);
      }

      // Arguments
      if (subcmd.args && subcmd.args.length > 0) {
        lines.push(`    ${chalk.bold('Arguments:')}`);
        for (const arg of subcmd.args) {
          const req = arg.required ? chalk.red('*') : '';
          const def = arg.default ? chalk.gray(` (default: ${arg.default})`) : '';
          lines.push(`      ${chalk.cyan(arg.name)}${req} - ${arg.description}${def}`);
        }
      }

      // Flags
      if (subcmd.flags && subcmd.flags.length > 0) {
        lines.push(`    ${chalk.bold('Flags:')}`);
        for (const flag of subcmd.flags) {
          const shortFlag = flag.short ? `-${flag.short}, ` : '';
          lines.push(`      ${chalk.cyan(`${shortFlag}--${flag.long}`)} - ${flag.description}`);
        }
      }

      lines.push('');
    }

    lines.push(chalk.gray('─'.repeat(50)));
    lines.push(chalk.gray(`Use ${chalk.white(`/${command.name} <subcommand> --help`)} for detailed help on a specific subcommand\n`));

    return lines.join('\n');
  }

  /**
   * Get help for a specific subcommand
   */
  getSubcommandDetailedHelp(parentNameOrAlias: string, subcommandNameOrAlias: string): string {
    const parent = this.registry.get(parentNameOrAlias);
    if (!parent) {
      return chalk.red(`Unknown command: ${parentNameOrAlias}`);
    }

    const subcommand = this.getSubcommand(parentNameOrAlias, subcommandNameOrAlias);
    if (!subcommand) {
      return chalk.red(`Unknown subcommand: ${subcommandNameOrAlias}. Use /${parent.name} help to see available subcommands.`);
    }

    const lines: string[] = [];

    // Header
    lines.push(chalk.bold.cyan(`\n Subcommand: /${parent.name} ${subcommand.name}\n`));

    // Description
    lines.push(subcommand.description);
    lines.push('');

    // Usage
    lines.push(chalk.bold('Usage:'));
    const usage = subcommand.usage || '[args...] [flags]';
    lines.push(`  ${chalk.yellow(`/${parent.name} ${subcommand.name}`)} ${usage}`);
    lines.push('');

    // Arguments
    if (subcommand.args && subcommand.args.length > 0) {
      lines.push(chalk.bold('Arguments:'));
      for (const arg of subcommand.args) {
        const req = arg.required ? chalk.red('*') : '';
        const def = arg.default ? chalk.gray(` (default: ${arg.default})`) : '';
        const choices = arg.choices ? chalk.gray(` [${arg.choices.join('|')}]`) : '';
        lines.push(`  ${chalk.cyan(arg.name)}${req} - ${arg.description}${def}${choices}`);
      }
      lines.push('');
    }

    // Flags
    if (subcommand.flags && subcommand.flags.length > 0) {
      const subCmd = subcommand as Subcommand;
      const hasInherited = subCmd.inheritFlags && parent.flags;

      if (hasInherited) {
        lines.push(chalk.bold('Flags (inherited from parent):'));
        for (const flag of parent.flags || []) {
          const shortFlag = flag.short ? chalk.cyan(`-${flag.short}, `) : '    ';
          const longFlag = chalk.cyan(`--${flag.long}`);
          const def = flag.default !== undefined ? chalk.gray(` (default: ${flag.default})`) : '';
          lines.push(`  ${shortFlag}${longFlag} - ${flag.description}${def}`);
        }
        lines.push('');
      }

      // Subcommand-specific flags
      const specificFlags = subcommand.flags.filter((f: FlagDefinition) =>
        !(parent.flags || []).some((pf: FlagDefinition) => pf.long === f.long)
      );
      if (specificFlags.length > 0) {
        lines.push(chalk.bold('Flags (subcommand-specific):'));
        for (const flag of specificFlags) {
          const shortFlag = flag.short ? chalk.cyan(`-${flag.short}, `) : '    ';
          const longFlag = chalk.cyan(`--${flag.long}`);
          const def = flag.default !== undefined ? chalk.gray(` (default: ${flag.default})`) : '';
          lines.push(`  ${shortFlag}${longFlag} - ${flag.description}${def}`);
        }
        lines.push('');
      }
    }

    // Aliases
    if (subcommand.aliases && subcommand.aliases.length > 0) {
      lines.push(chalk.bold('Aliases:'));
      const aliasUsages = subcommand.aliases.map((a: string) => chalk.yellow(`/${parent.name} ${a}`));
      lines.push(`  ${aliasUsages.join(', ')}`);
      lines.push('');
    }

    // Examples
    lines.push(chalk.bold('Examples:'));
    lines.push(`  ${chalk.gray(`/${parent.name} ${subcommand.name} example-arg`)}`);
    lines.push(`  ${chalk.gray(`/${parent.name} ${subcommand.name} --flag value`)}`);
    lines.push('');

    return lines.join('\n');
  }

  // ============================================================================
  // Autocomplete
  // ============================================================================

  /**
   * Get autocomplete suggestions for subcommands
   */
  autocompleteSubcommand(commandName: string, partial: string): string[] {
    const command = this.registry.get(commandName);
    if (!command || !command.subcommands) return [];

    const lowerPartial = partial.toLowerCase();
    const suggestions: string[] = [];

    // Match subcommand names
    for (const subName of command.subcommands.keys()) {
      if (subName.toLowerCase().startsWith(lowerPartial)) {
        suggestions.push(subName);
      }
    }

    // Match subcommand aliases
    for (const [aliasKey, subName] of this.subcommandAliasMap) {
      if (aliasKey.startsWith(`${command.name}:`)) {
        const alias = aliasKey.split(':')[1];
        if (alias.toLowerCase().startsWith(lowerPartial) && !suggestions.includes(subName)) {
          suggestions.push(alias);
        }
      }
    }

    return suggestions.sort();
  }

  /**
   * Get full autocomplete suggestions including subcommands
   */
  autocompleteWithSubcommands(input: string): string[] {
    const parts = input.trim().split(/\s+/);
    const suggestions: string[] = [];

    if (parts.length === 0 || parts[0] === '') {
      return this.registry.autocomplete('');
    }

    const commandPart = parts[0].replace(/^\//, '');

    if (parts.length === 1) {
      return this.registry.autocomplete(commandPart);
    }

    // Have command, suggest subcommands
    const command = this.registry.get(commandPart);
    if (command && command.subcommands && command.subcommands.size > 0) {
      const subPartial = parts.slice(1).join(' ');
      const subSuggestions = this.autocompleteSubcommand(command.name, subPartial);
      for (const sub of subSuggestions) {
        suggestions.push(`/${command.name} ${sub}`);
      }
    }

    return suggestions.sort();
  }

  // ============================================================================
  // Utility
  // ============================================================================

  /**
   * Get total subcommand count across all commands
   */
  get subcommandCount(): number {
    let count = 0;
    for (const cmd of this.registry.getAll()) {
      if (cmd.subcommands) {
        count += cmd.subcommands.size;
      }
    }
    return count;
  }

  /**
   * Clear all subcommand aliases
   */
  clearSubcommandAliases(): void {
    this.subcommandAliasMap.clear();
  }
}

// ============================================================================
// Example FS Command with Subcommands
// ============================================================================

/**
 * Create an example 'fs' command with read/write subcommands
 */
export function createFsCommand(): Command {
  const fsCommand: Command = {
    name: 'fs',
    aliases: ['file', 'filesystem'],
    description: 'File system operations',
    category: 'filesystem',
    usage: '<subcommand> [args...] [flags]',
    flags: [
      {
        short: 'v',
        long: 'verbose',
        description: 'Enable verbose output',
        type: 'boolean',
        default: false
      }
    ],
    handler: async (ctx: CommandContext): Promise<CommandResult> => {
      // Default handler shows help
      return success(null, 'Use /fs help to see available subcommands');
    },
    subcommands: new Map()
  };

  return fsCommand;
}

/**
 * Create 'fs read' subcommand
 */
export function createFsReadSubcommand(): Command {
  return {
    name: 'read',
    aliases: ['r', 'cat', 'get'],
    description: 'Read file contents',
    usage: '<path> [--encoding <enc>]',
    args: [
      {
        name: 'path',
        description: 'Path to the file to read',
        required: true,
        type: 'path'
      }
    ],
    flags: [
      {
        short: 'e',
        long: 'encoding',
        description: 'File encoding',
        type: 'string',
        default: 'utf-8'
      },
      {
        short: 'n',
        long: 'lines',
        description: 'Number of lines to read',
        type: 'number'
      }
    ],
    handler: async (ctx: CommandContext): Promise<CommandResult> => {
      const filePath = ctx.args[0];
      const encoding = ctx.flags.encoding as string || 'utf-8';
      const verbose = ctx.flags.verbose || ctx.flags.v;

      if (verbose) {
        console.log(`Reading file: ${filePath} with encoding: ${encoding}`);
      }

      // Placeholder implementation
      return success({ path: filePath, encoding }, `Would read file: ${filePath}`);
    }
  };
}

/**
 * Create 'fs write' subcommand
 */
export function createFsWriteSubcommand(): Command {
  return {
    name: 'write',
    aliases: ['w', 'put', 'save'],
    description: 'Write content to a file',
    usage: '<path> <content> [--append]',
    args: [
      {
        name: 'path',
        description: 'Path to the file to write',
        required: true,
        type: 'path'
      },
      {
        name: 'content',
        description: 'Content to write',
        required: true,
        type: 'string'
      }
    ],
    flags: [
      {
        short: 'a',
        long: 'append',
        description: 'Append to file instead of overwriting',
        type: 'boolean',
        default: false
      },
      {
        short: 'e',
        long: 'encoding',
        description: 'File encoding',
        type: 'string',
        default: 'utf-8'
      }
    ],
    handler: async (ctx: CommandContext): Promise<CommandResult> => {
      const filePath = ctx.args[0];
      const content = ctx.args[1];
      const append = ctx.flags.append || ctx.flags.a;
      const verbose = ctx.flags.verbose || ctx.flags.v;

      if (verbose) {
        console.log(`Writing to file: ${filePath}, append: ${append}`);
      }

      // Placeholder implementation
      return success({ path: filePath, append }, `Would write to file: ${filePath}`);
    }
  };
}

/**
 * Create 'fs list' subcommand
 */
export function createFsListSubcommand(): Command {
  return {
    name: 'list',
    aliases: ['ls', 'dir'],
    description: 'List directory contents',
    usage: '[path] [--all] [--long]',
    args: [
      {
        name: 'path',
        description: 'Directory path (default: current directory)',
        required: false,
        type: 'path',
        default: '.'
      }
    ],
    flags: [
      {
        short: 'a',
        long: 'all',
        description: 'Show hidden files',
        type: 'boolean',
        default: false
      },
      {
        short: 'l',
        long: 'long',
        description: 'Use long listing format',
        type: 'boolean',
        default: false
      }
    ],
    handler: async (ctx: CommandContext): Promise<CommandResult> => {
      const dirPath = ctx.args[0] || '.';
      const showAll = ctx.flags.all || ctx.flags.a;
      const longFormat = ctx.flags.long || ctx.flags.l;

      // Placeholder implementation
      return success({ path: dirPath, showAll, longFormat }, `Would list: ${dirPath}`);
    }
  };
}

/**
 * Register the complete fs command with all subcommands
 */
export function registerFsCommandWithSubcommands(
  registry: CommandRegistry,
  subcommandRegistry: SubcommandRegistry
): void {
  // Register main fs command
  const fsCommand = createFsCommand();
  registry.register(fsCommand);

  // Register subcommands
  subcommandRegistry.registerSubcommands('fs', [
    { command: createFsReadSubcommand(), options: { inheritFlags: true } },
    { command: createFsWriteSubcommand(), options: { inheritFlags: true } },
    { command: createFsListSubcommand(), options: { inheritFlags: true } }
  ]);
}

// Export default
export default SubcommandRegistry;

/**
 * CommandDiagnostics - Diagnostic utilities for CommandRegistry
 *
 * Provides tools to inspect, validate, and analyze the command registry.
 */

import chalk from 'chalk';
import { formatNumber, formatPercent, horizontalLine } from './CommandHelpers.js';
import {
  type Command,
  type CommandContext,
  type CommandRegistry,
  type CommandResult,
  commandRegistry,
  error,
  success,
} from './CommandRegistry.js';

// ============================================================
// Diagnostic Types
// ============================================================

/**
 * Registry status overview
 */
export interface RegistryStatus {
  commandCount: number;
  aliasCount: number;
  categoryCount: number;
  hiddenCount: number;
  subcommandCount: number;
  categories: CategoryInfo[];
}

/**
 * Category information
 */
export interface CategoryInfo {
  name: string;
  commandCount: number;
  commands: string[];
}

/**
 * Validation issue found in the registry
 */
export interface ValidationIssue {
  type: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  command?: string;
  alias?: string;
}

/**
 * Statistics about command usage
 */
export interface CommandStats {
  totalCommands: number;
  totalAliases: number;
  avgAliasesPerCommand: number;
  commandsWithSubcommands: number;
  commandsWithArgs: number;
  hiddenCommands: number;
  categoryCounts: Map<string, number>;
}

/**
 * Duplicate detection result
 */
export interface DuplicateInfo {
  name: string;
  type: 'name' | 'alias' | 'cross';
  conflictsWith: string;
  description: string;
}

/**
 * Extended command information for /cmd info
 */
export interface ExtendedCommandInfo {
  name: string;
  aliases: string[];
  description: string;
  category: string;
  usage?: string;
  args?: {
    name: string;
    description: string;
    required: boolean;
    type?: string;
    default?: string | number | boolean;
    choices?: string[];
  }[];
  hasSubcommands: boolean;
  subcommands?: string[];
  hidden: boolean;
  handlerType: string;
}

// ============================================================
// CommandDiagnostics Class
// ============================================================

/**
 * Diagnostic utilities for analyzing the command registry
 */
export class CommandDiagnostics {
  private registry: CommandRegistry;
  private usageStats: Map<string, number> = new Map();

  constructor(registry?: CommandRegistry) {
    this.registry = registry || commandRegistry;
  }

  /**
   * Get overall registry status
   */
  getRegistryStatus(): RegistryStatus {
    const commands = this.getAllCommandsIncludingHidden();
    const categories = this.registry.getCategories();

    let aliasCount = 0;
    let hiddenCount = 0;
    let subcommandCount = 0;
    const categoryInfos: CategoryInfo[] = [];

    for (const cmd of commands) {
      aliasCount += cmd.aliases?.length || 0;
      if (cmd.hidden) hiddenCount++;
      if (cmd.subcommands) {
        subcommandCount += cmd.subcommands.size;
      }
    }

    for (const category of categories) {
      const cmds = this.registry.getByCategory(category);
      categoryInfos.push({
        name: category,
        commandCount: cmds.length,
        commands: cmds.map((c) => c.name),
      });
    }

    return {
      commandCount: commands.length,
      aliasCount,
      categoryCount: categories.length,
      hiddenCount,
      subcommandCount,
      categories: categoryInfos,
    };
  }

  /**
   * Validate registry for consistency issues
   */
  validateRegistry(): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const commands = this.getAllCommandsIncludingHidden();
    const seenNames = new Set<string>();
    const seenAliases = new Map<string, string>();

    for (const cmd of commands) {
      // Check for empty names
      if (!cmd.name || cmd.name.trim() === '') {
        issues.push({
          type: 'error',
          code: 'EMPTY_NAME',
          message: 'Command has empty or missing name',
        });
        continue;
      }

      // Check for duplicate command names
      if (seenNames.has(cmd.name)) {
        issues.push({
          type: 'error',
          code: 'DUPLICATE_NAME',
          message: `Duplicate command name: ${cmd.name}`,
          command: cmd.name,
        });
      }
      seenNames.add(cmd.name);

      // Check for missing descriptions
      if (!cmd.description || cmd.description.trim() === '') {
        issues.push({
          type: 'warning',
          code: 'MISSING_DESCRIPTION',
          message: `Command missing description`,
          command: cmd.name,
        });
      }

      // Check for alias conflicts
      for (const alias of cmd.aliases || []) {
        if (seenNames.has(alias)) {
          issues.push({
            type: 'error',
            code: 'ALIAS_CONFLICTS_NAME',
            message: `Alias "${alias}" conflicts with command name`,
            command: cmd.name,
            alias,
          });
        }

        if (seenAliases.has(alias)) {
          const existingCmd = seenAliases.get(alias);
          if (!existingCmd) continue;
          issues.push({
            type: 'error',
            code: 'DUPLICATE_ALIAS',
            message: `Alias "${alias}" is already used by command "${existingCmd}"`,
            command: cmd.name,
            alias,
          });
        }
        seenAliases.set(alias, cmd.name);
      }

      // Check for command arguments validation
      if (cmd.args) {
        for (const arg of cmd.args) {
          if (!arg.name) {
            issues.push({
              type: 'warning',
              code: 'MISSING_ARG_NAME',
              message: `Argument missing name`,
              command: cmd.name,
            });
          }
          if (!arg.description) {
            issues.push({
              type: 'info',
              code: 'MISSING_ARG_DESCRIPTION',
              message: `Argument "${arg.name}" missing description`,
              command: cmd.name,
            });
          }
        }
      }

      // Check for subcommand consistency
      if (cmd.subcommands) {
        for (const [subName, subCmd] of cmd.subcommands) {
          if (!subCmd.handler) {
            issues.push({
              type: 'error',
              code: 'SUBCOMMAND_NO_HANDLER',
              message: `Subcommand "${subName}" has no handler`,
              command: cmd.name,
            });
          }
        }
      }

      // Check for missing category
      if (!cmd.category) {
        issues.push({
          type: 'info',
          code: 'MISSING_CATEGORY',
          message: `Command has no category (defaults to "general")`,
          command: cmd.name,
        });
      }
    }

    return issues;
  }

  /**
   * Get command statistics
   */
  getCommandStats(): CommandStats {
    const commands = this.getAllCommandsIncludingHidden();
    const categoryCounts = new Map<string, number>();

    let totalAliases = 0;
    let commandsWithSubcommands = 0;
    let commandsWithArgs = 0;
    let hiddenCommands = 0;

    for (const cmd of commands) {
      totalAliases += cmd.aliases?.length || 0;
      if (cmd.subcommands && cmd.subcommands.size > 0) commandsWithSubcommands++;
      if (cmd.args && cmd.args.length > 0) commandsWithArgs++;
      if (cmd.hidden) hiddenCommands++;

      const category = cmd.category || 'general';
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }

    return {
      totalCommands: commands.length,
      totalAliases,
      avgAliasesPerCommand: commands.length > 0 ? totalAliases / commands.length : 0,
      commandsWithSubcommands,
      commandsWithArgs,
      hiddenCommands,
      categoryCounts,
    };
  }

  /**
   * Find orphaned aliases (aliases pointing to non-existent commands)
   */
  findOrphanedAliases(): string[] {
    const orphaned: string[] = [];
    const commands = this.getAllCommandsIncludingHidden();
    const _commandNames = new Set(commands.map((c) => c.name));

    // Check internal alias map via attempting lookups
    for (const cmd of commands) {
      for (const alias of cmd.aliases || []) {
        const resolved = this.registry.get(alias);
        if (!resolved) {
          orphaned.push(alias);
        } else if (resolved.name !== cmd.name) {
          // Alias points to wrong command
          orphaned.push(`${alias} (points to ${resolved.name} instead of ${cmd.name})`);
        }
      }
    }

    return orphaned;
  }

  /**
   * Find duplicate names and aliases
   */
  findDuplicates(): DuplicateInfo[] {
    const duplicates: DuplicateInfo[] = [];
    const commands = this.getAllCommandsIncludingHidden();
    const nameToCommand = new Map<string, string>();
    const aliasToCommand = new Map<string, string>();

    for (const cmd of commands) {
      // Check command name
      if (nameToCommand.has(cmd.name)) {
        const existingCmd = nameToCommand.get(cmd.name);
        if (!existingCmd) continue;
        duplicates.push({
          name: cmd.name,
          type: 'name',
          conflictsWith: existingCmd,
          description: `Command name "${cmd.name}" is duplicated`,
        });
      } else {
        nameToCommand.set(cmd.name, cmd.name);
      }

      // Check aliases
      for (const alias of cmd.aliases || []) {
        // Check if alias conflicts with a command name
        if (nameToCommand.has(alias)) {
          const existingCmd = nameToCommand.get(alias);
          if (!existingCmd) continue;
          duplicates.push({
            name: alias,
            type: 'cross',
            conflictsWith: existingCmd,
            description: `Alias "${alias}" of command "${cmd.name}" conflicts with command name`,
          });
        }

        // Check if alias is duplicated
        if (aliasToCommand.has(alias)) {
          const existingCmd = aliasToCommand.get(alias);
          if (!existingCmd) continue;
          duplicates.push({
            name: alias,
            type: 'alias',
            conflictsWith: existingCmd,
            description: `Alias "${alias}" is used by both "${cmd.name}" and "${existingCmd}"`,
          });
        } else {
          aliasToCommand.set(alias, cmd.name);
        }
      }
    }

    return duplicates;
  }

  /**
   * Get extended information about a specific command
   */
  getCommandInfo(nameOrAlias: string): ExtendedCommandInfo | null {
    const cmd = this.registry.get(nameOrAlias);
    if (!cmd) return null;

    return {
      name: cmd.name,
      aliases: cmd.aliases || [],
      description: cmd.description,
      category: cmd.category || 'general',
      usage: cmd.usage,
      args: cmd.args?.map((arg) => ({
        name: arg.name,
        description: arg.description,
        required: arg.required || false,
        type: arg.type,
        default: arg.default,
        choices: arg.choices,
      })),
      hasSubcommands: !!(cmd.subcommands && cmd.subcommands.size > 0),
      subcommands: cmd.subcommands ? Array.from(cmd.subcommands.keys()) : undefined,
      hidden: cmd.hidden || false,
      handlerType: typeof cmd.handler,
    };
  }

  /**
   * List commands, optionally filtered by category
   */
  listCommands(category?: string): Command[] {
    if (category) {
      return this.registry.getByCategory(category);
    }
    return this.registry.getAll();
  }

  /**
   * Record command usage (for statistics)
   */
  recordUsage(commandName: string): void {
    const count = this.usageStats.get(commandName) || 0;
    this.usageStats.set(commandName, count + 1);
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): Map<string, number> {
    return new Map(this.usageStats);
  }

  /**
   * Get all commands including hidden ones (internal use)
   */
  private getAllCommandsIncludingHidden(): Command[] {
    // Access all commands including hidden via registry methods
    const all = this.registry.getAll();
    const categories = this.registry.getCategories();
    const commandSet = new Map<string, Command>();

    // Add visible commands
    for (const cmd of all) {
      commandSet.set(cmd.name, cmd);
    }

    // Try to find hidden commands by checking category listings
    for (const category of categories) {
      for (const cmd of this.registry.getByCategory(category)) {
        commandSet.set(cmd.name, cmd);
      }
    }

    return Array.from(commandSet.values());
  }

  // ============================================================
  // Formatting Methods
  // ============================================================

  /**
   * Format registry status for display
   */
  formatRegistryStatus(status: RegistryStatus): string {
    const lines: string[] = [];

    lines.push(chalk.bold.cyan('\n Command Registry Status\n'));
    lines.push(horizontalLine(50));

    lines.push(chalk.white('\n Overview:'));
    lines.push(`   Commands:      ${chalk.yellow(formatNumber(status.commandCount))}`);
    lines.push(`   Aliases:       ${chalk.yellow(formatNumber(status.aliasCount))}`);
    lines.push(`   Categories:    ${chalk.yellow(formatNumber(status.categoryCount))}`);
    lines.push(`   Hidden:        ${chalk.gray(formatNumber(status.hiddenCount))}`);
    lines.push(`   Subcommands:   ${chalk.yellow(formatNumber(status.subcommandCount))}`);

    lines.push(chalk.white('\n Categories:'));
    for (const cat of status.categories) {
      lines.push(
        `   ${chalk.cyan(cat.name.padEnd(15))} ${chalk.yellow(cat.commandCount.toString().padStart(3))} commands`,
      );
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Format validation results for display
   */
  formatValidationResults(issues: ValidationIssue[]): string {
    const lines: string[] = [];

    lines.push(chalk.bold.cyan('\n Registry Validation Results\n'));
    lines.push(horizontalLine(50));

    if (issues.length === 0) {
      lines.push(chalk.green('\n ✓ No issues found! Registry is healthy.\n'));
      return lines.join('\n');
    }

    const errors = issues.filter((i) => i.type === 'error');
    const warnings = issues.filter((i) => i.type === 'warning');
    const infos = issues.filter((i) => i.type === 'info');

    lines.push(
      `\n Found ${chalk.red(errors.length)} errors, ${chalk.yellow(warnings.length)} warnings, ${chalk.blue(infos.length)} info\n`,
    );

    if (errors.length > 0) {
      lines.push(chalk.red.bold(' Errors:'));
      for (const issue of errors) {
        const cmd = issue.command ? chalk.gray(` [${issue.command}]`) : '';
        lines.push(`   ${chalk.red('✗')} ${issue.message}${cmd}`);
      }
      lines.push('');
    }

    if (warnings.length > 0) {
      lines.push(chalk.yellow.bold(' Warnings:'));
      for (const issue of warnings) {
        const cmd = issue.command ? chalk.gray(` [${issue.command}]`) : '';
        lines.push(`   ${chalk.yellow('!')} ${issue.message}${cmd}`);
      }
      lines.push('');
    }

    if (infos.length > 0) {
      lines.push(chalk.blue.bold(' Info:'));
      for (const issue of infos) {
        const cmd = issue.command ? chalk.gray(` [${issue.command}]`) : '';
        lines.push(`   ${chalk.blue('i')} ${issue.message}${cmd}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format command stats for display
   */
  formatCommandStats(stats: CommandStats): string {
    const lines: string[] = [];

    lines.push(chalk.bold.cyan('\n Command Statistics\n'));
    lines.push(horizontalLine(50));

    lines.push(chalk.white('\n Totals:'));
    lines.push(`   Total commands:        ${chalk.yellow(formatNumber(stats.totalCommands))}`);
    lines.push(`   Total aliases:         ${chalk.yellow(formatNumber(stats.totalAliases))}`);
    lines.push(`   Avg aliases/command:   ${chalk.yellow(stats.avgAliasesPerCommand.toFixed(2))}`);

    lines.push(chalk.white('\n Features:'));
    lines.push(
      `   With subcommands:      ${chalk.yellow(formatNumber(stats.commandsWithSubcommands))} (${formatPercent(stats.commandsWithSubcommands / stats.totalCommands)})`,
    );
    lines.push(
      `   With arguments:        ${chalk.yellow(formatNumber(stats.commandsWithArgs))} (${formatPercent(stats.commandsWithArgs / stats.totalCommands)})`,
    );
    lines.push(`   Hidden commands:       ${chalk.gray(formatNumber(stats.hiddenCommands))}`);

    lines.push(chalk.white('\n By Category:'));
    for (const [category, count] of stats.categoryCounts) {
      const percent = formatPercent(count / stats.totalCommands);
      lines.push(
        `   ${chalk.cyan(category.padEnd(15))} ${chalk.yellow(count.toString().padStart(3))} (${percent})`,
      );
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Format command info for display
   */
  formatCommandInfo(info: ExtendedCommandInfo): string {
    const lines: string[] = [];

    lines.push(chalk.bold.cyan(`\n Command: /${info.name}\n`));
    lines.push(horizontalLine(50));

    lines.push(`\n ${chalk.white('Description:')} ${info.description}`);
    lines.push(`   ${chalk.white('Category:')}    ${chalk.cyan(info.category)}`);
    lines.push(
      `   ${chalk.white('Hidden:')}      ${info.hidden ? chalk.yellow('Yes') : chalk.green('No')}`,
    );

    if (info.aliases.length > 0) {
      lines.push(
        `\n ${chalk.white('Aliases:')} ${info.aliases.map((a) => chalk.yellow(`/${a}`)).join(', ')}`,
      );
    }

    if (info.usage) {
      lines.push(`\n ${chalk.white('Usage:')}`);
      lines.push(`   ${chalk.gray('/')}${chalk.yellow(info.name)} ${info.usage}`);
    }

    if (info.args && info.args.length > 0) {
      lines.push(`\n ${chalk.white('Arguments:')}`);
      for (const arg of info.args) {
        const req = arg.required ? chalk.red('*') : '';
        const def = arg.default !== undefined ? chalk.gray(` (default: ${arg.default})`) : '';
        const type = arg.type ? chalk.gray(` [${arg.type}]`) : '';
        lines.push(`   ${chalk.cyan(arg.name)}${req}${type} - ${arg.description}${def}`);
        if (arg.choices && arg.choices.length > 0) {
          lines.push(`      Choices: ${arg.choices.map((c) => chalk.green(c)).join(', ')}`);
        }
      }
    }

    if (info.hasSubcommands && info.subcommands) {
      lines.push(
        `\n ${chalk.white('Subcommands:')} ${info.subcommands.map((s) => chalk.yellow(s)).join(', ')}`,
      );
    }

    lines.push('');
    return lines.join('\n');
  }

  /**
   * Format command list for display
   */
  formatCommandList(commands: Command[], category?: string): string {
    const lines: string[] = [];

    const title = category ? `Commands in "${category}"` : 'All Commands';

    lines.push(chalk.bold.cyan(`\n ${title}\n`));
    lines.push(horizontalLine(60));

    if (commands.length === 0) {
      lines.push(chalk.gray('\n No commands found.\n'));
      return lines.join('\n');
    }

    // Group by category if showing all
    if (!category) {
      const grouped = new Map<string, Command[]>();
      for (const cmd of commands) {
        const cat = cmd.category || 'general';
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)?.push(cmd);
      }

      for (const [cat, cmds] of grouped) {
        lines.push(chalk.white(`\n ${cat}:`));
        for (const cmd of cmds) {
          const aliases = cmd.aliases.length > 0 ? chalk.gray(` (${cmd.aliases.join(', ')})`) : '';
          lines.push(`   ${chalk.yellow(`/${cmd.name}`.padEnd(20))} ${cmd.description}${aliases}`);
        }
      }
    } else {
      lines.push('');
      for (const cmd of commands) {
        const aliases = cmd.aliases.length > 0 ? chalk.gray(` (${cmd.aliases.join(', ')})`) : '';
        lines.push(`   ${chalk.yellow(`/${cmd.name}`.padEnd(20))} ${cmd.description}${aliases}`);
      }
    }

    lines.push(`\n Total: ${chalk.yellow(commands.length)} commands\n`);
    return lines.join('\n');
  }
}

// ============================================================
// Singleton Instance
// ============================================================

export const commandDiagnostics = new CommandDiagnostics();

// ============================================================
// CLI Command Handlers
// ============================================================

async function handleCmdDiagnostics(ctx: CommandContext): Promise<CommandResult> {
  const subcommand = ctx.args[0]?.toLowerCase();

  switch (subcommand) {
    case 'status': {
      const status = commandDiagnostics.getRegistryStatus();
      console.log(commandDiagnostics.formatRegistryStatus(status));
      return success(status, 'Registry status displayed');
    }

    case 'validate': {
      const issues = commandDiagnostics.validateRegistry();
      console.log(commandDiagnostics.formatValidationResults(issues));
      return success(issues, `Found ${issues.length} issues`);
    }

    case 'stats': {
      const stats = commandDiagnostics.getCommandStats();
      console.log(commandDiagnostics.formatCommandStats(stats));
      return success(stats, 'Command stats displayed');
    }

    case 'orphans': {
      const orphans = commandDiagnostics.findOrphanedAliases();
      if (orphans.length === 0) {
        console.log(chalk.green('\n No orphaned aliases found.\n'));
      } else {
        console.log(chalk.yellow(`\n Found ${orphans.length} orphaned aliases:\n`));
        for (const alias of orphans) {
          console.log(`   ${chalk.red('•')} ${alias}`);
        }
        console.log('');
      }
      return success(orphans, `Found ${orphans.length} orphaned aliases`);
    }

    case 'duplicates': {
      const duplicates = commandDiagnostics.findDuplicates();
      if (duplicates.length === 0) {
        console.log(chalk.green('\n No duplicates found.\n'));
      } else {
        console.log(chalk.yellow(`\n Found ${duplicates.length} duplicates:\n`));
        for (const dup of duplicates) {
          console.log(`   ${chalk.red('•')} ${dup.description}`);
        }
        console.log('');
      }
      return success(duplicates, `Found ${duplicates.length} duplicates`);
    }
    default: {
      // Run full diagnostics
      console.log(chalk.bold.cyan('\n=== Full Command Registry Diagnostics ===\n'));

      const fullStatus = commandDiagnostics.getRegistryStatus();
      console.log(commandDiagnostics.formatRegistryStatus(fullStatus));

      const fullIssues = commandDiagnostics.validateRegistry();
      console.log(commandDiagnostics.formatValidationResults(fullIssues));

      const fullStats = commandDiagnostics.getCommandStats();
      console.log(commandDiagnostics.formatCommandStats(fullStats));

      return success(
        {
          status: fullStatus,
          issues: fullIssues,
          stats: fullStats,
        },
        'Full diagnostics completed',
      );
    }
  }
}

async function handleCmdList(ctx: CommandContext): Promise<CommandResult> {
  const category = ctx.args[0];

  if (category) {
    const categories = commandDiagnostics.getRegistryStatus().categories.map((c) => c.name);
    if (!categories.includes(category)) {
      console.log(chalk.red(`\n Unknown category: ${category}`));
      console.log(chalk.gray(` Available: ${categories.join(', ')}\n`));
      return error(`Unknown category: ${category}`);
    }
  }

  const commands = commandDiagnostics.listCommands(category);
  console.log(commandDiagnostics.formatCommandList(commands, category));

  return success(
    commands.map((c) => c.name),
    `Listed ${commands.length} commands`,
  );
}

async function handleCmdInfo(ctx: CommandContext): Promise<CommandResult> {
  const commandName = ctx.args[0];

  if (!commandName) {
    console.log(chalk.red('\n Please specify a command name.'));
    console.log(chalk.gray(' Usage: /cmd info <command>\n'));
    return error('Missing command name');
  }

  const info = commandDiagnostics.getCommandInfo(commandName);

  if (!info) {
    console.log(chalk.red(`\n Unknown command: ${commandName}\n`));
    return error(`Unknown command: ${commandName}`);
  }

  console.log(commandDiagnostics.formatCommandInfo(info));
  return success(info, `Displayed info for ${info.name}`);
}

// ============================================================
// Register Commands
// ============================================================

export function registerDiagnosticCommands(): void {
  // Main /cmd command with subcommands
  commandRegistry.register({
    name: 'cmd',
    aliases: ['commands', 'command'],
    description: 'Command registry management and diagnostics',
    usage: '<subcommand> [args]',
    category: 'system',
    args: [
      {
        name: 'subcommand',
        description: 'diagnostics | list | info',
        required: true,
      },
    ],
    handler: async (ctx) => {
      const subcommand = ctx.args[0]?.toLowerCase();

      switch (subcommand) {
        case 'diagnostics':
        case 'diag':
          return handleCmdDiagnostics({ ...ctx, args: ctx.args.slice(1) });

        case 'list':
        case 'ls':
          return handleCmdList({ ...ctx, args: ctx.args.slice(1) });

        case 'info':
        case 'i':
          return handleCmdInfo({ ...ctx, args: ctx.args.slice(1) });

        default:
          console.log(chalk.cyan('\n Command Registry Management\n'));
          console.log(chalk.gray(horizontalLine(40)));
          console.log(
            `\n ${chalk.yellow('/cmd diagnostics')} [status|validate|stats|orphans|duplicates|full]`,
          );
          console.log('   Run diagnostic checks on the command registry\n');
          console.log(`   ${chalk.yellow('/cmd list')} [category]`);
          console.log('   List all commands or filter by category\n');
          console.log(`   ${chalk.yellow('/cmd info')} <command>`);
          console.log('   Show detailed information about a command\n');
          return success(null, 'Help displayed');
      }
    },
  });

  console.log(chalk.gray('[CLI] Command diagnostics registered'));
}

// ============================================================
// Exports
// ============================================================

export default {
  CommandDiagnostics,
  commandDiagnostics,
  registerDiagnosticCommands,
};

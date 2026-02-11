/**
 * Help Content Generators - Generate help text for commands
 *
 * @module help/generators
 */

import chalk from 'chalk';
import { highlightMatch, horizontalLine, truncate } from '../CommandHelpers.js';
import { type Command, commandRegistry } from '../CommandRegistry.js';
import { formatSignature } from './formatting.js';
import { categoryConfig, getCategoryDisplay, helpMetaRegistry } from './HelpMetaRegistry.js';

/**
 * Generate general help overview
 */
export function generateOverview(): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(
    chalk.bold.cyan(
      '\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557',
    ),
  );
  lines.push(
    chalk.bold.cyan('\u2551') +
      chalk.bold.white('           GeminiHydra CLI - Help System                   ') +
      chalk.bold.cyan('\u2551'),
  );
  lines.push(
    chalk.bold.cyan(
      '\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D',
    ),
  );
  lines.push('');

  lines.push(chalk.bold.yellow('Quick Start:'));
  lines.push(chalk.gray('  Type a message to chat with the AI'));
  lines.push(chalk.gray('  Use /commands to interact with the system'));
  lines.push('');

  lines.push(chalk.bold.yellow('Command Categories:'));
  lines.push('');

  const sortedCategories = Array.from(categoryConfig.values()).sort((a, b) => a.order - b.order);

  for (const cat of sortedCategories) {
    const commands = commandRegistry.getByCategory(cat.name);
    if (commands.length > 0) {
      lines.push(
        `  ${cat.icon} ${chalk.cyan(cat.displayName.padEnd(20))} ${chalk.gray(`(${commands.length} commands)`)}`,
      );
    }
  }

  lines.push('');

  lines.push(chalk.bold.yellow('Essential Commands:'));
  lines.push('');
  lines.push(`  ${chalk.yellow('/help')}              ${chalk.gray('Show this help')}`);
  lines.push(
    `  ${chalk.yellow('/help <command>')}    ${chalk.gray('Detailed help for a command')}`,
  );
  lines.push(`  ${chalk.yellow('/help --all')}        ${chalk.gray('List all commands')}`);
  lines.push(`  ${chalk.yellow('/help --interactive')}${chalk.gray('Interactive help browser')}`);
  lines.push('');
  lines.push(`  ${chalk.yellow('/sessions')}          ${chalk.gray('Manage chat sessions')}`);
  lines.push(`  ${chalk.yellow('/history')}           ${chalk.gray('View conversation history')}`);
  lines.push(`  ${chalk.yellow('/fs')}                ${chalk.gray('File system operations')}`);
  lines.push(`  ${chalk.yellow('/shell')}             ${chalk.gray('Run shell commands')}`);
  lines.push(`  ${chalk.yellow('/search')}            ${chalk.gray('Search files and code')}`);
  lines.push('');

  lines.push(chalk.gray(horizontalLine(60)));
  lines.push(
    chalk.gray(`Use ${chalk.white('/help --category <name>')} for category-specific help`),
  );
  lines.push(chalk.gray(`Use ${chalk.white('/help --export')} to save help to markdown file`));
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate detailed help for a specific command
 */
export function generateCommandHelp(commandName: string): string {
  const cmd = commandRegistry.get(commandName);

  if (!cmd) {
    return (
      chalk.red(`\nUnknown command: ${commandName}\n\n`) +
      chalk.gray(`Use /help --search ${commandName} to find related commands`)
    );
  }

  const meta = helpMetaRegistry.get(cmd.name);
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold.cyan(`\u256D${'─'.repeat(58)}\u256E`));
  lines.push(
    chalk.bold.cyan('│') +
      chalk.bold.white(` Command: /${cmd.name}`.padEnd(58)) +
      chalk.bold.cyan('│'),
  );
  lines.push(chalk.bold.cyan(`\u2570${'─'.repeat(58)}\u256F`));
  lines.push('');

  if (meta?.deprecated) {
    lines.push(
      `${chalk.bgYellow.black(' DEPRECATED ')} ${chalk.yellow(meta.deprecatedMessage || 'This command is deprecated')}`,
    );
    lines.push('');
  }

  lines.push(chalk.bold.white('Description:'));
  lines.push(`  ${cmd.description}`);
  lines.push('');

  lines.push(chalk.bold.white('Usage:'));
  lines.push(`  ${chalk.yellow(formatSignature(cmd))}`);
  lines.push('');

  if (cmd.args && cmd.args.length > 0) {
    lines.push(chalk.bold.white('Arguments:'));
    for (const arg of cmd.args) {
      const reqMark = arg.required ? chalk.red('*') : chalk.gray('?');
      const typeInfo = arg.type ? chalk.gray(` (${arg.type})`) : '';
      const defaultInfo = arg.default !== undefined ? chalk.gray(` [default: ${arg.default}]`) : '';
      const choicesInfo = arg.choices ? chalk.cyan(` {${arg.choices.join(', ')}}`) : '';

      lines.push(`  ${reqMark} ${chalk.cyan(arg.name)}${typeInfo}${choicesInfo}`);
      lines.push(`      ${arg.description}${defaultInfo}`);
    }
    lines.push('');
  }

  if (cmd.aliases && cmd.aliases.length > 0) {
    lines.push(chalk.bold.white('Aliases:'));
    lines.push(`  ${cmd.aliases.map((a) => chalk.yellow(`/${a}`)).join(', ')}`);
    lines.push('');
  }

  if (cmd.subcommands && cmd.subcommands.size > 0) {
    lines.push(chalk.bold.white('Subcommands:'));
    for (const [name, subcmd] of cmd.subcommands) {
      const subAliases =
        subcmd.aliases.length > 0 ? chalk.gray(` (${subcmd.aliases.join(', ')})`) : '';
      lines.push(`  ${chalk.yellow(name.padEnd(15))} ${subcmd.description}${subAliases}`);
    }
    lines.push('');
  }

  if (meta?.examples && meta.examples.length > 0) {
    lines.push(chalk.bold.white('Examples:'));
    for (const ex of meta.examples) {
      lines.push(`  ${chalk.green('$')} ${chalk.yellow(ex.command)}`);
      lines.push(`      ${chalk.gray(ex.description)}`);
      if (ex.output) {
        lines.push(`      ${chalk.gray('\u2192')} ${chalk.dim(ex.output)}`);
      }
    }
    lines.push('');
  }

  if (meta?.notes && meta.notes.length > 0) {
    lines.push(chalk.bold.white('Notes:'));
    for (const note of meta.notes) {
      lines.push(`  ${chalk.gray('\u2022')} ${note}`);
    }
    lines.push('');
  }

  if (meta?.seeAlso && meta.seeAlso.length > 0) {
    lines.push(chalk.bold.white('See Also:'));
    lines.push(`  ${meta.seeAlso.map((s) => chalk.cyan(`/${s}`)).join(', ')}`);
    lines.push('');
  }

  const catDisplay = getCategoryDisplay(cmd.category || 'general');
  lines.push(chalk.gray(`Category: ${catDisplay.icon} ${catDisplay.displayName}`));

  if (meta?.sinceVersion) {
    lines.push(chalk.gray(`Available since: v${meta.sinceVersion}`));
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Generate full command reference
 */
export function generateFullReference(): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold.cyan('\u2550'.repeat(60)));
  lines.push(chalk.bold.white('        GeminiHydra CLI - Complete Command Reference'));
  lines.push(chalk.bold.cyan('\u2550'.repeat(60)));
  lines.push('');

  const sortedCategories = Array.from(categoryConfig.values()).sort((a, b) => a.order - b.order);

  for (const cat of sortedCategories) {
    const commands = commandRegistry.getByCategory(cat.name);
    if (commands.length === 0) continue;

    lines.push(chalk.bold.yellow(`\n${cat.icon} ${cat.displayName}`));
    lines.push(chalk.gray(`   ${cat.description}`));
    lines.push(chalk.gray('─'.repeat(50)));

    for (const cmd of commands) {
      const aliases = cmd.aliases.length > 0 ? chalk.gray(` [${cmd.aliases.join(', ')}]`) : '';

      lines.push(
        `  ${chalk.yellow(`/${cmd.name}`.padEnd(20))} ${truncate(cmd.description, 35)}${aliases}`,
      );
    }
  }

  const totalCommands = commandRegistry.getAll().length;
  const totalCategories = commandRegistry.getCategories().length;

  lines.push('');
  lines.push(chalk.gray('─'.repeat(60)));
  lines.push(chalk.gray(`Total: ${totalCommands} commands in ${totalCategories} categories`));
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate category-specific help
 */
export function generateCategoryHelp(categoryName: string): string {
  const cat = getCategoryDisplay(categoryName);
  const commands = commandRegistry.getByCategory(categoryName);

  if (commands.length === 0) {
    const categories = commandRegistry.getCategories();
    const similar = categories.filter(
      (c) =>
        c.toLowerCase().includes(categoryName.toLowerCase()) ||
        categoryName.toLowerCase().includes(c.toLowerCase()),
    );

    if (similar.length > 0) {
      return (
        chalk.yellow(`\nCategory "${categoryName}" not found.\n`) +
        chalk.gray(`Did you mean: ${similar.map((s) => chalk.cyan(s)).join(', ')}?`)
      );
    }

    return (
      chalk.yellow(`\nCategory "${categoryName}" not found.\n`) +
      chalk.gray(`Available categories: ${categories.join(', ')}`)
    );
  }

  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold.cyan(`\u256D${'─'.repeat(58)}\u256E`));
  lines.push(
    chalk.bold.cyan('│') +
      chalk.bold.white(` ${cat.icon} ${cat.displayName}`.padEnd(58)) +
      chalk.bold.cyan('│'),
  );
  lines.push(chalk.bold.cyan(`\u2570${'─'.repeat(58)}\u256F`));
  lines.push('');

  if (cat.description) {
    lines.push(chalk.gray(cat.description));
    lines.push('');
  }

  lines.push(chalk.bold.white('Commands:'));
  lines.push('');

  for (const cmd of commands) {
    const meta = helpMetaRegistry.get(cmd.name);
    const deprecated = meta?.deprecated ? chalk.yellow(' [DEPRECATED]') : '';
    const aliases = cmd.aliases.length > 0 ? chalk.gray(` (${cmd.aliases.join(', ')})`) : '';

    lines.push(`  ${chalk.yellow(`/${cmd.name}`.padEnd(18))} ${cmd.description}${deprecated}`);

    if (cmd.usage) {
      lines.push(`  ${' '.repeat(18)} ${chalk.gray(`Usage: /${cmd.name} ${cmd.usage}`)}`);
    }

    if (aliases) {
      lines.push(`  ${' '.repeat(18)} ${chalk.gray(`Aliases:${aliases}`)}`);
    }

    lines.push('');
  }

  lines.push(chalk.gray('─'.repeat(60)));
  lines.push(chalk.gray(`Use ${chalk.white(`/help <command>`)} for detailed help on each command`));
  lines.push('');

  return lines.join('\n');
}

/**
 * Search help content
 */
export function searchHelp(query: string): string {
  const lowerQuery = query.toLowerCase();
  const results: Array<{ cmd: Command; score: number; matches: string[] }> = [];

  for (const cmd of commandRegistry.getAll()) {
    let score = 0;
    const matches: string[] = [];

    if (cmd.name.toLowerCase().includes(lowerQuery)) {
      score += 10;
      matches.push('name');
    }

    if (cmd.aliases.some((a) => a.toLowerCase().includes(lowerQuery))) {
      score += 8;
      matches.push('alias');
    }

    if (cmd.description.toLowerCase().includes(lowerQuery)) {
      score += 5;
      matches.push('description');
    }

    if (cmd.category?.toLowerCase().includes(lowerQuery)) {
      score += 3;
      matches.push('category');
    }

    if (cmd.subcommands) {
      for (const [subName, subcmd] of cmd.subcommands) {
        if (
          subName.toLowerCase().includes(lowerQuery) ||
          subcmd.description.toLowerCase().includes(lowerQuery)
        ) {
          score += 4;
          matches.push(`subcommand:${subName}`);
        }
      }
    }

    const meta = helpMetaRegistry.get(cmd.name);
    if (meta) {
      if (
        meta.examples?.some(
          (e) =>
            e.command.toLowerCase().includes(lowerQuery) ||
            e.description.toLowerCase().includes(lowerQuery),
        )
      ) {
        score += 2;
        matches.push('examples');
      }

      if (meta.notes?.some((n) => n.toLowerCase().includes(lowerQuery))) {
        score += 2;
        matches.push('notes');
      }
    }

    if (score > 0) {
      results.push({ cmd, score, matches });
    }
  }

  results.sort((a, b) => b.score - a.score);

  if (results.length === 0) {
    return (
      chalk.yellow(`\nNo results found for: "${query}"\n\n`) +
      chalk.gray('Tips:\n') +
      chalk.gray('  - Try broader search terms\n') +
      chalk.gray('  - Use /help --all to browse all commands\n') +
      chalk.gray('  - Use /help --category <name> to browse by category')
    );
  }

  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold.cyan(`Search Results for: "${query}"`));
  lines.push(chalk.gray('─'.repeat(50)));
  lines.push('');

  for (const { cmd, matches } of results.slice(0, 15)) {
    const matchInfo = chalk.gray(`[${matches.join(', ')}]`);
    const highlighted = highlightMatch(cmd.description, query);

    lines.push(`  ${chalk.yellow(`/${cmd.name}`.padEnd(18))} ${highlighted}`);
    lines.push(`  ${' '.repeat(18)} ${matchInfo}`);
    lines.push('');
  }

  if (results.length > 15) {
    lines.push(chalk.gray(`  ...and ${results.length - 15} more results`));
  }

  lines.push('');
  lines.push(chalk.gray(`Use ${chalk.white(`/help <command>`)} for detailed information`));
  lines.push('');

  return lines.join('\n');
}

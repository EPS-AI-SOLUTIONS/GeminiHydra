/**
 * Help Exporters - Export help to markdown and JSON formats
 *
 * @module help/exporters
 */

import { commandRegistry } from '../CommandRegistry.js';
import { helpMetaRegistry, categoryConfig } from './HelpMetaRegistry.js';
import { formatSignature } from './formatting.js';

/**
 * Export help to markdown format
 */
export function exportToMarkdown(): string {
  const lines: string[] = [];

  lines.push('# GeminiHydra CLI Command Reference\n');
  lines.push('> Auto-generated help documentation\n');
  lines.push(`> Generated: ${new Date().toISOString()}\n`);
  lines.push('---\n');

  // Table of contents
  lines.push('## Table of Contents\n');

  const sortedCategories = Array.from(categoryConfig.values())
    .sort((a, b) => a.order - b.order);

  for (const cat of sortedCategories) {
    const commands = commandRegistry.getByCategory(cat.name);
    if (commands.length > 0) {
      const anchor = cat.name.toLowerCase().replace(/\s+/g, '-');
      lines.push(`- [${cat.icon} ${cat.displayName}](#${anchor})`);
    }
  }

  lines.push('\n---\n');

  // Commands by category
  for (const cat of sortedCategories) {
    const commands = commandRegistry.getByCategory(cat.name);
    if (commands.length === 0) continue;

    lines.push(`## ${cat.icon} ${cat.displayName}\n`);

    if (cat.description) {
      lines.push(`${cat.description}\n`);
    }

    for (const cmd of commands) {
      const meta = helpMetaRegistry.get(cmd.name);

      lines.push(`### \`/${cmd.name}\`\n`);

      if (meta?.deprecated) {
        lines.push(`> \u26A0\uFE0F **DEPRECATED**: ${meta.deprecatedMessage || 'This command is deprecated'}\n`);
      }

      lines.push(`${cmd.description}\n`);

      lines.push('**Usage:**');
      lines.push('```');
      lines.push(formatSignature(cmd));
      lines.push('```\n');

      if (cmd.args && cmd.args.length > 0) {
        lines.push('**Arguments:**\n');
        lines.push('| Name | Type | Required | Default | Description |');
        lines.push('|------|------|----------|---------|-------------|');

        for (const arg of cmd.args) {
          const required = arg.required ? 'Yes' : 'No';
          const defaultVal = arg.default !== undefined ? `\`${arg.default}\`` : '-';
          const type = arg.type || 'string';
          lines.push(`| \`${arg.name}\` | ${type} | ${required} | ${defaultVal} | ${arg.description} |`);
        }
        lines.push('');
      }

      if (cmd.aliases && cmd.aliases.length > 0) {
        lines.push(`**Aliases:** ${cmd.aliases.map(a => `\`/${a}\``).join(', ')}\n`);
      }

      if (cmd.subcommands && cmd.subcommands.size > 0) {
        lines.push('**Subcommands:**\n');
        lines.push('| Subcommand | Description |');
        lines.push('|------------|-------------|');

        for (const [name, subcmd] of cmd.subcommands) {
          lines.push(`| \`${name}\` | ${subcmd.description} |`);
        }
        lines.push('');
      }

      if (meta?.examples && meta.examples.length > 0) {
        lines.push('**Examples:**\n');
        for (const ex of meta.examples) {
          lines.push('```bash');
          lines.push(`# ${ex.description}`);
          lines.push(ex.command);
          if (ex.output) {
            lines.push(`# Output: ${ex.output}`);
          }
          lines.push('```\n');
        }
      }

      if (meta?.notes && meta.notes.length > 0) {
        lines.push('**Notes:**\n');
        for (const note of meta.notes) {
          lines.push(`- ${note}`);
        }
        lines.push('');
      }

      if (meta?.seeAlso && meta.seeAlso.length > 0) {
        lines.push(`**See Also:** ${meta.seeAlso.map(s => `[\`/${s}\`](#${s})`).join(', ')}\n`);
      }

      lines.push('---\n');
    }
  }

  const totalCommands = commandRegistry.getAll().length;
  lines.push(`\n*Total: ${totalCommands} commands*\n`);

  return lines.join('\n');
}

/**
 * Export help to JSON format
 */
export function exportToJSON(): string {
  const data: any = {
    generated: new Date().toISOString(),
    categories: {},
    commands: {}
  };

  for (const cat of categoryConfig.values()) {
    const commands = commandRegistry.getByCategory(cat.name);
    if (commands.length > 0) {
      data.categories[cat.name] = {
        displayName: cat.displayName,
        description: cat.description,
        icon: cat.icon,
        commandCount: commands.length
      };
    }
  }

  for (const cmd of commandRegistry.getAll()) {
    const meta = helpMetaRegistry.get(cmd.name);

    data.commands[cmd.name] = {
      name: cmd.name,
      description: cmd.description,
      usage: cmd.usage,
      category: cmd.category,
      aliases: cmd.aliases,
      args: cmd.args,
      subcommands: cmd.subcommands ? Object.fromEntries(cmd.subcommands) : undefined,
      examples: meta?.examples,
      notes: meta?.notes,
      seeAlso: meta?.seeAlso,
      deprecated: meta?.deprecated,
      deprecatedMessage: meta?.deprecatedMessage
    };
  }

  return JSON.stringify(data, null, 2);
}

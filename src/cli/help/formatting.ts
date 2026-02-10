/**
 * Help Formatting Utilities - Formatting functions for help display
 *
 * @module help/formatting
 */

import chalk from 'chalk';
import type { Command, CommandArg } from '../CommandRegistry.js';

/**
 * Format argument for display
 */
export function formatArg(arg: CommandArg): string {
  const required = arg.required ? '' : '?';
  const defaultVal = arg.default !== undefined ? `=${arg.default}` : '';
  const typeHint = arg.type ? `:${arg.type}` : '';
  const choices = arg.choices ? `(${arg.choices.join('|')})` : '';

  return `<${arg.name}${required}${typeHint}${defaultVal}>${choices}`;
}

/**
 * Format command signature
 */
export function formatSignature(cmd: Command): string {
  const parts = [`/${cmd.name}`];

  if (cmd.args && cmd.args.length > 0) {
    parts.push(...cmd.args.map(formatArg));
  }

  if (cmd.usage) {
    return `/${cmd.name} ${cmd.usage}`;
  }

  return parts.join(' ');
}

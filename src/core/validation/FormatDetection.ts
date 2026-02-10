/**
 * Format detection utilities
 */

import type { FormatType } from './types.js';
import { extractListItems } from './ListValidator.js';

/**
 * Detect the format of output text
 */
export function detectFormat(output: string): FormatType {
  const trimmed = output.trim();

  // Check for JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch { /* Not valid JSON */ }
  }

  // Check for code blocks
  if (/```[\s\S]*```/.test(output)) {
    return 'code';
  }

  // Check for list
  const listItems = extractListItems(output);
  if (listItems.length >= 2) {
    return 'list';
  }

  // Check for markdown
  if (/^#{1,6}\s+.+$/m.test(output) || /\*\*[^*]+\*\*/.test(output) || /\[[^\]]+\]\([^)]+\)/.test(output)) {
    return 'markdown';
  }

  return 'freeform';
}

/**
 * Get list of corrections made between original and corrected output
 */
export function getCorrections(original: string, corrected: string): string[] {
  const corrections: string[] = [];

  if (original.length !== corrected.length) {
    corrections.push(`Length changed from ${original.length} to ${corrected.length}`);
  }

  if (original !== corrected) {
    const originalLines = original.split('\n');
    const correctedLines = corrected.split('\n');

    if (originalLines.length !== correctedLines.length) {
      corrections.push(`Line count changed from ${originalLines.length} to ${correctedLines.length}`);
    }

    let changedCount = 0;
    const minLines = Math.min(originalLines.length, correctedLines.length);
    for (let i = 0; i < minLines; i++) {
      if (originalLines[i] !== correctedLines[i]) {
        changedCount++;
      }
    }
    if (changedCount > 0) {
      corrections.push(`${changedCount} line(s) modified`);
    }
  }

  return corrections;
}

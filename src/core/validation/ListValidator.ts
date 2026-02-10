/**
 * List validation and auto-correction
 */

import type { FormatSpec, FormatError } from './types.js';

/**
 * Extract list items from text
 */
export function extractListItems(text: string): Array<{ type: 'bullet' | 'numbered'; content: string; line: number }> {
  const items: Array<{ type: 'bullet' | 'numbered'; content: string; line: number }> = [];
  const lines = text.split('\n');

  lines.forEach((line, idx) => {
    const bulletMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bulletMatch) {
      items.push({ type: 'bullet', content: bulletMatch[1], line: idx + 1 });
      return;
    }

    const numberedMatch = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (numberedMatch) {
      items.push({ type: 'numbered', content: numberedMatch[1], line: idx + 1 });
    }
  });

  return items;
}

/**
 * Validate list output against spec
 */
export function validateList(
  output: string,
  spec: FormatSpec,
  errors: FormatError[],
  suggestions: string[]
): void {
  const listItems = extractListItems(output);

  if (listItems.length === 0) {
    errors.push({
      type: 'structure',
      message: 'No list items found',
      expected: 'Bullet points (-) or numbered items (1.)',
      actual: 'No list structure detected'
    });
    suggestions.push('Format output as a list using - or 1. prefixes');
    return;
  }

  if (spec.minItems && listItems.length < spec.minItems) {
    errors.push({
      type: 'invalid',
      message: `Too few list items`,
      expected: `>= ${spec.minItems} items`,
      actual: `${listItems.length} items`
    });
    suggestions.push(`Add at least ${spec.minItems - listItems.length} more items`);
  }

  if (spec.listStyle) {
    const hasBullets = listItems.some(item => item.type === 'bullet');
    const hasNumbered = listItems.some(item => item.type === 'numbered');

    if (spec.listStyle === 'bullet' && hasNumbered && !hasBullets) {
      errors.push({
        type: 'structure',
        message: 'Expected bullet list, found numbered list',
        expected: 'Bullet points (-, *, +)',
        actual: 'Numbered items'
      });
      suggestions.push('Convert numbered list to bullet points');
    } else if (spec.listStyle === 'numbered' && hasBullets && !hasNumbered) {
      errors.push({
        type: 'structure',
        message: 'Expected numbered list, found bullet list',
        expected: 'Numbered items (1., 2., etc.)',
        actual: 'Bullet points'
      });
      suggestions.push('Convert bullet points to numbered list');
    }
  }

  const emptyItems = listItems.filter(item => !item.content.trim());
  if (emptyItems.length > 0) {
    errors.push({
      type: 'invalid',
      message: `${emptyItems.length} empty list item(s) found`,
      expected: 'Non-empty content',
      actual: 'Empty items'
    });
  }
}

/**
 * Auto-correct list output
 */
export function autoCorrectList(output: string, spec: FormatSpec): string {
  const lines = output.split('\n');
  const correctedLines: string[] = [];
  let itemNumber = 1;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      correctedLines.push('');
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      if (spec.listStyle === 'numbered') {
        const content = trimmed.replace(/^[-*+\d.)\s]+/, '');
        correctedLines.push(`${itemNumber}. ${content}`);
        itemNumber++;
      } else if (spec.listStyle === 'bullet') {
        const content = trimmed.replace(/^[-*+\d.)\s]+/, '');
        correctedLines.push(`- ${content}`);
      } else {
        correctedLines.push(line);
        if (/^\d+[.)]\s+/.test(trimmed)) itemNumber++;
      }
    } else {
      if (spec.listStyle === 'numbered') {
        correctedLines.push(`${itemNumber}. ${trimmed}`);
        itemNumber++;
      } else {
        correctedLines.push(`- ${trimmed}`);
      }
    }
  }

  return correctedLines.join('\n');
}

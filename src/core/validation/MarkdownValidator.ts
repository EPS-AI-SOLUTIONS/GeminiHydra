/**
 * Markdown validation and auto-correction
 */

import type { FormatSpec, FormatError } from './types.js';

/**
 * Extract markdown headers from text
 */
export function extractMarkdownHeaders(markdown: string): Array<{ level: number; text: string; line: number }> {
  const headers: Array<{ level: number; text: string; line: number }> = [];
  const lines = markdown.split('\n');

  lines.forEach((line, idx) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headers.push({
        level: match[1].length,
        text: match[2].trim(),
        line: idx + 1
      });
    }
  });

  return headers;
}

/**
 * Validate markdown output against spec
 */
export function validateMarkdown(
  output: string,
  spec: FormatSpec,
  errors: FormatError[],
  suggestions: string[]
): void {
  if (spec.requiredSections && spec.requiredSections.length > 0) {
    const headers = extractMarkdownHeaders(output);

    for (const required of spec.requiredSections) {
      const found = headers.some(h =>
        h.text.toLowerCase() === required.toLowerCase() ||
        h.text.toLowerCase().includes(required.toLowerCase())
      );
      if (!found) {
        errors.push({
          type: 'missing',
          message: `Missing required section: ${required}`,
          expected: `Header containing "${required}"`,
          actual: 'Not found'
        });
        suggestions.push(`Add a section with header "## ${required}"`);
      }
    }
  }

  const hasHeaders = /^#{1,6}\s+.+$/m.test(output);
  const hasContent = output.trim().split('\n').filter(line =>
    line.trim().length > 0 && !line.trim().startsWith('#')
  ).length > 0;

  if (!hasHeaders && !hasContent) {
    errors.push({
      type: 'structure',
      message: 'Output lacks markdown structure',
      expected: 'Headers and content',
      actual: 'No structure detected'
    });
    suggestions.push('Add markdown headers (## Header) to organize content');
  }

  checkMarkdownIssues(output, errors, suggestions);
}

/**
 * Auto-correct markdown output
 */
export function autoCorrectMarkdown(output: string, spec: FormatSpec): string {
  let corrected = output;

  const codeBlockCount = (corrected.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    corrected += '\n```';
  }

  if (spec.requiredSections) {
    const headers = extractMarkdownHeaders(corrected);
    const existingHeaders = new Set(headers.map(h => h.text.toLowerCase()));

    for (const required of spec.requiredSections) {
      if (!existingHeaders.has(required.toLowerCase())) {
        corrected += `\n\n## ${required}\n\n[Content needed]`;
      }
    }
  }

  return corrected;
}

function checkMarkdownIssues(markdown: string, errors: FormatError[], suggestions: string[]): void {
  const lines = markdown.split('\n');

  lines.forEach((line, idx) => {
    const linkMatches = line.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g);
    for (const match of linkMatches) {
      if (!match[2] || match[2].trim() === '') {
        errors.push({
          type: 'invalid',
          message: `Empty link URL at line ${idx + 1}`,
          line: idx + 1,
          expected: 'Valid URL',
          actual: 'Empty URL'
        });
      }
    }
  });

  const codeBlockCount = (markdown.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    errors.push({
      type: 'structure',
      message: 'Unclosed code block detected',
      expected: 'Matching ``` pairs',
      actual: `${codeBlockCount} backtick sequences`
    });
    suggestions.push('Ensure all code blocks have closing ```');
  }
}

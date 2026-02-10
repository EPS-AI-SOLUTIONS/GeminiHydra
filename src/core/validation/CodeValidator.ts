/**
 * Code validation and auto-correction
 */

import type { FormatSpec, FormatError } from './types.js';

/**
 * Extract code blocks from markdown-formatted text
 */
export function extractCodeBlocks(text: string): Array<{ language?: string; code: string }> {
  const blocks: Array<{ language?: string; code: string }> = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    blocks.push({
      language: match[1] || undefined,
      code: match[2]
    });
  }

  return blocks;
}

/**
 * Heuristics to detect if text looks like code
 */
export function looksLikeCode(text: string): boolean {
  const codeIndicators = [
    /^(import|export|const|let|var|function|class|interface|type)\s/m,
    /[{}\[\]();]/,
    /=>/,
    /\bdef\s+\w+\s*\(/,
    /\bpublic\s+(static\s+)?(void|int|string)/i,
    /<\w+(\s+\w+="[^"]*")*\s*\/?>/,
    /^\s*#\s*(include|define|ifdef|ifndef)/m
  ];

  return codeIndicators.some(pattern => pattern.test(text));
}

/**
 * Validate code output against spec
 */
export function validateCode(
  output: string,
  spec: FormatSpec,
  errors: FormatError[],
  suggestions: string[]
): void {
  const codeBlocks = extractCodeBlocks(output);

  if (codeBlocks.length === 0) {
    if (!looksLikeCode(output)) {
      errors.push({
        type: 'structure',
        message: 'No code blocks found in output',
        expected: 'Code wrapped in ``` blocks',
        actual: 'Plain text'
      });
      suggestions.push('Wrap code in markdown code blocks: ```language\\ncode\\n```');
    }
  }

  if (spec.codeLanguage && codeBlocks.length > 0) {
    const hasCorrectLanguage = codeBlocks.some(block =>
      block.language?.toLowerCase() === spec.codeLanguage?.toLowerCase()
    );
    if (!hasCorrectLanguage) {
      errors.push({
        type: 'invalid',
        message: `Expected ${spec.codeLanguage} code block`,
        expected: spec.codeLanguage,
        actual: codeBlocks.map(b => b.language || 'unspecified').join(', ')
      });
      suggestions.push(`Specify language in code block: \`\`\`${spec.codeLanguage}`);
    }
  }

  codeBlocks.forEach((block, idx) => {
    const syntaxErrors = checkCodeSyntax(block.code, block.language);
    syntaxErrors.forEach(err => {
      errors.push({
        ...err,
        message: `Code block ${idx + 1}: ${err.message}`
      });
    });
  });
}

/**
 * Auto-correct code output
 */
export function autoCorrectCode(output: string, spec: FormatSpec): string {
  const codeBlocks = extractCodeBlocks(output);

  if (codeBlocks.length === 0 && looksLikeCode(output)) {
    const language = spec.codeLanguage || '';
    return '```' + language + '\n' + output.trim() + '\n```';
  }

  if (spec.codeLanguage && codeBlocks.length > 0) {
    return output.replace(/```\n/g, '```' + spec.codeLanguage + '\n');
  }

  return output;
}

function checkCodeSyntax(code: string, language?: string): FormatError[] {
  const errors: FormatError[] = [];

  const brackets = checkBracketMatching(code);
  if (brackets.length > 0) {
    errors.push(...brackets);
  }

  if (language) {
    switch (language.toLowerCase()) {
      case 'json':
        try {
          JSON.parse(code);
        } catch (e) {
          errors.push({
            type: 'parse',
            message: `Invalid JSON syntax: ${(e as Error).message}`,
            expected: 'Valid JSON',
            actual: 'Parse error'
          });
        }
        break;
      case 'javascript':
      case 'typescript':
      case 'js':
      case 'ts':
        if (/;\s*;/.test(code)) {
          errors.push({
            type: 'invalid',
            message: 'Double semicolon detected',
            expected: 'Single semicolon',
            actual: ';;'
          });
        }
        break;
    }
  }

  return errors;
}

function checkBracketMatching(code: string): FormatError[] {
  const errors: FormatError[] = [];
  const stack: Array<{ char: string; pos: number }> = [];
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const closing: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }

    if ((char === '"' || char === "'" || char === '`') && !inString) {
      inString = true;
      stringChar = char;
      continue;
    }
    if (char === stringChar && inString) {
      inString = false;
      stringChar = '';
      continue;
    }
    if (inString) continue;

    if (pairs[char]) {
      stack.push({ char, pos: i });
    } else if (closing[char]) {
      if (stack.length === 0) {
        errors.push({
          type: 'structure',
          message: `Unmatched closing bracket '${char}'`,
          position: i,
          expected: 'Matching opening bracket',
          actual: char
        });
      } else {
        const last = stack.pop()!;
        if (pairs[last.char] !== char) {
          errors.push({
            type: 'structure',
            message: `Mismatched brackets: '${last.char}' at position ${last.pos} closed with '${char}'`,
            position: i,
            expected: pairs[last.char],
            actual: char
          });
        }
      }
    }
  }

  while (stack.length > 0) {
    const unclosed = stack.pop()!;
    errors.push({
      type: 'structure',
      message: `Unclosed bracket '${unclosed.char}'`,
      position: unclosed.pos,
      expected: pairs[unclosed.char],
      actual: 'End of code'
    });
  }

  return errors;
}

/**
 * DocumentationGen.ts - Feature #33: Documentation Generation
 *
 * Auto-generates documentation for code including:
 * - Function/method descriptions
 * - Parameter documentation
 * - Return type documentation
 * - Usage examples
 *
 * Part of DeveloperTools module refactoring.
 */

import path from 'node:path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import 'dotenv/config';
import { GEMINI_MODELS } from '../../config/models.config.js';

// ============================================================
// Configuration
// ============================================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const QUALITY_MODEL = GEMINI_MODELS.FLASH;

// ============================================================
// Interfaces
// ============================================================

export interface DocParam {
  name: string;
  type: string;
  description: string;
}

export interface DocReturn {
  type: string;
  description: string;
}

export interface DocEntry {
  type: 'class' | 'function' | 'method' | 'interface' | 'type' | 'constant';
  name: string;
  description: string;
  params?: DocParam[];
  returns?: DocReturn;
  examples?: string[];
  tags?: string[];
}

export interface DocumentationResult {
  file: string;
  title: string;
  overview: string;
  entries: DocEntry[];
  usageExamples: string[];
}

export type DocumentationFormat = 'markdown' | 'text';

// ============================================================
// Prompt Template
// ============================================================

const DOC_GENERATION_PROMPT = `You are a technical writer. Generate comprehensive documentation for the following code.

FILE: {filename}

CODE:
\`\`\`
{code}
\`\`\`

Generate documentation in JSON format:
{
  "title": "Module/file title",
  "overview": "What this file/module does (2-3 sentences)",
  "entries": [
    {
      "type": "function|class|method|interface|type|constant",
      "name": "identifier name",
      "description": "What it does",
      "params": [{"name": "param", "type": "string", "description": "what it is"}],
      "returns": {"type": "string", "description": "what is returned"},
      "examples": ["usage example code"],
      "tags": ["async", "deprecated", etc]
    }
  ],
  "usageExamples": ["Full usage examples"]
}

Be concise but complete. Focus on what developers need to know.`;

// ============================================================
// Core Functions
// ============================================================

/**
 * Generates documentation for the provided code.
 * @param code - The source code to document
 * @param filename - The name of the source file
 * @returns A DocumentationResult with all documentation entries
 */
export async function generateDocumentation(
  code: string,
  filename: string,
): Promise<DocumentationResult> {
  console.log(chalk.cyan(`[DocGen] Generating documentation for ${filename}...`));

  const prompt = DOC_GENERATION_PROMPT.replace('{filename}', filename).replace('{code}', code);

  try {
    const model = genAI.getGenerativeModel({
      model: QUALITY_MODEL,
      generationConfig: { temperature: 1.0, maxOutputTokens: 8192 }, // Temperature locked at 1.0 for Gemini - do not change
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    const jsonStr = responseText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(jsonStr);

    console.log(chalk.green(`[DocGen] Generated docs for ${parsed.entries?.length || 0} items`));

    return {
      file: filename,
      title: parsed.title || path.basename(filename),
      overview: parsed.overview || '',
      entries: parsed.entries || [],
      usageExamples: parsed.usageExamples || [],
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`[DocGen] Failed: ${msg}`));
    return {
      file: filename,
      title: path.basename(filename),
      overview: 'Documentation generation failed',
      entries: [],
      usageExamples: [],
    };
  }
}

/**
 * Formats documentation result into the specified format.
 * @param doc - The DocumentationResult to format
 * @param format - Output format ('markdown' or 'text')
 * @returns Formatted documentation string
 */
export function formatDocumentation(
  doc: DocumentationResult,
  format: DocumentationFormat = 'markdown',
): string {
  const lines: string[] = [];

  if (format === 'markdown') {
    lines.push(`# ${doc.title}\n`);
    lines.push(`${doc.overview}\n`);

    for (const entry of doc.entries) {
      lines.push(`## ${entry.type}: \`${entry.name}\`\n`);
      lines.push(`${entry.description}\n`);

      if (entry.params && entry.params.length > 0) {
        lines.push('**Parameters:**');
        entry.params.forEach((p) => {
          lines.push(`- \`${p.name}\` (${p.type}): ${p.description}`);
        });
        lines.push('');
      }

      if (entry.returns) {
        lines.push(`**Returns:** \`${entry.returns.type}\` - ${entry.returns.description}\n`);
      }

      if (entry.examples && entry.examples.length > 0) {
        lines.push('**Example:**');
        lines.push('```');
        lines.push(entry.examples[0]);
        lines.push('```\n');
      }
    }

    if (doc.usageExamples.length > 0) {
      lines.push('## Usage Examples\n');
      doc.usageExamples.forEach((ex, i) => {
        lines.push(`### Example ${i + 1}`);
        lines.push('```');
        lines.push(ex);
        lines.push('```\n');
      });
    }
  } else {
    // Plain text format
    lines.push(`${doc.title}`);
    lines.push('='.repeat(doc.title.length));
    lines.push(`\n${doc.overview}\n`);

    for (const entry of doc.entries) {
      lines.push(`\n${entry.type.toUpperCase()}: ${entry.name}`);
      lines.push('-'.repeat(20));
      lines.push(entry.description);
    }
  }

  return lines.join('\n');
}

/**
 * Generates JSDoc/TSDoc style comments for a single entry.
 * @param entry - The DocEntry to convert to JSDoc
 * @returns A JSDoc formatted comment string
 */
export function generateJSDoc(entry: DocEntry): string {
  const lines: string[] = ['/**'];

  lines.push(` * ${entry.description}`);

  if (entry.params && entry.params.length > 0) {
    lines.push(' *');
    entry.params.forEach((p) => {
      lines.push(` * @param ${p.name} - ${p.description}`);
    });
  }

  if (entry.returns) {
    lines.push(` * @returns ${entry.returns.description}`);
  }

  if (entry.tags && entry.tags.length > 0) {
    entry.tags.forEach((tag) => {
      lines.push(` * @${tag}`);
    });
  }

  if (entry.examples && entry.examples.length > 0) {
    lines.push(' * @example');
    entry.examples[0].split('\n').forEach((line) => {
      lines.push(` * ${line}`);
    });
  }

  lines.push(' */');

  return lines.join('\n');
}

/**
 * Generates a table of contents for the documentation.
 * @param doc - The DocumentationResult
 * @returns A markdown table of contents string
 */
export function generateTableOfContents(doc: DocumentationResult): string {
  const lines: string[] = ['## Table of Contents\n'];

  doc.entries.forEach((entry) => {
    const anchor = entry.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    lines.push(`- [${entry.type}: ${entry.name}](#${entry.type}-${anchor})`);
  });

  if (doc.usageExamples.length > 0) {
    lines.push('- [Usage Examples](#usage-examples)');
  }

  return lines.join('\n');
}

// ============================================================
// Default Export
// ============================================================

export default {
  generateDocumentation,
  formatDocumentation,
  generateJSDoc,
  generateTableOfContents,
};

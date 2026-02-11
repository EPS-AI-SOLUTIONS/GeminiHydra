/**
 * File Handlers - PDF, Word, Images, and more
 * Agent: Zoltan (Data Processing)
 *
 * Supports:
 * - PDF files (text extraction)
 * - Word documents (.docx)
 * - Images (analysis via Gemini Vision)
 * - CSV/JSON/YAML data files
 * - Code files with syntax highlighting
 */

import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import 'dotenv/config';
import { GEMINI_MODELS } from '../config/models.config.js';
import { getErrorMessage } from '../core/errors.js';
import {
  createFileSystem,
  type NativeFileSystem,
} from '../native/nativefilesystem/NativeFileSystem.js';
import type { FileInfo, FileType } from '../native/types.js';

const execAsync = promisify(exec);

// Initialize Gemini for image analysis
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Re-export FileType for backward compatibility
export type { FileType } from '../native/types.js';

interface ExtractedContent {
  text: string;
  metadata?: Record<string, unknown>;
  images?: string[]; // Base64 encoded images
  tables?: unknown[][];
}

// Shared NativeFileSystem instance for text reading
let _nativeFs: NativeFileSystem | null = null;

/**
 * Get or create NativeFileSystem instance
 */
function getFileSystem(filepath: string): NativeFileSystem {
  const rootDir = path.dirname(filepath);
  if (!_nativeFs || _nativeFs.getRoot() !== rootDir) {
    _nativeFs = createFileSystem(rootDir, {
      blockedPaths: [], // FileHandlers should read any file
    });
  }
  return _nativeFs;
}

function summarizeJSON(data: unknown, depth: number = 0): string {
  if (depth > 3) return '...';

  if (Array.isArray(data)) {
    if (data.length === 0) return '[]';
    return `Array[${data.length}] of ${summarizeJSON(data[0], depth + 1)}`;
  }

  if (typeof data === 'object' && data !== null) {
    const keys = Object.keys(data);
    if (keys.length === 0) return '{}';
    const sample = keys
      .slice(0, 5)
      .map((k) => `${k}: ${typeof (data as Record<string, unknown>)[k]}`)
      .join(', ');
    return `{${sample}${keys.length > 5 ? ', ...' : ''}}`;
  }

  return typeof data;
}

/**
 * Detect file type
 */
export function detectType(filepath: string): FileType {
  const ext = path.extname(filepath).toLowerCase();

  const typeMap: Record<string, FileType> = {
    '.pdf': 'pdf',
    '.docx': 'docx',
    '.doc': 'docx',
    '.png': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.gif': 'image',
    '.webp': 'image',
    '.bmp': 'image',
    '.csv': 'csv',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.ts': 'code',
    '.tsx': 'code',
    '.js': 'code',
    '.jsx': 'code',
    '.py': 'code',
    '.rs': 'code',
    '.go': 'code',
    '.java': 'code',
    '.cpp': 'code',
    '.c': 'code',
    '.h': 'code',
    '.md': 'text',
    '.txt': 'text',
  };

  return typeMap[ext] || 'unknown';
}

/**
 * Get file info
 */
export async function getFileInfo(filepath: string): Promise<FileInfo> {
  const stats = await fs.stat(filepath);
  const ext = path.extname(filepath);

  return {
    path: filepath,
    name: path.basename(filepath),
    type: detectType(filepath),
    size: stats.size,
    extension: ext,
  };
}

/**
 * Extract text from PDF
 */
export async function extractPDF(filepath: string): Promise<ExtractedContent> {
  try {
    // Try using pdf-parse via dynamic import or command line
    // Fallback: Use pdftotext if available (poppler-utils)
    try {
      const { stdout } = await execAsync(`pdftotext "${filepath}" -`, {
        maxBuffer: 10 * 1024 * 1024,
      });
      return { text: stdout };
    } catch {
      // Try alternative: pdf.js or read as binary and use Gemini
      const buffer = await fs.readFile(filepath);
      const base64 = buffer.toString('base64');

      // Use Gemini Vision to extract text
      const model = genAI.getGenerativeModel({ model: GEMINI_MODELS.FLASH });
      const result = await model.generateContent([
        'Extract all text from this PDF document. Return the text content only.',
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64,
          },
        },
      ]);

      return { text: result.response.text() };
    }
  } catch (error: unknown) {
    return { text: `[PDF extraction failed: ${getErrorMessage(error)}]` };
  }
}

/**
 * Extract text from Word document
 */
export async function extractDocx(filepath: string): Promise<ExtractedContent> {
  try {
    // Use mammoth or similar via command line
    // Fallback: Basic XML extraction from .docx (it's a zip file)
    const { stdout } = await execAsync(
      `unzip -p "${filepath}" word/document.xml 2>/dev/null | sed 's/<[^>]*>//g'`,
    );
    return { text: stdout.trim() };
  } catch {
    // Try using Gemini
    try {
      const buffer = await fs.readFile(filepath);
      const base64 = buffer.toString('base64');

      const model = genAI.getGenerativeModel({ model: GEMINI_MODELS.FLASH });
      const result = await model.generateContent([
        'Extract all text from this Word document. Return the text content only.',
        {
          inlineData: {
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            data: base64,
          },
        },
      ]);

      return { text: result.response.text() };
    } catch (error: unknown) {
      return { text: `[DOCX extraction failed: ${getErrorMessage(error)}]` };
    }
  }
}

/**
 * Analyze image using Gemini Vision
 */
export async function analyzeImage(filepath: string, prompt?: string): Promise<ExtractedContent> {
  try {
    const buffer = await fs.readFile(filepath);
    const base64 = buffer.toString('base64');
    const ext = path.extname(filepath).toLowerCase();

    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    };

    const mimeType = mimeTypes[ext] || 'image/png';

    const model = genAI.getGenerativeModel({ model: GEMINI_MODELS.FLASH });
    const analysisPrompt =
      prompt ||
      'Describe this image in detail. If it contains text, extract it. If it shows code or a UI, describe what you see.';

    const result = await model.generateContent([
      analysisPrompt,
      {
        inlineData: {
          mimeType,
          data: base64,
        },
      },
    ]);

    return {
      text: result.response.text(),
      images: [base64],
    };
  } catch (error: unknown) {
    return { text: `[Image analysis failed: ${getErrorMessage(error)}]` };
  }
}

/**
 * Extract CSV data
 */
export async function extractCSV(filepath: string): Promise<ExtractedContent> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());

    const tables: unknown[][] = [];
    const headers = lines[0]?.split(',').map((h) => h.trim());

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      tables.push(values);
    }

    return {
      text:
        `CSV with ${lines.length - 1} rows and ${headers?.length || 0} columns:\n` +
        `Headers: ${headers?.join(', ')}\n` +
        `Sample: ${tables[0]?.join(', ')}`,
      tables: [headers || [], ...tables],
      metadata: {
        rows: tables.length,
        columns: headers?.length || 0,
        headers,
      },
    };
  } catch (error: unknown) {
    return { text: `[CSV extraction failed: ${getErrorMessage(error)}]` };
  }
}

/**
 * Extract JSON data
 */
export async function extractJSON(filepath: string): Promise<ExtractedContent> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    const data = JSON.parse(content);

    const summary = summarizeJSON(data);

    return {
      text: summary,
      metadata: {
        type: Array.isArray(data) ? 'array' : 'object',
        length: Array.isArray(data) ? data.length : Object.keys(data).length,
      },
    };
  } catch (error: unknown) {
    return { text: `[JSON extraction failed: ${getErrorMessage(error)}]` };
  }
}

/**
 * Extract YAML data
 */
export async function extractYAML(filepath: string): Promise<ExtractedContent> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');

    // Simple YAML parsing (for full support, use js-yaml)
    const lines = content.split('\n');
    const keys: string[] = [];

    for (const line of lines) {
      const match = line.match(/^(\s*)(\w+):/);
      if (match && match[1].length === 0) {
        keys.push(match[2]);
      }
    }

    return {
      text: `YAML file with ${lines.length} lines\nTop-level keys: ${keys.join(', ')}`,
      metadata: { keys, lineCount: lines.length },
    };
  } catch (error: unknown) {
    return { text: `[YAML extraction failed: ${getErrorMessage(error)}]` };
  }
}

/**
 * Read text file - delegates to NativeFileSystem
 * This is the canonical method for reading text files
 */
export async function readText(filepath: string): Promise<string> {
  const nativeFs = getFileSystem(filepath);
  const filename = path.basename(filepath);
  return nativeFs.readFile(filename);
}

/**
 * Extract plain text
 * Delegates to NativeFileSystem for consistent file handling
 */
export async function extractText(filepath: string): Promise<ExtractedContent> {
  try {
    // Delegate to NativeFileSystem via readText
    const content = await readText(filepath);
    return {
      text: content,
      metadata: {
        lines: content.split('\n').length,
        characters: content.length,
      },
    };
  } catch (error: unknown) {
    return { text: `[Text extraction failed: ${getErrorMessage(error)}]` };
  }
}

/**
 * Extract content from any file
 */
export async function extractContent(filepath: string): Promise<ExtractedContent> {
  const type = detectType(filepath);

  switch (type) {
    case 'pdf':
      return extractPDF(filepath);
    case 'docx':
      return extractDocx(filepath);
    case 'image':
      return analyzeImage(filepath);
    case 'csv':
      return extractCSV(filepath);
    case 'json':
      return extractJSON(filepath);
    case 'yaml':
      return extractYAML(filepath);
    case 'code':
    case 'text':
      return extractText(filepath);
    default:
      return extractText(filepath);
  }
}

/**
 * Batch process multiple files
 */
export async function processMultiple(filepaths: string[]): Promise<Map<string, ExtractedContent>> {
  const results = new Map<string, ExtractedContent>();

  for (const filepath of filepaths) {
    console.log(chalk.gray(`Processing: ${path.basename(filepath)}...`));
    const content = await extractContent(filepath);
    results.set(filepath, content);
  }

  return results;
}

/**
 * Analyze screenshot for debugging
 */
export async function analyzeScreenshot(filepath: string): Promise<{
  description: string;
  errors: string[];
  suggestions: string[];
  uiElements: string[];
}> {
  const content = await analyzeImage(
    filepath,
    `Analyze this screenshot for debugging purposes. Identify:
1. Any error messages or warnings visible
2. UI elements and their state
3. Any issues or problems you can see
4. Suggestions for fixing any issues

Format your response as:
DESCRIPTION: <what you see>
ERRORS: <list of errors>
UI_ELEMENTS: <list of UI elements>
SUGGESTIONS: <list of suggestions>`,
  );

  // Parse the response
  const text = content.text;
  const sections = {
    description: '',
    errors: [] as string[],
    suggestions: [] as string[],
    uiElements: [] as string[],
  };

  const descMatch = text.match(/DESCRIPTION:\s*(.+?)(?=ERRORS:|UI_ELEMENTS:|SUGGESTIONS:|$)/s);
  if (descMatch) sections.description = descMatch[1].trim();

  const errorsMatch = text.match(/ERRORS:\s*(.+?)(?=UI_ELEMENTS:|SUGGESTIONS:|$)/s);
  if (errorsMatch) {
    sections.errors = errorsMatch[1]
      .split('\n')
      .map((l) => l.replace(/^[-*]\s*/, '').trim())
      .filter((l) => l);
  }

  const uiMatch = text.match(/UI_ELEMENTS:\s*(.+?)(?=SUGGESTIONS:|$)/s);
  if (uiMatch) {
    sections.uiElements = uiMatch[1]
      .split('\n')
      .map((l) => l.replace(/^[-*]\s*/, '').trim())
      .filter((l) => l);
  }

  const suggestMatch = text.match(/SUGGESTIONS:\s*(.+?)$/s);
  if (suggestMatch) {
    sections.suggestions = suggestMatch[1]
      .split('\n')
      .map((l) => l.replace(/^[-*]\s*/, '').trim())
      .filter((l) => l);
  }

  return sections;
}

/**
 * FileHandlers object - backward-compatible namespace for all file handling functions.
 * Provides the same API as the previous static class.
 */
export const FileHandlers = {
  detectType,
  getFileInfo,
  extractContent,
  extractPDF,
  extractDocx,
  analyzeImage,
  extractCSV,
  extractJSON,
  extractYAML,
  readText,
  extractText,
  processMultiple,
  analyzeScreenshot,
};

export default FileHandlers;

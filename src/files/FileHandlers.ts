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

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';
import { NativeFileSystem, createFileSystem } from '../native/nativefilesystem/NativeFileSystem.js';
import { FileInfo, FileType } from '../native/types.js';
import { GEMINI_MODELS } from '../config/models.config.js';

const execAsync = promisify(exec);

// Initialize Gemini for image analysis
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Re-export FileType for backward compatibility
export type { FileType } from '../native/types.js';

interface ExtractedContent {
  text: string;
  metadata?: Record<string, any>;
  images?: string[]; // Base64 encoded images
  tables?: any[][];
}

export class FileHandlers {
  /**
   * Detect file type
   */
  static detectType(filepath: string): FileType {
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
  static async getFileInfo(filepath: string): Promise<FileInfo> {
    const stats = await fs.stat(filepath);
    const ext = path.extname(filepath);

    return {
      path: filepath,
      name: path.basename(filepath),
      type: this.detectType(filepath),
      size: stats.size,
      extension: ext,
    };
  }

  /**
   * Extract content from any file
   */
  static async extractContent(filepath: string): Promise<ExtractedContent> {
    const type = this.detectType(filepath);

    switch (type) {
      case 'pdf':
        return this.extractPDF(filepath);
      case 'docx':
        return this.extractDocx(filepath);
      case 'image':
        return this.analyzeImage(filepath);
      case 'csv':
        return this.extractCSV(filepath);
      case 'json':
        return this.extractJSON(filepath);
      case 'yaml':
        return this.extractYAML(filepath);
      case 'code':
      case 'text':
        return this.extractText(filepath);
      default:
        return this.extractText(filepath);
    }
  }

  /**
   * Extract text from PDF
   */
  static async extractPDF(filepath: string): Promise<ExtractedContent> {
    try {
      // Try using pdf-parse via dynamic import or command line
      // Fallback: Use pdftotext if available (poppler-utils)
      try {
        const { stdout } = await execAsync(`pdftotext "${filepath}" -`, { maxBuffer: 10 * 1024 * 1024 });
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
    } catch (error: any) {
      return { text: `[PDF extraction failed: ${error.message}]` };
    }
  }

  /**
   * Extract text from Word document
   */
  static async extractDocx(filepath: string): Promise<ExtractedContent> {
    try {
      // Use mammoth or similar via command line
      // Fallback: Basic XML extraction from .docx (it's a zip file)
      const { stdout } = await execAsync(`unzip -p "${filepath}" word/document.xml 2>/dev/null | sed 's/<[^>]*>//g'`);
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
      } catch (error: any) {
        return { text: `[DOCX extraction failed: ${error.message}]` };
      }
    }
  }

  /**
   * Analyze image using Gemini Vision
   */
  static async analyzeImage(filepath: string, prompt?: string): Promise<ExtractedContent> {
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
      const analysisPrompt = prompt || 'Describe this image in detail. If it contains text, extract it. If it shows code or a UI, describe what you see.';

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
    } catch (error: any) {
      return { text: `[Image analysis failed: ${error.message}]` };
    }
  }

  /**
   * Extract CSV data
   */
  static async extractCSV(filepath: string): Promise<ExtractedContent> {
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim());

      const tables: any[][] = [];
      const headers = lines[0]?.split(',').map(h => h.trim());

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        tables.push(values);
      }

      return {
        text: `CSV with ${lines.length - 1} rows and ${headers?.length || 0} columns:\n` +
              `Headers: ${headers?.join(', ')}\n` +
              `Sample: ${tables[0]?.join(', ')}`,
        tables: [headers || [], ...tables],
        metadata: {
          rows: tables.length,
          columns: headers?.length || 0,
          headers,
        },
      };
    } catch (error: any) {
      return { text: `[CSV extraction failed: ${error.message}]` };
    }
  }

  /**
   * Extract JSON data
   */
  static async extractJSON(filepath: string): Promise<ExtractedContent> {
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      const data = JSON.parse(content);

      const summary = this.summarizeJSON(data);

      return {
        text: summary,
        metadata: {
          type: Array.isArray(data) ? 'array' : 'object',
          length: Array.isArray(data) ? data.length : Object.keys(data).length,
        },
      };
    } catch (error: any) {
      return { text: `[JSON extraction failed: ${error.message}]` };
    }
  }

  private static summarizeJSON(data: any, depth: number = 0): string {
    if (depth > 3) return '...';

    if (Array.isArray(data)) {
      if (data.length === 0) return '[]';
      return `Array[${data.length}] of ${this.summarizeJSON(data[0], depth + 1)}`;
    }

    if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data);
      if (keys.length === 0) return '{}';
      const sample = keys.slice(0, 5).map(k => `${k}: ${typeof data[k]}`).join(', ');
      return `{${sample}${keys.length > 5 ? ', ...' : ''}}`;
    }

    return typeof data;
  }

  /**
   * Extract YAML data
   */
  static async extractYAML(filepath: string): Promise<ExtractedContent> {
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
    } catch (error: any) {
      return { text: `[YAML extraction failed: ${error.message}]` };
    }
  }

  // Shared NativeFileSystem instance for text reading
  private static nativeFs: NativeFileSystem | null = null;

  /**
   * Get or create NativeFileSystem instance
   */
  private static getFileSystem(filepath: string): NativeFileSystem {
    const rootDir = path.dirname(filepath);
    if (!this.nativeFs || this.nativeFs.getRoot() !== rootDir) {
      this.nativeFs = createFileSystem(rootDir, {
        blockedPaths: [] // FileHandlers should read any file
      });
    }
    return this.nativeFs;
  }

  /**
   * Read text file - delegates to NativeFileSystem
   * This is the canonical method for reading text files
   */
  static async readText(filepath: string): Promise<string> {
    const nativeFs = this.getFileSystem(filepath);
    const filename = path.basename(filepath);
    return nativeFs.readFile(filename);
  }

  /**
   * Extract plain text
   * Delegates to NativeFileSystem for consistent file handling
   */
  static async extractText(filepath: string): Promise<ExtractedContent> {
    try {
      // Delegate to NativeFileSystem via readText
      const content = await this.readText(filepath);
      return {
        text: content,
        metadata: {
          lines: content.split('\n').length,
          characters: content.length,
        },
      };
    } catch (error: any) {
      return { text: `[Text extraction failed: ${error.message}]` };
    }
  }

  /**
   * Batch process multiple files
   */
  static async processMultiple(filepaths: string[]): Promise<Map<string, ExtractedContent>> {
    const results = new Map<string, ExtractedContent>();

    for (const filepath of filepaths) {
      console.log(chalk.gray(`Processing: ${path.basename(filepath)}...`));
      const content = await this.extractContent(filepath);
      results.set(filepath, content);
    }

    return results;
  }

  /**
   * Analyze screenshot for debugging
   */
  static async analyzeScreenshot(filepath: string): Promise<{
    description: string;
    errors: string[];
    suggestions: string[];
    uiElements: string[];
  }> {
    const content = await this.analyzeImage(filepath,
      `Analyze this screenshot for debugging purposes. Identify:
1. Any error messages or warnings visible
2. UI elements and their state
3. Any issues or problems you can see
4. Suggestions for fixing any issues

Format your response as:
DESCRIPTION: <what you see>
ERRORS: <list of errors>
UI_ELEMENTS: <list of UI elements>
SUGGESTIONS: <list of suggestions>`
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
      sections.errors = errorsMatch[1].split('\n')
        .map(l => l.replace(/^[-*]\s*/, '').trim())
        .filter(l => l);
    }

    const uiMatch = text.match(/UI_ELEMENTS:\s*(.+?)(?=SUGGESTIONS:|$)/s);
    if (uiMatch) {
      sections.uiElements = uiMatch[1].split('\n')
        .map(l => l.replace(/^[-*]\s*/, '').trim())
        .filter(l => l);
    }

    const suggestMatch = text.match(/SUGGESTIONS:\s*(.+?)$/s);
    if (suggestMatch) {
      sections.suggestions = suggestMatch[1].split('\n')
        .map(l => l.replace(/^[-*]\s*/, '').trim())
        .filter(l => l);
    }

    return sections;
  }
}

export default FileHandlers;

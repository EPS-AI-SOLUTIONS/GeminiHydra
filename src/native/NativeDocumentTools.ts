/**
 * NativeDocumentTools - Document creation and editing tools
 *
 * Provides native implementations for:
 * - Word documents (.docx) via 'docx' + 'mammoth'
 * - Excel spreadsheets (.xlsx) via 'exceljs'
 * - PDF files via 'pdfkit'
 *
 * All tools follow the NativeToolDefinition pattern from NativeSerenaTools.ts
 */

import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import PDFDocument from 'pdfkit';
import { getErrorMessage } from '../core/errors.js';
import type { NativeToolDefinition } from './NativeSerenaTools.js';

// ============================================================
// Operation Types
// ============================================================

/** Represents a single document operation (Word or Excel edit) */
interface DocumentOperation {
  type: string;
  text?: string;
  level?: number;
  index?: number;
  name?: string;
  sheet?: string;
  cell?: string;
  value?: ExcelJS.CellValue;
  start?: string;
  data?: unknown[][] | string;
  row?: number;
  column?: number;
}

// ============================================================
// Helpers
// ============================================================

async function ensureDir(filepath: string): Promise<void> {
  const dir = path.dirname(path.resolve(filepath));
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Allowed base directories for document operations.
 * Restricted to project root, user Documents folder, and temp directory.
 * Does NOT include the entire home directory for security.
 */
function getAllowedBaseDirs(): string[] {
  const dirs = [process.cwd()];

  // Add user Documents folder (more restrictive than entire homedir)
  const documentsDir = path.join(os.homedir(), 'Documents');
  dirs.push(documentsDir);

  // Add Desktop as a common working location
  const desktopDir = path.join(os.homedir(), 'Desktop');
  dirs.push(desktopDir);

  // Add Downloads folder
  const downloadsDir = path.join(os.homedir(), 'Downloads');
  dirs.push(downloadsDir);

  // Add temp directory
  dirs.push(os.tmpdir());

  return dirs;
}

/**
 * Resolve filepath and validate it stays within allowed directories.
 * Prevents path traversal attacks (e.g. ../../etc/passwd).
 *
 * Security layers:
 * 1. Strip null bytes (bypass technique for C-based path functions)
 * 2. Strip control characters (can confuse terminal/logging)
 * 3. Reject raw input containing '..' segments (defense-in-depth)
 * 4. Resolve to absolute path
 * 5. Verify resolved path is within allowed directories
 */
function resolveFilepath(filepath: string): string {
  if (!filepath || typeof filepath !== 'string') {
    throw new Error('Invalid filepath: must be a non-empty string');
  }

  // Layer 1: Remove null bytes which can bypass path checks in native code
  let sanitized = filepath.replace(/\0/g, '');

  // Layer 2: Remove control characters (except common whitespace)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char sanitization
  sanitized = sanitized.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

  // Layer 3: Defense-in-depth - reject paths with '..' traversal sequences
  // This catches attempts even if they would resolve to an allowed dir
  const normalizedForCheck = sanitized.replace(/\\/g, '/');
  if (
    normalizedForCheck.includes('/../') ||
    normalizedForCheck.startsWith('../') ||
    normalizedForCheck.endsWith('/..') ||
    normalizedForCheck === '..'
  ) {
    throw new Error(
      `Path traversal rejected: "${filepath}" contains directory traversal sequences (..)`,
    );
  }

  // Layer 4: Resolve to absolute path
  const resolved = path.resolve(sanitized);

  // Layer 5: Verify resolved path is within allowed directories
  const allowedDirs = getAllowedBaseDirs();
  const isAllowed = allowedDirs.some((baseDir) => {
    const normalizedBase = path.resolve(baseDir) + path.sep;
    const normalizedResolved = resolved + path.sep;
    return normalizedResolved.startsWith(normalizedBase) || resolved === path.resolve(baseDir);
  });

  if (!isAllowed) {
    throw new Error(
      `Path traversal detected: "${filepath}" resolves to "${resolved}" which is outside allowed directories. ` +
        `Allowed base directories: ${allowedDirs.join(', ')}`,
    );
  }

  return resolved;
}

// ============================================================
// Word Document Helpers
// ============================================================

function textToParagraphs(content: string): Paragraph[] {
  const lines = content.split('\n');
  return lines.map((line) => {
    // Detect headings (markdown-style)
    if (line.startsWith('### ')) {
      return new Paragraph({
        text: line.slice(4),
        heading: HeadingLevel.HEADING_3,
      });
    }
    if (line.startsWith('## ')) {
      return new Paragraph({
        text: line.slice(3),
        heading: HeadingLevel.HEADING_2,
      });
    }
    if (line.startsWith('# ')) {
      return new Paragraph({
        text: line.slice(2),
        heading: HeadingLevel.HEADING_1,
      });
    }
    // Empty line = empty paragraph
    if (line.trim() === '') {
      return new Paragraph({ text: '' });
    }
    // Regular paragraph
    return new Paragraph({
      children: [new TextRun(line)],
    });
  });
}

// ============================================================
// Excel Helpers
// ============================================================

function parseExcelContent(content: string): unknown[][] {
  // Try JSON first
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.every((row) => Array.isArray(row))) {
      return parsed;
    }
    // If it's an object with sheet names, return first sheet
    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
      const firstKey = Object.keys(parsed)[0];
      if (firstKey && Array.isArray(parsed[firstKey])) {
        return parsed[firstKey];
      }
    }
  } catch {
    // Not JSON, try CSV-like parsing
  }

  // Parse as CSV-like string
  const lines = content.trim().split('\n');
  return lines.map((line) => {
    // Handle quoted fields
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    fields.push(current.trim());

    // Convert numeric strings to numbers
    return fields.map((f) => {
      const num = Number(f);
      return !Number.isNaN(num) && f !== '' ? num : f;
    });
  });
}

// ============================================================
// Tool Definitions
// ============================================================

export function createDocumentToolDefinitions(): NativeToolDefinition[] {
  return [
    // ========================================================
    // Word: Create
    // ========================================================
    {
      name: 'create_word_document',
      description:
        'Create a new Microsoft Word (.docx) document with text content. Supports markdown-style headings (# H1, ## H2, ### H3).',
      inputSchema: {
        type: 'object',
        properties: {
          filepath: {
            type: 'string',
            description: 'Absolute path where to save the .docx file',
          },
          content: {
            type: 'string',
            description:
              'Text content for the document. Lines starting with # are headings. Newlines separate paragraphs.',
          },
        },
        required: ['filepath', 'content'],
      },
      handler: async (params) => {
        try {
          if (!params.filepath || typeof params.filepath !== 'string') {
            return {
              success: false,
              error: 'Missing or invalid "filepath" parameter (expected a non-empty string).',
            };
          }
          if (!params.content || typeof params.content !== 'string') {
            return {
              success: false,
              error: 'Missing or invalid "content" parameter (expected a non-empty string).',
            };
          }

          const filepath = resolveFilepath(params.filepath);
          await ensureDir(filepath);

          const paragraphs = textToParagraphs(params.content);
          const doc = new Document({
            sections: [
              {
                properties: {},
                children: paragraphs,
              },
            ],
          });

          const buffer = await Packer.toBuffer(doc);
          await fs.writeFile(filepath, buffer);

          return {
            success: true,
            filepath,
            message: `Word document created: ${filepath}`,
          };
        } catch (error: unknown) {
          const safeMessage = getErrorMessage(error);
          return { success: false, error: `Failed to create Word document: ${safeMessage}` };
        }
      },
    },

    // ========================================================
    // Word: Edit
    // ========================================================
    {
      name: 'edit_word_document',
      description:
        'Edit an existing Word document using operations: add_paragraph, add_heading, edit_paragraph, delete_paragraph. Reads existing content, applies operations, and writes a new document.',
      inputSchema: {
        type: 'object',
        properties: {
          filepath: {
            type: 'string',
            description: 'Path to the Word document to edit',
          },
          operations: {
            type: 'array',
            description:
              'List of operations. Each: {type: "add_paragraph"|"add_heading"|"edit_paragraph"|"delete_paragraph", text?: string, level?: number, index?: number}',
          },
        },
        required: ['filepath', 'operations'],
      },
      handler: async (params) => {
        try {
          if (!params.filepath || typeof params.filepath !== 'string') {
            return {
              success: false,
              error: 'Missing or invalid "filepath" parameter (expected a non-empty string).',
            };
          }
          if (!params.operations) {
            return { success: false, error: 'Missing "operations" parameter.' };
          }

          const filepath = resolveFilepath(params.filepath);

          // Read existing document content using mammoth
          const fileBuffer = await fs.readFile(filepath);
          const { value: existingText } = await mammoth.extractRawText({ buffer: fileBuffer });

          // Split into paragraphs
          const paragraphs = existingText.split('\n').filter((line: string) => line.trim() !== '');

          // Apply operations - safely parse JSON if needed
          let ops: DocumentOperation[];
          if (Array.isArray(params.operations)) {
            ops = params.operations as DocumentOperation[];
          } else if (typeof params.operations === 'string') {
            try {
              ops = JSON.parse(params.operations as string);
            } catch (parseErr: unknown) {
              return {
                success: false,
                error: `Invalid JSON in "operations" parameter: ${getErrorMessage(parseErr)}. Expected a JSON array of operations.`,
              };
            }
            if (!Array.isArray(ops)) {
              return {
                success: false,
                error: 'The "operations" parameter must be a JSON array, not a single object.',
              };
            }
          } else {
            return {
              success: false,
              error:
                'The "operations" parameter must be an array or a JSON string representing an array.',
            };
          }

          for (const op of ops) {
            switch (op.type) {
              case 'add_paragraph':
                paragraphs.push(op.text || '');
                break;
              case 'add_heading':
                paragraphs.push(`${'#'.repeat(op.level || 1)} ${op.text || ''}`);
                break;
              case 'edit_paragraph':
                if (op.index !== undefined && op.index < paragraphs.length) {
                  paragraphs[op.index] = op.text || '';
                }
                break;
              case 'delete_paragraph':
                if (op.index !== undefined && op.index < paragraphs.length) {
                  paragraphs.splice(op.index, 1);
                }
                break;
            }
          }

          // Rebuild document
          const docParagraphs = textToParagraphs(paragraphs.join('\n'));
          const doc = new Document({
            sections: [
              {
                properties: {},
                children: docParagraphs,
              },
            ],
          });

          const buffer = await Packer.toBuffer(doc);
          await fs.writeFile(filepath, buffer);

          return {
            success: true,
            filepath,
            message: `Word document edited: ${filepath} (${ops.length} operations applied)`,
          };
        } catch (error: unknown) {
          const safeMessage = getErrorMessage(error);
          return { success: false, error: `Failed to edit Word document: ${safeMessage}` };
        }
      },
    },

    // ========================================================
    // Word: Convert TXT → Word
    // ========================================================
    {
      name: 'convert_txt_to_word',
      description: 'Convert a plain text file (.txt) to a Word (.docx) document.',
      inputSchema: {
        type: 'object',
        properties: {
          source_path: {
            type: 'string',
            description: 'Path to the source .txt file',
          },
          target_path: {
            type: 'string',
            description: 'Path where to save the .docx file',
          },
        },
        required: ['source_path', 'target_path'],
      },
      handler: async (params) => {
        try {
          if (!params.source_path || typeof params.source_path !== 'string') {
            return {
              success: false,
              error: 'Missing or invalid "source_path" parameter (expected a non-empty string).',
            };
          }
          if (!params.target_path || typeof params.target_path !== 'string') {
            return {
              success: false,
              error: 'Missing or invalid "target_path" parameter (expected a non-empty string).',
            };
          }

          const sourcePath = resolveFilepath(params.source_path);
          const targetPath = resolveFilepath(params.target_path);
          await ensureDir(targetPath);

          const content = await fs.readFile(sourcePath, 'utf-8');
          const paragraphs = textToParagraphs(content);

          const doc = new Document({
            sections: [
              {
                properties: {},
                children: paragraphs,
              },
            ],
          });

          const buffer = await Packer.toBuffer(doc);
          await fs.writeFile(targetPath, buffer);

          return {
            success: true,
            filepath: targetPath,
            message: `Converted text file to Word document`,
          };
        } catch (error: unknown) {
          const safeMessage = getErrorMessage(error);
          return { success: false, error: `Failed to convert TXT to Word: ${safeMessage}` };
        }
      },
    },

    // ========================================================
    // Excel: Create
    // ========================================================
    {
      name: 'create_excel_file',
      description:
        'Create a new Excel (.xlsx) file. Content can be a JSON 2D array (e.g., [["Name","Age"],["Alice",30]]) or CSV-like text.',
      inputSchema: {
        type: 'object',
        properties: {
          filepath: {
            type: 'string',
            description: 'Path where to save the .xlsx file',
          },
          content: {
            type: 'string',
            description: 'Data content: JSON 2D array string or CSV-like text',
          },
        },
        required: ['filepath', 'content'],
      },
      handler: async (params) => {
        try {
          if (!params.filepath || typeof params.filepath !== 'string') {
            return {
              success: false,
              error: 'Missing or invalid "filepath" parameter (expected a non-empty string).',
            };
          }
          if (!params.content || typeof params.content !== 'string') {
            return {
              success: false,
              error: 'Missing or invalid "content" parameter (expected a non-empty string).',
            };
          }

          const filepath = resolveFilepath(params.filepath);
          await ensureDir(filepath);

          const data = parseExcelContent(params.content);
          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet('Sheet1');

          for (const row of data) {
            worksheet.addRow(row);
          }

          // Auto-width columns
          worksheet.columns.forEach((column: Partial<ExcelJS.Column>) => {
            let maxLength = 10;
            (column as ExcelJS.Column).eachCell?.({ includeEmpty: false }, (cell: ExcelJS.Cell) => {
              const len = String(cell.value || '').length;
              if (len > maxLength) maxLength = len;
            });
            column.width = Math.min(maxLength + 2, 50);
          });

          await workbook.xlsx.writeFile(filepath);

          return {
            success: true,
            filepath,
            message: `Excel file created: ${filepath} (${data.length} rows)`,
          };
        } catch (error: unknown) {
          const safeMessage = getErrorMessage(error);
          return { success: false, error: `Failed to create Excel file: ${safeMessage}` };
        }
      },
    },

    // ========================================================
    // Excel: Edit
    // ========================================================
    {
      name: 'edit_excel_file',
      description:
        'Edit an existing Excel file. Operations: update_cell, update_range, delete_row, delete_column, add_sheet, delete_sheet.',
      inputSchema: {
        type: 'object',
        properties: {
          filepath: {
            type: 'string',
            description: 'Path to the Excel file',
          },
          operations: {
            type: 'array',
            description:
              'List of operations: {type: "update_cell", sheet?: string, cell: "A1", value: "..."} | {type: "update_range", sheet?: string, start: "A1", data: [[...]]} | {type: "delete_row", sheet?: string, row: 1} | {type: "delete_column", sheet?: string, column: 1} | {type: "add_sheet", name: "Sheet2"} | {type: "delete_sheet", name: "Sheet2"}',
          },
        },
        required: ['filepath', 'operations'],
      },
      handler: async (params) => {
        try {
          if (!params.filepath || typeof params.filepath !== 'string') {
            return {
              success: false,
              error: 'Missing or invalid "filepath" parameter (expected a non-empty string).',
            };
          }
          if (!params.operations) {
            return { success: false, error: 'Missing "operations" parameter.' };
          }

          const filepath = resolveFilepath(params.filepath);
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.readFile(filepath);

          // Safely parse operations JSON if needed
          let ops: DocumentOperation[];
          if (Array.isArray(params.operations)) {
            ops = params.operations as DocumentOperation[];
          } else if (typeof params.operations === 'string') {
            try {
              ops = JSON.parse(params.operations as string);
            } catch (parseErr: unknown) {
              return {
                success: false,
                error: `Invalid JSON in "operations" parameter: ${getErrorMessage(parseErr)}. Expected a JSON array of operations.`,
              };
            }
            if (!Array.isArray(ops)) {
              return {
                success: false,
                error: 'The "operations" parameter must be a JSON array, not a single object.',
              };
            }
          } else {
            return {
              success: false,
              error:
                'The "operations" parameter must be an array or a JSON string representing an array.',
            };
          }

          for (const op of ops) {
            const sheetName = op.sheet || 'Sheet1';

            switch (op.type) {
              case 'update_cell': {
                const ws = workbook.getWorksheet(sheetName);
                if (!ws) {
                  return {
                    success: false,
                    error: `Sheet not found: "${sheetName}". Available sheets can be listed by reading the file.`,
                  };
                }
                ws.getCell(op.cell as string).value = op.value as ExcelJS.CellValue;
                break;
              }
              case 'update_range': {
                const ws = workbook.getWorksheet(sheetName);
                if (!ws) {
                  return { success: false, error: `Sheet not found: "${sheetName}".` };
                }
                let data: unknown[][];
                if (Array.isArray(op.data)) {
                  data = op.data;
                } else if (typeof op.data === 'string') {
                  try {
                    data = JSON.parse(op.data);
                  } catch (parseErr: unknown) {
                    return {
                      success: false,
                      error: `Invalid JSON in "data" field of update_range operation: ${getErrorMessage(parseErr)}. Expected a 2D array.`,
                    };
                  }
                  if (!Array.isArray(data)) {
                    return {
                      success: false,
                      error: 'The "data" field in update_range must be a 2D array.',
                    };
                  }
                } else {
                  return {
                    success: false,
                    error:
                      'The "data" field in update_range must be an array or a JSON string representing a 2D array.',
                  };
                }
                const startCell = ws.getCell(op.start as string);
                const startRow = startCell.row;
                const startCol = startCell.col;

                for (let r = 0; r < data.length; r++) {
                  for (let c = 0; c < data[r].length; c++) {
                    ws.getCell(startRow + r, startCol + c).value = data[r][c] as ExcelJS.CellValue;
                  }
                }
                break;
              }
              case 'delete_row': {
                const ws = workbook.getWorksheet(sheetName);
                if (!ws) {
                  return { success: false, error: `Sheet not found: "${sheetName}".` };
                }
                ws.spliceRows(op.row as number, 1);
                break;
              }
              case 'delete_column': {
                const ws = workbook.getWorksheet(sheetName);
                if (!ws) {
                  return { success: false, error: `Sheet not found: "${sheetName}".` };
                }
                ws.spliceColumns(op.column as number, 1);
                break;
              }
              case 'add_sheet': {
                workbook.addWorksheet(op.name as string);
                break;
              }
              case 'delete_sheet': {
                const ws = workbook.getWorksheet(op.name as string);
                if (ws) workbook.removeWorksheet(ws.id);
                break;
              }
              default: {
                return {
                  success: false,
                  error: `Unknown operation type: "${op.type}". Supported: update_cell, update_range, delete_row, delete_column, add_sheet, delete_sheet.`,
                };
              }
            }
          }

          await workbook.xlsx.writeFile(filepath);

          return {
            success: true,
            filepath,
            message: `Excel file edited: ${filepath} (${ops.length} operations applied)`,
          };
        } catch (error: unknown) {
          const safeMessage = getErrorMessage(error);
          return { success: false, error: `Failed to edit Excel file: ${safeMessage}` };
        }
      },
    },

    // ========================================================
    // Excel: Convert CSV → Excel
    // ========================================================
    {
      name: 'convert_csv_to_excel',
      description: 'Convert a CSV file to an Excel (.xlsx) file.',
      inputSchema: {
        type: 'object',
        properties: {
          source_path: {
            type: 'string',
            description: 'Path to the source .csv file',
          },
          target_path: {
            type: 'string',
            description: 'Path where to save the .xlsx file',
          },
        },
        required: ['source_path', 'target_path'],
      },
      handler: async (params) => {
        try {
          if (!params.source_path || typeof params.source_path !== 'string') {
            return {
              success: false,
              error: 'Missing or invalid "source_path" parameter (expected a non-empty string).',
            };
          }
          if (!params.target_path || typeof params.target_path !== 'string') {
            return {
              success: false,
              error: 'Missing or invalid "target_path" parameter (expected a non-empty string).',
            };
          }

          const sourcePath = resolveFilepath(params.source_path);
          const targetPath = resolveFilepath(params.target_path);
          await ensureDir(targetPath);

          const csvContent = await fs.readFile(sourcePath, 'utf-8');
          const data = parseExcelContent(csvContent);

          const workbook = new ExcelJS.Workbook();
          const worksheet = workbook.addWorksheet('Sheet1');

          for (const row of data) {
            worksheet.addRow(row);
          }

          // Auto-width columns
          worksheet.columns.forEach((column: Partial<ExcelJS.Column>) => {
            let maxLength = 10;
            (column as ExcelJS.Column).eachCell?.({ includeEmpty: false }, (cell: ExcelJS.Cell) => {
              const len = String(cell.value || '').length;
              if (len > maxLength) maxLength = len;
            });
            column.width = Math.min(maxLength + 2, 50);
          });

          await workbook.xlsx.writeFile(targetPath);

          return {
            success: true,
            filepath: targetPath,
            message: `Converted CSV to Excel file (${data.length} rows)`,
          };
        } catch (error: unknown) {
          const safeMessage = getErrorMessage(error);
          return { success: false, error: `Failed to convert CSV to Excel: ${safeMessage}` };
        }
      },
    },

    // ========================================================
    // PDF: Create
    // ========================================================
    {
      name: 'create_pdf_file',
      description: 'Create a new PDF file with text content.',
      inputSchema: {
        type: 'object',
        properties: {
          filepath: {
            type: 'string',
            description: 'Path where to save the PDF file',
          },
          content: {
            type: 'string',
            description: 'Text content for the PDF',
          },
        },
        required: ['filepath', 'content'],
      },
      handler: async (params) => {
        try {
          if (!params.filepath || typeof params.filepath !== 'string') {
            return {
              success: false,
              error: 'Missing or invalid "filepath" parameter (expected a non-empty string).',
            };
          }
          if (!params.content || typeof params.content !== 'string') {
            return {
              success: false,
              error: 'Missing or invalid "content" parameter (expected a non-empty string).',
            };
          }

          const filepath = resolveFilepath(params.filepath);
          await ensureDir(filepath);

          const contentStr = params.content as string;
          return await new Promise((resolve) => {
            try {
              const doc = new PDFDocument({
                margin: 50,
                size: 'A4',
              });

              const stream = createWriteStream(filepath);
              doc.pipe(stream);

              // Process content line by line
              const lines = contentStr.split('\n');
              for (const line of lines) {
                if (line.startsWith('### ')) {
                  doc.fontSize(14).font('Helvetica-Bold').text(line.slice(4), { align: 'left' });
                  doc.moveDown(0.5);
                } else if (line.startsWith('## ')) {
                  doc.fontSize(18).font('Helvetica-Bold').text(line.slice(3), { align: 'left' });
                  doc.moveDown(0.5);
                } else if (line.startsWith('# ')) {
                  doc.fontSize(24).font('Helvetica-Bold').text(line.slice(2), { align: 'left' });
                  doc.moveDown(0.5);
                } else if (line.trim() === '') {
                  doc.moveDown(1);
                } else {
                  doc.fontSize(12).font('Helvetica').text(line, { align: 'left' });
                }
              }

              doc.end();

              stream.on('finish', () => {
                resolve({
                  success: true,
                  filepath,
                  message: `PDF created: ${filepath}`,
                });
              });
              stream.on('error', (err: Error) => {
                resolve({
                  success: false,
                  error: `Failed to write PDF stream: ${err.message}`,
                });
              });
            } catch (innerErr: unknown) {
              resolve({
                success: false,
                error: `Failed to generate PDF content: ${getErrorMessage(innerErr)}`,
              });
            }
          });
        } catch (error: unknown) {
          const safeMessage = getErrorMessage(error);
          return { success: false, error: `Failed to create PDF file: ${safeMessage}` };
        }
      },
    },
  ];
}

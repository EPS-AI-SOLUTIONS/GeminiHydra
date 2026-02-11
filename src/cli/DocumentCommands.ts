/**
 * DocumentCommands - CLI commands for document creation and editing
 *
 * Provides /doc command with subcommands:
 * - /doc word <path> <content>     - Create Word document
 * - /doc edit-word <path> <ops>    - Edit Word document
 * - /doc txt2word <src> <dst>      - Convert TXT to Word
 * - /doc excel <path> <content>    - Create Excel file
 * - /doc edit-excel <path> <ops>   - Edit Excel file
 * - /doc csv2excel <src> <dst>     - Convert CSV to Excel
 * - /doc pdf <path> <content>      - Create PDF file
 */

import chalk from 'chalk';
import { getNativeToolsServer } from '../mcp/NativeToolsServer.js';
import { box } from './CommandHelpers.js';
import { type CommandResult, commandRegistry, error, success } from './CommandRegistry.js';

// ============================================================
// Helper
// ============================================================

async function callDocTool(
  toolName: string,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const server = getNativeToolsServer();

  if (!server.isInitialized()) {
    await server.init();
  }

  const result = await server.callTool(toolName, params);

  if (result.success) {
    const data = result.content as Record<string, unknown>;
    return success(data, (data?.message as string) || `Tool ${toolName} completed`);
  } else {
    return error(result.error || `Tool ${toolName} failed`);
  }
}

// ============================================================
// Document Command Handlers
// ============================================================

export const documentCommands = {
  async createWord(args: string[]): Promise<CommandResult> {
    const [filepath, ...contentParts] = args;
    if (!filepath) return error('Usage: /doc word <filepath> <content>');
    const content = contentParts.join(' ');
    if (!content) return error('Content is required. Usage: /doc word <filepath> <content>');

    return callDocTool('create_word_document', { filepath, content });
  },

  async editWord(args: string[]): Promise<CommandResult> {
    const [filepath, ...opsParts] = args;
    if (!filepath) return error('Usage: /doc edit-word <filepath> <operations-json>');
    const opsJson = opsParts.join(' ');
    if (!opsJson) return error('Operations JSON is required');

    try {
      const operations = JSON.parse(opsJson);
      return callDocTool('edit_word_document', { filepath, operations });
    } catch {
      return error(
        'Invalid JSON for operations. Example: [{"type":"add_paragraph","text":"Hello"}]',
      );
    }
  },

  async txt2word(args: string[]): Promise<CommandResult> {
    const [source_path, target_path] = args;
    if (!source_path || !target_path)
      return error('Usage: /doc txt2word <source.txt> <target.docx>');

    return callDocTool('convert_txt_to_word', { source_path, target_path });
  },

  async createExcel(args: string[]): Promise<CommandResult> {
    const [filepath, ...contentParts] = args;
    if (!filepath) return error('Usage: /doc excel <filepath> <content>');
    const content = contentParts.join(' ');
    if (!content)
      return error(
        'Content is required (JSON array or CSV). Usage: /doc excel <filepath> <content>',
      );

    return callDocTool('create_excel_file', { filepath, content });
  },

  async editExcel(args: string[]): Promise<CommandResult> {
    const [filepath, ...opsParts] = args;
    if (!filepath) return error('Usage: /doc edit-excel <filepath> <operations-json>');
    const opsJson = opsParts.join(' ');
    if (!opsJson) return error('Operations JSON is required');

    try {
      const operations = JSON.parse(opsJson);
      return callDocTool('edit_excel_file', { filepath, operations });
    } catch {
      return error(
        'Invalid JSON for operations. Example: [{"type":"update_cell","cell":"A1","value":"Hello"}]',
      );
    }
  },

  async csv2excel(args: string[]): Promise<CommandResult> {
    const [source_path, target_path] = args;
    if (!source_path || !target_path)
      return error('Usage: /doc csv2excel <source.csv> <target.xlsx>');

    return callDocTool('convert_csv_to_excel', { source_path, target_path });
  },

  async createPdf(args: string[]): Promise<CommandResult> {
    const [filepath, ...contentParts] = args;
    if (!filepath) return error('Usage: /doc pdf <filepath> <content>');
    const content = contentParts.join(' ');
    if (!content) return error('Content is required. Usage: /doc pdf <filepath> <content>');

    return callDocTool('create_pdf_file', { filepath, content });
  },
};

// ============================================================
// Help Display
// ============================================================

function showDocHelp(): CommandResult {
  return success(
    box(
      `${chalk.cyan('Word Documents')}\n` +
        `  /doc word <path> <content>        Create Word document\n` +
        `  /doc edit-word <path> <ops-json>   Edit Word document\n` +
        `  /doc txt2word <src> <dst>          Convert TXT to Word\n\n` +
        `${chalk.cyan('Excel Spreadsheets')}\n` +
        `  /doc excel <path> <content>        Create Excel file\n` +
        `  /doc edit-excel <path> <ops-json>  Edit Excel file\n` +
        `  /doc csv2excel <src> <dst>         Convert CSV to Excel\n\n` +
        `${chalk.cyan('PDF Documents')}\n` +
        `  /doc pdf <path> <content>          Create PDF file\n\n` +
        `${chalk.gray('Content format: text with \\n for newlines, # for headings')}\n` +
        `${chalk.gray('Excel content: JSON 2D array or CSV text')}\n` +
        `${chalk.gray('Edit operations: JSON array of operation objects')}`,
      'Document Operations (/doc)',
    ),
  );
}

// ============================================================
// Registration
// ============================================================

export function registerDocumentCommands(): void {
  commandRegistry.register({
    name: 'doc',
    aliases: ['document'],
    description: 'Document operations (Word, Excel, PDF)',
    usage: '/doc <word|edit-word|txt2word|excel|edit-excel|csv2excel|pdf> [args]',
    handler: async (ctx) => {
      const [subcommand, ...args] = ctx.args;

      switch (subcommand) {
        case 'word':
        case 'create-word':
          return documentCommands.createWord(args);
        case 'edit-word':
          return documentCommands.editWord(args);
        case 'txt2word':
          return documentCommands.txt2word(args);
        case 'excel':
        case 'create-excel':
          return documentCommands.createExcel(args);
        case 'edit-excel':
          return documentCommands.editExcel(args);
        case 'csv2excel':
          return documentCommands.csv2excel(args);
        case 'pdf':
        case 'create-pdf':
          return documentCommands.createPdf(args);
        default:
          return showDocHelp();
      }
    },
  });

  console.log(chalk.gray('[CLI] Document commands registered (/doc)'));
}

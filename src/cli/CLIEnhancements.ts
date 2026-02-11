/**
 * CLI Enhancements - UX improvements
 * Features #31, #32, #33, #34, #35, #36, #37, #38, #39
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import chalk from 'chalk';

import { GEMINIHYDRA_DIR } from '../config/paths.config.js';

// ============================================================
// Feature #31: Progress Bar
// ============================================================

export interface ProgressBarOptions {
  total: number;
  width?: number;
  format?: string;
  showETA?: boolean;
}

export class ProgressBar {
  private current = 0;
  private total: number;
  private width: number;
  private startTime: number;
  private format: string;
  private showETA: boolean;

  constructor(options: ProgressBarOptions) {
    this.total = options.total;
    this.width = options.width || 40;
    this.format = options.format || '[:bar] :percent :eta';
    this.showETA = options.showETA ?? true;
    this.startTime = Date.now();
  }

  update(value: number, tokens: Record<string, string> = {}): void {
    this.current = Math.min(value, this.total);
    this.render(tokens);
  }

  increment(tokens: Record<string, string> = {}): void {
    this.update(this.current + 1, tokens);
  }

  private render(tokens: Record<string, string>): void {
    const percent = Math.floor((this.current / this.total) * 100);
    const filled = Math.floor((this.current / this.total) * this.width);
    const empty = this.width - filled;

    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));

    // Calculate ETA
    let eta = '';
    if (this.showETA && this.current > 0) {
      const elapsed = (Date.now() - this.startTime) / 1000;
      const rate = this.current / elapsed;
      const remaining = (this.total - this.current) / rate;

      if (remaining < 60) {
        eta = `${Math.ceil(remaining)}s`;
      } else {
        eta = `${Math.floor(remaining / 60)}m ${Math.ceil(remaining % 60)}s`;
      }
    }

    let output = this.format
      .replace(':bar', bar)
      .replace(':percent', `${percent}%`.padStart(4))
      .replace(':current', String(this.current))
      .replace(':total', String(this.total))
      .replace(':eta', eta ? `ETA: ${eta}` : '');

    // Apply custom tokens
    for (const [key, value] of Object.entries(tokens)) {
      output = output.replace(`:${key}`, value);
    }

    // Clear line and write
    process.stdout.write(`\r${output}`);

    if (this.current >= this.total) {
      console.log(''); // New line at end
    }
  }

  complete(): void {
    this.update(this.total);
  }
}

// ============================================================
// Feature #32: Interactive Task Editor
// ============================================================

export interface EditableTask {
  id: number;
  objective: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export class TaskEditor {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  async edit(task: EditableTask): Promise<EditableTask | null> {
    console.log(chalk.cyan(`\n═══ Editing Task #${task.id} ═══\n`));
    console.log(chalk.gray(`Current: ${task.objective}\n`));

    return new Promise((resolve) => {
      this.rl.question(
        chalk.yellow('New objective (or Enter to keep, "cancel" to abort): '),
        (answer) => {
          if (answer.toLowerCase() === 'cancel') {
            console.log(chalk.gray('Edit cancelled'));
            resolve(null);
          } else if (answer.trim() === '') {
            console.log(chalk.gray('Kept original'));
            resolve(task);
          } else {
            task.objective = answer.trim();
            console.log(chalk.green('Task updated'));
            resolve(task);
          }
        },
      );
    });
  }

  close(): void {
    this.rl.close();
  }
}

// ============================================================
// Feature #33: Task Templates
// ============================================================

const TEMPLATES_DIR = path.join(GEMINIHYDRA_DIR, 'templates');

export interface TaskTemplate {
  name: string;
  description: string;
  objective: string;
  variables?: string[];
}

const BUILT_IN_TEMPLATES: TaskTemplate[] = [
  {
    name: 'review-pr',
    description: 'Review a pull request',
    objective:
      'Review the pull request at {{url}}. Check for bugs, code style, and suggest improvements.',
    variables: ['url'],
  },
  {
    name: 'refactor',
    description: 'Refactor code',
    objective:
      'Refactor {{file}} to improve readability and performance. Keep the same functionality.',
    variables: ['file'],
  },
  {
    name: 'test',
    description: 'Generate tests',
    objective: 'Write comprehensive unit tests for {{file}}. Cover edge cases and error handling.',
    variables: ['file'],
  },
  {
    name: 'document',
    description: 'Generate documentation',
    objective:
      'Write documentation for {{file}} including function descriptions and usage examples.',
    variables: ['file'],
  },
  {
    name: 'optimize',
    description: 'Optimize performance',
    objective: 'Analyze {{file}} for performance issues and optimize where possible.',
    variables: ['file'],
  },
  {
    name: 'security',
    description: 'Security audit',
    objective:
      'Perform a security audit on {{file}}. Look for vulnerabilities like injection, XSS, etc.',
    variables: ['file'],
  },
];

export class TemplateManager {
  private templates: Map<string, TaskTemplate> = new Map();

  constructor() {
    // Load built-in templates
    for (const t of BUILT_IN_TEMPLATES) {
      this.templates.set(t.name, t);
    }
  }

  async loadCustomTemplates(): Promise<void> {
    try {
      await fs.mkdir(TEMPLATES_DIR, { recursive: true });
      const files = await fs.readdir(TEMPLATES_DIR);

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(TEMPLATES_DIR, file), 'utf-8');
            const template = JSON.parse(content) as TaskTemplate;
            this.templates.set(template.name, template);
          } catch (_e) {
            // Skip invalid templates
          }
        }
      }
    } catch (_e) {
      // Templates dir doesn't exist, that's fine
    }
  }

  get(name: string): TaskTemplate | undefined {
    return this.templates.get(name);
  }

  getAll(): TaskTemplate[] {
    return Array.from(this.templates.values());
  }

  async save(template: TaskTemplate): Promise<void> {
    await fs.mkdir(TEMPLATES_DIR, { recursive: true });
    await fs.writeFile(
      path.join(TEMPLATES_DIR, `${template.name}.json`),
      JSON.stringify(template, null, 2),
    );
    this.templates.set(template.name, template);
  }

  apply(templateName: string, variables: Record<string, string>): string | null {
    const template = this.templates.get(templateName);
    if (!template) return null;

    let objective = template.objective;
    for (const [key, value] of Object.entries(variables)) {
      objective = objective.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    return objective;
  }

  printList(): void {
    console.log(chalk.cyan('\n═══ Available Templates ═══\n'));
    for (const template of this.templates.values()) {
      console.log(chalk.white(`  /template ${template.name}`));
      console.log(chalk.gray(`    ${template.description}`));
      if (template.variables?.length) {
        console.log(chalk.gray(`    Variables: ${template.variables.join(', ')}`));
      }
    }
    console.log('');
  }
}

export const templateManager = new TemplateManager();

// ============================================================
// Feature #34: Output Formats
// ============================================================

export type OutputFormat = 'text' | 'json' | 'markdown' | 'html';

export class OutputFormatter {
  format(content: string, format: OutputFormat): string {
    switch (format) {
      case 'json':
        return this.toJSON(content);
      case 'markdown':
        return this.toMarkdown(content);
      case 'html':
        return this.toHTML(content);
      default:
        return content;
    }
  }

  private toJSON(content: string): string {
    return JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        content: content,
        format: 'text',
      },
      null,
      2,
    );
  }

  private toMarkdown(content: string): string {
    return `# GeminiHydra Output

Generated: ${new Date().toISOString()}

---

${content}

---
*Generated by GeminiHydra CLI v14.0*
`;
  }

  private toHTML(content: string): string {
    const escapedContent = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    return `<!DOCTYPE html>
<html>
<head>
  <title>GeminiHydra Output</title>
  <style>
    body { font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    .timestamp { color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>GeminiHydra Output</h1>
  <p class="timestamp">Generated: ${new Date().toISOString()}</p>
  <hr>
  <div class="content">
    <pre>${escapedContent}</pre>
  </div>
  <hr>
  <p><em>Generated by GeminiHydra CLI v14.0</em></p>
</body>
</html>`;
  }

  async saveToFile(content: string, format: OutputFormat, filename?: string): Promise<string> {
    const ext = format === 'text' ? 'txt' : format;
    const defaultName = `geminihydra-output-${Date.now()}.${ext}`;
    const filepath = filename || path.join(os.tmpdir(), defaultName);

    const formatted = this.format(content, format);
    await fs.writeFile(filepath, formatted);

    return filepath;
  }
}

export const outputFormatter = new OutputFormatter();

// ============================================================
// Feature #35: Syntax Highlighting (simple version)
// ============================================================

const SYNTAX_COLORS: Record<string, (s: string) => string> = {
  keyword: chalk.magenta,
  string: chalk.green,
  number: chalk.yellow,
  comment: chalk.gray,
  function: chalk.cyan,
  operator: chalk.white,
};

export function highlightCode(code: string, _language: string = 'javascript'): string {
  let highlighted = code;

  // Keywords
  const keywords =
    /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|try|catch|throw|new|this)\b/g;
  highlighted = highlighted.replace(keywords, SYNTAX_COLORS.keyword('$1'));

  // Strings
  highlighted = highlighted.replace(
    /(["'`])((?:\\\1|(?!\1).)*)(\1)/g,
    SYNTAX_COLORS.string('$1$2$3'),
  );

  // Numbers
  highlighted = highlighted.replace(/\b(\d+\.?\d*)\b/g, SYNTAX_COLORS.number('$1'));

  // Comments
  highlighted = highlighted.replace(/(\/\/.*$)/gm, SYNTAX_COLORS.comment('$1'));
  highlighted = highlighted.replace(/(\/\*[\s\S]*?\*\/)/g, SYNTAX_COLORS.comment('$1'));

  return highlighted;
}

// ============================================================
// Feature #36: Autocomplete
// ============================================================

export interface AutocompleteOptions {
  commands: string[];
  agents: string[];
  tools: string[];
}

export function createCompleter(options: AutocompleteOptions) {
  const allCompletions = [
    ...options.commands.map((c) => `/${c}`),
    ...options.agents.map((a) => `@${a}`),
    ...options.tools.map((t) => `mcp:${t}`),
    'exit',
    'quit',
    '/help',
    '/status',
    '/queue',
    '/history',
    '/clear',
  ];

  return (line: string): [string[], string] => {
    const completions = allCompletions.filter((c) =>
      c.toLowerCase().startsWith(line.toLowerCase()),
    );
    return [completions, line];
  };
}

// ============================================================
// Feature #37: Command History Search
// ============================================================

export class HistorySearch {
  private history: string[] = [];
  private searchIndex = -1;
  private searchTerm = '';

  add(command: string): void {
    if (command.trim() && command !== this.history[this.history.length - 1]) {
      this.history.push(command);
    }
  }

  search(term: string): string | null {
    if (term !== this.searchTerm) {
      this.searchTerm = term;
      this.searchIndex = this.history.length;
    }

    for (let i = this.searchIndex - 1; i >= 0; i--) {
      if (this.history[i].toLowerCase().includes(term.toLowerCase())) {
        this.searchIndex = i;
        return this.history[i];
      }
    }

    return null;
  }

  searchNext(): string | null {
    return this.search(this.searchTerm);
  }

  reset(): void {
    this.searchIndex = this.history.length;
    this.searchTerm = '';
  }

  getHistory(): string[] {
    return [...this.history];
  }

  async save(filepath: string): Promise<void> {
    await fs.writeFile(filepath, this.history.join('\n'));
  }

  async load(filepath: string): Promise<void> {
    try {
      const content = await fs.readFile(filepath, 'utf-8');
      this.history = content.split('\n').filter(Boolean);
    } catch {
      // No history file
    }
  }
}

export const historySearch = new HistorySearch();

// ============================================================
// Feature #38: Split Output (Pagination)
// ============================================================

export class OutputPaginator {
  private pageSize: number;

  constructor(pageSize: number = 30) {
    this.pageSize = pageSize;
  }

  paginate(content: string): string[] {
    const lines = content.split('\n');
    const pages: string[] = [];

    for (let i = 0; i < lines.length; i += this.pageSize) {
      pages.push(lines.slice(i, i + this.pageSize).join('\n'));
    }

    return pages;
  }

  async display(content: string): Promise<void> {
    const pages = this.paginate(content);

    if (pages.length === 1) {
      console.log(content);
      return;
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    for (let i = 0; i < pages.length; i++) {
      console.log(pages[i]);
      console.log(chalk.gray(`\n--- Page ${i + 1}/${pages.length} ---`));

      if (i < pages.length - 1) {
        await new Promise<void>((resolve) => {
          rl.question(chalk.yellow('Press Enter for next page (q to quit): '), (answer) => {
            if (answer.toLowerCase() === 'q') {
              rl.close();
              process.exit(0);
            }
            resolve();
          });
        });
      }
    }

    rl.close();
  }
}

export const paginator = new OutputPaginator();

// ============================================================
// Feature #39: Notification System
// ============================================================

export interface NotificationOptions {
  title: string;
  message: string;
  sound?: boolean;
}

export async function sendNotification(options: NotificationOptions): Promise<void> {
  const { title, message, sound = true } = options;

  // Platform-specific notifications
  const platform = process.platform;

  try {
    if (platform === 'darwin') {
      // macOS
      const { exec } = await import('node:child_process');
      const soundFlag = sound ? 'default' : '';
      exec(
        `osascript -e 'display notification "${message}" with title "${title}" sound name "${soundFlag}"'`,
      );
    } else if (platform === 'win32') {
      // Windows - use PowerShell toast
      const { exec } = await import('node:child_process');
      exec(`powershell -Command "New-BurntToastNotification -Text '${title}', '${message}'"`);
    } else {
      // Linux - use notify-send
      const { exec } = await import('node:child_process');
      exec(`notify-send "${title}" "${message}"`);
    }
  } catch (_error) {
    // Fallback to console
    console.log(chalk.cyan(`\n🔔 ${title}: ${message}\n`));
  }
}

// ============================================================
// Export all
// ============================================================

export default {
  ProgressBar,
  TaskEditor,
  templateManager,
  outputFormatter,
  highlightCode,
  createCompleter,
  historySearch,
  paginator,
  sendNotification,
};

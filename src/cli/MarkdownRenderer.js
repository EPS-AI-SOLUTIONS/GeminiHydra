/**
 * Enhanced Markdown Renderer for CLI
 * Rich markdown rendering with colors, icons, and syntax highlighting
 * @module cli/MarkdownRenderer
 */

import chalk from 'chalk';
import { highlight } from 'cli-highlight';
import { HydraTheme } from './Theme.js';
import { DEFAULT_TERMINAL_WIDTH, BOX_UNICODE } from './constants.js';

/**
 * @typedef {Object} MarkdownOptions
 * @property {boolean} [colors=true] - Enable colored output
 * @property {boolean} [syntaxHighlight=true] - Enable syntax highlighting for code blocks
 * @property {number} [maxWidth] - Maximum line width
 * @property {boolean} [wordWrap=true] - Enable word wrapping
 */

/**
 * Markdown symbols for different elements
 */
const MARKDOWN_SYMBOLS = {
  // Headers
  h1: '\u2726',        // Four-pointed star
  h2: '\u25C6',        // Black diamond
  h3: '\u25B6',        // Black right-pointing triangle
  h4: '\u25AA',        // Black small square
  h5: '\u2022',        // Bullet
  h6: '\u00B7',        // Middle dot

  // Lists
  bullet: '\u2022',           // Bullet point
  bulletAlt: '\u25E6',        // White bullet
  bulletSub: '\u25AA',        // Black small square
  arrow: '\u279C',            // Heavy right arrow
  taskDone: '\u2714',         // Heavy check mark (green)
  taskPending: '\u25CB',      // White circle

  // Blockquote
  quoteBar: '\u2503',         // Box drawings heavy vertical
  quoteMark: '\u275D',        // Heavy double turned comma quotation mark

  // Code
  codeStart: '\u276A',        // Heavy left-pointing angle bracket
  codeEnd: '\u276B',          // Heavy right-pointing angle bracket

  // Links
  link: '\u2197',             // North east arrow (external link)
  
  // Horizontal rule
  hrChar: '\u2500',           // Box drawings light horizontal
  hrDouble: '\u2550'          // Box drawings double horizontal
};

/**
 * Header colors by level
 */
const HEADER_COLORS = {
  1: chalk.bold.hex('#ff79c6'),      // Pink - H1
  2: chalk.bold.hex('#8be9fd'),      // Cyan - H2
  3: chalk.bold.hex('#50fa7b'),      // Green - H3
  4: chalk.bold.hex('#ffb86c'),      // Orange - H4
  5: chalk.bold.hex('#bd93f9'),      // Purple - H5
  6: chalk.bold.hex('#6272a4')       // Gray - H6
};

/**
 * Enhanced Markdown Renderer with rich CLI formatting
 */
export class MarkdownRenderer {
  /** @type {Object} */
  #theme;

  /** @type {number} */
  #terminalWidth;

  /** @type {MarkdownOptions} */
  #options;

  /**
   * Create a new MarkdownRenderer
   * @param {Object} [theme] - Theme object
   * @param {MarkdownOptions} [options] - Renderer options
   */
  constructor(theme = HydraTheme, options = {}) {
    this.#theme = theme;
    this.#terminalWidth = process.stdout.columns || DEFAULT_TERMINAL_WIDTH;
    this.#options = {
      colors: true,
      syntaxHighlight: true,
      wordWrap: true,
      maxWidth: this.#terminalWidth - 4,
      ...options
    };

    // Update terminal width on resize
    process.stdout.on('resize', () => {
      this.#terminalWidth = process.stdout.columns || DEFAULT_TERMINAL_WIDTH;
      this.#options.maxWidth = this.#terminalWidth - 4;
    });
  }

  /**
   * Render markdown content to styled CLI output
   * @param {string} content - Markdown content
   * @returns {string} Rendered output
   */
  render(content) {
    if (!content) return '';

    let result = content;

    // Process block elements first (order matters)
    result = this.#renderCodeBlocks(result);
    result = this.#renderBlockquotes(result);
    result = this.#renderHeaders(result);
    result = this.#renderHorizontalRules(result);
    result = this.#renderTaskLists(result);
    result = this.#renderOrderedLists(result);
    result = this.#renderUnorderedLists(result);
    result = this.#renderTables(result);

    // Process inline elements
    result = this.#renderLinks(result);
    result = this.#renderInlineCode(result);
    result = this.#renderBoldItalic(result);
    result = this.#renderStrikethrough(result);

    return result;
  }

  /**
   * Render and print markdown content
   * @param {string} content - Markdown content
   * @returns {string} Rendered output
   */
  print(content) {
    const rendered = this.render(content);
    console.log(rendered);
    return rendered;
  }

  // ============ Header Rendering ============

  /**
   * Render markdown headers with colors and symbols
   * @param {string} content - Content to process
   * @returns {string} Processed content
   * @private
   */
  #renderHeaders(content) {
    const lines = content.split('\n');
    const result = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Match ATX-style headers (# Header)
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (headerMatch) {
        const level = headerMatch[1].length;
        const text = headerMatch[2].trim();
        const colorFn = HEADER_COLORS[level];
        const symbol = MARKDOWN_SYMBOLS[`h${level}`];
        
        // Add spacing before headers (except at start)
        if (result.length > 0 && result[result.length - 1] !== '') {
          result.push('');
        }

        // Format header with symbol and underline for H1/H2
        if (level === 1) {
          const headerText = `${symbol} ${text}`;
          const underline = this.#theme.colors.dim('─'.repeat(this.#stripAnsi(headerText).length + 2));
          result.push(colorFn(headerText));
          result.push(underline);
        } else if (level === 2) {
          const headerText = `${symbol} ${text}`;
          result.push(colorFn(headerText));
          result.push(this.#theme.colors.dim('·'.repeat(this.#stripAnsi(headerText).length)));
        } else {
          result.push(colorFn(`${symbol} ${text}`));
        }
        
        // Add spacing after headers
        result.push('');
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  // ============ List Rendering ============

  /**
   * Render unordered lists with bullets/icons
   * @param {string} content - Content to process
   * @returns {string} Processed content
   * @private
   */
  #renderUnorderedLists(content) {
    const lines = content.split('\n');
    const result = [];
    let inList = false;

    for (const line of lines) {
      // Match unordered list items (-, *, +)
      const listMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);

      if (listMatch) {
        const indent = listMatch[1];
        const indentLevel = Math.floor(indent.length / 2);
        const text = listMatch[3];

        // Choose bullet based on indent level
        const bullets = [
          MARKDOWN_SYMBOLS.bullet,
          MARKDOWN_SYMBOLS.bulletAlt,
          MARKDOWN_SYMBOLS.bulletSub,
          MARKDOWN_SYMBOLS.arrow
        ];
        const bullet = bullets[indentLevel % bullets.length];

        // Color the bullet
        const bulletColors = [
          this.#theme.colors.primary,
          this.#theme.colors.secondary,
          this.#theme.colors.info,
          this.#theme.colors.warning
        ];
        const colorFn = bulletColors[indentLevel % bulletColors.length];

        result.push(`${indent}${colorFn(bullet)} ${text}`);
        inList = true;
      } else {
        if (inList && line.trim() === '') {
          inList = false;
        }
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * Render ordered lists with numbers
   * @param {string} content - Content to process
   * @returns {string} Processed content
   * @private
   */
  #renderOrderedLists(content) {
    const lines = content.split('\n');
    const result = [];
    let listCounter = {};

    for (const line of lines) {
      // Match ordered list items (1. 2. etc)
      const listMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);

      if (listMatch) {
        const indent = listMatch[1];
        const indentLevel = Math.floor(indent.length / 2);
        const text = listMatch[3];

        // Track counter per indent level
        if (!listCounter[indentLevel]) {
          listCounter[indentLevel] = 1;
        }

        const number = listCounter[indentLevel]++;
        const numberStr = this.#theme.colors.highlight(`${number}.`);

        result.push(`${indent}${numberStr} ${text}`);
      } else {
        // Reset counters on blank lines
        if (line.trim() === '') {
          listCounter = {};
        }
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * Render task lists with checkboxes
   * @param {string} content - Content to process
   * @returns {string} Processed content
   * @private
   */
  #renderTaskLists(content) {
    const lines = content.split('\n');
    const result = [];

    for (const line of lines) {
      // Match task list items (- [ ] or - [x])
      const taskMatch = line.match(/^(\s*)([-*+])\s+\[([ xX])\]\s+(.+)$/);

      if (taskMatch) {
        const indent = taskMatch[1];
        const checked = taskMatch[3].toLowerCase() === 'x';
        const text = taskMatch[4];

        if (checked) {
          const checkbox = this.#theme.colors.success(MARKDOWN_SYMBOLS.taskDone);
          const styledText = this.#theme.colors.dim(text);
          result.push(`${indent}${checkbox} ${styledText}`);
        } else {
          const checkbox = this.#theme.colors.dim(MARKDOWN_SYMBOLS.taskPending);
          result.push(`${indent}${checkbox} ${text}`);
        }
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  // ============ Code Block Rendering ============

  /**
   * Render fenced code blocks with syntax highlighting
   * @param {string} content - Content to process
   * @returns {string} Processed content
   * @private
   */
  #renderCodeBlocks(content) {
    // Match fenced code blocks (``` or ~~~)
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```|~~~(\w*)\n([\s\S]*?)~~~/g;

    return content.replace(codeBlockRegex, (match, lang1, code1, lang2, code2) => {
      const language = (lang1 || lang2 || 'plaintext').toLowerCase();
      const code = (code1 || code2 || '').trimEnd();

      return this.#formatCodeBlock(code, language);
    });
  }

  /**
   * Format a code block with borders and highlighting
   * @param {string} code - Code content
   * @param {string} language - Language for highlighting
   * @returns {string} Formatted code block
   * @private
   */
  #formatCodeBlock(code, language) {
    const box = BOX_UNICODE;
    const borderColor = chalk.hex('#44475a');
    const langColor = chalk.hex('#6272a4');

    // Calculate width
    const codeLines = code.split('\n');
    const maxLineLength = Math.max(
      ...codeLines.map(line => this.#stripAnsi(line).length),
      language.length + 4
    );
    const width = Math.min(maxLineLength + 4, this.#options.maxWidth);
    const innerWidth = width - 2;

    // Highlight code if enabled
    let highlightedCode = code;
    if (this.#options.syntaxHighlight && language !== 'plaintext') {
      try {
        highlightedCode = highlight(code, {
          language: language,
          ignoreIllegals: true
        });
      } catch {
        // Fallback to plain code
        highlightedCode = this.#theme.colors.code ? 
          this.#theme.colors.code(code) : 
          chalk.hex('#e6db74')(code);
      }
    }

    const output = [];

    // Top border with language label
    const langLabel = language ? ` ${language} ` : '';
    const langLabelLen = langLabel.length;
    const topPadding = innerWidth - langLabelLen;

    output.push(
      borderColor(box.topLeft) +
      langColor(langLabel) +
      borderColor(box.horizontal.repeat(Math.max(0, topPadding))) +
      borderColor(box.topRight)
    );

    // Code lines
    const highlightedLines = highlightedCode.split('\n');
    for (const line of highlightedLines) {
      const strippedLen = this.#stripAnsi(line).length;
      const padding = innerWidth - strippedLen - 1;
      output.push(
        borderColor(box.vertical) +
        ' ' + line + ' '.repeat(Math.max(0, padding)) +
        borderColor(box.vertical)
      );
    }

    // Bottom border
    output.push(
      borderColor(box.bottomLeft) +
      borderColor(box.horizontal.repeat(innerWidth)) +
      borderColor(box.bottomRight)
    );

    return '\n' + output.join('\n') + '\n';
  }

  /**
   * Render inline code
   * @param {string} content - Content to process
   * @returns {string} Processed content
   * @private
   */
  #renderInlineCode(content) {
    // Match inline code (backticks)
    const inlineCodeRegex = /`([^`\n]+)`/g;
    const codeStyle = chalk.bgHex('#282a36').hex('#f8f8f2');

    return content.replace(inlineCodeRegex, (match, code) => {
      return codeStyle(` ${code} `);
    });
  }

  // ============ Blockquote Rendering ============

  /**
   * Render blockquotes with styled borders
   * @param {string} content - Content to process
   * @returns {string} Processed content
   * @private
   */
  #renderBlockquotes(content) {
    const lines = content.split('\n');
    const result = [];
    let quoteBuffer = [];
    let quoteLevel = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const quoteMatch = line.match(/^(>+)\s?(.*)$/);

      if (quoteMatch) {
        const level = quoteMatch[1].length;
        const text = quoteMatch[2];
        quoteBuffer.push({ level, text });
        quoteLevel = level;
      } else {
        if (quoteBuffer.length > 0) {
          result.push(...this.#formatBlockquote(quoteBuffer));
          quoteBuffer = [];
        }
        result.push(line);
      }
    }

    // Handle remaining buffer
    if (quoteBuffer.length > 0) {
      result.push(...this.#formatBlockquote(quoteBuffer));
    }

    return result.join('\n');
  }

  /**
   * Format a blockquote with borders
   * @param {Array<{level: number, text: string}>} quoteLines - Quote line data
   * @returns {string[]} Formatted lines
   * @private
   */
  #formatBlockquote(quoteLines) {
    const barColors = [
      chalk.hex('#6272a4'),  // Gray-blue
      chalk.hex('#bd93f9'),  // Purple
      chalk.hex('#ff79c6'),  // Pink
      chalk.hex('#8be9fd')   // Cyan
    ];

    const quoteColors = [
      chalk.italic.hex('#f8f8f2'),     // White italic
      chalk.italic.hex('#bfc7d5'),     // Light gray italic
      chalk.italic.hex('#a1aab8'),     // Gray italic
      chalk.italic.hex('#8892a3')      // Darker gray italic
    ];

    const result = [];

    for (const { level, text } of quoteLines) {
      // Build the bar prefix
      let prefix = '';
      for (let i = 0; i < level; i++) {
        const colorFn = barColors[i % barColors.length];
        prefix += colorFn(MARKDOWN_SYMBOLS.quoteBar) + ' ';
      }

      // Apply text styling
      const textColorFn = quoteColors[Math.min(level - 1, quoteColors.length - 1)];
      result.push(prefix + textColorFn(text));
    }

    return ['', ...result, ''];
  }

  // ============ Link Rendering ============

  /**
   * Render markdown links with colors
   * @param {string} content - Content to process
   * @returns {string} Processed content
   * @private
   */
  #renderLinks(content) {
    // Match markdown links [text](url)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

    return content.replace(linkRegex, (match, text, url) => {
      const linkText = chalk.blue.underline(text);
      const linkUrl = chalk.dim.cyan(`(${url})`);
      const linkIcon = chalk.blue(MARKDOWN_SYMBOLS.link);
      
      return `${linkText} ${linkIcon} ${linkUrl}`;
    });
  }

  // ============ Inline Formatting ============

  /**
   * Render bold and italic text
   * @param {string} content - Content to process
   * @returns {string} Processed content
   * @private
   */
  #renderBoldItalic(content) {
    let result = content;

    // Bold and italic (***text*** or ___text___)
    result = result.replace(/\*\*\*([^*]+)\*\*\*/g, (match, text) => {
      return chalk.bold.italic(text);
    });
    result = result.replace(/___([^_]+)___/g, (match, text) => {
      return chalk.bold.italic(text);
    });

    // Bold (**text** or __text__)
    result = result.replace(/\*\*([^*]+)\*\*/g, (match, text) => {
      return chalk.bold(text);
    });
    result = result.replace(/__([^_]+)__/g, (match, text) => {
      return chalk.bold(text);
    });

    // Italic (*text* or _text_)
    result = result.replace(/\*([^*\n]+)\*/g, (match, text) => {
      return chalk.italic(text);
    });
    result = result.replace(/_([^_\n]+)_/g, (match, text) => {
      return chalk.italic(text);
    });

    return result;
  }

  /**
   * Render strikethrough text
   * @param {string} content - Content to process
   * @returns {string} Processed content
   * @private
   */
  #renderStrikethrough(content) {
    // Match strikethrough (~~text~~)
    const strikeRegex = /~~([^~]+)~~/g;

    return content.replace(strikeRegex, (match, text) => {
      return chalk.strikethrough.dim(text);
    });
  }

  // ============ Horizontal Rule ============

  /**
   * Render horizontal rules
   * @param {string} content - Content to process
   * @returns {string} Processed content
   * @private
   */
  #renderHorizontalRules(content) {
    // Match horizontal rules (---, ***, ___)
    const hrRegex = /^([-*_]){3,}\s*$/gm;
    const hrChar = MARKDOWN_SYMBOLS.hrChar;
    const width = Math.min(this.#options.maxWidth, 60);

    return content.replace(hrRegex, () => {
      return '\n' + this.#theme.colors.dim(hrChar.repeat(width)) + '\n';
    });
  }

  // ============ Table Rendering ============

  /**
   * Render markdown tables
   * @param {string} content - Content to process
   * @returns {string} Processed content
   * @private
   */
  #renderTables(content) {
    const lines = content.split('\n');
    const result = [];
    let tableBuffer = [];
    let inTable = false;

    for (const line of lines) {
      const isTableLine = line.match(/^\|.+\|$/);
      const isSeparator = line.match(/^\|[-:| ]+\|$/);

      if (isTableLine || isSeparator) {
        inTable = true;
        tableBuffer.push(line);
      } else {
        if (inTable && tableBuffer.length > 0) {
          result.push(...this.#formatTable(tableBuffer));
          tableBuffer = [];
          inTable = false;
        }
        result.push(line);
      }
    }

    // Handle remaining buffer
    if (tableBuffer.length > 0) {
      result.push(...this.#formatTable(tableBuffer));
    }

    return result.join('\n');
  }

  /**
   * Format a markdown table
   * @param {string[]} tableLines - Table lines
   * @returns {string[]} Formatted lines
   * @private
   */
  #formatTable(tableLines) {
    if (tableLines.length < 2) return tableLines;

    const box = BOX_UNICODE;
    const borderColor = this.#theme.colors.border;
    const headerColor = this.#theme.colors.highlight;

    // Parse table cells
    const rows = tableLines.filter(line => !line.match(/^\|[-:| ]+\|$/))
      .map(line => {
        return line.split('|')
          .filter((_, i, arr) => i > 0 && i < arr.length - 1)
          .map(cell => cell.trim());
      });

    if (rows.length === 0) return tableLines;

    // Calculate column widths
    const colCount = rows[0].length;
    const colWidths = [];
    for (let col = 0; col < colCount; col++) {
      colWidths[col] = Math.max(
        ...rows.map(row => (row[col] || '').length)
      );
    }

    const output = [];
    const innerWidth = colWidths.reduce((a, b) => a + b, 0) + (colCount * 3) - 1;

    // Top border
    output.push(
      borderColor(box.topLeft) +
      colWidths.map(w => box.horizontal.repeat(w + 2)).join(borderColor(box.horizontal)) +
      borderColor(box.topRight)
    );

    // Header row
    const headerRow = rows[0];
    output.push(
      borderColor(box.vertical) +
      headerRow.map((cell, i) => {
        return ' ' + headerColor(cell.padEnd(colWidths[i])) + ' ';
      }).join(borderColor(box.vertical)) +
      borderColor(box.vertical)
    );

    // Header separator
    output.push(
      borderColor(box.teeRight) +
      colWidths.map(w => box.horizontal.repeat(w + 2)).join(borderColor(box.cross)) +
      borderColor(box.teeLeft)
    );

    // Data rows
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      output.push(
        borderColor(box.vertical) +
        row.map((cell, j) => {
          return ' ' + (cell || '').padEnd(colWidths[j]) + ' ';
        }).join(borderColor(box.vertical)) +
        borderColor(box.vertical)
      );
    }

    // Bottom border
    output.push(
      borderColor(box.bottomLeft) +
      colWidths.map(w => box.horizontal.repeat(w + 2)).join(borderColor(box.horizontal)) +
      borderColor(box.bottomRight)
    );

    return ['', ...output, ''];
  }

  // ============ Utility Methods ============

  /**
   * Strip ANSI escape codes from string
   * @param {string} str - String with ANSI codes
   * @returns {string} Clean string
   * @private
   */
  #stripAnsi(str) {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  }

  /**
   * Word wrap text to specified width
   * @param {string} text - Text to wrap
   * @param {number} [width] - Max width
   * @returns {string} Wrapped text
   */
  wordWrap(text, width = this.#options.maxWidth) {
    const lines = [];
    const words = text.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (this.#stripAnsi(testLine).length <= width) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines.join('\n');
  }

  /**
   * Get current theme
   * @returns {Object} Current theme
   */
  get theme() {
    return this.#theme;
  }

  /**
   * Set theme
   * @param {Object} theme - New theme
   */
  set theme(theme) {
    this.#theme = theme;
  }

  /**
   * Get markdown symbols
   * @returns {Object} Markdown symbols
   */
  static get symbols() {
    return MARKDOWN_SYMBOLS;
  }

  /**
   * Get header colors
   * @returns {Object} Header colors by level
   */
  static get headerColors() {
    return HEADER_COLORS;
  }
}

/**
 * Create a new MarkdownRenderer
 * @param {Object} [theme] - Theme object
 * @param {MarkdownOptions} [options] - Renderer options
 * @returns {MarkdownRenderer} New renderer instance
 */
export function createMarkdownRenderer(theme, options) {
  return new MarkdownRenderer(theme, options);
}

export default MarkdownRenderer;

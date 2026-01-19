/**
 * CLI Output Renderer
 * Styled output, markdown rendering, boxes, and tables
 * @module cli/OutputRenderer
 */

import chalk from 'chalk';
import { highlight } from 'cli-highlight';
import { HydraTheme } from './Theme.js';
import { DEFAULT_TERMINAL_WIDTH } from './constants.js';
import { showBanner, showCompactBanner, showMinimalBanner, VERSION, CODENAME } from './Banner.js';
import {
  TableRenderer,
  ListRenderer,
  TABLE_STYLES,
  LIST_STYLES,
  ALIGNMENT,
  createTableRenderer,
  createListRenderer
} from './TableRenderer.js';
import { MarkdownRenderer, createMarkdownRenderer } from './MarkdownRenderer.js';

/**
 * @typedef {Object} RenderOptions
 * @property {boolean} [markdown=true] - Enable markdown rendering
 * @property {boolean} [syntaxHighlight=true] - Enable syntax highlighting
 * @property {boolean} [wordWrap=true] - Enable word wrapping
 * @property {number} [maxWidth] - Maximum line width
 */

/**
 * Output renderer with theming and markdown support
 */
export class OutputRenderer {
  /** @type {Object} */
  #theme;

  /** @type {MarkdownRenderer} */
  #markdownRenderer;

  /** @type {number} */
  #terminalWidth;

  /**
   * Create a new OutputRenderer
   * @param {Object} [theme] - Theme object
   */
  constructor(theme = HydraTheme) {
    this.#theme = theme;
    this.#terminalWidth = process.stdout.columns || DEFAULT_TERMINAL_WIDTH;

    // Create enhanced markdown renderer
    this.#markdownRenderer = new MarkdownRenderer(theme, {
      colors: true,
      syntaxHighlight: true,
      wordWrap: true,
      maxWidth: this.#terminalWidth - 4
    });

    // Update terminal width on resize
    process.stdout.on('resize', () => {
      this.#terminalWidth = process.stdout.columns || DEFAULT_TERMINAL_WIDTH;
    });
  }

  // ============ Styled Output Methods ============

  /**
   * Print success message
   * @param {string} message - Message text
   */
  success(message) {
    console.log(
      this.#theme.colors.success(`${this.#theme.symbols.check} ${message}`)
    );
  }

  /**
   * Print error message
   * @param {string} message - Message text
   */
  error(message) {
    console.log(
      this.#theme.colors.error(`${this.#theme.symbols.cross} ${message}`)
    );
  }

  /**
   * Print warning message
   * @param {string} message - Message text
   */
  warning(message) {
    console.log(
      this.#theme.colors.warning(`${this.#theme.symbols.warning} ${message}`)
    );
  }

  /**
   * Print info message
   * @param {string} message - Message text
   */
  info(message) {
    console.log(
      this.#theme.colors.info(`${this.#theme.symbols.info} ${message}`)
    );
  }

  /**
   * Print dimmed text
   * @param {string} message - Message text
   */
  dim(message) {
    console.log(this.#theme.colors.dim(message));
  }

  /**
   * Print highlighted text
   * @param {string} message - Message text
   */
  highlight(message) {
    console.log(this.#theme.colors.highlight(message));
  }

  /**
   * Print primary colored text
   * @param {string} message - Message text
   */
  primary(message) {
    console.log(this.#theme.colors.primary(message));
  }

  /**
   * Print secondary colored text
   * @param {string} message - Message text
   */
  secondary(message) {
    console.log(this.#theme.colors.secondary(message));
  }

  /**
   * Print a blank line
   */
  newline() {
    console.log();
  }

  // ============ Markdown Rendering ============

  /**
   * Render markdown content with enhanced formatting
   * Supports: headers with colors, lists with icons, code blocks with syntax highlighting,
   * blockquotes with styled borders, links with colors, bold, italic, and strikethrough
   * @param {string} content - Markdown content
   * @param {Object} [options] - Render options
   * @param {boolean} [options.print=true] - Whether to print to console
   * @returns {string} Rendered output
   */
  renderMarkdown(content, options = {}) {
    if (!content) return '';
    const { print = true } = options;

    const rendered = this.#markdownRenderer.render(content);

    if (print) {
      console.log(rendered);
    }

    return rendered;
  }

  /**
   * Get the markdown renderer instance
   * @returns {MarkdownRenderer} Markdown renderer
   */
  get markdownRenderer() {
    return this.#markdownRenderer;
  }

  // ============ Code Rendering ============

  /**
   * Render code with syntax highlighting
   * @param {string} code - Code content
   * @param {string} [language] - Language for highlighting
   * @returns {string} Highlighted code
   */
  renderCode(code, language) {
    if (!code) return '';

    try {
      const highlighted = highlight(code, {
        language: language || 'plaintext',
        ignoreIllegals: true,
        theme: {
          keyword: this.#theme.colors.keyword,
          string: this.#theme.colors.string,
          number: this.#theme.colors.number,
          comment: chalk.gray.italic,
          function: chalk.yellow,
          class: chalk.cyan,
          variable: chalk.white
        }
      });
      return `\n${highlighted}\n`;
    } catch {
      // Fallback to plain code if highlighting fails
      return `\n${this.#theme.colors.code(code)}\n`;
    }
  }

  // ============ Box Rendering ============

  /**
   * Render a box around content
   * @param {string|string[]} content - Content to box (string or array of lines)
   * @param {string} [title] - Optional box title
   * @param {Object} [options] - Box options
   * @param {number} [options.width] - Box width (auto if not specified)
   * @param {string} [options.style='single'] - Box style: 'single', 'double', 'rounded'
   * @returns {string} Boxed content
   */
  renderBox(content, title, options = {}) {
    const lines = Array.isArray(content) ? content : content.split('\n');
    const box = this.#theme.box;
    const borderColor = this.#theme.colors.border;

    // Calculate width
    const contentWidth = Math.max(
      ...lines.map(line => this.#stripAnsi(line).length),
      title ? this.#stripAnsi(title).length + 4 : 0
    );
    const width = options.width || Math.min(contentWidth + 4, this.#terminalWidth - 2);
    const innerWidth = width - 2;

    // Build box
    const output = [];

    // Top border with optional title
    if (title) {
      const titleText = ` ${title} `;
      const titleLen = this.#stripAnsi(titleText).length;
      const leftPad = Math.floor((innerWidth - titleLen) / 2);
      const rightPad = innerWidth - titleLen - leftPad;

      output.push(
        borderColor(box.topLeft) +
        borderColor(box.horizontal.repeat(leftPad)) +
        this.#theme.colors.highlight(titleText) +
        borderColor(box.horizontal.repeat(rightPad)) +
        borderColor(box.topRight)
      );
    } else {
      output.push(
        borderColor(box.topLeft) +
        borderColor(box.horizontal.repeat(innerWidth)) +
        borderColor(box.topRight)
      );
    }

    // Content lines
    for (const line of lines) {
      const stripped = this.#stripAnsi(line);
      const padding = innerWidth - stripped.length - 2;
      output.push(
        borderColor(box.vertical) +
        ' ' + line + ' '.repeat(Math.max(0, padding + 1)) +
        borderColor(box.vertical)
      );
    }

    // Bottom border
    output.push(
      borderColor(box.bottomLeft) +
      borderColor(box.horizontal.repeat(innerWidth)) +
      borderColor(box.bottomRight)
    );

    const result = output.join('\n');
    console.log(result);
    return result;
  }

  // ============ Table Rendering ============

  /** @type {TableRenderer} */
  #tableRenderer = null;

  /** @type {ListRenderer} */
  #listRenderer = null;

  /**
   * Get or create table renderer instance
   * @returns {TableRenderer} Table renderer
   * @private
   */
  #getTableRenderer() {
    if (!this.#tableRenderer) {
      this.#tableRenderer = createTableRenderer({
        style: 'unicode',
        coloredHeaders: true,
        zebra: false
      });
    }
    return this.#tableRenderer;
  }

  /**
   * Get or create list renderer instance
   * @returns {ListRenderer} List renderer
   * @private
   */
  #getListRenderer() {
    if (!this.#listRenderer) {
      this.#listRenderer = createListRenderer({
        style: 'bullet',
        colored: true
      });
    }
    return this.#listRenderer;
  }

  /**
   * Render a table with advanced styling options
   * @param {Object[]} data - Array of row objects
   * @param {(string[]|Object[])} [columns] - Column headers or column definitions
   * @param {Object} [options] - Table options
   * @param {string} [options.style='unicode'] - Table style: 'simple', 'grid', 'outline', 'borderless', 'unicode', 'double', 'rounded', 'heavy'
   * @param {boolean} [options.coloredHeaders=true] - Enable colored headers
   * @param {boolean} [options.zebra=false] - Enable zebra striping (alternating row colors)
   * @param {string} [options.title] - Table title
   * @param {boolean} [options.showRowNumbers=false] - Show row numbers
   * @returns {string} Rendered table
   */
  renderTable(data, columns, options = {}) {
    if (!data || data.length === 0) {
      this.dim('(empty table)');
      return '';
    }

    const renderer = this.#getTableRenderer();
    const result = renderer.render(data, columns, options);
    console.log(result);
    return result;
  }

  /**
   * Render a simple table (backwards compatible)
   * @param {Object[]} data - Array of row objects
   * @param {string[]} [headers] - Column headers
   * @returns {string} Rendered table
   */
  renderSimpleTable(data, headers) {
    return this.renderTable(data, headers, { style: 'simple' });
  }

  /**
   * Render a grid-style table
   * @param {Object[]} data - Array of row objects
   * @param {string[]} [headers] - Column headers
   * @returns {string} Rendered table
   */
  renderGridTable(data, headers) {
    return this.renderTable(data, headers, { style: 'grid', zebra: true });
  }

  /**
   * Render a borderless table
   * @param {Object[]} data - Array of row objects
   * @param {string[]} [headers] - Column headers
   * @returns {string} Rendered table
   */
  renderBorderlessTable(data, headers) {
    return this.renderTable(data, headers, { style: 'borderless' });
  }

  /**
   * Render a styled list
   * @param {(string[]|Object[])} items - List items (strings or objects with text/children)
   * @param {Object} [options] - List options
   * @param {string} [options.style='bullet'] - List style: 'bullet', 'dash', 'arrow', 'star', 'numbered', 'lettered', 'roman', 'checkbox', 'none'
   * @param {boolean} [options.colored=true] - Enable colored markers
   * @returns {string} Rendered list
   */
  renderList(items, options = {}) {
    if (!items || items.length === 0) {
      this.dim('(empty list)');
      return '';
    }

    const renderer = this.#getListRenderer();
    const result = renderer.render(items, options);
    console.log(result);
    return result;
  }

  /**
   * Render a numbered list
   * @param {string[]} items - List items
   * @returns {string} Rendered list
   */
  renderNumberedList(items) {
    return this.renderList(items, { style: 'numbered' });
  }

  /**
   * Render a bullet list
   * @param {string[]} items - List items
   * @returns {string} Rendered list
   */
  renderBulletList(items) {
    return this.renderList(items, { style: 'bullet' });
  }

  /**
   * Render a checkbox list
   * @param {Object[]} items - List items with { text, checked } properties
   * @returns {string} Rendered list
   */
  renderCheckboxList(items) {
    return this.renderList(items, { style: 'checkbox' });
  }

  /**
   * Get available table styles
   * @returns {string[]} Style names
   */
  getTableStyles() {
    return Object.keys(TABLE_STYLES);
  }

  /**
   * Get available list styles
   * @returns {string[]} Style names
   */
  getListStyles() {
    return Object.keys(LIST_STYLES);
  }

  /**
   * Set default table style
   * @param {string} style - Style name
   */
  setTableStyle(style) {
    if (TABLE_STYLES[style]) {
      this.#getTableRenderer().setStyle(style);
    }
  }

  /**
   * Set default list style
   * @param {string} style - Style name
   */
  setListStyle(style) {
    if (LIST_STYLES[style]) {
      this.#getListRenderer().setStyle(style);
    }
  }

  /**
   * Enable/disable zebra striping for tables
   * @param {boolean} enabled - Enable zebra
   */
  setTableZebra(enabled) {
    this.#getTableRenderer().setZebra(enabled);
  }

  /**
   * Enable/disable colored headers for tables
   * @param {boolean} enabled - Enable colored headers
   */
  setTableColoredHeaders(enabled) {
    this.#getTableRenderer().setColoredHeaders(enabled);
  }

  // ============ Metadata Rendering ============

  /**
   * Render response metadata in a styled box
   * @param {Object} metadata - Response metadata
   * @returns {string} Rendered metadata
   */
  renderMetadata(metadata) {
    if (!metadata) return '';

    const lines = [];

    if (metadata.provider) {
      const providerColor = metadata.provider === 'ollama'
        ? this.#theme.colors.ollama
        : this.#theme.colors.gemini;
      lines.push(`Provider:   ${providerColor(metadata.provider)}`);
    }

    if (metadata.model) {
      lines.push(`Model:      ${this.#theme.colors.dim(metadata.model)}`);
    }

    if (metadata.category) {
      lines.push(`Category:   ${metadata.category}`);
    }

    if (metadata.complexity !== undefined) {
      const stars = '*'.repeat(Math.min(metadata.complexity, 5));
      lines.push(`Complexity: ${this.#theme.colors.warning(stars)}`);
    }

    if (metadata.totalDuration_ms !== undefined) {
      lines.push(`Duration:   ${metadata.totalDuration_ms}ms`);
    }

    if (metadata.estimatedCost !== undefined) {
      lines.push(`Cost:       $${metadata.estimatedCost.toFixed(6)}`);
    }

    if (metadata.costSavings !== undefined && metadata.costSavings > 0) {
      lines.push(`Saved:      ${this.#theme.colors.success('$' + metadata.costSavings.toFixed(6))}`);
    }

    return this.renderBox(lines, 'Response Info');
  }

  // ============ Banner ============

  /**
   * Render the HYDRA banner
   * @param {Object} [options] - Banner options
   * @param {string} [options.style='full'] - Banner style: 'full', 'compact', 'minimal'
   * @param {boolean} [options.animated=true] - Enable animation
   * @param {string} [options.gradient='hydra'] - Gradient style
   */
  async renderBanner(options = {}) {
    const { style = 'full', animated = true, gradient = 'hydra' } = options;

    switch (style) {
      case 'minimal':
        showMinimalBanner();
        break;
      case 'compact':
        showCompactBanner({ gradient });
        break;
      case 'full':
      default:
        await showBanner({
          animated,
          gradient,
          logo: 'large',
          showInfo: true,
          showCommands: true,
          theme: this.#theme
        });
        break;
    }
  }

  /**
   * Get version info
   * @returns {{version: string, codename: string}} Version information
   */
  getVersionInfo() {
    return { version: VERSION, codename: CODENAME };
  }

  // ============ Health Status ============

  /**
   * Render health check status
   * @param {Object} health - Health check result
   */
  renderHealth(health) {
    const lines = [];

    // Ollama status
    const ollamaStatus = health.ollama?.available
      ? this.#theme.colors.success(`${this.#theme.symbols.check} Online`)
      : this.#theme.colors.error(`${this.#theme.symbols.cross} Offline`);
    lines.push(`Ollama:  ${ollamaStatus}`);

    if (health.ollama?.available && health.ollama.models?.length > 0) {
      const models = health.ollama.models.slice(0, 3).join(', ');
      lines.push(`  Models: ${this.#theme.colors.dim(models)}`);
    }

    // Gemini status
    const geminiStatus = health.gemini?.available
      ? this.#theme.colors.success(`${this.#theme.symbols.check} Online`)
      : this.#theme.colors.error(`${this.#theme.symbols.cross} Offline`);
    lines.push(`Gemini:  ${geminiStatus}`);

    if (health.gemini?.available && health.gemini.path) {
      lines.push(`  Path: ${this.#theme.colors.dim(health.gemini.path.slice(-30))}`);
    }

    this.renderBox(lines, 'HYDRA Health Check');
  }

  // ============ Statistics ============

  /**
   * Render usage statistics
   * @param {Object} stats - Statistics object
   */
  renderStats(stats) {
    const data = [
      { Metric: 'Total Requests', Value: stats.totalRequests },
      { Metric: 'Ollama Requests', Value: stats.ollamaRequests },
      { Metric: 'Gemini Requests', Value: stats.geminiRequests },
      { Metric: 'Ollama %', Value: `${stats.ollamaPercentage}%` },
      { Metric: 'Avg Latency', Value: `${Math.round(stats.averageLatency)}ms` },
      { Metric: 'Cost Saved', Value: `$${stats.totalCostSaved.toFixed(4)}` }
    ];

    this.renderTable(data, ['Metric', 'Value']);
  }

  // ============ JSON Rendering ============

  /**
   * Render JSON object with syntax highlighting
   * @param {Object} obj - Object to render
   * @param {number} [indent=0] - Current indentation level
   * @returns {string} Rendered JSON
   */
  renderJSON(obj, indent = 0) {
    const output = this.#formatJSON(obj, indent);
    console.log(output);
    return output;
  }

  /**
   * Format JSON with colored keys and values
   * @param {*} value - Value to format
   * @param {number} indent - Indentation level
   * @returns {string} Formatted string
   * @private
   */
  #formatJSON(value, indent = 0) {
    const spaces = '  '.repeat(indent);
    const colors = this.#theme.colors;

    if (value === null) {
      return colors.dim('null');
    }

    if (value === undefined) {
      return colors.dim('undefined');
    }

    if (typeof value === 'boolean') {
      return colors.keyword(String(value));
    }

    if (typeof value === 'number') {
      return colors.number(String(value));
    }

    if (typeof value === 'string') {
      return colors.string(`"${value}"`);
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return colors.dim('[]');
      }
      const items = value.map(item =>
        spaces + '  ' + this.#formatJSON(item, indent + 1)
      );
      return '[\n' + items.join(',\n') + '\n' + spaces + ']';
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        return colors.dim('{}');
      }
      const entries = keys.map(key => {
        const formattedKey = colors.primary(`"${key}"`);
        const formattedValue = this.#formatJSON(value[key], indent + 1);
        return spaces + '  ' + formattedKey + ': ' + formattedValue;
      });
      return '{\n' + entries.join(',\n') + '\n' + spaces + '}';
    }

    return String(value);
  }

  // ============ Diff Rendering ============

  /**
   * Render text diff between old and new text
   * @param {string} oldText - Original text
   * @param {string} newText - New text
   * @returns {string} Rendered diff
   */
  renderDiff(oldText, newText) {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const diff = this.#computeDiff(oldLines, newLines);
    const output = this.#formatDiff(diff);
    console.log(output);
    return output;
  }

  /**
   * Compute line-by-line diff
   * @param {string[]} oldLines - Original lines
   * @param {string[]} newLines - New lines
   * @returns {Array<{type: string, line: string}>} Diff entries
   * @private
   */
  #computeDiff(oldLines, newLines) {
    const diff = [];
    const maxLen = Math.max(oldLines.length, newLines.length);

    // Simple line-by-line comparison
    // For more sophisticated diff, consider using a proper diff algorithm
    let oldIdx = 0;
    let newIdx = 0;

    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      const oldLine = oldLines[oldIdx];
      const newLine = newLines[newIdx];

      if (oldIdx >= oldLines.length) {
        // Only new lines left
        diff.push({ type: 'add', line: newLine });
        newIdx++;
      } else if (newIdx >= newLines.length) {
        // Only old lines left
        diff.push({ type: 'remove', line: oldLine });
        oldIdx++;
      } else if (oldLine === newLine) {
        // Lines match
        diff.push({ type: 'same', line: oldLine });
        oldIdx++;
        newIdx++;
      } else {
        // Lines differ - check if it's a modification or add/remove
        const oldInNew = newLines.indexOf(oldLine, newIdx);
        const newInOld = oldLines.indexOf(newLine, oldIdx);

        if (oldInNew === -1 && newInOld === -1) {
          // Modified line
          diff.push({ type: 'remove', line: oldLine });
          diff.push({ type: 'add', line: newLine });
          oldIdx++;
          newIdx++;
        } else if (oldInNew !== -1 && (newInOld === -1 || oldInNew - newIdx < newInOld - oldIdx)) {
          // New line added
          diff.push({ type: 'add', line: newLine });
          newIdx++;
        } else {
          // Old line removed
          diff.push({ type: 'remove', line: oldLine });
          oldIdx++;
        }
      }
    }

    return diff;
  }

  /**
   * Format diff entries for display
   * @param {Array<{type: string, line: string}>} diff - Diff entries
   * @returns {string} Formatted diff
   * @private
   */
  #formatDiff(diff) {
    const colors = this.#theme.colors;
    const lines = [];

    for (const entry of diff) {
      switch (entry.type) {
        case 'add':
          lines.push(colors.success(`+ ${entry.line}`));
          break;
        case 'remove':
          lines.push(colors.error(`- ${entry.line}`));
          break;
        case 'same':
          lines.push(colors.dim(`  ${entry.line}`));
          break;
      }
    }

    return lines.join('\n');
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
   * Word wrap text to terminal width
   * @param {string} text - Text to wrap
   * @param {number} [width] - Max width (defaults to terminal width)
   * @returns {string} Wrapped text
   */
  wordWrap(text, width) {
    const maxWidth = width || this.#terminalWidth - 2;
    const lines = [];
    const words = text.split(' ');
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= maxWidth) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine) lines.push(currentLine);
    return lines.join('\n');
  }

  /**
   * Clear the terminal screen
   */
  clear() {
    console.clear();
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
}

/**
 * Create a new output renderer
 * @param {Object} [theme] - Theme object
 * @returns {OutputRenderer} New renderer instance
 */
export function createRenderer(theme) {
  return new OutputRenderer(theme);
}

export default OutputRenderer;

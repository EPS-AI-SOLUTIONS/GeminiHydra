/**
 * Modern Unicode Box-Drawing System
 * Advanced borders, frames, boxes, panels, and sections
 * @module cli/Borders
 */

import chalk from 'chalk';

// ============ Unicode Box-Drawing Character Sets ============

/**
 * Single line box-drawing characters
 * @type {Object}
 */
export const SINGLE = {
  topLeft: '\u250c',      // ┌
  topRight: '\u2510',     // ┐
  bottomLeft: '\u2514',   // └
  bottomRight: '\u2518',  // ┘
  horizontal: '\u2500',   // ─
  vertical: '\u2502',     // │
  teeRight: '\u251c',     // ├
  teeLeft: '\u2524',      // ┤
  teeDown: '\u252c',      // ┬
  teeUp: '\u2534',        // ┴
  cross: '\u253c',        // ┼
  // Additional single characters
  leftHalf: '\u2574',     // ╴
  rightHalf: '\u2576',    // ╶
  topHalf: '\u2575',      // ╵
  bottomHalf: '\u2577'    // ╷
};

/**
 * Double line box-drawing characters
 * @type {Object}
 */
export const DOUBLE = {
  topLeft: '\u2554',      // ╔
  topRight: '\u2557',     // ╗
  bottomLeft: '\u255a',   // ╚
  bottomRight: '\u255d',  // ╝
  horizontal: '\u2550',   // ═
  vertical: '\u2551',     // ║
  teeRight: '\u2560',     // ╠
  teeLeft: '\u2563',      // ╣
  teeDown: '\u2566',      // ╦
  teeUp: '\u2569',        // ╩
  cross: '\u256c'         // ╬
};

/**
 * Rounded corner box-drawing characters
 * @type {Object}
 */
export const ROUNDED = {
  topLeft: '\u256d',      // ╭
  topRight: '\u256e',     // ╮
  bottomLeft: '\u2570',   // ╰
  bottomRight: '\u256f',  // ╯
  horizontal: '\u2500',   // ─
  vertical: '\u2502',     // │
  teeRight: '\u251c',     // ├
  teeLeft: '\u2524',      // ┤
  teeDown: '\u252c',      // ┬
  teeUp: '\u2534',        // ┴
  cross: '\u253c'         // ┼
};

/**
 * Bold (heavy) box-drawing characters
 * @type {Object}
 */
export const BOLD = {
  topLeft: '\u250f',      // ┏
  topRight: '\u2513',     // ┓
  bottomLeft: '\u2517',   // ┗
  bottomRight: '\u251b',  // ┛
  horizontal: '\u2501',   // ━
  vertical: '\u2503',     // ┃
  teeRight: '\u2523',     // ┣
  teeLeft: '\u252b',      // ┫
  teeDown: '\u2533',      // ┳
  teeUp: '\u253b',        // ┻
  cross: '\u254b'         // ╋
};

/**
 * Dashed (light triple dash) box-drawing characters
 * @type {Object}
 */
export const DASHED = {
  topLeft: '\u250c',      // ┌
  topRight: '\u2510',     // ┐
  bottomLeft: '\u2514',   // └
  bottomRight: '\u2518',  // ┘
  horizontal: '\u2504',   // ┄
  vertical: '\u2506',     // ┆
  teeRight: '\u251c',     // ├
  teeLeft: '\u2524',      // ┤
  teeDown: '\u252c',      // ┬
  teeUp: '\u2534',        // ┴
  cross: '\u253c'         // ┼
};

/**
 * Dotted (light quadruple dash) box-drawing characters
 * @type {Object}
 */
export const DOTTED = {
  topLeft: '\u250c',      // ┌
  topRight: '\u2510',     // ┐
  bottomLeft: '\u2514',   // └
  bottomRight: '\u2518',  // ┘
  horizontal: '\u2508',   // ┈
  vertical: '\u250a',     // ┊
  teeRight: '\u251c',     // ├
  teeLeft: '\u2524',      // ┤
  teeDown: '\u252c',      // ┬
  teeUp: '\u2534',        // ┴
  cross: '\u253c'         // ┼
};

/**
 * ASCII fallback characters
 * @type {Object}
 */
export const ASCII = {
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  horizontal: '-',
  vertical: '|',
  teeRight: '+',
  teeLeft: '+',
  teeDown: '+',
  teeUp: '+',
  cross: '+'
};

/**
 * Style presets mapping
 * @type {Object}
 */
export const BORDER_STYLES = {
  single: SINGLE,
  double: DOUBLE,
  rounded: ROUNDED,
  bold: BOLD,
  dashed: DASHED,
  dotted: DOTTED,
  ascii: ASCII
};

// ============ Utility Functions ============

/**
 * Strip ANSI escape codes from string
 * @param {string} str - String with ANSI codes
 * @returns {string} Clean string
 */
export function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Get visible length of string (excluding ANSI codes)
 * @param {string} str - String to measure
 * @returns {number} Visible character count
 */
export function visibleLength(str) {
  return stripAnsi(str).length;
}

/**
 * Pad string to width (accounting for ANSI codes)
 * @param {string} str - String to pad
 * @param {number} width - Target width
 * @param {string} [align='left'] - Alignment: 'left', 'center', 'right'
 * @returns {string} Padded string
 */
export function padString(str, width, align = 'left') {
  const visible = visibleLength(str);
  const padding = Math.max(0, width - visible);
  
  if (align === 'center') {
    const left = Math.floor(padding / 2);
    const right = padding - left;
    return ' '.repeat(left) + str + ' '.repeat(right);
  } else if (align === 'right') {
    return ' '.repeat(padding) + str;
  }
  return str + ' '.repeat(padding);
}

/**
 * Word wrap text to specified width
 * @param {string} text - Text to wrap
 * @param {number} width - Maximum line width
 * @returns {string[]} Array of wrapped lines
 */
export function wordWrap(text, width) {
  if (!text) return [''];
  
  const lines = [];
  const paragraphs = text.split('\n');
  
  for (const paragraph of paragraphs) {
    if (visibleLength(paragraph) <= width) {
      lines.push(paragraph);
      continue;
    }
    
    const words = paragraph.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (visibleLength(testLine) <= width) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    
    if (currentLine) lines.push(currentLine);
  }
  
  return lines;
}

// ============ Border Drawing Class ============

/**
 * BorderRenderer - Creates styled boxes, panels, and sections
 */
export class BorderRenderer {
  /** @type {Object} */
  #style;
  
  /** @type {Function} */
  #colorFn;
  
  /** @type {number} */
  #terminalWidth;

  /**
   * Create a BorderRenderer
   * @param {Object} [options={}] - Renderer options
   * @param {string|Object} [options.style='single'] - Border style name or custom chars
   * @param {Function} [options.color] - Chalk color function for borders
   * @param {number} [options.terminalWidth] - Terminal width (auto-detected if not set)
   */
  constructor(options = {}) {
    this.#style = typeof options.style === 'string' 
      ? (BORDER_STYLES[options.style] || SINGLE)
      : (options.style || SINGLE);
    this.#colorFn = options.color || chalk.gray;
    this.#terminalWidth = options.terminalWidth || process.stdout.columns || 80;
    
    // Update on terminal resize (only once per process)
    if (process.stdout.listenerCount?.('resize') < 5) {
      process.stdout.on?.('resize', () => {
        this.#terminalWidth = process.stdout.columns || 80;
      });
    }
  }

  // ============ Style Management ============

  /**
   * Set border style
   * @param {string|Object} style - Style name or custom character set
   * @returns {BorderRenderer} this (for chaining)
   */
  setStyle(style) {
    this.#style = typeof style === 'string'
      ? (BORDER_STYLES[style] || SINGLE)
      : style;
    return this;
  }

  /**
   * Set border color
   * @param {Function} colorFn - Chalk color function
   * @returns {BorderRenderer} this (for chaining)
   */
  setColor(colorFn) {
    this.#colorFn = colorFn;
    return this;
  }

  /**
   * Get current style
   * @returns {Object} Current border style
   */
  getStyle() {
    return this.#style;
  }

  // ============ Line Drawing ============

  /**
   * Draw a horizontal line
   * @param {number} [width] - Line width (defaults to terminal width)
   * @param {Object} [options={}] - Options
   * @param {string} [options.char] - Custom character to use
   * @param {string} [options.startCap] - Start cap character
   * @param {string} [options.endCap] - End cap character
   * @returns {string} Horizontal line
   */
  horizontalLine(width, options = {}) {
    const w = width || this.#terminalWidth;
    const char = options.char || this.#style.horizontal;
    const startCap = options.startCap || '';
    const endCap = options.endCap || '';
    const lineWidth = w - startCap.length - endCap.length;
    return this.#colorFn(startCap + char.repeat(Math.max(0, lineWidth)) + endCap);
  }

  /**
   * Draw a vertical line segment
   * @param {number} height - Number of lines
   * @param {Object} [options={}] - Options
   * @param {string} [options.char] - Custom character
   * @param {number} [options.indent=0] - Left indentation
   * @returns {string[]} Array of line strings
   */
  verticalLine(height, options = {}) {
    const char = options.char || this.#style.vertical;
    const indent = options.indent || 0;
    const prefix = ' '.repeat(indent);
    return Array(height).fill(prefix + this.#colorFn(char));
  }

  // ============ Box Creation ============

  /**
   * Create a box around content
   * @param {string|string[]} content - Content (string or array of lines)
   * @param {Object} [options={}] - Box options
   * @param {string} [options.title] - Box title
   * @param {string} [options.footer] - Box footer
   * @param {number} [options.width] - Fixed width (auto if not specified)
   * @param {number} [options.minWidth=0] - Minimum width
   * @param {number} [options.maxWidth] - Maximum width
   * @param {number} [options.padding=1] - Horizontal padding inside box
   * @param {number} [options.paddingTop=0] - Top padding (empty lines)
   * @param {number} [options.paddingBottom=0] - Bottom padding (empty lines)
   * @param {string} [options.align='left'] - Content alignment
   * @param {Function} [options.titleColor] - Title color function
   * @param {Function} [options.contentColor] - Content color function
   * @param {boolean} [options.wrap=true] - Word wrap long lines
   * @returns {string[]} Array of box lines
   */
  box(content, options = {}) {
    const {
      title,
      footer,
      width: fixedWidth,
      minWidth = 0,
      maxWidth = this.#terminalWidth - 2,
      padding = 1,
      paddingTop = 0,
      paddingBottom = 0,
      align = 'left',
      titleColor = chalk.bold.white,
      contentColor = (x) => x,
      wrap = true
    } = options;

    // Normalize content to lines
    let lines = Array.isArray(content) ? content : (content || '').split('\n');
    
    // Word wrap if enabled
    if (wrap) {
      const wrapWidth = (fixedWidth || maxWidth) - (padding * 2) - 2;
      lines = lines.flatMap(line => wordWrap(line, wrapWidth));
    }

    // Calculate width
    const contentWidths = lines.map(l => visibleLength(l));
    const titleWidth = title ? visibleLength(title) + 4 : 0;
    const footerWidth = footer ? visibleLength(footer) + 4 : 0;
    
    let innerWidth = Math.max(
      ...contentWidths,
      titleWidth,
      footerWidth,
      minWidth - 2
    );
    innerWidth = Math.min(innerWidth + (padding * 2), maxWidth - 2);
    
    if (fixedWidth) {
      innerWidth = fixedWidth - 2;
    }

    const s = this.#style;
    const output = [];

    // Top border with optional title
    if (title) {
      const titleText = ` ${title} `;
      const titleLen = visibleLength(titleText);
      const leftPad = Math.floor((innerWidth - titleLen) / 2);
      const rightPad = innerWidth - titleLen - leftPad;
      output.push(
        this.#colorFn(s.topLeft) +
        this.#colorFn(s.horizontal.repeat(leftPad)) +
        titleColor(titleText) +
        this.#colorFn(s.horizontal.repeat(rightPad)) +
        this.#colorFn(s.topRight)
      );
    } else {
      output.push(
        this.#colorFn(s.topLeft) +
        this.#colorFn(s.horizontal.repeat(innerWidth)) +
        this.#colorFn(s.topRight)
      );
    }

    // Top padding
    for (let i = 0; i < paddingTop; i++) {
      output.push(
        this.#colorFn(s.vertical) +
        ' '.repeat(innerWidth) +
        this.#colorFn(s.vertical)
      );
    }

    // Content lines
    const padLeft = ' '.repeat(padding);
    const contentWidth = innerWidth - (padding * 2);
    
    for (const line of lines) {
      const paddedContent = padString(line, contentWidth, align);
      output.push(
        this.#colorFn(s.vertical) +
        padLeft +
        contentColor(paddedContent) +
        padLeft +
        this.#colorFn(s.vertical)
      );
    }

    // Bottom padding
    for (let i = 0; i < paddingBottom; i++) {
      output.push(
        this.#colorFn(s.vertical) +
        ' '.repeat(innerWidth) +
        this.#colorFn(s.vertical)
      );
    }

    // Bottom border with optional footer
    if (footer) {
      const footerText = ` ${footer} `;
      const footerLen = visibleLength(footerText);
      const leftPad = Math.floor((innerWidth - footerLen) / 2);
      const rightPad = innerWidth - footerLen - leftPad;
      output.push(
        this.#colorFn(s.bottomLeft) +
        this.#colorFn(s.horizontal.repeat(leftPad)) +
        chalk.dim(footerText) +
        this.#colorFn(s.horizontal.repeat(rightPad)) +
        this.#colorFn(s.bottomRight)
      );
    } else {
      output.push(
        this.#colorFn(s.bottomLeft) +
        this.#colorFn(s.horizontal.repeat(innerWidth)) +
        this.#colorFn(s.bottomRight)
      );
    }

    return output;
  }

  // ============ Panel Creation ============

  /**
   * Create a panel with header
   * @param {string} header - Panel header text
   * @param {string|string[]} content - Panel content
   * @param {Object} [options={}] - Panel options
   * @param {Function} [options.headerColor] - Header text color
   * @param {Function} [options.headerBgColor] - Header background color
   * @param {string} [options.style] - Override border style for this panel
   * @returns {string[]} Array of panel lines
   */
  panel(header, content, options = {}) {
    const {
      headerColor = chalk.bold.white,
      headerBgColor = chalk.bgCyan,
      ...boxOptions
    } = options;

    // Build header line
    const headerText = headerBgColor(headerColor(` ${header} `));
    
    return this.box(content, {
      title: header,
      titleColor: headerColor,
      ...boxOptions
    });
  }

  /**
   * Create an info panel
   * @param {string|string[]} content - Panel content
   * @param {Object} [options={}] - Panel options
   * @returns {string[]} Panel lines
   */
  infoPanel(content, options = {}) {
    return this.panel('i Info', content, {
      titleColor: chalk.blue.bold,
      ...options
    });
  }

  /**
   * Create a success panel
   * @param {string|string[]} content - Panel content
   * @param {Object} [options={}] - Panel options
   * @returns {string[]} Panel lines
   */
  successPanel(content, options = {}) {
    return this.panel('\u2713 Success', content, {
      titleColor: chalk.green.bold,
      ...options
    });
  }

  /**
   * Create a warning panel
   * @param {string|string[]} content - Panel content
   * @param {Object} [options={}] - Panel options
   * @returns {string[]} Panel lines
   */
  warningPanel(content, options = {}) {
    return this.panel('\u26a0 Warning', content, {
      titleColor: chalk.yellow.bold,
      ...options
    });
  }

  /**
   * Create an error panel
   * @param {string|string[]} content - Panel content
   * @param {Object} [options={}] - Panel options
   * @returns {string[]} Panel lines
   */
  errorPanel(content, options = {}) {
    return this.panel('\u2717 Error', content, {
      titleColor: chalk.red.bold,
      ...options
    });
  }

  // ============ Section Creation ============

  /**
   * Create a section with header line
   * @param {string} title - Section title
   * @param {Object} [options={}] - Section options
   * @param {number} [options.width] - Section width
   * @param {Function} [options.titleColor] - Title color function
   * @param {string} [options.position='left'] - Title position: 'left', 'center', 'right'
   * @returns {string} Section header line
   */
  sectionHeader(title, options = {}) {
    const {
      width = this.#terminalWidth,
      titleColor = chalk.bold.cyan,
      position = 'left'
    } = options;

    const s = this.#style;
    const titleText = ` ${title} `;
    const titleLen = visibleLength(titleText);
    const lineWidth = width - titleLen;

    let leftWidth, rightWidth;
    if (position === 'center') {
      leftWidth = Math.floor(lineWidth / 2);
      rightWidth = lineWidth - leftWidth;
    } else if (position === 'right') {
      leftWidth = lineWidth - 4;
      rightWidth = 4;
    } else {
      leftWidth = 4;
      rightWidth = lineWidth - 4;
    }

    return (
      this.#colorFn(s.horizontal.repeat(Math.max(0, leftWidth))) +
      titleColor(titleText) +
      this.#colorFn(s.horizontal.repeat(Math.max(0, rightWidth)))
    );
  }

  /**
   * Create a section with content
   * @param {string} title - Section title
   * @param {string|string[]} content - Section content
   * @param {Object} [options={}] - Section options
   * @param {number} [options.indent=2] - Content indentation
   * @returns {string[]} Section lines
   */
  section(title, content, options = {}) {
    const { indent = 2, ...headerOptions } = options;
    
    const lines = [];
    lines.push(this.sectionHeader(title, headerOptions));
    lines.push('');
    
    const contentLines = Array.isArray(content) ? content : content.split('\n');
    const prefix = ' '.repeat(indent);
    
    for (const line of contentLines) {
      lines.push(prefix + line);
    }
    
    lines.push('');
    return lines;
  }

  // ============ Grid and Table Helpers ============

  /**
   * Create a horizontal divider for tables/grids
   * @param {number[]} columnWidths - Array of column widths
   * @param {string} [type='middle'] - Divider type: 'top', 'middle', 'bottom'
   * @returns {string} Divider line
   */
  tableDivider(columnWidths, type = 'middle') {
    const s = this.#style;
    let left, mid, right;

    switch (type) {
      case 'top':
        left = s.topLeft;
        mid = s.teeDown;
        right = s.topRight;
        break;
      case 'bottom':
        left = s.bottomLeft;
        mid = s.teeUp;
        right = s.bottomRight;
        break;
      default:
        left = s.teeRight;
        mid = s.cross;
        right = s.teeLeft;
    }

    const segments = columnWidths.map(w => s.horizontal.repeat(w + 2));
    return this.#colorFn(left + segments.join(this.#colorFn(mid)) + right);
  }

  /**
   * Create a table row
   * @param {string[]} cells - Cell contents
   * @param {number[]} columnWidths - Column widths
   * @param {Object} [options={}] - Row options
   * @param {string[]} [options.aligns] - Per-column alignments
   * @param {Function} [options.cellColor] - Cell content color
   * @returns {string} Table row line
   */
  tableRow(cells, columnWidths, options = {}) {
    const { aligns = [], cellColor = (x) => x } = options;
    const s = this.#style;

    const paddedCells = cells.map((cell, i) => {
      const align = aligns[i] || 'left';
      const width = columnWidths[i];
      return ' ' + padString(cellColor(String(cell)), width, align) + ' ';
    });

    return (
      this.#colorFn(s.vertical) +
      paddedCells.join(this.#colorFn(s.vertical)) +
      this.#colorFn(s.vertical)
    );
  }

  // ============ Multi-Box Layouts ============

  /**
   * Create side-by-side boxes
   * @param {Array<{content: string|string[], title?: string, width?: number}>} boxes - Box configs
   * @param {Object} [options={}] - Layout options
   * @param {number} [options.gap=1] - Gap between boxes
   * @returns {string[]} Combined layout lines
   */
  sideBySide(boxes, options = {}) {
    const { gap = 1 } = options;
    const gapStr = ' '.repeat(gap);

    // Render each box
    const renderedBoxes = boxes.map(boxConfig => {
      const { content, title, width } = boxConfig;
      return this.box(content, { title, width });
    });

    // Find max height
    const maxHeight = Math.max(...renderedBoxes.map(b => b.length));

    // Get widths for padding
    const widths = renderedBoxes.map(b => visibleLength(b[0] || ''));

    // Combine lines
    const output = [];
    for (let i = 0; i < maxHeight; i++) {
      const lineParts = renderedBoxes.map((box, bi) => {
        const line = box[i] || '';
        return padString(line, widths[bi]);
      });
      output.push(lineParts.join(gapStr));
    }

    return output;
  }

  /**
   * Create a grid of boxes
   * @param {Array<{content: string|string[], title?: string}>} boxes - Box configs
   * @param {Object} [options={}] - Grid options
   * @param {number} [options.columns=2] - Number of columns
   * @param {number} [options.gap=1] - Gap between boxes
   * @returns {string[]} Grid layout lines
   */
  grid(boxes, options = {}) {
    const { columns = 2, gap = 1 } = options;
    
    // Split into rows
    const rows = [];
    for (let i = 0; i < boxes.length; i += columns) {
      rows.push(boxes.slice(i, i + columns));
    }

    // Calculate column width
    const colWidth = Math.floor((this.#terminalWidth - (gap * (columns - 1))) / columns);

    // Render each row
    const output = [];
    for (const row of rows) {
      const rowBoxes = row.map(boxConfig => ({
        ...boxConfig,
        width: colWidth
      }));
      output.push(...this.sideBySide(rowBoxes, { gap }));
      output.push(''); // Gap between rows
    }

    return output;
  }

  // ============ Decorative Elements ============

  /**
   * Create a banner with large text style
   * @param {string} text - Banner text
   * @param {Object} [options={}] - Banner options
   * @param {Function} [options.color] - Text color
   * @returns {string[]} Banner lines
   */
  banner(text, options = {}) {
    const { color = chalk.bold.cyan } = options;
    
    return this.box(text, {
      padding: 2,
      paddingTop: 1,
      paddingBottom: 1,
      align: 'center',
      titleColor: color,
      contentColor: color
    });
  }

  /**
   * Create a callout box with icon
   * @param {string} icon - Icon character
   * @param {string|string[]} content - Callout content
   * @param {Object} [options={}] - Callout options
   * @param {Function} [options.iconColor] - Icon color function
   * @returns {string[]} Callout lines
   */
  callout(icon, content, options = {}) {
    const { iconColor = chalk.cyan, ...boxOptions } = options;
    
    const lines = Array.isArray(content) ? content : content.split('\n');
    const prefixedLines = lines.map((line, i) => 
      i === 0 ? `${iconColor(icon)} ${line}` : `  ${line}`
    );
    
    return this.box(prefixedLines, { padding: 1, ...boxOptions });
  }

  /**
   * Create a quote box
   * @param {string|string[]} content - Quote content
   * @param {string} [author] - Quote author
   * @returns {string[]} Quote box lines
   */
  quote(content, author) {
    const s = this.#style;
    const lines = Array.isArray(content) ? content : content.split('\n');
    
    const output = [];
    for (const line of lines) {
      output.push(this.#colorFn(s.vertical + ' ') + chalk.italic(line));
    }
    
    if (author) {
      output.push(this.#colorFn(s.vertical + ' ') + chalk.dim(`— ${author}`));
    }
    
    return output;
  }

  // ============ Output Helpers ============

  /**
   * Print lines to console
   * @param {string|string[]} lines - Lines to print
   */
  print(lines) {
    const arr = Array.isArray(lines) ? lines : [lines];
    console.log(arr.join('\n'));
  }

  /**
   * Create a box and print it
   * @param {string|string[]} content - Content
   * @param {Object} [options] - Box options
   */
  printBox(content, options) {
    this.print(this.box(content, options));
  }

  /**
   * Create a panel and print it
   * @param {string} header - Header text
   * @param {string|string[]} content - Content
   * @param {Object} [options] - Panel options
   */
  printPanel(header, content, options) {
    this.print(this.panel(header, content, options));
  }

  /**
   * Create a section and print it
   * @param {string} title - Section title
   * @param {string|string[]} content - Content
   * @param {Object} [options] - Section options
   */
  printSection(title, content, options) {
    this.print(this.section(title, content, options));
  }
}

// ============ Factory Functions ============

/**
 * Create a BorderRenderer with specified style
 * @param {string} style - Style name
 * @param {Object} [options] - Additional options
 * @returns {BorderRenderer} Configured renderer
 */
export function createBorderRenderer(style = 'single', options = {}) {
  return new BorderRenderer({ style, ...options });
}

/**
 * Quick box creation with default renderer
 * @param {string|string[]} content - Content
 * @param {Object} [options] - Box options
 * @returns {string[]} Box lines
 */
export function quickBox(content, options = {}) {
  const renderer = new BorderRenderer({ style: options.style || 'single' });
  return renderer.box(content, options);
}

/**
 * Quick panel creation
 * @param {string} header - Header text
 * @param {string|string[]} content - Content
 * @param {Object} [options] - Panel options
 * @returns {string[]} Panel lines
 */
export function quickPanel(header, content, options = {}) {
  const renderer = new BorderRenderer({ style: options.style || 'single' });
  return renderer.panel(header, content, options);
}

// Default export
export default BorderRenderer;

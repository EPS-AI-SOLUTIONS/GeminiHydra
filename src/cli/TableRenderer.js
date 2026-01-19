/**
 * Advanced Table and List Renderer for CLI
 * Supports multiple styles, colors, alignment, and zebra striping
 * @module cli/TableRenderer
 */

import { RESET, Styles, FgColors, BgColors, colorize, stripAnsi, visibleLength } from '../logger/colors.js';
import { BOX_UNICODE, BOX_ASCII } from './constants.js';

// ============================================================================
// Table Style Definitions
// ============================================================================

/**
 * Table border style definitions
 * @readonly
 */
export const TABLE_STYLES = Object.freeze({
  /**
   * Simple style - horizontal separators only
   * Example:
   *  Name   | Age
   * --------|-----
   *  Alice  | 30
   *  Bob    | 25
   */
  simple: {
    topLeft: '',
    topRight: '',
    bottomLeft: '',
    bottomRight: '',
    horizontal: '-',
    vertical: '|',
    headerSeparator: '-',
    rowSeparator: '',
    teeRight: '',
    teeLeft: '',
    teeDown: '',
    teeUp: '',
    cross: '+',
    hasTopBorder: false,
    hasBottomBorder: false,
    hasRowSeparator: false
  },

  /**
   * Grid style - full box drawing with separators
   * Example:
   * +--------+-----+
   * | Name   | Age |
   * +--------+-----+
   * | Alice  | 30  |
   * +--------+-----+
   * | Bob    | 25  |
   * +--------+-----+
   */
  grid: {
    topLeft: '+',
    topRight: '+',
    bottomLeft: '+',
    bottomRight: '+',
    horizontal: '-',
    vertical: '|',
    headerSeparator: '-',
    rowSeparator: '-',
    teeRight: '+',
    teeLeft: '+',
    teeDown: '+',
    teeUp: '+',
    cross: '+',
    hasTopBorder: true,
    hasBottomBorder: true,
    hasRowSeparator: true
  },

  /**
   * Outline style - only outer border
   * Example:
   * +--------+-----+
   * | Name   | Age |
   * +--------+-----+
   * | Alice  | 30  |
   * | Bob    | 25  |
   * +--------+-----+
   */
  outline: {
    topLeft: '+',
    topRight: '+',
    bottomLeft: '+',
    bottomRight: '+',
    horizontal: '-',
    vertical: '|',
    headerSeparator: '-',
    rowSeparator: '',
    teeRight: '+',
    teeLeft: '+',
    teeDown: '+',
    teeUp: '+',
    cross: '+',
    hasTopBorder: true,
    hasBottomBorder: true,
    hasRowSeparator: false
  },

  /**
   * Borderless style - no borders at all
   * Example:
   *  Name    Age
   *  Alice   30
   *  Bob     25
   */
  borderless: {
    topLeft: '',
    topRight: '',
    bottomLeft: '',
    bottomRight: '',
    horizontal: '',
    vertical: ' ',
    headerSeparator: '',
    rowSeparator: '',
    teeRight: '',
    teeLeft: '',
    teeDown: '',
    teeUp: '',
    cross: '',
    hasTopBorder: false,
    hasBottomBorder: false,
    hasRowSeparator: false
  },

  /**
   * Unicode style - elegant box drawing characters
   * Example:
   * ┌────────┬─────┐
   * │ Name   │ Age │
   * ├────────┼─────┤
   * │ Alice  │ 30  │
   * │ Bob    │ 25  │
   * └────────┴─────┘
   */
  unicode: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
    headerSeparator: '─',
    rowSeparator: '─',
    teeRight: '├',
    teeLeft: '┤',
    teeDown: '┬',
    teeUp: '┴',
    cross: '┼',
    hasTopBorder: true,
    hasBottomBorder: true,
    hasRowSeparator: false
  },

  /**
   * Double style - double-line box drawing
   * Example:
   * ╔════════╦═════╗
   * ║ Name   ║ Age ║
   * ╠════════╬═════╣
   * ║ Alice  ║ 30  ║
   * ║ Bob    ║ 25  ║
   * ╚════════╩═════╝
   */
  double: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║',
    headerSeparator: '═',
    rowSeparator: '═',
    teeRight: '╠',
    teeLeft: '╣',
    teeDown: '╦',
    teeUp: '╩',
    cross: '╬',
    hasTopBorder: true,
    hasBottomBorder: true,
    hasRowSeparator: false
  },

  /**
   * Rounded style - rounded corners
   * Example:
   * ╭────────┬─────╮
   * │ Name   │ Age │
   * ├────────┼─────┤
   * │ Alice  │ 30  │
   * │ Bob    │ 25  │
   * ╰────────┴─────╯
   */
  rounded: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
    headerSeparator: '─',
    rowSeparator: '─',
    teeRight: '├',
    teeLeft: '┤',
    teeDown: '┬',
    teeUp: '┴',
    cross: '┼',
    hasTopBorder: true,
    hasBottomBorder: true,
    hasRowSeparator: false
  },

  /**
   * Heavy style - heavy box drawing
   * Example:
   * ┏━━━━━━━━┳━━━━━┓
   * ┃ Name   ┃ Age ┃
   * ┣━━━━━━━━╋━━━━━┫
   * ┃ Alice  ┃ 30  ┃
   * ┃ Bob    ┃ 25  ┃
   * ┗━━━━━━━━┻━━━━━┛
   */
  heavy: {
    topLeft: '┏',
    topRight: '┓',
    bottomLeft: '┗',
    bottomRight: '┛',
    horizontal: '━',
    vertical: '┃',
    headerSeparator: '━',
    rowSeparator: '━',
    teeRight: '┣',
    teeLeft: '┫',
    teeDown: '┳',
    teeUp: '┻',
    cross: '╋',
    hasTopBorder: true,
    hasBottomBorder: true,
    hasRowSeparator: false
  }
});

// ============================================================================
// Column Alignment
// ============================================================================

/**
 * Column alignment types
 * @readonly
 * @enum {string}
 */
export const ALIGNMENT = Object.freeze({
  LEFT: 'left',
  CENTER: 'center',
  RIGHT: 'right'
});

// ============================================================================
// Default Colors
// ============================================================================

/**
 * Default table color scheme
 * @readonly
 */
export const DEFAULT_TABLE_COLORS = Object.freeze({
  header: {
    fg: FgColors.WHITE,
    bg: BgColors.BLUE,
    style: Styles.BOLD
  },
  headerAlt: {
    fg: FgColors.WHITE,
    bg: BgColors.CYAN,
    style: Styles.BOLD
  },
  border: {
    fg: FgColors.GRAY
  },
  row: {
    fg: FgColors.WHITE
  },
  rowAlt: {
    fg: FgColors.WHITE,
    bg: BgColors.BRIGHT_BLACK
  },
  highlight: {
    fg: FgColors.YELLOW,
    style: Styles.BOLD
  }
});

// ============================================================================
// Table Renderer Class
// ============================================================================

/**
 * @typedef {Object} TableColumn
 * @property {string} key - Column key in data object
 * @property {string} [header] - Column header text (defaults to key)
 * @property {number} [width] - Fixed column width (auto if not specified)
 * @property {number} [minWidth] - Minimum column width
 * @property {number} [maxWidth] - Maximum column width
 * @property {string} [align='left'] - Column alignment: 'left', 'center', 'right'
 * @property {Function} [formatter] - Custom value formatter function
 * @property {Function} [colorFn] - Custom color function for cell values
 */

/**
 * @typedef {Object} TableOptions
 * @property {string} [style='unicode'] - Table style: 'simple', 'grid', 'outline', 'borderless', 'unicode', 'double', 'rounded', 'heavy'
 * @property {boolean} [coloredHeaders=true] - Enable colored headers
 * @property {boolean} [zebra=false] - Enable zebra striping
 * @property {Object} [colors] - Custom color scheme
 * @property {number} [padding=1] - Cell padding
 * @property {number} [maxWidth] - Maximum table width
 * @property {boolean} [truncate=true] - Truncate long values
 * @property {string} [emptyText='(empty)'] - Text for empty tables
 * @property {string} [title] - Table title
 * @property {boolean} [showRowNumbers=false] - Show row numbers
 */

/**
 * Advanced Table Renderer
 */
export class TableRenderer {
  /** @type {Object} */
  #style;

  /** @type {Object} */
  #colors;

  /** @type {number} */
  #padding;

  /** @type {boolean} */
  #coloredHeaders;

  /** @type {boolean} */
  #zebra;

  /** @type {number} */
  #maxWidth;

  /** @type {boolean} */
  #truncate;

  /** @type {string} */
  #emptyText;

  /** @type {boolean} */
  #showRowNumbers;

  /**
   * Create a new TableRenderer
   * @param {TableOptions} [options={}] - Render options
   */
  constructor(options = {}) {
    this.#style = TABLE_STYLES[options.style] || TABLE_STYLES.unicode;
    this.#colors = { ...DEFAULT_TABLE_COLORS, ...options.colors };
    this.#padding = options.padding ?? 1;
    this.#coloredHeaders = options.coloredHeaders ?? true;
    this.#zebra = options.zebra ?? false;
    this.#maxWidth = options.maxWidth || (process.stdout.columns || 80);
    this.#truncate = options.truncate ?? true;
    this.#emptyText = options.emptyText || '(empty)';
    this.#showRowNumbers = options.showRowNumbers ?? false;
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Render a table from array of objects
   * @param {Object[]} data - Array of row objects
   * @param {(string[]|TableColumn[])} [columns] - Column definitions or keys
   * @param {TableOptions} [options={}] - Override options for this render
   * @returns {string} Rendered table
   */
  render(data, columns, options = {}) {
    // Merge options
    const style = TABLE_STYLES[options.style] || this.#style;
    const coloredHeaders = options.coloredHeaders ?? this.#coloredHeaders;
    const zebra = options.zebra ?? this.#zebra;
    const padding = options.padding ?? this.#padding;
    const showRowNumbers = options.showRowNumbers ?? this.#showRowNumbers;
    const title = options.title;

    // Handle empty data
    if (!data || data.length === 0) {
      return this.#formatEmpty(options.emptyText || this.#emptyText);
    }

    // Normalize columns
    const normalizedColumns = this.#normalizeColumns(data, columns, showRowNumbers);

    // Calculate column widths
    const widths = this.#calculateWidths(data, normalizedColumns, padding, showRowNumbers);

    // Build table
    const output = [];

    // Title
    if (title) {
      output.push(this.#renderTitle(title, widths, style, padding));
    }

    // Top border
    if (style.hasTopBorder) {
      output.push(this.#renderBorder('top', widths, style, padding));
    }

    // Header row
    output.push(this.#renderHeaderRow(normalizedColumns, widths, style, padding, coloredHeaders));

    // Header separator
    output.push(this.#renderBorder('middle', widths, style, padding));

    // Data rows
    data.forEach((row, index) => {
      // Row separator (for grid style)
      if (index > 0 && style.hasRowSeparator) {
        output.push(this.#renderBorder('row', widths, style, padding));
      }

      output.push(this.#renderDataRow(
        row,
        normalizedColumns,
        widths,
        style,
        padding,
        zebra && index % 2 === 1,
        showRowNumbers ? index + 1 : null
      ));
    });

    // Bottom border
    if (style.hasBottomBorder) {
      output.push(this.#renderBorder('bottom', widths, style, padding));
    }

    return output.join('\n');
  }

  /**
   * Render and print table to console
   * @param {Object[]} data - Array of row objects
   * @param {(string[]|TableColumn[])} [columns] - Column definitions
   * @param {TableOptions} [options={}] - Override options
   */
  print(data, columns, options = {}) {
    console.log(this.render(data, columns, options));
  }

  /**
   * Set table style
   * @param {string} styleName - Style name
   */
  setStyle(styleName) {
    if (TABLE_STYLES[styleName]) {
      this.#style = TABLE_STYLES[styleName];
    }
  }

  /**
   * Enable/disable zebra striping
   * @param {boolean} enabled - Enable zebra
   */
  setZebra(enabled) {
    this.#zebra = enabled;
  }

  /**
   * Enable/disable colored headers
   * @param {boolean} enabled - Enable colored headers
   */
  setColoredHeaders(enabled) {
    this.#coloredHeaders = enabled;
  }

  /**
   * Set custom colors
   * @param {Object} colors - Color scheme
   */
  setColors(colors) {
    this.#colors = { ...this.#colors, ...colors };
  }

  // ============================================================================
  // Private Methods - Column Handling
  // ============================================================================

  /**
   * Normalize column definitions
   * @param {Object[]} data - Data array
   * @param {(string[]|TableColumn[])} [columns] - Column definitions
   * @param {boolean} showRowNumbers - Show row numbers
   * @returns {TableColumn[]} Normalized columns
   * @private
   */
  #normalizeColumns(data, columns, showRowNumbers) {
    let normalized;

    if (!columns || columns.length === 0) {
      // Auto-detect columns from data
      const keys = Object.keys(data[0]);
      normalized = keys.map(key => ({
        key,
        header: key,
        align: ALIGNMENT.LEFT
      }));
    } else if (typeof columns[0] === 'string') {
      // Array of strings
      normalized = columns.map(key => ({
        key,
        header: key,
        align: ALIGNMENT.LEFT
      }));
    } else {
      // Array of column objects
      normalized = columns.map(col => ({
        key: col.key,
        header: col.header || col.key,
        align: col.align || ALIGNMENT.LEFT,
        width: col.width,
        minWidth: col.minWidth,
        maxWidth: col.maxWidth,
        formatter: col.formatter,
        colorFn: col.colorFn
      }));
    }

    // Add row number column if needed
    if (showRowNumbers) {
      normalized.unshift({
        key: '__rowNum__',
        header: '#',
        align: ALIGNMENT.RIGHT
      });
    }

    return normalized;
  }

  /**
   * Calculate column widths
   * @param {Object[]} data - Data array
   * @param {TableColumn[]} columns - Column definitions
   * @param {number} padding - Cell padding
   * @param {boolean} showRowNumbers - Show row numbers
   * @returns {number[]} Column widths
   * @private
   */
  #calculateWidths(data, columns, padding, showRowNumbers) {
    return columns.map((col, colIndex) => {
      // Fixed width
      if (col.width) {
        return col.width;
      }

      // Calculate based on content
      let maxWidth;

      if (col.key === '__rowNum__') {
        // Row number column
        maxWidth = String(data.length).length;
      } else {
        // Header width
        const headerWidth = visibleLength(String(col.header));

        // Data width
        const dataWidth = Math.max(
          ...data.map(row => {
            const value = col.formatter
              ? col.formatter(row[col.key], row)
              : row[col.key];
            return visibleLength(String(value ?? ''));
          })
        );

        maxWidth = Math.max(headerWidth, dataWidth);
      }

      // Apply min/max constraints
      if (col.minWidth && maxWidth < col.minWidth) {
        maxWidth = col.minWidth;
      }
      if (col.maxWidth && maxWidth > col.maxWidth) {
        maxWidth = col.maxWidth;
      }

      return maxWidth;
    });
  }

  // ============================================================================
  // Private Methods - Rendering
  // ============================================================================

  /**
   * Render table title
   * @param {string} title - Title text
   * @param {number[]} widths - Column widths
   * @param {Object} style - Table style
   * @param {number} padding - Cell padding
   * @returns {string} Rendered title
   * @private
   */
  #renderTitle(title, widths, style, padding) {
    const totalWidth = widths.reduce((sum, w) => sum + w + padding * 2, 0) +
      (widths.length - 1) * (style.vertical ? 1 : 0);

    const titleColor = this.#colors.header;
    const borderColor = this.#colors.border;

    const titleText = this.#alignText(title, totalWidth, ALIGNMENT.CENTER);
    const coloredTitle = this.#applyColors(titleText, titleColor);

    if (style.hasTopBorder) {
      const border = style.horizontal.repeat(totalWidth + 2);
      return (
        this.#applyColors(style.topLeft + border + style.topRight, borderColor) + '\n' +
        this.#applyColors(style.vertical, borderColor) + ' ' + coloredTitle + ' ' +
        this.#applyColors(style.vertical, borderColor)
      );
    }

    return coloredTitle;
  }

  /**
   * Render border line
   * @param {string} position - 'top', 'middle', 'bottom', 'row'
   * @param {number[]} widths - Column widths
   * @param {Object} style - Table style
   * @param {number} padding - Cell padding
   * @returns {string} Rendered border
   * @private
   */
  #renderBorder(position, widths, style, padding) {
    const borderColor = this.#colors.border;
    let left, right, cross, horizontal;

    switch (position) {
      case 'top':
        left = style.topLeft;
        right = style.topRight;
        cross = style.teeDown;
        horizontal = style.horizontal;
        break;
      case 'middle':
        left = style.teeRight;
        right = style.teeLeft;
        cross = style.cross;
        horizontal = style.headerSeparator || style.horizontal;
        break;
      case 'bottom':
        left = style.bottomLeft;
        right = style.bottomRight;
        cross = style.teeUp;
        horizontal = style.horizontal;
        break;
      case 'row':
        left = style.teeRight;
        right = style.teeLeft;
        cross = style.cross;
        horizontal = style.rowSeparator || style.horizontal;
        break;
    }

    if (!horizontal) {
      return '';
    }

    const segments = widths.map(w => horizontal.repeat(w + padding * 2));
    const line = left + segments.join(cross) + right;

    return this.#applyColors(line, borderColor);
  }

  /**
   * Render header row
   * @param {TableColumn[]} columns - Column definitions
   * @param {number[]} widths - Column widths
   * @param {Object} style - Table style
   * @param {number} padding - Cell padding
   * @param {boolean} colored - Apply colors
   * @returns {string} Rendered header row
   * @private
   */
  #renderHeaderRow(columns, widths, style, padding, colored) {
    const borderColor = this.#colors.border;
    const headerColor = this.#colors.header;

    const paddingStr = ' '.repeat(padding);
    const cells = columns.map((col, i) => {
      const text = this.#alignText(String(col.header), widths[i], col.align);
      if (colored) {
        return this.#applyColors(paddingStr + text + paddingStr, headerColor);
      }
      return paddingStr + text + paddingStr;
    });

    const vertical = this.#applyColors(style.vertical, borderColor);
    return vertical + cells.join(vertical) + vertical;
  }

  /**
   * Render data row
   * @param {Object} row - Row data
   * @param {TableColumn[]} columns - Column definitions
   * @param {number[]} widths - Column widths
   * @param {Object} style - Table style
   * @param {number} padding - Cell padding
   * @param {boolean} isAlt - Is alternate row (for zebra)
   * @param {number|null} rowNum - Row number or null
   * @returns {string} Rendered data row
   * @private
   */
  #renderDataRow(row, columns, widths, style, padding, isAlt, rowNum) {
    const borderColor = this.#colors.border;
    const rowColor = isAlt ? this.#colors.rowAlt : this.#colors.row;

    const paddingStr = ' '.repeat(padding);
    const cells = columns.map((col, i) => {
      let value;

      if (col.key === '__rowNum__') {
        value = rowNum;
      } else if (col.formatter) {
        value = col.formatter(row[col.key], row);
      } else {
        value = row[col.key] ?? '';
      }

      let text = String(value);

      // Truncate if needed
      if (this.#truncate && visibleLength(text) > widths[i]) {
        text = this.#truncateText(text, widths[i]);
      }

      // Align
      text = this.#alignText(text, widths[i], col.align);

      // Apply custom color or row color
      if (col.colorFn) {
        text = col.colorFn(text, row[col.key], row);
      } else if (isAlt && rowColor.bg) {
        text = this.#applyColors(text, rowColor);
      }

      return paddingStr + text + paddingStr;
    });

    const vertical = this.#applyColors(style.vertical, borderColor);

    // Apply row background for zebra
    let rowContent = cells.join(vertical);
    if (isAlt && rowColor.bg && !columns.some(c => c.colorFn)) {
      rowContent = this.#applyColors(rowContent, rowColor);
    }

    return vertical + rowContent + vertical;
  }

  /**
   * Format empty table message
   * @param {string} text - Empty text
   * @returns {string} Formatted message
   * @private
   */
  #formatEmpty(text) {
    return colorize(text, FgColors.GRAY + Styles.ITALIC);
  }

  // ============================================================================
  // Private Methods - Text Utilities
  // ============================================================================

  /**
   * Align text within width
   * @param {string} text - Text to align
   * @param {number} width - Target width
   * @param {string} align - Alignment type
   * @returns {string} Aligned text
   * @private
   */
  #alignText(text, width, align) {
    const textLen = visibleLength(text);
    const diff = width - textLen;

    if (diff <= 0) {
      return text;
    }

    switch (align) {
      case ALIGNMENT.CENTER: {
        const leftPad = Math.floor(diff / 2);
        const rightPad = diff - leftPad;
        return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
      }
      case ALIGNMENT.RIGHT:
        return ' '.repeat(diff) + text;
      case ALIGNMENT.LEFT:
      default:
        return text + ' '.repeat(diff);
    }
  }

  /**
   * Truncate text with ellipsis
   * @param {string} text - Text to truncate
   * @param {number} maxWidth - Maximum width
   * @returns {string} Truncated text
   * @private
   */
  #truncateText(text, maxWidth) {
    if (maxWidth <= 3) {
      return '.'.repeat(maxWidth);
    }

    const stripped = stripAnsi(text);
    if (stripped.length <= maxWidth) {
      return text;
    }

    return stripped.substring(0, maxWidth - 3) + '...';
  }

  /**
   * Apply color scheme to text
   * @param {string} text - Text to color
   * @param {Object} colorScheme - Color scheme object
   * @returns {string} Colored text
   * @private
   */
  #applyColors(text, colorScheme) {
    if (!colorScheme) {
      return text;
    }

    let codes = '';
    if (colorScheme.style) codes += colorScheme.style;
    if (colorScheme.fg) codes += colorScheme.fg;
    if (colorScheme.bg) codes += colorScheme.bg;

    if (!codes) {
      return text;
    }

    return codes + text + RESET;
  }
}

// ============================================================================
// List Renderer Class
// ============================================================================

/**
 * List style definitions
 * @readonly
 */
export const LIST_STYLES = Object.freeze({
  bullet: {
    marker: (i, level) => ['•', '◦', '▪', '▫'][level % 4],
    indent: 2
  },
  dash: {
    marker: () => '-',
    indent: 2
  },
  arrow: {
    marker: () => '→',
    indent: 2
  },
  star: {
    marker: () => '★',
    indent: 2
  },
  numbered: {
    marker: (i) => `${i + 1}.`,
    indent: 3
  },
  lettered: {
    marker: (i) => `${String.fromCharCode(97 + (i % 26))}.`,
    indent: 3
  },
  roman: {
    marker: (i) => {
      const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'];
      return `${romanNumerals[i % 10] || (i + 1)}.`;
    },
    indent: 4
  },
  checkbox: {
    marker: (i, level, checked) => checked ? '☑' : '☐',
    indent: 2
  },
  none: {
    marker: () => '',
    indent: 0
  }
});

/**
 * @typedef {Object} ListItem
 * @property {string} text - Item text
 * @property {boolean} [checked] - Checkbox state (for checkbox style)
 * @property {ListItem[]} [children] - Nested items
 * @property {string} [color] - Item color
 */

/**
 * @typedef {Object} ListOptions
 * @property {string} [style='bullet'] - List style
 * @property {boolean} [colored=true] - Enable colored markers
 * @property {number} [indentSize=2] - Indentation per level
 * @property {Object} [colors] - Custom colors
 */

/**
 * Advanced List Renderer
 */
export class ListRenderer {
  /** @type {Object} */
  #style;

  /** @type {boolean} */
  #colored;

  /** @type {number} */
  #indentSize;

  /** @type {Object} */
  #colors;

  /**
   * Create a new ListRenderer
   * @param {ListOptions} [options={}] - Render options
   */
  constructor(options = {}) {
    this.#style = LIST_STYLES[options.style] || LIST_STYLES.bullet;
    this.#colored = options.colored ?? true;
    this.#indentSize = options.indentSize || 2;
    this.#colors = {
      marker: { fg: FgColors.CYAN },
      text: { fg: FgColors.WHITE },
      checked: { fg: FgColors.GREEN },
      unchecked: { fg: FgColors.GRAY },
      ...options.colors
    };
  }

  /**
   * Render a list
   * @param {(string[]|ListItem[])} items - List items
   * @param {ListOptions} [options={}] - Override options
   * @returns {string} Rendered list
   */
  render(items, options = {}) {
    const style = LIST_STYLES[options.style] || this.#style;
    const colored = options.colored ?? this.#colored;

    return this.#renderItems(items, style, colored, 0);
  }

  /**
   * Render and print list to console
   * @param {(string[]|ListItem[])} items - List items
   * @param {ListOptions} [options={}] - Override options
   */
  print(items, options = {}) {
    console.log(this.render(items, options));
  }

  /**
   * Set list style
   * @param {string} styleName - Style name
   */
  setStyle(styleName) {
    if (LIST_STYLES[styleName]) {
      this.#style = LIST_STYLES[styleName];
    }
  }

  /**
   * Render items recursively
   * @param {(string[]|ListItem[])} items - Items
   * @param {Object} style - List style
   * @param {boolean} colored - Apply colors
   * @param {number} level - Nesting level
   * @returns {string} Rendered items
   * @private
   */
  #renderItems(items, style, colored, level) {
    const lines = [];
    const indent = ' '.repeat(level * this.#indentSize);

    items.forEach((item, index) => {
      const isObject = typeof item === 'object' && item !== null;
      const text = isObject ? item.text : String(item);
      const checked = isObject ? item.checked : undefined;
      const children = isObject ? item.children : undefined;
      const itemColor = isObject ? item.color : undefined;

      // Get marker
      const marker = style.marker(index, level, checked);
      const markerPadding = ' '.repeat(style.indent - marker.length);

      // Color marker
      let coloredMarker = marker;
      if (colored && marker) {
        if (checked !== undefined) {
          coloredMarker = this.#applyColor(marker, checked ? this.#colors.checked : this.#colors.unchecked);
        } else {
          coloredMarker = this.#applyColor(marker, this.#colors.marker);
        }
      }

      // Color text
      let coloredText = text;
      if (itemColor) {
        coloredText = colorize(text, FgColors[itemColor.toUpperCase()] || FgColors.WHITE);
      }

      lines.push(`${indent}${coloredMarker}${markerPadding}${coloredText}`);

      // Render children
      if (children && children.length > 0) {
        lines.push(this.#renderItems(children, style, colored, level + 1));
      }
    });

    return lines.join('\n');
  }

  /**
   * Apply color to text
   * @param {string} text - Text
   * @param {Object} colorScheme - Color scheme
   * @returns {string} Colored text
   * @private
   */
  #applyColor(text, colorScheme) {
    if (!colorScheme || !colorScheme.fg) {
      return text;
    }
    return colorize(text, colorScheme.fg);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new TableRenderer
 * @param {TableOptions} [options={}] - Options
 * @returns {TableRenderer} New renderer
 */
export function createTableRenderer(options = {}) {
  return new TableRenderer(options);
}

/**
 * Create a new ListRenderer
 * @param {ListOptions} [options={}] - Options
 * @returns {ListRenderer} New renderer
 */
export function createListRenderer(options = {}) {
  return new ListRenderer(options);
}

/**
 * Quick render table with defaults
 * @param {Object[]} data - Data array
 * @param {(string[]|TableColumn[])} [columns] - Columns
 * @param {TableOptions} [options={}] - Options
 * @returns {string} Rendered table
 */
export function renderTable(data, columns, options = {}) {
  const renderer = new TableRenderer(options);
  return renderer.render(data, columns, options);
}

/**
 * Quick render list with defaults
 * @param {(string[]|ListItem[])} items - Items
 * @param {ListOptions} [options={}] - Options
 * @returns {string} Rendered list
 */
export function renderList(items, options = {}) {
  const renderer = new ListRenderer(options);
  return renderer.render(items, options);
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  // Classes
  TableRenderer,
  ListRenderer,

  // Constants
  TABLE_STYLES,
  LIST_STYLES,
  ALIGNMENT,
  DEFAULT_TABLE_COLORS,

  // Factory functions
  createTableRenderer,
  createListRenderer,
  renderTable,
  renderList
};

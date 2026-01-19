/**
 * Advanced Progress Bar System
 * @module cli/progress
 * 
 * Features:
 * - Multiple visual styles (classic, blocks, smooth, gradient, braille)
 * - Percentage display
 * - ETA (Estimated Time of Arrival)
 * - Speed calculation
 * - Customizable themes
 */

import chalk from 'chalk';
import { HydraTheme } from './Theme.js';

/**
 * Progress bar style definitions
 * @type {Object.<string, Object>}
 */
export const PROGRESS_STYLES = {
  /**
   * Classic ASCII style: [====----]
   */
  classic: {
    name: 'classic',
    leftBracket: '[',
    rightBracket: ']',
    filled: '=',
    empty: '-',
    head: '>',
    useHead: true
  },

  /**
   * Block characters style: █████░░░░░
   */
  blocks: {
    name: 'blocks',
    leftBracket: '',
    rightBracket: '',
    filled: '█',
    empty: '░',
    head: '█',
    useHead: false
  },

  /**
   * Smooth gradient style using partial blocks: ████▓▒░
   */
  smooth: {
    name: 'smooth',
    leftBracket: '',
    rightBracket: '',
    filled: '█',
    empty: '░',
    partials: ['░', '▒', '▓', '█'],
    head: '',
    useHead: false,
    usePartials: true
  },

  /**
   * Gradient color style with smooth transition
   */
  gradient: {
    name: 'gradient',
    leftBracket: '',
    rightBracket: '',
    filled: '█',
    empty: '░',
    head: '',
    useHead: false,
    useGradient: true,
    gradientColors: ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#00ffff', '#0000ff']
  },

  /**
   * Braille pattern style for high-resolution display: ⣿⣿⣿⣿⣀⣀⣀⣀
   */
  braille: {
    name: 'braille',
    leftBracket: '⟨',
    rightBracket: '⟩',
    filled: '⣿',
    empty: '⣀',
    partials: ['⣀', '⣄', '⣤', '⣦', '⣶', '⣷', '⣿'],
    head: '',
    useHead: false,
    usePartials: true
  },

  /**
   * Modern minimalist style: ━━━━━━╸╶╶╶╶
   */
  modern: {
    name: 'modern',
    leftBracket: '',
    rightBracket: '',
    filled: '━',
    empty: '╶',
    head: '╸',
    useHead: true
  },

  /**
   * Arrows style: ▶▶▶▶▶▷▷▷▷▷
   */
  arrows: {
    name: 'arrows',
    leftBracket: '',
    rightBracket: '',
    filled: '▶',
    empty: '▷',
    head: '▶',
    useHead: false
  },

  /**
   * Dots style: ●●●●●○○○○○
   */
  dots: {
    name: 'dots',
    leftBracket: '',
    rightBracket: '',
    filled: '●',
    empty: '○',
    head: '●',
    useHead: false
  }
};

/**
 * @typedef {Object} ProgressBarOptions
 * @property {number} [total=100] - Total value for completion
 * @property {number} [width=30] - Bar width in characters
 * @property {string} [label=''] - Label text
 * @property {string} [style='classic'] - Bar style name
 * @property {Object} [theme] - Theme object for colors
 * @property {boolean} [showPercentage=true] - Show percentage
 * @property {boolean} [showETA=false] - Show estimated time
 * @property {boolean} [showSpeed=false] - Show processing speed
 * @property {string} [unit='items'] - Unit name for speed display
 * @property {boolean} [showValue=false] - Show current/total values
 * @property {string} [completeMessage=''] - Message on completion
 * @property {boolean} [clearOnComplete=false] - Clear bar on completion
 */

/**
 * Advanced Progress Bar with multiple styles and statistics
 */
export class AdvancedProgressBar {
  /** @type {number} */
  #current = 0;

  /** @type {number} */
  #total = 100;

  /** @type {number} */
  #width = 30;

  /** @type {string} */
  #label = '';

  /** @type {Object} */
  #theme;

  /** @type {Object} */
  #style;

  /** @type {boolean} */
  #showPercentage = true;

  /** @type {boolean} */
  #showETA = false;

  /** @type {boolean} */
  #showSpeed = false;

  /** @type {string} */
  #unit = 'items';

  /** @type {boolean} */
  #showValue = false;

  /** @type {string} */
  #completeMessage = '';

  /** @type {boolean} */
  #clearOnComplete = false;

  /** @type {number} */
  #startTime = 0;

  /** @type {number[]} */
  #samples = [];

  /** @type {number} */
  #lastUpdate = 0;

  /** @type {number} */
  #lastValue = 0;

  /** @type {boolean} */
  #isComplete = false;

  /** @type {boolean} */
  #isRendered = false;

  /**
   * Create a new advanced progress bar
   * @param {ProgressBarOptions} options - Progress bar options
   */
  constructor(options = {}) {
    this.#total = options.total ?? 100;
    this.#width = options.width ?? 30;
    this.#label = options.label ?? '';
    this.#theme = options.theme ?? HydraTheme;
    this.#style = PROGRESS_STYLES[options.style] ?? PROGRESS_STYLES.classic;
    this.#showPercentage = options.showPercentage ?? true;
    this.#showETA = options.showETA ?? false;
    this.#showSpeed = options.showSpeed ?? false;
    this.#unit = options.unit ?? 'items';
    this.#showValue = options.showValue ?? false;
    this.#completeMessage = options.completeMessage ?? '';
    this.#clearOnComplete = options.clearOnComplete ?? false;
    this.#startTime = Date.now();
    this.#lastUpdate = this.#startTime;
  }

  /**
   * Update progress
   * @param {number} value - Current value
   * @param {string} [label] - Optional new label
   * @returns {AdvancedProgressBar} This progress bar
   */
  update(value, label) {
    const now = Date.now();
    const timeDelta = now - this.#lastUpdate;
    
    // Record sample for speed calculation (max 10 samples)
    if (timeDelta > 100) { // Only sample every 100ms
      const valueDelta = value - this.#lastValue;
      if (valueDelta > 0) {
        this.#samples.push({
          value: valueDelta,
          time: timeDelta
        });
        if (this.#samples.length > 10) {
          this.#samples.shift();
        }
      }
      this.#lastUpdate = now;
      this.#lastValue = value;
    }

    this.#current = Math.min(value, this.#total);
    if (label !== undefined) this.#label = label;
    this.#render();
    return this;
  }

  /**
   * Increment progress
   * @param {number} [amount=1] - Amount to increment
   * @param {string} [label] - Optional new label
   * @returns {AdvancedProgressBar} This progress bar
   */
  increment(amount = 1, label) {
    return this.update(this.#current + amount, label);
  }

  /**
   * Complete the progress bar
   * @param {string} [message] - Completion message
   * @returns {AdvancedProgressBar} This progress bar
   */
  complete(message) {
    this.#isComplete = true;
    this.#current = this.#total;
    
    if (this.#clearOnComplete) {
      process.stdout.write('\r\x1b[K');
    } else {
      this.#render();
      if (message || this.#completeMessage) {
        process.stdout.write('\n');
        const msg = message || this.#completeMessage;
        console.log(this.#theme.colors.success(`✓ ${msg}`));
      }
    }
    
    return this;
  }

  /**
   * Calculate current speed (items per second)
   * @returns {number} Speed in items per second
   * @private
   */
  #calculateSpeed() {
    if (this.#samples.length === 0) return 0;
    
    const totalValue = this.#samples.reduce((sum, s) => sum + s.value, 0);
    const totalTime = this.#samples.reduce((sum, s) => sum + s.time, 0);
    
    if (totalTime === 0) return 0;
    return (totalValue / totalTime) * 1000; // Convert to per second
  }

  /**
   * Calculate ETA (Estimated Time of Arrival)
   * @returns {string} Formatted ETA string
   * @private
   */
  #calculateETA() {
    const remaining = this.#total - this.#current;
    const speed = this.#calculateSpeed();
    
    if (speed <= 0 || remaining <= 0) {
      return '--:--';
    }
    
    const secondsRemaining = remaining / speed;
    return this.#formatTime(secondsRemaining);
  }

  /**
   * Format time in seconds to human readable string
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted time string
   * @private
   */
  #formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '--:--';
    
    if (seconds < 60) {
      return `${Math.ceil(seconds)}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.ceil(seconds % 60);
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  }

  /**
   * Format speed for display
   * @param {number} speed - Speed in items per second
   * @returns {string} Formatted speed string
   * @private
   */
  #formatSpeed(speed) {
    if (speed < 1) {
      return `${(speed * 60).toFixed(1)} ${this.#unit}/min`;
    } else if (speed < 1000) {
      return `${speed.toFixed(1)} ${this.#unit}/s`;
    } else {
      return `${(speed / 1000).toFixed(1)}k ${this.#unit}/s`;
    }
  }

  /**
   * Build the visual bar string
   * @returns {string} The rendered bar
   * @private
   */
  #buildBar() {
    const percent = this.#current / this.#total;
    const style = this.#style;
    
    let bar = '';
    
    if (style.useGradient) {
      bar = this.#buildGradientBar(percent);
    } else if (style.usePartials) {
      bar = this.#buildSmoothBar(percent);
    } else {
      bar = this.#buildClassicBar(percent);
    }
    
    return bar;
  }

  /**
   * Build classic style bar
   * @param {number} percent - Progress percentage (0-1)
   * @returns {string} Rendered bar
   * @private
   */
  #buildClassicBar(percent) {
    const style = this.#style;
    const innerWidth = this.#width - (style.leftBracket.length + style.rightBracket.length);
    const filled = Math.floor(innerWidth * percent);
    const empty = innerWidth - filled;
    
    let filledStr = style.filled.repeat(Math.max(0, filled - (style.useHead ? 1 : 0)));
    let headStr = style.useHead && filled > 0 ? style.head : '';
    let emptyStr = style.empty.repeat(empty);
    
    // Apply colors
    const coloredFilled = this.#theme.colors.success(filledStr);
    const coloredHead = style.useHead ? this.#theme.colors.highlight(headStr) : '';
    const coloredEmpty = this.#theme.colors.dim(emptyStr);
    const coloredLeft = this.#theme.colors.primary(style.leftBracket);
    const coloredRight = this.#theme.colors.primary(style.rightBracket);
    
    return `${coloredLeft}${coloredFilled}${coloredHead}${coloredEmpty}${coloredRight}`;
  }

  /**
   * Build smooth style bar with partial characters
   * @param {number} percent - Progress percentage (0-1)
   * @returns {string} Rendered bar
   * @private
   */
  #buildSmoothBar(percent) {
    const style = this.#style;
    const innerWidth = this.#width - (style.leftBracket.length + style.rightBracket.length);
    const exactFilled = innerWidth * percent;
    const filled = Math.floor(exactFilled);
    const partialIndex = Math.floor((exactFilled - filled) * style.partials.length);
    const empty = innerWidth - filled - 1;
    
    let filledStr = style.filled.repeat(filled);
    let partialStr = filled < innerWidth ? style.partials[Math.min(partialIndex, style.partials.length - 1)] : '';
    let emptyStr = style.empty.repeat(Math.max(0, empty));
    
    // Apply colors
    const coloredFilled = this.#theme.colors.success(filledStr);
    const coloredPartial = this.#theme.colors.warning(partialStr);
    const coloredEmpty = this.#theme.colors.dim(emptyStr);
    const coloredLeft = this.#theme.colors.primary(style.leftBracket);
    const coloredRight = this.#theme.colors.primary(style.rightBracket);
    
    return `${coloredLeft}${coloredFilled}${coloredPartial}${coloredEmpty}${coloredRight}`;
  }

  /**
   * Build gradient color bar
   * @param {number} percent - Progress percentage (0-1)
   * @returns {string} Rendered bar
   * @private
   */
  #buildGradientBar(percent) {
    const style = this.#style;
    const innerWidth = this.#width;
    const filled = Math.floor(innerWidth * percent);
    const empty = innerWidth - filled;
    const colors = style.gradientColors;
    
    let bar = '';
    
    // Build filled part with gradient
    for (let i = 0; i < filled; i++) {
      const colorIndex = Math.floor((i / innerWidth) * (colors.length - 1));
      const color = colors[colorIndex];
      bar += chalk.hex(color)(style.filled);
    }
    
    // Build empty part
    bar += this.#theme.colors.dim(style.empty.repeat(empty));
    
    return bar;
  }

  /**
   * Render the progress bar
   * @private
   */
  #render() {
    this.#isRendered = true;
    const percent = this.#current / this.#total;
    const bar = this.#buildBar();
    
    // Build stats string
    const stats = [];
    
    if (this.#showPercentage) {
      const percentStr = `${Math.round(percent * 100)}%`.padStart(4);
      stats.push(this.#theme.colors.highlight(percentStr));
    }
    
    if (this.#showValue) {
      const valueStr = `${this.#current}/${this.#total}`;
      stats.push(this.#theme.colors.info(valueStr));
    }
    
    if (this.#showSpeed) {
      const speed = this.#calculateSpeed();
      const speedStr = this.#formatSpeed(speed);
      stats.push(this.#theme.colors.secondary(speedStr));
    }
    
    if (this.#showETA && !this.#isComplete) {
      const eta = this.#calculateETA();
      stats.push(this.#theme.colors.dim(`ETA: ${eta}`));
    }
    
    // Build label
    const label = this.#label ? ` ${this.#theme.colors.dim(this.#label)}` : '';
    
    // Build final output
    const statsStr = stats.length > 0 ? ` ${stats.join(' | ')}` : '';
    const output = `${bar}${statsStr}${label}`;
    
    // Clear line and write
    process.stdout.write(`\r\x1b[K${output}`);
  }

  /**
   * Finish and move to new line
   */
  finish() {
    if (this.#isRendered) {
      console.log();
    }
  }

  /**
   * Reset the progress bar
   * @returns {AdvancedProgressBar} This progress bar
   */
  reset() {
    this.#current = 0;
    this.#startTime = Date.now();
    this.#lastUpdate = this.#startTime;
    this.#lastValue = 0;
    this.#samples = [];
    this.#isComplete = false;
    return this;
  }

  /**
   * Set the style dynamically
   * @param {string} styleName - Style name from PROGRESS_STYLES
   * @returns {AdvancedProgressBar} This progress bar
   */
  setStyle(styleName) {
    if (PROGRESS_STYLES[styleName]) {
      this.#style = PROGRESS_STYLES[styleName];
    }
    return this;
  }

  /**
   * Get elapsed time since start
   * @returns {number} Elapsed time in milliseconds
   */
  get elapsed() {
    return Date.now() - this.#startTime;
  }

  /**
   * Get current value
   * @returns {number} Current value
   */
  get current() {
    return this.#current;
  }

  /**
   * Get total value
   * @returns {number} Total value
   */
  get total() {
    return this.#total;
  }

  /**
   * Get progress percentage (0-1)
   * @returns {number} Progress percentage
   */
  get percent() {
    return this.#current / this.#total;
  }

  /**
   * Check if progress is complete
   * @returns {boolean} True if complete
   */
  get isComplete() {
    return this.#isComplete || this.#current >= this.#total;
  }
}

/**
 * Multi-progress bar manager for tracking multiple operations
 */
export class MultiProgressBar {
  /** @type {Map<string, AdvancedProgressBar>} */
  #bars = new Map();

  /** @type {Object} */
  #options;

  /** @type {number} */
  #renderedLines = 0;

  /**
   * Create a new multi-progress bar manager
   * @param {ProgressBarOptions} [options] - Default options for bars
   */
  constructor(options = {}) {
    this.#options = options;
  }

  /**
   * Add a new progress bar
   * @param {string} id - Unique identifier for the bar
   * @param {ProgressBarOptions} [options] - Options for this bar
   * @returns {AdvancedProgressBar} The created progress bar
   */
  add(id, options = {}) {
    const bar = new AdvancedProgressBar({ ...this.#options, ...options });
    this.#bars.set(id, bar);
    return bar;
  }

  /**
   * Get a progress bar by ID
   * @param {string} id - Bar identifier
   * @returns {AdvancedProgressBar|undefined} The progress bar
   */
  get(id) {
    return this.#bars.get(id);
  }

  /**
   * Update a specific bar
   * @param {string} id - Bar identifier
   * @param {number} value - New value
   * @param {string} [label] - Optional new label
   * @returns {MultiProgressBar} This manager
   */
  update(id, value, label) {
    const bar = this.#bars.get(id);
    if (bar) {
      bar.update(value, label);
      this.#render();
    }
    return this;
  }

  /**
   * Remove a progress bar
   * @param {string} id - Bar identifier
   * @returns {boolean} True if removed
   */
  remove(id) {
    return this.#bars.delete(id);
  }

  /**
   * Render all progress bars
   * @private
   */
  #render() {
    // Move cursor up to start of progress area
    if (this.#renderedLines > 0) {
      process.stdout.write(`\x1b[${this.#renderedLines}A`);
    }

    // Render each bar
    let lines = 0;
    for (const [id, bar] of this.#bars) {
      process.stdout.write(`\r\x1b[K${id}: `);
      // Trigger bar render (it will write to same line)
      bar.update(bar.current);
      console.log();
      lines++;
    }

    this.#renderedLines = lines;
  }

  /**
   * Finish all progress bars
   */
  finish() {
    for (const bar of this.#bars.values()) {
      bar.finish();
    }
    this.#bars.clear();
    this.#renderedLines = 0;
  }

  /**
   * Get all bar IDs
   * @returns {string[]} Array of bar IDs
   */
  get ids() {
    return [...this.#bars.keys()];
  }

  /**
   * Get number of active bars
   * @returns {number} Number of bars
   */
  get size() {
    return this.#bars.size;
  }
}

/**
 * Create a new advanced progress bar
 * @param {ProgressBarOptions} [options] - Progress bar options
 * @returns {AdvancedProgressBar} New progress bar instance
 */
export function createAdvancedProgressBar(options) {
  return new AdvancedProgressBar(options);
}

/**
 * Create a new multi-progress bar manager
 * @param {ProgressBarOptions} [options] - Default options for bars
 * @returns {MultiProgressBar} New multi-progress manager
 */
export function createMultiProgressBar(options) {
  return new MultiProgressBar(options);
}

/**
 * Demo function to showcase all progress bar styles
 * @param {number} [delay=50] - Delay between updates in ms
 */
export async function demoProgressStyles(delay = 50) {
  const styles = Object.keys(PROGRESS_STYLES);
  
  console.log('\n🎨 Progress Bar Styles Demo\n');
  
  for (const styleName of styles) {
    const bar = createAdvancedProgressBar({
      total: 100,
      width: 40,
      style: styleName,
      label: `Style: ${styleName}`,
      showPercentage: true,
      showETA: true,
      showSpeed: true,
      unit: 'items'
    });
    
    for (let i = 0; i <= 100; i += 5) {
      bar.update(i);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    bar.finish();
  }
  
  console.log('\n✨ Demo complete!\n');
}

// Default export
export default {
  AdvancedProgressBar,
  MultiProgressBar,
  PROGRESS_STYLES,
  createAdvancedProgressBar,
  createMultiProgressBar,
  demoProgressStyles
};

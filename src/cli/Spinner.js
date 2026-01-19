/**
 * CLI Spinner and Progress Indicators
 * @module cli/Spinner
 */

import ora from 'ora';
import { HydraTheme } from './Theme.js';

/**
 * Modern Unicode spinner types with animation frames
 * @type {Object.<string, {interval: number, frames: string[]}>}
 */
export const SpinnerTypes = {
  // Classic dots spinner with Braille patterns
  dots: {
    interval: 80,
    frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  },

  // Dots variant 2 - vertical bounce
  dots2: {
    interval: 80,
    frames: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷']
  },

  // Dots variant 3 - expanding
  dots3: {
    interval: 80,
    frames: ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈']
  },

  // Line spinner - horizontal line animation
  line: {
    interval: 130,
    frames: ['─', '\\', '│', '/']
  },

  // Line variant 2 - double line
  line2: {
    interval: 100,
    frames: ['═', '╲', '║', '╱']
  },

  // Circle spinner - rotating circle segments
  circle: {
    interval: 120,
    frames: ['◐', '◓', '◑', '◒']
  },

  // Circle variant 2 - quarter fill
  circle2: {
    interval: 100,
    frames: ['◴', '◷', '◶', '◵']
  },

  // Circle variant 3 - arc rotation
  circle3: {
    interval: 80,
    frames: ['◜', '◠', '◝', '◞', '◡', '◟']
  },

  // Square spinner - rotating square
  square: {
    interval: 100,
    frames: ['◰', '◳', '◲', '◱']
  },

  // Square variant 2 - filling square
  square2: {
    interval: 100,
    frames: ['▖', '▘', '▝', '▗']
  },

  // Square variant 3 - block animation
  square3: {
    interval: 80,
    frames: ['▁', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃']
  },

  // Bounce spinner - bouncing ball
  bounce: {
    interval: 120,
    frames: ['⠁', '⠂', '⠄', '⠂']
  },

  // Bounce variant 2 - bouncing bar
  bounce2: {
    interval: 100,
    frames: ['[    ]', '[=   ]', '[==  ]', '[=== ]', '[ ===]', '[  ==]', '[   =]', '[    ]']
  },

  // Bounce variant 3 - bouncing block
  bounce3: {
    interval: 80,
    frames: ['▐', '▐', '▐', '▐', '▀', '▀', '▀', '▀', '▌', '▌', '▌', '▌', '▄', '▄', '▄', '▄']
  },

  // Pulse spinner - pulsing dot
  pulse: {
    interval: 100,
    frames: ['█', '▓', '▒', '░', '▒', '▓']
  },

  // Pulse variant 2 - heartbeat
  pulse2: {
    interval: 100,
    frames: ['♥', '♡', '♥', '♡', '💓']
  },

  // Pulse variant 3 - star pulse
  pulse3: {
    interval: 80,
    frames: ['✶', '✷', '✸', '✹', '✺', '✹', '✸', '✷']
  },

  // Wave spinner - wave animation
  wave: {
    interval: 100,
    frames: ['▁▂▃▄▅▆▇█▇▆▅▄▃▂▁', '▂▃▄▅▆▇█▇▆▅▄▃▂▁▁', '▃▄▅▆▇█▇▆▅▄▃▂▁▁▂', '▄▅▆▇█▇▆▅▄▃▂▁▁▂▃', '▅▆▇█▇▆▅▄▃▂▁▁▂▃▄', '▆▇█▇▆▅▄▃▂▁▁▂▃▄▅', '▇█▇▆▅▄▃▂▁▁▂▃▄▅▆', '█▇▆▅▄▃▂▁▁▂▃▄▅▆▇']
  },

  // Wave variant 2 - simpler wave
  wave2: {
    interval: 80,
    frames: ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃', '▂']
  },

  // Wave variant 3 - ocean wave
  wave3: {
    interval: 100,
    frames: ['≋', '≈', '∼', '≈']
  },

  // Arrow spinner - rotating arrows
  arrow: {
    interval: 100,
    frames: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙']
  },

  // Arrow variant 2 - double arrows
  arrow2: {
    interval: 80,
    frames: ['⇐', '⇖', '⇑', '⇗', '⇒', '⇘', '⇓', '⇙']
  },

  // Arrow variant 3 - pointer
  arrow3: {
    interval: 100,
    frames: ['▹▹▹▹▹', '▸▹▹▹▹', '▹▸▹▹▹', '▹▹▸▹▹', '▹▹▹▸▹', '▹▹▹▹▸']
  },

  // Clock spinner
  clock: {
    interval: 100,
    frames: ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛']
  },

  // Moon phases
  moon: {
    interval: 80,
    frames: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘']
  },

  // Earth rotation
  earth: {
    interval: 180,
    frames: ['🌍', '🌎', '🌏']
  },

  // Monkey see no evil
  monkey: {
    interval: 300,
    frames: ['🙈', '🙉', '🙊']
  },

  // Runner
  runner: {
    interval: 140,
    frames: ['🚶', '🏃']
  },

  // Toggle
  toggle: {
    interval: 250,
    frames: ['⊶', '⊷']
  },

  // Toggle variant 2
  toggle2: {
    interval: 80,
    frames: ['▫', '▪']
  },

  // Box bounce
  boxBounce: {
    interval: 120,
    frames: ['▖', '▘', '▝', '▗']
  },

  // Box bounce variant 2
  boxBounce2: {
    interval: 100,
    frames: ['▌', '▀', '▐', '▄']
  },

  // Triangle
  triangle: {
    interval: 50,
    frames: ['◢', '◣', '◤', '◥']
  },

  // Binary
  binary: {
    interval: 80,
    frames: ['010010', '001100', '100101', '111010', '101011', '011100']
  },

  // Aesthetic loading bar
  aesthetic: {
    interval: 80,
    frames: [
      '▰▱▱▱▱▱▱',
      '▰▰▱▱▱▱▱',
      '▰▰▰▱▱▱▱',
      '▰▰▰▰▱▱▱',
      '▰▰▰▰▰▱▱',
      '▰▰▰▰▰▰▱',
      '▰▰▰▰▰▰▰',
      '▰▰▰▰▰▰▱',
      '▰▰▰▰▰▱▱',
      '▰▰▰▰▱▱▱',
      '▰▰▰▱▱▱▱',
      '▰▰▱▱▱▱▱'
    ]
  },

  // Fist bump
  fistBump: {
    interval: 80,
    frames: ['🤜\u3000\u3000\u3000\u3000🤛', '🤜\u3000\u3000\u3000🤛\u3000', '🤜\u3000\u3000🤛\u3000\u3000', '🤜\u3000🤛\u3000\u3000\u3000', '🤜🤛\u3000\u3000\u3000\u3000', '✨🤜🤛✨\u3000\u3000', '🤜\u3000🤛\u3000\u3000\u3000', '🤜\u3000\u3000🤛\u3000\u3000', '🤜\u3000\u3000\u3000🤛\u3000', '🤜\u3000\u3000\u3000\u3000🤛']
  },

  // Smiley
  smiley: {
    interval: 200,
    frames: ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆']
  },

  // Point
  point: {
    interval: 125,
    frames: ['∙∙∙', '●∙∙', '∙●∙', '∙∙●', '∙∙∙']
  },

  // Simple dots
  simpleDots: {
    interval: 400,
    frames: ['.  ', '.. ', '...', '   ']
  },

  // Simple dots scrolling
  simpleDotsScrolling: {
    interval: 200,
    frames: ['.  ', '.. ', '...', ' ..', '  .', '   ']
  },

  // Star spinner
  star: {
    interval: 70,
    frames: ['✶', '✸', '✹', '✺', '✹', '✷']
  },

  // Star variant 2
  star2: {
    interval: 80,
    frames: ['+', 'x', '*']
  },

  // Flip
  flip: {
    interval: 70,
    frames: ['_', '_', '_', '-', '`', '`', '\'', '´', '-', '_', '_', '_']
  },

  // Hamburger
  hamburger: {
    interval: 100,
    frames: ['☱', '☲', '☴']
  },

  // Grow vertical
  growVertical: {
    interval: 120,
    frames: ['▁', '▃', '▄', '▅', '▆', '▇', '▆', '▅', '▄', '▃']
  },

  // Grow horizontal
  growHorizontal: {
    interval: 120,
    frames: ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '▊', '▋', '▌', '▍', '▎']
  },

  // Noise
  noise: {
    interval: 100,
    frames: ['▓', '▒', '░']
  },

  // Bounce ball
  bounceBall: {
    interval: 80,
    frames: [
      '( ●    )',
      '(  ●   )',
      '(   ●  )',
      '(    ● )',
      '(     ●)',
      '(    ● )',
      '(   ●  )',
      '(  ●   )',
      '( ●    )',
      '(●     )'
    ]
  },

  // Hydra special spinner (three-headed)
  hydra: {
    interval: 100,
    frames: [
      '🐍      ',
      ' 🐍     ',
      '  🐍    ',
      '🐍🐍🐍  ',
      '  🐍    ',
      ' 🐍     ',
      '🐍      ',
      '🐍🐍    ',
      ' 🐍🐍   ',
      '  🐍🐍  ',
      '   🐍🐍 ',
      '    🐍🐍',
      '   🐍🐍 ',
      '  🐍🐍  ',
      ' 🐍🐍   ',
      '🐍🐍    '
    ]
  },

  // Material design loading
  material: {
    interval: 17,
    frames: [
      '█▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁',
      '██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁',
      '███▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁',
      '████▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁',
      '██████▁▁▁▁▁▁▁▁▁▁▁▁▁▁',
      '██████████▁▁▁▁▁▁▁▁▁▁',
      '████████████▁▁▁▁▁▁▁▁',
      '█████████████▁▁▁▁▁▁▁',
      '█████████████████▁▁▁',
      '████████████████████',
      '▁████████████████████',
      '▁▁████████████████████',
      '▁▁▁████████████████████',
      '▁▁▁▁█████████████████',
      '▁▁▁▁▁▁████████████████',
      '▁▁▁▁▁▁▁▁██████████████',
      '▁▁▁▁▁▁▁▁▁▁█████████████',
      '▁▁▁▁▁▁▁▁▁▁▁▁▁██████████',
      '▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████████',
      '▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███████',
      '▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████',
      '▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁██',
      '▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█',
      '▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁'
    ]
  },

  // Default/classic spinner
  classic: {
    interval: 80,
    frames: ['|', '/', '-', '\\']
  }
};

/**
 * Get spinner configuration by type name
 * @param {string} type - Spinner type name
 * @returns {{interval: number, frames: string[]}} Spinner configuration
 */
export function getSpinnerType(type) {
  return SpinnerTypes[type] || SpinnerTypes.dots;
}

/**
 * Get all available spinner type names
 * @returns {string[]} Array of spinner type names
 */
export function getAvailableSpinnerTypes() {
  return Object.keys(SpinnerTypes);
}

/**
 * @typedef {Object} SpinnerOptions
 * @property {string} [text] - Initial text
 * @property {string} [color] - Spinner color
 * @property {Object} [theme] - Theme object
 * @property {string} [type] - Spinner type (e.g., 'dots', 'line', 'circle', etc.)
 * @property {number} [interval] - Custom animation interval in ms
 * @property {string[]} [frames] - Custom animation frames
 */

/**
 * Spinner wrapper for ora with theme integration and multiple spinner types
 */
export class Spinner {
  /** @type {import('ora').Ora} */
  #ora;

  /** @type {Object} */
  #theme;

  /** @type {boolean} */
  #active = false;

  /** @type {string} */
  #type;

  /**
   * Create a new Spinner
   * @param {SpinnerOptions} options - Spinner options
   */
  constructor(options = {}) {
    this.#theme = options.theme || HydraTheme;
    this.#type = options.type || 'dots';

    // Determine spinner configuration
    let spinnerConfig;

    if (options.frames) {
      // Use custom frames if provided
      spinnerConfig = {
        interval: options.interval || 80,
        frames: options.frames
      };
    } else if (options.type && SpinnerTypes[options.type]) {
      // Use predefined spinner type
      spinnerConfig = SpinnerTypes[options.type];
    } else if (this.#theme.spinner) {
      // Fall back to theme spinner
      spinnerConfig = {
        interval: options.interval || 80,
        frames: this.#theme.spinner
      };
    } else {
      // Default to dots spinner
      spinnerConfig = SpinnerTypes.dots;
    }

    this.#ora = ora({
      text: options.text || '',
      color: options.color || 'cyan',
      spinner: spinnerConfig
    });
  }

  /**
   * Start the spinner
   * @param {string} [text] - Text to display
   * @returns {Spinner} This spinner instance
   */
  start(text) {
    if (text) this.#ora.text = text;
    this.#ora.start();
    this.#active = true;
    return this;
  }

  /**
   * Stop the spinner
   * @returns {Spinner} This spinner instance
   */
  stop() {
    this.#ora.stop();
    this.#active = false;
    return this;
  }

  /**
   * Stop with success state
   * @param {string} [text] - Success message
   * @returns {Spinner} This spinner instance
   */
  succeed(text) {
    this.#ora.succeed(text);
    this.#active = false;
    return this;
  }

  /**
   * Stop with failure state
   * @param {string} [text] - Failure message
   * @returns {Spinner} This spinner instance
   */
  fail(text) {
    this.#ora.fail(text);
    this.#active = false;
    return this;
  }

  /**
   * Stop with warning state
   * @param {string} [text] - Warning message
   * @returns {Spinner} This spinner instance
   */
  warn(text) {
    this.#ora.warn(text);
    this.#active = false;
    return this;
  }

  /**
   * Stop with info state
   * @param {string} [text] - Info message
   * @returns {Spinner} This spinner instance
   */
  info(text) {
    this.#ora.info(text);
    this.#active = false;
    return this;
  }

  /**
   * Update spinner text
   * @param {string} text - New text
   * @returns {Spinner} This spinner instance
   */
  text(text) {
    this.#ora.text = text;
    return this;
  }

  /**
   * Update spinner color
   * @param {string} color - New color
   * @returns {Spinner} This spinner instance
   */
  color(color) {
    this.#ora.color = color;
    return this;
  }

  /**
   * Check if spinner is active
   * @returns {boolean} True if spinning
   */
  get isSpinning() {
    return this.#active;
  }

  /**
   * Clear the spinner line
   * @returns {Spinner} This spinner instance
   */
  clear() {
    this.#ora.clear();
    return this;
  }

  /**
   * Render a frame manually
   * @returns {Spinner} This spinner instance
   */
  render() {
    this.#ora.render();
    return this;
  }

  /**
   * Change spinner type dynamically
   * @param {string} type - Spinner type name
   * @returns {Spinner} This spinner instance
   */
  setType(type) {
    if (SpinnerTypes[type]) {
      this.#type = type;
      this.#ora.spinner = SpinnerTypes[type];
    }
    return this;
  }

  /**
   * Get current spinner type
   * @returns {string} Current spinner type name
   */
  get type() {
    return this.#type;
  }

  /**
   * Set custom animation frames
   * @param {string[]} frames - Array of animation frames
   * @param {number} [interval=80] - Animation interval in ms
   * @returns {Spinner} This spinner instance
   */
  setFrames(frames, interval = 80) {
    this.#ora.spinner = { frames, interval };
    return this;
  }

  /**
   * Set prefix text (appears before spinner)
   * @param {string} prefix - Prefix text
   * @returns {Spinner} This spinner instance
   */
  prefixText(prefix) {
    this.#ora.prefixText = prefix;
    return this;
  }

  /**
   * Set suffix text (appears after spinner text)
   * @param {string} suffix - Suffix text
   * @returns {Spinner} This spinner instance
   */
  suffixText(suffix) {
    this.#ora.suffixText = suffix;
    return this;
  }
}

/**
 * Progress bar indicator
 */
export class ProgressBar {
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

  /**
   * Create a new progress bar
   * @param {Object} options - Progress bar options
   * @param {number} [options.total=100] - Total value
   * @param {number} [options.width=30] - Bar width in characters
   * @param {string} [options.label=''] - Label text
   * @param {Object} [options.theme] - Theme object
   */
  constructor(options = {}) {
    this.#total = options.total || 100;
    this.#width = options.width || 30;
    this.#label = options.label || '';
    this.#theme = options.theme || HydraTheme;
  }

  /**
   * Update progress
   * @param {number} value - Current value
   * @param {string} [label] - Optional new label
   * @returns {ProgressBar} This progress bar
   */
  update(value, label) {
    this.#current = Math.min(value, this.#total);
    if (label !== undefined) this.#label = label;
    this.#render();
    return this;
  }

  /**
   * Increment progress
   * @param {number} [amount=1] - Amount to increment
   * @returns {ProgressBar} This progress bar
   */
  increment(amount = 1) {
    return this.update(this.#current + amount);
  }

  /**
   * Complete the progress bar
   * @param {string} [label] - Completion label
   * @returns {ProgressBar} This progress bar
   */
  complete(label) {
    return this.update(this.#total, label || 'Complete');
  }

  /**
   * Render the progress bar
   * @private
   */
  #render() {
    const percent = this.#current / this.#total;
    const filled = Math.round(this.#width * percent);
    const empty = this.#width - filled;

    const bar = this.#theme.colors.primary('[') +
      this.#theme.colors.success('='.repeat(filled)) +
      this.#theme.colors.dim('-'.repeat(empty)) +
      this.#theme.colors.primary(']');

    const percentStr = this.#theme.colors.highlight(
      `${Math.round(percent * 100)}%`.padStart(4)
    );

    const label = this.#label ? ` ${this.#theme.colors.dim(this.#label)}` : '';

    // Clear line and write
    process.stdout.write(`\r\x1b[K${bar} ${percentStr}${label}`);
  }

  /**
   * Finish and move to new line
   */
  finish() {
    console.log();
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
}

/**
 * Create a simple spinner
 * @param {string|SpinnerOptions} textOrOptions - Initial text or full options object
 * @returns {Spinner} New spinner instance
 */
export function createSpinner(textOrOptions) {
  if (typeof textOrOptions === 'string') {
    return new Spinner({ text: textOrOptions });
  }
  return new Spinner(textOrOptions);
}

/**
 * Create a spinner with specific type
 * @param {string} type - Spinner type name
 * @param {string} [text] - Initial text
 * @returns {Spinner} New spinner instance
 */
export function createTypedSpinner(type, text) {
  return new Spinner({ type, text });
}

/**
 * Create a progress bar
 * @param {Object} options - Progress bar options
 * @returns {ProgressBar} New progress bar instance
 */
export function createProgressBar(options) {
  return new ProgressBar(options);
}

/**
 * Multi-spinner manager for concurrent spinners
 */
export class MultiSpinner {
  /** @type {Map<string, Spinner>} */
  #spinners = new Map();

  /**
   * Add a new spinner
   * @param {string} id - Unique spinner identifier
   * @param {SpinnerOptions} options - Spinner options
   * @returns {Spinner} The created spinner
   */
  add(id, options = {}) {
    const spinner = new Spinner(options);
    this.#spinners.set(id, spinner);
    return spinner;
  }

  /**
   * Get a spinner by ID
   * @param {string} id - Spinner identifier
   * @returns {Spinner|undefined} The spinner or undefined
   */
  get(id) {
    return this.#spinners.get(id);
  }

  /**
   * Remove a spinner
   * @param {string} id - Spinner identifier
   * @returns {boolean} True if removed
   */
  remove(id) {
    const spinner = this.#spinners.get(id);
    if (spinner) {
      spinner.stop();
      this.#spinners.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Start all spinners
   * @returns {MultiSpinner} This instance
   */
  startAll() {
    for (const spinner of this.#spinners.values()) {
      spinner.start();
    }
    return this;
  }

  /**
   * Stop all spinners
   * @returns {MultiSpinner} This instance
   */
  stopAll() {
    for (const spinner of this.#spinners.values()) {
      spinner.stop();
    }
    return this;
  }

  /**
   * Succeed all spinners
   * @param {string} [text] - Success message
   * @returns {MultiSpinner} This instance
   */
  succeedAll(text) {
    for (const spinner of this.#spinners.values()) {
      spinner.succeed(text);
    }
    return this;
  }

  /**
   * Fail all spinners
   * @param {string} [text] - Failure message
   * @returns {MultiSpinner} This instance
   */
  failAll(text) {
    for (const spinner of this.#spinners.values()) {
      spinner.fail(text);
    }
    return this;
  }

  /**
   * Get count of active spinners
   * @returns {number} Number of active spinners
   */
  get activeCount() {
    let count = 0;
    for (const spinner of this.#spinners.values()) {
      if (spinner.isSpinning) count++;
    }
    return count;
  }

  /**
   * Get all spinner IDs
   * @returns {string[]} Array of spinner IDs
   */
  get ids() {
    return Array.from(this.#spinners.keys());
  }
}

/**
 * Animated text effects for CLI
 */
export class AnimatedText {
  /**
   * Create typing animation effect
   * @param {string} text - Text to animate
   * @param {number} [speed=50] - Typing speed in ms per character
   * @returns {Promise<void>}
   */
  static async typewriter(text, speed = 50) {
    for (const char of text) {
      process.stdout.write(char);
      await new Promise(resolve => setTimeout(resolve, speed));
    }
    process.stdout.write('\n');
  }

  /**
   * Create rainbow text animation
   * @param {string} text - Text to colorize
   * @param {number} [cycles=1] - Number of color cycles
   * @returns {Promise<void>}
   */
  static async rainbow(text, cycles = 1) {
    const colors = ['\x1b[31m', '\x1b[33m', '\x1b[32m', '\x1b[36m', '\x1b[34m', '\x1b[35m'];
    for (let cycle = 0; cycle < cycles; cycle++) {
      for (let i = 0; i < colors.length; i++) {
        process.stdout.write('\r' + colors[i] + text + '\x1b[0m');
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
    process.stdout.write('\n');
  }

  /**
   * Create pulsing text animation
   * @param {string} text - Text to pulse
   * @param {number} [duration=2000] - Total duration in ms
   * @returns {Promise<void>}
   */
  static async pulse(text, duration = 2000) {
    const intensities = ['\x1b[2m', '\x1b[0m', '\x1b[1m', '\x1b[0m'];
    const start = Date.now();
    let i = 0;
    while (Date.now() - start < duration) {
      process.stdout.write('\r' + intensities[i % intensities.length] + text + '\x1b[0m');
      await new Promise(resolve => setTimeout(resolve, 200));
      i++;
    }
    process.stdout.write('\r' + text + '\n');
  }

  /**
   * Create slide-in text animation
   * @param {string} text - Text to slide in
   * @param {number} [width=40] - Starting width
   * @returns {Promise<void>}
   */
  static async slideIn(text, width = 40) {
    for (let i = width; i >= 0; i--) {
      const padding = ' '.repeat(i);
      process.stdout.write('\r' + padding + text + ' '.repeat(Math.max(0, width - i - text.length)));
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    process.stdout.write('\n');
  }

  /**
   * Create blinking cursor effect
   * @param {string} text - Text to display with cursor
   * @param {number} [blinks=5] - Number of blinks
   * @returns {Promise<void>}
   */
  static async blinkingCursor(text, blinks = 5) {
    for (let i = 0; i < blinks; i++) {
      process.stdout.write('\r' + text + '█');
      await new Promise(resolve => setTimeout(resolve, 400));
      process.stdout.write('\r' + text + ' ');
      await new Promise(resolve => setTimeout(resolve, 400));
    }
    process.stdout.write('\r' + text + '\n');
  }
}

/**
 * Create a multi-spinner manager
 * @returns {MultiSpinner} New multi-spinner instance
 */
export function createMultiSpinner() {
  return new MultiSpinner();
}

/**
 * Demo all spinner types (for testing)
 * @param {number} [duration=2000] - Duration per spinner in ms
 */
export async function demoSpinners(duration = 2000) {
  const types = getAvailableSpinnerTypes();
  console.log('\n🎨 Spinner Types Demo\n');

  for (const type of types.slice(0, 10)) { // Show first 10 types
    const spinner = createTypedSpinner(type, `Spinner type: ${type}`);
    spinner.start();
    await new Promise(resolve => setTimeout(resolve, duration));
    spinner.succeed(`${type} complete`);
  }

  console.log(`\n✨ Total ${types.length} spinner types available`);
  console.log('Available types:', types.join(', '));
}

// Re-export advanced progress bar system
export {
  AdvancedProgressBar,
  MultiProgressBar,
  PROGRESS_STYLES,
  createAdvancedProgressBar,
  createMultiProgressBar,
  demoProgressStyles
} from './progress.js';

export default Spinner;

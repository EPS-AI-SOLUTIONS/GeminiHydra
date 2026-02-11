/**
 * @fileoverview ANSI color codes and styling utilities for terminal output
 * Provides cross-platform color support with fallback for non-TTY environments.
 * Includes true color (24-bit), 256 color palette, gradients, and themed color schemes.
 * @module logger/colors
 *
 * Ported from ClaudeCli to GeminiCLI
 */

// ============================================================================
// ANSI Escape Codes
// ============================================================================

export const RESET = '\x1b[0m';

// ============================================================================
// Text Styles
// ============================================================================

export const Styles = Object.freeze({
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
  ITALIC: '\x1b[3m',
  UNDERLINE: '\x1b[4m',
  BLINK: '\x1b[5m',
  RAPID_BLINK: '\x1b[6m',
  INVERSE: '\x1b[7m',
  HIDDEN: '\x1b[8m',
  STRIKETHROUGH: '\x1b[9m',
  DOUBLE_UNDERLINE: '\x1b[21m',
  OVERLINE: '\x1b[53m',
  FRAMED: '\x1b[51m',
  ENCIRCLED: '\x1b[52m',
});

// ============================================================================
// Foreground Colors
// ============================================================================

export const FgColors = Object.freeze({
  BLACK: '\x1b[30m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
  DEFAULT: '\x1b[39m',
  GRAY: '\x1b[90m',
  GREY: '\x1b[90m',
  BRIGHT_RED: '\x1b[91m',
  BRIGHT_GREEN: '\x1b[92m',
  BRIGHT_YELLOW: '\x1b[93m',
  BRIGHT_BLUE: '\x1b[94m',
  BRIGHT_MAGENTA: '\x1b[95m',
  BRIGHT_CYAN: '\x1b[96m',
  BRIGHT_WHITE: '\x1b[97m',
});

// ============================================================================
// Background Colors
// ============================================================================

export const BgColors = Object.freeze({
  BLACK: '\x1b[40m',
  RED: '\x1b[41m',
  GREEN: '\x1b[42m',
  YELLOW: '\x1b[43m',
  BLUE: '\x1b[44m',
  MAGENTA: '\x1b[45m',
  CYAN: '\x1b[46m',
  WHITE: '\x1b[47m',
  DEFAULT: '\x1b[49m',
  BRIGHT_BLACK: '\x1b[100m',
  BRIGHT_RED: '\x1b[101m',
  BRIGHT_GREEN: '\x1b[102m',
  BRIGHT_YELLOW: '\x1b[103m',
  BRIGHT_BLUE: '\x1b[104m',
  BRIGHT_MAGENTA: '\x1b[105m',
  BRIGHT_CYAN: '\x1b[106m',
  BRIGHT_WHITE: '\x1b[107m',
});

// ============================================================================
// Combined Colors Object (Backwards Compatible)
// ============================================================================

export const COLORS = Object.freeze({
  reset: RESET,
  bright: Styles.BOLD,
  dim: Styles.DIM,
  italic: Styles.ITALIC,
  underline: Styles.UNDERLINE,
  inverse: Styles.INVERSE,
  hidden: Styles.HIDDEN,
  strikethrough: Styles.STRIKETHROUGH,
  black: FgColors.BLACK,
  red: FgColors.RED,
  green: FgColors.GREEN,
  yellow: FgColors.YELLOW,
  blue: FgColors.BLUE,
  magenta: FgColors.MAGENTA,
  cyan: FgColors.CYAN,
  white: FgColors.WHITE,
  gray: FgColors.GRAY,
  grey: FgColors.GREY,
  brightRed: FgColors.BRIGHT_RED,
  brightGreen: FgColors.BRIGHT_GREEN,
  brightYellow: FgColors.BRIGHT_YELLOW,
  brightBlue: FgColors.BRIGHT_BLUE,
  brightMagenta: FgColors.BRIGHT_MAGENTA,
  brightCyan: FgColors.BRIGHT_CYAN,
  brightWhite: FgColors.BRIGHT_WHITE,
  bgBlack: BgColors.BLACK,
  bgRed: BgColors.RED,
  bgGreen: BgColors.GREEN,
  bgYellow: BgColors.YELLOW,
  bgBlue: BgColors.BLUE,
  bgMagenta: BgColors.MAGENTA,
  bgCyan: BgColors.CYAN,
  bgWhite: BgColors.WHITE,
  bgBrightBlack: BgColors.BRIGHT_BLACK,
  bgBrightRed: BgColors.BRIGHT_RED,
  bgBrightGreen: BgColors.BRIGHT_GREEN,
  bgBrightYellow: BgColors.BRIGHT_YELLOW,
  bgBrightBlue: BgColors.BRIGHT_BLUE,
  bgBrightMagenta: BgColors.BRIGHT_MAGENTA,
  bgBrightCyan: BgColors.BRIGHT_CYAN,
  bgBrightWhite: BgColors.BRIGHT_WHITE,
});

// ============================================================================
// Color Detection
// ============================================================================

export function supportsColors() {
  if (process.env.FORCE_COLOR !== undefined) {
    return process.env.FORCE_COLOR !== '0';
  }
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }
  if (!process.stdout.isTTY) {
    return false;
  }
  const term = process.env.TERM || '';
  if (term === 'dumb') {
    return false;
  }
  if (process.env.CI) {
    const supportedCI = ['TRAVIS', 'CIRCLECI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'BUILDKITE'];
    if (supportedCI.some((ci) => process.env[ci])) {
      return true;
    }
  }
  if (process.platform === 'win32') {
    const osRelease = require('node:os').release().split('.');
    if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
      return true;
    }
    return false;
  }
  return true;
}

export function getColorDepth() {
  if (!supportsColors()) return 1;
  const colorTerm = process.env.COLORTERM || '';
  if (colorTerm === 'truecolor' || colorTerm === '24bit') return 24;
  const termProgram = process.env.TERM_PROGRAM || '';
  if (['iTerm.app', 'Hyper', 'Apple_Terminal', 'vscode'].includes(termProgram)) return 24;
  const term = process.env.TERM || '';
  if (term.includes('256') || term.includes('256color')) return 8;
  if (process.env.WT_SESSION) return 24;
  return 4;
}

export function supportsTrueColor() {
  return getColorDepth() === 24;
}

export function supports256Colors() {
  return getColorDepth() >= 8;
}

// ============================================================================
// Color Application Functions
// ============================================================================

export function colorize(text, colorCode) {
  if (!supportsColors()) return text;
  return `${colorCode}${text}${RESET}`;
}

export function createColorFormatter(colorCode) {
  return (text) => colorize(text, colorCode);
}

export function stripAnsi(text) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ANSI escape sequence stripping
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

export function visibleLength(text) {
  return stripAnsi(text).length;
}

// ============================================================================
// Convenience Color Functions
// ============================================================================

export const red = createColorFormatter(FgColors.RED);
export const green = createColorFormatter(FgColors.GREEN);
export const yellow = createColorFormatter(FgColors.YELLOW);
export const blue = createColorFormatter(FgColors.BLUE);
export const magenta = createColorFormatter(FgColors.MAGENTA);
export const cyan = createColorFormatter(FgColors.CYAN);
export const white = createColorFormatter(FgColors.WHITE);
export const gray = createColorFormatter(FgColors.GRAY);
export const grey = gray;
export const black = createColorFormatter(FgColors.BLACK);

export const bold = createColorFormatter(Styles.BOLD);
export const dim = createColorFormatter(Styles.DIM);
export const italic = createColorFormatter(Styles.ITALIC);
export const underline = createColorFormatter(Styles.UNDERLINE);
export const inverse = createColorFormatter(Styles.INVERSE);
export const strikethrough = createColorFormatter(Styles.STRIKETHROUGH);

// ============================================================================
// Semantic Color Functions
// ============================================================================

export function error(text) {
  return colorize(text, FgColors.RED);
}

export function warning(text) {
  return colorize(text, FgColors.YELLOW);
}

export function success(text) {
  return colorize(text, FgColors.GREEN);
}

export function info(text) {
  return colorize(text, FgColors.CYAN);
}

export function debug(text) {
  return colorize(text, FgColors.GRAY);
}

// ============================================================================
// 256-Color Support
// ============================================================================

export function fg256(colorCode) {
  const code = Math.max(0, Math.min(255, Math.floor(colorCode)));
  return `\x1b[38;5;${code}m`;
}

export function bg256(colorCode) {
  const code = Math.max(0, Math.min(255, Math.floor(colorCode)));
  return `\x1b[48;5;${code}m`;
}

export function color256(text, colorCode) {
  if (!supports256Colors()) return text;
  return `${fg256(colorCode)}${text}${RESET}`;
}

export function rgbTo256(r, g, b) {
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  const rIndex = Math.round((r / 255) * 5);
  const gIndex = Math.round((g / 255) * 5);
  const bIndex = Math.round((b / 255) * 5);
  return 16 + 36 * rIndex + 6 * gIndex + bIndex;
}

// ============================================================================
// True Color (24-bit) Support
// ============================================================================

export function fgRGB(r, g, b) {
  const rc = Math.max(0, Math.min(255, Math.floor(r)));
  const gc = Math.max(0, Math.min(255, Math.floor(g)));
  const bc = Math.max(0, Math.min(255, Math.floor(b)));
  return `\x1b[38;2;${rc};${gc};${bc}m`;
}

export function bgRGB(r, g, b) {
  const rc = Math.max(0, Math.min(255, Math.floor(r)));
  const gc = Math.max(0, Math.min(255, Math.floor(g)));
  const bc = Math.max(0, Math.min(255, Math.floor(b)));
  return `\x1b[48;2;${rc};${gc};${bc}m`;
}

export function rgb(text, r, g, b) {
  if (!supportsTrueColor()) {
    if (supports256Colors()) {
      return color256(text, rgbTo256(r, g, b));
    }
    return text;
  }
  return `${fgRGB(r, g, b)}${text}${RESET}`;
}

export function hexToRgb(hex) {
  let clean = hex.replace('#', '');
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  return { r, g, b };
}

export function hex(text, hexColor) {
  const { r, g, b } = hexToRgb(hexColor);
  return rgb(text, r, g, b);
}

// ============================================================================
// Gradient Support
// ============================================================================

export function interpolateColor(color1, color2, factor) {
  return {
    r: Math.round(color1.r + (color2.r - color1.r) * factor),
    g: Math.round(color1.g + (color2.g - color1.g) * factor),
    b: Math.round(color1.b + (color2.b - color1.b) * factor),
  };
}

export function createGradientColors(colors, steps) {
  if (colors.length < 2) {
    throw new Error('Gradient requires at least 2 colors');
  }
  const rgbColors = colors.map((c) => hexToRgb(c));
  const result = [];
  const segmentSteps = Math.ceil(steps / (colors.length - 1));
  for (let i = 0; i < colors.length - 1; i++) {
    const startColor = rgbColors[i];
    const endColor = rgbColors[i + 1];
    for (let j = 0; j < segmentSteps && result.length < steps; j++) {
      const factor = j / segmentSteps;
      result.push(interpolateColor(startColor, endColor, factor));
    }
  }
  while (result.length < steps) {
    result.push(rgbColors[rgbColors.length - 1]);
  }
  return result.slice(0, steps);
}

export function gradient(text, colors) {
  if (!supportsTrueColor() && !supports256Colors()) return text;
  const chars = stripAnsi(text).split('');
  if (chars.length === 0) return text;
  const gradientColors = createGradientColors(colors, chars.length);
  let result = '';
  for (let i = 0; i < chars.length; i++) {
    const { r, g, b } = gradientColors[i];
    if (supportsTrueColor()) {
      result += `${fgRGB(r, g, b)}${chars[i]}`;
    } else {
      result += `${fg256(rgbTo256(r, g, b))}${chars[i]}`;
    }
  }
  return result + RESET;
}

export function rainbow(text) {
  return gradient(text, [
    '#ff0000',
    '#ff7f00',
    '#ffff00',
    '#00ff00',
    '#0000ff',
    '#4b0082',
    '#9400d3',
  ]);
}

// ============================================================================
// Predefined Gradients
// ============================================================================

export const Gradients = Object.freeze({
  RAINBOW: ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#9400d3'],
  MATRIX: ['#00ff00', '#003300', '#00ff00', '#009900'],
  CYBERPUNK: ['#ff00ff', '#00ffff', '#ff0080', '#00ff00'],
  SUNSET: ['#ff512f', '#f09819', '#ff5e62', '#ff9966'],
  OCEAN: ['#2193b0', '#6dd5ed', '#00d2ff', '#3a7bd5'],
});

// ============================================================================
// Progress Bar
// ============================================================================

export function progressBar(current, total, options = {}) {
  const width = options.width || 30;
  const completeChar = options.completeChar || '\u2588';
  const incompleteChar = options.incompleteChar || '\u2591';
  const percent = Math.min(1, Math.max(0, current / total));
  const completeWidth = Math.round(width * percent);
  const incompleteWidth = width - completeWidth;
  let complete = completeChar.repeat(completeWidth);
  let incomplete = incompleteChar.repeat(incompleteWidth);
  if (options.completeColor) {
    complete = hex(complete, options.completeColor);
  }
  if (options.incompleteColor) {
    incomplete = hex(incomplete, options.incompleteColor);
  }
  return `${complete}${incomplete} ${Math.round(percent * 100)}%`;
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  COLORS,
  Styles,
  FgColors,
  BgColors,
  RESET,
  supportsColors,
  getColorDepth,
  supportsTrueColor,
  supports256Colors,
  colorize,
  createColorFormatter,
  stripAnsi,
  visibleLength,
  red,
  green,
  yellow,
  blue,
  magenta,
  cyan,
  white,
  gray,
  grey,
  black,
  bold,
  dim,
  italic,
  underline,
  inverse,
  strikethrough,
  error,
  warning,
  success,
  info,
  debug,
  fg256,
  bg256,
  color256,
  rgbTo256,
  fgRGB,
  bgRGB,
  rgb,
  hexToRgb,
  hex,
  interpolateColor,
  createGradientColors,
  gradient,
  rainbow,
  Gradients,
  progressBar,
};

/**
 * HYDRA CLI Banner System
 * Modern animated banner with ASCII art and gradient colors
 * @module cli/Banner
 */

import chalk from 'chalk';

/**
 * HYDRA version info
 */
export const VERSION = '2.0.0';
export const CODENAME = 'Cerberus';

/**
 * Gradient color utilities
 */
const gradients = {
  /**
   * Create a horizontal gradient between two hex colors
   * @param {string} text - Text to colorize
   * @param {string} startHex - Starting color hex
   * @param {string} endHex - Ending color hex
   * @returns {string} Gradient colored text
   */
  horizontal: (text, startHex, endHex) => {
    const start = hexToRgb(startHex);
    const end = hexToRgb(endHex);
    const chars = text.split('');
    const len = chars.length;

    return chars.map((char, i) => {
      const ratio = len > 1 ? i / (len - 1) : 0;
      const r = Math.round(start.r + (end.r - start.r) * ratio);
      const g = Math.round(start.g + (end.g - start.g) * ratio);
      const b = Math.round(start.b + (end.b - start.b) * ratio);
      return chalk.rgb(r, g, b)(char);
    }).join('');
  },

  /**
   * Cyan to Magenta gradient
   */
  cyberPunk: (text) => gradients.horizontal(text, '#00ffff', '#ff00ff'),

  /**
   * Purple to Cyan gradient
   */
  hydra: (text) => gradients.horizontal(text, '#8b5cf6', '#22d3ee'),

  /**
   * Green to Blue gradient
   */
  matrix: (text) => gradients.horizontal(text, '#00ff00', '#0080ff'),

  /**
   * Orange to Pink gradient
   */
  sunset: (text) => gradients.horizontal(text, '#ff8c00', '#ff1493'),

  /**
   * Multi-color rainbow effect
   */
  rainbow: (text) => {
    const colors = ['#ff0000', '#ff7f00', '#ffff00', '#00ff00', '#0000ff', '#4b0082', '#8f00ff'];
    const chars = text.split('');
    return chars.map((char, i) => {
      const colorIndex = i % colors.length;
      return chalk.hex(colors[colorIndex])(char);
    }).join('');
  }
};

/**
 * Convert hex color to RGB object
 * @param {string} hex - Hex color string
 * @returns {{r: number, g: number, b: number}} RGB object
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 255, g: 255, b: 255 };
}

/**
 * Sleep utility for animations
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * HYDRA ASCII Art Logos
 */
const LOGOS = {
  /**
   * Main HYDRA logo - Three-headed beast
   */
  hydra: [
    '                    .--.      .--.      .--.                    ',
    '                   /    \\    /    \\    /    \\                   ',
    '                  | .--. |  | .--. |  | .--. |                  ',
    '                  |/    \\|  |/    \\|  |/    \\|                  ',
    '                   \\    /    \\    /    \\    /                   ',
    '                    \\  /  __  \\  /  __  \\  /                    ',
    '                     \\/  /  \\  \\/  /  \\  \\/                     ',
    '                      | |    | || |    | |                      ',
    '                      | |    | || |    | |                      ',
    '                       \\|    |/  \\|    |/                       ',
    '                        \\    /    \\    /                        ',
    '                         \\  /      \\  /                         ',
    '                          \\/        \\/                          '
  ],

  /**
   * Compact HYDRA text logo
   */
  compact: [
    ' _   ___   _______ _____            ',
    '| | | \\ \\ / /  _  |  _  \\     /\\    ',
    '| |_| |\\ V /| | | | |_) |    /  \\   ',
    '|  _  | \\ / | | | |  _ <    / /\\ \\  ',
    '| | | | | | | |_| | | \\ \\  / ____ \\ ',
    '|_| |_| |_| |_____|_|  \\_\\/_/    \\_\\'
  ],

  /**
   * Large HYDRA text with shadow effect
   */
  large: [
    '██╗  ██╗██╗   ██╗██████╗ ██████╗  █████╗ ',
    '██║  ██║╚██╗ ██╔╝██╔══██╗██╔══██╗██╔══██╗',
    '███████║ ╚████╔╝ ██║  ██║██████╔╝███████║',
    '██╔══██║  ╚██╔╝  ██║  ██║██╔══██╗██╔══██║',
    '██║  ██║   ██║   ██████╔╝██║  ██║██║  ██║',
    '╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝'
  ],

  /**
   * Minimal clean logo
   */
  minimal: [
    '╦ ╦╦ ╦╔╦╗╦═╗╔═╗',
    '╠═╣╚╦╝ ║║╠╦╝╠═╣',
    '╩ ╩ ╩ ═╩╝╩╚═╩ ╩'
  ],

  /**
   * Snake/dragon style logo
   */
  dragon: [
    '    __  ____  ______  ___  ___   ',
    '   / / / /\\ \\/ / __ \\/ _ \\/ _ \\  ',
    '  / /_/ /  \\  / /_/ / , _/ __ \\  ',
    ' / __  /   / / ____/_/|_/_/ |_|  ',
    '/_/ /_/   /_/_/                  '
  ]
};

/**
 * Border styles
 */
const BORDERS = {
  double: {
    topLeft: '╔', topRight: '╗',
    bottomLeft: '╚', bottomRight: '╝',
    horizontal: '═', vertical: '║',
    teeDown: '╦', teeUp: '╩',
    teeLeft: '╣', teeRight: '╠',
    cross: '╬'
  },
  single: {
    topLeft: '┌', topRight: '┐',
    bottomLeft: '└', bottomRight: '┘',
    horizontal: '─', vertical: '│',
    teeDown: '┬', teeUp: '┴',
    teeLeft: '┤', teeRight: '├',
    cross: '┼'
  },
  rounded: {
    topLeft: '╭', topRight: '╮',
    bottomLeft: '╰', bottomRight: '╯',
    horizontal: '─', vertical: '│',
    teeDown: '┬', teeUp: '┴',
    teeLeft: '┤', teeRight: '├',
    cross: '┼'
  },
  heavy: {
    topLeft: '┏', topRight: '┓',
    bottomLeft: '┗', bottomRight: '┛',
    horizontal: '━', vertical: '┃',
    teeDown: '┳', teeUp: '┻',
    teeLeft: '┫', teeRight: '┣',
    cross: '╋'
  }
};

/**
 * Get terminal width
 * @returns {number} Terminal width
 */
function getTerminalWidth() {
  return process.stdout.columns || 80;
}

/**
 * Center text within terminal width
 * @param {string} text - Text to center
 * @param {number} [width] - Terminal width
 * @returns {string} Centered text
 */
function centerText(text, width) {
  const termWidth = width || getTerminalWidth();
  // Strip ANSI codes for accurate length calculation
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');
  const padding = Math.max(0, Math.floor((termWidth - stripped.length) / 2));
  return ' '.repeat(padding) + text;
}

/**
 * Create a horizontal line
 * @param {string} char - Character to use
 * @param {number} [width] - Line width
 * @returns {string} Horizontal line
 */
function horizontalLine(char = '─', width) {
  const termWidth = width || getTerminalWidth();
  return char.repeat(termWidth);
}

/**
 * Create a box around content
 * @param {string[]} lines - Content lines
 * @param {Object} [options] - Box options
 * @returns {string[]} Boxed content
 */
function createBox(lines, options = {}) {
  const {
    border = BORDERS.double,
    padding = 1,
    width,
    title,
    titleAlign = 'center',
    gradient = false
  } = options;

  const termWidth = width || getTerminalWidth();
  const contentWidth = Math.max(
    ...lines.map(l => l.replace(/\x1b\[[0-9;]*m/g, '').length),
    title ? title.length + 4 : 0
  );
  const boxWidth = Math.min(contentWidth + (padding * 2) + 2, termWidth);
  const innerWidth = boxWidth - 2;

  const result = [];

  // Top border
  let topLine = border.topLeft + border.horizontal.repeat(innerWidth) + border.topRight;
  if (title) {
    const titleWithSpaces = ` ${title} `;
    const titlePos = titleAlign === 'center'
      ? Math.floor((innerWidth - titleWithSpaces.length) / 2)
      : titleAlign === 'right'
        ? innerWidth - titleWithSpaces.length - 1
        : 1;
    topLine = border.topLeft +
      border.horizontal.repeat(titlePos) +
      chalk.bold.white(titleWithSpaces) +
      border.horizontal.repeat(innerWidth - titlePos - titleWithSpaces.length) +
      border.topRight;
  }
  result.push(gradient ? gradients.hydra(topLine) : chalk.gray(topLine));

  // Content
  for (const line of lines) {
    const stripped = line.replace(/\x1b\[[0-9;]*m/g, '');
    const padRight = innerWidth - stripped.length - padding;
    const contentLine = border.vertical +
      ' '.repeat(padding) +
      line +
      ' '.repeat(Math.max(0, padRight)) +
      border.vertical;
    result.push(gradient ? gradients.hydra(contentLine) : chalk.gray(contentLine));
  }

  // Bottom border
  const bottomLine = border.bottomLeft + border.horizontal.repeat(innerWidth) + border.bottomRight;
  result.push(gradient ? gradients.hydra(bottomLine) : chalk.gray(bottomLine));

  return result;
}

/**
 * Animation frames for typing effect
 * @param {string} text - Text to animate
 * @param {Function} colorFn - Color function
 * @returns {AsyncGenerator<string>}
 */
async function* typingAnimation(text, colorFn = chalk.white) {
  for (let i = 0; i <= text.length; i++) {
    yield colorFn(text.slice(0, i)) + chalk.gray('_');
    await sleep(30);
  }
  yield colorFn(text);
}

/**
 * Animate text with fade-in effect
 * @param {string[]} lines - Lines to animate
 * @param {number} delay - Delay between lines
 */
async function fadeInAnimation(lines, delay = 50) {
  for (const line of lines) {
    console.log(line);
    await sleep(delay);
  }
}

/**
 * Show animated HYDRA banner
 * @param {Object} [options] - Banner options
 * @param {boolean} [options.animated=true] - Enable animation
 * @param {string} [options.logo='large'] - Logo style: 'hydra', 'compact', 'large', 'minimal', 'dragon'
 * @param {string} [options.gradient='hydra'] - Gradient style: 'hydra', 'cyberPunk', 'matrix', 'sunset', 'rainbow'
 * @param {boolean} [options.showInfo=true] - Show version info
 * @param {boolean} [options.showCommands=true] - Show quick commands
 * @param {Object} [options.theme] - Theme object for colors
 */
export async function showBanner(options = {}) {
  const {
    animated = true,
    logo = 'large',
    gradient = 'hydra',
    showInfo = true,
    showCommands = true,
    theme = null
  } = options;

  const gradientFn = gradients[gradient] || gradients.hydra;
  const termWidth = getTerminalWidth();
  const border = BORDERS.double;

  // Clear any previous content
  console.log();

  // Create banner content
  const bannerLines = [];

  // Top border with gradient
  const topBorder = border.topLeft + border.horizontal.repeat(termWidth - 2) + border.topRight;
  bannerLines.push(gradientFn(topBorder));

  // Empty line
  bannerLines.push(gradientFn(border.vertical) + ' '.repeat(termWidth - 2) + gradientFn(border.vertical));

  // Logo
  const logoLines = LOGOS[logo] || LOGOS.large;
  for (const line of logoLines) {
    const centered = centerText(line, termWidth - 4);
    bannerLines.push(
      gradientFn(border.vertical) + ' ' +
      gradientFn(centered) +
      ' '.repeat(Math.max(0, termWidth - centered.replace(/\x1b\[[0-9;]*m/g, '').length - 4)) +
      ' ' + gradientFn(border.vertical)
    );
  }

  // Subtitle
  bannerLines.push(gradientFn(border.vertical) + ' '.repeat(termWidth - 2) + gradientFn(border.vertical));
  const subtitle = 'Three-Headed AI Orchestration System';
  const subtitleCentered = centerText(chalk.dim(subtitle), termWidth - 4);
  bannerLines.push(
    gradientFn(border.vertical) + ' ' +
    subtitleCentered +
    ' '.repeat(Math.max(0, termWidth - subtitle.length - 4 - Math.floor((termWidth - 4 - subtitle.length) / 2))) +
    ' ' + gradientFn(border.vertical)
  );

  // Version info
  if (showInfo) {
    bannerLines.push(gradientFn(border.vertical) + ' '.repeat(termWidth - 2) + gradientFn(border.vertical));

    // Separator
    const sepLine = border.teeRight + border.horizontal.repeat(termWidth - 2) + border.teeLeft;
    bannerLines.push(gradientFn(sepLine));

    bannerLines.push(gradientFn(border.vertical) + ' '.repeat(termWidth - 2) + gradientFn(border.vertical));

    // Version and codename
    const versionText = `v${VERSION}`;
    const codenameText = `"${CODENAME}"`;
    const providers = 'Gemini + Ollama + Tools';

    const infoLine = `${chalk.bold.cyan(versionText)}  ${chalk.magenta(codenameText)}  ${chalk.dim('|')}  ${chalk.yellow(providers)}`;
    const infoStripped = `v${VERSION}  "${CODENAME}"  |  ${providers}`;
    const infoPadding = Math.floor((termWidth - 4 - infoStripped.length) / 2);

    bannerLines.push(
      gradientFn(border.vertical) + ' '.repeat(infoPadding + 1) +
      infoLine +
      ' '.repeat(Math.max(0, termWidth - 3 - infoPadding - infoStripped.length)) +
      gradientFn(border.vertical)
    );

    // System info
    const nodeVersion = `Node ${process.version}`;
    const platform = `${process.platform}`;
    const sysInfo = `${chalk.dim(nodeVersion + ' | ' + platform)}`;
    const sysInfoStripped = `${nodeVersion} | ${platform}`;
    const sysPadding = Math.floor((termWidth - 4 - sysInfoStripped.length) / 2);

    bannerLines.push(
      gradientFn(border.vertical) + ' '.repeat(sysPadding + 1) +
      sysInfo +
      ' '.repeat(Math.max(0, termWidth - 3 - sysPadding - sysInfoStripped.length)) +
      gradientFn(border.vertical)
    );
  }

  // Quick commands
  if (showCommands) {
    bannerLines.push(gradientFn(border.vertical) + ' '.repeat(termWidth - 2) + gradientFn(border.vertical));

    // Separator
    const sepLine = border.teeRight + border.horizontal.repeat(termWidth - 2) + border.teeLeft;
    bannerLines.push(gradientFn(sepLine));

    bannerLines.push(gradientFn(border.vertical) + ' '.repeat(termWidth - 2) + gradientFn(border.vertical));

    // Commands header
    const cmdHeader = 'Quick Commands';
    const headerPadding = Math.floor((termWidth - 4 - cmdHeader.length) / 2);
    bannerLines.push(
      gradientFn(border.vertical) + ' '.repeat(headerPadding + 1) +
      chalk.bold.white(cmdHeader) +
      ' '.repeat(Math.max(0, termWidth - 3 - headerPadding - cmdHeader.length)) +
      gradientFn(border.vertical)
    );

    bannerLines.push(gradientFn(border.vertical) + ' '.repeat(termWidth - 2) + gradientFn(border.vertical));

    // Command list
    const commands = [
      ['/health', 'Check providers', '/ollama', 'Force Ollama'],
      ['/stats', 'Usage statistics', '/gemini', 'Force Gemini'],
      ['/help', 'All commands', '/exit', 'Exit HYDRA']
    ];

    for (const row of commands) {
      const [cmd1, desc1, cmd2, desc2] = row;
      const colWidth = Math.floor((termWidth - 8) / 2);

      const col1 = `  ${chalk.cyan(cmd1.padEnd(10))} ${chalk.dim(desc1)}`;
      const col2 = `  ${chalk.cyan(cmd2.padEnd(10))} ${chalk.dim(desc2)}`;
      const col1Stripped = `  ${cmd1.padEnd(10)} ${desc1}`;
      const col2Stripped = `  ${cmd2.padEnd(10)} ${desc2}`;

      bannerLines.push(
        gradientFn(border.vertical) + ' ' +
        col1 + ' '.repeat(Math.max(0, colWidth - col1Stripped.length)) +
        col2 + ' '.repeat(Math.max(0, termWidth - 4 - colWidth - col2Stripped.length)) +
        gradientFn(border.vertical)
      );
    }
  }

  // Empty line before bottom
  bannerLines.push(gradientFn(border.vertical) + ' '.repeat(termWidth - 2) + gradientFn(border.vertical));

  // Bottom border
  const bottomBorder = border.bottomLeft + border.horizontal.repeat(termWidth - 2) + border.bottomRight;
  bannerLines.push(gradientFn(bottomBorder));

  // Display with animation or instantly
  if (animated) {
    await fadeInAnimation(bannerLines, 25);
  } else {
    console.log(bannerLines.join('\n'));
  }

  console.log();
}

/**
 * Show compact banner (for limited space)
 * @param {Object} [options] - Options
 */
export function showCompactBanner(options = {}) {
  const { gradient = 'hydra' } = options;
  const gradientFn = gradients[gradient] || gradients.hydra;

  console.log();
  console.log(gradientFn('  ██╗  ██╗██╗   ██╗██████╗ ██████╗  █████╗ '));
  console.log(gradientFn('  ██║  ██║╚██╗ ██╔╝██║  ██║██╔══██╗██╔══██╗'));
  console.log(gradientFn('  ███████║ ╚████╔╝ ██║  ██║██████╔╝███████║'));
  console.log(gradientFn('  ██╔══██║  ╚██╔╝  ██║  ██║██╔══██╗██╔══██║'));
  console.log(gradientFn('  ██║  ██║   ██║   ██████╔╝██║  ██║██║  ██║'));
  console.log(gradientFn('  ╚═╝  ╚═╝   ╚═╝   ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝'));
  console.log();
  console.log(centerText(chalk.dim(`v${VERSION} "${CODENAME}" | Gemini + Ollama + Tools`)));
  console.log();
}

/**
 * Show minimal one-line banner
 */
export function showMinimalBanner() {
  const line = gradients.hydra('HYDRA') +
    chalk.dim(` v${VERSION}`) +
    chalk.gray(' | ') +
    chalk.cyan('Gemini') +
    chalk.gray(' + ') +
    chalk.magenta('Ollama') +
    chalk.gray(' + ') +
    chalk.yellow('Tools');
  console.log();
  console.log(centerText(line));
  console.log();
}

/**
 * Show startup animation with logo reveal
 */
export async function showStartupAnimation() {
  const frames = [
    '.',
    '..',
    '...',
    'HYDRA',
    'HYDRA.',
    'HYDRA..',
    'HYDRA...',
    ''
  ];

  process.stdout.write('\n');

  for (const frame of frames) {
    process.stdout.write('\r' + centerText(gradients.hydra(frame) + '   '));
    await sleep(150);
  }

  process.stdout.write('\r' + ' '.repeat(getTerminalWidth()) + '\r');
  await showBanner({ animated: true });
}

/**
 * Exported utilities
 */
export {
  gradients,
  LOGOS,
  BORDERS,
  centerText,
  horizontalLine,
  createBox,
  hexToRgb,
  getTerminalWidth
};

export default showBanner;

/**
 * Unicode Icons and Symbols Collection
 * @module cli/icons
 *
 * Comprehensive set of modern Unicode icons for CLI applications.
 * Includes fallback ASCII versions for terminals without Unicode support.
 */

/**
 * Modern Unicode icons collection
 * @type {Object.<string, string>}
 */
export const Icons = {
  // Status indicators
  checkmark: '\u2713',           // ✓
  checkmarkBold: '\u2714',       // ✔
  checkmarkDouble: '\u2713\u2713', // ✓✓
  cross: '\u2717',               // ✗
  crossBold: '\u2718',           // ✘
  warning: '\u26A0',             // ⚠
  warningFilled: '\u26A0\uFE0F', // ⚠️
  info: '\u2139',                // ℹ
  infoFilled: '\u2139\uFE0F',    // ℹ️
  question: '\u2753',            // ❓
  exclamation: '\u2757',         // ❗

  // Arrows
  arrow: '\u2192',               // →
  arrowRight: '\u2192',          // →
  arrowLeft: '\u2190',           // ←
  arrowUp: '\u2191',             // ↑
  arrowDown: '\u2193',           // ↓
  arrowDouble: '\u21D2',         // ⇒
  arrowCurved: '\u21B3',         // ↳
  arrowReturn: '\u21A9',         // ↩
  arrowCircle: '\u27F3',         // ⟳
  arrowPointer: '\u25B6',        // ▶
  arrowTriangle: '\u25BA',       // ►

  // Common symbols
  star: '\u2605',                // ★
  starEmpty: '\u2606',           // ☆
  starHalf: '\u2BE8',            // ⯨
  heart: '\u2665',               // ♥
  heartEmpty: '\u2661',          // ♡
  lightning: '\u26A1',           // ⚡
  lightningBolt: '\u2607',       // ☇
  fire: '\u{1F525}',             // 🔥
  rocket: '\u{1F680}',           // 🚀
  sparkles: '\u2728',            // ✨

  // Technical symbols
  gear: '\u2699',                // ⚙
  gearFilled: '\u2699\uFE0F',    // ⚙️
  lock: '\u{1F512}',             // 🔒
  lockOpen: '\u{1F513}',         // 🔓
  key: '\u{1F511}',              // 🔑
  shield: '\u{1F6E1}',           // 🛡
  shieldCheck: '\u2611',         // ☑

  // Files and folders
  folder: '\u{1F4C1}',           // 📁
  folderOpen: '\u{1F4C2}',       // 📂
  file: '\u{1F4C4}',             // 📄
  fileText: '\u{1F4DD}',         // 📝
  fileBinary: '\u{1F4BE}',       // 💾
  clipboard: '\u{1F4CB}',        // 📋

  // Development
  code: '\u{1F4BB}',             // 💻
  codeBlock: '\u2630',           // ☰
  bug: '\u{1F41B}',              // 🐛
  bugAlt: '\u{1F41E}',           // 🐞
  wrench: '\u{1F527}',           // 🔧
  hammer: '\u{1F528}',           // 🔨
  tools: '\u{1F6E0}',            // 🛠
  terminal: '\u{1F5A5}',         // 🖥
  package: '\u{1F4E6}',          // 📦

  // Communication
  speech: '\u{1F4AC}',           // 💬
  thought: '\u{1F4AD}',          // 💭
  bell: '\u{1F514}',             // 🔔
  bellOff: '\u{1F515}',          // 🔕
  mail: '\u2709',                // ✉
  mailOpen: '\u{1F4E7}',         // 📧

  // Progress and time
  clock: '\u{1F550}',            // 🕐
  hourglass: '\u231B',           // ⌛
  timer: '\u23F1',               // ⏱
  stopwatch: '\u23F1',           // ⏱
  play: '\u25B6',                // ▶
  pause: '\u23F8',               // ⏸
  stop: '\u23F9',                // ⏹
  record: '\u23FA',              // ⏺

  // UI elements
  bullet: '\u2022',              // •
  bulletEmpty: '\u25E6',         // ◦
  square: '\u25A0',              // ■
  squareEmpty: '\u25A1',         // □
  circle: '\u25CF',              // ●
  circleEmpty: '\u25CB',         // ○
  diamond: '\u25C6',             // ◆
  diamondEmpty: '\u25C7',        // ◇
  triangle: '\u25B2',            // ▲
  triangleDown: '\u25BC',        // ▼

  // Special characters
  ellipsis: '\u2026',            // …
  degree: '\u00B0',              // °
  infinity: '\u221E',            // ∞
  plusMinus: '\u00B1',           // ±
  checkBox: '\u2610',            // ☐
  checkBoxChecked: '\u2611',     // ☑
  checkBoxCrossed: '\u2612',     // ☒
  radioOn: '\u25C9',             // ◉
  radioOff: '\u25CE',            // ◎

  // Hydra-specific
  hydra: '\u{1F409}',            // 🐉 (dragon as hydra)
  brain: '\u{1F9E0}',            // 🧠
  robot: '\u{1F916}',            // 🤖
  magic: '\u{1FA84}',            // 🪄
  crystal: '\u{1F48E}',          // 💎
  zap: '\u26A1',                 // ⚡

  // Database and storage
  database: '\u{1F5C3}',         // 🗃
  cloud: '\u2601',               // ☁
  cloudUp: '\u{1F4E4}',          // 📤
  cloudDown: '\u{1F4E5}',        // 📥

  // Misc
  link: '\u{1F517}',             // 🔗
  search: '\u{1F50D}',           // 🔍
  magnify: '\u{1F50E}',          // 🔎
  eye: '\u{1F441}',              // 👁
  eyeOff: '\u{1F648}',           // 🙈
  thumbUp: '\u{1F44D}',          // 👍
  thumbDown: '\u{1F44E}',        // 👎
  wave: '\u{1F44B}',             // 👋
  sparkle: '\u2728',             // ✨
  sun: '\u2600',                 // ☀
  moon: '\u{1F319}',             // 🌙
  plant: '\u{1F331}',            // 🌱
  tree: '\u{1F333}',             // 🌳
};

/**
 * ASCII fallback icons for terminals without Unicode support
 * @type {Object.<string, string>}
 */
export const IconsASCII = {
  // Status indicators
  checkmark: '[OK]',
  checkmarkBold: '[OK]',
  checkmarkDouble: '[OK][OK]',
  cross: '[X]',
  crossBold: '[X]',
  warning: '[!]',
  warningFilled: '[!]',
  info: '[i]',
  infoFilled: '[i]',
  question: '[?]',
  exclamation: '[!]',

  // Arrows
  arrow: '->',
  arrowRight: '->',
  arrowLeft: '<-',
  arrowUp: '^',
  arrowDown: 'v',
  arrowDouble: '=>',
  arrowCurved: '\\->',
  arrowReturn: '<-',
  arrowCircle: '(@)',
  arrowPointer: '>',
  arrowTriangle: '>',

  // Common symbols
  star: '*',
  starEmpty: '*',
  starHalf: '*',
  heart: '<3',
  heartEmpty: '<3',
  lightning: '/!\\',
  lightningBolt: '/!\\',
  fire: '(*)' ,
  rocket: '^',
  sparkles: '*',

  // Technical symbols
  gear: '[#]',
  gearFilled: '[#]',
  lock: '[=]',
  lockOpen: '[-]',
  key: '-o-',
  shield: '[O]',
  shieldCheck: '[v]',

  // Files and folders
  folder: '[D]',
  folderOpen: '[D]',
  file: '[F]',
  fileText: '[T]',
  fileBinary: '[B]',
  clipboard: '[C]',

  // Development
  code: '</>',
  codeBlock: '===',
  bug: '[BUG]',
  bugAlt: '[BUG]',
  wrench: '/~\\',
  hammer: '[H]',
  tools: '[T]',
  terminal: '>_',
  package: '[P]',

  // Communication
  speech: '[...]',
  thought: '(...)',
  bell: '(o)',
  bellOff: '(x)',
  mail: '[@]',
  mailOpen: '[O@]',

  // Progress and time
  clock: '(@)',
  hourglass: '[|]',
  timer: '(#)',
  stopwatch: '(#)',
  play: '>',
  pause: '||',
  stop: '[]',
  record: '(o)',

  // UI elements
  bullet: '*',
  bulletEmpty: 'o',
  square: '[#]',
  squareEmpty: '[ ]',
  circle: '(o)',
  circleEmpty: '( )',
  diamond: '<>',
  diamondEmpty: '< >',
  triangle: '^',
  triangleDown: 'v',

  // Special characters
  ellipsis: '...',
  degree: 'deg',
  infinity: 'oo',
  plusMinus: '+/-',
  checkBox: '[ ]',
  checkBoxChecked: '[x]',
  checkBoxCrossed: '[-]',
  radioOn: '(*)',
  radioOff: '( )',

  // Hydra-specific
  hydra: '[HYDRA]',
  brain: '[AI]',
  robot: '[BOT]',
  magic: '[*]',
  crystal: '[*]',
  zap: '/!\\',

  // Database and storage
  database: '[DB]',
  cloud: '(~)',
  cloudUp: '(^)',
  cloudDown: '(v)',

  // Misc
  link: '[~]',
  search: '[?]',
  magnify: '[?]',
  eye: '(o)',
  eyeOff: '(x)',
  thumbUp: '[+]',
  thumbDown: '[-]',
  wave: '\\o/',
  sparkle: '*',
  sun: 'o',
  moon: 'D',
  plant: '|',
  tree: 'Y',
};

/**
 * Semantic icon groups for common use cases
 * @type {Object}
 */
export const IconGroups = {
  status: {
    success: Icons.checkmark,
    error: Icons.cross,
    warning: Icons.warning,
    info: Icons.info,
    question: Icons.question,
  },
  progress: {
    pending: Icons.hourglass,
    running: Icons.play,
    paused: Icons.pause,
    stopped: Icons.stop,
    complete: Icons.checkmarkBold,
  },
  files: {
    folder: Icons.folder,
    folderOpen: Icons.folderOpen,
    file: Icons.file,
    code: Icons.code,
    package: Icons.package,
  },
  security: {
    lock: Icons.lock,
    unlock: Icons.lockOpen,
    key: Icons.key,
    shield: Icons.shield,
  },
  development: {
    code: Icons.code,
    bug: Icons.bug,
    wrench: Icons.wrench,
    tools: Icons.tools,
    terminal: Icons.terminal,
  },
  actions: {
    add: Icons.checkmark,
    remove: Icons.cross,
    edit: Icons.wrench,
    delete: Icons.crossBold,
    search: Icons.search,
  },
};

/**
 * Spinner frame sets for different animation styles
 * @type {Object.<string, string[]>}
 */
export const Spinners = {
  dots: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  dotsAlt: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
  line: ['|', '/', '-', '\\'],
  circle: ['◐', '◓', '◑', '◒'],
  arc: ['◜', '◠', '◝', '◞', '◡', '◟'],
  bounce: ['⠁', '⠂', '⠄', '⠂'],
  pulse: ['█', '▓', '▒', '░', '▒', '▓'],
  arrows: ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
  clock: ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚'],
  earth: ['🌍', '🌎', '🌏'],
  moon: ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'],
  weather: ['☀️', '🌤️', '⛅', '🌥️', '☁️', '🌧️', '⛈️', '🌩️'],
  hydra: ['🐉', '🔥', '⚡', '💎'],
};

/**
 * ASCII fallback spinners
 * @type {Object.<string, string[]>}
 */
export const SpinnersASCII = {
  dots: ['.', '..', '...', '..'],
  dotsAlt: ['.', 'o', 'O', 'o'],
  line: ['|', '/', '-', '\\'],
  circle: ['()', '(o)', '(O)', '(o)'],
  arc: ['-', '\\', '|', '/'],
  bounce: ['.', 'o', 'O', 'o'],
  pulse: ['#', '=', '-', '='],
  arrows: ['<', '^', '>', 'v'],
  clock: ['12', '3', '6', '9'],
  earth: ['[*]', '[*]', '[*]'],
  moon: ['(', 'C', 'O', 'D'],
  weather: ['o', '*', '~', '#'],
  hydra: ['H', 'Y', 'D', 'R', 'A'],
};

/**
 * Box drawing characters for creating frames
 * @type {Object}
 */
export const BoxChars = {
  unicode: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
    teeRight: '├',
    teeLeft: '┤',
    teeDown: '┬',
    teeUp: '┴',
    cross: '┼',
  },
  unicodeDouble: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║',
    teeRight: '╠',
    teeLeft: '╣',
    teeDown: '╦',
    teeUp: '╩',
    cross: '╬',
  },
  unicodeRound: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
    teeRight: '├',
    teeLeft: '┤',
    teeDown: '┬',
    teeUp: '┴',
    cross: '┼',
  },
  ascii: {
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
    cross: '+',
  },
};

/**
 * Progress bar characters
 * @type {Object}
 */
export const ProgressChars = {
  unicode: {
    filled: '█',
    partial: ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'],
    empty: '░',
    start: '',
    end: '',
  },
  unicodeAlt: {
    filled: '■',
    partial: ['□', '▪', '▫', '◾', '◽', '◼', '◻'],
    empty: '□',
    start: '[',
    end: ']',
  },
  ascii: {
    filled: '#',
    partial: ['='],
    empty: '-',
    start: '[',
    end: ']',
  },
};

/**
 * Check if terminal supports Unicode
 * @returns {boolean}
 */
export function supportsUnicode() {
  // Check common indicators for Unicode support
  const term = process.env.TERM || '';
  const lang = process.env.LANG || '';
  const lcAll = process.env.LC_ALL || '';

  // Windows Terminal and modern terminals support Unicode
  if (process.env.WT_SESSION) return true;

  // Check for UTF-8 in locale settings
  if (lang.includes('UTF-8') || lcAll.includes('UTF-8')) return true;

  // xterm and similar terminals usually support Unicode
  if (term.includes('xterm') || term.includes('256color')) return true;

  // VS Code terminal
  if (process.env.TERM_PROGRAM === 'vscode') return true;

  // Default to ASCII on Windows CMD, Unicode elsewhere
  return process.platform !== 'win32' || process.env.ConEmuANSI === 'ON';
}

/**
 * Check if terminal supports emoji (full Unicode)
 * @returns {boolean}
 */
export function supportsEmoji() {
  // Most modern terminals support emoji, but some don't
  const term = process.env.TERM || '';

  // Windows Terminal supports emoji
  if (process.env.WT_SESSION) return true;

  // VS Code terminal supports emoji
  if (process.env.TERM_PROGRAM === 'vscode') return true;

  // macOS Terminal and iTerm support emoji
  if (process.platform === 'darwin') return true;

  // Linux with modern terminal emulators
  if (process.platform === 'linux' && (
    term.includes('xterm') ||
    term.includes('256color') ||
    process.env.COLORTERM === 'truecolor'
  )) return true;

  return false;
}

/**
 * Get appropriate icon set based on terminal capabilities
 * @param {boolean} [preferEmoji=true] - Whether to prefer emoji when available
 * @returns {Object} Icon set
 */
export function getIcons(preferEmoji = true) {
  if (!supportsUnicode()) {
    return IconsASCII;
  }
  return Icons;
}

/**
 * Get appropriate spinner based on terminal capabilities
 * @param {string} [style='dots'] - Spinner style name
 * @returns {string[]} Spinner frames
 */
export function getSpinner(style = 'dots') {
  if (!supportsUnicode()) {
    return SpinnersASCII[style] || SpinnersASCII.line;
  }
  return Spinners[style] || Spinners.dots;
}

/**
 * Get appropriate box characters based on terminal capabilities
 * @param {string} [style='unicode'] - Box style: 'unicode', 'unicodeDouble', 'unicodeRound', 'ascii'
 * @returns {Object} Box drawing characters
 */
export function getBoxChars(style = 'unicode') {
  if (!supportsUnicode()) {
    return BoxChars.ascii;
  }
  return BoxChars[style] || BoxChars.unicode;
}

/**
 * Get appropriate progress bar characters based on terminal capabilities
 * @param {string} [style='unicode'] - Progress style: 'unicode', 'unicodeAlt', 'ascii'
 * @returns {Object} Progress bar characters
 */
export function getProgressChars(style = 'unicode') {
  if (!supportsUnicode()) {
    return ProgressChars.ascii;
  }
  return ProgressChars[style] || ProgressChars.unicode;
}

/**
 * Create an icon with optional fallback
 * @param {string} name - Icon name from Icons
 * @param {string} [fallback] - Fallback text if icon not available
 * @returns {string}
 */
export function icon(name, fallback) {
  if (!supportsUnicode()) {
    return fallback || IconsASCII[name] || name;
  }
  return Icons[name] || fallback || name;
}

/**
 * Create a colored icon string (requires chalk or similar)
 * @param {string} name - Icon name
 * @param {Function} colorFn - Color function (e.g., chalk.green)
 * @returns {string}
 */
export function coloredIcon(name, colorFn) {
  const iconChar = icon(name);
  return colorFn ? colorFn(iconChar) : iconChar;
}

/**
 * Format a status message with appropriate icon
 * @param {string} type - Status type: 'success', 'error', 'warning', 'info'
 * @param {string} message - Message text
 * @returns {string}
 */
export function statusMessage(type, message) {
  const icons = getIcons();
  const statusIcons = {
    success: icons.checkmark,
    error: icons.cross,
    warning: icons.warning,
    info: icons.info,
  };
  const statusIcon = statusIcons[type] || icons.bullet;
  return `${statusIcon} ${message}`;
}

/**
 * Create a simple progress bar string
 * @param {number} percent - Progress percentage (0-100)
 * @param {number} [width=20] - Bar width in characters
 * @param {string} [style='unicode'] - Progress style
 * @returns {string}
 */
export function progressBar(percent, width = 20, style = 'unicode') {
  const chars = getProgressChars(style);
  const filledWidth = Math.round((percent / 100) * width);
  const emptyWidth = width - filledWidth;

  const filled = chars.filled.repeat(filledWidth);
  const empty = chars.empty.repeat(emptyWidth);

  return `${chars.start}${filled}${empty}${chars.end} ${percent}%`;
}

// Default export for convenience
export default {
  Icons,
  IconsASCII,
  IconGroups,
  Spinners,
  SpinnersASCII,
  BoxChars,
  ProgressChars,
  supportsUnicode,
  supportsEmoji,
  getIcons,
  getSpinner,
  getBoxChars,
  getProgressChars,
  icon,
  coloredIcon,
  statusMessage,
  progressBar,
};

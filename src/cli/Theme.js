/**
 * CLI Theme System
 * @module cli/Theme
 */

import chalk from 'chalk';
import { BOX_UNICODE, BOX_ASCII } from './constants.js';
import { Icons, IconsASCII, Spinners, SpinnersASCII, supportsUnicode as checkUnicode } from './icons.js';

/**
 * @typedef {Object} ThemeColors
 * @property {Function} primary - Primary accent color
 * @property {Function} secondary - Secondary accent color
 * @property {Function} success - Success messages
 * @property {Function} error - Error messages
 * @property {Function} warning - Warning messages
 * @property {Function} info - Info messages
 * @property {Function} dim - Dimmed text
 * @property {Function} highlight - Highlighted text
 * @property {Function} prompt - Prompt color
 * @property {Function} border - Border color
 * @property {Function} ollama - Ollama provider color
 * @property {Function} gemini - Gemini provider color
 */

/**
 * @typedef {Object} ThemeSymbols
 * @property {string} prompt - Main prompt symbol
 * @property {string} multilinePrompt - Continuation prompt
 * @property {string} bullet - List bullet
 * @property {string} check - Success checkmark
 * @property {string} cross - Error cross
 * @property {string} warning - Warning symbol
 * @property {string} info - Info symbol
 * @property {string} arrow - Arrow pointer
 * @property {string} ellipsis - Ellipsis
 * @property {string} hydra - Hydra icon
 * @property {string} ollama - Ollama icon
 * @property {string} gemini - Gemini icon
 * @property {string} star - Star symbol
 * @property {string} heart - Heart symbol
 * @property {string} lightning - Lightning bolt
 * @property {string} fire - Fire symbol
 * @property {string} rocket - Rocket symbol
 * @property {string} gear - Gear/settings symbol
 * @property {string} lock - Lock symbol
 * @property {string} key - Key symbol
 * @property {string} folder - Folder symbol
 * @property {string} file - File symbol
 * @property {string} code - Code symbol
 * @property {string} bug - Bug symbol
 * @property {string} wrench - Wrench/tool symbol
 */

/**
 * @typedef {Object} Theme
 * @property {string} name - Theme name
 * @property {ThemeColors} colors - Color functions
 * @property {ThemeSymbols} symbols - Symbol characters
 * @property {Object} box - Box drawing characters
 * @property {string[]} spinner - Spinner animation frames
 */

/**
 * HYDRA Dark Theme - Default theme with purple/cyan accents
 * @type {Theme}
 */
export const HydraTheme = {
  name: 'hydra',
  colors: {
    primary: chalk.cyan,
    secondary: chalk.magenta,
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.blue,
    dim: chalk.gray,
    highlight: chalk.bold.white,
    prompt: chalk.cyan.bold,
    border: chalk.gray,
    ollama: chalk.hex('#8b5cf6'), // Purple
    gemini: chalk.hex('#22d3ee'), // Cyan
    code: chalk.hex('#e6db74'), // Yellow for code
    keyword: chalk.hex('#f92672'), // Pink for keywords
    string: chalk.hex('#a6e22e'), // Green for strings
    number: chalk.hex('#ae81ff'), // Purple for numbers
    // State colors for dynamic prompts
    stateIdle: chalk.cyan,
    stateProcessing: chalk.yellow,
    stateError: chalk.red,
    stateSuccess: chalk.green,
    // Mode colors
    modeYolo: chalk.magenta.bold,
    modeQuick: chalk.yellow,
    modeNormal: chalk.gray
  },
  symbols: {
    prompt: '\u276f', // Heavy right-pointing angle quotation mark ornament
    multilinePrompt: '\u2026', // Horizontal ellipsis
    bullet: '\u2022', // Bullet
    check: '\u2714', // Heavy check mark ✔
    cross: '\u2718', // Heavy ballot X ✘
    warning: '\u26a0', // Warning sign ⚠
    info: '\u2139', // Information source ℹ
    arrow: '\u279c', // Heavy round-tipped rightwards arrow ➜
    ellipsis: '\u2026', // Horizontal ellipsis …
    hydra: '\ud83d\udc09', // Dragon emoji 🐉
    ollama: '\ud83e\udd99', // Llama emoji 🦙
    gemini: '\u2652', // Gemini zodiac symbol ♒
    // Extended modern icons
    star: '\u2605', // Black star ★
    heart: '\u2665', // Black heart ♥
    lightning: '\u26a1', // High voltage ⚡
    fire: '\ud83d\udd25', // Fire 🔥
    rocket: '\ud83d\ude80', // Rocket 🚀
    gear: '\u2699', // Gear ⚙
    lock: '\ud83d\udd12', // Lock 🔒
    key: '\ud83d\udd11', // Key 🔑
    folder: '\ud83d\udcc1', // Folder 📁
    file: '\ud83d\udcc4', // File 📄
    code: '\ud83d\udcbb', // Laptop 💻
    bug: '\ud83d\udc1b', // Bug 🐛
    wrench: '\ud83d\udd27', // Wrench 🔧
    search: '\ud83d\udd0d', // Magnifying glass 🔍
    clock: '\ud83d\udd50', // Clock 🕐
    package: '\ud83d\udce6', // Package 📦
    link: '\ud83d\udd17', // Link 🔗
    shield: '\ud83d\udee1', // Shield 🛡
    tools: '\ud83d\udee0', // Tools 🛠
    sparkles: '\u2728', // Sparkles ✨
    // Markdown rendering symbols
    h1: '\u2726',           // Four-pointed star ✦
    h2: '\u25C6',           // Black diamond ◆
    h3: '\u25B6',           // Black right-pointing triangle ▶
    h4: '\u25AA',           // Black small square ▪
    h5: '\u2022',           // Bullet •
    h6: '\u00B7',           // Middle dot ·
    bulletAlt: '\u25E6',    // White bullet ◦
    bulletSub: '\u25AA',    // Black small square ▪
    taskDone: '\u2714',     // Heavy check mark ✔
    taskPending: '\u25CB',  // White circle ○
    quoteBar: '\u2503',     // Box drawings heavy vertical ┃
    linkIcon: '\u2197',     // North east arrow ↗
    hrLine: '\u2500',       // Box drawings light horizontal ─
  },
  box: BOX_UNICODE,
  spinner: ['\u28fb', '\u28fd', '\u28fe', '\u28f7', '\u28ef', '\u28df', '\u287f', '\u28bf'], // Braille dots spinner
  spinnerType: 'dots' // Default spinner type
};

/**
 * Minimal ASCII Theme - For terminals with limited Unicode support
 * @type {Theme}
 */
export const MinimalTheme = {
  name: 'minimal',
  colors: {
    primary: chalk.cyan,
    secondary: chalk.magenta,
    success: chalk.green,
    error: chalk.red,
    warning: chalk.yellow,
    info: chalk.blue,
    dim: chalk.gray,
    highlight: chalk.bold,
    prompt: chalk.cyan,
    border: chalk.gray,
    ollama: chalk.magenta,
    gemini: chalk.cyan,
    code: chalk.yellow,
    keyword: chalk.red,
    string: chalk.green,
    number: chalk.magenta,
    // State colors for dynamic prompts
    stateIdle: chalk.cyan,
    stateProcessing: chalk.yellow,
    stateError: chalk.red,
    stateSuccess: chalk.green,
    // Mode colors
    modeYolo: chalk.magenta,
    modeQuick: chalk.yellow,
    modeNormal: chalk.gray
  },
  symbols: {
    prompt: '>',
    multilinePrompt: '...',
    bullet: '*',
    check: '[OK]',
    cross: '[X]',
    warning: '[!]',
    info: '[i]',
    arrow: '->',
    ellipsis: '...',
    hydra: 'HYDRA',
    ollama: 'OLLAMA',
    gemini: 'GEMINI',
    // Extended ASCII fallback icons
    star: '*',
    heart: '<3',
    lightning: '/!\\',
    fire: '(*)',
    rocket: '^',
    gear: '[#]',
    lock: '[=]',
    key: '-o-',
    folder: '[D]',
    file: '[F]',
    code: '</>',
    bug: '[BUG]',
    wrench: '/~\\',
    search: '[?]',
    clock: '(@)',
    package: '[P]',
    link: '[~]',
    shield: '[O]',
    tools: '[T]',
    sparkles: '*',
    // Markdown rendering symbols (ASCII fallback)
    h1: '#',
    h2: '##',
    h3: '###',
    h4: '-',
    h5: '*',
    h6: '.',
    bulletAlt: 'o',
    bulletSub: '-',
    taskDone: '[x]',
    taskPending: '[ ]',
    quoteBar: '|',
    linkIcon: '>',
    hrLine: '-',
  },
  box: BOX_ASCII,
  spinner: ['|', '/', '-', '\\'],
  spinnerType: 'classic' // ASCII-compatible spinner
};

/**
 * Neon Theme - High contrast neon colors
 * @type {Theme}
 */
export const NeonTheme = {
  name: 'neon',
  colors: {
    primary: chalk.hex('#00ffff'), // Bright cyan
    secondary: chalk.hex('#ff00ff'), // Bright magenta
    success: chalk.hex('#00ff00'), // Bright green
    error: chalk.hex('#ff0000'), // Bright red
    warning: chalk.hex('#ffff00'), // Bright yellow
    info: chalk.hex('#0080ff'), // Bright blue
    dim: chalk.hex('#808080'),
    highlight: chalk.bold.hex('#ffffff'),
    prompt: chalk.bold.hex('#00ffff'),
    border: chalk.hex('#404040'),
    ollama: chalk.hex('#bf5fff'), // Bright purple
    gemini: chalk.hex('#00e5ff'), // Bright cyan
    code: chalk.hex('#ffff00'),
    keyword: chalk.hex('#ff0080'),
    string: chalk.hex('#80ff00'),
    number: chalk.hex('#ff8000'),
    // State colors for dynamic prompts
    stateIdle: chalk.hex('#00ffff'),
    stateProcessing: chalk.hex('#ffff00'),
    stateError: chalk.hex('#ff0000'),
    stateSuccess: chalk.hex('#00ff00'),
    // Mode colors
    modeYolo: chalk.hex('#ff00ff').bold,
    modeQuick: chalk.hex('#ffff00'),
    modeNormal: chalk.hex('#808080')
  },
  symbols: {
    prompt: '\u25b6', // Black right-pointing triangle ▶
    multilinePrompt: '\u2237', // Proportion ∷
    bullet: '\u25cf', // Black circle ●
    check: '\u2713', // Check mark ✓
    cross: '\u2717', // Ballot X ✗
    warning: '\u26a1', // High voltage sign ⚡
    info: '\u2055', // Flower punctuation mark ⁕
    arrow: '\u21e8', // Rightwards white arrow ⇨
    ellipsis: '\u2026', // …
    hydra: '\u2689\u2689\u2689', // Triple circles ⚉⚉⚉
    ollama: '\u2b22', // Black hexagon ⬢
    gemini: '\u2bcc', // Light four pointed black cusp ⯌
    // Extended neon style icons
    star: '\u2729', // Stress outlined white star ✩
    heart: '\u2764', // Heavy black heart ❤
    lightning: '\u26a1', // High voltage ⚡
    fire: '\ud83d\udd25', // Fire 🔥
    rocket: '\ud83d\ude80', // Rocket 🚀
    gear: '\u2699\ufe0f', // Gear ⚙️
    lock: '\ud83d\udd10', // Lock with key 🔐
    key: '\ud83d\udd11', // Key 🔑
    folder: '\ud83d\udcc2', // Open folder 📂
    file: '\ud83d\udcdd', // Memo 📝
    code: '\u2328', // Keyboard ⌨
    bug: '\ud83d\udc1e', // Lady beetle 🐞
    wrench: '\ud83d\udd27', // Wrench 🔧
    search: '\ud83d\udd0e', // Magnifying glass right 🔎
    clock: '\u23f1', // Stopwatch ⏱
    package: '\ud83d\udce6', // Package 📦
    link: '\ud83d\udd17', // Link 🔗
    shield: '\ud83d\udee1\ufe0f', // Shield 🛡️
    tools: '\ud83d\udee0\ufe0f', // Tools 🛠️
    sparkles: '\ud83c\udf1f', // Glowing star 🌟
  },
  box: BOX_UNICODE,
  spinner: ['\u25b0\u25b1\u25b1\u25b1\u25b1\u25b1\u25b1', '\u25b0\u25b0\u25b1\u25b1\u25b1\u25b1\u25b1', '\u25b0\u25b0\u25b0\u25b1\u25b1\u25b1\u25b1', '\u25b0\u25b0\u25b0\u25b0\u25b1\u25b1\u25b1', '\u25b0\u25b0\u25b0\u25b0\u25b0\u25b1\u25b1', '\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b1', '\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0', '\u25b0\u25b0\u25b0\u25b0\u25b0\u25b0\u25b1', '\u25b0\u25b0\u25b0\u25b0\u25b0\u25b1\u25b1', '\u25b0\u25b0\u25b0\u25b0\u25b1\u25b1\u25b1', '\u25b0\u25b0\u25b0\u25b1\u25b1\u25b1\u25b1', '\u25b0\u25b0\u25b1\u25b1\u25b1\u25b1\u25b1'], // Aesthetic loading bar
  spinnerType: 'aesthetic' // Neon loading bar style
};

/**
 * Monokai Theme - Classic Monokai color scheme
 * @type {Theme}
 */
export const MonokaiTheme = {
  name: 'monokai',
  colors: {
    primary: chalk.hex('#66d9ef'), // Blue
    secondary: chalk.hex('#ae81ff'), // Purple
    success: chalk.hex('#a6e22e'), // Green
    error: chalk.hex('#f92672'), // Pink/Red
    warning: chalk.hex('#fd971f'), // Orange
    info: chalk.hex('#66d9ef'), // Blue
    dim: chalk.hex('#75715e'), // Comment gray
    highlight: chalk.bold.hex('#f8f8f2'), // Foreground
    prompt: chalk.bold.hex('#f92672'), // Pink
    border: chalk.hex('#49483e'), // Background lighter
    ollama: chalk.hex('#ae81ff'), // Purple
    gemini: chalk.hex('#66d9ef'), // Blue
    code: chalk.hex('#e6db74'), // Yellow
    keyword: chalk.hex('#f92672'), // Pink
    string: chalk.hex('#e6db74'), // Yellow
    number: chalk.hex('#ae81ff'), // Purple
    // State colors for dynamic prompts
    stateIdle: chalk.hex('#66d9ef'),
    stateProcessing: chalk.hex('#fd971f'),
    stateError: chalk.hex('#f92672'),
    stateSuccess: chalk.hex('#a6e22e'),
    // Mode colors
    modeYolo: chalk.hex('#ae81ff').bold,
    modeQuick: chalk.hex('#fd971f'),
    modeNormal: chalk.hex('#75715e')
  },
  symbols: {
    prompt: '\u276f', // Heavy right-pointing angle quotation mark ❯
    multilinePrompt: '\u2026', // Horizontal ellipsis …
    bullet: '\u25aa', // Black small square ▪
    check: '\u2714', // Heavy check mark ✔
    cross: '\u2718', // Heavy ballot X ✘
    warning: '\u26a0', // Warning sign ⚠
    info: '\u2139', // Information source ℹ
    arrow: '\u2192', // Rightwards arrow →
    ellipsis: '\u2026', // …
    hydra: '\u03a8', // Greek capital letter psi Ψ
    ollama: '\u039b', // Greek capital letter lambda Λ
    gemini: '\u264a', // Gemini symbol ♊
    // Extended Monokai style icons (minimalist)
    star: '\u2605', // Black star ★
    heart: '\u2665', // Black heart ♥
    lightning: '\u21af', // Downwards zigzag arrow ↯
    fire: '\u2668', // Hot springs ♨
    rocket: '\u2197', // North east arrow ↗
    gear: '\u2699', // Gear ⚙
    lock: '\u{1F512}', // Lock 🔒
    key: '\u{1F511}', // Key 🔑
    folder: '\u{1F4C1}', // Folder 📁
    file: '\u{1F4C4}', // File 📄
    code: '\u{1F4BB}', // Laptop 💻
    bug: '\u{1F41B}', // Bug 🐛
    wrench: '\u{1F527}', // Wrench 🔧
    search: '\u{1F50D}', // Magnifying glass 🔍
    clock: '\u{1F550}', // Clock 🕐
    package: '\u{1F4E6}', // Package 📦
    link: '\u{1F517}', // Link 🔗
    shield: '\u{1F6E1}', // Shield 🛡
    tools: '\u{1F6E0}', // Tools 🛠
    sparkles: '\u2728', // Sparkles ✨
  },
  box: BOX_UNICODE,
  spinner: ['\u25dc', '\u25dd', '\u25de', '\u25df'], // Circle quadrant spinner ◜◝◞◟
  spinnerType: 'circle' // Monokai circle style
};

/**
 * Dracula Theme - Popular Dracula color scheme
 * @type {Theme}
 */
export const DraculaTheme = {
  name: 'dracula',
  colors: {
    primary: chalk.hex('#8be9fd'), // Cyan
    secondary: chalk.hex('#ff79c6'), // Pink
    success: chalk.hex('#50fa7b'), // Green
    error: chalk.hex('#ff5555'), // Red
    warning: chalk.hex('#ffb86c'), // Orange
    info: chalk.hex('#8be9fd'), // Cyan
    dim: chalk.hex('#6272a4'), // Comment
    highlight: chalk.bold.hex('#f8f8f2'), // Foreground
    prompt: chalk.bold.hex('#bd93f9'), // Purple
    border: chalk.hex('#44475a'), // Current line
    ollama: chalk.hex('#bd93f9'), // Purple
    gemini: chalk.hex('#8be9fd'), // Cyan
    code: chalk.hex('#f1fa8c'), // Yellow
    keyword: chalk.hex('#ff79c6'), // Pink
    string: chalk.hex('#f1fa8c'), // Yellow
    number: chalk.hex('#bd93f9'), // Purple
    // State colors for dynamic prompts
    stateIdle: chalk.hex('#8be9fd'),
    stateProcessing: chalk.hex('#ffb86c'),
    stateError: chalk.hex('#ff5555'),
    stateSuccess: chalk.hex('#50fa7b'),
    // Mode colors
    modeYolo: chalk.hex('#ff79c6').bold,
    modeQuick: chalk.hex('#ffb86c'),
    modeNormal: chalk.hex('#6272a4')
  },
  symbols: {
    prompt: '\u276f', // Heavy right-pointing angle quotation mark ❯
    multilinePrompt: '\u2026', // Horizontal ellipsis …
    bullet: '\u2605', // Black star ★
    check: '\u2714', // Heavy check mark ✔
    cross: '\u2718', // Heavy ballot X ✘
    warning: '\u26a0', // Warning sign ⚠
    info: '\u2139', // Information source ℹ
    arrow: '\u27a4', // Black rightwards arrowhead ➤
    ellipsis: '\u2026', // …
    hydra: '\ud83e\uddd9', // Mage emoji 🧙 (represents Dracula)
    ollama: '\ud83e\udd99', // Llama emoji 🦙
    gemini: '\u2652', // Gemini zodiac symbol ♒
    // Extended Dracula style icons (elegant)
    star: '\u2b50', // White medium star ⭐
    heart: '\ud83d\udc9c', // Purple heart 💜
    lightning: '\u26a1', // High voltage ⚡
    fire: '\ud83d\udd25', // Fire 🔥
    rocket: '\ud83d\ude80', // Rocket 🚀
    gear: '\u2699', // Gear ⚙
    lock: '\ud83d\udd12', // Lock 🔒
    key: '\ud83d\udd11', // Key 🔑
    folder: '\ud83d\udcc1', // Folder 📁
    file: '\ud83d\udcc4', // File 📄
    code: '\ud83d\udcbb', // Laptop 💻
    bug: '\ud83d\udc1b', // Bug 🐛
    wrench: '\ud83d\udd27', // Wrench 🔧
    search: '\ud83d\udd0d', // Magnifying glass 🔍
    clock: '\ud83d\udd50', // Clock 🕐
    package: '\ud83d\udce6', // Package 📦
    link: '\ud83d\udd17', // Link 🔗
    shield: '\ud83d\udee1', // Shield 🛡
    tools: '\ud83d\udee0', // Tools 🛠
    sparkles: '\u2728', // Sparkles ✨
  },
  box: BOX_UNICODE,
  spinner: ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588', '\u2587', '\u2586', '\u2585', '\u2584', '\u2583', '\u2582'], // Wave animation ▁▂▃▄▅▆▇█
  spinnerType: 'wave2' // Dracula wave style
};

/**
 * Get theme by name
 * @param {string} name - Theme name
 * @returns {Theme} Theme object
 */
export function getTheme(name) {
  const themes = {
    hydra: HydraTheme,
    minimal: MinimalTheme,
    neon: NeonTheme,
    monokai: MonokaiTheme,
    dracula: DraculaTheme
  };
  return themes[name] || HydraTheme;
}

/**
 * Get all available theme names
 * @returns {string[]} Theme names
 */
export function getAvailableThemes() {
  return ['hydra', 'minimal', 'neon', 'monokai', 'dracula'];
}

/**
 * Detect if terminal supports Unicode
 * @returns {boolean} True if Unicode is supported
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

  // Default to ASCII on Windows CMD, Unicode elsewhere
  return process.platform !== 'win32' || process.env.ConEmuANSI === 'ON';
}

/**
 * Get appropriate theme based on terminal capabilities
 * @returns {Theme} Best theme for current terminal
 */
export function getAutoTheme() {
  return supportsUnicode() ? HydraTheme : MinimalTheme;
}

/** Default export is HydraTheme */
export default HydraTheme;

/**
 * CLI Constants
 * @module cli/constants
 */

/** Default history file location */
export const HISTORY_FILE = '.hydra-history';

/** Maximum history entries */
export const MAX_HISTORY_SIZE = 1000;

/** Default prompt string */
export const DEFAULT_PROMPT = 'HYDRA> ';

/** Multiline prompt continuation */
export const MULTILINE_PROMPT = '... ';

/** Command prefix */
export const COMMAND_PREFIX = '/';

/** Key codes for input handling */
export const KEYS = {
  UP: '\x1b[A',
  DOWN: '\x1b[B',
  RIGHT: '\x1b[C',
  LEFT: '\x1b[D',
  ENTER: '\r',
  TAB: '\t',
  BACKSPACE: '\x7f',
  DELETE: '\x1b[3~',
  CTRL_C: '\x03',
  CTRL_D: '\x04',
  CTRL_L: '\x0c',
  CTRL_U: '\x15',
  CTRL_W: '\x17',
  ESCAPE: '\x1b',
  HOME: '\x1b[H',
  END: '\x1b[F'
};

/** ANSI escape sequences */
export const ANSI = {
  CLEAR_LINE: '\x1b[2K',
  CLEAR_SCREEN: '\x1b[2J',
  CURSOR_HOME: '\x1b[H',
  CURSOR_SAVE: '\x1b[s',
  CURSOR_RESTORE: '\x1b[u',
  CURSOR_HIDE: '\x1b[?25l',
  CURSOR_SHOW: '\x1b[?25h',
  MOVE_UP: (n = 1) => `\x1b[${n}A`,
  MOVE_DOWN: (n = 1) => `\x1b[${n}B`,
  MOVE_RIGHT: (n = 1) => `\x1b[${n}C`,
  MOVE_LEFT: (n = 1) => `\x1b[${n}D`,
  MOVE_TO: (row, col) => `\x1b[${row};${col}H`
};

/** Default terminal width */
export const DEFAULT_TERMINAL_WIDTH = 80;

/** Spinner frame rate (ms) */
export const SPINNER_INTERVAL = 80;

/** Prompt states */
export const PROMPT_STATES = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  ERROR: 'error',
  SUCCESS: 'success'
};

/** Execution modes */
export const EXECUTION_MODES = {
  NORMAL: 'normal',
  YOLO: 'yolo',
  QUICK: 'quick'
};

/** Response time thresholds (ms) */
export const RESPONSE_TIME_THRESHOLDS = {
  FAST: 1000,      // < 1s = green
  MEDIUM: 5000,    // 1-5s = yellow
  SLOW: 10000      // > 5s = red
};

/** Box drawing characters (Unicode) - Single line */
export const BOX_UNICODE = {
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
  // Double line variants (backward compatibility)
  doubleTopLeft: '\u2554',    // ╔
  doubleTopRight: '\u2557',   // ╗
  doubleBottomLeft: '\u255a', // ╚
  doubleBottomRight: '\u255d',// ╝
  doubleHorizontal: '\u2550', // ═
  doubleVertical: '\u2551'    // ║
};

/** Box drawing characters (ASCII fallback) */
export const BOX_ASCII = {
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
  doubleTopLeft: '+',
  doubleTopRight: '+',
  doubleBottomLeft: '+',
  doubleBottomRight: '+',
  doubleHorizontal: '=',
  doubleVertical: '|'
};

/** Box drawing - Rounded corners */
export const BOX_ROUNDED = {
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

/** Box drawing - Bold (heavy) lines */
export const BOX_BOLD = {
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

/** Box drawing - Dashed lines */
export const BOX_DASHED = {
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

/** Box drawing - Dotted lines */
export const BOX_DOTTED = {
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

/** Box drawing - Double lines (full set) */
export const BOX_DOUBLE = {
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

/** All border styles mapping */
export const BORDER_STYLES = {
  single: BOX_UNICODE,
  double: BOX_DOUBLE,
  rounded: BOX_ROUNDED,
  bold: BOX_BOLD,
  dashed: BOX_DASHED,
  dotted: BOX_DOTTED,
  ascii: BOX_ASCII
};

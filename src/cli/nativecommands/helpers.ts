/**
 * NativeCommands - Shared helpers, imports, and utility functions
 *
 * Contains:
 * - Common imports and re-exports
 * - getTools() / parseFlags() helpers
 * - File diagnostics: detectFileEncoding, getFileAttributes, setFileAttributes
 * - Dynamic path management sets
 *
 * @module cli/nativecommands/helpers
 */

import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import chalk from 'chalk';
import {
  createDiagnostics,
  type DiagnosticResult,
  FileSystemDiagnostics,
} from '../../native/FileSystemDiagnostics.js';
import {
  getProjectTools,
  initProjectTools,
  type NativeTools,
  SHELL_PROFILES,
  type ShellConfigProfile,
  type ShellManager,
} from '../../native/index.js';
import { createShellDiagnostics, ShellDiagnostics } from '../../native/ShellDiagnostics.js';
import type { FileAttributes } from '../../native/types.js';
import { createFailedMessage, formatError } from '../../utils/errorHandling.js';
import {
  box,
  formatBytes,
  formatDuration,
  highlightMatch,
  Spinner,
  truncate,
} from '../CommandHelpers.js';
import { type CommandResult, commandRegistry, error, success } from '../CommandRegistry.js';

// ── Re-exports for use by other modules ──
export {
  chalk,
  fs,
  path,
  exec,
  promisify,
  commandRegistry,
  success,
  error,
  type CommandResult,
  getProjectTools,
  initProjectTools,
  type NativeTools,
  type ShellManager,
  type ShellConfigProfile,
  SHELL_PROFILES,
  formatBytes,
  formatDuration,
  truncate,
  box,
  Spinner,
  highlightMatch,
  createFailedMessage,
  formatError,
  type FileAttributes,
  createDiagnostics,
  FileSystemDiagnostics,
  type DiagnosticResult,
  createShellDiagnostics,
  ShellDiagnostics,
};

// ============================================================
// Singleton for shell diagnostics
// ============================================================

let shellDiagnostics: ShellDiagnostics | null = null;

export function getShellDiagnostics(): ShellDiagnostics {
  if (!shellDiagnostics) {
    const tools = getProjectTools();
    shellDiagnostics = createShellDiagnostics({
      shell: tools?.shell,
      maxHistorySize: 1000,
    });
  }
  return shellDiagnostics;
}

export const execAsync = promisify(exec);

// ============================================================
// Helper Functions
// ============================================================

export function getTools(): NativeTools {
  const tools = getProjectTools();
  if (!tools) {
    throw new Error('Native tools not initialized. Run /native init first.');
  }
  return tools;
}

/**
 * Parse command arguments for flags
 */
export function parseFlags(args: string[]): {
  flags: Record<string, string | boolean>;
  positional: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      // Check if next arg is a value (doesn't start with --)
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        flags[key] = args[i + 1];
        i++;
      } else {
        flags[key] = true;
      }
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

// ============================================================
// File Diagnostics and Utilities
// ============================================================

/**
 * Detect file encoding by analyzing byte patterns
 */
export async function detectFileEncoding(filePath: string): Promise<{
  encoding: string;
  confidence: number;
  bom: string | null;
  details: string;
}> {
  const buffer = await fs.readFile(filePath);
  const bytes = new Uint8Array(buffer);

  // Check for BOM (Byte Order Mark)
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return {
      encoding: 'utf-8',
      confidence: 100,
      bom: 'UTF-8 BOM',
      details: 'UTF-8 with BOM detected',
    };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return {
      encoding: 'utf-16be',
      confidence: 100,
      bom: 'UTF-16 BE BOM',
      details: 'UTF-16 Big Endian with BOM',
    };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    if (bytes[2] === 0x00 && bytes[3] === 0x00) {
      return {
        encoding: 'utf-32le',
        confidence: 100,
        bom: 'UTF-32 LE BOM',
        details: 'UTF-32 Little Endian with BOM',
      };
    }
    return {
      encoding: 'utf-16le',
      confidence: 100,
      bom: 'UTF-16 LE BOM',
      details: 'UTF-16 Little Endian with BOM',
    };
  }
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0xfe && bytes[3] === 0xff) {
    return {
      encoding: 'utf-32be',
      confidence: 100,
      bom: 'UTF-32 BE BOM',
      details: 'UTF-32 Big Endian with BOM',
    };
  }

  // Analyze content for encoding hints
  let nullBytes = 0;
  let highBytes = 0;
  let utf8Sequences = 0;
  let invalidUtf8 = 0;

  for (let i = 0; i < Math.min(bytes.length, 8192); i++) {
    const byte = bytes[i];

    if (byte === 0x00) nullBytes++;
    if (byte > 0x7f) highBytes++;

    // Check for valid UTF-8 multi-byte sequences
    if (byte >= 0xc0 && byte <= 0xdf && i + 1 < bytes.length) {
      if ((bytes[i + 1] & 0xc0) === 0x80) {
        utf8Sequences++;
        i++;
      } else {
        invalidUtf8++;
      }
    } else if (byte >= 0xe0 && byte <= 0xef && i + 2 < bytes.length) {
      if ((bytes[i + 1] & 0xc0) === 0x80 && (bytes[i + 2] & 0xc0) === 0x80) {
        utf8Sequences++;
        i += 2;
      } else {
        invalidUtf8++;
      }
    } else if (byte >= 0xf0 && byte <= 0xf7 && i + 3 < bytes.length) {
      if (
        (bytes[i + 1] & 0xc0) === 0x80 &&
        (bytes[i + 2] & 0xc0) === 0x80 &&
        (bytes[i + 3] & 0xc0) === 0x80
      ) {
        utf8Sequences++;
        i += 3;
      } else {
        invalidUtf8++;
      }
    }
  }

  // Determine encoding based on analysis
  if (nullBytes > bytes.length * 0.1) {
    return {
      encoding: 'binary',
      confidence: 90,
      bom: null,
      details: 'Binary file (many null bytes)',
    };
  }

  if (highBytes === 0) {
    return { encoding: 'ascii', confidence: 95, bom: null, details: 'Pure ASCII (7-bit clean)' };
  }

  if (utf8Sequences > 0 && invalidUtf8 === 0) {
    const confidence = Math.min(95, 70 + utf8Sequences * 2);
    return {
      encoding: 'utf-8',
      confidence,
      bom: null,
      details: `UTF-8 (${utf8Sequences} multi-byte sequences)`,
    };
  }

  if (invalidUtf8 > 0) {
    return {
      encoding: 'iso-8859-1',
      confidence: 60,
      bom: null,
      details: 'Likely ISO-8859-1 or Windows-1252',
    };
  }

  return {
    encoding: 'utf-8',
    confidence: 70,
    bom: null,
    details: 'Assumed UTF-8 (no BOM, mostly ASCII)',
  };
}

/**
 * Get file attributes (Windows-specific with Unix fallback)
 */
export async function getFileAttributes(filePath: string): Promise<FileAttributes> {
  const stats = await fs.stat(filePath);

  // Base attributes from stats
  const attrs: FileAttributes = {
    readonly: (stats.mode & 0o200) === 0, // No write permission
    hidden: path.basename(filePath).startsWith('.'),
    system: false,
    archive: false,
  };

  // On Windows, try to get actual attributes
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execAsync(`attrib "${filePath}"`, { encoding: 'utf-8' });
      const attribLine = stdout.trim();

      attrs.readonly = attribLine.includes('R');
      attrs.hidden = attribLine.includes('H');
      attrs.system = attribLine.includes('S');
      attrs.archive = attribLine.includes('A');
      attrs.raw = attribLine;
    } catch {
      // Fall back to stats-based detection
    }
  }

  return attrs;
}

/**
 * Set file attributes (primarily for removing readonly)
 */
export async function setFileAttributes(
  filePath: string,
  options: {
    readonly?: boolean;
    hidden?: boolean;
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    if (process.platform === 'win32') {
      const flags: string[] = [];
      if (options.readonly === false) flags.push('-R');
      if (options.readonly === true) flags.push('+R');
      if (options.hidden === false) flags.push('-H');
      if (options.hidden === true) flags.push('+H');

      if (flags.length > 0) {
        await execAsync(`attrib ${flags.join(' ')} "${filePath}"`);
      }
    } else {
      // Unix: modify permissions
      const stats = await fs.stat(filePath);
      let newMode = stats.mode;

      if (options.readonly === false) {
        newMode |= 0o200; // Add write permission for owner
      } else if (options.readonly === true) {
        newMode &= ~0o200; // Remove write permission for owner
      }

      await fs.chmod(filePath, newMode);
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// Dynamic path management storage (in-memory for session)
export const dynamicAllowedPaths: Set<string> = new Set();
export const dynamicBlockedPaths: Set<string> = new Set();

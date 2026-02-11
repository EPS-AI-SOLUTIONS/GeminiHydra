/**
 * FileSystemDiagnostics - Comprehensive filesystem diagnostics for GeminiHydra
 *
 * Provides detailed diagnostic information about paths, permissions, and system state.
 * Useful for debugging file access issues, permission problems, and path validation.
 */

import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import { getErrorMessage } from '../core/errors.js';
import type { FileAttributes } from './types.js';

// ============================================================
// Types
// ============================================================

/**
 * Result of path validation check
 */
export interface PathValidationResult {
  /** Whether the path is valid */
  valid: boolean;

  /** The original path provided */
  originalPath: string;

  /** The normalized/resolved absolute path */
  resolvedPath: string;

  /** Whether the path is absolute */
  isAbsolute: boolean;

  /** Whether the path contains invalid characters */
  hasInvalidChars: boolean;

  /** List of invalid characters found */
  invalidChars?: string[];

  /** Whether path is too long for the system */
  pathTooLong: boolean;

  /** Maximum path length for the system */
  maxPathLength: number;

  /** Whether the path contains traversal attempts (../) */
  hasTraversal: boolean;

  /** Issues found during validation */
  issues: string[];
}

/**
 * Result of permission check
 */
export interface PermissionResult {
  /** Whether check succeeded */
  success: boolean;

  /** Path that was checked */
  path: string;

  /** Whether current user can read */
  readable: boolean;

  /** Whether current user can write */
  writable: boolean;

  /** Whether current user can execute (for directories: access) */
  executable: boolean;

  /** Unix-style permission mode (e.g., 0o755) */
  mode?: number;

  /** Human-readable permission string (e.g., "rwxr-xr-x") */
  modeString?: string;

  /** Owner user ID (Unix) or SID (Windows) */
  owner?: string;

  /** Owner group ID (Unix) or SID (Windows) */
  group?: string;

  /** Detailed error if check failed */
  error?: string;
}

/**
 * System information relevant to filesystem operations
 */
export interface SystemInfo {
  /** Operating system platform */
  platform: NodeJS.Platform;

  /** OS release version */
  release: string;

  /** System architecture */
  arch: string;

  /** Current user info */
  user: {
    /** Username */
    username: string;
    /** User ID (Unix) or undefined (Windows) */
    uid?: number;
    /** Group ID (Unix) or undefined (Windows) */
    gid?: number;
    /** Home directory */
    homeDir: string;
    /** Current working directory */
    cwd: string;
  };

  /** Filesystem limits */
  limits: {
    /** Maximum path length */
    maxPathLength: number;
    /** Maximum filename length */
    maxFilenameLength: number;
    /** Is case-sensitive filesystem */
    caseSensitive: boolean;
  };

  /** Environment variables relevant to filesystem */
  env: {
    /** TEMP/TMP directory */
    tempDir: string;
    /** PATH variable (truncated) */
    pathVar: string;
  };
}

/**
 * Complete diagnostic result for a path
 */
export interface DiagnosticResult {
  /** Path that was diagnosed */
  path: string;

  /** Timestamp of diagnosis */
  timestamp: Date;

  // === Existence and Type ===
  /** Whether path exists */
  exists: boolean;

  /** Whether path is readable */
  readable: boolean;

  /** Whether path is writable */
  writable: boolean;

  /** Whether path is a directory */
  isDirectory: boolean;

  /** Whether path is a symbolic link */
  isSymlink: boolean;

  /** Whether path is a file */
  isFile: boolean;

  // === File Properties ===
  /** File/directory size in bytes */
  size?: number;

  /** Detected encoding (for text files) */
  encoding?: string;

  /** File attributes (Windows-specific with Unix fallback) */
  attributes?: FileAttributes;

  /** Creation time */
  created?: Date;

  /** Last modification time */
  modified?: Date;

  /** Last access time */
  accessed?: Date;

  // === Symlink Info ===
  /** Symlink target path (if isSymlink) */
  symlinkTarget?: string;

  /** Whether symlink target exists */
  symlinkTargetExists?: boolean;

  // === Blocking/Access ===
  /** Reason path is blocked (if blocked) */
  blockedReason?: string;

  /** Whether path is in a blocked directory */
  isBlocked: boolean;

  /** Parent directory permissions */
  parentPermissions?: PermissionResult;

  // === Validation ===
  /** Path validation result */
  pathValidation: PathValidationResult;

  /** Permission check result */
  permissions: PermissionResult;

  // === Errors ===
  /** Errors encountered during diagnosis */
  errors: string[];

  /** Warnings (non-fatal issues) */
  warnings: string[];
}

// ============================================================
// FileSystemDiagnostics Class
// ============================================================

export class FileSystemDiagnostics {
  private blockedPaths: string[];
  private rootDir: string;

  constructor(options?: { rootDir?: string; blockedPaths?: string[] }) {
    this.rootDir = options?.rootDir || process.cwd();
    this.blockedPaths = options?.blockedPaths || ['node_modules', '.git', 'dist'];
  }

  // ============================================================
  // Main Diagnostic Method
  // ============================================================

  /**
   * Perform full diagnostics on a path
   */
  async diagnose(targetPath: string): Promise<DiagnosticResult> {
    const timestamp = new Date();
    const errors: string[] = [];
    const warnings: string[] = [];

    // Resolve path
    const resolvedPath = path.resolve(this.rootDir, targetPath);

    // Validate path first
    const pathValidation = this.checkPath(targetPath);
    if (!pathValidation.valid) {
      errors.push(...pathValidation.issues);
    }

    // Check if path is blocked
    const blockedReason = this.getBlockedReason(resolvedPath);
    const isBlocked = !!blockedReason;
    if (isBlocked) {
      warnings.push(`Path is blocked: ${blockedReason}`);
    }

    // Check permissions
    const permissions = await this.checkPermissions(resolvedPath);

    // Initialize result with defaults
    const result: DiagnosticResult = {
      path: resolvedPath,
      timestamp,
      exists: false,
      readable: false,
      writable: false,
      isDirectory: false,
      isSymlink: false,
      isFile: false,
      isBlocked,
      blockedReason: blockedReason || undefined,
      pathValidation,
      permissions,
      errors,
      warnings,
    };

    // Check existence
    try {
      await fs.access(resolvedPath, fsSync.constants.F_OK);
      result.exists = true;
    } catch {
      result.exists = false;
      errors.push('Path does not exist');

      // Check parent directory
      const parentDir = path.dirname(resolvedPath);
      try {
        result.parentPermissions = await this.checkPermissions(parentDir);
      } catch (e) {
        warnings.push(`Could not check parent directory: ${e}`);
      }

      return result;
    }

    // Get detailed stats
    try {
      const stats = await fs.lstat(resolvedPath);

      result.isDirectory = stats.isDirectory();
      result.isFile = stats.isFile();
      result.isSymlink = stats.isSymbolicLink();
      result.size = stats.size;
      result.created = stats.birthtime;
      result.modified = stats.mtime;
      result.accessed = stats.atime;

      // Check read/write access
      try {
        await fs.access(resolvedPath, fsSync.constants.R_OK);
        result.readable = true;
      } catch {
        result.readable = false;
      }

      try {
        await fs.access(resolvedPath, fsSync.constants.W_OK);
        result.writable = true;
      } catch {
        result.writable = false;
      }

      // Get attributes
      result.attributes = await this.getFileAttributes(resolvedPath, stats);

      // Handle symlink
      if (result.isSymlink) {
        try {
          result.symlinkTarget = await fs.readlink(resolvedPath);
          try {
            await fs.access(result.symlinkTarget, fsSync.constants.F_OK);
            result.symlinkTargetExists = true;
          } catch {
            result.symlinkTargetExists = false;
            warnings.push('Symlink target does not exist (broken symlink)');
          }
        } catch (e) {
          errors.push(`Could not read symlink target: ${e}`);
        }
      }

      // Detect encoding for files
      if (result.isFile && result.readable) {
        result.encoding = await this.detectEncoding(resolvedPath);
      }
    } catch (e: unknown) {
      errors.push(`Error getting file stats: ${getErrorMessage(e)}`);
    }

    return result;
  }

  // ============================================================
  // Permission Check
  // ============================================================

  /**
   * Check permissions for a path
   */
  async checkPermissions(targetPath: string): Promise<PermissionResult> {
    const resolvedPath = path.resolve(this.rootDir, targetPath);

    const result: PermissionResult = {
      success: false,
      path: resolvedPath,
      readable: false,
      writable: false,
      executable: false,
    };

    try {
      const stats = await fs.stat(resolvedPath);
      result.mode = stats.mode;
      result.modeString = this.formatMode(stats.mode, stats.isDirectory());

      // Get owner info (platform-dependent)
      if (process.platform !== 'win32') {
        result.owner = String(stats.uid);
        result.group = String(stats.gid);
      }

      // Check actual permissions
      try {
        await fs.access(resolvedPath, fsSync.constants.R_OK);
        result.readable = true;
      } catch {
        result.readable = false;
      }

      try {
        await fs.access(resolvedPath, fsSync.constants.W_OK);
        result.writable = true;
      } catch {
        result.writable = false;
      }

      try {
        await fs.access(resolvedPath, fsSync.constants.X_OK);
        result.executable = true;
      } catch {
        result.executable = false;
      }

      result.success = true;
    } catch (e: unknown) {
      result.error = getErrorMessage(e);
    }

    return result;
  }

  // ============================================================
  // Path Validation
  // ============================================================

  /**
   * Validate a path for correctness
   */
  checkPath(targetPath: string): PathValidationResult {
    const issues: string[] = [];
    const resolvedPath = path.resolve(this.rootDir, targetPath);

    // Platform-specific limits
    const isWindows = process.platform === 'win32';
    const maxPathLength = isWindows ? 260 : 4096;
    const maxFilenameLength = isWindows ? 255 : 255;

    // Check if path is absolute
    const isAbsolute = path.isAbsolute(targetPath);

    // Check for invalid characters
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional control char detection
    const invalidCharsPattern = isWindows ? /[<>:"|?*\x00-\x1f]/g : /[\x00]/g;

    const invalidChars: string[] = [];
    const matches = targetPath.match(invalidCharsPattern);
    if (matches) {
      invalidChars.push(...new Set(matches));
      issues.push(`Path contains invalid characters: ${invalidChars.join(', ')}`);
    }

    // Check path length
    const pathTooLong = resolvedPath.length > maxPathLength;
    if (pathTooLong) {
      issues.push(`Path length (${resolvedPath.length}) exceeds maximum (${maxPathLength})`);
    }

    // Check filename length
    const filename = path.basename(resolvedPath);
    if (filename.length > maxFilenameLength) {
      issues.push(`Filename length (${filename.length}) exceeds maximum (${maxFilenameLength})`);
    }

    // Check for traversal attempts
    const hasTraversal = targetPath.includes('..');
    if (hasTraversal) {
      // Only warn if it escapes root
      const normalized = path.normalize(resolvedPath);
      if (!normalized.startsWith(this.rootDir)) {
        issues.push('Path traversal escapes root directory');
      }
    }

    // Windows-specific checks
    if (isWindows) {
      // Check for reserved names
      const reservedNames = [
        'CON',
        'PRN',
        'AUX',
        'NUL',
        'COM1',
        'COM2',
        'COM3',
        'COM4',
        'COM5',
        'COM6',
        'COM7',
        'COM8',
        'COM9',
        'LPT1',
        'LPT2',
        'LPT3',
        'LPT4',
        'LPT5',
        'LPT6',
        'LPT7',
        'LPT8',
        'LPT9',
      ];

      const baseName = path.basename(targetPath, path.extname(targetPath)).toUpperCase();
      if (reservedNames.includes(baseName)) {
        issues.push(`Path contains reserved Windows name: ${baseName}`);
      }

      // Check for trailing dots/spaces
      if (filename.endsWith('.') || filename.endsWith(' ')) {
        issues.push('Filename ends with a dot or space (not allowed on Windows)');
      }
    }

    return {
      valid: issues.length === 0,
      originalPath: targetPath,
      resolvedPath,
      isAbsolute,
      hasInvalidChars: invalidChars.length > 0,
      invalidChars: invalidChars.length > 0 ? invalidChars : undefined,
      pathTooLong,
      maxPathLength,
      hasTraversal,
      issues,
    };
  }

  // ============================================================
  // System Info
  // ============================================================

  /**
   * Get system information relevant to filesystem operations
   */
  getSystemInfo(): SystemInfo {
    const isWindows = process.platform === 'win32';

    return {
      platform: process.platform,
      release: os.release(),
      arch: process.arch,
      user: {
        username: os.userInfo().username,
        uid: isWindows ? undefined : os.userInfo().uid,
        gid: isWindows ? undefined : os.userInfo().gid,
        homeDir: os.homedir(),
        cwd: process.cwd(),
      },
      limits: {
        maxPathLength: isWindows ? 260 : 4096,
        maxFilenameLength: 255,
        caseSensitive: !isWindows && process.platform !== 'darwin',
      },
      env: {
        tempDir: os.tmpdir(),
        pathVar:
          (process.env.PATH || '').slice(0, 200) +
          (process.env.PATH && process.env.PATH.length > 200 ? '...' : ''),
      },
    };
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  /**
   * Check if a path is blocked and return the reason
   */
  private getBlockedReason(resolvedPath: string): string | null {
    for (const blocked of this.blockedPaths) {
      if (
        resolvedPath.includes(path.sep + blocked + path.sep) ||
        resolvedPath.endsWith(path.sep + blocked)
      ) {
        return `Path contains blocked segment: ${blocked}`;
      }
    }

    // Check if outside root
    if (!resolvedPath.startsWith(this.rootDir)) {
      return 'Path is outside root directory';
    }

    return null;
  }

  /**
   * Format file mode to human-readable string
   */
  private formatMode(mode: number, isDirectory: boolean): string {
    const parts: string[] = [];

    // Type indicator
    parts.push(isDirectory ? 'd' : '-');

    // Owner permissions
    parts.push(mode & 0o400 ? 'r' : '-');
    parts.push(mode & 0o200 ? 'w' : '-');
    parts.push(mode & 0o100 ? 'x' : '-');

    // Group permissions
    parts.push(mode & 0o040 ? 'r' : '-');
    parts.push(mode & 0o020 ? 'w' : '-');
    parts.push(mode & 0o010 ? 'x' : '-');

    // Other permissions
    parts.push(mode & 0o004 ? 'r' : '-');
    parts.push(mode & 0o002 ? 'w' : '-');
    parts.push(mode & 0o001 ? 'x' : '-');

    return parts.join('');
  }

  /**
   * Get file attributes (Windows-specific with Unix fallback)
   */
  private async getFileAttributes(filePath: string, stats: fsSync.Stats): Promise<FileAttributes> {
    const isWindows = process.platform === 'win32';
    const basename = path.basename(filePath);

    if (isWindows) {
      // On Windows, we'd use attrib command for full attributes
      // For now, derive from what we can
      return {
        readonly: !(stats.mode & 0o200),
        hidden: basename.startsWith('.'),
        system: false,
        archive: false,
      };
    } else {
      // Unix fallback
      return {
        readonly: !(stats.mode & 0o200),
        hidden: basename.startsWith('.'),
        system: false,
      };
    }
  }

  /**
   * Detect file encoding by reading first bytes
   */
  private async detectEncoding(filePath: string): Promise<string> {
    try {
      const buffer = Buffer.alloc(4);
      const fd = await fs.open(filePath, 'r');
      try {
        await fd.read(buffer, 0, 4, 0);
      } finally {
        await fd.close();
      }

      // Check for BOM markers
      if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return 'utf-8-bom';
      }
      if (buffer[0] === 0xfe && buffer[1] === 0xff) {
        return 'utf-16-be';
      }
      if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        if (buffer[2] === 0x00 && buffer[3] === 0x00) {
          return 'utf-32-le';
        }
        return 'utf-16-le';
      }
      if (buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0xfe && buffer[3] === 0xff) {
        return 'utf-32-be';
      }

      // Check for binary content (null bytes)
      if (buffer.includes(0x00)) {
        return 'binary';
      }

      // Default to UTF-8
      return 'utf-8';
    } catch {
      return 'unknown';
    }
  }

  // ============================================================
  // Print Methods
  // ============================================================

  /**
   * Print diagnostic result in a formatted way
   */
  printDiagnostic(result: DiagnosticResult): void {
    console.log(chalk.cyan('\n========================================'));
    console.log(chalk.cyan('  FILESYSTEM DIAGNOSTICS'));
    console.log(chalk.cyan('========================================\n'));

    console.log(chalk.white('Path: ') + chalk.yellow(result.path));
    console.log(chalk.white('Time: ') + chalk.gray(result.timestamp.toISOString()));

    // Status indicators
    console.log(`\n${chalk.cyan('--- Status ---')}`);
    console.log(this.statusLine('Exists', result.exists));
    console.log(this.statusLine('Readable', result.readable));
    console.log(this.statusLine('Writable', result.writable));
    console.log(this.statusLine('Is Directory', result.isDirectory));
    console.log(this.statusLine('Is File', result.isFile));
    console.log(this.statusLine('Is Symlink', result.isSymlink));
    console.log(this.statusLine('Is Blocked', result.isBlocked, true)); // true = invert (blocked is bad)

    // Properties
    if (result.exists) {
      console.log(`\n${chalk.cyan('--- Properties ---')}`);
      if (result.size !== undefined) {
        console.log(chalk.white('Size: ') + this.formatBytes(result.size));
      }
      if (result.encoding) {
        console.log(chalk.white('Encoding: ') + chalk.gray(result.encoding));
      }
      if (result.created) {
        console.log(chalk.white('Created: ') + chalk.gray(result.created.toISOString()));
      }
      if (result.modified) {
        console.log(chalk.white('Modified: ') + chalk.gray(result.modified.toISOString()));
      }
    }

    // Permissions
    console.log(`\n${chalk.cyan('--- Permissions ---')}`);
    if (result.permissions.modeString) {
      console.log(chalk.white('Mode: ') + chalk.yellow(result.permissions.modeString));
    }
    if (result.permissions.owner) {
      console.log(
        chalk.white('Owner: ') +
          chalk.gray(`uid=${result.permissions.owner}, gid=${result.permissions.group}`),
      );
    }

    // Symlink
    if (result.isSymlink) {
      console.log(`\n${chalk.cyan('--- Symlink ---')}`);
      console.log(chalk.white('Target: ') + chalk.yellow(result.symlinkTarget || 'unknown'));
      console.log(this.statusLine('Target Exists', result.symlinkTargetExists || false));
    }

    // Blocked reason
    if (result.blockedReason) {
      console.log(`\n${chalk.cyan('--- Blocking ---')}`);
      console.log(chalk.red('Reason: ') + result.blockedReason);
    }

    // Path validation
    if (!result.pathValidation.valid) {
      console.log(`\n${chalk.cyan('--- Path Validation Issues ---')}`);
      for (const issue of result.pathValidation.issues) {
        console.log(chalk.red('  - ') + issue);
      }
    }

    // Errors
    if (result.errors.length > 0) {
      console.log(`\n${chalk.red('--- Errors ---')}`);
      for (const error of result.errors) {
        console.log(chalk.red('  - ') + error);
      }
    }

    // Warnings
    if (result.warnings.length > 0) {
      console.log(`\n${chalk.yellow('--- Warnings ---')}`);
      for (const warning of result.warnings) {
        console.log(chalk.yellow('  - ') + warning);
      }
    }

    console.log(chalk.cyan('\n========================================\n'));
  }

  /**
   * Print system info
   */
  printSystemInfo(info: SystemInfo): void {
    console.log(chalk.cyan('\n========================================'));
    console.log(chalk.cyan('  SYSTEM INFO'));
    console.log(chalk.cyan('========================================\n'));

    console.log(chalk.white('Platform: ') + chalk.yellow(info.platform));
    console.log(chalk.white('Release: ') + chalk.gray(info.release));
    console.log(chalk.white('Arch: ') + chalk.gray(info.arch));

    console.log(`\n${chalk.cyan('--- User ---')}`);
    console.log(chalk.white('Username: ') + chalk.yellow(info.user.username));
    if (info.user.uid !== undefined) {
      console.log(chalk.white('UID/GID: ') + chalk.gray(`${info.user.uid}/${info.user.gid}`));
    }
    console.log(chalk.white('Home: ') + chalk.gray(info.user.homeDir));
    console.log(chalk.white('CWD: ') + chalk.gray(info.user.cwd));

    console.log(`\n${chalk.cyan('--- Limits ---')}`);
    console.log(chalk.white('Max Path Length: ') + chalk.gray(String(info.limits.maxPathLength)));
    console.log(chalk.white('Max Filename: ') + chalk.gray(String(info.limits.maxFilenameLength)));
    console.log(
      chalk.white('Case Sensitive: ') + chalk.gray(info.limits.caseSensitive ? 'Yes' : 'No'),
    );

    console.log(`\n${chalk.cyan('--- Environment ---')}`);
    console.log(chalk.white('Temp Dir: ') + chalk.gray(info.env.tempDir));

    console.log(chalk.cyan('\n========================================\n'));
  }

  private statusLine(label: string, value: boolean, invert = false): string {
    const isGood = invert ? !value : value;
    const indicator = isGood ? chalk.green('[OK]') : chalk.red('[NO]');
    return `  ${indicator} ${label}`;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }
}

// ============================================================
// Factory Function
// ============================================================

export function createDiagnostics(options?: {
  rootDir?: string;
  blockedPaths?: string[];
}): FileSystemDiagnostics {
  return new FileSystemDiagnostics(options);
}

// ============================================================
// Default Export
// ============================================================

export default FileSystemDiagnostics;

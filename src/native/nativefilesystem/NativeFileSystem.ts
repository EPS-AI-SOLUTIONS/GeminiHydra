/**
 * NativeFileSystem - Native filesystem operations class for GeminiHydra
 *
 * This module contains the NativeFileSystem class which provides fast, direct
 * Node.js filesystem operations including reading, writing, directory management,
 * symlink handling, file attributes, search, watch capabilities, file lock
 * detection, and encoding operations.
 *
 * Also exports the createFileSystem factory function.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { glob } from 'glob';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import type {
  DirectoryTree,
  WatchEvent,
  SymlinkWarning,
  SymlinkType,
  NativeFileSystemConfig,
  WriteFileOptions,
  EnsureDirectoryResult,
  DirectoryCreationError,
  PathValidationResult,
  PathDiagnosticLog,
} from './types.js';
import { DEFAULT_BLOCKED_PATHS } from './types.js';
import type {
  SearchMatch,
  FileInfo,
  FileAttributes,
  SetFileAttributesOptions,
  SetFileAttributesResult,
  FileLockInfo,
  FileLockRetryOptions,
  WriteWithRetryResult,
} from '../types.js';
import { FileLockError } from '../types.js';
import { createSearch } from '../NativeSearch.js';
import {
  detectPathTraversal,
  sanitizePath,
  PathTraversalError,
  securityAuditLogger,
} from '../PathTraversalProtection.js';
import type {
  SupportedEncoding,
  EncodingInfo,
  ReadFileWithEncodingOptions,
  WriteFileWithEncodingOptions,
} from '../EncodingUtils.js';
import {
  detectEncoding,
  detectBOM,
  getBOMBytes,
  decodeBuffer,
  encodeBuffer,
  convertBufferEncoding,
  isSupportedEncoding,
  normalizeEncoding,
} from '../EncodingUtils.js';

const execAsync = promisify(exec);

// ============================================================
// NativeFileSystem Class
// ============================================================

export class NativeFileSystem {
  private config: Required<Omit<NativeFileSystemConfig, 'onPathBlocked' | 'onSymlinkWarning' | 'onDirectoryCreated'>> & {
    onPathBlocked?: (path: string, reason: string) => void;
    onSymlinkWarning?: (warning: SymlinkWarning) => void;
    onDirectoryCreated?: (dirPath: string, createdDirs: string[]) => void;
  };
  private watchers: Map<string, fsSync.FSWatcher> = new Map();
  private watchCallbacks: Map<string, ((event: WatchEvent) => void)[]> = new Map();
  /** Dynamically allowed paths that override blockedPaths */
  private dynamicAllowedPaths: Set<string> = new Set();
  /** Diagnostic logs for path validation */
  private diagnosticLogs: PathDiagnosticLog[] = [];
  private readonly MAX_DIAGNOSTIC_LOGS = 1000;

  constructor(config: NativeFileSystemConfig) {
    this.config = {
      rootDir: path.resolve(config.rootDir),
      allowedPaths: config.allowedPaths || [],
      blockedPaths: config.blockedPaths || [...DEFAULT_BLOCKED_PATHS],
      maxFileSize: config.maxFileSize || 50 * 1024 * 1024, // 50MB
      encoding: config.encoding || 'utf-8',
      enableDiagnostics: config.enableDiagnostics ?? false,
      logBlocking: config.logBlocking ?? true,
      onPathBlocked: config.onPathBlocked,
      followSymlinks: config.followSymlinks ?? true,
      onSymlinkWarning: config.onSymlinkWarning,
      verboseLogging: config.verboseLogging ?? false,
      onDirectoryCreated: config.onDirectoryCreated
    };
  }

  // ============================================================
  // Path Resolution & Validation
  // ============================================================

  /**
   * Resolve path to absolute, handling:
   * - Relative paths (./file, ../file, file)
   * - Absolute paths (C:\, /home/, etc.)
   * - Normalizes separators (\ vs /)
   * - Cross-platform compatibility
   *
   * @param inputPath - Path to resolve (relative or absolute)
   * @returns Normalized absolute path
   */
  resolvePath(inputPath: string): string {
    // Handle empty or undefined path
    if (!inputPath || inputPath.trim() === '') {
      return this.config.rootDir;
    }

    // Normalize separators to platform-specific
    let normalized = inputPath.trim().replace(/[\/\\]/g, path.sep);

    // Check if path is absolute
    const isAbsolute = path.isAbsolute(normalized);

    // For Windows: handle drive letters (C:, D:, etc.)
    const hasDriveLetter = /^[a-zA-Z]:/.test(normalized);

    // For Unix: handle paths starting with /
    const startsWithSlash = normalized.startsWith('/') || normalized.startsWith(path.sep);

    let resolved: string;

    if (isAbsolute || hasDriveLetter || (startsWithSlash && process.platform !== 'win32')) {
      // Path is already absolute - just normalize it
      resolved = path.normalize(normalized);
    } else {
      // Relative path - resolve against root directory
      // Handle ./ and ../ and plain relative paths
      resolved = path.resolve(this.config.rootDir, normalized);
    }

    // Final normalization to remove any redundant separators
    resolved = path.normalize(resolved);

    return resolved;
  }

  /**
   * Check if a path is absolute
   */
  isAbsolutePath(inputPath: string): boolean {
    if (!inputPath) return false;
    const normalized = inputPath.replace(/[\/\\]/g, path.sep);
    return path.isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized);
  }

  /**
   * Normalize path separators to platform-specific
   */
  normalizeSeparators(inputPath: string): string {
    if (!inputPath) return '';
    return inputPath.replace(/[\/\\]/g, path.sep);
  }

  /**
   * Validate that a path is accessible (within root and not blocked)
   * Uses resolvePath internally for path resolution
   * SECURITY: Now includes comprehensive path traversal attack detection
   */
  private validatePath(inputPath: string): string {
    // ============================================================
    // SECURITY: Path Traversal Attack Detection (FIRST!)
    // ============================================================
    // Check for path traversal attacks BEFORE any resolution
    // This catches: ../, ..\, %2e%2e%2f, ....//,  null bytes, Unicode tricks
    const traversalCheck = detectPathTraversal(inputPath);

    if (traversalCheck.detected) {
      const sanitized = sanitizePath(inputPath);

      // Log the security event
      securityAuditLogger.log({
        timestamp: new Date(),
        type: 'PATH_TRAVERSAL_ATTEMPT',
        severity: traversalCheck.severity || 'HIGH',
        originalPath: inputPath,
        detectedPatterns: traversalCheck.patterns,
        sanitizedPath: sanitized,
        blocked: true,
        additionalInfo: {
          categories: traversalCheck.categories,
          rootDir: this.config.rootDir,
          operation: 'validatePath'
        }
      });

      // Always block path traversal attempts - throw a clear error
      throw new PathTraversalError(inputPath, traversalCheck.patterns, traversalCheck.severity || 'HIGH');
    }

    // ============================================================
    // Standard path resolution and validation
    // ============================================================
    const resolved = this.resolvePath(inputPath);

    // Check if path is within root directory
    const normalizedRoot = path.normalize(this.config.rootDir);
    const isWithinRoot = resolved.startsWith(normalizedRoot);

    // If path is absolute and outside root, check if it's explicitly allowed
    if (!isWithinRoot) {
      const isAllowed = this.config.allowedPaths.some(allowed => {
        const normalizedAllowed = path.normalize(allowed);
        return resolved.startsWith(normalizedAllowed) || resolved === normalizedAllowed;
      });

      // Also check dynamic allowed paths
      const isDynamicallyAllowed = Array.from(this.dynamicAllowedPaths).some(allowed => {
        const normalizedAllowed = path.normalize(allowed);
        return resolved.startsWith(normalizedAllowed) || resolved === normalizedAllowed;
      });

      if (!isAllowed && !isDynamicallyAllowed) {
        const reason = `Path outside root directory and not in allowed paths`;
        if (this.config.logBlocking) {
          console.warn(`[NativeFileSystem] Access denied for path: ${resolved} - ${reason}`);
        }
        if (this.config.onPathBlocked) {
          this.config.onPathBlocked(resolved, reason);
        }
        throw new Error(`Access denied: ${reason}`);
      }
    }

    // Check blocked paths
    for (const blocked of this.config.blockedPaths) {
      const blockedPattern = path.sep + blocked + path.sep;
      const endsWithBlocked = path.sep + blocked;

      if (resolved.includes(blockedPattern) || resolved.endsWith(endsWithBlocked)) {
        // Check if specifically allowed to override block
        const isExplicitlyAllowed = this.config.allowedPaths.some(allowed => {
          return resolved.startsWith(path.normalize(allowed));
        }) || this.dynamicAllowedPaths.has(resolved);

        if (!isExplicitlyAllowed) {
          const reason = `Path is blocked (${blocked})`;
          if (this.config.logBlocking) {
            console.warn(`[NativeFileSystem] Access denied for path: ${resolved} - ${reason}`);
          }
          if (this.config.onPathBlocked) {
            this.config.onPathBlocked(resolved, reason);
          }
          throw new Error(`Access denied: ${reason}`);
        }
      }
    }

    return resolved;
  }

  /**
   * Convert absolute path to relative (from root directory)
   */
  private toRelative(absolutePath: string): string {
    return path.relative(this.config.rootDir, absolutePath);
  }

  /**
   * Add a path to dynamically allowed paths (overrides blocked paths)
   */
  allowPath(targetPath: string): void {
    const resolved = this.resolvePath(targetPath);
    this.dynamicAllowedPaths.add(resolved);
  }

  /**
   * Remove a path from dynamically allowed paths
   */
  disallowPath(targetPath: string): void {
    const resolved = this.resolvePath(targetPath);
    this.dynamicAllowedPaths.delete(resolved);
  }

  /**
   * Clear all dynamically allowed paths
   */
  clearDynamicAllowedPaths(): void {
    this.dynamicAllowedPaths.clear();
  }

  // ============================================================
  // Blocked Path Management
  // ============================================================

  /**
   * Add a path to the blocked list
   * @param pathToBlock - Path segment to block (e.g., 'node_modules', '.git', 'build')
   * @returns true if path was added, false if already present
   */
  addBlockedPath(pathToBlock: string): boolean {
    if (this.config.blockedPaths.includes(pathToBlock)) {
      return false;
    }
    this.config.blockedPaths.push(pathToBlock);
    if (this.config.logBlocking) {
      console.log(chalk.yellow(`[NativeFileSystem] Path added to blocked list: "${pathToBlock}"`));
    }
    return true;
  }

  /**
   * Remove a path from the blocked list
   * @param blockedPath - Path segment to unblock (e.g., 'node_modules', '.git')
   * @returns true if path was removed, false if not present
   */
  removeBlockedPath(blockedPath: string): boolean {
    const index = this.config.blockedPaths.indexOf(blockedPath);
    if (index === -1) {
      return false;
    }
    this.config.blockedPaths.splice(index, 1);
    if (this.config.logBlocking) {
      console.log(chalk.green(`[NativeFileSystem] Path unblocked: "${blockedPath}"`));
    }
    return true;
  }

  /**
   * Get current blocked paths
   */
  getBlockedPaths(): readonly string[] {
    return [...this.config.blockedPaths];
  }

  /**
   * Get current dynamically allowed paths
   */
  getDynamicAllowedPaths(): readonly string[] {
    return [...this.dynamicAllowedPaths];
  }

  /**
   * Get static allowed paths from config
   */
  getStaticAllowedPaths(): readonly string[] {
    return [...this.config.allowedPaths];
  }

  /**
   * Reset blocked paths to defaults
   */
  resetBlockedPaths(): void {
    this.config.blockedPaths = [...DEFAULT_BLOCKED_PATHS];
    this.dynamicAllowedPaths.clear();
    if (this.config.logBlocking) {
      console.log(chalk.cyan(`[NativeFileSystem] Blocked paths reset to defaults: ${DEFAULT_BLOCKED_PATHS.join(', ')}`));
    }
  }

  /**
   * Check if a path would be blocked (useful for debugging without triggering an error)
   * @param inputPath - Path to check
   * @returns Object with allowed status and reason
   */
  checkPathAccess(inputPath: string): { allowed: boolean; reason?: string } {
    try {
      const resolved = this.resolvePath(inputPath);
      const normalizedRoot = path.normalize(this.config.rootDir);

      // Check if outside root
      if (!resolved.startsWith(normalizedRoot)) {
        // Check if explicitly allowed
        const isAllowed = this.config.allowedPaths.some(allowed =>
          resolved.startsWith(path.normalize(allowed))
        ) || this.dynamicAllowedPaths.has(resolved);

        if (!isAllowed) {
          return { allowed: false, reason: 'Path outside root directory and not in allowed paths' };
        }
      }

      // Check blocked paths
      for (const blocked of this.config.blockedPaths) {
        if (resolved.includes(path.sep + blocked + path.sep) || resolved.endsWith(path.sep + blocked)) {
          const isExplicitlyAllowed = this.config.allowedPaths.some(allowed =>
            resolved.startsWith(path.normalize(allowed))
          ) || this.dynamicAllowedPaths.has(resolved);

          if (!isExplicitlyAllowed) {
            return { allowed: false, reason: `Path contains blocked segment: "${blocked}"` };
          }
        }
      }

      return { allowed: true };
    } catch (error: any) {
      return { allowed: false, reason: `Invalid path: ${error.message}` };
    }
  }

  /**
   * Alias for validatePathDetailed - Check if a path is allowed
   * Returns detailed information about why a path is or isn't allowed
   */
  isPathAllowed(inputPath: string): PathValidationResult {
    return this.validatePathDetailed(inputPath);
  }

  /**
   * Get detailed path validation result (for diagnostics)
   */
  validatePathDetailed(inputPath: string): PathValidationResult {
    const resolved = this.resolvePath(inputPath);
    const normalizedRoot = path.normalize(this.config.rootDir);
    const normalizedResolved = path.normalize(resolved);

    const isOutsideRoot = !resolved.startsWith(normalizedRoot);
    const containsTraversal = inputPath.includes('..');
    const isAbsolute = path.isAbsolute(inputPath);

    let isBlocked = false;
    let blockedBy: string | undefined;

    // Check if explicitly allowed (overrides block)
    const isExplicitlyAllowed = this.config.allowedPaths.some(allowed =>
      resolved.startsWith(path.normalize(allowed))
    ) || this.dynamicAllowedPaths.has(resolved);

    if (!isExplicitlyAllowed) {
      for (const blocked of this.config.blockedPaths) {
        if (resolved.includes(path.sep + blocked + path.sep) || resolved.endsWith(path.sep + blocked)) {
          isBlocked = true;
          blockedBy = blocked;
          break;
        }
      }
    }

    const allowed = (!isOutsideRoot || isExplicitlyAllowed) && (!isBlocked || isExplicitlyAllowed);

    let reason = 'Path is allowed';
    if (isOutsideRoot && !isExplicitlyAllowed) {
      reason = 'Path outside root directory';
    } else if (isBlocked && !isExplicitlyAllowed) {
      reason = `Path contains blocked segment: "${blockedBy}"`;
    } else if (isExplicitlyAllowed && (isBlocked || isOutsideRoot)) {
      reason = 'Path is explicitly allowed (overrides restrictions)';
    }

    return {
      allowed,
      reason,
      details: {
        inputPath,
        resolvedPath: resolved,
        rootDir: this.config.rootDir,
        normalizedRoot,
        normalizedResolved,
        blockedBy,
        isOutsideRoot,
        isBlocked,
        containsTraversal,
        isAbsolute
      }
    };
  }

  // ============================================================
  // Diagnostic Logging
  // ============================================================

  /**
   * Log a diagnostic entry for path operations
   */
  private logDiagnostic(
    operation: string,
    inputPath: string,
    resolvedPath: string,
    allowed: boolean,
    reason: string,
    durationMs?: number
  ): void {
    if (!this.config.enableDiagnostics) return;

    const entry: PathDiagnosticLog = {
      timestamp: new Date(),
      operation,
      inputPath,
      resolvedPath,
      allowed,
      reason,
      durationMs
    };

    this.diagnosticLogs.push(entry);

    if (this.diagnosticLogs.length > this.MAX_DIAGNOSTIC_LOGS) {
      this.diagnosticLogs = this.diagnosticLogs.slice(-this.MAX_DIAGNOSTIC_LOGS);
    }

    const status = allowed ? chalk.green('[ALLOWED]') : chalk.red('[BLOCKED]');
    const duration = durationMs !== undefined ? chalk.gray(` (${durationMs}ms)`) : '';
    console.log(
      chalk.gray(`[NativeFS] ${status} ${operation}: `) +
      chalk.yellow(inputPath) +
      chalk.gray(' -> ') +
      chalk.cyan(resolvedPath) +
      chalk.gray(` | ${reason}`) +
      duration
    );
  }

  /**
   * Get diagnostic logs with optional filtering
   */
  getDiagnosticLogs(options?: {
    limit?: number;
    onlyBlocked?: boolean;
    operation?: string;
  }): PathDiagnosticLog[] {
    let logs = [...this.diagnosticLogs];

    if (options?.onlyBlocked) {
      logs = logs.filter(log => !log.allowed);
    }

    if (options?.operation) {
      logs = logs.filter(log => log.operation === options.operation);
    }

    if (options?.limit && options.limit > 0) {
      logs = logs.slice(-options.limit);
    }

    return logs;
  }

  /**
   * Clear all diagnostic logs
   */
  clearDiagnosticLogs(): void {
    this.diagnosticLogs = [];
  }

  /**
   * Enable or disable diagnostics at runtime
   */
  setDiagnosticsEnabled(enabled: boolean): void {
    this.config.enableDiagnostics = enabled;
    if (enabled) {
      this.logDiagnostic('config', 'diagnostics', 'enabled', true, 'Diagnostics enabled');
    }
  }

  // ============================================================
  // Root Directory Management
  // ============================================================

  /**
   * Dynamically change the root directory
   */
  async setRootDir(newRootDir: string, options?: {
    validateExists?: boolean;
    stopWatchers?: boolean;
  }): Promise<{
    previousRoot: string;
    newRoot: string;
    watchersStopped: number;
  }> {
    const previousRoot = this.config.rootDir;
    const resolvedNewRoot = path.resolve(newRootDir);

    if (options?.validateExists !== false) {
      try {
        const stats = await fs.stat(resolvedNewRoot);
        if (!stats.isDirectory()) {
          throw new Error(
            `Cannot set root directory: Path is not a directory\n` +
            `  Attempted path: ${resolvedNewRoot}\n` +
            `  Path type: file`
          );
        }
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          throw new Error(
            `Cannot set root directory: Path does not exist\n` +
            `  Attempted path: ${resolvedNewRoot}\n` +
            `  Hint: Create the directory first or use { validateExists: false }`
          );
        }
        throw err;
      }
    }

    let watchersStopped = 0;
    if (options?.stopWatchers !== false) {
      watchersStopped = this.watchers.size;
      this.stopAllWatchers();
    }

    this.config.rootDir = resolvedNewRoot;
    this.dynamicAllowedPaths.clear();

    this.logDiagnostic(
      'setRootDir',
      newRootDir,
      resolvedNewRoot,
      true,
      `Root changed from ${previousRoot} to ${resolvedNewRoot}`
    );

    return {
      previousRoot,
      newRoot: resolvedNewRoot,
      watchersStopped
    };
  }

  // ============================================================
  // Directory Creation Utilities
  // ============================================================

  /**
   * Find which directories in a path need to be created
   * @param targetPath - The target directory path
   * @returns Array of directories that don't exist (from root to target)
   */
  private async findMissingDirectories(targetPath: string): Promise<string[]> {
    const missing: string[] = [];
    let currentPath = targetPath;

    // Walk up the directory tree to find all missing directories
    while (currentPath !== this.config.rootDir && currentPath !== path.dirname(currentPath)) {
      try {
        await fs.access(currentPath);
        // Directory exists, stop here
        break;
      } catch {
        // Directory doesn't exist, add to list
        missing.unshift(currentPath);
        currentPath = path.dirname(currentPath);
      }
    }

    return missing;
  }

  /**
   * Log directory creation details
   */
  private logDirectoryCreation(dirPath: string, createdDirs: string[]): void {
    if (createdDirs.length === 0) return;

    if (this.config.verboseLogging) {
      console.log(chalk.green(`[NativeFS] Created ${createdDirs.length} director${createdDirs.length === 1 ? 'y' : 'ies'}:`));
      for (const dir of createdDirs) {
        console.log(chalk.gray(`  + ${this.toRelative(dir)}`));
      }
    }

    if (this.config.onDirectoryCreated) {
      this.config.onDirectoryCreated(dirPath, createdDirs.map(d => this.toRelative(d)));
    }
  }

  /**
   * Handle directory creation errors with descriptive messages
   */
  private handleDirectoryCreationError(error: any, dirPath: string): never {
    const code = error.code || 'UNKNOWN';
    const relativePath = this.toRelative(dirPath);

    let message: string;
    switch (code) {
      case 'EACCES':
        message = `Permission denied: Cannot create directory "${relativePath}". Check write permissions.`;
        break;
      case 'ENOENT':
        message = `Path not found: Cannot create directory "${relativePath}". Parent path may be invalid.`;
        break;
      case 'ENOTDIR':
        message = `Not a directory: A file exists at "${relativePath}" where a directory is needed.`;
        break;
      case 'EEXIST':
        message = `Already exists: "${relativePath}" already exists but is not a directory.`;
        break;
      case 'EROFS':
        message = `Read-only filesystem: Cannot create directory "${relativePath}".`;
        break;
      case 'ENOSPC':
        message = `No space left: Cannot create directory "${relativePath}". Disk is full.`;
        break;
      case 'ENAMETOOLONG':
        message = `Name too long: Path "${relativePath}" exceeds maximum length.`;
        break;
      default:
        message = `Failed to create directory "${relativePath}": ${error.message || code}`;
    }

    const enhancedError = new Error(message) as DirectoryCreationError;
    enhancedError.code = code;
    enhancedError.path = dirPath;
    enhancedError.syscall = error.syscall;

    throw enhancedError;
  }

  /**
   * Ensure a directory exists, creating it and all parent directories if needed.
   *
   * @param dirPath - Path to the directory (relative or absolute)
   * @returns Result containing info about what was created
   *
   * @example
   * ```typescript
   * const result = await fs.ensureDirectory('data/logs/2024');
   * if (!result.existed) {
   *   console.log(`Created directories: ${result.createdDirs.join(', ')}`);
   * }
   * ```
   */
  async ensureDirectory(dirPath: string): Promise<EnsureDirectoryResult> {
    const resolved = this.validatePath(dirPath);

    // Check if directory already exists
    try {
      const stats = await fs.stat(resolved);
      if (stats.isDirectory()) {
        return {
          existed: true,
          createdDirs: [],
          absolutePath: resolved
        };
      } else {
        // Path exists but is not a directory
        const error = new Error(`Path exists but is not a directory: ${dirPath}`) as DirectoryCreationError;
        error.code = 'ENOTDIR';
        error.path = resolved;
        throw error;
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        // Re-throw if it's not a "not found" error
        if (error.code) {
          throw error; // Already a DirectoryCreationError
        }
        this.handleDirectoryCreationError(error, resolved);
      }
    }

    // Find which directories need to be created
    const missingDirs = await this.findMissingDirectories(resolved);

    // Create the directory with recursive option
    try {
      await fs.mkdir(resolved, { recursive: true });
    } catch (error: any) {
      this.handleDirectoryCreationError(error, resolved);
    }

    // Log the creation
    this.logDirectoryCreation(resolved, missingDirs);

    return {
      existed: false,
      createdDirs: missingDirs.map(d => this.toRelative(d)),
      absolutePath: resolved
    };
  }

  // ============================================================
  // Read Operations
  // ============================================================

  /**
   * Read file content
   */
  async readFile(filePath: string, options?: { encoding?: BufferEncoding }): Promise<string> {
    const resolved = this.validatePath(filePath);
    const encoding = options?.encoding || this.config.encoding;

    const stats = await fs.stat(resolved);
    if (stats.size > this.config.maxFileSize) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${this.config.maxFileSize})`);
    }

    return fs.readFile(resolved, { encoding });
  }

  /**
   * Read file as buffer
   */
  async readFileBuffer(filePath: string): Promise<Buffer> {
    const resolved = this.validatePath(filePath);
    return fs.readFile(resolved);
  }

  /**
   * Read file lines (memory efficient for large files)
   */
  async *readLines(filePath: string): AsyncGenerator<string> {
    const resolved = this.validatePath(filePath);
    const stream = createReadStream(resolved, { encoding: this.config.encoding });

    let buffer = '';
    for await (const chunk of stream) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        yield line;
      }
    }

    if (buffer) {
      yield buffer;
    }
  }

  /**
   * Read multiple files in parallel
   */
  async readMultiple(paths: string[]): Promise<Map<string, string | Error>> {
    const results = new Map<string, string | Error>();

    await Promise.all(
      paths.map(async (p) => {
        try {
          results.set(p, await this.readFile(p));
        } catch (error: any) {
          results.set(p, error);
        }
      })
    );

    return results;
  }

  /**
   * Read JSON file
   */
  async readJson<T = any>(filePath: string): Promise<T> {
    const content = await this.readFile(filePath);
    return JSON.parse(content);
  }

  // ============================================================
  // Write Operations
  // ============================================================

  /**
   * Write file content with automatic directory creation
   *
   * @param filePath - Path to the file (relative or absolute)
   * @param content - Content to write
   * @param options - Write options
   * @param options.encoding - File encoding (default: utf-8)
   * @param options.mode - File mode/permissions
   * @param options.createDirs - Create parent directories if missing (default: true)
   *
   * @example
   * ```typescript
   * // Automatically creates 'data/logs/' if it doesn't exist
   * await fs.writeFile('data/logs/app.log', 'Log entry');
   *
   * // Disable auto-creation (will throw if directory doesn't exist)
   * await fs.writeFile('existing/file.txt', 'content', { createDirs: false });
   * ```
   */
  async writeFile(filePath: string, content: string | Buffer, options?: WriteFileOptions): Promise<void> {
    const resolved = this.validatePath(filePath);
    const createDirs = options?.createDirs !== false;

    if (createDirs) {
      const dirPath = path.dirname(resolved);

      // Find missing directories before creation for logging
      const missingDirs = await this.findMissingDirectories(dirPath);

      if (missingDirs.length > 0) {
        try {
          await fs.mkdir(dirPath, { recursive: true });
          this.logDirectoryCreation(dirPath, missingDirs);
        } catch (error: any) {
          this.handleDirectoryCreationError(error, dirPath);
        }
      }
    }

    await fs.writeFile(resolved, content, {
      encoding: typeof content === 'string' ? (options?.encoding || this.config.encoding) : undefined,
      mode: options?.mode
    });
  }

  /**
   * Append to file (creates parent directories if needed)
   */
  async appendFile(filePath: string, content: string, options?: { createDirs?: boolean }): Promise<void> {
    const resolved = this.validatePath(filePath);
    const createDirs = options?.createDirs !== false;

    if (createDirs) {
      const dirPath = path.dirname(resolved);
      const missingDirs = await this.findMissingDirectories(dirPath);

      if (missingDirs.length > 0) {
        try {
          await fs.mkdir(dirPath, { recursive: true });
          this.logDirectoryCreation(dirPath, missingDirs);
        } catch (error: any) {
          this.handleDirectoryCreationError(error, dirPath);
        }
      }
    }

    await fs.appendFile(resolved, content, { encoding: this.config.encoding });
  }

  /**
   * Write JSON file
   */
  async writeJson(filePath: string, data: any, options?: { pretty?: boolean; createDirs?: boolean }): Promise<void> {
    const content = options?.pretty !== false
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);
    await this.writeFile(filePath, content, { createDirs: options?.createDirs });
  }

  /**
   * Stream write (for large files)
   */
  async streamWrite(filePath: string, source: NodeJS.ReadableStream, options?: { createDirs?: boolean }): Promise<void> {
    const resolved = this.validatePath(filePath);
    const createDirs = options?.createDirs !== false;

    if (createDirs) {
      const dirPath = path.dirname(resolved);
      const missingDirs = await this.findMissingDirectories(dirPath);

      if (missingDirs.length > 0) {
        try {
          await fs.mkdir(dirPath, { recursive: true });
          this.logDirectoryCreation(dirPath, missingDirs);
        } catch (error: any) {
          this.handleDirectoryCreationError(error, dirPath);
        }
      }
    }

    const destination = createWriteStream(resolved);
    await pipeline(source, destination);
  }

  // ============================================================
  // Directory Operations
  // ============================================================

  /**
   * List directory contents
   */
  async listDirectory(dirPath: string, options?: {
    recursive?: boolean;
    includeHidden?: boolean;
    filesOnly?: boolean;
    dirsOnly?: boolean;
  }): Promise<FileInfo[]> {
    const resolved = this.validatePath(dirPath);
    const entries: FileInfo[] = [];

    const processDir = async (dir: string) => {
      const items = await fs.readdir(dir, { withFileTypes: true });

      for (const item of items) {
        // Skip hidden files unless requested
        if (!options?.includeHidden && item.name.startsWith('.')) {
          continue;
        }

        // Skip blocked paths
        const fullPath = path.join(dir, item.name);
        const relativePath = this.toRelative(fullPath);

        if (this.config.blockedPaths.some(b => relativePath.includes(b))) {
          continue;
        }

        const stats = await fs.stat(fullPath);
        const info: FileInfo = {
          name: item.name,
          path: relativePath,
          type: item.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          isDirectory: item.isDirectory(),
          isFile: item.isFile(),
          isSymlink: item.isSymbolicLink(),
          created: stats.birthtime,
          modified: stats.mtime,
          accessed: stats.atime,
          mode: stats.mode,
          extension: item.isFile() ? path.extname(item.name).slice(1) : undefined
        };

        // Filter by type
        if (options?.filesOnly && !info.isFile) continue;
        if (options?.dirsOnly && !info.isDirectory) continue;

        entries.push(info);

        // Recurse into directories
        if (options?.recursive && item.isDirectory()) {
          await processDir(fullPath);
        }
      }
    };

    await processDir(resolved);
    return entries;
  }

  /**
   * Get directory tree
   */
  async getDirectoryTree(dirPath: string, options?: {
    maxDepth?: number;
    includeSize?: boolean;
  }): Promise<DirectoryTree> {
    const resolved = this.validatePath(dirPath);
    const maxDepth = options?.maxDepth ?? 5;

    const buildTree = async (dir: string, depth: number): Promise<DirectoryTree> => {
      const stats = await fs.stat(dir);
      const name = path.basename(dir);

      if (!stats.isDirectory()) {
        return {
          name,
          path: this.toRelative(dir),
          type: 'file',
          size: options?.includeSize ? stats.size : undefined
        };
      }

      const tree: DirectoryTree = {
        name,
        path: this.toRelative(dir),
        type: 'directory',
        children: []
      };

      if (depth < maxDepth) {
        const items = await fs.readdir(dir, { withFileTypes: true });

        for (const item of items) {
          if (item.name.startsWith('.')) continue;
          if (this.config.blockedPaths.includes(item.name)) continue;

          const childPath = path.join(dir, item.name);
          tree.children!.push(await buildTree(childPath, depth + 1));
        }
      }

      return tree;
    };

    return buildTree(resolved, 0);
  }

  /**
   * Create directory
   */
  async createDirectory(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    const resolved = this.validatePath(dirPath);
    await fs.mkdir(resolved, { recursive: options?.recursive !== false });
  }

  /**
   * Remove directory
   */
  async removeDirectory(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    const resolved = this.validatePath(dirPath);
    await fs.rm(resolved, { recursive: options?.recursive, force: true });
  }

  // ============================================================
  // File Operations
  // ============================================================

  /**
   * Check if path exists
   */
  async exists(targetPath: string): Promise<boolean> {
    try {
      const resolved = this.validatePath(targetPath);
      await fs.access(resolved);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file info
   */
  async getFileInfo(filePath: string): Promise<FileInfo> {
    const resolved = this.validatePath(filePath);
    const stats = await fs.stat(resolved);

    return {
      name: path.basename(resolved),
      path: this.toRelative(resolved),
      type: stats.isDirectory() ? 'directory' : 'file',
      size: stats.size,
      isDirectory: stats.isDirectory(),
      isFile: stats.isFile(),
      isSymlink: stats.isSymbolicLink(),
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      mode: stats.mode,
      extension: stats.isFile() ? path.extname(resolved).slice(1) : undefined
    };
  }

  /**
   * Copy file (creates destination directories if needed)
   */
  async copyFile(source: string, destination: string, options?: { createDirs?: boolean }): Promise<void> {
    const srcResolved = this.validatePath(source);
    const destResolved = this.validatePath(destination);
    const createDirs = options?.createDirs !== false;

    if (createDirs) {
      const dirPath = path.dirname(destResolved);
      const missingDirs = await this.findMissingDirectories(dirPath);

      if (missingDirs.length > 0) {
        try {
          await fs.mkdir(dirPath, { recursive: true });
          this.logDirectoryCreation(dirPath, missingDirs);
        } catch (error: any) {
          this.handleDirectoryCreationError(error, dirPath);
        }
      }
    }

    await fs.copyFile(srcResolved, destResolved);
  }

  /**
   * Move/rename file (creates destination directories if needed)
   */
  async moveFile(source: string, destination: string, options?: { createDirs?: boolean }): Promise<void> {
    const srcResolved = this.validatePath(source);
    const destResolved = this.validatePath(destination);
    const createDirs = options?.createDirs !== false;

    if (createDirs) {
      const dirPath = path.dirname(destResolved);
      const missingDirs = await this.findMissingDirectories(dirPath);

      if (missingDirs.length > 0) {
        try {
          await fs.mkdir(dirPath, { recursive: true });
          this.logDirectoryCreation(dirPath, missingDirs);
        } catch (error: any) {
          this.handleDirectoryCreationError(error, dirPath);
        }
      }
    }

    await fs.rename(srcResolved, destResolved);
  }

  /**
   * Delete file
   */
  async deleteFile(filePath: string): Promise<void> {
    const resolved = this.validatePath(filePath);
    await fs.unlink(resolved);
  }

  // ============================================================
  // Symlink Operations
  // ============================================================

  /**
   * Check if path is a symbolic link or junction point
   * @param targetPath Path to check
   * @returns true if path is a symlink or junction
   */
  async isSymlink(targetPath: string): Promise<boolean> {
    try {
      const resolved = this.validatePath(targetPath);
      const stats = await fs.lstat(resolved);
      return stats.isSymbolicLink();
    } catch {
      return false;
    }
  }

  /**
   * Get the target of a symbolic link or junction point
   * @param symlinkPath Path to the symlink
   * @returns The target path the symlink points to
   * @throws Error if path is not a symlink or cannot be read
   */
  async getSymlinkTarget(symlinkPath: string): Promise<string> {
    const resolved = this.validatePath(symlinkPath);

    // Check if it's actually a symlink
    const stats = await fs.lstat(resolved);
    if (!stats.isSymbolicLink()) {
      throw new Error(`Path is not a symbolic link: ${symlinkPath}`);
    }

    // Read the symlink target
    const target = await fs.readlink(resolved);

    // Resolve relative targets to absolute path
    const absoluteTarget = path.isAbsolute(target)
      ? target
      : path.resolve(path.dirname(resolved), target);

    return absoluteTarget;
  }

  /**
   * Create a symbolic link or Windows junction point
   *
   * On Windows:
   * - 'junction' creates a directory junction (works without admin rights)
   * - 'dir' creates a directory symlink (requires admin or developer mode)
   * - 'file' creates a file symlink (requires admin or developer mode)
   *
   * On Unix/Linux/macOS:
   * - All types create standard symlinks
   *
   * @param target The path the symlink should point to
   * @param linkPath Where to create the symlink
   * @param type Type of link: 'file', 'dir', or 'junction' (default: auto-detect)
   */
  async createSymlink(
    target: string,
    linkPath: string,
    type?: SymlinkType
  ): Promise<void> {
    const resolvedLink = this.validatePath(linkPath);
    const resolvedTarget = path.resolve(this.config.rootDir, target);

    // Validate the target path and emit warnings if needed
    this.validateSymlinkTarget(resolvedLink, resolvedTarget);

    // Create parent directory if needed
    await fs.mkdir(path.dirname(resolvedLink), { recursive: true });

    // Determine symlink type
    let symlinkType: 'file' | 'dir' | 'junction' = type || 'file';

    if (!type) {
      // Auto-detect based on target
      try {
        const targetStats = await fs.stat(resolvedTarget);
        symlinkType = targetStats.isDirectory() ? 'dir' : 'file';
      } catch {
        // If target doesn't exist, default to 'file'
        symlinkType = 'file';
      }
    }

    // On Windows, prefer junction for directories (no admin required)
    if (process.platform === 'win32' && symlinkType === 'dir' && !type) {
      symlinkType = 'junction';
    }

    try {
      await fs.symlink(resolvedTarget, resolvedLink, symlinkType);
    } catch (error: any) {
      // Provide helpful error message for Windows permission issues
      if (process.platform === 'win32' && error.code === 'EPERM') {
        throw new Error(
          `Permission denied creating symlink. On Windows, try using 'junction' type for directories, ` +
            `or enable Developer Mode in Windows Settings. Original error: ${error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Remove a symbolic link (without removing the target)
   * @param symlinkPath Path to the symlink to remove
   */
  async removeSymlink(symlinkPath: string): Promise<void> {
    const resolved = this.validatePath(symlinkPath);

    const stats = await fs.lstat(resolved);
    if (!stats.isSymbolicLink()) {
      throw new Error(`Path is not a symbolic link: ${symlinkPath}`);
    }

    // On Windows, junctions are directories so need rmdir
    if (process.platform === 'win32' && stats.isDirectory()) {
      await fs.rmdir(resolved);
    } else {
      await fs.unlink(resolved);
    }
  }

  /**
   * Validate symlink target and emit warnings if necessary
   * Called automatically when creating symlinks
   * @param symlinkPath Path where symlink will be created
   * @param targetPath Target the symlink points to
   * @private
   */
  private validateSymlinkTarget(symlinkPath: string, targetPath: string): void {
    const normalizedTarget = path.normalize(targetPath);
    const normalizedRoot = path.normalize(this.config.rootDir);

    // Check if target is outside root directory
    if (!normalizedTarget.startsWith(normalizedRoot)) {
      const warning: SymlinkWarning = {
        type: 'symlink_outside_root',
        symlinkPath: this.toRelative(symlinkPath),
        targetPath: targetPath,
        message: `Symlink target is outside root directory: ${targetPath}`
      };

      // Emit warning via callback
      if (this.config.onSymlinkWarning) {
        this.config.onSymlinkWarning(warning);
      }

      // Log warning
      if (this.config.logBlocking) {
        console.warn(chalk.yellow(`[NativeFileSystem] Warning: ${warning.message}`));
      }
    }

    // Check if target is in blocked paths
    for (const blocked of this.config.blockedPaths) {
      if (
        normalizedTarget.includes(path.sep + blocked + path.sep) ||
        normalizedTarget.endsWith(path.sep + blocked)
      ) {
        const warning: SymlinkWarning = {
          type: 'symlink_to_blocked',
          symlinkPath: this.toRelative(symlinkPath),
          targetPath: targetPath,
          message: `Symlink target is in blocked path (${blocked}): ${targetPath}`
        };

        if (this.config.onSymlinkWarning) {
          this.config.onSymlinkWarning(warning);
        }

        if (this.config.logBlocking) {
          console.warn(chalk.yellow(`[NativeFileSystem] Warning: ${warning.message}`));
        }
      }
    }
  }

  /**
   * Validate a path including symlink target resolution
   * Use this for security-conscious operations that need to verify symlink targets
   * @param inputPath Path to validate
   * @param validateTarget Whether to also validate the symlink target (default: follows config.followSymlinks)
   * @returns Resolved path
   * @throws Error if path is invalid
   */
  async validatePathWithSymlink(
    inputPath: string,
    validateTarget: boolean = this.config.followSymlinks
  ): Promise<string> {
    const resolved = this.validatePath(inputPath);

    // Check if it's a symlink and we should validate the target
    if (validateTarget) {
      try {
        const stats = await fs.lstat(resolved);

        if (stats.isSymbolicLink()) {
          const target = await fs.readlink(resolved);
          const absoluteTarget = path.isAbsolute(target)
            ? target
            : path.resolve(path.dirname(resolved), target);

          // Validate the target path and emit warnings
          this.validateSymlinkTarget(resolved, absoluteTarget);

          // Check if target exists
          try {
            await fs.access(absoluteTarget);
          } catch {
            const warning: SymlinkWarning = {
              type: 'broken_symlink',
              symlinkPath: this.toRelative(resolved),
              targetPath: absoluteTarget,
              message: `Broken symlink - target does not exist: ${absoluteTarget}`
            };

            if (this.config.onSymlinkWarning) {
              this.config.onSymlinkWarning(warning);
            }

            if (this.config.logBlocking) {
              console.warn(chalk.yellow(`[NativeFileSystem] Warning: ${warning.message}`));
            }
          }
        }
      } catch {
        // If we can't check for symlink, just return the resolved path
      }
    }

    return resolved;
  }

  /**
   * Get detailed symlink information
   * @param symlinkPath Path to check
   * @returns Object with symlink details including target, existence, and security status
   */
  async getSymlinkInfo(symlinkPath: string): Promise<{
    isSymlink: boolean;
    target?: string;
    targetExists?: boolean;
    isOutsideRoot?: boolean;
    isTargetBlocked?: boolean;
    type?: 'file' | 'directory' | 'junction';
  }> {
    const resolved = this.validatePath(symlinkPath);

    try {
      const stats = await fs.lstat(resolved);

      if (!stats.isSymbolicLink()) {
        return { isSymlink: false };
      }

      const target = await fs.readlink(resolved);
      const absoluteTarget = path.isAbsolute(target)
        ? target
        : path.resolve(path.dirname(resolved), target);

      // Check if target exists and get its type
      let targetExists = false;
      let targetType: 'file' | 'directory' | 'junction' | undefined;

      try {
        const targetStats = await fs.stat(absoluteTarget);
        targetExists = true;
        targetType = targetStats.isDirectory() ? 'directory' : 'file';
      } catch {
        targetExists = false;
      }

      // On Windows, check if it's a junction (junctions report as directories)
      if (process.platform === 'win32' && stats.isDirectory()) {
        targetType = 'junction';
      }

      // Check if target is outside root
      const normalizedTarget = path.normalize(absoluteTarget);
      const normalizedRoot = path.normalize(this.config.rootDir);
      const isOutsideRoot = !normalizedTarget.startsWith(normalizedRoot);

      // Check if target is in blocked paths
      let isTargetBlocked = false;
      for (const blocked of this.config.blockedPaths) {
        if (
          normalizedTarget.includes(path.sep + blocked + path.sep) ||
          normalizedTarget.endsWith(path.sep + blocked)
        ) {
          isTargetBlocked = true;
          break;
        }
      }

      return {
        isSymlink: true,
        target: absoluteTarget,
        targetExists,
        isOutsideRoot,
        isTargetBlocked,
        type: targetType
      };
    } catch {
      return { isSymlink: false };
    }
  }

  // ============================================================
  // File Attributes Operations (Windows/Unix)
  // ============================================================

  /**
   * Get file attributes (readonly, hidden, system)
   * On Windows: uses `attrib` command
   * On Unix/Mac: uses fs.stat for permissions and checks filename for hidden
   */
  async getFileAttributes(filePath: string): Promise<FileAttributes> {
    const resolved = this.validatePath(filePath);
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      return this.getWindowsFileAttributes(resolved);
    } else {
      return this.getUnixFileAttributes(resolved);
    }
  }

  /**
   * Get Windows file attributes using `attrib` command
   */
  private async getWindowsFileAttributes(resolvedPath: string): Promise<FileAttributes> {
    try {
      const { stdout } = await execAsync(`attrib "${resolvedPath}"`);
      const output = stdout.trim();

      // attrib output format: "  A    R    H    S    path"
      // Attributes are in fixed positions at the start of the line
      const attributePart = output.substring(0, output.lastIndexOf(resolvedPath.charAt(0) === '\\' ? '\\' : resolvedPath[0])).trim();

      return {
        readonly: attributePart.includes('R'),
        hidden: attributePart.includes('H'),
        system: attributePart.includes('S'),
        archive: attributePart.includes('A'),
        raw: attributePart
      };
    } catch (error: any) {
      throw new Error(`Failed to get file attributes: ${error.message}`);
    }
  }

  /**
   * Get Unix/Mac file attributes using fs.stat
   */
  private async getUnixFileAttributes(resolvedPath: string): Promise<FileAttributes> {
    try {
      const stats = await fs.stat(resolvedPath);
      const basename = path.basename(resolvedPath);

      // Check write permission (owner, group, or other)
      // mode & 0o222 checks if any write bit is set
      const isReadonly = (stats.mode & 0o222) === 0;

      // Hidden files on Unix start with a dot
      const isHidden = basename.startsWith('.');

      return {
        readonly: isReadonly,
        hidden: isHidden,
        system: false, // No system attribute on Unix
        archive: false, // No archive attribute on Unix
        raw: `mode=${stats.mode.toString(8)}`
      };
    } catch (error: any) {
      throw new Error(`Failed to get file attributes: ${error.message}`);
    }
  }

  /**
   * Set file attributes
   * On Windows: uses `attrib` command
   * On Unix/Mac: uses fs.chmod for readonly, rename for hidden
   */
  async setFileAttributes(filePath: string, attributes: SetFileAttributesOptions): Promise<SetFileAttributesResult> {
    const resolved = this.validatePath(filePath);
    const isWindows = process.platform === 'win32';

    try {
      const previousAttributes = await this.getFileAttributes(filePath);

      if (isWindows) {
        await this.setWindowsFileAttributes(resolved, attributes);
      } else {
        await this.setUnixFileAttributes(resolved, attributes);
      }

      const newAttributes = await this.getFileAttributes(filePath);

      return {
        success: true,
        previousAttributes,
        newAttributes
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Set Windows file attributes using `attrib` command
   */
  private async setWindowsFileAttributes(resolvedPath: string, attributes: SetFileAttributesOptions): Promise<void> {
    const args: string[] = [];

    // Build attrib command arguments
    if (attributes.readonly !== undefined) {
      args.push(attributes.readonly ? '+R' : '-R');
    }
    if (attributes.hidden !== undefined) {
      args.push(attributes.hidden ? '+H' : '-H');
    }
    if (attributes.system !== undefined) {
      args.push(attributes.system ? '+S' : '-S');
    }
    if (attributes.archive !== undefined) {
      args.push(attributes.archive ? '+A' : '-A');
    }

    if (args.length === 0) {
      return; // Nothing to change
    }

    const command = `attrib ${args.join(' ')} "${resolvedPath}"`;
    await execAsync(command);
  }

  /**
   * Set Unix/Mac file attributes using chmod
   * Note: hidden attribute requires renaming the file (adding/removing dot prefix)
   */
  private async setUnixFileAttributes(resolvedPath: string, attributes: SetFileAttributesOptions): Promise<void> {
    const stats = await fs.stat(resolvedPath);

    // Handle readonly attribute via chmod
    if (attributes.readonly !== undefined) {
      if (attributes.readonly) {
        // Remove all write permissions (keep read/execute)
        const newMode = stats.mode & ~0o222;
        await fs.chmod(resolvedPath, newMode);
      } else {
        // Add write permission for owner
        const newMode = stats.mode | 0o200;
        await fs.chmod(resolvedPath, newMode);
      }
    }

    // Handle hidden attribute by renaming (adding/removing dot prefix)
    if (attributes.hidden !== undefined) {
      const dirname = path.dirname(resolvedPath);
      const basename = path.basename(resolvedPath);
      const isCurrentlyHidden = basename.startsWith('.');

      if (attributes.hidden && !isCurrentlyHidden) {
        // Make hidden: add dot prefix
        const newPath = path.join(dirname, '.' + basename);
        await fs.rename(resolvedPath, newPath);
      } else if (!attributes.hidden && isCurrentlyHidden) {
        // Make visible: remove dot prefix
        const newPath = path.join(dirname, basename.substring(1));
        await fs.rename(resolvedPath, newPath);
      }
    }

    // System and archive attributes are not supported on Unix
    if (attributes.system !== undefined || attributes.archive !== undefined) {
      console.warn('System and archive attributes are not supported on Unix/Mac systems');
    }
  }

  /**
   * Check if file is readonly and optionally remove the readonly attribute
   * Returns true if file was readonly and attribute was successfully removed
   */
  async ensureWritable(filePath: string, options?: {
    autoRemoveReadonly?: boolean;
  }): Promise<{ wasReadonly: boolean; isNowWritable: boolean; error?: string }> {
    try {
      const attrs = await this.getFileAttributes(filePath);

      if (!attrs.readonly) {
        return { wasReadonly: false, isNowWritable: true };
      }

      if (options?.autoRemoveReadonly) {
        const result = await this.setFileAttributes(filePath, { readonly: false });
        return {
          wasReadonly: true,
          isNowWritable: result.success,
          error: result.error
        };
      }

      return {
        wasReadonly: true,
        isNowWritable: false,
        error: 'File is readonly. Use autoRemoveReadonly option to automatically remove the attribute.'
      };
    } catch (error: any) {
      return {
        wasReadonly: false,
        isNowWritable: false,
        error: error.message
      };
    }
  }

  // ============================================================
  // Search Operations
  // ============================================================

  /**
   * Glob pattern search
   */
  async globSearch(pattern: string, options?: {
    cwd?: string;
    ignore?: string[];
  }): Promise<string[]> {
    const cwd = options?.cwd
      ? this.validatePath(options.cwd)
      : this.config.rootDir;

    const matches = await glob(pattern, {
      cwd,
      ignore: [...this.config.blockedPaths.map(b => `**/${b}/**`), ...(options?.ignore || [])],
      nodir: true
    });

    return matches.map(m => path.relative(this.config.rootDir, path.join(cwd, m)));
  }

  /**
   * Search file contents
   *
   * @deprecated Use NativeSearch.searchFiles() instead. This method now delegates to NativeSearch.
   * Will be removed in a future version.
   *
   * Migration guide:
   * ```typescript
   * // Before (deprecated):
   * const results = await fs.searchContent('pattern', { glob: '*.ts' });
   *
   * // After (recommended):
   * import { NativeSearch, createSearch } from './NativeSearch.js';
   * const search = createSearch(rootDir);
   * const results = await search.searchFiles({ pattern: 'pattern', glob: '*.ts' });
   * ```
   */
  async searchContent(pattern: string | RegExp, options?: {
    paths?: string[];
    glob?: string;
    maxResults?: number;
    contextLines?: number;
  }): Promise<SearchMatch[]> {
    // Delegate to NativeSearch for canonical implementation
    const search = createSearch(this.config.rootDir, {
      defaultIgnore: this.config.blockedPaths
    });

    const results = await search.searchFiles({
      pattern,
      paths: options?.paths,
      glob: options?.glob || '**/*',
      maxResults: options?.maxResults || 100,
      contextLines: options?.contextLines || 0
    });

    // Convert NativeSearch results to match legacy format (context as string)
    return results.map(result => ({
      file: result.file,
      line: result.line,
      column: result.column,
      content: result.content.trim(),
      matchedText: result.matchedText,
      context: result.context ? {
        before: Array.isArray(result.context.before) ? result.context.before.join('\n') : result.context.before,
        after: Array.isArray(result.context.after) ? result.context.after.join('\n') : result.context.after
      } : undefined
    }));
  }

  // ============================================================
  // Watch Operations
  // ============================================================

  /**
   * Watch for file changes
   */
  watch(targetPath: string, callback: (event: WatchEvent) => void): () => void {
    const resolved = this.validatePath(targetPath);

    if (!this.watchers.has(resolved)) {
      const watcher = fsSync.watch(resolved, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        const fullPath = path.join(resolved, filename);
        const relativePath = this.toRelative(fullPath);

        const event: WatchEvent = {
          type: eventType === 'rename' ? 'change' : 'change',
          path: relativePath,
          timestamp: new Date()
        };

        const callbacks = this.watchCallbacks.get(resolved) || [];
        callbacks.forEach(cb => cb(event));
      });

      this.watchers.set(resolved, watcher);
      this.watchCallbacks.set(resolved, []);
    }

    this.watchCallbacks.get(resolved)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.watchCallbacks.get(resolved);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index >= 0) {
          callbacks.splice(index, 1);
        }

        if (callbacks.length === 0) {
          this.watchers.get(resolved)?.close();
          this.watchers.delete(resolved);
          this.watchCallbacks.delete(resolved);
        }
      }
    };
  }

  /**
   * Stop all watchers
   */
  stopAllWatchers(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.watchCallbacks.clear();
  }

  // ============================================================
  // File Lock Detection and Handling
  // ============================================================

  /**
   * Check if a file is locked by another process
   *
   * On Windows: Uses exclusive file open attempt
   * On Linux/Mac: Uses lsof or fuser commands
   *
   * @param filePath - Path to the file to check
   * @returns FileLockInfo with lock status and process info if available
   */
  async isFileLocked(filePath: string): Promise<FileLockInfo> {
    const resolved = this.validatePath(filePath);
    const isWindows = process.platform === 'win32';

    const baseLockInfo: FileLockInfo = {
      isLocked: false,
      filePath: resolved,
      detectedAt: new Date()
    };

    try {
      // First check if file exists
      try {
        await fs.access(resolved);
      } catch {
        // File doesn't exist, not locked
        return baseLockInfo;
      }

      if (isWindows) {
        return await this.checkFileLockWindows(resolved, baseLockInfo);
      } else {
        return await this.checkFileLockUnix(resolved, baseLockInfo);
      }
    } catch (error: any) {
      return {
        ...baseLockInfo,
        error: `Lock detection failed: ${error.message}`
      };
    }
  }

  /**
   * Check file lock on Windows using exclusive open attempt
   */
  private async checkFileLockWindows(filePath: string, baseLockInfo: FileLockInfo): Promise<FileLockInfo> {
    return new Promise((resolve) => {
      // Try to open file with exclusive access
      fsSync.open(filePath, fsSync.constants.O_RDWR | fsSync.constants.O_EXCL, (err, fd) => {
        if (err) {
          // File is locked - try to get process info
          this.getWindowsLockingProcess(filePath).then(processInfo => {
            resolve({
              ...baseLockInfo,
              isLocked: true,
              lockType: 'exclusive',
              ...processInfo
            });
          }).catch(() => {
            resolve({
              ...baseLockInfo,
              isLocked: true,
              lockType: 'unknown',
              error: err.message
            });
          });
        } else {
          // File is not locked, close the handle
          fsSync.close(fd, () => {
            resolve(baseLockInfo);
          });
        }
      });
    });
  }

  /**
   * Get Windows locking process info using handle.exe or PowerShell
   */
  private async getWindowsLockingProcess(filePath: string): Promise<Partial<FileLockInfo>> {
    try {
      // Try PowerShell command to find locking processes
      const psCommand = `
        $filePath = '${filePath.replace(/'/g, "''")}'
        $processes = Get-Process | Where-Object {
          try {
            $_.Modules | Where-Object { $_.FileName -eq $filePath }
          } catch { $false }
        }
        if ($processes) {
          $proc = $processes | Select-Object -First 1
          Write-Output "$($proc.Id)|$($proc.ProcessName)|$($proc.Path)"
        } else {
          # Try to find via open handles using WMI
          $handles = Get-WmiObject Win32_Process | Where-Object {
            $_.CommandLine -like "*$filePath*"
          } | Select-Object -First 1
          if ($handles) {
            Write-Output "$($handles.ProcessId)|$($handles.Name)|$($handles.CommandLine)"
          }
        }
      `;

      const { stdout } = await execAsync(`powershell -NoProfile -Command "${psCommand.replace(/"/g, '\\"')}"`, {
        timeout: 5000
      });

      if (stdout.trim()) {
        const [pid, name, cmdLine] = stdout.trim().split('|');
        return {
          processId: parseInt(pid, 10) || undefined,
          processName: name || undefined,
          commandLine: cmdLine || undefined
        };
      }
    } catch {
      // PowerShell method failed, try alternative
    }

    // Alternative: Try using handle.exe from Sysinternals if available
    try {
      const { stdout } = await execAsync(`handle.exe "${filePath}"`, { timeout: 5000, windowsHide: true });
      const match = stdout.match(/(\w+\.exe)\s+pid:\s*(\d+)/i);
      if (match) {
        return {
          processName: match[1],
          processId: parseInt(match[2], 10)
        };
      }
    } catch {
      // handle.exe not available or failed
    }

    return {};
  }

  /**
   * Check file lock on Unix (Linux/Mac) using lsof or fuser
   */
  private async checkFileLockUnix(filePath: string, baseLockInfo: FileLockInfo): Promise<FileLockInfo> {
    try {
      // Try lsof first (more common and detailed)
      const { stdout } = await execAsync(`lsof "${filePath}" 2>/dev/null`, { timeout: 5000 });

      if (stdout.trim()) {
        const lines = stdout.trim().split('\n');
        // Skip header line
        if (lines.length > 1) {
          const parts = lines[1].split(/\s+/);
          const processName = parts[0];
          const processId = parseInt(parts[1], 10);

          // Get command line
          let commandLine: string | undefined;
          try {
            const { stdout: cmdStdout } = await execAsync(`ps -p ${processId} -o args=`, { timeout: 2000 });
            commandLine = cmdStdout.trim();
          } catch {
            // Command line not available
          }

          return {
            ...baseLockInfo,
            isLocked: true,
            processId,
            processName,
            commandLine,
            lockType: 'unknown'
          };
        }
      }
    } catch {
      // lsof not available, try fuser
    }

    // Fallback to fuser
    try {
      const { stdout } = await execAsync(`fuser "${filePath}" 2>/dev/null`, { timeout: 5000 });
      if (stdout.trim()) {
        const pid = parseInt(stdout.trim().split(/\s+/)[0], 10);
        if (!isNaN(pid)) {
          // Get process name
          let processName: string | undefined;
          try {
            const { stdout: nameStdout } = await execAsync(`ps -p ${pid} -o comm=`, { timeout: 2000 });
            processName = nameStdout.trim();
          } catch {
            // Process name not available
          }

          return {
            ...baseLockInfo,
            isLocked: true,
            processId: pid,
            processName,
            lockType: 'unknown'
          };
        }
      }
    } catch {
      // fuser not available
    }

    // No lock detected
    return baseLockInfo;
  }

  /**
   * Get detailed information about the process locking a file
   *
   * @param filePath - Path to the locked file
   * @returns FileLockInfo with detailed process information
   */
  async getFileLockingProcess(filePath: string): Promise<FileLockInfo> {
    return this.isFileLocked(filePath);
  }

  /**
   * Write file with automatic retry on lock using exponential backoff
   *
   * @param filePath - Path to write to
   * @param content - Content to write
   * @param options - Write options including retry configuration
   * @returns WriteWithRetryResult with success status and details
   */
  async writeFileWithRetry(
    filePath: string,
    content: string | Buffer,
    options?: {
      encoding?: BufferEncoding;
      mode?: number;
      createDirs?: boolean;
      retry?: FileLockRetryOptions;
    }
  ): Promise<WriteWithRetryResult> {
    const resolved = this.validatePath(filePath);
    const startTime = Date.now();

    const retryOptions: Required<Omit<FileLockRetryOptions, 'onRetry' | 'throwOnFinalFailure'>> & Pick<FileLockRetryOptions, 'onRetry' | 'throwOnFinalFailure'> = {
      maxRetries: options?.retry?.maxRetries ?? 5,
      initialDelayMs: options?.retry?.initialDelayMs ?? 100,
      maxDelayMs: options?.retry?.maxDelayMs ?? 5000,
      backoffMultiplier: options?.retry?.backoffMultiplier ?? 2,
      onRetry: options?.retry?.onRetry,
      throwOnFinalFailure: options?.retry?.throwOnFinalFailure ?? false
    };

    let attempt = 0;
    let lastLockInfo: FileLockInfo | undefined;
    let lastError: Error | undefined;
    let currentDelay = retryOptions.initialDelayMs;

    while (attempt <= retryOptions.maxRetries) {
      attempt++;

      try {
        // Check if file is locked before attempting write
        const lockInfo = await this.isFileLocked(filePath);

        if (lockInfo.isLocked) {
          lastLockInfo = lockInfo;

          if (attempt > retryOptions.maxRetries) {
            break;
          }

          // Call retry callback if provided
          if (retryOptions.onRetry) {
            retryOptions.onRetry(attempt, currentDelay, lockInfo);
          }

          // Wait before retry
          await this.sleep(currentDelay);

          // Calculate next delay with exponential backoff
          currentDelay = Math.min(
            currentDelay * retryOptions.backoffMultiplier,
            retryOptions.maxDelayMs
          );

          continue;
        }

        // File is not locked, attempt write
        if (options?.createDirs !== false) {
          await fs.mkdir(path.dirname(resolved), { recursive: true });
        }

        await fs.writeFile(resolved, content, {
          encoding: typeof content === 'string' ? (options?.encoding || this.config.encoding) : undefined,
          mode: options?.mode
        });

        return {
          success: true,
          attempts: attempt,
          totalTimeMs: Date.now() - startTime
        };

      } catch (error: any) {
        lastError = error;

        // Check if error is due to file being locked (EBUSY, EACCES, EPERM)
        if (error.code === 'EBUSY' || error.code === 'EACCES' || error.code === 'EPERM') {
          lastLockInfo = {
            isLocked: true,
            filePath: resolved,
            detectedAt: new Date(),
            error: error.message
          };

          if (attempt > retryOptions.maxRetries) {
            break;
          }

          // Call retry callback if provided
          if (retryOptions.onRetry) {
            retryOptions.onRetry(attempt, currentDelay, lastLockInfo);
          }

          // Wait before retry
          await this.sleep(currentDelay);

          // Calculate next delay with exponential backoff
          currentDelay = Math.min(
            currentDelay * retryOptions.backoffMultiplier,
            retryOptions.maxDelayMs
          );

          continue;
        }

        // Non-lock related error, don't retry
        throw error;
      }
    }

    // All retries exhausted
    const result: WriteWithRetryResult = {
      success: false,
      attempts: attempt,
      totalTimeMs: Date.now() - startTime,
      lockInfo: lastLockInfo,
      error: lastError || new Error('File is locked and all retry attempts exhausted')
    };

    if (retryOptions.throwOnFinalFailure) {
      throw new FileLockError(
        `Failed to write to "${filePath}" after ${attempt} attempts: file is locked`,
        lastLockInfo || {
          isLocked: true,
          filePath: resolved,
          detectedAt: new Date()
        }
      );
    }

    return result;
  }

  /**
   * Safe write that checks for locks before modifying
   *
   * @param filePath - Path to write to
   * @param content - Content to write
   * @param options - Write options
   * @throws FileLockError if file is locked
   */
  async safeWriteFile(
    filePath: string,
    content: string | Buffer,
    options?: {
      encoding?: BufferEncoding;
      mode?: number;
      createDirs?: boolean;
    }
  ): Promise<void> {
    const lockInfo = await this.isFileLocked(filePath);

    if (lockInfo.isLocked) {
      const processInfo = lockInfo.processName
        ? ` by process "${lockInfo.processName}" (PID: ${lockInfo.processId})`
        : '';
      throw new FileLockError(
        `Cannot write to "${filePath}": file is locked${processInfo}`,
        lockInfo
      );
    }

    await this.writeFile(filePath, content, options);
  }

  /**
   * Helper method to wait/sleep for given milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============================================================
  // Encoding Operations
  // ============================================================

  /**
   * Detect the encoding of a file
   *
   * Uses heuristics to detect:
   * - BOM (Byte Order Mark) for UTF-8, UTF-16LE, UTF-16BE
   * - Null byte patterns for UTF-16
   * - UTF-8 sequence validation
   * - Single-byte encoding patterns (Windows-1250, ISO-8859-2, etc.)
   *
   * @param filePath - Path to the file to analyze
   * @returns EncodingInfo with detected encoding and confidence level
   */
  async detectFileEncoding(filePath: string): Promise<EncodingInfo> {
    const buffer = await this.readFileBuffer(filePath);
    return detectEncoding(buffer);
  }

  /**
   * Read file with automatic encoding detection or specified encoding
   *
   * @param filePath - Path to the file
   * @param options - Read options
   * @returns File content as string
   */
  async readFileWithEncoding(filePath: string, options?: ReadFileWithEncodingOptions): Promise<string> {
    const resolved = this.validatePath(filePath);
    const stats = await fs.stat(resolved);
    if (stats.size > this.config.maxFileSize) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${this.config.maxFileSize})`);
    }
    const buffer = await fs.readFile(resolved);
    let encoding: SupportedEncoding;
    if (options?.autoDetect) {
      encoding = detectEncoding(buffer).encoding;
    } else if (options?.encoding) {
      encoding = isSupportedEncoding(options.encoding as string)
        ? (options.encoding as SupportedEncoding)
        : normalizeEncoding(options.encoding as string);
    } else {
      encoding = 'utf-8';
    }
    return decodeBuffer(buffer, encoding, options?.stripBOM !== false);
  }

  /**
   * Write file with specified encoding and optional BOM
   *
   * @param filePath - Path to the file
   * @param content - Content to write
   * @param options - Write options
   */
  async writeFileWithEncoding(filePath: string, content: string, options?: WriteFileWithEncodingOptions): Promise<void> {
    const resolved = this.validatePath(filePath);
    const encoding: SupportedEncoding = options?.encoding
      ? (isSupportedEncoding(options.encoding as string)
          ? (options.encoding as SupportedEncoding)
          : normalizeEncoding(options.encoding as string))
      : 'utf-8';
    const buffer = encodeBuffer(content, encoding, options?.writeBOM ?? false);
    if (options?.createDirs !== false) {
      await fs.mkdir(path.dirname(resolved), { recursive: true });
    }
    await fs.writeFile(resolved, buffer, { mode: options?.mode });
  }

  /**
   * Convert file from one encoding to another
   *
   * @param sourcePath - Source file path
   * @param destPath - Destination file path
   * @param fromEncoding - Source encoding (or 'auto' for auto-detection)
   * @param toEncoding - Target encoding
   * @param options - Additional options
   */
  async convertFileEncoding(
    sourcePath: string,
    destPath: string,
    fromEncoding: SupportedEncoding | 'auto',
    toEncoding: SupportedEncoding,
    options?: { writeBOM?: boolean }
  ): Promise<{ fromEncoding: SupportedEncoding; toEncoding: SupportedEncoding; bytesRead: number; bytesWritten: number }> {
    const sourceBuffer = await this.readFileBuffer(sourcePath);
    const actualFromEncoding = fromEncoding === 'auto' ? detectEncoding(sourceBuffer).encoding : fromEncoding;
    const destBuffer = convertBufferEncoding(sourceBuffer, actualFromEncoding, toEncoding, options?.writeBOM ?? false);
    await this.writeFile(destPath, destBuffer);
    return { fromEncoding: actualFromEncoding, toEncoding, bytesRead: sourceBuffer.length, bytesWritten: destBuffer.length };
  }

  /**
   * Check if file has a BOM (Byte Order Mark)
   */
  async checkFileBOM(filePath: string): Promise<{ encoding: SupportedEncoding; bomLength: number } | null> {
    const resolved = this.validatePath(filePath);
    const fd = await fs.open(resolved, 'r');
    try {
      const buffer = Buffer.alloc(4);
      await fd.read(buffer, 0, 4, 0);
      return detectBOM(buffer);
    } finally {
      await fd.close();
    }
  }

  /**
   * Strip BOM from file content
   */
  async stripFileBOM(filePath: string, outputPath?: string): Promise<boolean> {
    const buffer = await this.readFileBuffer(filePath);
    const bomInfo = detectBOM(buffer);
    if (!bomInfo) return false;
    await this.writeFile(outputPath || filePath, buffer.slice(bomInfo.bomLength));
    return true;
  }

  /**
   * Add BOM to file
   */
  async addFileBOM(filePath: string, encoding: 'utf-8' | 'utf-16le' | 'utf-16be', outputPath?: string): Promise<boolean> {
    const buffer = await this.readFileBuffer(filePath);
    if (detectBOM(buffer)) return false;
    const bomBytes = getBOMBytes(encoding);
    if (!bomBytes) throw new Error(`BOM not available for encoding: ${encoding}`);
    await this.writeFile(outputPath || filePath, Buffer.concat([bomBytes, buffer]));
    return true;
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /**
   * Get root directory
   */
  getRoot(): string {
    return this.config.rootDir;
  }

  /**
   * Resolve path relative to root
   */
  resolve(...paths: string[]): string {
    return this.validatePath(path.join(...paths));
  }

  /**
   * Print status
   */
  printStatus(): void {
    console.log(chalk.cyan('\n=== Native FileSystem ===\n'));
    console.log(chalk.gray(`  Root: ${this.config.rootDir}`));
    console.log(chalk.gray(`  Max File Size: ${(this.config.maxFileSize / 1024 / 1024).toFixed(1)}MB`));
    console.log(chalk.gray(`  Encoding: ${this.config.encoding}`));
    console.log(chalk.gray(`  Verbose Logging: ${this.config.verboseLogging}`));
    console.log(chalk.gray(`  Active Watchers: ${this.watchers.size}`));
  }
}

// ============================================================
// Factory Function
// ============================================================

export function createFileSystem(rootDir: string, options?: Partial<NativeFileSystemConfig>): NativeFileSystem {
  return new NativeFileSystem({ rootDir, ...options });
}

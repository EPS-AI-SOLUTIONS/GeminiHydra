/**
 * NativeFileSystem - Type definitions and interfaces
 *
 * All types, interfaces, and constants specific to NativeFileSystem.
 *
 * @module native/nativefilesystem/types
 */

// ============================================================
// Directory and Watch Types
// ============================================================

export interface DirectoryTree {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: DirectoryTree[];
}

export interface WatchEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  timestamp: Date;
}

// ============================================================
// Symlink Types
// ============================================================

/**
 * Symlink warning types for security notifications
 */
export interface SymlinkWarning {
  /** Warning type */
  type: 'symlink_outside_root' | 'symlink_to_blocked' | 'broken_symlink';
  /** Path of the symlink itself */
  symlinkPath: string;
  /** Target the symlink points to (if resolvable) */
  targetPath?: string;
  /** Human-readable warning message */
  message: string;
}

/**
 * Symlink type for createSymlink - supports Windows junction points
 */
export type SymlinkType = 'file' | 'dir' | 'junction';

// ============================================================
// Configuration Types
// ============================================================

export interface NativeFileSystemConfig {
  rootDir: string;
  allowedPaths?: string[];
  blockedPaths?: string[];
  maxFileSize?: number;
  encoding?: BufferEncoding;
  /** Enable diagnostic logging (default: false) */
  enableDiagnostics?: boolean;
  /** Enable logging when paths are blocked (default: true) */
  logBlocking?: boolean;
  /** Custom logger function for blocked paths */
  onPathBlocked?: (path: string, reason: string) => void;
  /** Whether to follow symbolic links when reading/traversing (default: true) */
  followSymlinks?: boolean;
  /** Callback when symlink points outside rootDir or to blocked path */
  onSymlinkWarning?: (warning: SymlinkWarning) => void;
  /** Enable verbose logging for directory creation (default: false) */
  verboseLogging?: boolean;
  /** Custom logger function for directory creation */
  onDirectoryCreated?: (dirPath: string, createdDirs: string[]) => void;
}

// ============================================================
// Write and Directory Options
// ============================================================

export interface WriteFileOptions {
  encoding?: BufferEncoding;
  mode?: number;
  /** Create parent directories if they don't exist (default: true) */
  createDirs?: boolean;
}

export interface EnsureDirectoryResult {
  /** Whether the directory already existed */
  existed: boolean;
  /** List of directories that were created (from root to target) */
  createdDirs: string[];
  /** The absolute path to the directory */
  absolutePath: string;
}

export interface DirectoryCreationError extends Error {
  code: string;
  path: string;
  syscall?: string;
}

// ============================================================
// Validation and Diagnostic Types
// ============================================================

/**
 * Detailed result of path validation check
 */
export interface PathValidationResult {
  allowed: boolean;
  reason: string;
  details: {
    inputPath: string;
    resolvedPath: string;
    rootDir: string;
    normalizedRoot: string;
    normalizedResolved: string;
    blockedBy?: string;
    isOutsideRoot: boolean;
    isBlocked: boolean;
    containsTraversal: boolean;
    isAbsolute: boolean;
  };
}

/**
 * Diagnostic log entry for path operations
 */
export interface PathDiagnosticLog {
  timestamp: Date;
  operation: string;
  inputPath: string;
  resolvedPath: string;
  allowed: boolean;
  reason: string;
  durationMs?: number;
}

// ============================================================
// Constants
// ============================================================

/** Default blocked paths - can be overridden in config */
export const DEFAULT_BLOCKED_PATHS = ['node_modules', '.git', 'dist'];

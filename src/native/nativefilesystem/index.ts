/**
 * NativeFileSystem - Module index
 *
 * Re-exports all NativeFileSystem components.
 *
 * Original NativeFileSystem.ts (2572 lines) has been split into:
 * - types.ts           - All type definitions, interfaces, constants
 * - NativeFileSystem.ts - NativeFileSystem class, createFileSystem factory
 *
 * @module native/nativefilesystem/index
 */

// Types and interfaces
export type {
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

// Constants
export { DEFAULT_BLOCKED_PATHS } from './types.js';

// Main class and factory
export { NativeFileSystem, createFileSystem } from './NativeFileSystem.js';

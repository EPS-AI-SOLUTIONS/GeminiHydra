/**
 * Native Tools Index - GeminiHydra Native Implementations
 *
 * These native modules replace external MCP servers with optimized,
 * integrated implementations that run directly in the GeminiHydra process.
 *
 * Benefits:
 * - No external dependencies/processes
 * - Lower latency (no IPC overhead)
 * - Better integration with CLI
 * - Full TypeScript type safety
 * - Customized for GeminiHydra workflows
 */

import path from 'path';
import chalk from 'chalk';
import { GEMINIHYDRA_DIR } from '../config/paths.config.js';

// ============================================================
// Shared Types
// ============================================================

// Unified types from shared types module (canonical source)
export type {
  // Search types - ONE canonical SearchMatch export
  SearchMatch,
  SearchContext,
  // File types - FileInfo is the canonical unified type
  FileInfo,
  FileType,
  FileInfoBasic,
  FileInfoWithStats,
  FileInfoWithAnalysis,
  // File attributes types (Windows/Unix)
  FileAttributes,
  SetFileAttributesOptions,
  SetFileAttributesResult,
  // File lock types
  FileLockInfo,
  FileLockRetryOptions,
  WriteWithRetryResult
} from './types.js';

export {
  normalizeContextToArray,
  normalizeContextToString,
  // File lock error class
  FileLockError
} from './types.js';

// ============================================================
// Module Exports
// ============================================================

// Persistence - shared save/load utilities
export {
  saveToFile,
  loadFromFile,
  tryLoadFromFile,
  trySaveToFile,
  fileExists,
  deleteFile,
  createDateReviver,
  loadWithReviver,
  savePersistable,
  loadPersistable
} from './persistence.js';

export type {
  Persistable,
  SaveOptions,
  LoadOptions,
  PersistenceResult
} from './persistence.js';

// FileSystem - replaces @modelcontextprotocol/server-filesystem
export {
  NativeFileSystem,
  createFileSystem
} from './nativefilesystem/NativeFileSystem.js';

export type {
  // NOTE: FileInfo is now exported from types.ts as the canonical unified type
  // NativeFileSystem.FileInfo re-exports from types.ts, so they're compatible
  DirectoryTree,
  WatchEvent,
  NativeFileSystemConfig
} from './nativefilesystem/index.js';

// NOTE: FileSearchMatch alias REMOVED - use SearchMatch directly from types.ts
// The old alias (SearchMatch as FileSearchMatch) was confusing and redundant

// Memory - replaces @modelcontextprotocol/server-memory
export {
  NativeMemory,
  createMemory
} from './NativeMemory.js';

export type {
  Entity,
  Observation,
  Relation,
  GraphQuery,
  MemorySnapshot,
  NativeMemoryConfig
} from './NativeMemory.js';

// Shell - replaces @wonderwhy-er/desktop-commander
export {
  NativeShell,
  createShell
} from './nativeshell/NativeShell.js';

export type {
  ProcessInfo,
  ProcessResult,
  ShellSession,
  NativeShellConfig,
  ShellType,
  ShellInfo,
  ShellTimeoutConfig,
  TimeoutProfile
} from './nativeshell/index.js';

export { TIMEOUT_PROFILES, CwdValidationError } from './nativeshell/index.js';

// Interactive Prompt Handler - for handling interactive shell prompts
export {
  InteractivePromptHandler,
  InteractivePromptDetector,
  createInteractiveHandler,
  createInteractiveHandlerWithPreset,
  createPromptDetector,
  AUTO_RESPOND_PRESETS,
  INTERACTIVE_PROMPT_PATTERNS,
  createDefaultInteractiveConfig
} from './InteractivePromptHandler.js';

export type {
  InteractivePromptType,
  InteractivePrompt,
  InteractivePromptLog,
  InteractivePromptCallback,
  InteractivePromptConfig
} from './InteractivePromptHandler.js';

// Shell Escape - shell argument and command escaping utilities
export {
  escapeShellArg,
  escapeShellArgWindows,
  escapeShellArgUnix,
  escapeShellCommand,
  escapeShellCommandWindows,
  escapeShellCommandUnix,
  quoteArg,
  quoteArgWindows,
  quoteArgUnix,
  escapeForPowerShell,
  escapeForCmd,
  buildCommand,
  parseCommand,
  escapeGlobPattern,
  escapeRegex,
  sanitizeCommand,
  isCommandSafe,
  escapePathForShell,
  createEnvAssignment,
  isWindowsPlatform,
  getCurrentPlatform
} from './ShellEscape.js';

export type {
  ShellPlatform,
  WindowsShellType
} from './ShellEscape.js';

// Shell Diagnostics - comprehensive shell and process diagnostics
export {
  ShellDiagnostics,
  createShellDiagnostics
} from './ShellDiagnostics.js';

export type {
  ShellInstallInfo,
  SystemShellInfo,
  HealthCheckResult,
  ProcessStats,
  ExecutionRecord,
  PerformanceReport
} from './ShellDiagnostics.js';

// ShellManager - Unified Shell Management Facade
export {
  ShellManager,
  createShellManager,
  createShellManagerWithProfile,
  getShellManager,
  initShellManager,
  resetShellManager,
  shellManager,
  SHELL_PROFILES
} from './ShellManager.js';

export type {
  ShellConfigProfile,
  ShellManagerConfig,
  EscapeOptions,
  ExecuteOptions,
  TrackedProcess,
  ShellAvailability,
  HistoryEntry
} from './ShellManager.js';

// Search - advanced search capabilities
export {
  NativeSearch,
  createSearch
} from './NativeSearch.js';

export type {
  FileSearchOptions,
  SymbolMatch,
  SymbolSearchOptions,
  FuzzyMatch,
  NativeSearchConfig
} from './NativeSearch.js';

// LSP - Language Server Protocol client
export {
  NativeLSP,
  LSPClient,
  nativeLSP
} from './NativeLSP.js';

export type {
  Position,
  Range,
  Location,
  SymbolInformation,
  DocumentSymbol,
  CompletionItem,
  Diagnostic,
  LSPServerConfig,
  LanguageServerDefinition
} from './NativeLSP.js';

export { SymbolKind, DiagnosticSeverity, CompletionItemKind } from './NativeLSP.js';

// Code Intelligence - replaces Serena MCP
export {
  NativeCodeIntelligence,
  nativeCodeIntelligence
} from './NativeCodeIntelligence.js';

export type {
  SymbolOverview,
  SymbolSummary,
  // CodeSearchResult is intentionally different from SearchMatch:
  // - Uses 'text' instead of 'content'
  // - Has simpler 'context' (string vs {before, after})
  // - Designed for code intelligence results, not general file search
  SearchResult as CodeSearchResult,
  CodeEdit,
  ProjectMemory
} from './NativeCodeIntelligence.js';

// Glob - fast file pattern matching (replaces external glob tools)
export {
  NativeGlob,
  createGlob,
  createGlob as createNativeGlob,  // Alias for convenience
  nativeGlob
} from './NativeGlob.js';

export type {
  GlobOptions,
  GlobResult
} from './NativeGlob.js';

// Grep - fast content search (ripgrep-like interface)
export {
  NativeGrep,
  createGrep,
  createGrep as createNativeGrep,  // Alias for convenience
  nativeGrep
} from './NativeGrep.js';

export type {
  GrepOptions,
  GrepResult,
  GrepMatch
} from './NativeGrep.js';

// Serena Tools - unified native implementation of Serena tools
export {
  NativeSerenaTools,
  createNativeSerenaTools,
  nativeSerenaTools
} from './NativeSerenaTools.js';

export type {
  NativeToolDefinition,
  NativeToolResult
} from './NativeSerenaTools.js';

// Document Tools - Word, Excel, PDF creation and editing
export {
  createDocumentToolDefinitions
} from './NativeDocumentTools.js';

// LSP Languages - language server configurations (~30 languages)
export {
  getLanguageById,
  getLanguageByExtension,
  getAllLanguageIds,
  getAllSupportedExtensions,
  getLanguagesWithCapability,
  getLanguageStats,
  detectLanguageFromPath,
  isExtensionSupported,
  LANGUAGE_SERVERS
} from './NativeLSPLanguages.js';

export type {
  LanguageServerConfig
} from './NativeLSPLanguages.js';

// FileSystem Diagnostics - comprehensive path and permission diagnostics
export {
  FileSystemDiagnostics,
  createDiagnostics
} from './FileSystemDiagnostics.js';

export type {
  DiagnosticResult,
  PathValidationResult,
  PermissionResult,
  SystemInfo
} from './FileSystemDiagnostics.js';

// FileSystem Streaming - streaming support for large files (>50MB)
export {
  NativeFileSystemStreaming,
  createStreamingFileSystem,
  addStreamingMethods,
  FileSizeLimits,
  DEFAULT_CHUNK_SIZE,
  formatBytes
} from './NativeFileSystemStreaming.js';

export type {
  FileSizeLimitPreset,
  StreamingReadOptions,
  StreamingWriteOptions,
  StreamingProgress,
  StreamingReadResult,
  StreamingWriteResult,
  StreamingDataGenerator,
  StreamingConfig
} from './NativeFileSystemStreaming.js';

// Path Traversal Protection - comprehensive security against path traversal attacks
export {
  detectPathTraversal,
  sanitizePath,
  validateSecurePath,
  PathTraversalError,
  securityAuditLogger,
  hasTraversalPatterns,
  isPathSafe,
  getPathTraversalPatterns
} from './PathTraversalProtection.js';

export type {
  SecurityAuditEntry,
  PathTraversalDetectionResult,
  ValidateSecurePathOptions
} from './PathTraversalProtection.js';

// Encoding Utils - file encoding detection and conversion
export {
  BOM_SIGNATURES,
  detectEncoding,
  detectBOM,
  getBOMBytes,
  decodeBuffer,
  encodeBuffer,
  convertBufferEncoding,
  isSupportedEncoding,
  normalizeEncoding,
  getEncodingDisplayName
} from './EncodingUtils.js';

export type {
  SupportedEncoding,
  EncodingInfo,
  ReadFileWithEncodingOptions,
  WriteFileWithEncodingOptions
} from './EncodingUtils.js';

// Secure Script Executor - secure Python/Node execution without shell=true
export {
  SecureScriptExecutor,
  createSecureScriptExecutor,
  ScriptValidationError,
  ALLOWED_SCRIPT_EXTENSIONS,
  PYTHON_SANDBOX_BLOCKED_IMPORTS
} from './SecureScriptExecutor.js';

export type {
  ScriptExecOptions,
  ScriptValidationResult,
  ScriptExecutionLog,
  ScriptResult
} from './SecureScriptExecutor.js';

// ============================================================
// NativeTools - Unified API
// ============================================================

import { NativeFileSystem, createFileSystem } from './nativefilesystem/NativeFileSystem.js';
import { NativeMemory, createMemory } from './NativeMemory.js';
import { NativeShell, createShell } from './nativeshell/NativeShell.js';
import { ShellManager, createShellManager } from './ShellManager.js';
import { NativeSearch, createSearch } from './NativeSearch.js';
import { NativeCodeIntelligence, nativeCodeIntelligence } from './NativeCodeIntelligence.js';
import { SecureScriptExecutor, createSecureScriptExecutor } from './SecureScriptExecutor.js';

export interface NativeToolsConfig {
  rootDir: string;
  memoryPath?: string;
  autoSaveMemory?: boolean;
  defaultShell?: string;
}

export class NativeTools {
  readonly fs: NativeFileSystem;
  readonly memory: NativeMemory;
  readonly shell: NativeShell;
  readonly shellManager: ShellManager;
  readonly search: NativeSearch;
  readonly code: NativeCodeIntelligence;
  readonly scripts: SecureScriptExecutor;

  private config: NativeToolsConfig;

  constructor(config: NativeToolsConfig) {
    this.config = config;

    this.fs = createFileSystem(config.rootDir);

    this.memory = createMemory({
      persistPath: config.memoryPath || path.join(GEMINIHYDRA_DIR, 'memory.json'),
      autoSave: config.autoSaveMemory ?? true
    });

    // Create both NativeShell (for backward compatibility) and ShellManager
    this.shell = createShell({
      cwd: config.rootDir,
      defaultShell: config.defaultShell
    });

    // ShellManager provides unified, enhanced shell management
    this.shellManager = createShellManager({
      cwd: config.rootDir,
      defaultShell: config.defaultShell,
      profile: 'default'
    });

    this.search = createSearch(config.rootDir);

    this.code = nativeCodeIntelligence;

    // SecureScriptExecutor for safe Python/Node execution (no shell=true)
    this.scripts = createSecureScriptExecutor({
      cwd: config.rootDir,
      sandbox: false  // Default to non-sandboxed, can be enabled per-call
    });
  }

  /**
   * Initialize all tools (load persisted data, etc.)
   */
  async init(): Promise<void> {
    try {
      await this.memory.load();
      console.log(chalk.green('[NativeTools] Memory loaded'));
    } catch {
      console.log(chalk.gray('[NativeTools] No existing memory found'));
    }

    // Initialize code intelligence
    await this.code.init(this.config.rootDir);
    console.log(chalk.green('[NativeTools] Code intelligence initialized'));
  }

  /**
   * Save state and cleanup
   */
  async shutdown(): Promise<void> {
    await this.memory.save();
    this.memory.destroy();
    this.shell.destroy();
    this.shellManager.destroy();
    this.fs.stopAllWatchers();
    await this.code.shutdown();
    console.log(chalk.yellow('[NativeTools] Shutdown complete'));
  }

  /**
   * Print status of all tools
   */
  printStatus(): void {
    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════'));
    console.log(chalk.cyan('                    NATIVE TOOLS STATUS'));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════════════'));

    this.fs.printStatus();
    this.memory.printStatus();
    this.shell.printStatus();
    this.search.printStatus();

    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════════════\n'));
  }
}

// ============================================================
// Factory Function
// ============================================================

let instance: NativeTools | null = null;

export function createNativeTools(config: NativeToolsConfig): NativeTools {
  instance = new NativeTools(config);
  return instance;
}

export function getNativeTools(): NativeTools | null {
  return instance;
}

// ============================================================
// Singleton for Current Project
// ============================================================

let projectTools: NativeTools | null = null;

export async function initProjectTools(rootDir: string): Promise<NativeTools> {
  if (projectTools) {
    await projectTools.shutdown();
  }

  projectTools = createNativeTools({ rootDir });
  await projectTools.init();

  console.log(chalk.green(`[NativeTools] Initialized for: ${rootDir}`));
  return projectTools;
}

export function getProjectTools(): NativeTools | null {
  return projectTools;
}

// Default export
export { NativeTools as default };

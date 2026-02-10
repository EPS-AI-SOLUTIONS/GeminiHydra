/**
 * GeminiHydra CLI Module Index
 * All CLI features exposed from here
 */

// Internal imports for initializeCommands function
import { registerCodebaseCommands as _registerCodebaseCommands } from './CodebaseCommands.js';
import { registerSessionCommands as _registerSessionCommands } from './SessionCommands.js';
import { registerSerenaCommands as _registerSerenaCommands } from './SerenaCommands.js';
import { registerSerenaAgentCommands as _registerSerenaAgentCommands } from './SerenaAgentCommands.js';
import { registerMCPCommands as _registerMCPCommands } from './MCPCommands.js';
import { registerDiagnosticCommands as _registerDiagnosticCommands } from './CommandDiagnostics.js';
import { registerHelpCommand as _registerHelpCommand } from './help/index.js';
import { registerDocumentCommands as _registerDocumentCommands } from './DocumentCommands.js';

// Core CLI modes
export { InteractiveMode, COMPLETIONS, completer } from './InteractiveMode.js';
export { PipelineMode, pipe } from './PipelineMode.js';
export { WatchMode } from './WatchMode.js';
export { ProjectContext } from './ProjectContext.js';
export { CostTracker, costTracker } from './CostTracker.js';

// Feature #27: Git Integration
export { GitIntegration, git, gitCommands } from './GitIntegration.js';
export type { GitStatus, CommitOptions, PROptions } from './GitIntegration.js';

// Features #31-39: CLI Enhancements
export {
  ProgressBar,
  TaskEditor,
  TemplateManager,
  templateManager,
  OutputFormatter,
  outputFormatter,
  highlightCode,
  createCompleter,
  HistorySearch,
  historySearch,
  OutputPaginator,
  paginator,
  sendNotification
} from './CLIEnhancements.js';

export type {
  ProgressBarOptions,
  EditableTask,
  TaskTemplate,
  OutputFormat,
  AutocompleteOptions,
  NotificationOptions
} from './CLIEnhancements.js';

// Command Registry - Unified command management
export {
  CommandRegistry,
  commandRegistry,
  success,
  error,
  // Re-exported from AsyncUtils
  CancellationTokenSource,
  CancellationError,
  TimeoutError,
  ProgressReporter,
  isAsyncFunction,
  wrapHandler,
  withCancellation,
  withProgress,
  withCancellationAndProgress,
  executeWithTimeout,
  executeWithCancellation,
  executeWithTimeoutAndCancellation,
  delay,
  retry,
  OperationTracker,
  globalOperationTracker
} from './CommandRegistry.js';

export type {
  Command,
  CommandArg,
  CommandResult,
  CommandContext,
  CommandHandler,
  // Async types
  CancellationToken,
  ProgressInfo,
  ProgressCallback,
  SyncCommandHandler,
  AsyncCommandHandler,
  AnyCommandHandler,
  ExtendedCommandContext,
  ExtendedCommandHandler,
  ExecuteOptions
} from './CommandRegistry.js';

// AsyncUtils - Direct import for advanced usage
export * as AsyncUtils from './AsyncUtils.js';

// Subcommand Extension - Full subcommand support
export {
  SubcommandRegistry,
  createFsCommand,
  createFsReadSubcommand,
  createFsWriteSubcommand,
  createFsListSubcommand,
  registerFsCommandWithSubcommands
} from './SubcommandExtension.js';

export type {
  SubcommandInfo,
  SubcommandOptions,
  Subcommand,
  SubcommandContext
} from './SubcommandExtension.js';

// CWD Manager - Current Working Directory management
export {
  CwdManager,
  cwdManager
} from './CwdManager.js';

export type {
  CwdHistoryEntry,
  CwdManagerOptions,
  CwdChangeEvent,
  CwdChangeListener,
  CwdValidationResult
} from './CwdManager.js';

// Command Helpers - Shared utilities
export {
  parseArgs,
  getStringFlag,
  getBooleanFlag,
  getNumberFlag,
  formatTable,
  formatSimpleTable,
  formatDuration,
  formatRelativeTime,
  formatBytes,
  formatNumber,
  formatPercent,
  confirmAction,
  promptInput,
  promptSelect,
  truncate,
  indent,
  horizontalLine,
  box,
  Spinner,
  showProgress,
  statusIndicator,
  highlightMatch,
  escapeRegex
} from './CommandHelpers.js';

export type { ParsedArgs, TableColumn } from './CommandHelpers.js';

// Codebase Commands
export {
  codebaseCommands,
  analyzeCommand,
  memoryCommand,
  contextCommand,
  autoEnrichPrompt,
  initCodebaseForCwd,
  registerCodebaseCommands
} from './CodebaseCommands.js';

export type { LegacyCommandContext as CodebaseCommandContext } from './CodebaseCommands.js';

// Session Commands
export {
  sessionCommands,
  sessionsCommand,
  historyCommand,
  resumeCommand,
  initSessionSystem,
  recordMessage,
  getPromptContext,
  buildFullContext,
  saveAndClose,
  registerSessionCommands
} from './SessionCommands.js';

export type { LegacyCommandContext as SessionCommandContext } from './SessionCommands.js';

// Serena Commands (Code Intelligence - NativeCodeIntelligence)
export {
  serenaCommands,
  registerSerenaCommands
} from './SerenaCommands.js';

// Serena Agent Commands (Real Serena MCP Server)
export {
  serenaAgentCommands,
  registerSerenaAgentCommands,
  handleSerenaAgentCommand
} from './SerenaAgentCommands.js';

// MCP Integration Commands
export {
  mcpCommands,
  registerMCPCommands
} from './MCPCommands.js';

// Prompt Memory Commands
export { PromptCommands, promptCommands } from './PromptCommands.js';
export type { PromptCommandResult } from './PromptCommands.js';

// Command Diagnostics
export {
  CommandDiagnostics,
  commandDiagnostics,
  registerDiagnosticCommands
} from './CommandDiagnostics.js';

export type {
  RegistryStatus,
  CategoryInfo,
  ValidationIssue,
  CommandStats,
  DuplicateInfo,
  ExtendedCommandInfo
} from './CommandDiagnostics.js';

// Native Tools Commands
export {
  nativeCommands,
  fsCommands,
  shellCommands,
  searchCommands,
  memoryCommands,
  registerNativeCommands
} from './nativecommands/index.js';

// Document Commands (Word, Excel, PDF)
export {
  documentCommands,
  registerDocumentCommands
} from './DocumentCommands.js';

// Help System - Advanced help for commands
export {
  registerHelpCommand,
  helpMetaRegistry,
  categoryConfig,
  generateOverview,
  generateCommandHelp,
  generateFullReference,
  generateCategoryHelp,
  searchHelp,
  exportToMarkdown,
  exportToJSON,
  runInteractiveHelp,
  getCategoryDisplay,
  formatSignature,
  formatArg,
  // Helper functions for adding metadata
  addCommandExamples,
  addCommandNotes,
  setCommandSeeAlso,
  deprecateCommand
} from './help/index.js';

export type {
  CommandExample,
  CommandHelpMeta,
  CategoryConfig,
  ExportFormat
} from './help/index.js';

// Internal import for initialization
import { registerNativeCommands as _registerNativeCommands } from './nativecommands/index.js';

/**
 * Initialize all CLI commands with the registry
 */
export function initializeCommands(): void {
  // Register help system first (provides /help command)
  _registerHelpCommand();

  // Register all other commands
  _registerCodebaseCommands();
  _registerSessionCommands();
  _registerSerenaCommands();
  _registerSerenaAgentCommands();  // @serena - Real Serena MCP
  _registerMCPCommands();
  _registerNativeCommands();
  _registerDocumentCommands();
  _registerDiagnosticCommands();
}

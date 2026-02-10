/**
 * NativeShell - Module index
 *
 * Re-exports all NativeShell components.
 *
 * Original NativeShell.ts (3007 lines) has been split into:
 * - types.ts      - All type definitions, interfaces, error classes
 * - constants.ts  - Shell paths, command translations, env profiles, sandbox
 * - helpers.ts    - analyzeStderr, createProcessResult, default config factories
 * - NativeShell.ts - NativeShell class, createShell factory
 *
 * @module native/nativeshell/index
 */

// Types and interfaces
export type {
  ShellType,
  ShellInfo,
  CommandMapping,
  ProcessInfo,
  ZombieProcessInfo,
  GracefulShutdownConfig,
  CleanupStats,
  OutputChunk,
  StderrAnalysis,
  ProcessResult,
  ExecOptions,
  ProgressInfo,
  StreamingExecOptions,
  ProgressExecOptions,
  StreamingExecResult,
  PipeOptions,
  ShellSession,
  NativeShellConfig,
  EnvironmentConfig,
  EnvironmentProfile,
  ScriptExecOptions,
  ScriptValidationResult,
  ScriptExecutionLog,
  ShellTimeoutConfig,
  TimeoutProfile
} from './types.js';

// Error classes
export {
  CwdValidationError,
  ScriptValidationError
} from './types.js';

// Constants
export {
  SHELL_PATHS,
  COMMAND_TRANSLATIONS,
  SHELL_FALLBACK_ORDER,
  DEFAULT_MAX_OUTPUT_SIZE,
  DEFAULT_PROGRESS_PATTERNS,
  TIMEOUT_PROFILES,
  SENSITIVE_ENV_PATTERNS,
  DEFAULT_BLOCKED_ENV_VARS,
  ENVIRONMENT_PROFILES,
  ALLOWED_SCRIPT_EXTENSIONS,
  PYTHON_SANDBOX_BLOCKED_IMPORTS
} from './constants.js';

// Helpers
export {
  analyzeStderr,
  createProcessResult,
  createDefaultTimeoutConfig,
  createDefaultEnvironmentConfig
} from './helpers.js';

// Main class and factory
export { NativeShell, createShell } from './NativeShell.js';

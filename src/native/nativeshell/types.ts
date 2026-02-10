/**
 * NativeShell - Type definitions and interfaces
 *
 * All types, interfaces, enums, and error classes for the NativeShell system.
 *
 * @module native/nativeshell/types
 */

import { ChildProcess } from 'child_process';

// ============================================================
// Shell Types
// ============================================================

/**
 * Supported shell types across platforms
 */
export type ShellType = 'cmd' | 'powershell' | 'pwsh' | 'bash' | 'sh' | 'zsh';

/**
 * Shell availability info
 */
export interface ShellInfo {
  type: ShellType;
  path: string;
  available: boolean;
  version?: string;
}

/**
 * Command translation mapping between shells
 */
export interface CommandMapping {
  cmd: string;
  powershell: string;
  bash: string;
}

// ============================================================
// Process Types
// ============================================================

export interface ProcessInfo {
  pid: number;
  command: string;
  args: string[];
  status: 'running' | 'completed' | 'error' | 'killed' | 'zombie';
  exitCode?: number;
  startTime: Date;
  endTime?: Date;
  output: string[];
  errors: string[];
  // Extended tracking fields for zombie/orphan detection
  parentPid?: number;
  childPids: number[];
  processRef?: ChildProcess;
  killSignal?: NodeJS.Signals;
  isOrphaned?: boolean;
  lastHealthCheck?: Date;
}

/**
 * Extended process tracking for zombie detection
 */
export interface ZombieProcessInfo {
  pid: number;
  command: string;
  detectedAt: Date;
  reason: 'no_response' | 'orphaned' | 'stuck' | 'timeout';
}

/**
 * Graceful shutdown configuration
 */
export interface GracefulShutdownConfig {
  /** Time to wait for SIGTERM before SIGKILL (ms) */
  gracePeriod: number;
  /** Whether to kill entire process tree */
  killProcessTree: boolean;
  /** Callback when process doesn't respond to SIGTERM */
  onForceKill?: (pid: number) => void;
}

/**
 * Process cleanup statistics
 */
export interface CleanupStats {
  zombiesKilled: number;
  orphansKilled: number;
  processesTerminated: number;
  errors: string[];
}

/**
 * Output chunk with timestamp for combined stream ordering
 */
export interface OutputChunk {
  type: 'stdout' | 'stderr';
  data: string;
  timestamp: number;
}

/**
 * Stderr analysis result
 */
export interface StderrAnalysis {
  hasErrors: boolean;
  hasWarnings: boolean;
  errorLines: string[];
  warningLines: string[];
  errorCount: number;
  warningCount: number;
}

/**
 * Extended process result with separate streams
 */
export interface ProcessResult {
  pid: number;
  exitCode: number;
  signal: string | null;
  stdout: string;
  stderr: string;
  /** Combined output in order of arrival */
  combined: string;
  /** Raw chunks with timestamps for precise ordering */
  chunks: OutputChunk[];
  duration: number;
  /** Analysis of stderr for errors/warnings */
  stderrAnalysis: StderrAnalysis;

  /**
   * Check if stderr contains errors
   */
  hasErrors(): boolean;

  /**
   * Check if stderr contains warnings
   */
  hasWarnings(): boolean;

  /**
   * Get colorized output (stderr in red)
   */
  getColorizedOutput(): string;
}

// ============================================================
// Execution Options
// ============================================================

/**
 * Execution options for exec/run commands
 */
export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: string;
  /** Keep stdout and stderr separate (default: true) */
  separateStreams?: boolean;
  /** Redirect stderr to stdout stream (default: false) */
  stderrToStdout?: boolean;
  /** Callback for stdout data */
  onStdout?: (data: string, timestamp: number) => void;
  /** Callback for stderr data */
  onStderr?: (data: string, timestamp: number) => void;
  /** Colorize stderr in logs (default: true) */
  colorizeStderr?: boolean;
}

// ============================================================
// Streaming Types
// ============================================================

/**
 * Progress information extracted from output
 */
export interface ProgressInfo {
  percent?: number;
  current?: number;
  total?: number;
  message?: string;
  raw: string;
}

/**
 * Options for streaming execution
 */
export interface StreamingExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: string;
  /** Callback for each output chunk */
  onOutput?: (chunk: OutputChunk) => void;
  /** Whether to buffer all output (default: true) */
  bufferOutput?: boolean;
  /** Maximum output buffer size in bytes (default: 10MB) */
  maxOutputSize?: number;
}

/**
 * Options for progress execution
 */
export interface ProgressExecOptions extends StreamingExecOptions {
  /** Custom progress patterns to detect */
  progressPatterns?: RegExp[];
}

/**
 * Result from streaming execution
 */
export interface StreamingExecResult {
  pid: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  chunks: OutputChunk[];
  truncated: boolean;
}

/**
 * Pipe options for command chaining
 */
export interface PipeOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  shell?: string;
  /** Callback for intermediate output */
  onIntermediateOutput?: (stage: number, chunk: OutputChunk) => void;
  /** Maximum output buffer size in bytes */
  maxOutputSize?: number;
}

// ============================================================
// Session Types
// ============================================================

export interface ShellSession {
  id: string;
  shell: string;
  cwd: string;
  env: Record<string, string>;
  process?: ChildProcess;
  history: string[];
  created: Date;
}

// ============================================================
// Configuration Types
// ============================================================

export interface NativeShellConfig {
  defaultShell?: string;
  /** Preferred shell type */
  preferredShell?: ShellType;
  defaultTimeout?: number;
  maxProcesses?: number;
  cwd?: string;
  env?: Record<string, string>;
  timeoutConfig?: ShellTimeoutConfig;
  /** Whether to inherit cwd from parent process (default: true if cwd not specified) */
  inheritCwd?: boolean;
  /** Environment variable configuration */
  environmentConfig?: EnvironmentConfig;
  /** Enable automatic shell fallback when preferred shell is unavailable */
  autoFallback?: boolean;
}

// ============================================================
// Environment Configuration
// ============================================================

/**
 * Configuration for environment variable management
 */
export interface EnvironmentConfig {
  /** Whether to inherit environment variables from process.env (default: true) */
  inheritEnv: boolean;
  /** Additional environment variables to add */
  additionalEnv: Record<string, string>;
  /** Environment variables to block/remove (e.g., secrets) */
  blockedEnvVars: string[];
  /** Active environment profile */
  activeProfile?: EnvironmentProfile;
}

/**
 * Predefined environment profiles
 */
export type EnvironmentProfile = 'development' | 'production' | 'test';

// ============================================================
// Script Execution Types
// ============================================================

/**
 * Options for secure script execution
 */
export interface ScriptExecOptions {
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Execution timeout in milliseconds */
  timeout?: number;
  /** Enable sandbox mode (restricted imports for Python) */
  sandbox?: boolean;
  /** Log execution details */
  logExecution?: boolean;
}

/**
 * Script validation result
 */
export interface ScriptValidationResult {
  valid: boolean;
  error?: string;
  scriptPath?: string;
  interpreter?: string;
  extension?: string;
}

/**
 * Execution log entry
 */
export interface ScriptExecutionLog {
  timestamp: Date;
  interpreter: string;
  scriptPath?: string;
  inlineScript?: boolean;
  args: string[];
  cwd: string;
  sandbox: boolean;
  exitCode?: number;
  duration?: number;
  error?: string;
}

// ============================================================
// Error Classes
// ============================================================

export class CwdValidationError extends Error {
  constructor(
    public readonly requestedCwd: string,
    public readonly reason: 'not_exists' | 'not_directory' | 'no_access'
  ) {
    const messages = {
      not_exists: `Working directory does not exist: ${requestedCwd}`,
      not_directory: `Path is not a directory: ${requestedCwd}`,
      no_access: `Cannot access working directory: ${requestedCwd}`
    };
    super(messages[reason]);
    this.name = 'CwdValidationError';
  }
}

/**
 * Script validation error
 */
export class ScriptValidationError extends Error {
  constructor(
    public readonly scriptPath: string,
    public readonly reason: 'not_exists' | 'invalid_extension' | 'no_read_access' | 'sandbox_violation'
  ) {
    const messages = {
      not_exists: `Script file does not exist: ${scriptPath}`,
      invalid_extension: `Invalid script extension: ${scriptPath}`,
      no_read_access: `Cannot read script file: ${scriptPath}`,
      sandbox_violation: `Script contains blocked imports (sandbox mode): ${scriptPath}`
    };
    super(messages[reason]);
    this.name = 'ScriptValidationError';
  }
}

// ============================================================
// Timeout Configuration
// ============================================================

/**
 * Timeout configuration for shell commands
 */
export interface ShellTimeoutConfig {
  /** Default timeout in milliseconds (default: 120000 = 2 minutes) */
  defaultTimeout: number;
  /** Maximum allowed timeout in milliseconds (default: 600000 = 10 minutes) */
  maxTimeout: number;
  /** Per-command timeout overrides */
  perCommandTimeouts: Map<string, number>;
}

/**
 * Predefined timeout profiles
 */
export type TimeoutProfile = 'quick' | 'normal' | 'long' | 'build';

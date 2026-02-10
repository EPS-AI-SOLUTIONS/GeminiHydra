/**
 * NativeShell - Helper functions
 *
 * Utility functions: stderr analysis, ProcessResult factory,
 * default config creators.
 *
 * @module native/nativeshell/helpers
 */

import chalk from 'chalk';
import type {
  StderrAnalysis,
  ProcessResult,
  OutputChunk,
  ShellTimeoutConfig,
  EnvironmentConfig
} from './types.js';
import { TIMEOUT_PROFILES, DEFAULT_BLOCKED_ENV_VARS } from './constants.js';

// ============================================================
// Stderr Analysis Utilities
// ============================================================

/**
 * Error patterns for detecting errors in stderr
 */
const ERROR_PATTERNS: RegExp[] = [
  /\berror\b/i,
  /\bfailed\b/i,
  /\bfailure\b/i,
  /\bexception\b/i,
  /\bfatal\b/i,
  /\bcritical\b/i,
  /\baborted\b/i,
  /\bpanic\b/i,
  /\bsegmentation fault\b/i,
  /\bsegfault\b/i,
  /\baccess denied\b/i,
  /\bpermission denied\b/i,
  /\bnot found\b/i,
  /\bcommand not found\b/i,
  /\bno such file\b/i,
  /\bsyntax error\b/i,
  /\btype error\b/i,
  /\breference error\b/i,
  /^E:/i,          // npm-style errors
  /^ERR!/i,        // npm errors
  /^\[ERROR\]/i,   // bracketed errors
  /^error\[/i,     // Rust-style errors
];

/**
 * Warning patterns for detecting warnings in stderr
 */
const WARNING_PATTERNS: RegExp[] = [
  /\bwarning\b/i,
  /\bwarn\b/i,
  /\bdeprecated\b/i,
  /\bdeprecation\b/i,
  /\bcaution\b/i,
  /\battention\b/i,
  /^W:/i,          // npm-style warnings
  /^WARN/i,        // npm warnings
  /^\[WARN/i,      // bracketed warnings
  /^\[WARNING\]/i, // bracketed warnings
  /^warning\[/i,   // Rust-style warnings
];

/**
 * Analyze stderr content for errors and warnings
 */
export function analyzeStderr(stderr: string): StderrAnalysis {
  const lines = stderr.split('\n').filter(line => line.trim().length > 0);
  const errorLines: string[] = [];
  const warningLines: string[] = [];

  for (const line of lines) {
    const isError = ERROR_PATTERNS.some(pattern => pattern.test(line));
    const isWarning = WARNING_PATTERNS.some(pattern => pattern.test(line));

    if (isError) {
      errorLines.push(line);
    } else if (isWarning) {
      warningLines.push(line);
    }
  }

  return {
    hasErrors: errorLines.length > 0,
    hasWarnings: warningLines.length > 0,
    errorLines,
    warningLines,
    errorCount: errorLines.length,
    warningCount: warningLines.length
  };
}

/**
 * Create a ProcessResult object with methods
 */
export function createProcessResult(
  pid: number,
  exitCode: number,
  signal: string | null,
  stdout: string,
  stderr: string,
  combined: string,
  chunks: OutputChunk[],
  duration: number,
  stderrAnalysis: StderrAnalysis
): ProcessResult {
  return {
    pid,
    exitCode,
    signal,
    stdout,
    stderr,
    combined,
    chunks,
    duration,
    stderrAnalysis,

    hasErrors(): boolean {
      return this.stderrAnalysis.hasErrors || this.exitCode !== 0;
    },

    hasWarnings(): boolean {
      return this.stderrAnalysis.hasWarnings;
    },

    getColorizedOutput(): string {
      return this.chunks.map(chunk => {
        if (chunk.type === 'stderr') {
          return chalk.red(chunk.data);
        }
        return chunk.data;
      }).join('');
    }
  };
}

// ============================================================
// Default Configuration Factories
// ============================================================

/**
 * Create default timeout configuration
 */
export function createDefaultTimeoutConfig(): ShellTimeoutConfig {
  return {
    defaultTimeout: TIMEOUT_PROFILES.normal,  // 120s default
    maxTimeout: TIMEOUT_PROFILES.build,       // 600s max
    perCommandTimeouts: new Map()
  };
}

/**
 * Create default environment configuration
 */
export function createDefaultEnvironmentConfig(): EnvironmentConfig {
  return {
    inheritEnv: true,
    additionalEnv: {},
    blockedEnvVars: [...DEFAULT_BLOCKED_ENV_VARS],
    activeProfile: undefined
  };
}

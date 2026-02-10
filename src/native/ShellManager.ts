/**
 * ShellManager - Unified Shell Management Facade for GeminiHydra
 *
 * This module provides a unified API for all shell operations, integrating:
 * - Configuration management (timeout, cwd, env)
 * - Shell selection (CMD, PowerShell, Bash)
 * - Command escaping and quoting
 * - Process tracking and management
 * - Streaming output
 * - Predefined configuration profiles
 *
 * Features:
 * - Factory method for creating configured instances
 * - Predefined profiles: 'default', 'secure', 'performance', 'debug'
 * - Singleton export for easy access
 * - Full integration with NativeShell
 */

import { spawn, ChildProcess, SpawnOptions, execSync } from 'child_process';
import { EventEmitter } from 'events';
import os from 'os';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

import {
  NativeShell,
  TIMEOUT_PROFILES,
  CwdValidationError
} from './nativeshell/index.js';
import type {
  ShellType,
  ShellInfo,
  ProcessInfo,
  ProcessResult,
  ShellSession,
  NativeShellConfig,
  ShellTimeoutConfig,
  TimeoutProfile,
} from './nativeshell/index.js';

// ============================================================
// Types
// ============================================================

/**
 * Shell configuration profile name
 */
export type ShellConfigProfile = 'default' | 'secure' | 'performance' | 'debug';

/**
 * Extended shell configuration with all options
 */
export interface ShellManagerConfig extends Omit<NativeShellConfig, 'environmentConfig' | 'autoFallback'> {
  /** Profile name for predefined configuration */
  profile?: ShellConfigProfile;

  /** Shell selection preference */
  preferredShell?: ShellType;

  /** Enable sandbox mode (restricted operations) */
  sandbox?: boolean;

  /** Enable verbose logging */
  verbose?: boolean;

  /** List of blocked commands in sandbox mode */
  blockedCommands?: string[];

  /** List of allowed directories for file operations */
  allowedDirs?: string[];

  /** Maximum concurrent processes */
  maxConcurrentProcesses?: number;

  /** Enable command history tracking */
  trackHistory?: boolean;

  /** Maximum history size */
  maxHistorySize?: number;

  /** Enable output streaming */
  streamOutput?: boolean;

  /** Custom environment variables */
  customEnv?: Record<string, string>;

  /** Command prefix (e.g., 'sudo') */
  commandPrefix?: string;

  /** Command suffix (e.g., '2>&1') */
  commandSuffix?: string;
}

/**
 * Escape options for shell commands
 */
export interface EscapeOptions {
  /** Shell type for proper escaping */
  shell?: ShellType;
  /** Whether to quote the entire string */
  quote?: boolean;
  /** Preserve existing quotes */
  preserveQuotes?: boolean;
}

/**
 * Command execution options
 */
export interface ExecuteOptions {
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Specific shell to use */
  shell?: ShellType;
  /** Run in background */
  background?: boolean;
  /** Stream output in real-time */
  stream?: boolean;
  /** Callback for streaming stdout */
  onStdout?: (data: string) => void;
  /** Callback for streaming stderr */
  onStderr?: (data: string) => void;
}

/**
 * Process tracking entry
 */
export interface TrackedProcess {
  pid: number;
  command: string;
  shell: ShellType;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'error' | 'killed' | 'timeout';
  exitCode?: number;
  stdout: string[];
  stderr: string[];
  cwd: string;
  env: Record<string, string>;
}

/**
 * Shell availability result
 */
export interface ShellAvailability {
  cmd: ShellInfo;
  powershell: ShellInfo;
  pwsh: ShellInfo;
  bash: ShellInfo;
  sh: ShellInfo;
  zsh: ShellInfo;
  default: ShellType;
}

/**
 * Command history entry
 */
export interface HistoryEntry {
  command: string;
  timestamp: Date;
  exitCode?: number;
  duration?: number;
  shell: ShellType;
  cwd: string;
}

// ============================================================
// Predefined Configurations
// ============================================================

/**
 * Predefined configuration profiles
 */
export const SHELL_PROFILES: Record<ShellConfigProfile, Partial<ShellManagerConfig>> = {
  /**
   * Default configuration - balanced settings
   */
  default: {
    defaultTimeout: TIMEOUT_PROFILES.normal, // 2 minutes
    maxProcesses: 50,
    maxConcurrentProcesses: 10,
    trackHistory: true,
    maxHistorySize: 100,
    streamOutput: false,
    verbose: false,
    sandbox: false
  },

  /**
   * Secure configuration - sandboxed with restrictions
   */
  secure: {
    defaultTimeout: TIMEOUT_PROFILES.quick, // 10 seconds
    maxProcesses: 20,
    maxConcurrentProcesses: 5,
    sandbox: true,
    verbose: true,
    trackHistory: true,
    maxHistorySize: 500, // Keep more history for auditing
    blockedCommands: [
      'rm -rf /',
      'rmdir /s /q c:',
      'del /f /s /q',
      'format',
      'shutdown',
      'reboot',
      ':(){:|:&};:',  // Fork bomb
      'dd if=/dev/random',
      'mkfs',
      'chmod -R 777',
      'wget http',
      'curl http'
    ],
    allowedDirs: [
      process.cwd()
    ]
  },

  /**
   * Performance configuration - optimized for speed
   */
  performance: {
    defaultTimeout: TIMEOUT_PROFILES.build, // 10 minutes
    maxProcesses: 100,
    maxConcurrentProcesses: 20,
    trackHistory: false, // Disable for performance
    maxHistorySize: 0,
    streamOutput: true,
    verbose: false,
    sandbox: false
  },

  /**
   * Debug configuration - maximum visibility
   */
  debug: {
    defaultTimeout: TIMEOUT_PROFILES.long, // 5 minutes
    maxProcesses: 50,
    maxConcurrentProcesses: 5,
    trackHistory: true,
    maxHistorySize: 1000,
    streamOutput: true,
    verbose: true,
    sandbox: false
  }
};

// ============================================================
// ShellManager Class
// ============================================================

/**
 * Unified Shell Manager - Facade for all shell operations
 */
export class ShellManager extends EventEmitter {
  private shell: NativeShell;
  private config: Required<ShellManagerConfig>;
  private trackedProcesses: Map<number, TrackedProcess> = new Map();
  private commandHistory: HistoryEntry[] = [];
  private runningCount = 0;
  private shellAvailability: ShellAvailability | null = null;

  constructor(config: ShellManagerConfig = {}) {
    super();

    // Apply profile if specified
    const profileConfig = config.profile ? SHELL_PROFILES[config.profile] : SHELL_PROFILES.default;

    // Merge configurations with precedence: explicit > profile > defaults
    const mergedConfig: Required<ShellManagerConfig> = {
      // From NativeShellConfig
      defaultShell: config.defaultShell || this.detectDefaultShell(),
      defaultTimeout: config.defaultTimeout ?? profileConfig.defaultTimeout ?? TIMEOUT_PROFILES.normal,
      maxProcesses: config.maxProcesses ?? profileConfig.maxProcesses ?? 50,
      cwd: config.cwd || process.cwd(),
      env: { ...process.env, ...config.customEnv, ...config.env } as Record<string, string>,
      timeoutConfig: config.timeoutConfig || this.createDefaultTimeoutConfig(),
      inheritCwd: config.inheritCwd ?? true,

      // Extended config
      profile: config.profile || 'default',
      preferredShell: config.preferredShell || this.detectPreferredShell(),
      sandbox: config.sandbox ?? profileConfig.sandbox ?? false,
      verbose: config.verbose ?? profileConfig.verbose ?? false,
      blockedCommands: config.blockedCommands ?? profileConfig.blockedCommands ?? [],
      allowedDirs: config.allowedDirs ?? profileConfig.allowedDirs ?? [],
      maxConcurrentProcesses: config.maxConcurrentProcesses ?? profileConfig.maxConcurrentProcesses ?? 10,
      trackHistory: config.trackHistory ?? profileConfig.trackHistory ?? true,
      maxHistorySize: config.maxHistorySize ?? profileConfig.maxHistorySize ?? 100,
      streamOutput: config.streamOutput ?? profileConfig.streamOutput ?? false,
      customEnv: config.customEnv ?? {},
      commandPrefix: config.commandPrefix ?? '',
      commandSuffix: config.commandSuffix ?? ''
    };

    this.config = mergedConfig;

    // Initialize underlying NativeShell
    this.shell = new NativeShell({
      defaultShell: mergedConfig.defaultShell,
      defaultTimeout: mergedConfig.defaultTimeout,
      maxProcesses: mergedConfig.maxProcesses,
      cwd: mergedConfig.cwd,
      env: mergedConfig.env,
      timeoutConfig: mergedConfig.timeoutConfig,
      inheritCwd: mergedConfig.inheritCwd
    });

    // Set up event forwarding
    this.setupEventForwarding();

    if (this.config.verbose) {
      this.log('ShellManager initialized', { profile: this.config.profile });
    }
  }

  // ============================================================
  // Configuration
  // ============================================================

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<ShellManagerConfig>> {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<ShellManagerConfig>): void {
    Object.assign(this.config, updates);

    if (updates.env || updates.customEnv) {
      const baseEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) baseEnv[key] = value;
      }
      this.config.env = { ...baseEnv, ...this.config.customEnv, ...updates.env };
    }

    if (this.config.verbose) {
      this.log('Configuration updated', updates);
    }
  }

  /**
   * Set working directory
   */
  setCwd(cwd: string): void {
    if (!fs.existsSync(cwd)) {
      throw new CwdValidationError(cwd, 'not_exists');
    }
    if (!fs.statSync(cwd).isDirectory()) {
      throw new CwdValidationError(cwd, 'not_directory');
    }
    this.config.cwd = cwd;
  }

  /**
   * Set environment variable
   */
  setEnv(key: string, value: string): void {
    this.config.env[key] = value;
  }

  /**
   * Set multiple environment variables
   */
  setEnvBatch(env: Record<string, string>): void {
    Object.assign(this.config.env, env);
  }

  /**
   * Set timeout
   */
  setTimeout(timeout: number): void {
    this.config.defaultTimeout = timeout;
  }

  /**
   * Set timeout profile
   */
  setTimeoutProfile(profile: TimeoutProfile): void {
    this.config.defaultTimeout = TIMEOUT_PROFILES[profile];
  }

  // ============================================================
  // Shell Selection
  // ============================================================

  /**
   * Get available shells on the system
   */
  async getAvailableShells(): Promise<ShellAvailability> {
    if (this.shellAvailability) {
      return this.shellAvailability;
    }

    const isWindows = os.platform() === 'win32';

    const checkShell = async (type: ShellType, paths: string[]): Promise<ShellInfo> => {
      for (const shellPath of paths) {
        try {
          if (fs.existsSync(shellPath)) {
            let version: string | undefined;
            try {
              if (type === 'cmd') {
                // CMD doesn't have a version flag
                version = 'Windows CMD';
              } else if (type === 'powershell' || type === 'pwsh') {
                const result = execSync(`"${shellPath}" -Command "$PSVersionTable.PSVersion.ToString()"`, { encoding: 'utf-8', timeout: 5000 });
                version = result.trim();
              } else {
                const result = execSync(`"${shellPath}" --version`, { encoding: 'utf-8', timeout: 5000 });
                version = result.split('\n')[0].trim();
              }
            } catch {
              version = undefined;
            }
            return { type, path: shellPath, available: true, version };
          }
        } catch {
          continue;
        }
      }
      return { type, path: '', available: false };
    };

    const [cmd, powershell, pwsh, bash, sh, zsh] = await Promise.all([
      checkShell('cmd', isWindows ? ['C:\\Windows\\System32\\cmd.exe'] : []),
      checkShell('powershell', isWindows
        ? ['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe']
        : ['/usr/bin/powershell', '/usr/local/bin/powershell']),
      checkShell('pwsh', isWindows
        ? ['C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'C:\\Program Files\\PowerShell\\pwsh.exe']
        : ['/usr/bin/pwsh', '/usr/local/bin/pwsh']),
      checkShell('bash', isWindows
        ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Windows\\System32\\bash.exe']
        : ['/bin/bash', '/usr/bin/bash']),
      checkShell('sh', ['/bin/sh', '/usr/bin/sh']),
      checkShell('zsh', ['/bin/zsh', '/usr/bin/zsh', '/usr/local/bin/zsh'])
    ]);

    this.shellAvailability = {
      cmd, powershell, pwsh, bash, sh, zsh,
      default: this.config.preferredShell
    };

    return this.shellAvailability;
  }

  /**
   * Select shell to use
   */
  selectShell(shell: ShellType): void {
    this.config.preferredShell = shell;
    this.config.defaultShell = this.getShellExecutable(shell);
  }

  /**
   * Get shell executable path
   */
  private getShellExecutable(shell: ShellType): string {
    const isWindows = os.platform() === 'win32';

    const shellPaths: Record<ShellType, string[]> = {
      cmd: ['C:\\Windows\\System32\\cmd.exe'],
      powershell: isWindows
        ? ['C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe']
        : ['/usr/bin/powershell', '/usr/local/bin/powershell'],
      pwsh: isWindows
        ? ['C:\\Program Files\\PowerShell\\7\\pwsh.exe']
        : ['/usr/bin/pwsh', '/usr/local/bin/pwsh'],
      bash: isWindows
        ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Windows\\System32\\bash.exe']
        : ['/bin/bash', '/usr/bin/bash'],
      sh: ['/bin/sh', '/usr/bin/sh'],
      zsh: ['/bin/zsh', '/usr/bin/zsh']
    };

    const paths = shellPaths[shell] || [];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    // Fallback to shell name (let OS resolve it)
    return shell;
  }

  // ============================================================
  // Escape and Quoting
  // ============================================================

  /**
   * Escape a string for shell execution
   */
  escape(str: string, options: EscapeOptions = {}): string {
    const shell = options.shell || this.config.preferredShell;

    switch (shell) {
      case 'cmd':
        return this.escapeCmdString(str, options);
      case 'powershell':
      case 'pwsh':
        return this.escapePowerShellString(str, options);
      case 'bash':
      case 'sh':
      case 'zsh':
      default:
        return this.escapeBashString(str, options);
    }
  }

  /**
   * Quote a string for shell execution
   */
  quote(str: string, options: EscapeOptions = {}): string {
    const shell = options.shell || this.config.preferredShell;

    switch (shell) {
      case 'cmd':
        return `"${this.escapeCmdString(str, { ...options, quote: false })}"`;
      case 'powershell':
      case 'pwsh':
        return `"${this.escapePowerShellString(str, { ...options, quote: false })}"`;
      case 'bash':
      case 'sh':
      case 'zsh':
      default:
        return `'${str.replace(/'/g, "'\\''")}'`;
    }
  }

  /**
   * Quote a path for shell execution
   */
  quotePath(filePath: string, options: EscapeOptions = {}): string {
    // Normalize path separators based on shell
    const shell = options.shell || this.config.preferredShell;
    let normalizedPath = filePath;

    if (shell === 'cmd' || shell === 'powershell' || shell === 'pwsh') {
      normalizedPath = filePath.replace(/\//g, '\\');
    } else {
      normalizedPath = filePath.replace(/\\/g, '/');
    }

    return this.quote(normalizedPath, options);
  }

  private escapeCmdString(str: string, _options: EscapeOptions): string {
    // CMD special characters: & | < > ^ " %
    return str
      .replace(/\^/g, '^^')
      .replace(/&/g, '^&')
      .replace(/\|/g, '^|')
      .replace(/</g, '^<')
      .replace(/>/g, '^>')
      .replace(/"/g, '\\"')
      .replace(/%/g, '%%');
  }

  private escapePowerShellString(str: string, _options: EscapeOptions): string {
    // PowerShell special characters: ` $ " ' @ # { } ( ) ; ,
    return str
      .replace(/`/g, '``')
      .replace(/\$/g, '`$')
      .replace(/"/g, '`"')
      .replace(/'/g, "''");
  }

  private escapeBashString(str: string, _options: EscapeOptions): string {
    // Bash special characters: \ ' " $ ` ! * ? [ ] { } ( ) ; & | < > # ~
    return str
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$')
      .replace(/`/g, '\\`')
      .replace(/!/g, '\\!');
  }

  // ============================================================
  // Command Execution
  // ============================================================

  /**
   * Execute command and wait for completion
   */
  async exec(command: string, options: ExecuteOptions = {}): Promise<ProcessResult> {
    // Validate in sandbox mode
    if (this.config.sandbox) {
      this.validateCommand(command);
    }

    // Check concurrent process limit
    if (this.runningCount >= this.config.maxConcurrentProcesses) {
      throw new Error(`Maximum concurrent processes (${this.config.maxConcurrentProcesses}) reached`);
    }

    // Apply prefix/suffix
    let finalCommand = command;
    if (this.config.commandPrefix) {
      finalCommand = `${this.config.commandPrefix} ${finalCommand}`;
    }
    if (this.config.commandSuffix) {
      finalCommand = `${finalCommand} ${this.config.commandSuffix}`;
    }

    const startTime = Date.now();
    this.runningCount++;

    try {
      const result = await this.shell.exec(finalCommand, {
        cwd: options.cwd || this.config.cwd,
        env: { ...this.config.env, ...options.env },
        timeout: options.timeout || this.config.defaultTimeout,
        shell: options.shell ? this.getShellExecutable(options.shell) : this.config.defaultShell
      });

      const duration = Date.now() - startTime;

      // Track in history
      if (this.config.trackHistory) {
        this.addToHistory({
          command,
          timestamp: new Date(),
          exitCode: result.exitCode,
          duration,
          shell: options.shell || this.config.preferredShell,
          cwd: options.cwd || this.config.cwd
        });
      }

      // Track process
      this.trackProcess(result.pid, command, options, result);

      if (this.config.verbose) {
        this.log('Command completed', {
          command: command.slice(0, 50),
          exitCode: result.exitCode,
          duration
        });
      }

      return result;
    } finally {
      this.runningCount--;
    }
  }

  /**
   * Execute command and get stdout
   */
  async run(command: string, options: ExecuteOptions = {}): Promise<string> {
    const result = await this.exec(command, options);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Command failed with exit code ${result.exitCode}`);
    }
    return result.stdout;
  }

  /**
   * Execute command in background
   */
  async background(command: string, options: ExecuteOptions = {}): Promise<number> {
    if (this.config.sandbox) {
      this.validateCommand(command);
    }

    const cwd = options.cwd || this.config.cwd;
    const env = { ...this.config.env, ...options.env };

    const pid = await this.shell.background(command, { cwd, env });

    if (this.config.verbose) {
      this.log('Background process started', { pid, command: command.slice(0, 50) });
    }

    return pid;
  }

  /**
   * Spawn process with streaming
   */
  spawn(
    command: string,
    args: string[] = [],
    options: ExecuteOptions = {}
  ): { pid: number; process: ChildProcess } {
    if (this.config.sandbox) {
      this.validateCommand(command);
    }

    const result = this.shell.spawn(command, args, {
      cwd: options.cwd || this.config.cwd,
      env: { ...this.config.env, ...options.env },
      shell: options.shell ? this.getShellExecutable(options.shell) : true
    });

    // Set up streaming callbacks
    if (options.onStdout) {
      result.process.stdout?.on('data', (data) => options.onStdout!(data.toString()));
    }
    if (options.onStderr) {
      result.process.stderr?.on('data', (data) => options.onStderr!(data.toString()));
    }

    if (this.config.verbose) {
      this.log('Process spawned', { pid: result.pid, command });
    }

    return result;
  }

  // ============================================================
  // Process Management
  // ============================================================

  /**
   * Kill process by PID
   */
  kill(pid: number, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const result = this.shell.kill(pid, signal);

    if (result) {
      const tracked = this.trackedProcesses.get(pid);
      if (tracked) {
        tracked.status = 'killed';
        tracked.endTime = new Date();
      }

      if (this.config.verbose) {
        this.log('Process killed', { pid, signal });
      }
    }

    return result;
  }

  /**
   * Get process info
   */
  getProcess(pid: number): ProcessInfo | TrackedProcess | undefined {
    return this.trackedProcesses.get(pid) || this.shell.getProcess(pid);
  }

  /**
   * Get process output
   */
  getOutput(pid: number): string {
    const tracked = this.trackedProcesses.get(pid);
    if (tracked) {
      return tracked.stdout.join('');
    }
    return this.shell.getOutput(pid);
  }

  /**
   * Get process errors
   */
  getErrors(pid: number): string {
    const tracked = this.trackedProcesses.get(pid);
    if (tracked) {
      return tracked.stderr.join('');
    }
    return this.shell.getErrors(pid);
  }

  /**
   * List all processes
   */
  listProcesses(filter?: { status?: ProcessInfo['status'] }): (ProcessInfo | TrackedProcess)[] {
    const shellProcesses = this.shell.listProcesses(filter);
    const trackedProcesses = Array.from(this.trackedProcesses.values());

    if (filter?.status) {
      return trackedProcesses.filter(p => p.status === filter.status);
    }

    return trackedProcesses;
  }

  /**
   * Get running process count
   */
  getRunningCount(): number {
    return this.runningCount;
  }

  /**
   * Clean up completed processes
   */
  cleanup(maxAge: number = 3600000): number {
    const shellCleaned = this.shell.cleanup(maxAge);

    const now = Date.now();
    let trackedCleaned = 0;

    for (const [pid, process] of this.trackedProcesses.entries()) {
      if (process.status !== 'running' && process.endTime) {
        if (now - process.endTime.getTime() > maxAge) {
          this.trackedProcesses.delete(pid);
          trackedCleaned++;
        }
      }
    }

    if (this.config.verbose) {
      this.log('Cleanup completed', { shellCleaned, trackedCleaned });
    }

    return shellCleaned + trackedCleaned;
  }

  // ============================================================
  // Session Management
  // ============================================================

  /**
   * Create interactive shell session
   */
  createSession(options?: {
    shell?: ShellType;
    cwd?: string;
    env?: Record<string, string>;
  }): ShellSession {
    const shell = options?.shell
      ? this.getShellExecutable(options.shell)
      : this.config.defaultShell;

    return this.shell.createSession({
      shell,
      cwd: options?.cwd || this.config.cwd,
      env: { ...this.config.env, ...options?.env }
    });
  }

  /**
   * Send input to session
   */
  async sendToSession(sessionId: string, input: string): Promise<string> {
    return this.shell.sendToSession(sessionId, input);
  }

  /**
   * Close session
   */
  closeSession(sessionId: string): boolean {
    return this.shell.closeSession(sessionId);
  }

  /**
   * Get session
   */
  getSession(sessionId: string): ShellSession | undefined {
    return this.shell.getSession(sessionId);
  }

  /**
   * List sessions
   */
  listSessions(): ShellSession[] {
    return this.shell.listSessions();
  }

  // ============================================================
  // History
  // ============================================================

  /**
   * Get command history
   */
  getHistory(limit?: number): HistoryEntry[] {
    if (limit) {
      return this.commandHistory.slice(-limit);
    }
    return [...this.commandHistory];
  }

  /**
   * Clear command history
   */
  clearHistory(): void {
    this.commandHistory = [];
    if (this.config.verbose) {
      this.log('History cleared');
    }
  }

  /**
   * Search history
   */
  searchHistory(query: string): HistoryEntry[] {
    return this.commandHistory.filter(entry =>
      entry.command.toLowerCase().includes(query.toLowerCase())
    );
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /**
   * Check if command exists
   */
  async which(command: string): Promise<string | null> {
    return this.shell.which(command);
  }

  /**
   * Get system info
   */
  getSystemInfo(): Record<string, any> {
    return {
      ...this.shell.getSystemInfo(),
      shellManager: {
        profile: this.config.profile,
        preferredShell: this.config.preferredShell,
        sandbox: this.config.sandbox,
        runningProcesses: this.runningCount,
        trackedProcesses: this.trackedProcesses.size,
        historySize: this.commandHistory.length
      }
    };
  }

  /**
   * Run Python script
   */
  async python(script: string, args: string[] = []): Promise<string> {
    return this.shell.python(script, args);
  }

  /**
   * Run Node.js script
   */
  async node(script: string): Promise<string> {
    return this.shell.node(script);
  }

  // ============================================================
  // Status and Diagnostics
  // ============================================================

  /**
   * Print status
   */
  printStatus(): void {
    console.log(chalk.cyan('\n=== Shell Manager ===\n'));
    console.log(chalk.gray(`  Profile: ${this.config.profile}`));
    console.log(chalk.gray(`  Preferred Shell: ${this.config.preferredShell}`));
    console.log(chalk.gray(`  Default Shell: ${this.config.defaultShell}`));
    console.log(chalk.gray(`  Working Dir: ${this.config.cwd}`));
    console.log(chalk.gray(`  Timeout: ${this.config.defaultTimeout}ms`));
    console.log(chalk.gray(`  Sandbox: ${this.config.sandbox ? chalk.yellow('ENABLED') : 'disabled'}`));
    console.log(chalk.gray(`  Verbose: ${this.config.verbose}`));
    console.log(chalk.gray(`  Running Processes: ${this.runningCount}/${this.config.maxConcurrentProcesses}`));
    console.log(chalk.gray(`  Tracked Processes: ${this.trackedProcesses.size}`));
    console.log(chalk.gray(`  History: ${this.commandHistory.length}/${this.config.maxHistorySize}`));

    // Also print underlying shell status
    this.shell.printStatus();
  }

  /**
   * Get metrics
   */
  getMetrics(): {
    running: number;
    tracked: number;
    historySize: number;
    sessionsActive: number;
  } {
    return {
      running: this.runningCount,
      tracked: this.trackedProcesses.size,
      historySize: this.commandHistory.length,
      sessionsActive: this.shell.listSessions().length
    };
  }

  // ============================================================
  // Cleanup and Destruction
  // ============================================================

  /**
   * Destroy the shell manager
   */
  destroy(): void {
    this.shell.destroy();
    this.trackedProcesses.clear();
    this.commandHistory = [];
    this.runningCount = 0;

    if (this.config.verbose) {
      this.log('ShellManager destroyed');
    }

    this.emit('destroyed');
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  private detectDefaultShell(): string {
    const isWindows = os.platform() === 'win32';
    return isWindows ? 'powershell.exe' : '/bin/bash';
  }

  private detectPreferredShell(): ShellType {
    const isWindows = os.platform() === 'win32';
    return isWindows ? 'powershell' : 'bash';
  }

  private createDefaultTimeoutConfig(): ShellTimeoutConfig {
    return {
      defaultTimeout: TIMEOUT_PROFILES.normal,
      maxTimeout: TIMEOUT_PROFILES.build,
      perCommandTimeouts: new Map()
    };
  }

  private validateCommand(command: string): void {
    const lowerCommand = command.toLowerCase();

    // Check blocked commands
    for (const blocked of this.config.blockedCommands) {
      if (lowerCommand.includes(blocked.toLowerCase())) {
        throw new Error(`Command blocked in sandbox mode: ${blocked}`);
      }
    }

    // Check allowed directories if specified
    if (this.config.allowedDirs.length > 0) {
      // Basic check - more sophisticated validation would require parsing the command
      const hasUnsafeAccess = !this.config.allowedDirs.some(dir =>
        command.includes(dir) || command.includes(path.resolve(dir))
      );

      // Only warn in verbose mode, don't block (could have false positives)
      if (hasUnsafeAccess && this.config.verbose) {
        this.log('Warning: Command may access directories outside allowed list', { command: command.slice(0, 50) });
      }
    }
  }

  private trackProcess(
    pid: number,
    command: string,
    options: ExecuteOptions,
    result: ProcessResult
  ): void {
    const tracked: TrackedProcess = {
      pid,
      command,
      shell: options.shell || this.config.preferredShell,
      startTime: new Date(Date.now() - result.duration),
      endTime: new Date(),
      status: result.exitCode === 0 ? 'completed' : 'error',
      exitCode: result.exitCode,
      stdout: [result.stdout],
      stderr: [result.stderr],
      cwd: options.cwd || this.config.cwd,
      env: { ...this.config.env, ...options.env }
    };

    this.trackedProcesses.set(pid, tracked);

    // Emit event
    this.emit('process:completed', tracked);
  }

  private addToHistory(entry: HistoryEntry): void {
    this.commandHistory.push(entry);

    // Trim if exceeds max size
    if (this.commandHistory.length > this.config.maxHistorySize) {
      this.commandHistory = this.commandHistory.slice(-this.config.maxHistorySize);
    }
  }

  private setupEventForwarding(): void {
    this.shell.on('stdout', (data) => this.emit('stdout', data));
    this.shell.on('stderr', (data) => this.emit('stderr', data));
    this.shell.on('close', (data) => this.emit('close', data));
  }

  private log(message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [ShellManager] ${message}`;

    if (data) {
      console.log(chalk.gray(logLine), data);
    } else {
      console.log(chalk.gray(logLine));
    }

    this.emit('log', { message, data, timestamp });
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a new ShellManager with the specified configuration
 */
export function createShellManager(config: ShellManagerConfig = {}): ShellManager {
  return new ShellManager(config);
}

/**
 * Create ShellManager with a predefined profile
 */
export function createShellManagerWithProfile(profile: ShellConfigProfile): ShellManager {
  return new ShellManager({ profile });
}

// ============================================================
// Singleton Instance
// ============================================================

let _shellManager: ShellManager | null = null;

/**
 * Get the singleton ShellManager instance
 * Creates one with default config if it doesn't exist
 */
export function getShellManager(): ShellManager {
  if (!_shellManager) {
    _shellManager = new ShellManager();
  }
  return _shellManager;
}

/**
 * Initialize the singleton ShellManager with custom config
 */
export function initShellManager(config: ShellManagerConfig = {}): ShellManager {
  if (_shellManager) {
    _shellManager.destroy();
  }
  _shellManager = new ShellManager(config);
  return _shellManager;
}

/**
 * Reset the singleton (for testing)
 */
export function resetShellManager(): void {
  if (_shellManager) {
    _shellManager.destroy();
    _shellManager = null;
  }
}

// Default singleton export
export const shellManager = getShellManager();

// ============================================================
// Default Export
// ============================================================

export default ShellManager;

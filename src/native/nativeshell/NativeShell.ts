/**
 * NativeShell - Main class for native shell/process execution
 *
 * Features:
 * - Process spawning with streaming output
 * - Interactive process support
 * - Session management
 * - Process monitoring
 * - Environment management
 * - Shell detection and translation
 * - Zombie/orphan process cleanup
 *
 * @module native/nativeshell/NativeShell
 */

import { type ChildProcess, execSync, type SpawnOptions, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import {
  COMMAND_TRANSLATIONS,
  DEFAULT_MAX_OUTPUT_SIZE,
  DEFAULT_PROGRESS_PATTERNS,
  ENVIRONMENT_PROFILES,
  SENSITIVE_ENV_PATTERNS,
  SHELL_FALLBACK_ORDER,
  SHELL_PATHS,
  TIMEOUT_PROFILES,
} from './constants.js';
import {
  analyzeStderr,
  createDefaultEnvironmentConfig,
  createDefaultTimeoutConfig,
  createProcessResult,
} from './helpers.js';
import type {
  CleanupStats,
  CommandMapping,
  EnvironmentConfig,
  EnvironmentProfile,
  ExecOptions,
  NativeShellConfig,
  OutputChunk,
  PipeOptions,
  ProcessInfo,
  ProcessResult,
  ProgressExecOptions,
  ProgressInfo,
  ShellInfo,
  ShellSession,
  ShellTimeoutConfig,
  ShellType,
  StreamingExecOptions,
  StreamingExecResult,
  TimeoutProfile,
  ZombieProcessInfo,
} from './types.js';
import { CwdValidationError } from './types.js';

// ============================================================
// NativeShell Class
// ============================================================

export class NativeShell extends EventEmitter {
  private processes: Map<number, ProcessInfo> = new Map();
  private sessions: Map<string, ShellSession> = new Map();
  private config: Required<
    Omit<NativeShellConfig, 'timeoutConfig' | 'inheritCwd' | 'environmentConfig' | 'preferredShell'>
  > & { environmentConfig: EnvironmentConfig; preferredShell?: ShellType };
  private timeoutConfig: ShellTimeoutConfig;
  private processCounter = 0;
  private activeTimeoutWarnings: Map<number, NodeJS.Timeout> = new Map();

  // Environment variables managed by this shell instance
  private managedEnv: Record<string, string> = {};

  // Working directory management
  private _defaultCwd: string = process.cwd();
  private _inheritCwd: boolean = true;

  // Zombie/orphan process tracking
  private zombieProcesses: Map<number, ZombieProcessInfo> = new Map();
  private zombieCleanupInterval: NodeJS.Timeout | null = null;
  private readonly ZOMBIE_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly ZOMBIE_TIMEOUT = 60000; // 1 minute without activity = zombie
  private readonly GRACEFUL_SHUTDOWN_TIMEOUT = 5000; // 5 seconds grace period
  private isShuttingDown = false;

  constructor(config: NativeShellConfig = {}) {
    super();

    const isWindows = os.platform() === 'win32';

    // Initialize timeout configuration
    this.timeoutConfig = config.timeoutConfig || createDefaultTimeoutConfig();

    // Override defaultTimeout if provided at top level (backward compatibility)
    if (config.defaultTimeout !== undefined) {
      this.timeoutConfig.defaultTimeout = config.defaultTimeout;
    }

    // Initialize environment configuration
    const envConfig = config.environmentConfig || createDefaultEnvironmentConfig();

    // Initialize working directory management
    this._inheritCwd = config.inheritCwd ?? config.cwd === undefined;
    const initialCwd = config.cwd || process.cwd();
    this._defaultCwd = initialCwd;

    this.config = {
      defaultShell: config.defaultShell || (isWindows ? 'powershell.exe' : '/bin/bash'),
      defaultTimeout: this.timeoutConfig.defaultTimeout,
      maxProcesses: config.maxProcesses || 50,
      cwd: initialCwd,
      env: {},
      preferredShell: config.preferredShell,
      autoFallback: config.autoFallback ?? true,
      environmentConfig: envConfig,
    };

    // Build initial environment
    this.rebuildEnvironment();

    // Log initial cwd
    this.logCwdChange(undefined, this.config.cwd, 'initialization');

    // Start periodic zombie cleanup
    this.startZombieCleanup();

    // Setup graceful shutdown handlers
    this.setupShutdownHandlers();
  }

  // ============================================================
  // Working Directory Management
  // ============================================================

  private validateCwd(cwdPath: string): void {
    try {
      const resolvedPath = path.resolve(cwdPath);
      if (!fs.existsSync(resolvedPath)) {
        throw new CwdValidationError(cwdPath, 'not_exists');
      }
      const stats = fs.statSync(resolvedPath);
      if (!stats.isDirectory()) {
        throw new CwdValidationError(cwdPath, 'not_directory');
      }
      fs.accessSync(resolvedPath, fs.constants.R_OK);
    } catch (error) {
      if (error instanceof CwdValidationError) {
        throw error;
      }
      throw new CwdValidationError(cwdPath, 'no_access');
    }
  }

  private logCwdChange(oldCwd: string | undefined, newCwd: string, reason: string): void {
    const timestamp = new Date().toISOString();
    const message = oldCwd
      ? `[${timestamp}] CWD changed: "${oldCwd}" -> "${newCwd}" (${reason})`
      : `[${timestamp}] CWD set: "${newCwd}" (${reason})`;

    this.emit('cwd-change', { oldCwd, newCwd, reason, timestamp });

    if (process.env.DEBUG || process.env.NATIVE_SHELL_DEBUG) {
      console.log(chalk.yellow('[NativeShell]'), message);
    }
  }

  private resolveCwd(optionsCwd?: string): string {
    let effectiveCwd: string;
    if (optionsCwd) {
      effectiveCwd = path.resolve(optionsCwd);
    } else if (this._inheritCwd) {
      effectiveCwd = process.cwd();
    } else {
      effectiveCwd = this.config.cwd;
    }
    this.validateCwd(effectiveCwd);
    return effectiveCwd;
  }

  setDefaultCwd(cwdPath: string): void {
    const resolvedPath = path.resolve(cwdPath);
    this.validateCwd(resolvedPath);
    const oldCwd = this._defaultCwd;
    this._defaultCwd = resolvedPath;
    this.config.cwd = resolvedPath;
    this.logCwdChange(oldCwd, resolvedPath, 'setDefaultCwd');
  }

  getCwd(): string {
    if (this._inheritCwd) {
      return process.cwd();
    }
    return this._defaultCwd;
  }

  getConfiguredCwd(): string {
    return this._defaultCwd;
  }

  isInheritCwdEnabled(): boolean {
    return this._inheritCwd;
  }

  setInheritCwd(inherit: boolean): void {
    const oldValue = this._inheritCwd;
    this._inheritCwd = inherit;
    if (oldValue !== inherit) {
      const effectiveCwd = inherit ? process.cwd() : this._defaultCwd;
      this.logCwdChange(
        oldValue ? process.cwd() : this._defaultCwd,
        effectiveCwd,
        `inheritCwd ${inherit ? 'enabled' : 'disabled'}`,
      );
    }
  }

  async withCwd<T>(cwdPath: string, fn: () => Promise<T>): Promise<T> {
    const resolvedPath = path.resolve(cwdPath);
    this.validateCwd(resolvedPath);
    const previousCwd = this._defaultCwd;
    const previousInheritCwd = this._inheritCwd;
    try {
      this._defaultCwd = resolvedPath;
      this.config.cwd = resolvedPath;
      this._inheritCwd = false;
      this.logCwdChange(previousCwd, resolvedPath, 'withCwd enter');
      return await fn();
    } finally {
      this._defaultCwd = previousCwd;
      this.config.cwd = previousCwd;
      this._inheritCwd = previousInheritCwd;
      this.logCwdChange(resolvedPath, previousCwd, 'withCwd exit');
    }
  }

  withCwdSync<T>(cwdPath: string, fn: () => T): T {
    const resolvedPath = path.resolve(cwdPath);
    this.validateCwd(resolvedPath);
    const previousCwd = this._defaultCwd;
    const previousInheritCwd = this._inheritCwd;
    try {
      this._defaultCwd = resolvedPath;
      this.config.cwd = resolvedPath;
      this._inheritCwd = false;
      this.logCwdChange(previousCwd, resolvedPath, 'withCwdSync enter');
      return fn();
    } finally {
      this._defaultCwd = previousCwd;
      this.config.cwd = previousCwd;
      this._inheritCwd = previousInheritCwd;
      this.logCwdChange(resolvedPath, previousCwd, 'withCwdSync exit');
    }
  }

  cwdExists(cwdPath: string): boolean {
    try {
      this.validateCwd(cwdPath);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // Timeout Configuration Methods
  // ============================================================

  setDefaultTimeout(ms: number): void {
    const clampedTimeout = Math.min(ms, this.timeoutConfig.maxTimeout);
    this.timeoutConfig.defaultTimeout = clampedTimeout;
    this.config.defaultTimeout = clampedTimeout;
    if (ms > this.timeoutConfig.maxTimeout) {
      console.warn(
        chalk.yellow(
          `[NativeShell] Timeout clamped to max: ${ms}ms -> ${this.timeoutConfig.maxTimeout}ms`,
        ),
      );
    }
  }

  setCommandTimeout(commandPattern: string, ms: number): void {
    const clampedTimeout = Math.min(ms, this.timeoutConfig.maxTimeout);
    this.timeoutConfig.perCommandTimeouts.set(commandPattern, clampedTimeout);
    if (ms > this.timeoutConfig.maxTimeout) {
      console.warn(
        chalk.yellow(
          `[NativeShell] Timeout for "${commandPattern}" clamped to max: ${ms}ms -> ${this.timeoutConfig.maxTimeout}ms`,
        ),
      );
    }
  }

  getTimeoutForCommand(command: string): number {
    for (const [pattern, timeout] of this.timeoutConfig.perCommandTimeouts.entries()) {
      if (this.matchCommandPattern(command, pattern)) {
        return timeout;
      }
    }
    return this.timeoutConfig.defaultTimeout;
  }

  applyTimeoutProfile(profile: TimeoutProfile): void {
    const timeout = TIMEOUT_PROFILES[profile];
    this.setDefaultTimeout(timeout);
    console.log(chalk.gray(`[NativeShell] Applied timeout profile: ${profile} (${timeout}ms)`));
  }

  setMaxTimeout(ms: number): void {
    this.timeoutConfig.maxTimeout = ms;
    if (this.timeoutConfig.defaultTimeout > ms) {
      this.timeoutConfig.defaultTimeout = ms;
      this.config.defaultTimeout = ms;
    }
    for (const [pattern, timeout] of this.timeoutConfig.perCommandTimeouts.entries()) {
      if (timeout > ms) {
        this.timeoutConfig.perCommandTimeouts.set(pattern, ms);
      }
    }
  }

  getTimeoutConfig(): Readonly<ShellTimeoutConfig> {
    return { ...this.timeoutConfig };
  }

  clearCommandTimeouts(): void {
    this.timeoutConfig.perCommandTimeouts.clear();
  }

  private matchCommandPattern(command: string, pattern: string): boolean {
    if (pattern === '*') return true;
    const regexPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}`, 'i').test(command);
  }

  private setupTimeoutWarning(pid: number, command: string, timeout: number): NodeJS.Timeout {
    const warningThreshold = 0.8;
    const warningTime = timeout * warningThreshold;

    const warningTimer = setTimeout(() => {
      const info = this.processes.get(pid);
      if (info && info.status === 'running') {
        const remainingMs = timeout - warningTime;
        console.warn(
          chalk.yellow(
            `[NativeShell] WARNING: Process ${pid} (${command.substring(0, 50)}${command.length > 50 ? '...' : ''}) ` +
              `approaching timeout - ${Math.round(remainingMs / 1000)}s remaining`,
          ),
        );
        this.emit('timeout-warning', {
          pid,
          command,
          elapsed: warningTime,
          remaining: remainingMs,
          timeout,
        });
      }
      this.activeTimeoutWarnings.delete(pid);
    }, warningTime);

    this.activeTimeoutWarnings.set(pid, warningTimer);
    return warningTimer;
  }

  private clearTimeoutWarning(pid: number): void {
    const timer = this.activeTimeoutWarnings.get(pid);
    if (timer) {
      clearTimeout(timer);
      this.activeTimeoutWarnings.delete(pid);
    }
  }

  // ============================================================
  // Command Execution
  // ============================================================

  async exec(command: string, options?: ExecOptions): Promise<ProcessResult> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const timeout = options?.timeout || this.getTimeoutForCommand(command);
      const shell = options?.shell || this.config.defaultShell;

      let cwd: string;
      try {
        cwd = this.resolveCwd(options?.cwd);
      } catch (error) {
        return reject(error);
      }

      const env = { ...this.config.env, ...options?.env };
      const _separateStreams = options?.separateStreams ?? true;
      const stderrToStdout = options?.stderrToStdout ?? false;
      const colorizeStderr = options?.colorizeStderr ?? true;

      const isWindows = os.platform() === 'win32';
      let proc: ChildProcess;

      if (isWindows) {
        if (shell.includes('powershell')) {
          proc = spawn('powershell.exe', ['-NoProfile', '-Command', command], {
            cwd,
            env,
            shell: false,
          });
        } else {
          proc = spawn('cmd.exe', ['/c', command], { cwd, env, shell: false });
        }
      } else {
        proc = spawn(shell, ['-c', command], { cwd, env, shell: false });
      }

      const pid = proc.pid || ++this.processCounter;
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      const allChunks: OutputChunk[] = [];
      let processSignal: string | null = null;

      const info: ProcessInfo = {
        pid,
        command,
        args: [],
        status: 'running',
        startTime: new Date(),
        output: [],
        errors: [],
        childPids: [],
        processRef: proc,
        lastHealthCheck: new Date(),
      };
      this.processes.set(pid, info);

      this.setupTimeoutWarning(pid, command, timeout);

      const timeoutId = setTimeout(async () => {
        this.clearTimeoutWarning(pid);
        this.emit('timeout', { pid, command, timeout });
        await this.killProcessTree(pid, 'SIGKILL');
        info.status = 'killed';
        info.killSignal = 'SIGKILL';
        info.endTime = new Date();
        reject(new Error(`Process timeout after ${timeout}ms`));
      }, timeout);

      proc.stdout?.on('data', (data) => {
        const text = data.toString();
        const timestamp = Date.now();
        stdoutChunks.push(text);
        allChunks.push({ type: 'stdout', data: text, timestamp });
        info.output.push(text);
        info.lastHealthCheck = new Date();
        options?.onStdout?.(text, timestamp);
        this.emit('stdout', { pid, data: text, timestamp });
      });

      proc.stderr?.on('data', (data) => {
        const text = data.toString();
        const timestamp = Date.now();
        if (stderrToStdout) {
          stdoutChunks.push(text);
          allChunks.push({ type: 'stdout', data: text, timestamp });
          info.output.push(text);
        } else {
          stderrChunks.push(text);
          allChunks.push({ type: 'stderr', data: text, timestamp });
          info.errors.push(text);
        }
        info.lastHealthCheck = new Date();
        options?.onStderr?.(text, timestamp);
        const emitData = colorizeStderr ? chalk.red(text) : text;
        this.emit('stderr', { pid, data: text, colorized: emitData, timestamp });
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        this.clearTimeoutWarning(pid);
        info.status = 'error';
        info.endTime = new Date();
        info.processRef = undefined;
        reject(error);
      });

      proc.on('close', (code, signal) => {
        clearTimeout(timeoutId);
        this.clearTimeoutWarning(pid);
        processSignal = signal;
        info.status = code === 0 ? 'completed' : 'error';
        info.exitCode = code || 0;
        info.endTime = new Date();
        info.processRef = undefined;

        const stdout = stdoutChunks.join('');
        const stderr = stderrChunks.join('');
        const combined = allChunks
          .sort((a, b) => a.timestamp - b.timestamp)
          .map((chunk) => chunk.data)
          .join('');
        const stderrAnalysisResult = analyzeStderr(stderr);

        resolve(
          createProcessResult(
            pid,
            code || 0,
            processSignal,
            stdout,
            stderr,
            combined,
            allChunks,
            Date.now() - startTime,
            stderrAnalysisResult,
          ),
        );
      });
    });
  }

  // ============================================================
  // Streaming Execution
  // ============================================================

  async *execStreaming(
    command: string,
    options?: StreamingExecOptions,
  ): AsyncIterable<OutputChunk> {
    const timeout = options?.timeout || this.config.defaultTimeout;
    const shell = options?.shell || this.config.defaultShell;
    const cwd = options?.cwd || this.config.cwd;
    const env = { ...this.config.env, ...options?.env };
    const bufferOutput = options?.bufferOutput ?? true;
    const maxOutputSize = options?.maxOutputSize ?? DEFAULT_MAX_OUTPUT_SIZE;
    const onOutput = options?.onOutput;
    const isWindows = os.platform() === 'win32';
    const proc: ChildProcess = isWindows
      ? shell.includes('powershell')
        ? spawn('powershell.exe', ['-NoProfile', '-Command', command], { cwd, env, shell: false })
        : spawn('cmd.exe', ['/c', command], { cwd, env, shell: false })
      : spawn(shell, ['-c', command], { cwd, env, shell: false });
    const pid = proc.pid || ++this.processCounter;
    let totalSize = 0;
    const info: ProcessInfo = {
      pid,
      command,
      args: [],
      status: 'running',
      startTime: new Date(),
      output: [],
      errors: [],
      childPids: [],
      processRef: proc,
      lastHealthCheck: new Date(),
    };
    this.processes.set(pid, info);
    const chunkQueue: OutputChunk[] = [];
    let resolveNext: ((value: IteratorResult<OutputChunk>) => void) | null = null;
    let done = false,
      error: Error | null = null;
    const pushChunk = (chunk: OutputChunk) => {
      if (bufferOutput && totalSize < maxOutputSize) {
        totalSize += chunk.data.length;
        if (totalSize > maxOutputSize)
          chunk.data = chunk.data.slice(0, maxOutputSize - (totalSize - chunk.data.length));
        chunk.type === 'stdout' ? info.output.push(chunk.data) : info.errors.push(chunk.data);
      }
      info.lastHealthCheck = new Date();
      onOutput?.(chunk);
      this.emit(chunk.type, { pid, data: chunk.data });
      if (resolveNext) {
        resolveNext({ value: chunk, done: false });
        resolveNext = null;
      } else {
        chunkQueue.push(chunk);
      }
    };
    const timeoutId = setTimeout(async () => {
      error = new Error(`Process timeout after ${timeout}ms`);
      this.emit('timeout', { pid, command, timeout });
      await this.killProcessTree(pid, 'SIGKILL');
      info.status = 'killed';
      info.killSignal = 'SIGKILL';
      info.endTime = new Date();
      done = true;
      resolveNext?.({ value: undefined as unknown as OutputChunk, done: true });
    }, timeout);
    proc.stdout?.on('data', (data) =>
      pushChunk({ type: 'stdout', data: data.toString(), timestamp: Date.now() }),
    );
    proc.stderr?.on('data', (data) =>
      pushChunk({ type: 'stderr', data: data.toString(), timestamp: Date.now() }),
    );
    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      error = err;
      info.status = 'error';
      info.endTime = new Date();
      done = true;
      resolveNext?.({ value: undefined as unknown as OutputChunk, done: true });
    });
    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      info.status = code === 0 ? 'completed' : 'error';
      info.exitCode = code || 0;
      info.endTime = new Date();
      done = true;
      resolveNext?.({ value: undefined as unknown as OutputChunk, done: true });
    });
    while (!done || chunkQueue.length > 0) {
      if (chunkQueue.length > 0) {
        const chunk = chunkQueue.shift();
        if (chunk) yield chunk;
      } else if (!done) {
        const result = await new Promise<IteratorResult<OutputChunk>>((r) => {
          resolveNext = r;
        });
        if (!result.done) yield result.value;
      }
    }
    if (error) throw error;
  }

  async execWithProgress(
    command: string,
    onProgress: (progress: ProgressInfo) => void,
    options?: ProgressExecOptions,
  ): Promise<StreamingExecResult> {
    const patterns = options?.progressPatterns || DEFAULT_PROGRESS_PATTERNS;
    const chunks: OutputChunk[] = [];
    const startTime = Date.now();
    let truncated = false;
    const maxOutputSize = options?.maxOutputSize ?? DEFAULT_MAX_OUTPUT_SIZE;
    let totalSize = 0;
    const detectProgress = (text: string): ProgressInfo | null => {
      for (const pattern of patterns) {
        if (pattern.test(text)) {
          const p: ProgressInfo = { raw: text };
          const pct = text.match(/(\d+(?:\.\d+)?)\s*%/);
          if (pct) p.percent = parseFloat(pct[1]);
          const frac = text.match(/(\d+)\s*(?:\/|of)\s*(\d+)/i);
          if (frac) {
            p.current = parseInt(frac[1], 10);
            p.total = parseInt(frac[2], 10);
            if (!p.percent && p.total > 0) p.percent = (p.current / p.total) * 100;
          }
          const msg = text.match(/(?:downloading|installing|processing|building)\s+(.+)/i);
          if (msg) p.message = msg[1].trim();
          return p;
        }
      }
      return null;
    };
    const processChunk = (chunk: OutputChunk) => {
      if (totalSize < maxOutputSize) {
        totalSize += chunk.data.length;
        if (totalSize > maxOutputSize) {
          truncated = true;
          chunk.data = chunk.data.slice(0, maxOutputSize - (totalSize - chunk.data.length));
        }
        chunks.push(chunk);
      } else truncated = true;
      for (const line of chunk.data.split(/\r?\n/)) {
        if (line.trim()) {
          const prog = detectProgress(line);
          if (prog) onProgress(prog);
        }
      }
    };
    let exitCode = 0,
      pid = 0;
    const stdout: string[] = [],
      stderr: string[] = [];
    try {
      for await (const chunk of this.execStreaming(command, {
        ...options,
        onOutput: processChunk,
        bufferOutput: false,
      }))
        chunk.type === 'stdout' ? stdout.push(chunk.data) : stderr.push(chunk.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('timeout')) exitCode = -1;
      else throw err;
    }
    const last = Array.from(this.processes.values())
      .filter((p) => p.command === command)
      .pop();
    if (last) {
      pid = last.pid;
      exitCode = last.exitCode ?? exitCode;
    }
    return {
      pid,
      exitCode,
      stdout: stdout.join(''),
      stderr: stderr.join(''),
      duration: Date.now() - startTime,
      chunks,
      truncated,
    };
  }

  async pipe(commands: string[], options?: PipeOptions): Promise<StreamingExecResult> {
    if (commands.length === 0) throw new Error('At least one command is required');
    const pipedCommand = commands.join(os.platform() === 'win32' ? ' | ' : ' | ');
    const chunks: OutputChunk[] = [];
    const startTime = Date.now();
    let truncated = false;
    const maxOutputSize = options?.maxOutputSize ?? DEFAULT_MAX_OUTPUT_SIZE;
    let totalSize = 0;
    const processChunk = (chunk: OutputChunk) => {
      if (totalSize < maxOutputSize) {
        totalSize += chunk.data.length;
        if (totalSize > maxOutputSize) {
          truncated = true;
          chunk.data = chunk.data.slice(0, maxOutputSize - (totalSize - chunk.data.length));
        }
        chunks.push(chunk);
      } else truncated = true;
      options?.onIntermediateOutput?.(0, chunk);
    };
    const stdout: string[] = [],
      stderr: string[] = [];
    let exitCode = 0,
      pid = 0;
    try {
      for await (const chunk of this.execStreaming(pipedCommand, {
        cwd: options?.cwd,
        env: options?.env,
        timeout: options?.timeout,
        shell: options?.shell,
        onOutput: processChunk,
        bufferOutput: false,
      }))
        chunk.type === 'stdout' ? stdout.push(chunk.data) : stderr.push(chunk.data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('timeout')) exitCode = -1;
      else throw err;
    }
    const last = Array.from(this.processes.values())
      .filter((p) => p.command === pipedCommand)
      .pop();
    if (last) {
      pid = last.pid;
      exitCode = last.exitCode ?? exitCode;
    }
    return {
      pid,
      exitCode,
      stdout: stdout.join(''),
      stderr: stderr.join(''),
      duration: Date.now() - startTime,
      chunks,
      truncated,
    };
  }

  spawn(
    command: string,
    args: string[] = [],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
      shell?: boolean | string;
    },
  ): { pid: number; process: ChildProcess } {
    const cwd = this.resolveCwd(options?.cwd);
    const env = { ...this.config.env, ...options?.env };
    const spawnOptions: SpawnOptions = { cwd, env, shell: options?.shell ?? true };
    const proc = spawn(command, args, spawnOptions);
    const pid = proc.pid || ++this.processCounter;

    const info: ProcessInfo = {
      pid,
      command,
      args,
      status: 'running',
      startTime: new Date(),
      output: [],
      errors: [],
      childPids: [],
      processRef: proc,
      lastHealthCheck: new Date(),
    };
    this.processes.set(pid, info);

    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      info.output.push(text);
      info.lastHealthCheck = new Date();
      this.emit('stdout', { pid, data: text });
    });
    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      info.errors.push(text);
      info.lastHealthCheck = new Date();
      this.emit('stderr', { pid, data: text });
    });
    proc.on('close', (code) => {
      info.status = code === 0 ? 'completed' : 'error';
      info.exitCode = code || 0;
      info.endTime = new Date();
      info.processRef = undefined;
      this.emit('close', { pid, code });
    });
    proc.on('error', (error) => {
      info.status = 'error';
      info.endTime = new Date();
      info.processRef = undefined;
      this.emit('error', { pid, error });
    });

    return { pid, process: proc };
  }

  async background(
    command: string,
    options?: { cwd?: string; env?: Record<string, string> },
  ): Promise<number> {
    const { pid } = this.spawn(command, [], { ...options, shell: true });
    return pid;
  }

  // ============================================================
  // Process Management
  // ============================================================

  kill(pid: number, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const info = this.processes.get(pid);
    if (!info) return false;
    try {
      process.kill(pid, signal);
      info.status = 'killed';
      info.endTime = new Date();
      return true;
    } catch {
      return false;
    }
  }

  getProcess(pid: number): ProcessInfo | undefined {
    return this.processes.get(pid);
  }
  getOutput(pid: number): string {
    const info = this.processes.get(pid);
    return info ? info.output.join('') : '';
  }
  getErrors(pid: number): string {
    const info = this.processes.get(pid);
    return info ? info.errors.join('') : '';
  }

  listProcesses(filter?: { status?: ProcessInfo['status'] }): ProcessInfo[] {
    let results = Array.from(this.processes.values());
    if (filter?.status) {
      results = results.filter((p) => p.status === filter.status);
    }
    return results;
  }

  cleanup(maxAge: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [pid, info] of this.processes.entries()) {
      if (info.status !== 'running' && info.endTime) {
        if (now - info.endTime.getTime() > maxAge) {
          this.processes.delete(pid);
          cleaned++;
        }
      }
    }
    return cleaned;
  }

  // ============================================================
  // Extended Process Management - Zombie & Orphan Handling
  // ============================================================

  getRunningProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values()).filter((p) => p.status === 'running');
  }

  isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error: unknown) {
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  }

  killProcess(pid: number, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const info = this.processes.get(pid);
    try {
      process.kill(pid, signal);
      if (info) {
        info.status = 'killed';
        info.killSignal = signal;
        info.endTime = new Date();
        info.processRef = undefined;
      }
      this.emit('processKilled', { pid, signal });
      return true;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
        if (info) {
          info.status = 'completed';
          info.endTime = new Date();
          info.processRef = undefined;
        }
        return true;
      }
      const msg = error instanceof Error ? error.message : String(error);
      this.emit('killError', { pid, signal, error: msg });
      return false;
    }
  }

  async gracefulKill(
    pid: number,
    gracePeriod: number = this.GRACEFUL_SHUTDOWN_TIMEOUT,
  ): Promise<boolean> {
    const info = this.processes.get(pid);
    if (!this.isProcessRunning(pid)) {
      if (info) {
        info.status = 'completed';
        info.endTime = new Date();
      }
      return true;
    }
    this.emit('gracefulShutdown', { pid, phase: 'SIGTERM' });
    this.killProcess(pid, 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, gracePeriod));
    if (this.isProcessRunning(pid)) {
      this.emit('gracefulShutdown', { pid, phase: 'SIGKILL', reason: 'timeout' });
      console.log(
        chalk.yellow(`[NativeShell] Process ${pid} did not respond to SIGTERM, forcing SIGKILL`),
      );
      return this.killProcess(pid, 'SIGKILL');
    }
    return true;
  }

  async killProcessTree(pid: number, signal: NodeJS.Signals = 'SIGTERM'): Promise<boolean> {
    const info = this.processes.get(pid);
    const isWindows = os.platform() === 'win32';
    try {
      if (isWindows) {
        const { exec } = await import('node:child_process');
        return new Promise((resolve) => {
          exec(`taskkill /PID ${pid} /T /F`, (error) => {
            if (info) {
              info.status = 'killed';
              info.killSignal = signal;
              info.endTime = new Date();
              info.processRef = undefined;
            }
            this.emit('processTreeKilled', { pid, signal });
            resolve(!error);
          });
        });
      } else {
        try {
          process.kill(-pid, signal);
        } catch {
          process.kill(pid, signal);
        }
        if (info) {
          info.status = 'killed';
          info.killSignal = signal;
          info.endTime = new Date();
          info.processRef = undefined;
          for (const childPid of info.childPids) {
            this.killProcess(childPid, signal);
          }
        }
        this.emit('processTreeKilled', { pid, signal });
        return true;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.emit('killError', { pid, signal, error: msg });
      return false;
    }
  }

  async killAllChildren(): Promise<CleanupStats> {
    const stats: CleanupStats = {
      zombiesKilled: 0,
      orphansKilled: 0,
      processesTerminated: 0,
      errors: [],
    };
    const runningProcesses = this.getRunningProcesses();
    this.emit('killAllChildren', { count: runningProcesses.length });
    for (const info of runningProcesses) {
      try {
        const success = await this.gracefulKill(info.pid);
        if (success) {
          stats.processesTerminated++;
          if (info.isOrphaned) {
            stats.orphansKilled++;
          }
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        stats.errors.push(`Failed to kill PID ${info.pid}: ${msg}`);
      }
    }
    console.log(chalk.cyan(`[NativeShell] Killed ${stats.processesTerminated} child processes`));
    return stats;
  }

  private detectZombieProcesses(): ZombieProcessInfo[] {
    const zombies: ZombieProcessInfo[] = [];
    const now = Date.now();
    for (const [pid, info] of this.processes.entries()) {
      if (info.status !== 'running') continue;
      const isActuallyRunning = this.isProcessRunning(pid);
      if (!isActuallyRunning) {
        zombies.push({ pid, command: info.command, detectedAt: new Date(), reason: 'no_response' });
        info.status = 'zombie';
        this.logOrphanedProcess(pid, info, 'zombie_detected');
        continue;
      }
      if (info.lastHealthCheck) {
        const timeSinceLastActivity = now - info.lastHealthCheck.getTime();
        if (timeSinceLastActivity > this.ZOMBIE_TIMEOUT) {
          zombies.push({ pid, command: info.command, detectedAt: new Date(), reason: 'stuck' });
          info.status = 'zombie';
          this.logOrphanedProcess(pid, info, 'stuck_process');
        }
      }
    }
    return zombies;
  }

  private startZombieCleanup(): void {
    if (this.zombieCleanupInterval) {
      clearInterval(this.zombieCleanupInterval);
    }
    this.zombieCleanupInterval = setInterval(() => {
      this.performZombieCleanup();
    }, this.ZOMBIE_CHECK_INTERVAL);
    this.zombieCleanupInterval.unref();
  }

  private stopZombieCleanup(): void {
    if (this.zombieCleanupInterval) {
      clearInterval(this.zombieCleanupInterval);
      this.zombieCleanupInterval = null;
    }
  }

  async performZombieCleanup(): Promise<CleanupStats> {
    const stats: CleanupStats = {
      zombiesKilled: 0,
      orphansKilled: 0,
      processesTerminated: 0,
      errors: [],
    };
    const zombies = this.detectZombieProcesses();
    if (zombies.length > 0) {
      console.log(chalk.yellow(`[NativeShell] Detected ${zombies.length} zombie processes`));
      this.emit('zombiesDetected', { zombies });
    }
    for (const zombie of zombies) {
      this.zombieProcesses.set(zombie.pid, zombie);
      try {
        const killed = await this.gracefulKill(zombie.pid);
        if (killed) {
          stats.zombiesKilled++;
          stats.processesTerminated++;
          this.zombieProcesses.delete(zombie.pid);
          console.log(chalk.green(`[NativeShell] Cleaned up zombie process ${zombie.pid}`));
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        stats.errors.push(`Failed to kill zombie ${zombie.pid}: ${msg}`);
      }
    }
    const orphaned = this.detectOrphanedProcesses();
    for (const info of orphaned) {
      try {
        const killed = await this.gracefulKill(info.pid);
        if (killed) {
          stats.orphansKilled++;
          stats.processesTerminated++;
          console.log(chalk.green(`[NativeShell] Cleaned up orphaned process ${info.pid}`));
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        stats.errors.push(`Failed to kill orphan ${info.pid}: ${msg}`);
      }
    }
    if (stats.processesTerminated > 0) {
      this.emit('cleanupCompleted', stats);
    }
    return stats;
  }

  private detectOrphanedProcesses(): ProcessInfo[] {
    const orphaned: ProcessInfo[] = [];
    for (const [_pid, info] of this.processes.entries()) {
      if (info.status !== 'running') continue;
      if (!info.parentPid) continue;
      if (!this.isProcessRunning(info.parentPid)) {
        info.isOrphaned = true;
        orphaned.push(info);
        this.logOrphanedProcess(info.pid, info, 'parent_died');
      }
    }
    return orphaned;
  }

  private logOrphanedProcess(pid: number, info: ProcessInfo, reason: string): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      pid,
      command: info.command,
      reason,
      startTime: info.startTime.toISOString(),
      lastHealthCheck: info.lastHealthCheck?.toISOString(),
      parentPid: info.parentPid,
      childPids: info.childPids,
    };
    console.log(chalk.red(`[NativeShell] Orphaned process detected: ${JSON.stringify(logEntry)}`));
    this.emit('orphanedProcess', logEntry);
  }

  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      console.log(chalk.yellow(`[NativeShell] Received ${signal}, starting graceful shutdown...`));
      this.emit('shutdown', { signal });
      try {
        this.stopZombieCleanup();
        const stats = await this.killAllChildren();
        console.log(
          chalk.cyan(
            `[NativeShell] Shutdown complete: ${stats.processesTerminated} processes terminated`,
          ),
        );
        for (const sessionId of this.sessions.keys()) {
          this.closeSession(sessionId);
        }
      } catch (error) {
        console.error(chalk.red(`[NativeShell] Error during shutdown: ${error}`));
      }
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGHUP', () => shutdown('SIGHUP'));
    process.on('uncaughtException', (error) => {
      console.error(chalk.red(`[NativeShell] Uncaught exception: ${error}`));
      shutdown('uncaughtException');
    });
    process.on('beforeExit', () => {
      if (!this.isShuttingDown) {
        shutdown('beforeExit');
      }
    });
  }

  getZombieStats(): { active: number; history: ZombieProcessInfo[] } {
    return {
      active: this.zombieProcesses.size,
      history: Array.from(this.zombieProcesses.values()),
    };
  }

  async triggerZombieCleanup(): Promise<CleanupStats> {
    return this.performZombieCleanup();
  }

  setProcessParent(childPid: number, parentPid: number): void {
    const childInfo = this.processes.get(childPid);
    const parentInfo = this.processes.get(parentPid);
    if (childInfo) {
      childInfo.parentPid = parentPid;
    }
    if (parentInfo) {
      if (!parentInfo.childPids.includes(childPid)) {
        parentInfo.childPids.push(childPid);
      }
    }
  }

  // ============================================================
  // Interactive Sessions
  // ============================================================

  createSession(options?: {
    shell?: string;
    cwd?: string;
    env?: Record<string, string>;
  }): ShellSession {
    const id = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const shell = options?.shell || this.config.defaultShell;
    const cwd = this.resolveCwd(options?.cwd);
    const env = { ...this.config.env, ...options?.env };
    const session: ShellSession = { id, shell, cwd, env, history: [], created: new Date() };
    const isWindows = os.platform() === 'win32';
    const proc = spawn(shell, isWindows ? [] : ['-i'], {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    session.process = proc;
    this.sessions.set(id, session);
    return session;
  }

  async sendToSession(sessionId: string, input: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.process) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return new Promise((resolve, reject) => {
      const output: string[] = [];
      const timeout = setTimeout(() => {
        resolve(output.join(''));
      }, 2000);
      const onData = (data: Buffer) => {
        output.push(data.toString());
      };
      session.process?.stdout?.on('data', onData);
      session.process?.stdin?.write(`${input}\n`, (err) => {
        if (err) {
          clearTimeout(timeout);
          session.process?.stdout?.off('data', onData);
          reject(err);
        }
      });
      session.history.push(input);
    });
  }

  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.process?.kill();
    this.sessions.delete(sessionId);
    return true;
  }

  getSession(sessionId: string): ShellSession | undefined {
    return this.sessions.get(sessionId);
  }
  listSessions(): ShellSession[] {
    return Array.from(this.sessions.values());
  }

  // ============================================================
  // Convenience Methods
  // ============================================================

  async run(command: string, cwd?: string): Promise<string> {
    const result = await this.exec(command, { cwd });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || `Command failed with exit code ${result.exitCode}`);
    }
    return result.stdout;
  }

  /** @deprecated Use SecureScriptExecutor.python() for enhanced security features */
  async python(script: string, args: string[] = []): Promise<string> {
    const pythonExe = os.platform() === 'win32' ? 'python' : 'python3';
    const spawnArgs = ['-c', script, ...args];
    return new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, spawnArgs, {
        cwd: this.config.cwd,
        env: this.config.env,
        shell: false,
      });
      let stdout = '',
        stderr = '';
      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      proc.on('close', (code: number | null) => {
        code === 0
          ? resolve(stdout)
          : reject(new Error(stderr || `Python exited with code ${code}`));
      });
      proc.on('error', (err: Error) => reject(err));
    });
  }

  /** @deprecated Use SecureScriptExecutor.node() for enhanced security features */
  async node(script: string, args: string[] = []): Promise<string> {
    const spawnArgs = ['-e', script, ...args];
    return new Promise((resolve, reject) => {
      const proc = spawn('node', spawnArgs, {
        cwd: this.config.cwd,
        env: this.config.env,
        shell: false,
      });
      let stdout = '',
        stderr = '';
      proc.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      proc.on('close', (code: number | null) => {
        code === 0 ? resolve(stdout) : reject(new Error(stderr || `Node exited with code ${code}`));
      });
      proc.on('error', (err: Error) => reject(err));
    });
  }

  async which(command: string): Promise<string | null> {
    try {
      const cmd = os.platform() === 'win32' ? `where ${command}` : `which ${command}`;
      const result = await this.run(cmd);
      return result.trim().split('\n')[0];
    } catch {
      return null;
    }
  }

  getSystemInfo(): Record<string, unknown> {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      memory: { total: os.totalmem(), free: os.freemem() },
      uptime: os.uptime(),
      shell: this.config.defaultShell,
      preferredShell: this.config.preferredShell,
      availableShells: this.detectAvailableShells(),
    };
  }

  // ============================================================
  // Shell Detection and Management
  // ============================================================

  private shellCache: Map<ShellType, ShellInfo> = new Map();
  private shellCacheTime: number = 0;
  private readonly SHELL_CACHE_TTL = 60000;

  detectAvailableShells(): ShellType[] {
    const available: ShellType[] = [];
    const isWindows = os.platform() === 'win32';
    const shellTypes: ShellType[] = ['cmd', 'powershell', 'pwsh', 'bash', 'sh', 'zsh'];
    for (const shellType of shellTypes) {
      const shellPath = this.getShellCommand(shellType);
      if (shellPath) {
        available.push(shellType);
      }
    }
    const fallbackOrder = isWindows ? SHELL_FALLBACK_ORDER.windows : SHELL_FALLBACK_ORDER.unix;
    available.sort((a, b) => {
      const aIndex = fallbackOrder.indexOf(a);
      const bIndex = fallbackOrder.indexOf(b);
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    });
    return available;
  }

  getAvailableShellsInfo(): ShellInfo[] {
    const now = Date.now();
    if (this.shellCache.size > 0 && now - this.shellCacheTime < this.SHELL_CACHE_TTL) {
      return Array.from(this.shellCache.values());
    }
    this.shellCache.clear();
    const shellTypes: ShellType[] = ['cmd', 'powershell', 'pwsh', 'bash', 'sh', 'zsh'];
    for (const shellType of shellTypes) {
      const shellPath = this.getShellCommand(shellType);
      const info: ShellInfo = {
        type: shellType,
        path: shellPath || '',
        available: !!shellPath,
        version: shellPath ? this.getShellVersion(shellType, shellPath) : undefined,
      };
      this.shellCache.set(shellType, info);
    }
    this.shellCacheTime = now;
    return Array.from(this.shellCache.values());
  }

  private getShellVersion(shellType: ShellType, shellPath: string): string | undefined {
    try {
      let versionCmd: string;
      switch (shellType) {
        case 'cmd':
          return 'Windows CMD';
        case 'powershell':
          versionCmd = `"${shellPath}" -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"`;
          break;
        case 'pwsh':
          versionCmd = `"${shellPath}" -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"`;
          break;
        case 'bash':
          versionCmd = `"${shellPath}" --version`;
          break;
        case 'sh':
          return 'POSIX shell';
        case 'zsh':
          versionCmd = `"${shellPath}" --version`;
          break;
        default:
          return undefined;
      }
      const output = execSync(versionCmd, {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
      }).trim();
      const versionMatch = output.match(/(\d+\.\d+(?:\.\d+)?)/);
      return versionMatch ? versionMatch[1] : output.split('\n')[0];
    } catch {
      return undefined;
    }
  }

  setPreferredShell(shell: ShellType): boolean {
    const shellPath = this.getShellCommand(shell);
    if (!shellPath) {
      if (this.config.autoFallback) {
        const fallbackShell = this.findFallbackShell(shell);
        if (fallbackShell) {
          console.log(
            chalk.yellow(
              `[NativeShell] Shell '${shell}' not available, using fallback: ${fallbackShell}`,
            ),
          );
          this.config.preferredShell = fallbackShell;
          this.config.defaultShell =
            this.getShellCommand(fallbackShell) || this.config.defaultShell;
          this.emit('shellFallback', { requested: shell, fallback: fallbackShell });
          return true;
        }
      }
      console.warn(chalk.red(`[NativeShell] Shell '${shell}' not available and no fallback found`));
      this.emit('shellNotFound', { shell });
      return false;
    }
    this.config.preferredShell = shell;
    this.config.defaultShell = shellPath;
    this.emit('shellChanged', { shell, path: shellPath });
    console.log(chalk.green(`[NativeShell] Preferred shell set to: ${shell} (${shellPath})`));
    return true;
  }

  private findFallbackShell(unavailableShell: ShellType): ShellType | null {
    const isWindows = os.platform() === 'win32';
    const fallbackOrder = isWindows ? SHELL_FALLBACK_ORDER.windows : SHELL_FALLBACK_ORDER.unix;
    for (const shell of fallbackOrder) {
      if (shell !== unavailableShell && this.getShellCommand(shell)) {
        return shell;
      }
    }
    return null;
  }

  getShellCommand(shell: ShellType): string | null {
    const isWindows = os.platform() === 'win32';
    const paths = isWindows ? SHELL_PATHS[shell].windows : SHELL_PATHS[shell].unix;
    const cached = this.shellCache.get(shell);
    if (cached?.available) {
      return cached.path;
    }
    for (const shellPath of paths) {
      if (path.isAbsolute(shellPath) && fs.existsSync(shellPath)) {
        return shellPath;
      }
      try {
        const findCmd = isWindows ? `where ${shellPath}` : `which ${shellPath}`;
        const result = execSync(findCmd, {
          encoding: 'utf-8',
          timeout: 5000,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
        if (result) {
          return result.split('\n')[0];
        }
      } catch {
        /* Shell not found */
      }
    }
    return null;
  }

  getPreferredShell(): ShellType | null {
    return this.config.preferredShell || null;
  }

  getShellTypeFromPath(shellPath: string): ShellType | null {
    const normalizedPath = shellPath.toLowerCase();
    if (normalizedPath.includes('pwsh')) return 'pwsh';
    if (normalizedPath.includes('powershell')) return 'powershell';
    if (normalizedPath.includes('cmd')) return 'cmd';
    if (normalizedPath.includes('zsh')) return 'zsh';
    if (normalizedPath.includes('bash')) return 'bash';
    if (normalizedPath.endsWith('sh') || normalizedPath.includes('/sh')) return 'sh';
    return null;
  }

  translateCommand(command: string, fromShell: ShellType, toShell: ShellType): string {
    if (fromShell === toShell) return command;
    let translatedCommand = command;
    const sourceKey = this.normalizeShellForTranslation(fromShell);
    const targetKey = this.normalizeShellForTranslation(toShell);
    if (sourceKey === targetKey) return command;
    for (const mapping of COMMAND_TRANSLATIONS) {
      const sourceCmd = mapping[sourceKey as keyof CommandMapping];
      const targetCmd = mapping[targetKey as keyof CommandMapping];
      if (sourceCmd && targetCmd) {
        const regex = new RegExp(`\\b${this.escapeRegex(sourceCmd)}\\b`, 'gi');
        translatedCommand = translatedCommand.replace(regex, targetCmd);
      }
    }
    return translatedCommand;
  }

  private normalizeShellForTranslation(shell: ShellType): 'cmd' | 'powershell' | 'bash' {
    switch (shell) {
      case 'cmd':
        return 'cmd';
      case 'powershell':
      case 'pwsh':
        return 'powershell';
      case 'bash':
      case 'sh':
      case 'zsh':
        return 'bash';
      default:
        return 'bash';
    }
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  getCommandForCurrentShell(command: string, sourceShell?: ShellType): string {
    const isWindows = os.platform() === 'win32';
    const from = sourceShell || (isWindows ? 'cmd' : 'bash');
    const to =
      this.config.preferredShell ||
      this.getShellTypeFromPath(this.config.defaultShell) ||
      (isWindows ? 'powershell' : 'bash');
    return this.translateCommand(command, from, to);
  }

  isShellAvailable(shell: ShellType): boolean {
    return this.getShellCommand(shell) !== null;
  }

  async execWithShell(
    command: string,
    shell: ShellType,
    options?: ExecOptions,
  ): Promise<ProcessResult> {
    const shellPath = this.getShellCommand(shell);
    if (!shellPath) {
      throw new Error(`Shell '${shell}' is not available on this system`);
    }
    return this.exec(command, { ...options, shell: shellPath });
  }

  // ============================================================
  // Status
  // ============================================================

  printStatus(): void {
    const running = this.listProcesses({ status: 'running' });
    const completed = this.listProcesses({ status: 'completed' });
    const zombies = this.listProcesses({ status: 'zombie' });
    const killed = this.listProcesses({ status: 'killed' });
    const zombieStats = this.getZombieStats();
    const availableShells = this.detectAvailableShells();
    const preferredShell = this.getPreferredShell();

    console.log(chalk.cyan('\n=== Native Shell ===\n'));
    console.log(chalk.gray(`  Default Shell: ${this.config.defaultShell}`));
    console.log(chalk.gray(`  Preferred Shell: ${preferredShell || 'auto'}`));
    console.log(chalk.gray(`  Available Shells: ${availableShells.join(', ')}`));
    console.log(chalk.gray(`  Auto Fallback: ${this.config.autoFallback}`));
    console.log(chalk.gray(`  Working Dir: ${this.getCwd()}`));
    console.log(chalk.gray(`  Inherit CWD: ${this._inheritCwd}`));
    console.log(chalk.gray(`  Timeout: ${this.config.defaultTimeout}ms`));
    console.log(chalk.gray(`  Running Processes: ${running.length}`));
    console.log(chalk.gray(`  Completed Processes: ${completed.length}`));
    console.log(chalk.gray(`  Killed Processes: ${killed.length}`));
    console.log(chalk.yellow(`  Zombie Processes: ${zombies.length}`));
    console.log(chalk.yellow(`  Zombies Detected (history): ${zombieStats.history.length}`));
    console.log(chalk.gray(`  Active Sessions: ${this.sessions.size}`));
    console.log(chalk.gray(`  Zombie Cleanup Active: ${this.zombieCleanupInterval !== null}`));
    console.log(chalk.gray(`  Shutting Down: ${this.isShuttingDown}`));

    console.log(chalk.cyan('\n  Shell Details:'));
    const shellsInfo = this.getAvailableShellsInfo();
    for (const shell of shellsInfo) {
      if (shell.available) {
        const marker = shell.type === preferredShell ? chalk.green(' *') : '';
        console.log(
          chalk.gray(`    ${shell.type}${marker}: ${shell.path} (${shell.version || 'unknown'})`),
        );
      }
    }

    if (running.length > 0) {
      console.log(chalk.cyan('\n  Running Processes:'));
      for (const proc of running) {
        const runtime = Date.now() - proc.startTime.getTime();
        console.log(
          chalk.gray(
            `    PID ${proc.pid}: ${proc.command.slice(0, 50)}... (${Math.round(runtime / 1000)}s)`,
          ),
        );
      }
    }

    if (zombies.length > 0) {
      console.log(chalk.yellow('\n  Zombie Processes:'));
      for (const proc of zombies) {
        console.log(chalk.yellow(`    PID ${proc.pid}: ${proc.command.slice(0, 50)}...`));
      }
    }
  }

  async destroy(): Promise<CleanupStats> {
    console.log(chalk.yellow('[NativeShell] Starting destroy sequence...'));
    this.stopZombieCleanup();
    const stats = await this.killAllChildren();
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }
    this.processes.clear();
    this.sessions.clear();
    this.zombieProcesses.clear();
    console.log(
      chalk.green(
        `[NativeShell] Destroy complete. Terminated ${stats.processesTerminated} processes.`,
      ),
    );
    this.emit('destroyed', stats);
    return stats;
  }

  destroySync(): void {
    console.log(chalk.yellow('[NativeShell] Starting synchronous destroy...'));
    this.stopZombieCleanup();
    for (const [pid, info] of this.processes.entries()) {
      if (info.status === 'running') {
        this.killProcess(pid, 'SIGKILL');
      }
    }
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }
    this.processes.clear();
    this.sessions.clear();
    this.zombieProcesses.clear();
    console.log(chalk.green('[NativeShell] Synchronous destroy complete.'));
  }

  // ============================================================
  // Environment Variable Management
  // ============================================================

  setEnvVar(name: string, value: string): void {
    this.managedEnv[name] = value;
    this.rebuildEnvironment();
    this.emit('envChanged', { name, value, action: 'set' });
  }

  getEnvVar(name: string): string | undefined {
    return this.config.env[name];
  }

  clearEnvVar(name: string): boolean {
    if (name in this.managedEnv) {
      delete this.managedEnv[name];
      this.rebuildEnvironment();
      this.emit('envChanged', { name, action: 'clear' });
      return true;
    }
    return false;
  }

  getEnvironment(): Record<string, string> {
    return { ...this.config.env };
  }

  getFilteredEnvironment(): Record<string, string> {
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.config.env)) {
      filtered[key] = this.isSensitiveEnvVar(key) ? '***FILTERED***' : value;
    }
    return filtered;
  }

  isSensitiveEnvVar(name: string): boolean {
    return SENSITIVE_ENV_PATTERNS.some((pattern) => pattern.test(name));
  }

  setEnvironmentProfile(profile: EnvironmentProfile): void {
    const profileConfig = ENVIRONMENT_PROFILES[profile];
    if (!profileConfig) {
      throw new Error(`Unknown environment profile: ${profile}`);
    }
    this.config.environmentConfig = {
      ...this.config.environmentConfig,
      ...profileConfig,
      activeProfile: profile,
    };
    this.rebuildEnvironment();
    this.emit('profileChanged', { profile });
  }

  getEnvironmentProfile(): EnvironmentProfile | undefined {
    return this.config.environmentConfig.activeProfile;
  }

  updateEnvironmentConfig(configUpdate: Partial<EnvironmentConfig>): void {
    this.config.environmentConfig = { ...this.config.environmentConfig, ...configUpdate };
    this.rebuildEnvironment();
    this.emit('envConfigChanged', configUpdate);
  }

  addBlockedEnvVars(vars: string[]): void {
    const blocked = new Set([...this.config.environmentConfig.blockedEnvVars, ...vars]);
    this.config.environmentConfig.blockedEnvVars = Array.from(blocked);
    this.rebuildEnvironment();
  }

  removeBlockedEnvVars(vars: string[]): void {
    const toRemove = new Set(vars);
    this.config.environmentConfig.blockedEnvVars =
      this.config.environmentConfig.blockedEnvVars.filter((v) => !toRemove.has(v));
    this.rebuildEnvironment();
  }

  getBlockedEnvVars(): string[] {
    return [...this.config.environmentConfig.blockedEnvVars];
  }

  private rebuildEnvironment(): void {
    const envConfig = this.config.environmentConfig;
    let env: Record<string, string> = {};
    if (envConfig.inheritEnv) {
      env = { ...process.env } as Record<string, string>;
    }
    if (envConfig.activeProfile) {
      const profileConfig = ENVIRONMENT_PROFILES[envConfig.activeProfile];
      if (profileConfig.additionalEnv) {
        env = { ...env, ...profileConfig.additionalEnv };
      }
    }
    env = { ...env, ...envConfig.additionalEnv };
    env = { ...env, ...this.managedEnv };
    for (const blocked of envConfig.blockedEnvVars) {
      delete env[blocked];
    }
    this.config.env = env;
  }

  exportEnvironment(
    filePath: string,
    options?: { includeInherited?: boolean; filterSensitive?: boolean },
  ): void {
    const includeInherited = options?.includeInherited ?? false;
    const filterSensitive = options?.filterSensitive ?? true;
    let envToExport: Record<string, string>;
    if (includeInherited) {
      envToExport = filterSensitive ? this.getFilteredEnvironment() : this.getEnvironment();
    } else {
      envToExport = { ...this.config.environmentConfig.additionalEnv, ...this.managedEnv };
      if (filterSensitive) {
        for (const key of Object.keys(envToExport)) {
          if (this.isSensitiveEnvVar(key)) {
            envToExport[key] = '***FILTERED***';
          }
        }
      }
    }
    const lines = Object.entries(envToExport)
      .map(([key, value]) => `${key}=${this.escapeEnvValue(value)}`)
      .join('\n');
    fs.writeFileSync(filePath, lines, 'utf-8');
  }

  importEnvironment(filePath: string): number {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Environment file not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    let imported = 0;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (match) {
        const [, name, value] = match;
        const cleanValue = value.replace(/^["']|["']$/g, '');
        this.setEnvVar(name, cleanValue);
        imported++;
      }
    }
    return imported;
  }

  private escapeEnvValue(value: string): string {
    if (value.includes(' ') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    }
    return value;
  }

  printEnvironmentStatus(): void {
    console.log(chalk.cyan('\n=== Environment Manager ===\n'));
    const profile = this.config.environmentConfig.activeProfile;
    console.log(chalk.yellow(`  Active Profile: ${profile || 'none'}`));
    console.log(
      chalk.yellow(`  Inherit from process.env: ${this.config.environmentConfig.inheritEnv}`),
    );
    console.log(chalk.cyan('\n  Blocked Variables:'));
    for (const blocked of this.config.environmentConfig.blockedEnvVars) {
      console.log(chalk.red(`    - ${blocked}`));
    }
    console.log(chalk.cyan('\n  Managed Variables:'));
    for (const [key, value] of Object.entries(this.managedEnv)) {
      const displayValue = this.isSensitiveEnvVar(key) ? '***FILTERED***' : value;
      console.log(chalk.green(`    ${key}=${displayValue}`));
    }
    console.log(chalk.cyan('\n  Additional Variables:'));
    for (const [key, value] of Object.entries(this.config.environmentConfig.additionalEnv)) {
      const displayValue = this.isSensitiveEnvVar(key) ? '***FILTERED***' : value;
      console.log(chalk.blue(`    ${key}=${displayValue}`));
    }
    console.log(
      chalk.cyan(`\n  Total Environment Variables: ${Object.keys(this.config.env).length}`),
    );
  }

  getEnvironmentConfig(): EnvironmentConfig {
    return { ...this.config.environmentConfig };
  }
  getManagedEnvVars(): Record<string, string> {
    return { ...this.managedEnv };
  }

  resetEnvironment(): void {
    this.config.environmentConfig = createDefaultEnvironmentConfig();
    this.managedEnv = {};
    this.rebuildEnvironment();
    this.emit('envReset');
  }
}

// ============================================================
// Factory Function
// ============================================================

export function createShell(options?: NativeShellConfig): NativeShell {
  return new NativeShell(options);
}

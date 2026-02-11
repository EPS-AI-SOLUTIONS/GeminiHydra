/**
 * SecureScriptExecutor - Secure Python/Node script execution without shell=true
 *
 * This module provides secure script execution methods that:
 * - Use spawn() with array arguments (no shell interpolation vulnerabilities)
 * - Validate script files before execution (existence, extension)
 * - Support Python sandbox mode (restricted imports)
 * - Log all script executions
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';

// ============================================================
// Types
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

/**
 * Script execution result
 */
export interface ScriptResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  pid: number;
}

/**
 * Allowed file extensions for script validation
 */
export const ALLOWED_SCRIPT_EXTENSIONS: Record<string, string[]> = {
  python: ['.py', '.pyw'],
  node: ['.js', '.mjs', '.cjs'],
  bash: ['.sh', '.bash'],
  powershell: ['.ps1', '.psm1', '.psd1'],
};

/**
 * Python sandbox - restricted imports
 * These modules are blocked in sandbox mode
 */
export const PYTHON_SANDBOX_BLOCKED_IMPORTS = [
  'os',
  'subprocess',
  'sys',
  'shutil',
  'socket',
  'ctypes',
  'multiprocessing',
  'threading',
  '_thread',
  'asyncio.subprocess',
  'importlib',
  '__import__',
  'builtins',
  'code',
  'codeop',
  'pty',
  'pdb',
  'pickle',
  'shelve',
  'tempfile',
  'pathlib',
  'glob',
  'fnmatch',
  'linecache',
  'zipimport',
  'pkgutil',
  'modulefinder',
  'runpy',
];

/**
 * Script validation error
 */
export class ScriptValidationError extends Error {
  constructor(
    public readonly scriptPath: string,
    public readonly reason:
      | 'not_exists'
      | 'invalid_extension'
      | 'no_read_access'
      | 'sandbox_violation',
  ) {
    const messages = {
      not_exists: `Script file does not exist: ${scriptPath}`,
      invalid_extension: `Invalid script extension: ${scriptPath}`,
      no_read_access: `Cannot read script file: ${scriptPath}`,
      sandbox_violation: `Script contains blocked imports (sandbox mode): ${scriptPath}`,
    };
    super(messages[reason]);
    this.name = 'ScriptValidationError';
  }
}

// ============================================================
// SecureScriptExecutor Class
// ============================================================

export class SecureScriptExecutor extends EventEmitter {
  private executionLogs: ScriptExecutionLog[] = [];
  private readonly MAX_EXECUTION_LOGS = 1000;
  private defaultTimeout: number;
  private defaultCwd: string;
  private defaultEnv: Record<string, string>;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: assigned in constructor for future use
  private defaultSandbox: boolean;
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: assigned in constructor for future use
  private defaultLogExecution: boolean;

  constructor(
    options: {
      timeout?: number;
      cwd?: string;
      env?: Record<string, string>;
      sandbox?: boolean;
      logExecution?: boolean;
    } = {},
  ) {
    super();
    this.defaultTimeout = options.timeout || 30000;
    this.defaultCwd = options.cwd || process.cwd();
    this.defaultEnv = { ...process.env, ...options.env } as Record<string, string>;
    this.defaultSandbox = options.sandbox ?? false;
    this.defaultLogExecution = options.logExecution ?? true;
  }

  // ============================================================
  // Validation Methods
  // ============================================================

  /**
   * Validate a script file before execution
   */
  validateScript(
    scriptPath: string,
    interpreterType: 'python' | 'node' | 'bash' | 'powershell',
  ): ScriptValidationResult {
    const absolutePath = path.isAbsolute(scriptPath)
      ? scriptPath
      : path.resolve(this.defaultCwd, scriptPath);

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      return {
        valid: false,
        error: `Script file does not exist: ${absolutePath}`,
        scriptPath: absolutePath,
      };
    }

    // Check file extension
    const ext = path.extname(absolutePath).toLowerCase();
    const allowedExtensions = ALLOWED_SCRIPT_EXTENSIONS[interpreterType] || [];

    if (!allowedExtensions.includes(ext)) {
      return {
        valid: false,
        error: `Invalid extension '${ext}' for ${interpreterType}. Allowed: ${allowedExtensions.join(', ')}`,
        scriptPath: absolutePath,
        extension: ext,
      };
    }

    // Check read access
    try {
      fs.accessSync(absolutePath, fs.constants.R_OK);
    } catch {
      return {
        valid: false,
        error: `Cannot read script file: ${absolutePath}`,
        scriptPath: absolutePath,
      };
    }

    return {
      valid: true,
      scriptPath: absolutePath,
      extension: ext,
      interpreter: interpreterType,
    };
  }

  /**
   * Check if Python script contains blocked imports (for sandbox mode)
   */
  checkPythonSandboxViolations(scriptContent: string): string[] {
    const violations: string[] = [];

    for (const blockedImport of PYTHON_SANDBOX_BLOCKED_IMPORTS) {
      const patterns = [
        new RegExp(`^\\s*import\\s+${blockedImport}\\b`, 'm'),
        new RegExp(`^\\s*from\\s+${blockedImport}\\b`, 'm'),
        new RegExp(`__import__\\s*\\(\\s*['"]${blockedImport}['"]`, 'm'),
      ];

      for (const pattern of patterns) {
        if (pattern.test(scriptContent)) {
          violations.push(blockedImport);
          break;
        }
      }
    }

    // Check for dangerous builtins
    if (/\bexec\s*\(/.test(scriptContent)) violations.push('exec');
    if (/\beval\s*\(/.test(scriptContent)) violations.push('eval');
    if (/\bcompile\s*\(/.test(scriptContent)) violations.push('compile');
    if (/\bopen\s*\(/.test(scriptContent)) violations.push('open');

    return [...new Set(violations)];
  }

  /**
   * Generate Python sandbox wrapper code
   */
  private generatePythonSandboxWrapper(script: string): string {
    const blockedModules = PYTHON_SANDBOX_BLOCKED_IMPORTS.map((m) => `'${m}'`).join(', ');

    return `
import sys

class SandboxImportBlocker:
    blocked = {${blockedModules}}

    def find_module(self, name, path=None):
        if name in self.blocked or any(name.startswith(b + '.') for b in self.blocked):
            raise ImportError(f"Import of '{name}' is blocked in sandbox mode")
        return None

sys.meta_path.insert(0, SandboxImportBlocker())

import builtins
_blocked_builtins = ['exec', 'eval', 'compile', 'open', '__import__']
for _b in _blocked_builtins:
    if hasattr(builtins, _b):
        setattr(builtins, _b, lambda *a, **k: (_ for _ in ()).throw(
            PermissionError(f"'{_b}' is blocked in sandbox mode")
        ))

${script}
`;
  }

  // ============================================================
  // Logging Methods
  // ============================================================

  /**
   * Log script execution
   */
  private logExecution(log: ScriptExecutionLog): void {
    this.executionLogs.push(log);

    if (this.executionLogs.length > this.MAX_EXECUTION_LOGS) {
      this.executionLogs = this.executionLogs.slice(-this.MAX_EXECUTION_LOGS);
    }

    this.emit('script-execution', log);

    const status = log.error ? chalk.red('ERROR') : chalk.green('OK');
    const sandboxFlag = log.sandbox ? chalk.yellow('[SANDBOX]') : '';
    console.log(
      chalk.gray(`[${log.timestamp.toISOString()}]`),
      chalk.cyan(`[${log.interpreter}]`),
      sandboxFlag,
      log.scriptPath || '<inline>',
      log.args.length > 0 ? chalk.gray(`args: [${log.args.join(', ')}]`) : '',
      status,
      log.duration ? chalk.gray(`${log.duration}ms`) : '',
    );
  }

  /**
   * Get execution logs
   */
  getExecutionLogs(limit?: number): ScriptExecutionLog[] {
    const logs = [...this.executionLogs].reverse();
    return limit ? logs.slice(0, limit) : logs;
  }

  /**
   * Clear execution logs
   */
  clearExecutionLogs(): void {
    this.executionLogs = [];
  }

  // ============================================================
  // Secure Execution Methods
  // ============================================================

  /**
   * Execute Python inline script securely (no shell=true)
   *
   * @param script - Inline Python code to execute
   * @param args - Arguments to pass to the script (via sys.argv)
   * @param options - Execution options
   */
  async python(script: string, args: string[] = [], options?: ScriptExecOptions): Promise<string> {
    const startTime = Date.now();
    const cwd = options?.cwd || this.defaultCwd;
    const env = { ...this.defaultEnv, ...options?.env };
    const timeout = options?.timeout || this.defaultTimeout;
    const sandbox = options?.sandbox ?? false;

    const logEntry: ScriptExecutionLog = {
      timestamp: new Date(),
      interpreter: 'python',
      inlineScript: true,
      args,
      cwd,
      sandbox,
    };

    // Check for sandbox violations if sandbox mode enabled
    if (sandbox) {
      const violations = this.checkPythonSandboxViolations(script);
      if (violations.length > 0) {
        logEntry.error = `Sandbox violations: ${violations.join(', ')}`;
        this.logExecution(logEntry);
        throw new ScriptValidationError('<inline>', 'sandbox_violation');
      }
    }

    const finalScript = sandbox ? this.generatePythonSandboxWrapper(script) : script;
    const pythonExe = os.platform() === 'win32' ? 'python' : 'python3';

    // SECURE: use spawn with array args, no shell interpolation
    const spawnArgs = ['-c', finalScript, ...args];

    return new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, spawnArgs, {
        cwd,
        env,
        shell: false, // SECURITY: Never use shell=true
      });

      const stdout: string[] = [];
      const stderr: string[] = [];

      const timeoutId = setTimeout(() => {
        proc.kill('SIGKILL');
        logEntry.error = `Timeout after ${timeout}ms`;
        logEntry.duration = Date.now() - startTime;
        this.logExecution(logEntry);
        reject(new Error(`Python script timeout after ${timeout}ms`));
      }, timeout);

      proc.stdout?.on('data', (data) => {
        stdout.push(data.toString());
        this.emit('stdout', { data: data.toString() });
      });

      proc.stderr?.on('data', (data) => {
        stderr.push(data.toString());
        this.emit('stderr', { data: data.toString() });
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        logEntry.error = error.message;
        logEntry.duration = Date.now() - startTime;
        this.logExecution(logEntry);
        reject(error);
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        logEntry.exitCode = code || 0;
        logEntry.duration = Date.now() - startTime;

        if (code !== 0) {
          logEntry.error = stderr.join('') || `Exit code ${code}`;
          this.logExecution(logEntry);
          reject(new Error(stderr.join('') || `Python script failed with exit code ${code}`));
        } else {
          this.logExecution(logEntry);
          resolve(stdout.join(''));
        }
      });
    });
  }

  /**
   * Execute Node.js inline script securely (no shell=true)
   *
   * @param script - Inline JavaScript code to execute
   * @param args - Arguments to pass to the script (via process.argv)
   * @param options - Execution options
   */
  async node(script: string, args: string[] = [], options?: ScriptExecOptions): Promise<string> {
    const startTime = Date.now();
    const cwd = options?.cwd || this.defaultCwd;
    const env = { ...this.defaultEnv, ...options?.env };
    const timeout = options?.timeout || this.defaultTimeout;

    const logEntry: ScriptExecutionLog = {
      timestamp: new Date(),
      interpreter: 'node',
      inlineScript: true,
      args,
      cwd,
      sandbox: false,
    };

    // SECURE: use spawn with array args, no shell interpolation
    const spawnArgs = ['-e', script, '--', ...args];

    return new Promise((resolve, reject) => {
      const proc = spawn('node', spawnArgs, {
        cwd,
        env,
        shell: false, // SECURITY: Never use shell=true
      });

      const stdout: string[] = [];
      const stderr: string[] = [];

      const timeoutId = setTimeout(() => {
        proc.kill('SIGKILL');
        logEntry.error = `Timeout after ${timeout}ms`;
        logEntry.duration = Date.now() - startTime;
        this.logExecution(logEntry);
        reject(new Error(`Node.js script timeout after ${timeout}ms`));
      }, timeout);

      proc.stdout?.on('data', (data) => {
        stdout.push(data.toString());
        this.emit('stdout', { data: data.toString() });
      });

      proc.stderr?.on('data', (data) => {
        stderr.push(data.toString());
        this.emit('stderr', { data: data.toString() });
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        logEntry.error = error.message;
        logEntry.duration = Date.now() - startTime;
        this.logExecution(logEntry);
        reject(error);
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        logEntry.exitCode = code || 0;
        logEntry.duration = Date.now() - startTime;

        if (code !== 0) {
          logEntry.error = stderr.join('') || `Exit code ${code}`;
          this.logExecution(logEntry);
          reject(new Error(stderr.join('') || `Node.js script failed with exit code ${code}`));
        } else {
          this.logExecution(logEntry);
          resolve(stdout.join(''));
        }
      });
    });
  }

  /**
   * Execute a Python script FILE securely
   *
   * @param scriptPath - Path to the Python script file
   * @param args - Arguments to pass to the script
   * @param options - Execution options including sandbox mode
   */
  async execPython(
    scriptPath: string,
    args: string[] = [],
    options?: ScriptExecOptions,
  ): Promise<string> {
    const startTime = Date.now();
    const cwd = options?.cwd || this.defaultCwd;
    const env = { ...this.defaultEnv, ...options?.env };
    const timeout = options?.timeout || this.defaultTimeout;
    const sandbox = options?.sandbox ?? false;

    // Validate script
    const validation = this.validateScript(scriptPath, 'python');
    if (!validation.valid) {
      throw new ScriptValidationError(
        scriptPath,
        validation.error?.includes('extension') ? 'invalid_extension' : 'not_exists',
      );
    }

    const absolutePath = validation.scriptPath ?? scriptPath;

    const logEntry: ScriptExecutionLog = {
      timestamp: new Date(),
      interpreter: 'python',
      scriptPath: absolutePath,
      inlineScript: false,
      args,
      cwd,
      sandbox,
    };

    // Check for sandbox violations if sandbox mode enabled
    if (sandbox) {
      const scriptContent = fs.readFileSync(absolutePath, 'utf-8');
      const violations = this.checkPythonSandboxViolations(scriptContent);
      if (violations.length > 0) {
        logEntry.error = `Sandbox violations: ${violations.join(', ')}`;
        this.logExecution(logEntry);
        throw new ScriptValidationError(absolutePath, 'sandbox_violation');
      }
    }

    const pythonExe = os.platform() === 'win32' ? 'python' : 'python3';

    // SECURE: use spawn with array args, no shell interpolation
    let spawnArgs: string[];
    if (sandbox) {
      const sandboxedExec = this.generatePythonSandboxWrapper(
        `exec(open(r'${absolutePath.replace(/\\/g, '\\\\')}').read())`,
      );
      spawnArgs = ['-c', sandboxedExec, ...args];
    } else {
      spawnArgs = [absolutePath, ...args];
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(pythonExe, spawnArgs, {
        cwd,
        env,
        shell: false, // SECURITY: Never use shell=true
      });

      const stdout: string[] = [];
      const stderr: string[] = [];

      const timeoutId = setTimeout(() => {
        proc.kill('SIGKILL');
        logEntry.error = `Timeout after ${timeout}ms`;
        logEntry.duration = Date.now() - startTime;
        this.logExecution(logEntry);
        reject(new Error(`Python script timeout after ${timeout}ms`));
      }, timeout);

      proc.stdout?.on('data', (data) => {
        stdout.push(data.toString());
        this.emit('stdout', { data: data.toString() });
      });

      proc.stderr?.on('data', (data) => {
        stderr.push(data.toString());
        this.emit('stderr', { data: data.toString() });
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        logEntry.error = error.message;
        logEntry.duration = Date.now() - startTime;
        this.logExecution(logEntry);
        reject(error);
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        logEntry.exitCode = code || 0;
        logEntry.duration = Date.now() - startTime;

        if (code !== 0) {
          logEntry.error = stderr.join('') || `Exit code ${code}`;
          this.logExecution(logEntry);
          reject(new Error(stderr.join('') || `Python script failed with exit code ${code}`));
        } else {
          this.logExecution(logEntry);
          resolve(stdout.join(''));
        }
      });
    });
  }

  /**
   * Execute a Node.js script FILE securely
   *
   * @param scriptPath - Path to the JavaScript file
   * @param args - Arguments to pass to the script
   * @param options - Execution options
   */
  async execNode(
    scriptPath: string,
    args: string[] = [],
    options?: ScriptExecOptions,
  ): Promise<string> {
    const startTime = Date.now();
    const cwd = options?.cwd || this.defaultCwd;
    const env = { ...this.defaultEnv, ...options?.env };
    const timeout = options?.timeout || this.defaultTimeout;

    // Validate script
    const validation = this.validateScript(scriptPath, 'node');
    if (!validation.valid) {
      throw new ScriptValidationError(
        scriptPath,
        validation.error?.includes('extension') ? 'invalid_extension' : 'not_exists',
      );
    }

    const absolutePath = validation.scriptPath ?? scriptPath;

    const logEntry: ScriptExecutionLog = {
      timestamp: new Date(),
      interpreter: 'node',
      scriptPath: absolutePath,
      inlineScript: false,
      args,
      cwd,
      sandbox: false,
    };

    // SECURE: use spawn with array args, no shell interpolation
    const spawnArgs = [absolutePath, ...args];

    return new Promise((resolve, reject) => {
      const proc = spawn('node', spawnArgs, {
        cwd,
        env,
        shell: false, // SECURITY: Never use shell=true
      });

      const stdout: string[] = [];
      const stderr: string[] = [];

      const timeoutId = setTimeout(() => {
        proc.kill('SIGKILL');
        logEntry.error = `Timeout after ${timeout}ms`;
        logEntry.duration = Date.now() - startTime;
        this.logExecution(logEntry);
        reject(new Error(`Node.js script timeout after ${timeout}ms`));
      }, timeout);

      proc.stdout?.on('data', (data) => {
        stdout.push(data.toString());
        this.emit('stdout', { data: data.toString() });
      });

      proc.stderr?.on('data', (data) => {
        stderr.push(data.toString());
        this.emit('stderr', { data: data.toString() });
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        logEntry.error = error.message;
        logEntry.duration = Date.now() - startTime;
        this.logExecution(logEntry);
        reject(error);
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        logEntry.exitCode = code || 0;
        logEntry.duration = Date.now() - startTime;

        if (code !== 0) {
          logEntry.error = stderr.join('') || `Exit code ${code}`;
          this.logExecution(logEntry);
          reject(new Error(stderr.join('') || `Node.js script failed with exit code ${code}`));
        } else {
          this.logExecution(logEntry);
          resolve(stdout.join(''));
        }
      });
    });
  }

  /**
   * Generic script execution method
   *
   * @param interpreter - Interpreter command (python, python3, node, bash, etc.)
   * @param scriptPath - Path to the script file
   * @param args - Arguments to pass to the script
   * @param options - Execution options
   */
  async execScript(
    interpreter: string,
    scriptPath: string,
    args: string[] = [],
    options?: ScriptExecOptions,
  ): Promise<string> {
    const startTime = Date.now();
    const cwd = options?.cwd || this.defaultCwd;
    const env = { ...this.defaultEnv, ...options?.env };
    const timeout = options?.timeout || this.defaultTimeout;

    // Resolve script path
    const absolutePath = path.isAbsolute(scriptPath) ? scriptPath : path.resolve(cwd, scriptPath);

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      throw new ScriptValidationError(scriptPath, 'not_exists');
    }

    // Check read access
    try {
      fs.accessSync(absolutePath, fs.constants.R_OK);
    } catch {
      throw new ScriptValidationError(scriptPath, 'no_read_access');
    }

    const logEntry: ScriptExecutionLog = {
      timestamp: new Date(),
      interpreter,
      scriptPath: absolutePath,
      inlineScript: false,
      args,
      cwd,
      sandbox: false,
    };

    // SECURE: use spawn with array args, no shell interpolation
    const spawnArgs = [absolutePath, ...args];

    return new Promise((resolve, reject) => {
      const proc = spawn(interpreter, spawnArgs, {
        cwd,
        env,
        shell: false, // SECURITY: Never use shell=true
      });

      const stdout: string[] = [];
      const stderr: string[] = [];

      const timeoutId = setTimeout(() => {
        proc.kill('SIGKILL');
        logEntry.error = `Timeout after ${timeout}ms`;
        logEntry.duration = Date.now() - startTime;
        this.logExecution(logEntry);
        reject(new Error(`Script timeout after ${timeout}ms`));
      }, timeout);

      proc.stdout?.on('data', (data) => {
        stdout.push(data.toString());
        this.emit('stdout', { data: data.toString() });
      });

      proc.stderr?.on('data', (data) => {
        stderr.push(data.toString());
        this.emit('stderr', { data: data.toString() });
      });

      proc.on('error', (error) => {
        clearTimeout(timeoutId);
        logEntry.error = error.message;
        logEntry.duration = Date.now() - startTime;
        this.logExecution(logEntry);
        reject(error);
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutId);
        logEntry.exitCode = code || 0;
        logEntry.duration = Date.now() - startTime;

        if (code !== 0) {
          logEntry.error = stderr.join('') || `Exit code ${code}`;
          this.logExecution(logEntry);
          reject(new Error(stderr.join('') || `Script failed with exit code ${code}`));
        } else {
          this.logExecution(logEntry);
          resolve(stdout.join(''));
        }
      });
    });
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Factory function to create SecureScriptExecutor instance
 */
export function createSecureScriptExecutor(options?: {
  timeout?: number;
  cwd?: string;
  env?: Record<string, string>;
  sandbox?: boolean;
  logExecution?: boolean;
}): SecureScriptExecutor {
  return new SecureScriptExecutor(options);
}

// Default export
export default SecureScriptExecutor;

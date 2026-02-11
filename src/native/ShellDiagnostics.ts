/**
 * ShellDiagnostics - Comprehensive shell and process diagnostics for GeminiHydra
 *
 * Provides detailed diagnostic information about:
 * - Available shells and their versions
 * - Process health and statistics
 * - Execution history and performance analysis
 * - System resource usage
 */

import { execSync, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import { getErrorMessage } from '../core/errors.js';
import type { NativeShell, ShellType } from './nativeshell/index.js';

// ============================================================
// Types
// ============================================================

/**
 * Information about a specific shell installation
 */
export interface ShellInstallInfo {
  /** Shell type identifier */
  type: ShellType;

  /** Display name */
  name: string;

  /** Full path to the shell executable */
  path: string | null;

  /** Whether the shell is available */
  available: boolean;

  /** Version string if available */
  version: string | null;

  /** Whether this is the default shell */
  isDefault: boolean;

  /** Additional capabilities or features */
  features: string[];
}

/**
 * Complete system shell information
 */
export interface SystemShellInfo {
  /** Operating system platform */
  platform: NodeJS.Platform;

  /** Default shell for the system */
  defaultShell: string;

  /** All detected shells */
  shells: ShellInstallInfo[];

  /** Environment variables relevant to shell execution */
  environment: {
    /** PATH variable */
    path: string;
    /** SHELL variable (Unix) or COMSPEC (Windows) */
    shellVar: string | undefined;
    /** Home directory */
    home: string;
    /** Current user */
    user: string;
  };

  /** System limits */
  limits: {
    /** Maximum command line length */
    maxCommandLength: number;
    /** Maximum environment size */
    maxEnvSize: number;
    /** Maximum number of file descriptors */
    maxFileDescriptors: number | null;
  };
}

/**
 * Result of a shell health check
 */
export interface HealthCheckResult {
  /** Overall health status */
  healthy: boolean;

  /** Timestamp of the check */
  timestamp: Date;

  /** Individual shell checks */
  shellChecks: Array<{
    shell: ShellType;
    healthy: boolean;
    responseTimeMs: number;
    error?: string;
  }>;

  /** Process manager health */
  processManager: {
    healthy: boolean;
    runningProcesses: number;
    zombieProcesses: number;
    memoryUsage: number;
  };

  /** System resources */
  resources: {
    cpuUsage: number;
    memoryAvailable: number;
    memoryTotal: number;
    loadAverage: number[];
  };

  /** Issues found during health check */
  issues: string[];

  /** Recommendations for improvement */
  recommendations: string[];
}

/**
 * Process statistics
 */
export interface ProcessStats {
  /** Total number of tracked processes */
  totalProcesses: number;

  /** Processes by status */
  byStatus: {
    running: number;
    completed: number;
    error: number;
    killed: number;
  };

  /** Memory usage of tracked processes (estimated) */
  memoryUsage: {
    total: number;
    average: number;
    peak: number;
  };

  /** Execution time statistics */
  executionTime: {
    total: number;
    average: number;
    min: number;
    max: number;
  };

  /** Current system process info */
  systemProcesses: {
    /** PID of current process */
    pid: number;
    /** Memory used by current process */
    memoryUsed: number;
    /** CPU time used */
    cpuTime: number;
    /** Uptime in milliseconds */
    uptime: number;
  };
}

/**
 * Record of a command execution
 */
export interface ExecutionRecord {
  /** Unique execution ID */
  id: string;

  /** Command that was executed */
  command: string;

  /** Arguments passed to the command */
  args: string[];

  /** Shell used for execution */
  shell: string;

  /** Working directory */
  cwd: string;

  /** Start time */
  startTime: Date;

  /** End time (if completed) */
  endTime?: Date;

  /** Duration in milliseconds */
  durationMs?: number;

  /** Exit code (if completed) */
  exitCode?: number;

  /** Whether execution was successful */
  success?: boolean;

  /** Error message if failed */
  error?: string;

  /** Output size in bytes */
  outputSize: number;

  /** Error output size in bytes */
  errorSize: number;

  /** Whether command timed out */
  timedOut: boolean;
}

/**
 * Performance analysis report
 */
export interface PerformanceReport {
  /** Report generation timestamp */
  timestamp: Date;

  /** Period covered by the report */
  period: {
    start: Date;
    end: Date;
    durationMs: number;
  };

  /** Total executions in period */
  totalExecutions: number;

  /** Success rate (0-100) */
  successRate: number;

  /** Timeout rate (0-100) */
  timeoutRate: number;

  /** Execution time statistics */
  executionTime: {
    average: number;
    median: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  };

  /** Most frequently executed commands */
  topCommands: Array<{
    command: string;
    count: number;
    avgDuration: number;
    successRate: number;
  }>;

  /** Slowest commands */
  slowestCommands: Array<{
    command: string;
    maxDuration: number;
    avgDuration: number;
  }>;

  /** Commands with highest failure rate */
  problematicCommands: Array<{
    command: string;
    failureRate: number;
    commonErrors: string[];
  }>;

  /** Shell usage statistics */
  shellUsage: Record<
    string,
    {
      count: number;
      avgDuration: number;
      successRate: number;
    }
  >;

  /** Recommendations based on analysis */
  recommendations: string[];
}

// ============================================================
// ShellDiagnostics Class
// ============================================================

export class ShellDiagnostics {
  private shell: NativeShell | null = null;
  private executionHistory: ExecutionRecord[] = [];
  private maxHistorySize: number;

  constructor(options?: {
    shell?: NativeShell;
    maxHistorySize?: number;
  }) {
    this.shell = options?.shell || null;
    this.maxHistorySize = options?.maxHistorySize || 1000;
  }

  /**
   * Set the NativeShell instance to use for diagnostics
   */
  setShell(shell: NativeShell): void {
    this.shell = shell;
  }

  // ============================================================
  // System Shell Information
  // ============================================================

  /**
   * Get comprehensive information about available shells
   */
  async getSystemInfo(): Promise<SystemShellInfo> {
    const platform = os.platform();
    const isWindows = platform === 'win32';

    // Detect available shells
    const shells = await this.detectShells();

    // Determine default shell
    const defaultShell = isWindows
      ? process.env.COMSPEC || 'cmd.exe'
      : process.env.SHELL || '/bin/bash';

    // Get system limits
    const limits = this.getSystemLimits();

    return {
      platform,
      defaultShell,
      shells,
      environment: {
        path: process.env.PATH || '',
        shellVar: isWindows ? process.env.COMSPEC : process.env.SHELL,
        home: os.homedir(),
        user: os.userInfo().username,
      },
      limits,
    };
  }

  /**
   * Detect available shells on the system
   */
  private async detectShells(): Promise<ShellInstallInfo[]> {
    const isWindows = os.platform() === 'win32';
    const shells: ShellInstallInfo[] = [];

    if (isWindows) {
      // Windows shells
      shells.push(await this.checkShell('cmd', 'Command Prompt', 'cmd.exe', ['cmd', '/?']));
      shells.push(
        await this.checkShell('powershell', 'Windows PowerShell', 'powershell.exe', [
          'powershell',
          '-Command',
          '$PSVersionTable.PSVersion.ToString()',
        ]),
      );
      shells.push(
        await this.checkShell('pwsh', 'PowerShell Core', 'pwsh.exe', [
          'pwsh',
          '-Command',
          '$PSVersionTable.PSVersion.ToString()',
        ]),
      );

      // Git Bash
      const gitBashPaths = [
        'C:\\Program Files\\Git\\bin\\bash.exe',
        'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      ];
      for (const gitBashPath of gitBashPaths) {
        const gitBash = await this.checkShell('bash', 'Git Bash', gitBashPath, [
          gitBashPath,
          '--version',
        ]);
        if (gitBash.available) {
          shells.push(gitBash);
          break;
        }
      }

      // WSL Bash
      shells.push(
        await this.checkShell('bash', 'WSL Bash', 'wsl.exe', ['wsl', 'bash', '--version']),
      );
    } else {
      // Unix shells
      shells.push(await this.checkShell('bash', 'Bash', '/bin/bash', ['bash', '--version']));
      shells.push(await this.checkShell('sh', 'Bourne Shell', '/bin/sh', ['sh', '--version']));
      shells.push(await this.checkShell('zsh', 'Zsh', '/bin/zsh', ['zsh', '--version']));

      // Check for fish
      shells.push(await this.checkShell('bash', 'Fish', '/usr/bin/fish', ['fish', '--version']));
    }

    // Mark default shell
    const defaultShell = os.platform() === 'win32' ? process.env.COMSPEC : process.env.SHELL;

    for (const shell of shells) {
      if (shell.path && defaultShell && shell.path.includes(path.basename(defaultShell))) {
        shell.isDefault = true;
      }
    }

    return shells;
  }

  /**
   * Check a specific shell availability and version
   */
  private async checkShell(
    type: ShellType,
    name: string,
    shellPath: string,
    versionCommand: string[],
  ): Promise<ShellInstallInfo> {
    const result: ShellInstallInfo = {
      type,
      name,
      path: null,
      available: false,
      version: null,
      isDefault: false,
      features: [],
    };

    try {
      // Try to get version
      const version = execSync(versionCommand.join(' '), {
        encoding: 'utf-8',
        timeout: 5000,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      result.available = true;
      result.path = shellPath;
      result.version = this.parseVersion(version);

      // Detect features
      result.features = this.detectShellFeatures(type, version);
    } catch {
      // Shell not available or version command failed
      result.available = false;
    }

    return result;
  }

  /**
   * Parse version string from shell output
   */
  private parseVersion(output: string): string {
    // Extract version number from various formats
    const patterns = [
      /(\d+\.\d+\.\d+)/, // Standard semver
      /(\d+\.\d+)/, // Major.minor
      /version\s+(\S+)/i, // "version X.Y.Z"
      /v(\d+\.\d+)/i, // "vX.Y"
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match) {
        return match[1];
      }
    }

    // Return first line if no version pattern found
    return output.split('\n')[0].trim().slice(0, 50);
  }

  /**
   * Detect shell features based on type and version
   */
  private detectShellFeatures(type: ShellType, version: string): string[] {
    const features: string[] = [];

    switch (type) {
      case 'powershell':
      case 'pwsh':
        features.push('objects', 'pipelines', 'remoting');
        if (type === 'pwsh') {
          features.push('cross-platform');
        }
        break;

      case 'bash': {
        features.push('scripting', 'job-control', 'arrays');
        const majorVersion = parseInt(version.split('.')[0], 10);
        if (majorVersion >= 4) {
          features.push('associative-arrays', 'coprocesses');
        }
        break;
      }

      case 'zsh':
        features.push('scripting', 'completion', 'themes', 'plugins');
        break;

      case 'cmd':
        features.push('batch-files', 'pipes');
        break;

      case 'sh':
        features.push('posix-compatible', 'scripting');
        break;
    }

    return features;
  }

  /**
   * Get system limits relevant to shell execution
   */
  private getSystemLimits(): SystemShellInfo['limits'] {
    const isWindows = os.platform() === 'win32';

    return {
      maxCommandLength: isWindows ? 8191 : 131072, // Windows cmd limit vs Linux
      maxEnvSize: isWindows ? 32767 : 131072,
      maxFileDescriptors: isWindows ? null : this.getMaxFileDescriptors(),
    };
  }

  /**
   * Get maximum file descriptors (Unix only)
   */
  private getMaxFileDescriptors(): number | null {
    if (os.platform() === 'win32') return null;

    try {
      const result = execSync('ulimit -n', { encoding: 'utf-8', timeout: 1000 });
      return parseInt(result.trim(), 10);
    } catch {
      return null;
    }
  }

  // ============================================================
  // Health Check
  // ============================================================

  /**
   * Perform a comprehensive health check
   */
  async checkShellHealth(): Promise<HealthCheckResult> {
    const timestamp = new Date();
    const issues: string[] = [];
    const recommendations: string[] = [];
    const shellChecks: HealthCheckResult['shellChecks'] = [];

    // Get available shells
    const systemInfo = await this.getSystemInfo();

    // Check each available shell
    for (const shellInfo of systemInfo.shells.filter((s) => s.available)) {
      const check = await this.testShellResponse(shellInfo);
      shellChecks.push(check);

      if (!check.healthy) {
        issues.push(`Shell ${shellInfo.name} is not responding properly: ${check.error}`);
      } else if (check.responseTimeMs > 1000) {
        recommendations.push(
          `Shell ${shellInfo.name} is slow (${check.responseTimeMs}ms). Consider checking system load.`,
        );
      }
    }

    // Check process manager health
    const processManager = this.checkProcessManagerHealth();
    if (processManager.zombieProcesses > 0) {
      issues.push(`${processManager.zombieProcesses} zombie processes detected`);
      recommendations.push('Consider running cleanup to remove stale processes');
    }

    // Get system resources
    const resources = this.getResourceUsage();
    if (resources.cpuUsage > 80) {
      issues.push(`High CPU usage: ${resources.cpuUsage.toFixed(1)}%`);
    }
    if (resources.memoryAvailable / resources.memoryTotal < 0.1) {
      issues.push('Low available memory');
      recommendations.push('Consider closing unused applications');
    }

    const healthy = shellChecks.some((c) => c.healthy) && issues.length === 0;

    return {
      healthy,
      timestamp,
      shellChecks,
      processManager,
      resources,
      issues,
      recommendations,
    };
  }

  /**
   * Test shell response time and health
   */
  private async testShellResponse(
    shellInfo: ShellInstallInfo,
  ): Promise<HealthCheckResult['shellChecks'][0]> {
    const startTime = Date.now();

    try {
      const isWindows = os.platform() === 'win32';
      const testCommand = isWindows ? 'echo ok' : 'echo ok';

      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          shellInfo.path || '',
          isWindows ? ['/c', testCommand] : ['-c', testCommand],
          {
            timeout: 5000,
            windowsHide: true,
          },
        );

        proc.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Exit code: ${code}`));
        });

        proc.on('error', reject);
      });

      return {
        shell: shellInfo.type,
        healthy: true,
        responseTimeMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      return {
        shell: shellInfo.type,
        healthy: false,
        responseTimeMs: Date.now() - startTime,
        error: getErrorMessage(err),
      };
    }
  }

  /**
   * Check process manager health
   */
  private checkProcessManagerHealth(): HealthCheckResult['processManager'] {
    const processes = this.shell?.listProcesses() || [];
    const running = processes.filter((p) => p.status === 'running').length;
    const zombie = processes.filter((p) => {
      // Detect zombie processes (started long ago but not running)
      const age = Date.now() - p.startTime.getTime();
      return p.status === 'running' && age > 3600000 && !p.endTime;
    }).length;

    const memoryUsage = process.memoryUsage();

    return {
      healthy: zombie === 0,
      runningProcesses: running,
      zombieProcesses: zombie,
      memoryUsage: memoryUsage.heapUsed,
    };
  }

  /**
   * Get current resource usage
   */
  private getResourceUsage(): HealthCheckResult['resources'] {
    const cpus = os.cpus();
    const totalCpu =
      cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const idle = cpu.times.idle;
        return acc + ((total - idle) / total) * 100;
      }, 0) / cpus.length;

    return {
      cpuUsage: totalCpu,
      memoryAvailable: os.freemem(),
      memoryTotal: os.totalmem(),
      loadAverage: os.loadavg(),
    };
  }

  // ============================================================
  // Process Statistics
  // ============================================================

  /**
   * Get detailed process statistics
   */
  getProcessStats(): ProcessStats {
    const processes = this.shell?.listProcesses() || [];

    const byStatus = {
      running: 0,
      completed: 0,
      error: 0,
      killed: 0,
      zombie: 0,
    };

    const durations: number[] = [];
    let totalOutputSize = 0;

    for (const proc of processes) {
      if (proc.status in byStatus) {
        byStatus[proc.status as keyof typeof byStatus]++;
      }

      if (proc.endTime) {
        const duration = proc.endTime.getTime() - proc.startTime.getTime();
        durations.push(duration);
      }

      totalOutputSize += proc.output.join('').length;
    }

    const executionTime =
      durations.length > 0
        ? {
            total: durations.reduce((a, b) => a + b, 0),
            average: durations.reduce((a, b) => a + b, 0) / durations.length,
            min: Math.min(...durations),
            max: Math.max(...durations),
          }
        : {
            total: 0,
            average: 0,
            min: 0,
            max: 0,
          };

    const memoryUsage = process.memoryUsage();

    return {
      totalProcesses: processes.length,
      byStatus,
      memoryUsage: {
        total: totalOutputSize,
        average: processes.length > 0 ? totalOutputSize / processes.length : 0,
        peak: totalOutputSize, // Simplified - would need tracking for true peak
      },
      executionTime,
      systemProcesses: {
        pid: process.pid,
        memoryUsed: memoryUsage.heapUsed,
        cpuTime: process.cpuUsage().user + process.cpuUsage().system,
        uptime: process.uptime() * 1000,
      },
    };
  }

  // ============================================================
  // Execution History
  // ============================================================

  /**
   * Record a command execution
   */
  recordExecution(record: Omit<ExecutionRecord, 'id'>): ExecutionRecord {
    const execution: ExecutionRecord = {
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...record,
    };

    this.executionHistory.push(execution);

    // Trim history if too large
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }

    return execution;
  }

  /**
   * Update an execution record (e.g., when completed)
   */
  updateExecution(id: string, updates: Partial<ExecutionRecord>): ExecutionRecord | null {
    const index = this.executionHistory.findIndex((e) => e.id === id);
    if (index === -1) return null;

    this.executionHistory[index] = {
      ...this.executionHistory[index],
      ...updates,
    };

    return this.executionHistory[index];
  }

  /**
   * Get execution history
   */
  getExecutionHistory(options?: {
    limit?: number;
    offset?: number;
    filter?: {
      shell?: string;
      success?: boolean;
      command?: string;
      startTime?: Date;
      endTime?: Date;
    };
  }): ExecutionRecord[] {
    let history = [...this.executionHistory];

    // Apply filters
    if (options?.filter) {
      const filter = options.filter;

      if (filter.shell) {
        history = history.filter((e) => e.shell === filter.shell);
      }

      if (filter.success !== undefined) {
        history = history.filter((e) => e.success === filter.success);
      }

      if (filter.command) {
        const pattern = filter.command.toLowerCase();
        history = history.filter((e) => e.command.toLowerCase().includes(pattern));
      }

      if (filter.startTime) {
        const startTime = filter.startTime;
        history = history.filter((e) => e.startTime >= startTime);
      }

      if (filter.endTime) {
        const endTime = filter.endTime;
        history = history.filter((e) => e.startTime <= endTime);
      }
    }

    // Sort by start time (newest first)
    history.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || 100;

    return history.slice(offset, offset + limit);
  }

  /**
   * Clear execution history
   */
  clearHistory(): number {
    const count = this.executionHistory.length;
    this.executionHistory = [];
    return count;
  }

  // ============================================================
  // Performance Analysis
  // ============================================================

  /**
   * Analyze performance over a time period
   */
  analyzePerformance(options?: {
    startTime?: Date;
    endTime?: Date;
    topN?: number;
  }): PerformanceReport {
    const endTime = options?.endTime || new Date();
    const startTime = options?.startTime || new Date(endTime.getTime() - 24 * 60 * 60 * 1000);
    const topN = options?.topN || 10;

    // Filter history to period
    const periodHistory = this.executionHistory.filter(
      (e) => e.startTime >= startTime && e.startTime <= endTime,
    );

    // Calculate success and timeout rates
    const completed = periodHistory.filter((e) => e.success !== undefined);
    const successes = completed.filter((e) => e.success);
    const timeouts = periodHistory.filter((e) => e.timedOut);

    const successRate = completed.length > 0 ? (successes.length / completed.length) * 100 : 100;

    const timeoutRate =
      periodHistory.length > 0 ? (timeouts.length / periodHistory.length) * 100 : 0;

    // Calculate execution time statistics
    const durations = periodHistory
      .filter((e): e is typeof e & { durationMs: number } => e.durationMs !== undefined)
      .map((e) => e.durationMs);

    const executionTime = this.calculateTimeStats(durations);

    // Analyze commands
    const commandStats = this.analyzeCommands(periodHistory);

    // Shell usage
    const shellUsage = this.analyzeShellUsage(periodHistory);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      successRate,
      timeoutRate,
      executionTime,
      commandStats.problematic,
    );

    return {
      timestamp: new Date(),
      period: {
        start: startTime,
        end: endTime,
        durationMs: endTime.getTime() - startTime.getTime(),
      },
      totalExecutions: periodHistory.length,
      successRate,
      timeoutRate,
      executionTime,
      topCommands: commandStats.top.slice(0, topN),
      slowestCommands: commandStats.slowest.slice(0, topN),
      problematicCommands: commandStats.problematic.slice(0, topN),
      shellUsage,
      recommendations,
    };
  }

  /**
   * Calculate time statistics
   */
  private calculateTimeStats(durations: number[]): PerformanceReport['executionTime'] {
    if (durations.length === 0) {
      return { average: 0, median: 0, p95: 0, p99: 0, min: 0, max: 0 };
    }

    const sorted = [...durations].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      average: sum / sorted.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };
  }

  /**
   * Analyze command patterns
   */
  private analyzeCommands(history: ExecutionRecord[]): {
    top: PerformanceReport['topCommands'];
    slowest: PerformanceReport['slowestCommands'];
    problematic: PerformanceReport['problematicCommands'];
  } {
    // Group by base command
    const commandGroups = new Map<string, ExecutionRecord[]>();

    for (const exec of history) {
      const baseCommand = exec.command.split(' ')[0];
      if (!commandGroups.has(baseCommand)) {
        commandGroups.set(baseCommand, []);
      }
      commandGroups.get(baseCommand)?.push(exec);
    }

    // Calculate stats for each command
    const stats = Array.from(commandGroups.entries()).map(([command, executions]) => {
      const completed = executions.filter((e) => e.success !== undefined);
      const successes = completed.filter((e) => e.success);
      const durations = executions
        .filter((e): e is typeof e & { durationMs: number } => !!e.durationMs)
        .map((e) => e.durationMs);
      const errors = executions
        .filter((e): e is typeof e & { error: string } => !!e.error)
        .map((e) => e.error);

      return {
        command,
        count: executions.length,
        avgDuration:
          durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
        maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
        successRate: completed.length > 0 ? (successes.length / completed.length) * 100 : 100,
        failureRate:
          completed.length > 0
            ? ((completed.length - successes.length) / completed.length) * 100
            : 0,
        commonErrors: [...new Set(errors)].slice(0, 3),
      };
    });

    return {
      top: stats
        .sort((a, b) => b.count - a.count)
        .map((s) => ({
          command: s.command,
          count: s.count,
          avgDuration: s.avgDuration,
          successRate: s.successRate,
        })),
      slowest: stats
        .filter((s) => s.avgDuration > 0)
        .sort((a, b) => b.maxDuration - a.maxDuration)
        .map((s) => ({
          command: s.command,
          maxDuration: s.maxDuration,
          avgDuration: s.avgDuration,
        })),
      problematic: stats
        .filter((s) => s.failureRate > 0)
        .sort((a, b) => b.failureRate - a.failureRate)
        .map((s) => ({
          command: s.command,
          failureRate: s.failureRate,
          commonErrors: s.commonErrors,
        })),
    };
  }

  /**
   * Analyze shell usage patterns
   */
  private analyzeShellUsage(history: ExecutionRecord[]): PerformanceReport['shellUsage'] {
    const usage: PerformanceReport['shellUsage'] = {};

    for (const exec of history) {
      const shell = exec.shell || 'unknown';

      if (!usage[shell]) {
        usage[shell] = { count: 0, avgDuration: 0, successRate: 0 };
      }

      usage[shell].count++;
    }

    // Calculate averages
    for (const shell of Object.keys(usage)) {
      const shellHistory = history.filter((e) => (e.shell || 'unknown') === shell);
      const durations = shellHistory
        .filter((e): e is typeof e & { durationMs: number } => !!e.durationMs)
        .map((e) => e.durationMs);
      const completed = shellHistory.filter((e) => e.success !== undefined);
      const successes = completed.filter((e) => e.success);

      usage[shell].avgDuration =
        durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

      usage[shell].successRate =
        completed.length > 0 ? (successes.length / completed.length) * 100 : 100;
    }

    return usage;
  }

  /**
   * Generate performance recommendations
   */
  private generateRecommendations(
    successRate: number,
    timeoutRate: number,
    executionTime: PerformanceReport['executionTime'],
    problematicCommands: PerformanceReport['problematicCommands'],
  ): string[] {
    const recommendations: string[] = [];

    if (successRate < 90) {
      recommendations.push(
        `Success rate is low (${successRate.toFixed(1)}%). Review failed commands.`,
      );
    }

    if (timeoutRate > 5) {
      recommendations.push(
        `High timeout rate (${timeoutRate.toFixed(1)}%). Consider increasing timeouts or optimizing commands.`,
      );
    }

    if (executionTime.p95 > 10000) {
      recommendations.push(
        `95th percentile execution time is high (${(executionTime.p95 / 1000).toFixed(1)}s). Consider optimizing slow commands.`,
      );
    }

    if (problematicCommands.length > 0) {
      const topProblematic = problematicCommands[0];
      recommendations.push(
        `Command '${topProblematic.command}' has ${topProblematic.failureRate.toFixed(1)}% failure rate.`,
      );
    }

    if (executionTime.max > executionTime.average * 10) {
      recommendations.push('High variance in execution times. Some commands may be blocking.');
    }

    return recommendations;
  }

  // ============================================================
  // Print Methods
  // ============================================================

  /**
   * Print system shell information
   */
  printSystemInfo(info: SystemShellInfo): void {
    console.log(chalk.cyan('\n========================================'));
    console.log(chalk.cyan('  SYSTEM SHELL INFORMATION'));
    console.log(chalk.cyan('========================================\n'));

    console.log(chalk.white('Platform: ') + chalk.yellow(info.platform));
    console.log(chalk.white('Default Shell: ') + chalk.yellow(info.defaultShell));

    console.log(chalk.cyan('\n--- Available Shells ---'));
    for (const shell of info.shells) {
      const status = shell.available ? chalk.green('[OK]') : chalk.red('[NO]');
      const defaultMark = shell.isDefault ? chalk.yellow(' (default)') : '';
      console.log(`${status} ${shell.name}${defaultMark}`);
      if (shell.available) {
        console.log(chalk.gray(`    Path: ${shell.path}`));
        console.log(chalk.gray(`    Version: ${shell.version}`));
        if (shell.features.length > 0) {
          console.log(chalk.gray(`    Features: ${shell.features.join(', ')}`));
        }
      }
    }

    console.log(chalk.cyan('\n--- Environment ---'));
    console.log(chalk.white('Home: ') + chalk.gray(info.environment.home));
    console.log(chalk.white('User: ') + chalk.gray(info.environment.user));
    console.log(chalk.white('Shell Var: ') + chalk.gray(info.environment.shellVar || 'N/A'));

    console.log(chalk.cyan('\n--- Limits ---'));
    console.log(
      chalk.white('Max Command Length: ') +
        chalk.gray(info.limits.maxCommandLength.toLocaleString()),
    );
    console.log(
      chalk.white('Max Env Size: ') + chalk.gray(info.limits.maxEnvSize.toLocaleString()),
    );
    if (info.limits.maxFileDescriptors) {
      console.log(
        chalk.white('Max File Descriptors: ') +
          chalk.gray(info.limits.maxFileDescriptors.toLocaleString()),
      );
    }

    console.log(chalk.cyan('\n========================================\n'));
  }

  /**
   * Print health check results
   */
  printHealthCheck(result: HealthCheckResult): void {
    console.log(chalk.cyan('\n========================================'));
    console.log(chalk.cyan('  SHELL HEALTH CHECK'));
    console.log(chalk.cyan('========================================\n'));

    const overallStatus = result.healthy ? chalk.green('[HEALTHY]') : chalk.red('[UNHEALTHY]');

    console.log(chalk.white('Status: ') + overallStatus);
    console.log(chalk.white('Time: ') + chalk.gray(result.timestamp.toISOString()));

    console.log(chalk.cyan('\n--- Shell Checks ---'));
    for (const check of result.shellChecks) {
      const status = check.healthy ? chalk.green('[OK]') : chalk.red('[FAIL]');
      console.log(`${status} ${check.shell} (${check.responseTimeMs}ms)`);
      if (check.error) {
        console.log(chalk.red(`    Error: ${check.error}`));
      }
    }

    console.log(chalk.cyan('\n--- Process Manager ---'));
    const pmStatus = result.processManager.healthy ? chalk.green('[OK]') : chalk.red('[WARN]');
    console.log(`${pmStatus} Process Manager`);
    console.log(chalk.gray(`    Running: ${result.processManager.runningProcesses}`));
    console.log(chalk.gray(`    Zombie: ${result.processManager.zombieProcesses}`));
    console.log(
      chalk.gray(`    Memory: ${(result.processManager.memoryUsage / 1024 / 1024).toFixed(1)} MB`),
    );

    console.log(chalk.cyan('\n--- Resources ---'));
    console.log(
      chalk.white('CPU Usage: ') + chalk.gray(`${result.resources.cpuUsage.toFixed(1)}%`),
    );
    console.log(
      chalk.white('Memory: ') +
        chalk.gray(
          `${(result.resources.memoryAvailable / 1024 / 1024 / 1024).toFixed(1)} GB free / ` +
            `${(result.resources.memoryTotal / 1024 / 1024 / 1024).toFixed(1)} GB total`,
        ),
    );
    if (os.platform() !== 'win32') {
      console.log(
        chalk.white('Load Average: ') +
          chalk.gray(result.resources.loadAverage.map((l) => l.toFixed(2)).join(', ')),
      );
    }

    if (result.issues.length > 0) {
      console.log(chalk.red('\n--- Issues ---'));
      for (const issue of result.issues) {
        console.log(chalk.red(`  - ${issue}`));
      }
    }

    if (result.recommendations.length > 0) {
      console.log(chalk.yellow('\n--- Recommendations ---'));
      for (const rec of result.recommendations) {
        console.log(chalk.yellow(`  - ${rec}`));
      }
    }

    console.log(chalk.cyan('\n========================================\n'));
  }

  /**
   * Print process statistics
   */
  printProcessStats(stats: ProcessStats): void {
    console.log(chalk.cyan('\n========================================'));
    console.log(chalk.cyan('  PROCESS STATISTICS'));
    console.log(chalk.cyan('========================================\n'));

    console.log(chalk.white('Total Processes: ') + chalk.yellow(stats.totalProcesses.toString()));

    console.log(chalk.cyan('\n--- By Status ---'));
    console.log(chalk.green(`  Running: ${stats.byStatus.running}`));
    console.log(chalk.green(`  Completed: ${stats.byStatus.completed}`));
    console.log(chalk.red(`  Error: ${stats.byStatus.error}`));
    console.log(chalk.yellow(`  Killed: ${stats.byStatus.killed}`));

    console.log(chalk.cyan('\n--- Execution Time ---'));
    console.log(
      chalk.white('  Total: ') + chalk.gray(`${(stats.executionTime.total / 1000).toFixed(1)}s`),
    );
    console.log(
      chalk.white('  Average: ') +
        chalk.gray(`${(stats.executionTime.average / 1000).toFixed(2)}s`),
    );
    console.log(chalk.white('  Min: ') + chalk.gray(`${stats.executionTime.min}ms`));
    console.log(
      chalk.white('  Max: ') + chalk.gray(`${(stats.executionTime.max / 1000).toFixed(2)}s`),
    );

    console.log(chalk.cyan('\n--- System Process ---'));
    console.log(chalk.white('  PID: ') + chalk.gray(stats.systemProcesses.pid.toString()));
    console.log(
      chalk.white('  Memory: ') +
        chalk.gray(`${(stats.systemProcesses.memoryUsed / 1024 / 1024).toFixed(1)} MB`),
    );
    console.log(
      chalk.white('  Uptime: ') +
        chalk.gray(`${(stats.systemProcesses.uptime / 1000 / 60).toFixed(1)} min`),
    );

    console.log(chalk.cyan('\n========================================\n'));
  }

  /**
   * Print execution history
   */
  printExecutionHistory(history: ExecutionRecord[], options?: { limit?: number }): void {
    const limit = options?.limit || 20;
    const records = history.slice(0, limit);

    console.log(chalk.cyan('\n========================================'));
    console.log(chalk.cyan('  EXECUTION HISTORY'));
    console.log(chalk.cyan(`  (showing ${records.length} of ${history.length})`));
    console.log(chalk.cyan('========================================\n'));

    for (const record of records) {
      const status =
        record.success === undefined
          ? chalk.yellow('[...]')
          : record.success
            ? chalk.green('[OK]')
            : chalk.red('[FAIL]');

      const duration = record.durationMs ? chalk.gray(`(${record.durationMs}ms)`) : '';

      const timeout = record.timedOut ? chalk.red(' [TIMEOUT]') : '';

      console.log(`${status} ${chalk.white(record.command.slice(0, 50))} ${duration}${timeout}`);
      console.log(chalk.gray(`    ${record.startTime.toISOString()} | Shell: ${record.shell}`));

      if (record.error) {
        console.log(chalk.red(`    Error: ${record.error.slice(0, 60)}`));
      }
    }

    console.log(chalk.cyan('\n========================================\n'));
  }

  /**
   * Print performance report
   */
  printPerformanceReport(report: PerformanceReport): void {
    console.log(chalk.cyan('\n========================================'));
    console.log(chalk.cyan('  PERFORMANCE REPORT'));
    console.log(chalk.cyan('========================================\n'));

    console.log(
      chalk.white('Period: ') +
        chalk.gray(`${report.period.start.toISOString()} to ${report.period.end.toISOString()}`),
    );
    console.log(
      chalk.white('Total Executions: ') + chalk.yellow(report.totalExecutions.toString()),
    );

    console.log(chalk.cyan('\n--- Rates ---'));
    const successColor =
      report.successRate >= 90 ? chalk.green : report.successRate >= 70 ? chalk.yellow : chalk.red;
    const timeoutColor =
      report.timeoutRate <= 5 ? chalk.green : report.timeoutRate <= 15 ? chalk.yellow : chalk.red;
    console.log(
      chalk.white('  Success Rate: ') + successColor(`${report.successRate.toFixed(1)}%`),
    );
    console.log(
      chalk.white('  Timeout Rate: ') + timeoutColor(`${report.timeoutRate.toFixed(1)}%`),
    );

    console.log(chalk.cyan('\n--- Execution Time ---'));
    console.log(
      chalk.white('  Average: ') +
        chalk.gray(`${(report.executionTime.average / 1000).toFixed(2)}s`),
    );
    console.log(
      chalk.white('  Median: ') + chalk.gray(`${(report.executionTime.median / 1000).toFixed(2)}s`),
    );
    console.log(
      chalk.white('  P95: ') + chalk.gray(`${(report.executionTime.p95 / 1000).toFixed(2)}s`),
    );
    console.log(
      chalk.white('  P99: ') + chalk.gray(`${(report.executionTime.p99 / 1000).toFixed(2)}s`),
    );

    if (report.topCommands.length > 0) {
      console.log(chalk.cyan('\n--- Top Commands ---'));
      for (const cmd of report.topCommands.slice(0, 5)) {
        console.log(
          `  ${chalk.white(cmd.command)} - ${cmd.count} calls, avg ${(cmd.avgDuration / 1000).toFixed(2)}s`,
        );
      }
    }

    if (report.slowestCommands.length > 0) {
      console.log(chalk.cyan('\n--- Slowest Commands ---'));
      for (const cmd of report.slowestCommands.slice(0, 5)) {
        console.log(`  ${chalk.white(cmd.command)} - max ${(cmd.maxDuration / 1000).toFixed(2)}s`);
      }
    }

    if (report.problematicCommands.length > 0) {
      console.log(chalk.red('\n--- Problematic Commands ---'));
      for (const cmd of report.problematicCommands.slice(0, 5)) {
        console.log(`  ${chalk.white(cmd.command)} - ${cmd.failureRate.toFixed(1)}% failure`);
      }
    }

    if (report.recommendations.length > 0) {
      console.log(chalk.yellow('\n--- Recommendations ---'));
      for (const rec of report.recommendations) {
        console.log(chalk.yellow(`  - ${rec}`));
      }
    }

    console.log(chalk.cyan('\n========================================\n'));
  }
}

// ============================================================
// Factory Function
// ============================================================

export function createShellDiagnostics(options?: {
  shell?: NativeShell;
  maxHistorySize?: number;
}): ShellDiagnostics {
  return new ShellDiagnostics(options);
}

// ============================================================
// Default Export
// ============================================================

export default ShellDiagnostics;

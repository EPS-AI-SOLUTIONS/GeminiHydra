/**
 * NativeCommands - Shell commands (using ShellManager)
 *
 * Commands: run, bg, ps, kill, output, sysinfo, config, history,
 *           shells, escape, diagnostics, processes, execHistory,
 *           performance, clearHistory
 *
 * @module cli/nativecommands/shellCommands
 */

import type { ShellType } from '../../native/nativeshell/index.js';
import {
  type CommandResult,
  chalk,
  createFailedMessage,
  error,
  formatBytes,
  formatDuration,
  getShellDiagnostics,
  getTools,
  parseFlags,
  SHELL_PROFILES,
  type ShellConfigProfile,
  Spinner,
  success,
  truncate,
} from './helpers.js';

// ============================================================
// Shell Commands (Using ShellManager)
// ============================================================

export const shellCommands = {
  /**
   * Run shell command (uses ShellManager for enhanced features)
   */
  async run(args: string[]): Promise<CommandResult> {
    const { flags, positional } = parseFlags(args);

    if (!positional.length) {
      return error('Usage: /shell run <command> [--timeout <ms>] [--shell cmd|powershell|bash]');
    }

    const command = positional.join(' ');
    const spinner = new Spinner(`Running: ${truncate(command, 40)}`);

    try {
      const tools = getTools();
      spinner.start();

      // Use ShellManager for enhanced execution
      const result = await tools.shellManager.exec(command, {
        timeout: flags.timeout ? parseInt(flags.timeout as string, 10) : undefined,
        shell: flags.shell as ShellType | undefined,
      });

      spinner.stop();

      return success(
        {
          command,
          output: truncate(result.stdout, 5000),
          exitCode: result.exitCode,
          duration: `${result.duration}ms`,
        },
        'Command completed',
      );
    } catch (err) {
      spinner.stop();
      return error(createFailedMessage('run command', err));
    }
  },

  /**
   * Run command in background
   */
  async bg(args: string[]): Promise<CommandResult> {
    if (!args.length) {
      return error('Usage: /shell bg <command>');
    }

    const command = args.join(' ');

    try {
      const tools = getTools();
      const pid = await tools.shellManager.background(command);
      return success({ pid, command }, 'Background process started');
    } catch (err) {
      return error(createFailedMessage('start background process', err));
    }
  },

  /**
   * List processes
   */
  async ps(args: string[]): Promise<CommandResult> {
    const status = args[0] as string | undefined;

    try {
      const tools = getTools();
      const processes = tools.shellManager.listProcesses(
        status
          ? { status: status as 'error' | 'running' | 'completed' | 'killed' | 'zombie' }
          : undefined,
      );

      const rows = processes.map((p) => ({
        pid: p.pid,
        command: truncate(p.command, 30),
        status: p.status,
        duration: p.endTime
          ? formatDuration(p.endTime.getTime() - p.startTime.getTime())
          : 'running',
      }));

      return success({ processes: rows }, `Processes: ${processes.length}`);
    } catch (err) {
      return error(createFailedMessage('list processes', err));
    }
  },

  /**
   * Kill process
   */
  async kill(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /shell kill <pid>');
    }

    const pid = parseInt(args[0], 10);

    try {
      const tools = getTools();
      const killed = tools.shellManager.kill(pid);

      if (killed) {
        return success(null, `Process ${pid} killed`);
      } else {
        return error(`Could not kill process ${pid}`);
      }
    } catch (err) {
      return error(createFailedMessage('kill process', err));
    }
  },

  /**
   * Get process output
   */
  async output(args: string[]): Promise<CommandResult> {
    if (!args[0]) {
      return error('Usage: /shell output <pid>');
    }

    const pid = parseInt(args[0], 10);

    try {
      const tools = getTools();
      const output = tools.shellManager.getOutput(pid);
      const errors = tools.shellManager.getErrors(pid);

      return success(
        {
          stdout: truncate(output, 3000),
          stderr: truncate(errors, 1000),
        },
        `Process ${pid} output`,
      );
    } catch (err) {
      return error(createFailedMessage('get output', err));
    }
  },

  /**
   * System info (enhanced with ShellManager metrics)
   */
  async sysinfo(): Promise<CommandResult> {
    try {
      const tools = getTools();
      const info = tools.shellManager.getSystemInfo();

      return success(
        {
          platform: info.platform,
          arch: info.arch,
          hostname: info.hostname,
          cpus: info.cpus,
          memory: {
            total: formatBytes((info.memory as { total: number; free: number }).total),
            free: formatBytes((info.memory as { total: number; free: number }).free),
          },
          uptime: formatDuration((info.uptime as number) * 1000),
          shell: info.shell,
          shellManager: info.shellManager,
        },
        'System Information',
      );
    } catch (err) {
      return error(createFailedMessage('get system info', err));
    }
  },

  /**
   * Show ShellManager configuration and status
   */
  async config(args: string[]): Promise<CommandResult> {
    const { positional } = parseFlags(args);

    try {
      const tools = getTools();
      const manager = tools.shellManager;

      // Set profile if specified
      if (positional[0] && ['default', 'secure', 'performance', 'debug'].includes(positional[0])) {
        const profile = positional[0] as ShellConfigProfile;
        const profileConfig = SHELL_PROFILES[profile];
        manager.updateConfig({ ...profileConfig, profile });
        return success({ profile, config: profileConfig }, `Profile set to: ${profile}`);
      }

      // Show current config
      const config = manager.getConfig();
      const metrics = manager.getMetrics();

      console.log(chalk.cyan('\n=== ShellManager Configuration ===\n'));
      console.log(chalk.gray(`  Profile: ${config.profile}`));
      console.log(chalk.gray(`  Preferred Shell: ${config.preferredShell}`));
      console.log(chalk.gray(`  Default Timeout: ${config.defaultTimeout}ms`));
      console.log(
        chalk.gray(`  Sandbox Mode: ${config.sandbox ? chalk.yellow('ENABLED') : 'disabled'}`),
      );
      console.log(chalk.gray(`  Verbose: ${config.verbose}`));
      console.log(chalk.gray(`  Max Concurrent: ${config.maxConcurrentProcesses}`));
      console.log(chalk.gray(`  Track History: ${config.trackHistory}`));
      console.log(chalk.cyan('\n=== Metrics ===\n'));
      console.log(chalk.gray(`  Running: ${metrics.running}`));
      console.log(chalk.gray(`  Tracked: ${metrics.tracked}`));
      console.log(chalk.gray(`  History: ${metrics.historySize}`));
      console.log(chalk.gray(`  Sessions: ${metrics.sessionsActive}`));

      return success({ config, metrics }, 'ShellManager configuration');
    } catch (err) {
      return error(createFailedMessage('get config', err));
    }
  },

  /**
   * Show command history
   */
  async history(args: string[]): Promise<CommandResult> {
    const { flags, positional } = parseFlags(args);

    try {
      const tools = getTools();
      const manager = tools.shellManager;

      // Clear history if requested
      if (flags.clear) {
        manager.clearHistory();
        return success(null, 'History cleared');
      }

      // Search history
      if (positional[0]) {
        const results = manager.searchHistory(positional[0]);
        return success(
          {
            query: positional[0],
            matches: results.map((e) => ({
              command: truncate(e.command, 60),
              timestamp: e.timestamp.toISOString(),
              exitCode: e.exitCode,
              duration: e.duration ? `${e.duration}ms` : undefined,
            })),
          },
          `Found ${results.length} matching commands`,
        );
      }

      // Show recent history
      const limit = flags.limit ? parseInt(flags.limit as string, 10) : 20;
      const history = manager.getHistory(limit);

      const entries = history.map((e) => ({
        command: truncate(e.command, 50),
        time: e.timestamp.toLocaleTimeString(),
        exit: e.exitCode ?? '?',
        shell: e.shell,
      }));

      return success({ entries, total: history.length }, 'Command History');
    } catch (err) {
      return error(createFailedMessage('get history', err));
    }
  },

  /**
   * List available shells
   */
  async shells(): Promise<CommandResult> {
    try {
      const tools = getTools();
      const availability = await tools.shellManager.getAvailableShells();

      console.log(chalk.cyan('\n=== Available Shells ===\n'));

      const printShell = (info: {
        available: boolean;
        type: string;
        path?: string;
        version?: string;
      }) => {
        const status = info.available ? chalk.green('[OK]') : chalk.red('[NOT FOUND]');
        const version = info.version ? chalk.gray(` - ${info.version}`) : '';
        console.log(`  ${status} ${info.type}: ${info.path || 'N/A'}${version}`);
      };

      printShell(availability.cmd);
      printShell(availability.powershell);
      printShell(availability.pwsh);
      printShell(availability.bash);
      printShell(availability.sh);
      printShell(availability.zsh);

      console.log(chalk.gray(`\n  Default: ${availability.default}`));

      return success(availability, 'Available shells');
    } catch (err) {
      return error(createFailedMessage('list shells', err));
    }
  },

  /**
   * Escape/quote string for shell
   */
  async escape(args: string[]): Promise<CommandResult> {
    const { flags, positional } = parseFlags(args);

    if (!positional.length) {
      return error('Usage: /shell escape <string> [--shell cmd|powershell|bash] [--quote]');
    }

    try {
      const tools = getTools();
      const str = positional.join(' ');
      const shell = flags.shell as string | undefined;

      const escaped = tools.shellManager.escape(str, { shell: shell as ShellType | undefined });
      const quoted = tools.shellManager.quote(str, { shell: shell as ShellType | undefined });

      return success(
        {
          original: str,
          escaped,
          quoted,
          shell: shell || tools.shellManager.getConfig().preferredShell,
        },
        'Escaped string',
      );
    } catch (err) {
      return error(createFailedMessage('escape string', err));
    }
  },

  /**
   * Shell diagnostics - comprehensive shell and system analysis
   */
  async diagnostics(args: string[]): Promise<CommandResult> {
    const { flags } = parseFlags(args);
    const spinner = new Spinner('Running shell diagnostics...');

    try {
      const diag = getShellDiagnostics();
      spinner.start();

      // Get all diagnostic information
      const systemInfo = await diag.getSystemInfo();
      const healthCheck = await diag.checkShellHealth();
      const processStats = diag.getProcessStats();

      spinner.stop();

      // Print formatted output
      if (flags.system || flags.s) {
        diag.printSystemInfo(systemInfo);
      }

      if (flags.health || flags.h || (!flags.system && !flags.stats)) {
        diag.printHealthCheck(healthCheck);
      }

      if (flags.stats || flags.t) {
        diag.printProcessStats(processStats);
      }

      return success(
        {
          healthy: healthCheck.healthy,
          availableShells: systemInfo.shells.filter((s) => s.available).length,
          runningProcesses: processStats.byStatus.running,
          issues: healthCheck.issues,
          recommendations: healthCheck.recommendations,
        },
        'Shell diagnostics complete',
      );
    } catch (err) {
      spinner.stop();
      return error(createFailedMessage('run diagnostics', err));
    }
  },

  /**
   * List active processes with detailed information
   */
  async processes(args: string[]): Promise<CommandResult> {
    const { flags } = parseFlags(args);

    try {
      const tools = getTools();
      const diag = getShellDiagnostics();
      const processes = tools.shell.listProcesses();

      // Apply filter if provided
      let filtered = processes;
      if (flags.running || flags.r) {
        filtered = processes.filter((p) => p.status === 'running');
      } else if (flags.completed || flags.c) {
        filtered = processes.filter((p) => p.status === 'completed');
      } else if (flags.error || flags.e) {
        filtered = processes.filter((p) => p.status === 'error');
      }

      // Format output
      console.log(chalk.cyan('\n========================================'));
      console.log(chalk.cyan('  ACTIVE PROCESSES'));
      console.log(chalk.cyan(`  (${filtered.length} of ${processes.length})`));
      console.log(chalk.cyan('========================================\n'));

      for (const proc of filtered) {
        const statusColors: Record<string, typeof chalk.green> = {
          running: chalk.green,
          completed: chalk.blue,
          error: chalk.red,
          killed: chalk.yellow,
          zombie: chalk.magenta,
        };
        const statusColor = statusColors[proc.status] || chalk.gray;

        const duration = proc.endTime
          ? formatDuration(proc.endTime.getTime() - proc.startTime.getTime())
          : `${formatDuration(Date.now() - proc.startTime.getTime())} (running)`;

        console.log(
          `${statusColor(`[${proc.status.toUpperCase()}]`)} PID: ${chalk.yellow(proc.pid.toString())}`,
        );
        console.log(chalk.white(`  Command: ${truncate(proc.command, 60)}`));
        console.log(chalk.gray(`  Duration: ${duration}`));
        console.log(chalk.gray(`  Started: ${proc.startTime.toISOString()}`));

        if (proc.exitCode !== undefined) {
          console.log(chalk.gray(`  Exit Code: ${proc.exitCode}`));
        }

        if (proc.output.length > 0 && flags.output) {
          console.log(chalk.gray(`  Output: ${truncate(proc.output.join(''), 100)}`));
        }

        console.log('');
      }

      // Print stats
      const stats = diag.getProcessStats();
      console.log(chalk.cyan('--- Summary ---'));
      console.log(
        chalk.gray(
          `Running: ${stats.byStatus.running} | Completed: ${stats.byStatus.completed} | Error: ${stats.byStatus.error} | Killed: ${stats.byStatus.killed}`,
        ),
      );

      console.log(chalk.cyan('\n========================================\n'));

      return success(
        {
          total: processes.length,
          filtered: filtered.length,
          byStatus: stats.byStatus,
        },
        `Showing ${filtered.length} processes`,
      );
    } catch (err) {
      return error(createFailedMessage('list processes', err));
    }
  },

  /**
   * Show execution history with diagnostics
   */
  async execHistory(args: string[]): Promise<CommandResult> {
    const { flags, positional } = parseFlags(args);
    const limit = flags.limit ? parseInt(flags.limit as string, 10) : 20;
    const command = positional[0];

    try {
      const diag = getShellDiagnostics();

      const history = diag.getExecutionHistory({
        limit,
        filter: command ? { command } : undefined,
      });

      diag.printExecutionHistory(history, { limit });

      // If --analyze flag is provided, show performance analysis
      if (flags.analyze || flags.a) {
        const report = diag.analyzePerformance({ topN: 5 });
        diag.printPerformanceReport(report);
      }

      return success(
        {
          total: history.length,
          showing: Math.min(limit, history.length),
        },
        `Execution history (${history.length} records)`,
      );
    } catch (err) {
      return error(createFailedMessage('get history', err));
    }
  },

  /**
   * Analyze performance over time
   */
  async performance(args: string[]): Promise<CommandResult> {
    const { flags } = parseFlags(args);
    const spinner = new Spinner('Analyzing performance...');

    try {
      const diag = getShellDiagnostics();
      spinner.start();

      // Parse time range
      let startTime: Date | undefined;
      let endTime: Date | undefined;

      if (flags.hours) {
        const hours = parseInt(flags.hours as string, 10);
        startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
      } else if (flags.days) {
        const days = parseInt(flags.days as string, 10);
        startTime = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      }

      const report = diag.analyzePerformance({
        startTime,
        endTime,
        topN: flags.top ? parseInt(flags.top as string, 10) : 10,
      });

      spinner.stop();
      diag.printPerformanceReport(report);

      return success(
        {
          totalExecutions: report.totalExecutions,
          successRate: `${report.successRate.toFixed(1)}%`,
          timeoutRate: `${report.timeoutRate.toFixed(1)}%`,
          avgExecutionTime: `${(report.executionTime.average / 1000).toFixed(2)}s`,
          recommendations: report.recommendations,
        },
        'Performance analysis complete',
      );
    } catch (err) {
      spinner.stop();
      return error(createFailedMessage('analyze performance', err));
    }
  },

  /**
   * Clear execution history
   */
  async clearHistory(): Promise<CommandResult> {
    try {
      const diag = getShellDiagnostics();
      const count = diag.clearHistory();
      return success({ cleared: count }, `Cleared ${count} execution records`);
    } catch (err) {
      return error(createFailedMessage('clear history', err));
    }
  },
};

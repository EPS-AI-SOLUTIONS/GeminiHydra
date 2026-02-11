/**
 * Startup Logger - Enhanced startup message formatting
 * Provides clean, consolidated startup information display
 *
 * By default, only errors are shown during startup.
 * Set VERBOSE_STARTUP=true to see all startup messages.
 */

import chalk from 'chalk';

// Check for verbose startup mode (quiet by default)
const isVerboseStartup = process.env.VERBOSE_STARTUP === 'true';

// ============================================================
// Types
// ============================================================

export interface StartupStatus {
  component: string;
  status: 'ok' | 'warning' | 'error' | 'pending';
  message?: string;
  details?: string;
}

export interface StartupSummary {
  version: string;
  components: StartupStatus[];
  mcpServers: { name: string; tools: number; status: string }[];
  warnings: string[];
  startTime: number;
}

// ============================================================
// Startup Logger Class
// ============================================================

class StartupLogger {
  private summary: StartupSummary;
  private startTime: number;
  private suppressSerenaLogs: boolean = true;

  constructor() {
    this.startTime = Date.now();
    this.summary = {
      version: '14.0',
      components: [],
      mcpServers: [],
      warnings: [],
      startTime: this.startTime,
    };
  }

  /**
   * Reset for new startup
   */
  reset(): void {
    this.startTime = Date.now();
    this.summary = {
      version: '14.0',
      components: [],
      mcpServers: [],
      warnings: [],
      startTime: this.startTime,
    };
  }

  /**
   * Add component status
   */
  addComponent(
    component: string,
    status: 'ok' | 'warning' | 'error' | 'pending',
    message?: string,
    details?: string,
  ): void {
    this.summary.components.push({ component, status, message, details });
  }

  /**
   * Add MCP server info
   */
  addMCPServer(name: string, tools: number, status: string): void {
    this.summary.mcpServers.push({ name, tools, status });
  }

  /**
   * Add warning (to be shown at end)
   */
  addWarning(warning: string): void {
    if (!this.summary.warnings.includes(warning)) {
      this.summary.warnings.push(warning);
    }
  }

  /**
   * Filter and format Serena logs for cleaner output
   */
  filterSerenaLog(logLine: string): string | null {
    // Skip verbose INFO lines
    if (logLine.includes('INFO') && this.suppressSerenaLogs) {
      // Keep only important messages
      const importantPatterns = [
        'Activating',
        'Project',
        'error',
        'Error',
        'WARNING',
        'failed',
        'Failed',
      ];

      if (!importantPatterns.some((p) => logLine.includes(p))) {
        return null; // Skip this log
      }
    }

    // Format WARNING lines
    if (logLine.includes('WARNING')) {
      const match = logLine.match(/WARNING.*?:\s*(.+)/);
      if (match) {
        this.addWarning(match[1]);
        return null; // We'll show warnings in summary
      }
    }

    // Extract timeout messages
    if (logLine.includes('Timeout waiting')) {
      this.addWarning('TypeScript LSP startup timeout (serwer działa, ale wolniej się uruchamia)');
      return null;
    }

    return logLine;
  }

  /**
   * Print startup banner (always shown)
   */
  printBanner(): void {
    console.log(
      chalk.magenta('\n╔═══════════════════════════════════════════════════════════════╗'),
    );
    console.log(
      chalk.magenta('║') +
        chalk.yellow.bold('      GEMINI HYDRA v14.0 - SCHOOL OF THE WOLF                  ') +
        chalk.magenta('║'),
    );
    console.log(
      chalk.magenta('║') +
        chalk.gray('   12 Agents | 5-Phase Protocol | Self-Healing | Full Node.js ') +
        chalk.magenta('║'),
    );
    console.log(chalk.magenta('╚═══════════════════════════════════════════════════════════════╝'));
  }

  /**
   * Print Windows warning (if applicable)
   */
  printWindowsWarning(): void {
    if (process.platform === 'win32') {
      console.log(chalk.yellow('\n⚠ WINDOWS: Jeśli prompt nie reaguje, wyłącz "Quick Edit Mode"'));
      console.log(
        chalk.gray('   PPM na pasek tytułowy CMD → Właściwości → Odznacz "Quick Edit Mode"'),
      );
      console.log(
        chalk.gray('   Zalecane: Windows Terminal (wt.exe) lub /stdin-fix w razie problemów'),
      );
    }
  }

  /**
   * Print consolidated startup summary (only in verbose mode or if errors)
   */
  printSummary(): void {
    const hasErrors =
      this.summary.components.some((c) => c.status === 'error') ||
      this.summary.mcpServers.some((s) => s.status === 'error');

    // In quiet mode, only show summary if there are errors
    if (!isVerboseStartup && !hasErrors) {
      return;
    }

    const elapsed = Date.now() - this.startTime;

    console.log(
      chalk.cyan('\n┌─────────────────────────────────────────────────────────────────┐'),
    );
    console.log(
      chalk.cyan('│') +
        chalk.white.bold('  STARTUP SUMMARY                                                ') +
        chalk.cyan('│'),
    );
    console.log(chalk.cyan('├─────────────────────────────────────────────────────────────────┤'));

    // Components
    for (const comp of this.summary.components) {
      const icon =
        comp.status === 'ok'
          ? chalk.green('✓')
          : comp.status === 'warning'
            ? chalk.yellow('⚠')
            : comp.status === 'error'
              ? chalk.red('✗')
              : chalk.gray('○');
      const name = comp.component.padEnd(20);
      const msg = comp.message || '';
      console.log(
        chalk.cyan('│') +
          `  ${icon} ${chalk.white(name)} ${chalk.gray(msg)}`.padEnd(71) +
          chalk.cyan('│'),
      );
    }

    // MCP Servers
    if (this.summary.mcpServers.length > 0) {
      console.log(
        chalk.cyan('├─────────────────────────────────────────────────────────────────┤'),
      );
      console.log(
        chalk.cyan('│') +
          chalk.white.bold('  MCP SERVERS                                                    ') +
          chalk.cyan('│'),
      );

      for (const server of this.summary.mcpServers) {
        const icon = server.status === 'connected' ? chalk.green('✓') : chalk.red('✗');
        const name = server.name.padEnd(15);
        const tools = `${server.tools} tools`.padEnd(10);
        console.log(
          chalk.cyan('│') +
            `  ${icon} ${chalk.white(name)} ${chalk.gray(tools)}`.padEnd(71) +
            chalk.cyan('│'),
        );
      }
    }

    // Warnings (if any)
    if (this.summary.warnings.length > 0) {
      console.log(
        chalk.cyan('├─────────────────────────────────────────────────────────────────┤'),
      );
      console.log(
        chalk.cyan('│') +
          chalk.yellow.bold('  UWAGI                                                          ') +
          chalk.cyan('│'),
      );

      for (const warning of this.summary.warnings) {
        const truncated = warning.length > 60 ? `${warning.substring(0, 57)}...` : warning;
        console.log(
          chalk.cyan('│') +
            `  ${chalk.yellow('•')} ${chalk.gray(truncated)}`.padEnd(71) +
            chalk.cyan('│'),
        );
      }
    }

    // Footer
    console.log(chalk.cyan('├─────────────────────────────────────────────────────────────────┤'));
    console.log(
      chalk.cyan('│') + chalk.gray(`  Startup time: ${elapsed}ms`).padEnd(65) + chalk.cyan('│'),
    );
    console.log(
      chalk.cyan('└─────────────────────────────────────────────────────────────────┘\n'),
    );
  }

  /**
   * Print quick status line (for minimal output)
   * Only shown in verbose mode or if there are errors
   */
  printQuickStatus(): void {
    const components = this.summary.components;
    const okCount = components.filter((c) => c.status === 'ok').length;
    const warnCount = components.filter((c) => c.status === 'warning').length;
    const errCount = components.filter((c) => c.status === 'error').length;

    // In quiet mode, only show if there are errors
    if (!isVerboseStartup && errCount === 0) {
      return;
    }

    const mcpTotal = this.summary.mcpServers.reduce((sum, s) => sum + s.tools, 0);
    const mcpConnected = this.summary.mcpServers.filter((s) => s.status === 'connected').length;

    console.log(
      chalk.gray(
        `[Startup] Components: ${chalk.green(`${okCount} OK`)}${warnCount > 0 ? chalk.yellow(`, ${warnCount} warn`) : ''}${errCount > 0 ? chalk.red(`, ${errCount} err`) : ''} | MCP: ${mcpConnected} servers, ${mcpTotal} tools`,
      ),
    );
  }

  /**
   * Create interceptor for console.log to filter Serena logs
   */
  createLogInterceptor(): () => void {
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args: unknown[]) => {
      const msg = args.map((a) => String(a)).join(' ');

      // Filter Serena verbose logs
      if (msg.includes('INFO') && msg.includes('serena')) {
        const filtered = this.filterSerenaLog(msg);
        if (filtered === null) return; // Skip
      }

      originalLog.apply(console, args);
    };

    console.error = (...args: unknown[]) => {
      const msg = args.map((a) => String(a)).join(' ');

      // Capture warnings
      if (msg.includes('WARNING')) {
        const filtered = this.filterSerenaLog(msg);
        if (filtered === null) return;
      }

      originalError.apply(console, args);
    };

    // Return restore function
    return () => {
      console.log = originalLog;
      console.error = originalError;
    };
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const startupLogger = new StartupLogger();

/**
 * Helper to log component status during startup
 * Only shows messages if VERBOSE_STARTUP=true or status is 'error'
 */
export function logStartupComponent(
  component: string,
  status: 'ok' | 'warning' | 'error' | 'pending',
  message?: string,
): void {
  startupLogger.addComponent(component, status, message);

  // In quiet mode, only show errors
  if (!isVerboseStartup && status !== 'error') {
    return;
  }

  const icon =
    status === 'ok'
      ? chalk.green('✓')
      : status === 'warning'
        ? chalk.yellow('⚠')
        : status === 'error'
          ? chalk.red('✗')
          : chalk.gray('○');

  console.log(`${icon} ${chalk.white(component)} ${message ? chalk.gray(message) : ''}`);
}

/**
 * Helper to log MCP server connection
 * Only shows in verbose mode or on error
 */
export function logMCPConnection(name: string, tools: number, status: 'connected' | 'error'): void {
  startupLogger.addMCPServer(name, tools, status);

  // In quiet mode, only show errors
  if (!isVerboseStartup && status !== 'error') {
    return;
  }
}

/**
 * LiveLogger - Real-time verbose logging system for GeminiHydra
 * Provides detailed live output of all operations
 */

import chalk from 'chalk';
import ora, { type Ora } from 'ora';

// ============================================================================
// Configuration
// ============================================================================

export interface LoggerConfig {
  verbose: boolean; // Show detailed logs
  showTokens: boolean; // Show token counts
  showTiming: boolean; // Show timing info
  showMemory: boolean; // Show memory usage
  showProgress: boolean; // Show progress bars
  showStreamContent: boolean; // Show actual streamed content
  maxStreamPreview: number; // Max chars to show in stream preview
  colorize: boolean; // Use colors
  quietStartup: boolean; // Hide INFO logs during startup (show only errors)
  /** #41: Enable structured JSON output mode alongside console output */
  jsonOutput: boolean;
  /** #41: JSON log buffer — flushed on summary() or manual flush */
  jsonLogFile?: string;
}

/** #41: Structured log entry for JSON output mode */
export interface StructuredLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: 'phase' | 'agent' | 'token' | 'stream' | 'api' | 'system';
  message: string;
  data?: Record<string, unknown>;
}

// Check for VERBOSE_STARTUP environment variable (quiet by default)
const isQuietStartup = process.env.VERBOSE_STARTUP !== 'true';

const DEFAULT_CONFIG: LoggerConfig = {
  verbose: true,
  showTokens: true,
  showTiming: true,
  showMemory: true,
  showProgress: true,
  showStreamContent: true,
  maxStreamPreview: 150,
  colorize: true,
  quietStartup: isQuietStartup, // Default: TRUE (quiet startup, only errors shown)
  jsonOutput: false,
};

// ============================================================================
// Live Logger Class
// ============================================================================

export class LiveLogger {
  private config: LoggerConfig;
  private startTime: number;
  private phaseTimers: Map<string, number> = new Map();
  private taskTimers: Map<string, number> = new Map();
  private spinners: Map<string, Ora> = new Map();
  private tokenCounts: Map<string, { input: number; output: number }> = new Map();
  private streamBuffers: Map<string, string> = new Map();
  /** #41: Structured JSON log buffer */
  private jsonLogBuffer: StructuredLogEntry[] = [];

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startTime = Date.now();
  }

  // ============================================================================
  // #41: Structured JSON Logging
  // ============================================================================

  /**
   * Record a structured log entry (always stored; emitted to console if jsonOutput enabled)
   */
  structuredLog(
    level: StructuredLogEntry['level'],
    category: StructuredLogEntry['category'],
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      ...(data ? { data } : {}),
    };
    this.jsonLogBuffer.push(entry);

    // Trim buffer to prevent memory leaks (keep last 500 entries)
    if (this.jsonLogBuffer.length > 500) {
      this.jsonLogBuffer.splice(0, this.jsonLogBuffer.length - 500);
    }

    // If JSON output mode is on, also print to stdout
    if (this.config.jsonOutput) {
      process.stdout.write(`${JSON.stringify(entry)}\n`);
    }
  }

  /** Get all buffered JSON log entries */
  getJsonLogs(): StructuredLogEntry[] {
    return [...this.jsonLogBuffer];
  }

  /** Clear the JSON log buffer */
  flushJsonLogs(): StructuredLogEntry[] {
    const logs = [...this.jsonLogBuffer];
    this.jsonLogBuffer = [];
    return logs;
  }

  /** Enable/disable JSON output mode at runtime */
  setJsonOutput(enabled: boolean): void {
    this.config.jsonOutput = enabled;
  }

  // ============================================================================
  // Formatting Helpers
  // ============================================================================

  private formatElapsed(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(0);
    return `${mins}m ${secs}s`;
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  private formatTokens(count: number): string {
    if (count < 1000) return `${count}`;
    return `${(count / 1000).toFixed(1)}K`;
  }

  private getTimestamp(): string {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  }

  private getMemoryUsage(): string {
    const used = process.memoryUsage();
    return `Heap: ${this.formatBytes(used.heapUsed)}/${this.formatBytes(used.heapTotal)}`;
  }

  // ============================================================================
  // Phase Logging
  // ============================================================================

  phaseStart(phase: string, description: string): void {
    this.phaseTimers.set(phase, Date.now());
    this.structuredLog('info', 'phase', `Phase ${phase} started: ${description}`, {
      phase,
      description,
    });

    const line = '═'.repeat(60);
    console.log('');
    console.log(chalk.cyan(line));
    console.log(chalk.cyan.bold(`  📍 PHASE ${phase}: ${description}`));
    console.log(chalk.cyan(line));

    if (this.config.showMemory) {
      console.log(chalk.gray(`  ${this.getTimestamp()} | ${this.getMemoryUsage()}`));
    }
    console.log('');
  }

  phaseEnd(phase: string, result?: { tasks?: number; success?: boolean; error?: string }): void {
    const elapsed = Date.now() - (this.phaseTimers.get(phase) || Date.now());
    this.phaseTimers.delete(phase);

    this.structuredLog(
      result?.success === false ? 'error' : 'info',
      'phase',
      `Phase ${phase} ${result?.success === false ? 'FAILED' : 'completed'}`,
      {
        phase,
        elapsedMs: elapsed,
        tasks: result?.tasks,
        success: result?.success !== false,
        error: result?.error,
      },
    );

    console.log('');
    if (result?.success === false) {
      console.log(chalk.red(`  ✗ Phase ${phase} FAILED: ${result.error || 'Unknown error'}`));
    } else {
      const taskInfo = result?.tasks ? ` | ${result.tasks} tasks` : '';
      console.log(
        chalk.green(`  ✓ Phase ${phase} complete in ${this.formatElapsed(elapsed)}${taskInfo}`),
      );
    }
    console.log('');
  }

  // ============================================================================
  // Agent Logging
  // ============================================================================

  agentStart(agent: string, task: string, model?: string): void {
    const key = `${agent}:${Date.now()}`;
    this.taskTimers.set(key, Date.now());

    this.structuredLog('info', 'agent', `Agent ${agent} started`, {
      agent,
      model,
      task: task.substring(0, 200),
    });

    const modelInfo = model ? chalk.gray(` [${model}]`) : '';
    const truncatedTask = task.length > 80 ? `${task.substring(0, 77)}...` : task;

    console.log(chalk.yellow(`  ▶ [${agent}]${modelInfo} Starting: ${truncatedTask}`));

    return;
  }

  agentThinking(agent: string, step: string): void {
    if (!this.config.verbose) return;
    console.log(chalk.gray(`    ⋯ [${agent}] ${step}`));
  }

  agentProgress(agent: string, current: number, total: number, detail?: string): void {
    if (!this.config.showProgress) return;

    const pct = Math.round((current / total) * 100);
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    const detailStr = detail ? ` - ${detail}` : '';

    process.stdout.write(chalk.gray(`\r    [${agent}] [${bar}] ${pct}%${detailStr}`.padEnd(80)));
  }

  agentStream(agent: string, chunk: string, tokenCount: number): void {
    // Update buffer
    const key = agent;
    const current = this.streamBuffers.get(key) || '';
    this.streamBuffers.set(key, current + chunk);

    // Update token count
    const tokens = this.tokenCounts.get(agent) || { input: 0, output: 0 };
    tokens.output = tokenCount;
    this.tokenCounts.set(agent, tokens);

    // Show progress
    if (this.config.showProgress) {
      const elapsed = this.formatElapsed(Date.now() - this.startTime);
      const preview = this.config.showStreamContent
        ? ` | "${chunk.substring(0, 30).replace(/\n/g, '↵')}..."`
        : '';

      process.stdout.write(
        chalk.gray(`\r    [${agent}] 🔄 ${tokenCount} tokens (${elapsed})${preview}`.padEnd(100)),
      );
    }
  }

  agentStreamEnd(agent: string): void {
    this.streamBuffers.delete(agent);
    process.stdout.write(`\r${' '.repeat(100)}\r`);
  }

  agentSuccess(agent: string, result: { chars?: number; tokens?: number; time?: number }): void {
    const timeStr = result.time ? ` in ${this.formatElapsed(result.time)}` : '';
    const charsStr = result.chars ? ` | ${result.chars} chars` : '';
    const tokensStr = result.tokens ? ` | ${this.formatTokens(result.tokens)} tokens` : '';

    console.log(chalk.green(`  ✓ [${agent}] Done${timeStr}${charsStr}${tokensStr}`));
  }

  agentError(agent: string, error: string, willRetry: boolean = false): void {
    const retryInfo = willRetry ? ' (will retry)' : '';
    console.log(chalk.red(`  ✗ [${agent}] Error: ${error.substring(0, 100)}${retryInfo}`));
  }

  agentRetry(agent: string, attempt: number, maxAttempts: number, reason: string): void {
    console.log(chalk.yellow(`  ↻ [${agent}] Retry ${attempt}/${maxAttempts}: ${reason}`));
  }

  agentFallback(agent: string, from: string, to: string): void {
    console.log(chalk.cyan(`  ⤵ [${agent}] Fallback: ${from} → ${to}`));
  }

  // ============================================================================
  // Task Logging
  // ============================================================================

  taskQueue(tasks: Array<{ id: number | string; agent: string; description: string }>): void {
    console.log(chalk.cyan(`\n  📋 Task Queue (${tasks.length} tasks):`));
    console.log(chalk.gray(`  ${'─'.repeat(56)}`));

    for (const task of tasks.slice(0, 10)) {
      const desc =
        task.description.length > 45 ? `${task.description.substring(0, 42)}...` : task.description;
      console.log(chalk.gray(`  │ #${task.id} [${task.agent}] ${desc}`));
    }

    if (tasks.length > 10) {
      console.log(chalk.gray(`  │ ... and ${tasks.length - 10} more`));
    }
    console.log(chalk.gray(`  ${'─'.repeat(56)}`));
    console.log('');
  }

  taskStart(taskId: number | string, agent: string, description: string): void {
    const key = `task:${taskId}`;
    this.taskTimers.set(key, Date.now());

    const desc = description.length > 60 ? `${description.substring(0, 57)}...` : description;
    console.log(chalk.yellow(`  ▷ Task #${taskId} [${agent}]: ${desc}`));
  }

  taskComplete(
    taskId: number | string,
    result: 'success' | 'error' | 'skipped',
    detail?: string,
  ): void {
    const key = `task:${taskId}`;
    const elapsed = Date.now() - (this.taskTimers.get(key) || Date.now());
    this.taskTimers.delete(key);

    const timeStr = this.formatElapsed(elapsed);
    const detailStr = detail ? ` - ${detail.substring(0, 50)}` : '';

    if (result === 'success') {
      console.log(chalk.green(`  ✓ Task #${taskId} done (${timeStr})${detailStr}`));
    } else if (result === 'error') {
      console.log(chalk.red(`  ✗ Task #${taskId} failed (${timeStr})${detailStr}`));
    } else {
      console.log(chalk.gray(`  ○ Task #${taskId} skipped${detailStr}`));
    }
  }

  // ============================================================================
  // Model/API Logging
  // ============================================================================

  apiCall(
    provider: 'ollama' | 'gemini',
    model: string,
    action: 'start' | 'end' | 'error',
    detail?: string,
  ): void {
    const icon = provider === 'ollama' ? '🦙' : '✨';
    const providerName = provider === 'ollama' ? 'Ollama' : 'Gemini';

    if (action === 'start') {
      console.log(chalk.cyan(`    ${icon} ${providerName} [${model}]: Starting request...`));
    } else if (action === 'end') {
      console.log(chalk.green(`    ${icon} ${providerName} [${model}]: ${detail || 'Complete'}`));
    } else {
      console.log(chalk.red(`    ${icon} ${providerName} [${model}]: Error - ${detail}`));
    }
  }

  tokenUsage(agent: string, input: number, output: number, cached?: number): void {
    if (!this.config.showTokens) return;

    const cachedStr = cached ? ` | Cached: ${this.formatTokens(cached)}` : '';
    console.log(
      chalk.gray(
        `    📊 [${agent}] Tokens: In ${this.formatTokens(input)} | Out ${this.formatTokens(output)}${cachedStr}`,
      ),
    );
  }

  // ============================================================================
  // MCP Logging
  // ============================================================================

  mcpCall(
    tool: string,
    action: 'start' | 'end' | 'error',
    params?: Record<string, unknown>,
    result?: unknown,
  ): void {
    if (action === 'start') {
      const paramsStr = params ? ` ${JSON.stringify(params).substring(0, 50)}...` : '';
      console.log(chalk.magenta(`    🔧 MCP [${tool}]: Calling${paramsStr}`));
    } else if (action === 'end') {
      const resultStr = result ? ` → ${String(result).substring(0, 50)}` : '';
      console.log(chalk.magenta(`    🔧 MCP [${tool}]: Done${resultStr}`));
    } else {
      console.log(chalk.red(`    🔧 MCP [${tool}]: Error`));
    }
  }

  // ============================================================================
  // System Logging
  // ============================================================================

  system(message: string, level: 'info' | 'warn' | 'error' | 'debug' = 'info'): void {
    const timestamp = this.config.showTiming ? `[${this.getTimestamp()}] ` : '';

    // In quiet startup mode, only show errors
    if (this.config.quietStartup && level !== 'error') {
      return;
    }

    switch (level) {
      case 'info':
        console.log(chalk.blue(`${timestamp}ℹ ${message}`));
        break;
      case 'warn':
        console.log(chalk.yellow(`${timestamp}⚠ ${message}`));
        break;
      case 'error':
        console.log(chalk.red(`${timestamp}✗ ${message}`));
        break;
      case 'debug':
        if (this.config.verbose) {
          console.log(chalk.gray(`${timestamp}🔍 ${message}`));
        }
        break;
    }
  }

  // ============================================================================
  // Summary
  // ============================================================================

  summary(stats: {
    totalTime: number;
    phases: number;
    tasks: { total: number; success: number; failed: number };
    tokens: { input: number; output: number };
    cost?: number;
  }): void {
    const line = '═'.repeat(60);
    console.log('');
    console.log(chalk.cyan(line));
    console.log(chalk.cyan.bold('  📊 EXECUTION SUMMARY'));
    console.log(chalk.cyan(line));
    console.log('');

    console.log(chalk.white(`  ⏱  Total Time:    ${this.formatElapsed(stats.totalTime)}`));
    console.log(chalk.white(`  📍 Phases:        ${stats.phases}`));
    console.log(
      chalk.white(
        `  📋 Tasks:         ${stats.tasks.total} (✓${stats.tasks.success} ✗${stats.tasks.failed})`,
      ),
    );

    if (this.config.showTokens) {
      console.log(
        chalk.white(
          `  📊 Tokens:        In ${this.formatTokens(stats.tokens.input)} | Out ${this.formatTokens(stats.tokens.output)}`,
        ),
      );
    }

    if (stats.cost !== undefined) {
      console.log(chalk.white(`  💰 Est. Cost:     $${stats.cost.toFixed(4)}`));
    }

    if (this.config.showMemory) {
      console.log(chalk.white(`  🧠 Memory:        ${this.getMemoryUsage()}`));
    }

    console.log('');
    console.log(chalk.cyan(line));
    console.log('');
  }

  // ============================================================================
  // Spinner Helpers
  // ============================================================================

  spin(id: string, text: string): Ora {
    const spinner = ora({ text, color: 'cyan' }).start();
    this.spinners.set(id, spinner);
    return spinner;
  }

  spinUpdate(id: string, text: string): void {
    const spinner = this.spinners.get(id);
    if (spinner) spinner.text = text;
  }

  spinSuccess(id: string, text?: string): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.succeed(text);
      this.spinners.delete(id);
    }
  }

  spinFail(id: string, text?: string): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.fail(text);
      this.spinners.delete(id);
    }
  }

  spinStop(id: string): void {
    const spinner = this.spinners.get(id);
    if (spinner) {
      spinner.stop();
      this.spinners.delete(id);
    }
  }

  // ============================================================================
  // Raw Output
  // ============================================================================

  raw(text: string): void {
    process.stdout.write(text);
  }

  newline(): void {
    console.log('');
  }

  divider(char: string = '─', length: number = 60): void {
    console.log(chalk.gray(char.repeat(length)));
  }

  setQuietStartup(enabled: boolean): void {
    this.config.quietStartup = enabled;
  }

  isQuietStartup(): boolean {
    return this.config.quietStartup;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let loggerInstance: LiveLogger | null = null;

export function getLogger(config?: Partial<LoggerConfig>): LiveLogger {
  if (!loggerInstance) {
    loggerInstance = new LiveLogger(config);
  }
  return loggerInstance;
}

export function setLoggerConfig(config: Partial<LoggerConfig>): void {
  loggerInstance = new LiveLogger(config);
}

/**
 * Enable quiet startup mode - only show errors during initialization
 */
export function enableQuietStartup(): void {
  if (loggerInstance) {
    loggerInstance.setQuietStartup(true);
  }
}

/**
 * Disable quiet startup mode - show all logs
 */
export function disableQuietStartup(): void {
  if (loggerInstance) {
    loggerInstance.setQuietStartup(false);
  }
}

/**
 * Check if quiet startup is enabled
 */
export function isQuietStartupEnabled(): boolean {
  return isQuietStartup || loggerInstance?.isQuietStartup() || false;
}

/**
 * Startup log - only shown if VERBOSE_STARTUP=true
 * Use this for initialization messages that should be hidden by default
 */
export function startupLog(
  message: string,
  type: 'info' | 'success' | 'warn' | 'error' = 'info',
): void {
  // Always show errors
  if (type === 'error') {
    console.log(chalk.red(`[Startup] ✗ ${message}`));
    return;
  }

  // Skip non-error logs in quiet mode
  if (isQuietStartupEnabled()) {
    return;
  }

  switch (type) {
    case 'success':
      console.log(chalk.green(`[Startup] ✓ ${message}`));
      break;
    case 'warn':
      console.log(chalk.yellow(`[Startup] ⚠ ${message}`));
      break;
    default:
      console.log(chalk.gray(`[Startup] ${message}`));
      break;
  }
}

// Global logger for convenience
export const logger = getLogger();

export default LiveLogger;

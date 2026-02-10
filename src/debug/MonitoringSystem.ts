/**
 * MonitoringSystem - Comprehensive monitoring and debugging
 * Features #41, #42, #43, #44, #45
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';

import { GEMINIHYDRA_DIR, LOGS_DIR } from '../config/paths.config.js';

const LOG_DIR = LOGS_DIR;
const REPLAY_DIR = path.join(GEMINIHYDRA_DIR, 'replays');

// ============================================================
// Feature #41: Detailed Logging
// ============================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'trace';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  duration?: number;
  taskId?: string;
  agentId?: string;
}

const LOG_COLORS: Record<LogLevel, (s: string) => string> = {
  debug: chalk.gray,
  info: chalk.blue,
  warn: chalk.yellow,
  error: chalk.red,
  trace: chalk.magenta
};

const LOG_SYMBOLS: Record<LogLevel, string> = {
  debug: '🔍',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
  trace: '📍'
};

export class Logger {
  private category: string;
  private minLevel: LogLevel;
  private entries: LogEntry[] = [];
  private fileHandle: fs.FileHandle | null = null;
  private consoleOutput: boolean;

  private static instance: Logger | null = null;
  private static levelOrder: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error'];

  constructor(options: {
    category?: string;
    minLevel?: LogLevel;
    consoleOutput?: boolean;
  } = {}) {
    this.category = options.category || 'default';
    this.minLevel = options.minLevel || 'info';
    this.consoleOutput = options.consoleOutput ?? true;
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger({ category: 'global' });
    }
    return Logger.instance;
  }

  async init(): Promise<void> {
    await fs.mkdir(LOG_DIR, { recursive: true });
    const logFile = path.join(LOG_DIR, `geminihydra-${new Date().toISOString().split('T')[0]}.log`);
    this.fileHandle = await fs.open(logFile, 'a');
  }

  private shouldLog(level: LogLevel): boolean {
    const currentIdx = Logger.levelOrder.indexOf(level);
    const minIdx = Logger.levelOrder.indexOf(this.minLevel);
    return currentIdx >= minIdx;
  }

  private formatEntry(entry: LogEntry): string {
    const time = entry.timestamp.split('T')[1].split('.')[0];
    const levelStr = entry.level.toUpperCase().padEnd(5);
    const cat = `[${entry.category}]`.padEnd(15);

    let line = `${time} ${levelStr} ${cat} ${entry.message}`;

    if (entry.taskId) {
      line += ` [task:${entry.taskId}]`;
    }
    if (entry.agentId) {
      line += ` [agent:${entry.agentId}]`;
    }
    if (entry.duration !== undefined) {
      line += ` (${entry.duration}ms)`;
    }

    return line;
  }

  private async writeEntry(entry: LogEntry): Promise<void> {
    this.entries.push(entry);

    // Keep only last 1000 entries in memory
    if (this.entries.length > 1000) {
      this.entries = this.entries.slice(-1000);
    }

    // Console output
    if (this.consoleOutput && this.shouldLog(entry.level)) {
      const color = LOG_COLORS[entry.level];
      const symbol = LOG_SYMBOLS[entry.level];
      console.log(color(`${symbol} ${this.formatEntry(entry)}`));

      if (entry.data && entry.level !== 'trace') {
        console.log(chalk.gray(JSON.stringify(entry.data, null, 2).substring(0, 500)));
      }
    }

    // File output
    if (this.fileHandle) {
      const jsonLine = JSON.stringify(entry) + '\n';
      await this.fileHandle.write(jsonLine);
    }
  }

  private log(level: LogLevel, message: string, data?: any, meta?: Partial<LogEntry>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category: this.category,
      message,
      data,
      ...meta
    };

    this.writeEntry(entry).catch(err => {
      console.error('Logger write error:', err);
    });
  }

  trace(message: string, data?: any, meta?: Partial<LogEntry>): void {
    this.log('trace', message, data, meta);
  }

  debug(message: string, data?: any, meta?: Partial<LogEntry>): void {
    this.log('debug', message, data, meta);
  }

  info(message: string, data?: any, meta?: Partial<LogEntry>): void {
    this.log('info', message, data, meta);
  }

  warn(message: string, data?: any, meta?: Partial<LogEntry>): void {
    this.log('warn', message, data, meta);
  }

  error(message: string, data?: any, meta?: Partial<LogEntry>): void {
    this.log('error', message, data, meta);
  }

  child(category: string): Logger {
    const child = new Logger({
      category: `${this.category}:${category}`,
      minLevel: this.minLevel,
      consoleOutput: this.consoleOutput
    });
    child.fileHandle = this.fileHandle;
    return child;
  }

  getEntries(options: { level?: LogLevel; limit?: number; taskId?: string } = {}): LogEntry[] {
    let filtered = [...this.entries];

    if (options.level) {
      const minIdx = Logger.levelOrder.indexOf(options.level);
      filtered = filtered.filter(e => Logger.levelOrder.indexOf(e.level) >= minIdx);
    }

    if (options.taskId) {
      filtered = filtered.filter(e => e.taskId === options.taskId);
    }

    if (options.limit) {
      filtered = filtered.slice(-options.limit);
    }

    return filtered;
  }

  async close(): Promise<void> {
    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = null;
    }
  }
}

export const logger = new Logger({ category: 'geminihydra' });

// ============================================================
// Feature #42: Performance Metrics Dashboard
// ============================================================

export interface MetricPoint {
  timestamp: number;
  value: number;
}

export interface Metric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  values: MetricPoint[];
  labels?: Record<string, string>;
}

export class MetricsDashboard {
  private metrics: Map<string, Metric> = new Map();
  private histogramBuckets = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

  /**
   * Increment a counter
   */
  inc(name: string, value: number = 1, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    let metric = this.metrics.get(key);

    if (!metric) {
      metric = { name, type: 'counter', values: [], labels };
      this.metrics.set(key, metric);
    }

    const lastValue = metric.values[metric.values.length - 1]?.value || 0;
    metric.values.push({ timestamp: Date.now(), value: lastValue + value });

    // Keep only last 1000 points
    if (metric.values.length > 1000) {
      metric.values = metric.values.slice(-1000);
    }
  }

  /**
   * Set a gauge value
   */
  set(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    let metric = this.metrics.get(key);

    if (!metric) {
      metric = { name, type: 'gauge', values: [], labels };
      this.metrics.set(key, metric);
    }

    metric.values.push({ timestamp: Date.now(), value });

    if (metric.values.length > 1000) {
      metric.values = metric.values.slice(-1000);
    }
  }

  /**
   * Record a histogram value (for timing)
   */
  observe(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    let metric = this.metrics.get(key);

    if (!metric) {
      metric = { name, type: 'histogram', values: [], labels };
      this.metrics.set(key, metric);
    }

    metric.values.push({ timestamp: Date.now(), value });

    if (metric.values.length > 1000) {
      metric.values = metric.values.slice(-1000);
    }
  }

  /**
   * Time a function
   */
  async time<T>(name: string, fn: () => Promise<T>, labels?: Record<string, string>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.observe(name, Date.now() - start, labels);
      return result;
    } catch (error) {
      this.observe(name, Date.now() - start, { ...labels, error: 'true' });
      throw error;
    }
  }

  private getKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(',');
    return `${name}{${labelStr}}`;
  }

  /**
   * Get metric statistics
   */
  getStats(name: string, labels?: Record<string, string>): {
    count: number;
    sum: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const key = this.getKey(name, labels);
    const metric = this.metrics.get(key);

    if (!metric || metric.values.length === 0) return null;

    const values = metric.values.map(p => p.value).sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count,
      sum,
      avg: sum / count,
      min: values[0],
      max: values[count - 1],
      p50: values[Math.floor(count * 0.5)],
      p95: values[Math.floor(count * 0.95)],
      p99: values[Math.floor(count * 0.99)]
    };
  }

  /**
   * Get all metrics summary
   */
  getSummary(): Record<string, any> {
    const summary: Record<string, any> = {};

    for (const [key, metric] of this.metrics) {
      const stats = this.getStats(metric.name, metric.labels);
      if (stats) {
        summary[key] = {
          type: metric.type,
          ...stats
        };
      }
    }

    return summary;
  }

  /**
   * Print dashboard to console
   */
  printDashboard(): void {
    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════'));
    console.log(chalk.cyan('              📊 METRICS DASHBOARD                       '));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════\n'));

    const summary = this.getSummary();

    for (const [key, data] of Object.entries(summary)) {
      console.log(chalk.white(`📈 ${key}`));
      console.log(chalk.gray(`   Type: ${data.type}`));
      console.log(chalk.gray(`   Count: ${data.count}`));

      if (data.type === 'histogram') {
        console.log(chalk.gray(`   Avg: ${data.avg.toFixed(2)}ms`));
        console.log(chalk.gray(`   P50: ${data.p50}ms | P95: ${data.p95}ms | P99: ${data.p99}ms`));
      } else if (data.type === 'counter') {
        console.log(chalk.gray(`   Total: ${data.sum}`));
      } else {
        console.log(chalk.gray(`   Current: ${data.max}`));
      }
      console.log('');
    }
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
  }
}

export const metrics = new MetricsDashboard();

// ============================================================
// Feature #43: Task Replay
// ============================================================

export interface ReplayEntry {
  timestamp: string;
  type: 'input' | 'plan' | 'task' | 'result' | 'synthesis';
  data: any;
}

export interface ReplaySession {
  id: string;
  startedAt: string;
  mission: string;
  entries: ReplayEntry[];
}

export class TaskReplay {
  private currentSession: ReplaySession | null = null;
  private sessions: Map<string, ReplaySession> = new Map();

  /**
   * Start recording a new session
   */
  startSession(mission: string): string {
    const id = `replay-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    this.currentSession = {
      id,
      startedAt: new Date().toISOString(),
      mission,
      entries: []
    };

    this.record('input', { mission });
    return id;
  }

  /**
   * Record an entry
   */
  record(type: ReplayEntry['type'], data: any): void {
    if (!this.currentSession) return;

    this.currentSession.entries.push({
      timestamp: new Date().toISOString(),
      type,
      data
    });
  }

  /**
   * End and save session
   */
  async endSession(): Promise<string | null> {
    if (!this.currentSession) return null;

    const session = this.currentSession;
    this.sessions.set(session.id, session);

    // Save to file
    await fs.mkdir(REPLAY_DIR, { recursive: true });
    const filePath = path.join(REPLAY_DIR, `${session.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));

    this.currentSession = null;
    return filePath;
  }

  /**
   * Load a session from file
   */
  async loadSession(idOrPath: string): Promise<ReplaySession | null> {
    try {
      let filePath = idOrPath;
      if (!idOrPath.endsWith('.json')) {
        filePath = path.join(REPLAY_DIR, `${idOrPath}.json`);
      }

      const content = await fs.readFile(filePath, 'utf-8');
      const session = JSON.parse(content) as ReplaySession;
      this.sessions.set(session.id, session);
      return session;
    } catch {
      return null;
    }
  }

  /**
   * List available replays
   */
  async listReplays(): Promise<Array<{ id: string; mission: string; date: string }>> {
    try {
      await fs.mkdir(REPLAY_DIR, { recursive: true });
      const files = await fs.readdir(REPLAY_DIR);
      const replays: Array<{ id: string; mission: string; date: string }> = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(path.join(REPLAY_DIR, file), 'utf-8');
            const session = JSON.parse(content) as ReplaySession;
            replays.push({
              id: session.id,
              mission: session.mission.substring(0, 50),
              date: session.startedAt.split('T')[0]
            });
          } catch {
            // Skip invalid files
          }
        }
      }

      return replays.sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      return [];
    }
  }

  /**
   * Replay a session step by step
   */
  async *replaySteps(sessionId: string): AsyncGenerator<ReplayEntry> {
    const session = this.sessions.get(sessionId) || await this.loadSession(sessionId);
    if (!session) return;

    for (const entry of session.entries) {
      yield entry;
    }
  }

  /**
   * Print replay summary
   */
  async printReplaySummary(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId) || await this.loadSession(sessionId);
    if (!session) {
      console.log(chalk.red('Session not found'));
      return;
    }

    console.log(chalk.cyan(`\n═══ Replay: ${session.id} ═══\n`));
    console.log(chalk.white(`Mission: ${session.mission}`));
    console.log(chalk.gray(`Started: ${session.startedAt}`));
    console.log(chalk.gray(`Entries: ${session.entries.length}`));
    console.log('');

    const typeCounts: Record<string, number> = {};
    for (const entry of session.entries) {
      typeCounts[entry.type] = (typeCounts[entry.type] || 0) + 1;
    }

    console.log(chalk.white('Entry breakdown:'));
    for (const [type, count] of Object.entries(typeCounts)) {
      console.log(chalk.gray(`  ${type}: ${count}`));
    }
  }
}

export const taskReplay = new TaskReplay();

// ============================================================
// Feature #44: Dry Run Mode
// ============================================================

export interface DryRunResult {
  wouldExecute: Array<{
    taskId: number;
    agent: string;
    task: string;
    estimatedTokens: number;
    mcpTools?: string[];
  }>;
  totalEstimatedTokens: number;
  estimatedCost: number;
  warnings: string[];
}

export class DryRunMode {
  private enabled = false;
  private results: DryRunResult = {
    wouldExecute: [],
    totalEstimatedTokens: 0,
    estimatedCost: 0,
    warnings: []
  };

  // Token cost per 1K tokens (Gemini 3 pricing)
  private static COST_PER_1K = {
    'gemini-3-pro-preview': 0.0025,
    'gemini-3-pro': 0.0025,
    'gemini-3-flash-preview': 0.0005,
    'gemini-3-flash': 0.0005,
    'local': 0
  };

  enable(): void {
    this.enabled = true;
    this.results = {
      wouldExecute: [],
      totalEstimatedTokens: 0,
      estimatedCost: 0,
      warnings: []
    };
  }

  disable(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Record a task that would be executed
   */
  recordTask(task: {
    taskId: number;
    agent: string;
    task: string;
    model?: string;
    mcpTools?: string[];
  }): void {
    if (!this.enabled) return;

    // Estimate tokens based on task length
    const estimatedTokens = Math.ceil(task.task.length / 4) * 3; // Input + expected output

    this.results.wouldExecute.push({
      taskId: task.taskId,
      agent: task.agent,
      task: task.task,
      estimatedTokens,
      mcpTools: task.mcpTools
    });

    this.results.totalEstimatedTokens += estimatedTokens;

    // Calculate cost
    const model = task.model || 'gemini-3-pro-preview';
    const costPer1K = DryRunMode.COST_PER_1K[model as keyof typeof DryRunMode.COST_PER_1K] || 0.001;
    this.results.estimatedCost += (estimatedTokens / 1000) * costPer1K;

    // Check for warnings
    if (estimatedTokens > 10000) {
      this.results.warnings.push(`Task ${task.taskId} may use a lot of tokens (${estimatedTokens})`);
    }

    if (task.mcpTools?.some(t => t.includes('write') || t.includes('delete'))) {
      this.results.warnings.push(`Task ${task.taskId} uses destructive MCP tools: ${task.mcpTools.join(', ')}`);
    }
  }

  /**
   * Get dry run results
   */
  getResults(): DryRunResult {
    return { ...this.results };
  }

  /**
   * Print dry run report
   */
  printReport(): void {
    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════'));
    console.log(chalk.cyan('              🧪 DRY RUN REPORT                          '));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════\n'));

    console.log(chalk.white(`Tasks to execute: ${this.results.wouldExecute.length}`));
    console.log(chalk.white(`Estimated tokens: ${this.results.totalEstimatedTokens.toLocaleString()}`));
    console.log(chalk.white(`Estimated cost: $${this.results.estimatedCost.toFixed(4)}`));
    console.log('');

    console.log(chalk.white('Task breakdown:'));
    for (const task of this.results.wouldExecute) {
      console.log(chalk.gray(`  #${task.taskId} [${task.agent}]: ${task.task.substring(0, 60)}...`));
      console.log(chalk.gray(`     Tokens: ~${task.estimatedTokens}`));
      if (task.mcpTools?.length) {
        console.log(chalk.gray(`     MCP: ${task.mcpTools.join(', ')}`));
      }
    }

    if (this.results.warnings.length > 0) {
      console.log('');
      console.log(chalk.yellow('⚠️  Warnings:'));
      for (const warning of this.results.warnings) {
        console.log(chalk.yellow(`  • ${warning}`));
      }
    }

    console.log('');
  }
}

export const dryRun = new DryRunMode();

// ============================================================
// Feature #45: Agent Trace
// ============================================================

export interface TraceSpan {
  id: string;
  parentId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'running' | 'success' | 'error';
  attributes: Record<string, any>;
  events: Array<{ timestamp: number; name: string; data?: any }>;
}

export class AgentTrace {
  private spans: Map<string, TraceSpan> = new Map();
  private activeSpan: TraceSpan | null = null;

  /**
   * Start a new trace span
   */
  startSpan(name: string, attributes: Record<string, any> = {}): string {
    const id = `span-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const span: TraceSpan = {
      id,
      parentId: this.activeSpan?.id,
      name,
      startTime: Date.now(),
      status: 'running',
      attributes,
      events: []
    };

    this.spans.set(id, span);
    this.activeSpan = span;

    return id;
  }

  /**
   * Add event to current span
   */
  addEvent(name: string, data?: any): void {
    if (!this.activeSpan) return;

    this.activeSpan.events.push({
      timestamp: Date.now(),
      name,
      data
    });
  }

  /**
   * Set attribute on current span
   */
  setAttribute(key: string, value: any): void {
    if (!this.activeSpan) return;
    this.activeSpan.attributes[key] = value;
  }

  /**
   * End current span
   */
  endSpan(status: 'success' | 'error' = 'success'): void {
    if (!this.activeSpan) return;

    this.activeSpan.endTime = Date.now();
    this.activeSpan.duration = this.activeSpan.endTime - this.activeSpan.startTime;
    this.activeSpan.status = status;

    // Move to parent span
    if (this.activeSpan.parentId) {
      this.activeSpan = this.spans.get(this.activeSpan.parentId) || null;
    } else {
      this.activeSpan = null;
    }
  }

  /**
   * Get span by ID
   */
  getSpan(id: string): TraceSpan | undefined {
    return this.spans.get(id);
  }

  /**
   * Get all spans
   */
  getAllSpans(): TraceSpan[] {
    return Array.from(this.spans.values());
  }

  /**
   * Build trace tree
   */
  getTraceTree(): any {
    const roots: any[] = [];
    const spanMap = new Map<string, any>();

    // First pass: convert to tree nodes
    for (const span of this.spans.values()) {
      spanMap.set(span.id, { ...span, children: [] });
    }

    // Second pass: build tree
    for (const node of spanMap.values()) {
      if (node.parentId && spanMap.has(node.parentId)) {
        spanMap.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * Print trace timeline
   */
  printTrace(): void {
    console.log(chalk.cyan('\n═══════════════════════════════════════════════════════'));
    console.log(chalk.cyan('              🔍 AGENT TRACE                             '));
    console.log(chalk.cyan('═══════════════════════════════════════════════════════\n'));

    const tree = this.getTraceTree();
    this.printSpanTree(tree, 0);
  }

  private printSpanTree(nodes: any[], depth: number): void {
    for (const node of nodes) {
      const indent = '  '.repeat(depth);
      const statusIcon = node.status === 'success' ? '✓' : node.status === 'error' ? '✗' : '⋯';
      const statusColor = node.status === 'success' ? chalk.green : node.status === 'error' ? chalk.red : chalk.yellow;

      console.log(`${indent}${statusColor(statusIcon)} ${node.name} ${chalk.gray(`(${node.duration || '...'}ms)`)}`);

      // Print important attributes
      for (const [key, value] of Object.entries(node.attributes)) {
        if (key === 'agent' || key === 'task' || key === 'model') {
          console.log(chalk.gray(`${indent}  ${key}: ${String(value).substring(0, 50)}`));
        }
      }

      // Print events
      for (const event of node.events) {
        console.log(chalk.gray(`${indent}  • ${event.name}`));
      }

      // Recurse
      if (node.children.length > 0) {
        this.printSpanTree(node.children, depth + 1);
      }
    }
  }

  /**
   * Clear all spans
   */
  clear(): void {
    this.spans.clear();
    this.activeSpan = null;
  }

  /**
   * Export trace as JSON
   */
  toJSON(): string {
    return JSON.stringify({
      spans: Array.from(this.spans.values()),
      tree: this.getTraceTree()
    }, null, 2);
  }
}

export const agentTrace = new AgentTrace();

// ============================================================
// Export all
// ============================================================

export default {
  Logger,
  logger,
  MetricsDashboard,
  metrics,
  TaskReplay,
  taskReplay,
  DryRunMode,
  dryRun,
  AgentTrace,
  agentTrace
};

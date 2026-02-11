/**
 * GraphProcessor - Advanced task executor with dependency resolution
 * Ported from AgentSwarm.psm1 lines 503-694
 *
 * Features:
 * - Topological sorting of tasks by dependencies
 * - Parallel execution with concurrency control
 * - EXEC protocol support (silent shell execution)
 * - Retry logic with exponential backoff
 * - MCP tool integration
 */

import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import chalk from 'chalk';
import pLimit from 'p-limit';
import { mcpManager } from '../mcp/index.js';
import { NativeFileSystem } from '../native/nativefilesystem/NativeFileSystem.js';
import {
  type AgentRole,
  type ExecutionResult,
  resolveAgentRoleSafe,
  type SwarmTask,
} from '../types/index.js';

// Anti-hallucination solutions (Solutions 27-29)
// DISABLED: TaskScopeLimiter removed - causes false positives
// import { taskScopeLimiter } from './TaskScopeLimiter.js';
import { getAgentMemoryIsolation } from './AgentMemoryIsolation.js';
import { AGENT_PERSONAS, Agent } from './agent/Agent.js';
import { AggregateHydraError, getErrorMessage } from './errors.js';
import { factualGroundingChecker } from './FactualGrounding.js';
import { logger } from './LiveLogger.js';
import { loadGrimoires } from './PromptSystem.js';
import { sanitizer } from './SecuritySystem.js';
import { withRetry } from './TrafficControl.js';

const execAsync = promisify(exec);

/**
 * Configuration for GraphProcessor
 */
export interface GraphProcessorConfig {
  yolo?: boolean; // High concurrency mode
  maxConcurrency?: number; // Override concurrency
  taskTimeout?: number; // Timeout per task (ms)
  maxRetries?: number; // Retry attempts
  silentExec?: boolean; // Silent EXEC mode
  enableMcp?: boolean; // MCP tool support
  preferredModel?: string; // Override model for execution (from PRE-A classification)
  rootDir?: string; // Project root directory for path validation
  forceOllama?: boolean; // Force all agents to use Ollama (Phase B optimization)
  ollamaModel?: string; // Specific Ollama model for forceOllama mode
}

const DEFAULT_CONFIG: GraphProcessorConfig = {
  yolo: false,
  maxConcurrency: undefined,
  taskTimeout: 300000, // BUG-005 FIX: 5 minutes for Ollama parallel execution (was 3 min)
  maxRetries: 2, // 2 retries (reduced from 3)
  silentExec: true,
  enableMcp: true,
  preferredModel: undefined,
  rootDir: process.cwd(), // Default to current working directory
  forceOllama: false, // Default: respect agent personas
  ollamaModel: 'qwen3:4b', // Default model when forceOllama is true (Qwen3)
};

/**
 * Extended task with grimoires and MCP
 */
interface ExtendedTask extends SwarmTask {
  grimoires?: string[];
  mcpTool?: string;
}

/**
 * Detailed Task Specification for Phase B agents
 * Contains all context needed for task execution
 */
interface DetailedTaskSpec {
  // Task identification
  taskId: number;
  agent: AgentRole;
  agentDescription: string;

  // Task description
  taskDescription: string;
  taskType:
    | 'code_write'
    | 'code_read'
    | 'code_modify'
    | 'analysis'
    | 'test'
    | 'build'
    | 'documentation'
    | 'other';

  // File context
  projectRoot: string;
  targetFiles: {
    path: string;
    operation: 'read' | 'write' | 'modify' | 'create' | 'delete';
    description: string;
  }[];

  // Expected output
  expectedOutput: {
    format: 'code' | 'json' | 'text' | 'list' | 'structured';
    description: string;
    example?: string;
  };

  // Dependencies context
  dependencies: {
    taskId: number;
    agent: string;
    summary: string;
    relevantData?: string;
  }[];

  // Available tools
  availableTools: string[];

  // Constraints
  constraints: {
    timeout: number;
    maxRetries: number;
    mustUseNativeFs: boolean;
  };
}

/**
 * GraphProcessor - Executes tasks respecting dependencies
 * Now with DYNAMIC CONTEXT INJECTION - results from previous tasks are passed to dependent tasks
 */
export class GraphProcessor {
  private config: GraphProcessorConfig;
  private limit: ReturnType<typeof pLimit>;
  private completedTasks: Map<number, boolean> = new Map();
  private results: Map<number, ExecutionResult> = new Map();
  private taskOutputs: Map<number, string> = new Map(); // Store outputs for context injection
  private rootDir: string; // Project root directory for path validation

  // NAPRAWKA: Cache odczytanych plików - żeby nie czytać tego samego pliku wielokrotnie
  private fileCache: Map<string, { content: string; timestamp: number }> = new Map();
  private readonly FILE_CACHE_TTL = 60000; // 1 minuta

  constructor(config: GraphProcessorConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Set root directory - CRITICAL for path validation
    this.rootDir = path.resolve(this.config.rootDir || process.cwd());

    // Security warning if using default cwd
    if (!config.rootDir) {
      console.warn(
        chalk.yellow(
          '[SECURITY] No rootDir specified, using process.cwd(). ' +
            'Specify rootDir explicitly for better security.',
        ),
      );
    }

    // Determine concurrency
    const concurrency = this.config.maxConcurrency ?? (this.config.yolo ? 12 : 6);

    this.limit = pLimit(concurrency);

    logger.system(
      `GraphProcessor initialized: Concurrency ${concurrency} ${this.config.yolo ? '(YOLO)' : ''}`,
      'info',
    );
    logger.system(`Root directory: ${this.rootDir}`, 'debug');
    if (this.config.forceOllama) {
      logger.system(`🦙 Force Ollama mode: ${this.config.ollamaModel || 'qwen3:4b'}`, 'info');
    }
  }

  /**
   * Read file with caching - prevents reading same file multiple times
   */
  private async readFileWithCache(filePath: string): Promise<string | null> {
    const now = Date.now();

    // Check cache
    const cached = this.fileCache.get(filePath);
    if (cached && now - cached.timestamp < this.FILE_CACHE_TTL) {
      console.log(chalk.gray(`│ [Cache] ✓ Hit: ${path.basename(filePath)}`));
      return cached.content;
    }

    // Read from disk
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      this.fileCache.set(filePath, { content, timestamp: now });
      console.log(
        chalk.gray(`│ [Cache] Miss: ${path.basename(filePath)} (${content.length} chars)`),
      );
      return content;
    } catch (error: unknown) {
      console.log(chalk.yellow(`│ [Cache] Error reading ${filePath}: ${getErrorMessage(error)}`));
      return null;
    }
  }

  /**
   * Clear file cache (call after writes)
   */
  private clearFileCache(filePath?: string): void {
    if (filePath) {
      this.fileCache.delete(filePath);
    } else {
      this.fileCache.clear();
    }
  }

  /**
   * Validate and normalize file path to be within project root
   * Returns null if path is invalid/outside project
   * Returns the input unchanged if it's a URL (no validation needed for URLs)
   */
  private validateAndNormalizePath(inputPath: string): string | null {
    if (!inputPath || typeof inputPath !== 'string') {
      console.log(chalk.red(`│ [PATH] Invalid path: ${inputPath}`));
      return null;
    }

    // NAPRAWKA: Usuń nawiasy i inne artefakty z końca ścieżki (AI hallucinations)
    // Przykłady: "path/file.ts)" lub "path/file.ts (new file)" lub "C:\path)"
    let cleanPath = inputPath.trim();
    cleanPath = cleanPath.replace(/\s*\([^)]*\)\s*$/, ''); // Remove "(something)" at end
    cleanPath = cleanPath.replace(/\)\s*$/, ''); // Remove trailing ")"
    cleanPath = cleanPath.replace(/\(\s*$/, ''); // Remove trailing "("
    cleanPath = cleanPath.trim();

    // Skip validation for URLs and external resources - they don't need local path checking
    if (this.isUrlOrExternalResource(cleanPath)) {
      console.log(
        chalk.gray(
          `│ [PATH] URL/external resource detected, skipping path validation: ${cleanPath}`,
        ),
      );
      return cleanPath; // Return URL as-is
    }

    // Sanitize path first
    const sanitized = sanitizer.sanitizePath(cleanPath);
    if (sanitized.blocked) {
      console.log(chalk.red(`│ [PATH] Blocked: ${sanitized.blockedReason}`));
      return null;
    }

    let resolvedPath: string;

    // Handle relative paths - resolve against rootDir
    if (!path.isAbsolute(cleanPath)) {
      resolvedPath = path.resolve(this.rootDir, cleanPath);
    } else {
      resolvedPath = path.resolve(cleanPath);
    }

    // Normalize path separators for comparison
    const normalizedRoot = this.rootDir.toLowerCase().replace(/\\/g, '/');
    const normalizedPath = resolvedPath.toLowerCase().replace(/\\/g, '/');

    // Check if path is within project root
    if (!normalizedPath.startsWith(normalizedRoot)) {
      console.log(chalk.red(`│ [PATH] Outside project: ${resolvedPath}`));
      console.log(chalk.red(`│ [PATH] Must be within: ${this.rootDir}`));
      return null;
    }

    return resolvedPath;
  }

  /**
   * Check if a path/URL should skip path validation (URLs, external resources)
   */
  private isUrlOrExternalResource(input: string): boolean {
    if (!input || typeof input !== 'string') return false;

    // URL patterns - these should skip local path validation
    const urlPatterns = [
      /^https?:\/\//i, // http:// or https://
      /^ftp:\/\//i, // ftp://
      /^file:\/\//i, // file://
      /^localhost(:\d+)?/i, // localhost or localhost:port
      /^127\.0\.0\.1(:\d+)?/i, // 127.0.0.1 or 127.0.0.1:port
      /^0\.0\.0\.0(:\d+)?/i, // 0.0.0.0 or 0.0.0.0:port
      /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/, // Any IP address
      /^[a-z0-9-]+\.([a-z]{2,})/i, // Domain names like example.com
    ];

    return urlPatterns.some((pattern) => pattern.test(input));
  }

  /**
   * Check if MCP result indicates an error
   * IMPROVED: Avoids false positives from valid JSON responses
   */
  private isMcpError(content: string): boolean {
    // If content looks like valid JSON data (files, entities, etc.), it's NOT an error
    // These patterns indicate successful responses that should NOT be flagged as errors
    const successPatterns = [
      /^\s*\{\s*"files"\s*:/i, // {"files": [...]} - file listing
      /^\s*\{\s*"entities"\s*:/i, // {"entities": [...]} - memory response
      /^\s*\{\s*"relations"\s*:/i, // {"relations": [...]} - graph response
      /^\s*\{\s*"results"\s*:/i, // {"results": [...]} - search results
      /^\s*\{\s*"content"\s*:/i, // {"content": ...} - file content
      /^\s*\{\s*"success"\s*:\s*true/i, // {"success": true, ...}
      /^\s*\[\s*\{/, // [{...}] - array of objects (valid data)
    ];

    if (successPatterns.some((pattern) => pattern.test(content))) {
      return false; // This is valid data, not an error
    }

    // Only flag as error if there are EXPLICIT error indicators
    // These are actual error messages, not incidental words in content
    const errorPatterns = [
      /^error:/i, // Starts with "error:"
      /^Error:/, // Starts with "Error:" (case sensitive)
      /MCP error/i, // Explicit MCP error
      /ENOENT/i, // File not found error code
      /EACCES/i, // Permission denied error code
      /EPERM/i, // Permission error code
      /permission denied/i, // Explicit permission denied
      /access denied/i, // Explicit access denied
      /outside allowed/i, // Path outside allowed directories
      /Invalid arguments for/i, // MCP validation error
      /Input validation error/i, // MCP input validation error
      /failed to connect/i, // Connection failure
      /connection refused/i, // Connection refused
      /timeout/i, // Timeout errors
    ];

    return errorPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Process all tasks in dependency order
   */
  async process(tasks: ExtendedTask[]): Promise<ExecutionResult[]> {
    logger.phaseStart('B', `EXECUTION (${tasks.length} tasks)`);

    // Show task queue
    logger.taskQueue(
      tasks.map((t) => ({
        id: t.id,
        agent: t.agent,
        description: t.task,
      })),
    );

    // Reset state
    this.completedTasks.clear();
    this.results.clear();
    this.taskOutputs.clear();

    // Fix self-dependencies (PS1 lines 519-530)
    for (const task of tasks) {
      task.dependencies = task.dependencies.filter((d) => d !== task.id);
    }

    let remaining = [...tasks];
    let loopGuard = 0;
    let totalSuccess = 0;
    let totalFailed = 0;
    const maxIterations = 100;
    const processStart = Date.now();

    while (remaining.length > 0 && loopGuard < maxIterations) {
      loopGuard++;

      // Find executable tasks (all dependencies completed)
      const executable = remaining.filter((task) =>
        task.dependencies.every((depId) => this.completedTasks.has(depId)),
      );

      // Deadlock detection
      if (executable.length === 0 && remaining.length > 0) {
        logger.system(`Deadlock detected! ${remaining.length} tasks stuck`, 'warn');
        logger.system(`Stuck tasks: ${remaining.map((t) => `#${t.id}`).join(', ')}`, 'debug');

        // Force clear dependencies to recover (PS1 behavior)
        remaining.forEach((t) => {
          logger.system(`Clearing deps for task #${t.id}`, 'debug');
          t.dependencies = [];
        });
        continue;
      }

      // Show batch info
      if (executable.length > 1) {
        logger.system(`Executing batch: ${executable.length} parallel tasks`, 'info');
      }

      // Execute batch in parallel - with context from dependencies
      const promises = executable.map((task) => {
        // Collect outputs from dependency tasks for DYNAMIC CONTEXT INJECTION
        const dependencyContext = this.buildDependencyContext(task.dependencies);
        return this.limit(() => this.executeTask(task, dependencyContext));
      });

      const batchResults = await Promise.allSettled(promises);

      // Process results
      for (let i = 0; i < batchResults.length; i++) {
        const task = executable[i];
        const result = batchResults[i];

        let execResult: ExecutionResult;

        if (result.status === 'fulfilled') {
          execResult = result.value;
        } else {
          execResult = {
            id: task.id,
            success: false,
            error: result.reason?.message || 'Unknown error',
            logs: [`EXECUTION FAILED: ${result.reason?.message}`],
          };
        }

        this.results.set(task.id, execResult);
        this.completedTasks.set(task.id, execResult.success);

        // Store output for dynamic context injection to dependent tasks
        if (execResult.success && execResult.logs && execResult.logs[0]) {
          this.taskOutputs.set(task.id, execResult.logs[0]);
          totalSuccess++;
        } else {
          totalFailed++;
        }

        // Remove from remaining
        remaining = remaining.filter((t) => t.id !== task.id);

        // Log completion with progress
        const completed = tasks.length - remaining.length;
        const pct = Math.round((completed / tasks.length) * 100);
        const detail = `${completed}/${tasks.length} (${pct}%)`;

        if (!execResult.success) {
          logger.taskComplete(task.id, 'error', execResult.error);
        } else {
          logger.taskComplete(task.id, 'success', detail);
        }
      }
    }

    if (loopGuard >= maxIterations) {
      logger.system('Max iterations reached!', 'error');
    }

    // Phase summary
    const elapsed = Date.now() - processStart;
    logger.phaseEnd('B', {
      tasks: tasks.length,
      success: totalFailed === 0,
    });
    logger.system(
      `Phase B complete: ${totalSuccess} success, ${totalFailed} failed in ${(elapsed / 1000).toFixed(1)}s`,
      'info',
    );

    // (#25) Aggregate errors for failed tasks - enables Phase C healing with full context
    if (totalFailed > 0) {
      const failedErrors = Array.from(this.results.values())
        .filter((r) => !r.success)
        .map((r) => new Error(`Task ${r.id}: ${r.error || 'Unknown failure'}`));

      const aggregate = new AggregateHydraError(
        `Phase B: ${totalFailed}/${tasks.length} tasks failed`,
        failedErrors,
        {
          context: {
            totalTasks: tasks.length,
            succeeded: totalSuccess,
            failed: totalFailed,
            durationMs: elapsed,
          },
          recoverable: true,
          retryable: totalFailed < tasks.length, // partial failures are retryable
        },
      );
      // Log but don't throw - Phase C will handle healing
      logger.system(
        `[AggregateError] ${aggregate.message} (${aggregate.errors.length} errors aggregated)`,
        'warn',
      );
    }

    return Array.from(this.results.values());
  }

  /**
   * Build context from dependency task outputs (DYNAMIC CONTEXT INJECTION)
   */
  private buildDependencyContext(dependencies: number[]): string {
    if (dependencies.length === 0) return '';

    const contexts: string[] = [];
    for (const depId of dependencies) {
      const output = this.taskOutputs.get(depId);
      if (output) {
        // Truncate long outputs to prevent context overflow
        const truncated =
          output.length > 2000 ? `${output.substring(0, 2000)}\n... (skrócono)` : output;
        contexts.push(`=== WYNIK ZADANIA #${depId} ===\n${truncated}`);
      }
    }

    if (contexts.length === 0) return '';

    return `\n📋 KONTEKST Z POPRZEDNICH ZADAŃ:\n${contexts.join('\n\n')}`;
  }

  /**
   * Execute a single task
   */
  private async executeTask(
    task: ExtendedTask,
    dependencyContext: string = '',
  ): Promise<ExecutionResult> {
    // Enhanced task start logging
    logger.taskStart(task.id, task.agent, task.task);
    if (task.dependencies.length > 0) {
      logger.agentThinking(task.agent, `Dependencies: ${task.dependencies.join(', ')}`);
    }

    const _spinner = logger.spin(
      `task-${task.id}`,
      `[${task.agent}] Executing task #${task.id}...`,
    );
    const startTime = Date.now();

    try {
      const result = await withRetry(() => this.executeTaskInner(task, dependencyContext), {
        maxRetries: this.config.maxRetries,
        baseDelay: 1000,
        onRetry: (attempt, error) => {
          logger.spinUpdate(`task-${task.id}`, `[${task.agent}] Retry ${attempt}...`);
          logger.agentRetry(task.agent, attempt, this.config.maxRetries || 2, error.message);
        },
      });

      const duration = Date.now() - startTime;

      // Check if task actually succeeded
      if (result.success) {
        logger.spinSuccess(`task-${task.id}`, `[${task.agent}] Task #${task.id} complete`);
        logger.agentSuccess(task.agent, {
          chars: result.logs?.[0]?.length || 0,
          time: duration,
        });

        // Show result preview
        if (result.logs?.[0]) {
          const preview = result.logs[0].substring(0, 150).replace(/\n/g, ' ');
          logger.agentThinking(
            task.agent,
            `Result: ${preview}${result.logs[0].length > 150 ? '...' : ''}`,
          );
        }
      } else {
        logger.spinFail(`task-${task.id}`, `[${task.agent}] Task #${task.id} failed`);
        logger.agentError(task.agent, result.error || 'Unknown error', false);
      }

      return result;
    } catch (error: unknown) {
      const _duration = Date.now() - startTime;
      logger.spinFail(`task-${task.id}`, `[${task.agent}] Task #${task.id} failed`);
      logger.agentError(task.agent, getErrorMessage(error), false);
      console.log(chalk.cyan(`└${'─'.repeat(50)}`));

      return {
        id: task.id,
        success: false,
        error: getErrorMessage(error),
        logs: [`FAILED: ${getErrorMessage(error)}`],
      };
    }
  }

  /**
   * Inner task execution logic
   */
  private async executeTaskInner(
    task: ExtendedTask,
    dependencyContext: string = '',
  ): Promise<ExecutionResult> {
    // Determine model: forceOllama > preferredModel > default
    let modelOverride: string;
    if (this.config.forceOllama) {
      // Phase B optimization: Force all agents to use Ollama for parallel execution
      modelOverride = this.config.ollamaModel || 'qwen3:4b';
    } else {
      modelOverride = this.config.preferredModel || 'gemini-3-pro-preview';
    }

    const agentRole = resolveAgentRoleSafe(task.agent);
    const agent = new Agent(agentRole, modelOverride);
    const persona = AGENT_PERSONAS[agentRole];

    // =========================================
    // ANTI-HALLUCINATION: Solutions 28-29
    // =========================================

    // Solution 27: DISABLED - TaskScopeLimiter removed (causes false positives)
    // const scopeCheck = taskScopeLimiter.checkScope(task.task, task.agent, this.rootDir);

    // Solution 28: Create isolated memory context for this agent/task
    const memoryIsolation = getAgentMemoryIsolation();
    memoryIsolation.createIsolatedContext(task.agent, task.id);

    // Solution 29: Register task for factual grounding validation
    factualGroundingChecker.registerTask(task.id, task.task, this.rootDir);

    // Check for MCP tool explicitly set
    if (this.config.enableMcp && task.mcpTool) {
      return this.executeMcpTask(task, agent);
    }

    // Check for MCP tool in task description - multiple patterns
    const mcpPatterns = [
      /Use MCP tool:\s*(\S+)\s+with params:\s*(\{[^}]+\})/i,
      /Użyj MCP\s+(\S+)/i,
      /MCP\s+(filesystem__\w+|memory__\w+)/i,
      /filesystem__(list_directory|read_file|write_file|read_multiple_files|directory_tree|search_files)/i,
      /memory__(create_entities|search_nodes|read_graph)/i,
    ];

    for (const pattern of mcpPatterns) {
      const mcpMatch = task.task.match(pattern);
      if (this.config.enableMcp && mcpMatch) {
        task.mcpTool = mcpMatch[1];
        return this.executeMcpTask(task, agent);
      }
    }

    // Auto-detect filesystem operations and route to MCP
    if (this.config.enableMcp && this.shouldUseMcpForTask(task.task)) {
      return this.autoRouteMcpTask(task, agent);
    }

    // NAPRAWKA: Auto-execute file reads for code_read tasks instead of letting small models hallucinate
    const taskSpec = this.buildDetailedTaskSpec(task, dependencyContext, persona);
    if (taskSpec.taskType === 'code_read' && taskSpec.targetFiles.length > 0) {
      console.log(chalk.cyan(`│ [Auto-Read] Wykryto zadanie odczytu kodu - wykonuję natywnie`));
      try {
        const results: string[] = [];
        for (const file of taskSpec.targetFiles) {
          const filePath = this.validateAndNormalizePath(file.path);
          if (filePath) {
            const content = await this.readFileWithCache(filePath);
            if (content) {
              results.push(
                `=== ${file.path} ===\n${content.substring(0, 3000)}${content.length > 3000 ? '\n... (truncated)' : ''}`,
              );
              console.log(
                chalk.green(`│ [Auto-Read] ✓ Odczytano: ${file.path} (${content.length} znaków)`),
              );
            }
          }
        }
        if (results.length > 0) {
          return {
            id: task.id,
            success: true,
            data: results.join('\n\n'),
            logs: [`[Auto-Read] Odczytano ${results.length} plików natywnie`],
          };
        }
      } catch (error: unknown) {
        console.log(chalk.yellow(`│ [Auto-Read] Fallback do agenta: ${getErrorMessage(error)}`));
        // Fall through to agent execution
      }
    }

    // NAPRAWKA: Auto-execute build/test/git tasks instead of letting small models fake results
    const taskLower = task.task.toLowerCase();
    const autoExecCommands: { pattern: RegExp; cmd: string }[] = [
      { pattern: /npm run build|kompilacj|zbuduj|build/i, cmd: 'npm run build' },
      { pattern: /npm test|testy jednostkowe|uruchom testy/i, cmd: 'npm test' },
      { pattern: /git status|status git/i, cmd: 'git status' },
      { pattern: /git diff/i, cmd: 'git diff' },
      { pattern: /git log/i, cmd: 'git log --oneline -10' },
      { pattern: /tsc|typescript.*kompil/i, cmd: 'npx tsc --noEmit' },
      { pattern: /npm install|zainstaluj/i, cmd: 'npm install' },
      {
        pattern: /wylistuj.*katalog|lista plik|listuj.*src/i,
        cmd:
          process.platform === 'win32'
            ? 'Get-ChildItem -Path src -Filter *.ts -Recurse -File | Select-Object -ExpandProperty FullName'
            : 'find src -name "*.ts"',
      },
    ];

    for (const { pattern, cmd } of autoExecCommands) {
      if (pattern.test(taskLower)) {
        console.log(chalk.cyan(`│ [Auto-Exec] Wykryto komendę - wykonuję: ${cmd}`));
        try {
          const isWindows = process.platform === 'win32';
          const fullCommand = isWindows
            ? `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "cd '${this.rootDir}'; ${cmd}"`
            : `cd "${this.rootDir}" && ${cmd}`;

          const { stdout, stderr } = await execAsync(fullCommand, {
            timeout: this.config.taskTimeout || 120000,
          });

          const output = `EXECUTION REPORT:\nCOMMAND: ${cmd}\nOUTPUT:\n${stdout}${stderr ? `\nSTDERR:\n${stderr}` : ''}`;
          console.log(chalk.green(`│ [Auto-Exec] ✓ Komenda wykonana pomyślnie`));

          return {
            id: task.id,
            success: true,
            data: output,
            logs: [output],
          };
        } catch (error: unknown) {
          const errMsg = getErrorMessage(error);
          const errStdout = (error as { stdout?: string })?.stdout || '';
          const errStderr = (error as { stderr?: string })?.stderr || '';
          const errorOutput = `EXECUTION FAILED:\nCOMMAND: ${cmd}\nERROR: ${errMsg}\n${errStdout}${errStderr}`;
          console.log(chalk.red(`│ [Auto-Exec] ✗ Błąd: ${errMsg}`));

          return {
            id: task.id,
            success: false,
            error: errMsg,
            logs: [errorOutput],
          };
        }
      }
    }

    // NAPRAWKA: Auto-read files for analysis/diagnostic tasks
    if (
      (taskSpec.taskType === 'analysis' || taskSpec.taskType === 'other') &&
      (taskLower.includes('przeanalizuj') ||
        taskLower.includes('zidentyfikuj') ||
        taskLower.includes('znajdź') ||
        taskLower.includes('sprawdź') ||
        taskLower.includes('zbadaj') ||
        taskLower.includes('diagnoz'))
    ) {
      // Try to find relevant files to read
      const filesToRead: string[] = [];

      // Check for specific file mentions in task
      const filePatterns = [
        /(?:plik|file|pliku)\s+['"]?([^\s'"]+\.(?:ts|js|json|tsx|jsx))['"]?/gi,
        /([a-zA-Z_][a-zA-Z0-9_]*\.(?:ts|js|json|tsx|jsx))/g,
        /src\/[^\s'"]+\.(?:ts|js|tsx|jsx)/g,
      ];

      for (const pattern of filePatterns) {
        const matches = task.task.matchAll(pattern);
        for (const match of matches) {
          const fileName = match[1] || match[0];
          if (fileName && !filesToRead.includes(fileName)) {
            filesToRead.push(fileName);
          }
        }
      }

      // Also check targetFiles from spec
      for (const file of taskSpec.targetFiles) {
        if (!filesToRead.includes(file.path)) {
          filesToRead.push(file.path);
        }
      }

      if (filesToRead.length > 0) {
        console.log(
          chalk.cyan(`│ [Auto-Analysis] Znaleziono ${filesToRead.length} plików do analizy`),
        );
        const fileContents: string[] = [];

        for (const fileName of filesToRead.slice(0, 5)) {
          // Limit to 5 files
          try {
            // Try to resolve the file path
            let fullPath = fileName;
            if (!path.isAbsolute(fileName)) {
              // Try common locations
              const possiblePaths = [
                path.join(this.rootDir, fileName),
                path.join(this.rootDir, 'src', fileName),
                path.join(this.rootDir, 'src', 'core', fileName),
                path.join(this.rootDir, 'bin', fileName),
              ];

              for (const p of possiblePaths) {
                try {
                  await fs.access(p);
                  fullPath = p;
                  break;
                } catch {
                  /* continue */
                }
              }
            }

            const validPath = this.validateAndNormalizePath(fullPath);
            if (validPath) {
              const content = await this.readFileWithCache(validPath);
              if (content) {
                fileContents.push(
                  `=== ${fileName} ===\n\`\`\`typescript\n${content.substring(0, 2000)}${content.length > 2000 ? '\n... (truncated)' : ''}\n\`\`\``,
                );
                console.log(chalk.green(`│ [Auto-Analysis] ✓ Odczytano: ${fileName}`));
              }
            }
          } catch (_error: unknown) {
            console.log(chalk.yellow(`│ [Auto-Analysis] Nie można odczytać: ${fileName}`));
          }
        }

        if (fileContents.length > 0) {
          // Now let the agent analyze the REAL content
          const analysisPrompt = `[${task.agent}] Analiza kodu

ZADANIE: ${task.task}

PRAWDZIWA ZAWARTOŚĆ PLIKÓW (odczytana z dysku):
${fileContents.join('\n\n')}

INSTRUKCJE:
1. Przeanalizuj POWYŻSZY kod (nie wymyślaj własnego!)
2. Zidentyfikuj problemy/błędy
3. Jeśli zadanie wymaga naprawy, użyj ===ZAPIS: ścieżka=== z poprawionym kodem
4. Odpowiadaj PO POLSKU
5. To jest projekt TypeScript - nie pisz kodu Ruby/Python!`;

          console.log(chalk.cyan(`│ [Auto-Analysis] Przekazuję prawdziwy kod do agenta`));

          // Let agent analyze real content
          const resultText = await agent.think(analysisPrompt, '', {
            timeout: this.config.taskTimeout,
          });

          // Process any code changes
          if (resultText.includes('===ZAPIS')) {
            const writeResult = await this.processCodeChanges(resultText, task.id);
            if (writeResult) {
              return writeResult;
            }
          }

          return {
            id: task.id,
            success: true,
            data: resultText,
            logs: [`[Auto-Analysis] Analiza wykonana z ${fileContents.length} plikami`, resultText],
          };
        }
      }
    }

    // NAPRAWKA: Auto-read files for code_modify/code_write tasks before letting agent modify
    if (
      (taskSpec.taskType === 'code_modify' || taskSpec.taskType === 'code_write') &&
      taskSpec.targetFiles.length > 0
    ) {
      console.log(chalk.cyan(`│ [Auto-Modify] Wczytuję pliki przed modyfikacją`));

      const existingContents: string[] = [];
      for (const file of taskSpec.targetFiles.slice(0, 3)) {
        // Max 3 files
        try {
          const filePath = this.validateAndNormalizePath(file.path);
          if (filePath) {
            const content = await this.readFileWithCache(filePath);
            if (content) {
              existingContents.push(
                `=== ISTNIEJĄCY PLIK: ${file.path} ===\n\`\`\`typescript\n${content.substring(0, 2500)}${content.length > 2500 ? '\n... (truncated)' : ''}\n\`\`\``,
              );
              console.log(
                chalk.green(`│ [Auto-Modify] ✓ Wczytano: ${file.path} (${content.length} znaków)`),
              );
            } else {
              existingContents.push(
                `=== NOWY PLIK: ${file.path} ===\n(plik nie istnieje - zostanie utworzony)`,
              );
              console.log(chalk.yellow(`│ [Auto-Modify] Nowy plik: ${file.path}`));
            }
          }
        } catch (error: unknown) {
          console.log(
            chalk.yellow(`│ [Auto-Modify] Pominięto: ${file.path} - ${getErrorMessage(error)}`),
          );
        }
      }

      if (existingContents.length > 0) {
        // Build specialized modification prompt
        const modifyPrompt = `[${task.agent}] Modyfikacja kodu TypeScript

ZADANIE: ${task.task}

${existingContents.join('\n\n')}

INSTRUKCJE:
1. Przeanalizuj ISTNIEJĄCY kod powyżej
2. Wprowadź WYMAGANE zmiany
3. ZAPISZ poprawiony kod używając formatu:

===ZAPIS: ${taskSpec.targetFiles[0]?.path || 'src/plik.ts'}===
\`\`\`typescript
// Twój poprawiony kod tutaj
\`\`\`
===KONIEC===

ZASADY:
- Zachowaj istniejącą strukturę pliku
- Zmieniaj TYLKO to co jest potrzebne
- Odpowiadaj PO POLSKU
- To jest TypeScript - NIE Ruby/Python!`;

        console.log(chalk.cyan(`│ [Auto-Modify] Przekazuję kod do modyfikacji`));

        const resultText = await agent.think(modifyPrompt, '', {
          timeout: this.config.taskTimeout,
        });

        // Process code changes
        if (resultText.includes('===ZAPIS')) {
          const writeResult = await this.processCodeChanges(resultText, task.id);
          if (writeResult) {
            return writeResult;
          }
        }

        return {
          id: task.id,
          success: true,
          data: resultText,
          logs: [`[Auto-Modify] Modyfikacja wykonana`, resultText],
        };
      }
    }

    // Load grimoires if specified
    let grimoireContent = '';
    if (task.grimoires && task.grimoires.length > 0) {
      grimoireContent = await loadGrimoires(task.grimoires);
    }

    // taskSpec already built above for auto-read check, reuse it
    // Log JSON spec for debugging (compact version)
    console.log(
      chalk.magenta(
        `│ [JSON Spec] Type: ${taskSpec.taskType} | Files: ${taskSpec.targetFiles.length} | Deps: ${taskSpec.dependencies.length}`,
      ),
    );
    if (taskSpec.targetFiles.length > 0) {
      console.log(
        chalk.gray(
          `│ [JSON Spec] Targets: ${taskSpec.targetFiles.map((f) => `${f.operation}:${path.basename(f.path)}`).join(', ')}`,
        ),
      );
    }

    // Detect if using small Ollama model (needs compact prompt)
    const isSmallModel =
      modelOverride.includes('qwen3:4b') ||
      modelOverride.includes('qwen3:1.7b') ||
      modelOverride.includes('qwen3:0.6b');

    // Detect task type for specialized prompting (legacy, for backward compat)
    const _taskType = this.detectTaskType(task.task);

    // Build prompt based on model size
    let prompt: string;

    if (isSmallModel) {
      // COMPACT PROMPT for small models (~1500 chars max)
      // NAPRAWKA: Dodano instrukcje o użyciu EXEC: dla odczytu plików
      const filesInfo =
        taskSpec.targetFiles.length > 0
          ? taskSpec.targetFiles.map((f) => `${f.operation}: ${f.path}`).join('\n')
          : `Dir: ${this.rootDir}`;

      // Detect if task requires file reading
      const needsFileRead =
        taskSpec.taskType === 'code_read' ||
        task.task.toLowerCase().includes('odczytaj') ||
        task.task.toLowerCase().includes('przeczytaj') ||
        task.task.toLowerCase().includes('read');

      // Detect if task requires command execution
      const needsExec =
        taskSpec.taskType === 'build' ||
        task.task.toLowerCase().includes('uruchom') ||
        task.task.toLowerCase().includes('npm') ||
        task.task.toLowerCase().includes('git');

      let actionInstructions = '';
      if (needsFileRead) {
        actionInstructions = `
AKCJA: Aby odczytać plik, użyj:
EXEC: type "${taskSpec.targetFiles[0]?.path || `${this.rootDir}\\\\src\\\\index.ts`}"
Zwróć PEŁNĄ zawartość pliku, nie wymyślaj!`;
      } else if (needsExec) {
        actionInstructions = `
AKCJA: Wykonaj komendę:
EXEC: <twoja_komenda>
Czekaj na wynik i zwróć go.`;
      }

      prompt = `[${task.agent}] ${persona?.description?.substring(0, 100) || 'Agent'}

TASK: ${task.task}

${filesInfo ? `FILES:\n${filesInfo}\n` : ''}
OUTPUT: ${taskSpec.expectedOutput.format} - ${taskSpec.expectedOutput.description}
${actionInstructions}

RULES:
- WYKONAJ zadanie, nie opisuj
- NIE WYMYŚLAJ zawartości plików - użyj EXEC: type "ścieżka" aby je odczytać
- Użyj pełnych ścieżek od: ${this.rootDir}
- Dla zmian w kodzie: ===ZAPIS: ścieżka===
- Dla komend git/npm/type: EXEC: <komenda>
- Odpowiadaj PO POLSKU
- Ten projekt jest w TypeScript, NIE w Ruby/Python!`;

      console.log(chalk.yellow(`│ [Compact] Prompt: ${prompt.length} chars (small model)`));
    } else {
      // MEDIUM PROMPT for larger models (~2500-3000 chars)
      // Compact JSON (no pretty print), essential info only
      const compactSpec = {
        task: taskSpec.taskId,
        type: taskSpec.taskType,
        files: taskSpec.targetFiles.map((f) => `${f.operation}:${f.path}`),
        output: taskSpec.expectedOutput.format,
        deps: taskSpec.dependencies.length,
      };

      const depsContext =
        taskSpec.dependencies.length > 0
          ? taskSpec.dependencies
              .map(
                (d) =>
                  `#${d.taskId}: ${d.summary}${d.relevantData ? ` | ${d.relevantData.substring(0, 200)}` : ''}`,
              )
              .join('\n')
          : '';

      prompt = `[PHASE B] Agent: ${task.agent}
${persona?.description || ''}

SPEC: ${JSON.stringify(compactSpec)}

ZADANIE: ${task.task}

${taskSpec.targetFiles.length > 0 ? `PLIKI:\n${taskSpec.targetFiles.map((f) => `- ${f.operation.toUpperCase()}: ${f.path}`).join('\n')}\n` : ''}
${depsContext ? `KONTEKST:\n${depsContext}\n` : ''}
WYNIK: ${taskSpec.expectedOutput.description}

ZASADY:
1. WYKONUJ, nie opisuj - zwróć KONKRETNY wynik
2. Ścieżki od: ${this.rootDir}
3. Zmiany w kodzie: ===ZAPIS: ścieżka/plik.ts===
4. Komendy systemowe (git, npm, tsc): EXEC: <komenda>
5. Odpowiadaj PO POLSKU
${grimoireContent ? `\nNARZĘDZIA:\n${grimoireContent}` : ''}`;

      console.log(chalk.cyan(`│ [Medium] Prompt: ${prompt.length} chars`));
    }

    // Execute with timeout support
    const resultText = await agent.think(prompt, '', {
      timeout: this.config.taskTimeout,
    });

    // NAPRAWKA: Wykryj halucynacje (Ruby/Python w projekcie TypeScript) i retry z poprawionym promptem
    const hallucinationPatterns = [
      { pattern: /```ruby|require\s+['"]securer|def\s+\w+\s*\(/i, lang: 'Ruby' },
      { pattern: /```python|from\s+\w+\s+import|def\s+\w+\s*\(.*\):/i, lang: 'Python' },
      { pattern: /class\s+\w+\s*<\s*\w+|attr_accessor|\.rb\b/i, lang: 'Ruby' },
      { pattern: /if\s+__name__\s*==\s*['"]__main__|\.py\b/i, lang: 'Python' },
    ];

    let isHallucination = false;
    let hallucinatedLang = '';
    for (const { pattern, lang } of hallucinationPatterns) {
      if (pattern.test(resultText) && !task.task.toLowerCase().includes(lang.toLowerCase())) {
        isHallucination = true;
        hallucinatedLang = lang;
        break;
      }
    }

    if (isHallucination) {
      console.log(
        chalk.red(
          `│ [Hallucination] ⚠ Agent wygenerował kod ${hallucinatedLang} zamiast TypeScript!`,
        ),
      );
      console.log(chalk.yellow(`│ [Hallucination] Retry z poprawionym promptem...`));

      // Retry z bardzo wyraźnym promptem
      const retryPrompt = `⚠️ BŁĄD! Wygenerowałeś kod ${hallucinatedLang}. TEN PROJEKT UŻYWA TYPESCRIPT!

PONÓW ZADANIE: ${task.task}

KRYTYCZNE ZASADY:
1. Pisz TYLKO w TypeScript (.ts, .tsx)
2. NIE używaj Ruby (def, require, attr_accessor)
3. NIE używaj Python (import, def func():, if __name__)
4. Składnia: const/let/function, interface, type, class extends

PRZYKŁAD PRAWIDŁOWEJ ODPOWIEDZI:
\`\`\`typescript
// Prawidłowy kod TypeScript
interface User {
  id: number;
  name: string;
}

function validate(user: User): boolean {
  return user.id > 0 && user.name.length > 0;
}
\`\`\`

Teraz wykonaj zadanie PRAWIDŁOWO w TypeScript:`;

      try {
        const retryResult = await agent.think(retryPrompt, '', {
          timeout: this.config.taskTimeout,
        });

        // Sprawdź czy retry też ma halucynację
        let retryHallucination = false;
        for (const { pattern, lang: _lang } of hallucinationPatterns) {
          if (pattern.test(retryResult)) {
            retryHallucination = true;
            break;
          }
        }

        if (!retryHallucination) {
          console.log(chalk.green(`│ [Hallucination] ✓ Retry pomyślny - agent użył TypeScript`));

          // Process the retry result
          if (retryResult.includes('EXEC:')) {
            return this.executeExecProtocol(task.id, retryResult);
          }

          const writeResult = await this.processCodeChanges(retryResult, task.id);
          if (writeResult) {
            return writeResult;
          }

          return {
            id: task.id,
            success: true,
            logs: [`[Retry po halucynacji] ${retryResult}`],
          };
        }
      } catch (retryError: unknown) {
        console.log(chalk.red(`│ [Hallucination] Retry failed: ${getErrorMessage(retryError)}`));
      }

      // Jeśli retry też się nie udał, zwróć błąd
      return {
        id: task.id,
        success: false,
        error: `Halucynacja: Agent uporczywie generuje kod ${hallucinatedLang} zamiast TypeScript`,
        logs: [`Agent nie może wygenerować prawidłowego kodu TypeScript po retry.`],
      };
    }

    // Check for EXEC protocol (PS1 lines 603-638)
    if (resultText.includes('EXEC:')) {
      return this.executeExecProtocol(task.id, resultText);
    }

    // Check for code changes (===ZAPIS=== blocks)
    const writeResult = await this.processCodeChanges(resultText, task.id);
    if (writeResult) {
      return writeResult;
    }

    // Validate response quality
    const validationResult = this.validateResponse(resultText, task.task, taskSpec);
    if (!validationResult.valid) {
      console.log(chalk.yellow(`│ [Validation] ⚠ ${validationResult.reason}`));

      // AUTO-FIX: Spróbuj naprawić typowe problemy
      if (validationResult.reason === 'Odpowiedź zbyt krótka') {
        console.log(chalk.cyan(`│ [Auto-Fix] Próbuję wykonać zadanie bezpośrednio...`));

        // Spróbuj wykonać zadanie bezpośrednio zamiast przez agenta
        const taskLower = task.task.toLowerCase();

        // Jeśli to zadanie git/npm - wykonaj komendę
        if (taskLower.includes('git status')) {
          return this.executeExecProtocol(task.id, 'EXEC: git status');
        }
        if (taskLower.includes('npm run build')) {
          return this.executeExecProtocol(task.id, 'EXEC: npm run build');
        }
        if (taskLower.includes('git diff')) {
          return this.executeExecProtocol(task.id, 'EXEC: git diff');
        }

        // Jeśli to zadanie odczytu pliku - odczytaj natywnie
        if (taskSpec.targetFiles.length > 0) {
          try {
            const results: string[] = [];
            for (const file of taskSpec.targetFiles) {
              const filePath = this.validateAndNormalizePath(file.path);
              if (filePath) {
                const content = await fs.readFile(filePath, 'utf-8');
                results.push(`=== ${file.path} ===\n${content.substring(0, 2000)}`);
              }
            }
            if (results.length > 0) {
              console.log(
                chalk.green(`│ [Auto-Fix] ✓ Odczytano ${results.length} plików natywnie`),
              );
              return {
                id: task.id,
                success: true,
                data: results.join('\n\n'),
                logs: [`[Auto-Fix] Zadanie wykonane natywnie`],
              };
            }
          } catch (e: unknown) {
            console.log(chalk.yellow(`│ [Auto-Fix] Nie udało się: ${getErrorMessage(e)}`));
          }
        }
      }

      return {
        id: task.id,
        success: false,
        error: validationResult.reason,
        logs: [resultText, `\n⚠ Walidacja: ${validationResult.reason}`],
      };
    }

    // Validate response before returning success
    const validation = this.validateAgentResponse(resultText, task);
    if (validation.warnings.length > 0) {
      console.log(chalk.yellow(`│ [Validation] Warnings for task #${task.id}:`));
      for (const w of validation.warnings) {
        console.log(chalk.yellow(`│   - ${w}`));
      }
    }

    // Solution 29: Validate factual grounding of the response
    const groundingResult = factualGroundingChecker.validateResponse(task.id, resultText);
    if (!groundingResult.isGrounded) {
      console.log(chalk.yellow(`│ [FactualGrounding] Task #${task.id} grounding issues:`));
      groundingResult.issues.forEach((issue) => {
        console.log(chalk.yellow(`│   - ${issue}`));
      });

      // If there are multiple grounding issues, mark task as failed
      if (groundingResult.issues.length >= 3) {
        // Deactivate memory isolation context for this task
        const contextId = `task-${task.id}`;
        memoryIsolation.deactivateContext(contextId);

        return {
          id: task.id,
          success: false,
          error: `Factual grounding failed: ${groundingResult.issues.join('; ')}`,
          logs: [resultText, `\n⚠ Grounding: ${groundingResult.issues.join('; ')}`],
        };
      }
    } else {
      console.log(chalk.green(`│ [FactualGrounding] Task #${task.id} grounding passed`));
    }

    // Deactivate memory isolation context for completed task
    const contextId = `task-${task.id}`;
    memoryIsolation.deactivateContext(contextId);

    return {
      id: task.id,
      success: true,
      logs: [resultText],
    };
  }

  /**
   * Validate agent response quality
   */
  private validateResponse(
    response: string,
    taskText: string,
    spec: DetailedTaskSpec,
  ): { valid: boolean; reason?: string } {
    const _lower = response.toLowerCase();
    const taskLower = taskText.toLowerCase();

    // Check for empty or too short response
    if (response.trim().length < 20) {
      return { valid: false, reason: 'Odpowiedź zbyt krótka' };
    }

    // Check for explicit refusal phrases at the VERY START of response
    // These indicate agent refused to do the task (not just mentioning inability in context)
    const firstLine = response.trim().split('\n')[0].toLowerCase();
    const refusalPatterns = [
      /^(nie mogę|nie jestem w stanie|niestety nie mogę)/,
      /^(cannot|i can't|i cannot|i'm unable|i am unable)/,
      /^(sorry,?\s*(but\s*)?i|przepraszam,?\s*(ale\s*)?)/,
      /^(as an ai|jako ai|jako model)/,
    ];

    if (refusalPatterns.some((p) => p.test(firstLine))) {
      return { valid: false, reason: 'Agent odmówił wykonania zadania' };
    }

    // Check for wrong language files in TypeScript project
    if (/\.py['"]?\s*$|python|import\s+\w+\s*$/im.test(response) && !taskLower.includes('python')) {
      if (response.includes('===ZAPIS') && /\.py/.test(response)) {
        return {
          valid: false,
          reason: 'Agent próbował utworzyć plik Python w projekcie TypeScript',
        };
      }
    }

    // Check for hallucinated file paths
    if (response.includes('===ZAPIS')) {
      const pathMatch = response.match(/===ZAPIS[:\s]*([^\n=()]+)/i);
      if (pathMatch) {
        const mentionedPath = pathMatch[1].trim();
        // Check if path looks valid (contains project root or is relative)
        if (
          !mentionedPath.includes(this.rootDir) &&
          !mentionedPath.startsWith('src/') &&
          !mentionedPath.startsWith('./')
        ) {
          if (
            mentionedPath.includes('/home/') ||
            mentionedPath.includes('/usr/') ||
            mentionedPath.includes('C:\\Windows')
          ) {
            return { valid: false, reason: `Nieprawidłowa ścieżka: ${mentionedPath}` };
          }
        }
      }
    }

    // Task-specific validations
    if (spec.taskType === 'code_read' && !response.includes('```') && response.length < 100) {
      return { valid: false, reason: 'Zadanie odczytu kodu nie zwróciło kodu' };
    }

    return { valid: true };
  }

  /**
   * Solution 9: Validate agent response for hallucination indicators
   * Returns validation result with warnings
   */
  private validateAgentResponse(
    response: string,
    task: SwarmTask,
  ): {
    valid: boolean;
    warnings: string[];
    cleanedResponse: string;
  } {
    const warnings: string[] = [];
    const cleanedResponse = response;

    // Pattern 1: Agent says "I will do X" instead of actually doing it
    const futurePromisePatterns = [
      /(?:I will|I would|I can|Let me|I'll|I'm going to)\s+(?:create|write|implement|add|fix|modify)/gi,
      /(?:Mogę|Będę|Zamierzam|Powinienem|Należy)\s+(?:stworzyć|napisać|zaimplementować|dodać|naprawić)/gi,
    ];

    for (const pattern of futurePromisePatterns) {
      if (pattern.test(response)) {
        warnings.push('Agent opisuje co ZROBI zamiast WYKONAĆ zadanie');
      }
    }

    // Pattern 2: Generic placeholder names (file1.ts, Class1, etc.)
    const genericNamePatterns = [
      /\b(?:file|class|function|method|test|helper|util|service|component)\d+\.(ts|js|tsx|jsx|py|java)\b/gi,
      /\b(?:Class|File|Test|Helper|Utils?|Service|Component|Module)\d+\b/g,
      /\bexample\.(ts|js|tsx|jsx)\b/gi,
      /\bsample[A-Z]\w*\b/g,
    ];

    for (const pattern of genericNamePatterns) {
      const matches = response.match(pattern);
      if (matches && matches.length > 0) {
        warnings.push(`Wykryto generyczne nazwy: ${matches.slice(0, 3).join(', ')}`);
      }
    }

    // Pattern 3: Response too short for complex task
    const taskWords = task.task.split(/\s+/).length;
    const responseWords = response.split(/\s+/).length;
    if (taskWords > 20 && responseWords < 30) {
      warnings.push('Odpowiedź zbyt krótka dla złożonego zadania');
    }

    // Pattern 4: Contains "example" or "sample" suggestions instead of real code
    const examplePatterns = [
      /(?:for example|na przykład|przykładowo|here's an example|oto przykład)/gi,
      /(?:you could|you can|you should|możesz|powinieneś)/gi,
    ];

    for (const pattern of examplePatterns) {
      if (pattern.test(response) && !response.includes('===ZAPIS===')) {
        warnings.push('Agent podaje przykłady zamiast wykonać zadanie');
      }
    }

    // Valid if no critical warnings
    const criticalWarnings = warnings.filter(
      (w) =>
        w.includes('ZROBI zamiast') ||
        w.includes('generyczne nazwy') ||
        w.includes('przykłady zamiast'),
    );

    return {
      valid: criticalWarnings.length === 0,
      warnings,
      cleanedResponse,
    };
  }

  /**
   * Check if task should use DIRECT Native FS (bypass agent thinking)
   * ONLY for simple file operations that don't need AI reasoning
   * Complex tasks (analysis, refactoring, fixing) should go to agent with JSON spec
   */
  private shouldUseMcpForTask(taskText: string): boolean {
    const lower = taskText.toLowerCase();

    // EXCLUDE tasks that need agent reasoning (these should get JSON spec)
    const needsAgentReasoning = [
      /analizuj|analiza|przeanalizuj|zbadaj|oceń|sprawdź/i, // Analysis tasks
      /napraw|popraw|zrefaktoruj|refaktoryzacja|fix|refactor/i, // Repair/refactor tasks
      /zidentyfikuj|znajdź.*błędy?|diagnoz/i, // Diagnostic tasks
      /zaproponuj|sugestie|rekomendacj/i, // Suggestion tasks
      /wyjaśnij|opisz|dokumentuj/i, // Documentation tasks
      /zmodyfikuj.*kod|edytuj.*kod|update.*code/i, // Code modification (needs thinking)
      /implementuj|napisz.*funkcj|stwórz.*klas/i, // Implementation tasks
      /struktur.*plików|entry.*point|punkt.*wejści/i, // Architecture analysis
      /zależności|dependencies|weryfikacja/i, // Dependency analysis
    ];

    if (needsAgentReasoning.some((pattern) => pattern.test(lower))) {
      return false; // Let agent handle with JSON spec
    }

    // ONLY intercept SIMPLE file operations (no reasoning needed)
    const simpleFileOps = [
      // Direct file content requests (not analysis)
      /^(wylistuj|listuj)\s+(katalog|folder|pliki)/i, // List directory
      /^(pokaż|wyświetl)\s+(zawartość\s+)?(katalog|folder)/i, // Show directory
      /^(pobierz|przeczytaj|odczytaj)\s+zawartość\s+pliku/i, // Get file content (explicit)
      /^(utwórz|stwórz)\s+(pusty\s+)?plik/i, // Create file
      /^zapisz\s+(do\s+)?pliku/i, // Write to file
    ];

    return simpleFileOps.some((pattern) => pattern.test(lower));
  }

  /**
   * Check if a string looks like an MCP tool name (not a file path)
   * Examples: /add_observations, memory/create_entities, serena__find_symbol
   */
  private isMcpToolName(input: string): boolean {
    if (!input || typeof input !== 'string') return false;

    // MCP tool patterns - these should NOT be treated as file paths
    const mcpPatterns = [
      /^\/[a-z_]+$/i, // /add_observations, /read_file
      /^[a-z_]+\/[a-z_]+$/i, // memory/create_entities
      /^[a-z_]+__[a-z_]+$/i, // serena__find_symbol
      /^mcp:[a-z_]+/i, // mcp:tool_name
      /^(memory|serena|filesystem|brave-search|context7|puppeteer|playwright)[:/]/i, // Known MCP servers
    ];

    return mcpPatterns.some((pattern) => pattern.test(input.trim()));
  }

  /**
   * Auto-route task to appropriate MCP tool
   */
  private async autoRouteMcpTask(task: ExtendedTask, _agent: Agent): Promise<ExecutionResult> {
    const taskLower = task.task.toLowerCase();

    // Extract path from task - try multiple patterns
    let extractedPath = this.rootDir;

    // Pattern 1: Full Windows path (C:\...)
    // NAPRAWKA: Dodano () do wykluczeń żeby nie łapać nawiasów z "(projekt: C:\...)"
    const winPathMatch = task.task.match(/["']?([A-Z]:\\[^"'\s()]+)["']?/i);
    // Pattern 2: Full Unix path (/home/...) - BUT ONLY if it looks like a real path, not MCP tool
    // NAPRAWKA: Dodano () do wykluczeń
    const unixPathMatch = task.task.match(/["']?(\/[^"'\s()]+)["']?/i);
    // Pattern 3: Filename with extension (tsconfig.json, index.ts, etc.)
    // IMPORTANT: Order matters - longer extensions first (json before js, tsx before ts)
    const fileNameMatch = task.task.match(
      /["']?([\w.-]+\.(json|yaml|yml|toml|tsx|jsx|ts|js|md|txt|css|html|py|java|cs|cpp|go|rs|rb|php|vue|svelte|sh|bat|ps1|xml|env|gitignore|dockerignore|config))(?:["'\s,;)]|$)/i,
    );
    // Pattern 4: Relative path (src/index.ts, ./config/settings.json)
    const relativePathMatch = task.task.match(/["']?(\.?\.?\/[\w./-]+)["']?/i);

    if (winPathMatch) {
      extractedPath = winPathMatch[1].replace(/["']/g, '');
    } else if (unixPathMatch) {
      const potentialPath = unixPathMatch[1].replace(/["']/g, '');
      // NAPRAWKA: Sprawdź czy to nie jest nazwa MCP tool (np. /add_observations)
      if (this.isMcpToolName(potentialPath)) {
        console.log(
          chalk.yellow(
            `│ [MCP Auto] Detected MCP tool name, skipping path validation: ${potentialPath}`,
          ),
        );
        // Zwróć wynik wskazujący, że to zadanie powinno być obsłużone przez agenta
        return {
          id: task.id,
          success: false,
          error: `MCP_TOOL_DETECTED: ${potentialPath}`,
          logs: [`Detected MCP tool reference, delegating to agent: ${potentialPath}`],
        };
      }
      extractedPath = potentialPath;
    } else if (relativePathMatch) {
      const potentialPath = relativePathMatch[1].replace(/["']/g, '');
      // NAPRAWKA: Sprawdź czy to nie jest nazwa MCP tool (np. memory/create_entities)
      if (this.isMcpToolName(potentialPath)) {
        console.log(
          chalk.yellow(
            `│ [MCP Auto] Detected MCP tool name, skipping path validation: ${potentialPath}`,
          ),
        );
        return {
          id: task.id,
          success: false,
          error: `MCP_TOOL_DETECTED: ${potentialPath}`,
          logs: [`Detected MCP tool reference, delegating to agent: ${potentialPath}`],
        };
      }
      extractedPath = path.resolve(this.rootDir, potentialPath);
    } else if (fileNameMatch) {
      // Just a filename - resolve against rootDir
      extractedPath = path.resolve(this.rootDir, fileNameMatch[1].replace(/["']/g, ''));
    }

    // If path is just "." or relative, resolve it against rootDir
    if (extractedPath === '.' || extractedPath === '..' || !path.isAbsolute(extractedPath)) {
      extractedPath = path.resolve(this.rootDir, extractedPath);
    }

    // NAPRAWKA: Usuń nawiasy i inne artefakty z końca ścieżki (AI hallucinations)
    // Przykłady: "path/file.ts)" lub "path/file.ts (new file)" lub "C:\path)"
    extractedPath = extractedPath.replace(/\s*\([^)]*\)\s*$/, ''); // Remove "(something)" at end
    extractedPath = extractedPath.replace(/\)\s*$/, ''); // Remove trailing ")"
    extractedPath = extractedPath.replace(/\(\s*$/, ''); // Remove trailing "("
    extractedPath = extractedPath.trim();

    // Validate path is within project
    const validatedPath = this.validateAndNormalizePath(extractedPath);
    if (!validatedPath) {
      console.log(chalk.red(`│ [MCP Auto] BŁĄD: Ścieżka poza projektem: ${extractedPath}`));
      return {
        id: task.id,
        success: false,
        error: `Invalid path: ${extractedPath} - must be within ${this.rootDir}`,
        logs: [`MCP Auto-route failed: path outside project root`],
      };
    }

    // Use NATIVE filesystem API instead of MCP filesystem server
    console.log(chalk.cyan(`│ [Native FS] Wykryto operację plikową: ${validatedPath}`));

    try {
      let result: string;

      // Check if path is a file or directory
      let isFile = false;
      let isDir = false;
      try {
        const stat = await fs.stat(validatedPath);
        isFile = stat.isFile();
        isDir = stat.isDirectory();
      } catch {
        // Path doesn't exist yet - guess based on extension
        isFile = /\.\w+$/.test(validatedPath);
        isDir = !isFile;
      }

      // Determine operation based on task keywords AND path type
      const wantsRead =
        taskLower.includes('read') ||
        taskLower.includes('przeczytaj') ||
        taskLower.includes('odczytaj') ||
        taskLower.includes('pobierz zawartość') ||
        taskLower.includes('konfiguracja');
      const wantsTree =
        taskLower.includes('tree') ||
        taskLower.includes('struktur') ||
        taskLower.includes('drzewo');
      const wantsSearch =
        taskLower.includes('search') ||
        taskLower.includes('szukaj') ||
        taskLower.includes('znajdź');

      if (isFile || (wantsRead && !isDir)) {
        // Read file
        console.log(chalk.gray(`│ [Native FS] Czytam plik: ${validatedPath}`));
        result = await fs.readFile(validatedPath, 'utf-8');
        console.log(chalk.green(`│ [Native FS] ✓ Przeczytano ${result.length} znaków`));
      } else if (wantsTree) {
        console.log(chalk.gray(`│ [Native FS] Struktura: ${validatedPath}`));
        const nativeFs = new NativeFileSystem({ rootDir: this.rootDir });
        const tree = await nativeFs.getDirectoryTree(validatedPath, { maxDepth: 3 });
        result = JSON.stringify(tree, null, 2);
        console.log(chalk.green(`│ [Native FS] ✓ Drzewo wygenerowane`));
      } else if (wantsSearch) {
        console.log(chalk.gray(`│ [Native FS] Szukam w: ${validatedPath}`));
        const nativeFs = new NativeFileSystem({ rootDir: this.rootDir });
        const files = await nativeFs.listDirectory(validatedPath);
        result = files.map((f) => `${f.type === 'directory' ? '📁' : '📄'} ${f.name}`).join('\n');
        console.log(chalk.green(`│ [Native FS] ✓ Znaleziono ${files.length} elementów`));
      } else if (isDir) {
        // Default for directories: list
        console.log(chalk.gray(`│ [Native FS] Listowanie: ${validatedPath}`));
        const entries = await fs.readdir(validatedPath, { withFileTypes: true });
        result = entries.map((e) => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
        console.log(chalk.green(`│ [Native FS] ✓ Znaleziono ${entries.length} elementów`));
      } else {
        // Default for files: read
        console.log(chalk.gray(`│ [Native FS] Czytam: ${validatedPath}`));
        result = await fs.readFile(validatedPath, 'utf-8');
        console.log(chalk.green(`│ [Native FS] ✓ Przeczytano ${result.length} znaków`));
      }

      return {
        id: task.id,
        success: true,
        data: result,
        logs: [`[Native FS] Operacja zakończona pomyślnie`],
      };
    } catch (error: unknown) {
      console.log(chalk.red(`│ [Native FS] BŁĄD: ${getErrorMessage(error)}`));
      return {
        id: task.id,
        success: false,
        error: getErrorMessage(error),
        logs: [`[Native FS] Error: ${getErrorMessage(error)}`],
      };
    }
  }

  /**
   * Build detailed task specification JSON for Phase B agents
   * Extracts all context, files, dependencies, and expected output format
   */
  private buildDetailedTaskSpec(
    task: ExtendedTask,
    dependencyContext: string,
    persona: (typeof AGENT_PERSONAS)[AgentRole],
  ): DetailedTaskSpec {
    // Determine task type
    const taskType = this.detectDetailedTaskType(task.task);

    // Extract target files from task description
    const targetFiles = this.extractTargetFiles(task.task);

    // Determine expected output format
    const expectedOutput = this.determineExpectedOutput(task.task, taskType);

    // Parse dependency context into structured format
    const dependencies = this.parseDependencyContext(task.dependencies || [], dependencyContext);

    // Build available tools list
    const availableTools = [
      'Native FS: readFile, writeFile, listDirectory, directoryTree',
      'EXEC: git, npm, npx, tsc, eslint (tylko narzędzia systemowe)',
      '===ZAPIS=== protocol dla zmian w kodzie',
    ];

    return {
      taskId: task.id,
      agent: resolveAgentRoleSafe(task.agent),
      agentDescription: persona?.description || `Agent ${task.agent}`,

      taskDescription: task.task,
      taskType,

      projectRoot: this.rootDir,
      targetFiles,

      expectedOutput,

      dependencies,

      availableTools,

      constraints: {
        timeout: this.config.taskTimeout || 180000,
        maxRetries: this.config.maxRetries || 2,
        mustUseNativeFs: true,
      },
    };
  }

  /**
   * Detect detailed task type for JSON spec
   */
  private detectDetailedTaskType(taskText: string): DetailedTaskSpec['taskType'] {
    const lower = taskText.toLowerCase();

    if (/napisz|implementuj|utwórz.*kod|stwórz.*funkcj|create.*function|implement/i.test(lower)) {
      return 'code_write';
    }
    if (/przeczytaj|wczytaj|odczytaj|pobierz.*zawartość|read.*file|load.*file/i.test(lower)) {
      return 'code_read';
    }
    if (
      /napraw|zmodyfikuj|popraw|zrefaktoruj|zaktualizuj|fix|modify|update|refactor/i.test(lower)
    ) {
      return 'code_modify';
    }
    if (/test|spec|sprawdź.*działanie|verify|validate/i.test(lower)) {
      return 'test';
    }
    if (/build|kompiluj|zbuduj|npm run|tsc|webpack/i.test(lower)) {
      return 'build';
    }
    if (/dokumentacj|readme|comment|komentarz|opis/i.test(lower)) {
      return 'documentation';
    }
    if (/przeanalizuj|zbadaj|oceń|review|analiz/i.test(lower)) {
      return 'analysis';
    }

    return 'other';
  }

  /**
   * Extract target files from task description
   */
  private extractTargetFiles(taskText: string): DetailedTaskSpec['targetFiles'] {
    const files: DetailedTaskSpec['targetFiles'] = [];

    // Pattern 1: Full Windows paths
    const winPaths = taskText.matchAll(
      /([A-Z]:\\[^\s"']+\.(ts|js|tsx|jsx|json|yaml|yml|md|txt|css|html|py|java|cs|go|rs))/gi,
    );
    for (const match of winPaths) {
      files.push({
        path: match[1],
        operation: this.detectFileOperation(taskText),
        description: `Plik: ${path.basename(match[1])}`,
      });
    }

    // Pattern 2: Relative paths (src/..., ./...)
    // Order extensions: longer first (json before js, tsx before ts)
    const relativePaths = taskText.matchAll(
      /((?:\.\.?\/)?(?:src|lib|test|config|scripts)\/[\w./-]+\.(json|yaml|yml|tsx|jsx|ts|js|md|txt|css|html))/gi,
    );
    for (const match of relativePaths) {
      const fullPath = path.resolve(this.rootDir, match[1]);
      files.push({
        path: fullPath,
        operation: this.detectFileOperation(taskText),
        description: `Plik: ${match[1]}`,
      });
    }

    // Pattern 3: Simple filenames (tsconfig.json, index.ts)
    // Order extensions: longer first (json before js, tsx before ts)
    const simpleFiles = taskText.matchAll(
      /(?:^|\s|["'])(\w[\w.-]*\.(json|yaml|yml|toml|tsx|jsx|ts|js|md|txt|css|html|config))(?:\s|["']|$)/gi,
    );
    for (const match of simpleFiles) {
      // Avoid duplicates
      const fileName = match[1];
      if (!files.some((f) => f.path.endsWith(fileName))) {
        files.push({
          path: path.resolve(this.rootDir, fileName),
          operation: this.detectFileOperation(taskText),
          description: `Plik: ${fileName} (w katalogu projektu)`,
        });
      }
    }

    return files;
  }

  /**
   * Detect file operation type from task text
   */
  private detectFileOperation(taskText: string): 'read' | 'write' | 'modify' | 'create' | 'delete' {
    const lower = taskText.toLowerCase();

    if (/utwórz|stwórz|create|new file/i.test(lower)) return 'create';
    if (/usuń|delete|remove/i.test(lower)) return 'delete';
    if (/napisz|zapisz|write|save/i.test(lower)) return 'write';
    if (/napraw|zmodyfikuj|popraw|zaktualizuj|fix|modify|update|change/i.test(lower))
      return 'modify';

    return 'read';
  }

  /**
   * Determine expected output format
   */
  private determineExpectedOutput(
    taskText: string,
    taskType: DetailedTaskSpec['taskType'],
  ): DetailedTaskSpec['expectedOutput'] {
    const lower = taskText.toLowerCase();

    // Code output
    if (taskType === 'code_write' || taskType === 'code_modify') {
      return {
        format: 'code',
        description: 'Kod źródłowy z blokiem ===ZAPIS=== dla zmian w plikach',
        example: '===ZAPIS: src/example.ts===\n// kod tutaj\n===KONIEC===',
      };
    }

    // JSON output
    if (/json|struktur|lista.*obiektów/i.test(lower)) {
      return {
        format: 'json',
        description: 'Dane w formacie JSON',
        example: '{"key": "value"}',
      };
    }

    // List output
    if (/lista|wypisz|wymień|wylicz|\d+\s*(ulepszeń|propozycji|punktów)/i.test(lower)) {
      return {
        format: 'list',
        description: 'Lista ponumerowana lub wypunktowana',
        example: '1. Pierwszy element\n2. Drugi element',
      };
    }

    // Analysis
    if (taskType === 'analysis') {
      return {
        format: 'structured',
        description: 'Strukturalna analiza z sekcjami',
        example: '## Analiza\n### Główne wnioski\n...',
      };
    }

    return {
      format: 'text',
      description: 'Odpowiedź tekstowa',
    };
  }

  /**
   * Parse dependency context into structured format
   */
  private parseDependencyContext(
    dependencyIds: number[],
    _rawContext: string,
  ): DetailedTaskSpec['dependencies'] {
    const dependencies: DetailedTaskSpec['dependencies'] = [];

    for (const depId of dependencyIds) {
      const result = this.results.get(depId);
      const output = this.taskOutputs.get(depId);

      if (result) {
        dependencies.push({
          taskId: depId,
          agent: 'unknown', // Could be enriched with task info
          summary: result.success ? 'Zakończone pomyślnie' : `Błąd: ${result.error || 'nieznany'}`,
          relevantData: output?.substring(0, 500), // Limit to prevent token overflow
        });
      }
    }

    return dependencies;
  }

  /**
   * Detect task type for specialized prompting
   */
  private detectTaskType(taskText: string): 'list' | 'code' | 'proposal' | 'analysis' | 'general' {
    const lower = taskText.toLowerCase();

    // List detection (numbers, items, points)
    if (
      /\d+\s*(ulepszeń|propozycji|punktów|elementów|kroków|rzeczy|pozycji|items)/i.test(lower) ||
      /lista|wypisz|wymień|wylicz|ponumeruj/i.test(lower)
    ) {
      return 'list';
    }

    // Code detection
    if (
      /kod|implementuj|napraw|zrefaktoruj|funkcj[aę]|metod[aę]|klas[aę]|fix|bug|błąd/i.test(
        lower,
      ) ||
      /typescript|javascript|python|java|css|html/i.test(lower)
    ) {
      return 'code';
    }

    // Proposal detection
    if (/zaproponuj|sugestie|pomysły|rekomendacje|usprawnienia|optymalizacj/i.test(lower)) {
      return 'proposal';
    }

    // Analysis detection (but we want to avoid pure analysis)
    if (/przeanalizuj|zbadaj|sprawdź|oceń|review/i.test(lower)) {
      return 'analysis';
    }

    return 'general';
  }

  /**
   * Normalize MCP tool name to correct format (serverName__toolName)
   */
  private normalizeMcpToolName(toolName: string): string {
    // Convert various formats to the standard serverName__toolName format
    // Examples:
    //   "filesystem/list_directory" -> "filesystem__list_directory"
    //   "filesystem__list_directory" -> "filesystem__list_directory" (unchanged)
    //   "list_directory" -> "filesystem__list_directory" (assume filesystem)
    //   "mcp__filesystem__read_file" -> "filesystem__read_file"

    let normalized = toolName
      .replace(/\s+with\s+params:.*$/i, '') // Remove "with params: {...}" suffix
      .replace(/^mcp__/i, '') // Remove "mcp__" prefix if present
      .replace(/\s*\{.*\}\s*$/s, '') // Remove JSON params at end
      .trim();

    // Convert slash to double underscore
    if (normalized.includes('/')) {
      normalized = normalized.replace(/\//g, '__');
    }

    // Convert dots to double underscore (e.g., "filesystem.list_directory")
    if (normalized.includes('.') && !normalized.includes('__')) {
      normalized = normalized.replace(/\./g, '__');
    }

    // Convert colons to double underscore (e.g., "filesystem:list_directory")
    if (normalized.includes(':') && !normalized.includes('__')) {
      normalized = normalized.replace(/:/g, '__');
    }

    // If no server prefix, try to infer from tool name
    if (!normalized.includes('__')) {
      // Filesystem tools
      if (
        normalized.match(
          /^(list_directory|read_file|write_file|read_multiple_files|directory_tree|search_files|get_file_info|create_directory|move_file|read_text_file|read_media_file|list_directory_with_sizes|list_allowed_directories|edit_file)$/i,
        )
      ) {
        normalized = `filesystem__${normalized}`;
      }
      // Memory tools
      else if (
        normalized.match(
          /^(create_entities|search_nodes|read_graph|add_observations|delete_entities|delete_observations|delete_relations|create_relations|open_nodes)$/i,
        )
      ) {
        normalized = `memory__${normalized}`;
      }
      // Serena tools
      else if (
        normalized.match(
          /^(find_symbol|get_symbols_overview|replace_symbol_body|insert_after_symbol|insert_before_symbol|rename_symbol|find_referencing_symbols|replace_content|search_for_pattern|find_file|list_dir|create_text_file|read_file|write_memory|read_memory|list_memories|delete_memory|edit_memory|execute_shell_command)$/i,
        )
      ) {
        normalized = `serena__${normalized}`;
      }
    }

    return normalized;
  }

  /**
   * Map generic params to tool-specific parameter names
   * Handles different MCP servers with different parameter conventions
   */
  private mapToolParams(
    toolName: string,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    // Get base tool name and server
    const [server, ...toolParts] = toolName.split('__');
    const baseTool = toolParts.join('__') || server;

    switch (server) {
      case 'serena':
        return this.mapToSerenaParams(toolName, params);

      case 'brave-search': {
        // brave-search expects: q (query), count (optional)
        // Remove 'path' parameter as it's not supported
        const braveParams: Record<string, unknown> = {};
        if (params.q) braveParams.q = params.q;
        else if (params.query) braveParams.q = params.query;
        if (params.count) braveParams.count = params.count;
        // Explicitly DO NOT include 'path' - brave-search doesn't support it
        return braveParams;
      }

      case 'context7': {
        // context7 expects: libraryId, query (for query-docs)
        // OR: query (for resolve-library-id)
        const context7Params: Record<string, unknown> = {};
        if (baseTool === 'query-docs') {
          // query-docs REQUIRES libraryId - try to extract from context or use default
          context7Params.libraryId = params.libraryId || params.library || 'typescript';
          context7Params.query = params.query || params.q || '';
        } else if (baseTool === 'resolve-library-id') {
          context7Params.query = params.query || params.q || params.libraryName || '';
        }
        // Do NOT include 'path' - context7 doesn't use local paths
        return context7Params;
      }

      case 'puppeteer': {
        // puppeteer uses 'url' parameter, not 'path'
        const puppeteerParams: Record<string, unknown> = { ...params };
        // Keep url as-is - it's supposed to be a URL
        if (puppeteerParams.path) {
          delete puppeteerParams.path; // Remove invalid 'path' parameter
        }
        return puppeteerParams;
      }

      case 'playwright': {
        // playwright uses 'url' parameter for navigation
        const playwrightParams: Record<string, unknown> = { ...params };
        if (playwrightParams.path) {
          delete playwrightParams.path; // Remove invalid 'path' parameter
        }
        return playwrightParams;
      }

      case 'github': {
        // github expects query strings, not file paths
        const githubParams: Record<string, unknown> = { ...params };
        if (githubParams.path) {
          delete githubParams.path; // Remove invalid 'path' parameter
        }
        // Map common parameter names
        if (githubParams.q && !githubParams.query) {
          githubParams.query = githubParams.q;
          delete githubParams.q;
        }
        return githubParams;
      }

      case 'memory': {
        // memory (knowledge graph) uses query for search, not path
        const memoryParams: Record<string, unknown> = { ...params };
        if (memoryParams.path) {
          delete memoryParams.path; // Remove invalid 'path' parameter
        }
        return memoryParams;
      }

      case 'filesystem':
        // filesystem uses 'path' correctly - no changes needed
        return params;

      case 'desktop-commander':
        // desktop-commander uses 'path' correctly - no changes needed
        return params;

      default: {
        // For unknown servers, pass params as-is but remove 'path' if it looks problematic
        const defaultParams = { ...params };
        // Only keep path if it looks like a valid local path (not URL, not external)
        if (defaultParams.path && this.isUrlOrExternalResource(String(defaultParams.path))) {
          delete defaultParams.path;
        }
        return defaultParams;
      }
    }
  }

  /**
   * Map generic params to Serena-specific parameter names
   * Serena uses different param names than filesystem MCP:
   * - list_dir: relative_path, recursive (not path)
   * - find_file: relative_path, file_mask (not path, pattern)
   * - read_file: relative_path (not path)
   * - create_text_file: relative_path, content (not path, content)
   */
  private mapToSerenaParams(
    toolName: string,
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};

    // Get the base tool name (after serena__)
    const baseTool = toolName.replace('serena__', '');

    switch (baseTool) {
      case 'list_dir':
        // Serena list_dir expects: relative_path, recursive
        if (params.path) {
          // Convert absolute path to relative if it starts with rootDir
          mapped.relative_path = this.toRelativePath(String(params.path));
        } else if (params.relative_path) {
          mapped.relative_path = params.relative_path;
        } else {
          mapped.relative_path = '.';
        }
        mapped.recursive = params.recursive ?? false;
        break;

      case 'find_file':
        // Serena find_file expects: relative_path, file_mask
        if (params.path) {
          mapped.relative_path = this.toRelativePath(String(params.path));
        } else if (params.relative_path) {
          mapped.relative_path = params.relative_path;
        } else {
          mapped.relative_path = '.';
        }
        // Map pattern -> file_mask
        mapped.file_mask = params.file_mask || params.pattern || '*';
        break;

      case 'read_file':
        // BUG-008 FIX: Serena/native read_file expects: relative_path (required!)
        // Ensure we always pass a path, fallback to "." if missing
        if (params.path) {
          mapped.relative_path = this.toRelativePath(String(params.path));
        } else if (params.relative_path) {
          mapped.relative_path = params.relative_path;
        } else if (params.file || params.filename) {
          mapped.relative_path = params.file || params.filename;
        } else {
          // BUG-008: Log warning when path is missing
          console.log(
            chalk.yellow(
              `│ [MCP] WARNING: read_file called without path, original params: ${JSON.stringify(params)}`,
            ),
          );
        }
        break;

      case 'create_text_file':
        // Serena create_text_file expects: relative_path, content
        if (params.path) {
          mapped.relative_path = this.toRelativePath(String(params.path));
        } else if (params.relative_path) {
          mapped.relative_path = params.relative_path;
        }
        mapped.content = params.content || '';
        break;

      case 'search_for_pattern': {
        // BUG-007 FIX: Serena MCP expects: substring_pattern (NOT pattern!), relative_path
        // Native tools use 'pattern' but real Serena MCP uses 'substring_pattern'
        const searchPattern = params.pattern || params.query || params.substring_pattern || '';
        mapped.substring_pattern = searchPattern; // Real Serena MCP parameter name
        mapped.pattern = searchPattern; // Also keep pattern for native tools
        if (params.path) {
          mapped.relative_path = this.toRelativePath(String(params.path));
        } else if (params.relative_path) {
          mapped.relative_path = params.relative_path;
        }
        break;
      }

      default:
        // For other Serena tools, pass params as-is but map common aliases
        Object.assign(mapped, params);
        if (params.path && !params.relative_path) {
          mapped.relative_path = this.toRelativePath(String(params.path));
          delete mapped.path;
        }
    }

    return mapped;
  }

  /**
   * Convert absolute path to relative path from project root
   */
  private toRelativePath(absolutePath: string): string {
    // If already relative, return as-is
    if (!path.isAbsolute(absolutePath)) {
      return absolutePath;
    }

    // Convert to relative from rootDir
    const relativePath = path.relative(this.rootDir, absolutePath);

    // If path goes outside rootDir (starts with ..), use the original
    if (relativePath.startsWith('..')) {
      return absolutePath;
    }

    // Return relative path, or '.' if it's the root itself
    return relativePath || '.';
  }

  /**
   * Execute MCP tool task
   */
  private async executeMcpTask(task: ExtendedTask, agent: Agent): Promise<ExecutionResult> {
    const toolName = this.normalizeMcpToolName(task.mcpTool ?? '');

    // Use auto-extracted params if available
    let params: Record<string, unknown> =
      ((task as unknown as Record<string, unknown>)._autoParams as Record<string, unknown>) || {};

    // Parse params from task description if not auto-extracted
    if (Object.keys(params).length === 0) {
      const paramsMatch = task.task.match(/with params:\s*(\{[^}]+\})/i);
      if (paramsMatch) {
        try {
          params = JSON.parse(paramsMatch[1]);
        } catch {}
      }

      // Extract path from task text if still no params
      if (!params.path) {
        // Match: "path '.'", "ścieżki '.'", "dla '.'", etc. (short paths like . or ..)
        const shortPathMatch = task.task.match(
          /(?:path|ścieżk[ai]|dla|directory|katalogu?)\s*['"]?(\.\.?|~)['"]?/i,
        );
        if (shortPathMatch) {
          // Resolve relative paths against rootDir
          params.path = path.resolve(this.rootDir, shortPathMatch[1]);
        }
        // Match: quoted paths like 'test.txt', "file.js", 'config.json'
        else {
          const quotedPathMatch = task.task.match(
            /['"]([^'"]+\.[a-z0-9]+)['"]|['"]([^'"/\\]+)['"](?=\s|,|$)/i,
          );
          if (quotedPathMatch) {
            const extractedPath = quotedPathMatch[1] || quotedPathMatch[2];
            // Resolve relative paths against rootDir
            params.path = path.isAbsolute(extractedPath)
              ? extractedPath
              : path.resolve(this.rootDir, extractedPath);
          }
          // Match: absolute paths (Windows or Unix)
          else {
            const absPathMatch = task.task.match(/["']?([A-Z]:\\[^"'\s]+|\/[^"'\s]+)["']?/i);
            if (absPathMatch) {
              params.path = absPathMatch[1].replace(/["']/g, '');
            }
            // DEFAULT: If no path found, use rootDir (not process.cwd())
            else {
              console.log(
                chalk.yellow(`│ [MCP] Brak ścieżki w zadaniu - używam rootDir: ${this.rootDir}`),
              );
              params.path = this.rootDir;
            }
          }
        }
      }

      // Extract content param for write operations
      if (!params.content && toolName.includes('write')) {
        const contentMatch = task.task.match(
          /(?:treści?ą?|content|tekst(?:em)?)\s*['"]([^'"]+)['"]/i,
        );
        if (contentMatch) {
          params.content = contentMatch[1];
        }
      }
    }

    // VALIDATE PATH PARAMETER before MCP call
    if (params.path) {
      const validatedPath = this.validateAndNormalizePath(params.path as string);
      if (!validatedPath) {
        console.log(chalk.red(`│ [MCP] BŁĄD: Nieprawidłowa ścieżka: ${params.path}`));
        return {
          id: task.id,
          success: false,
          error: `Invalid path: ${params.path} - must be within project root: ${this.rootDir}`,
          logs: [`MCP PATH ERROR: ${params.path} is outside project root`],
        };
      }
      params.path = validatedPath;
    }

    // TOOL-SPECIFIC PARAMETER MAPPING
    // Different MCP servers expect different parameter formats
    params = this.mapToolParams(toolName, params);

    console.log(chalk.blue(`│ [MCP] Wywołuję: ${toolName}`));
    console.log(chalk.gray(`│ [MCP] Params: ${JSON.stringify(params)}`));

    try {
      const mcpResult = await mcpManager.callTool(toolName, params);

      // Extract content
      let content = '';
      if (mcpResult.content && Array.isArray(mcpResult.content)) {
        content = mcpResult.content
          .map((c: { type?: string; text?: string }) =>
            c.type === 'text' ? c.text : JSON.stringify(c),
          )
          .join('\n');
      } else {
        content = JSON.stringify(mcpResult);
      }

      // CHECK FOR MCP ERRORS in response
      const hasMcpError = mcpResult.isError || this.isMcpError(content);
      if (hasMcpError) {
        console.log(chalk.red(`│ [MCP] Wykryto błąd w odpowiedzi: ${content.substring(0, 200)}`));
        return {
          id: task.id,
          success: false,
          error: `MCP returned error: ${content.substring(0, 500)}`,
          logs: [`MCP ERROR: ${toolName}\n${content}`],
        };
      }

      // Pokaż podgląd wyniku MCP
      const contentPreview = content.substring(0, 300).replace(/\n/g, ' ');
      console.log(
        chalk.green(`│ [MCP] Odpowiedź: ${contentPreview}${content.length > 300 ? '...' : ''}`),
      );
      console.log(chalk.gray(`│ [MCP] Rozmiar: ${content.length} znaków`));

      // Let agent process result and EXECUTE the actual task (with timeout)
      console.log(chalk.yellow(`│ [Agent] Przetwarzam wyniki i wykonuję zadanie...`));
      const execution = await agent.think(
        `WYNIK NARZĘDZIA MCP "${toolName}":
${content.substring(0, 3000)}

KATALOG ROBOCZY PROJEKTU: ${this.rootDir}

TWOJE ZADANIE: ${task.task}

INSTRUKCJA WYKONANIA (WAŻNE - CZYTAJ UWAŻNIE):
Masz teraz dane z narzędzia MCP. WYKONAJ swoje zadanie używając tych danych.

JEŚLI ZADANIE WYMAGA NAPRAWY/MODYFIKACJI KODU:
1. Przeanalizuj kod źródłowy
2. NAPISZ KOMPLETNY POPRAWIONY KOD (nie fragmenty)
3. Na końcu odpowiedzi dodaj blok ZAPIS:
   ===ZAPIS===
   PLIK: ${this.rootDir}\\[sciezka_wzgledna_do_pliku]
   KOD:
   \`\`\`
   [kompletna zawartość pliku po zmianach]
   \`\`\`
   ===KONIEC_ZAPISU===

JEŚLI ZADANIE WYMAGA UTWORZENIA NOWEGO PLIKU:
1. NAPISZ KOMPLETNY KOD
2. Dodaj blok ZAPIS jak wyżej

JEŚLI ZADANIE WYMAGA TYLKO ANALIZY/LISTY/PROPOZYCJI:
- WYKONAJ konkretne działanie opisane w zadaniu
- Jeśli zadanie wymaga stworzenia listy - STWÓRZ TĘ LISTĘ
- Jeśli zadanie wymaga propozycji - ZAPROPONUJ KONKRETNE ROZWIĄZANIA

KRYTYCZNE: Wszystkie ścieżki MUSZĄ zaczynać się od ${this.rootDir}
NIGDY nie pisz "należałoby zrobić X" - PO PROSTU ZRÓB X!
Odpowiadaj PO POLSKU z konkretnymi wynikami.`,
        '',
        { timeout: this.config.taskTimeout },
      );

      console.log(chalk.green(`│ [Agent] Zadanie wykonane`));

      // Check if agent wants to write code changes
      const writeResult = await this.processCodeChanges(execution, task.id);
      if (writeResult) {
        return writeResult;
      }

      return {
        id: task.id,
        success: true,
        logs: [`MCP: ${toolName}\n${execution}`],
      };
    } catch (error: unknown) {
      console.log(chalk.red(`│ [MCP] BŁĄD: ${getErrorMessage(error)}`));
      return {
        id: task.id,
        success: false,
        error: `MCP Tool Error: ${getErrorMessage(error)}`,
        logs: [`MCP FAILED: ${toolName} - ${getErrorMessage(error)}`],
      };
    }
  }

  /**
   * Process code changes from agent response and write to files via MCP
   * Detects ===ZAPIS=== blocks and executes filesystem__write_file
   * NOW WITH PATH VALIDATION - prevents writing outside project root
   * NOW WITH EXTENSION VALIDATION - prevents wrong file types
   */
  private async processCodeChanges(
    agentResponse: string,
    taskId: number,
  ): Promise<ExecutionResult | null> {
    // Pattern 1: Full format ===ZAPIS===\nPLIK:...\n===KONIEC_ZAPISU===
    const savePattern1 =
      /===ZAPIS===\s*\n\s*PLIK:\s*(.+?)\s*\n\s*KOD:\s*\n```[\w]*\n([\s\S]*?)\n```\s*\n===KONIEC_ZAPISU===/gi;

    // Pattern 2: Compact format ===ZAPIS: path===\n```code```\n===KONIEC===
    const savePattern2 =
      /===ZAPIS:\s*(.+?)===\s*\n```[\w]*\n([\s\S]*?)\n```\s*\n?===(?:KONIEC)?===/gi;

    // Pattern 3: Inline format ===ZAPIS: path===\ncode\n===KONIEC===
    const savePattern3 = /===ZAPIS:\s*(.+?)===\s*\n([\s\S]*?)\n===(?:KONIEC)?===/gi;

    const matches1 = [...agentResponse.matchAll(savePattern1)];
    const matches2 = [...agentResponse.matchAll(savePattern2)];
    const matches3 = [...agentResponse.matchAll(savePattern3)];

    const allMatches = [...matches1, ...matches2, ...matches3];

    if (allMatches.length === 0) {
      return null; // No code changes to process
    }

    // Valid extensions for this TypeScript/Node.js project
    const _validExtensions = [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.json',
      '.md',
      '.yaml',
      '.yml',
      '.toml',
      '.css',
      '.html',
      '.sh',
      '.bat',
      '.ps1',
    ];
    const invalidExtensions = [
      '.py',
      '.java',
      '.cs',
      '.go',
      '.rs',
      '.rb',
      '.php',
      '.c',
      '.cpp',
      '.h',
    ];

    // Filter out invalid file types
    const validMatches = allMatches.filter((match) => {
      const filePath = match[1].trim();
      const ext = path.extname(filePath).toLowerCase();

      if (invalidExtensions.includes(ext)) {
        console.log(
          chalk.red(
            `│ [AUTO-WRITE] ODRZUCONO: ${filePath} - nieprawidłowe rozszerzenie ${ext} dla projektu TypeScript`,
          ),
        );
        return false;
      }
      return true;
    });

    if (validMatches.length === 0) {
      console.log(
        chalk.yellow(
          `│ [AUTO-WRITE] Brak prawidłowych plików do zapisu (odrzucono ${allMatches.length} z powodu rozszerzenia)`,
        ),
      );
      return {
        id: taskId,
        success: false,
        error: 'Agent próbował zapisać pliki z nieprawidłowym rozszerzeniem',
        logs: [`❌ Odrzucono ${allMatches.length} plików z nieprawidłowym rozszerzeniem`],
      };
    }

    const matches = validMatches;

    const writeResults: string[] = [];
    let allSuccess = true;

    for (const match of matches) {
      let rawFilePath = match[1].trim();
      // Remove trailing parenthetical descriptions like "(nowy plik)" or stray ")"
      // This prevents AI hallucinations from corrupting file paths
      rawFilePath = rawFilePath.replace(/\s*\([^)]*\)\s*$/, '').replace(/\)$/, '');
      const codeContent = match[2];

      // CRITICAL: Validate and normalize path BEFORE writing
      const validatedPath = this.validateAndNormalizePath(rawFilePath);

      if (!validatedPath) {
        console.log(chalk.red(`│ [AUTO-WRITE] ZABLOKOWANO: Nieprawidłowa ścieżka: ${rawFilePath}`));
        console.log(chalk.red(`│ [AUTO-WRITE] Ścieżka musi być w: ${this.rootDir}`));
        writeResults.push(`❌ ZABLOKOWANO: ${rawFilePath} - poza katalogiem projektu`);
        allSuccess = false;
        continue;
      }

      console.log(chalk.magenta(`│ [AUTO-WRITE] Zapisuję zmiany do: ${validatedPath}`));

      try {
        // Use native fs instead of MCP filesystem
        await fs.mkdir(path.dirname(validatedPath), { recursive: true });
        await fs.writeFile(validatedPath, codeContent, 'utf-8');
        console.log(chalk.green(`│ [AUTO-WRITE] ✓ Zapisano: ${validatedPath}`));
        writeResults.push(`✓ Zapisano: ${validatedPath}`);

        // Clear cache for this file (it's been modified)
        this.clearFileCache(validatedPath);
      } catch (error: unknown) {
        console.log(chalk.red(`│ [AUTO-WRITE] BŁĄD: ${getErrorMessage(error)}`));
        writeResults.push(`❌ BŁĄD zapisu ${validatedPath}: ${getErrorMessage(error)}`);
        allSuccess = false;
      }
    }

    // Remove the ZAPIS blocks from output for cleaner logs
    let cleanedResponse = agentResponse;
    cleanedResponse = cleanedResponse.replace(savePattern1, '');
    cleanedResponse = cleanedResponse.replace(savePattern2, '');
    cleanedResponse = cleanedResponse.replace(savePattern3, '');
    cleanedResponse = cleanedResponse.trim();

    return {
      id: taskId,
      success: allSuccess,
      logs: [cleanedResponse, '\n📝 ZMIANY W PLIKACH:', ...writeResults],
    };
  }

  /**
   * Execute EXEC protocol command
   * Ported from PS1 lines 603-638
   */
  private async executeExecProtocol(taskId: number, resultText: string): Promise<ExecutionResult> {
    const match = resultText.match(/EXEC:\s*(.*)/);
    if (!match) {
      return {
        id: taskId,
        success: true,
        logs: [resultText],
      };
    }

    let cmd = match[1].trim();

    // Sanitize: remove leading garbage characters (common Ollama hallucination)
    cmd = cmd.replace(/^[)\]}>:;,]+\s*/, '');

    // Check if this is an MCP native tool call (not a shell command)
    if (cmd.startsWith('native/') || cmd.startsWith('mcp/') || cmd.startsWith('playwright/')) {
      console.log(
        chalk.yellow(`  [EXEC] Detected MCP tool call in EXEC: ${cmd.substring(0, 40)}...`),
      );
      // Parse MCP tool call: native/tool_name "arg1" "arg2" or native/tool_name arg1 arg2
      const toolMatch = cmd.match(/^(native|mcp|playwright)\/(\w+)\s*(.*)/);
      if (toolMatch) {
        const [, prefix, toolName, argsStr] = toolMatch;
        const fullToolName = `${prefix}/${toolName}`;
        // Parse arguments - handle quoted strings and simple args
        const args = argsStr.match(/"[^"]*"|\S+/g) || [];
        const cleanArgs = args.map((a) => a.replace(/^"|"$/g, ''));
        console.log(chalk.gray(`  [MCP] Redirecting to: ${fullToolName}(${cleanArgs.join(', ')})`));
        try {
          const result = await mcpManager.callTool(fullToolName, {
            pattern: cleanArgs[0],
            directory: cleanArgs[1] || this.rootDir,
            path: cleanArgs[1] || cleanArgs[0] || this.rootDir,
          });
          return {
            id: taskId,
            success: true,
            logs: [`[MCP:${fullToolName}] ${JSON.stringify(result).substring(0, 500)}`],
          };
        } catch (mcpError: unknown) {
          return {
            id: taskId,
            success: false,
            error: `MCP call failed: ${getErrorMessage(mcpError)}`,
            logs: [`[MCP:${fullToolName}] ERROR: ${getErrorMessage(mcpError)}`],
          };
        }
      }
    }

    // Validate command - reject obviously invalid shell commands
    if (!cmd || cmd.length < 2 || /^[^a-zA-Z0-9/.\\]/.test(cmd)) {
      console.log(chalk.yellow(`  [EXEC] Invalid command rejected: "${cmd.substring(0, 30)}..."`));
      return {
        id: taskId,
        success: false,
        error: `Invalid EXEC command format: ${cmd.substring(0, 50)}`,
        logs: [`EXEC rejected - invalid format. Command must start with valid shell command.`],
      };
    }

    // Translate Linux commands to Windows equivalents when on Windows
    if (process.platform === 'win32') {
      cmd = this.translateLinuxToWindows(cmd);
    }

    console.log(chalk.gray(`  [EXEC] Running: ${cmd.substring(0, 50)}...`));

    try {
      // Platform-specific execution
      const isWindows = process.platform === 'win32';

      // Build the full command with proper shell
      const fullCommand = isWindows
        ? `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${cmd.replace(/"/g, '\\"')}"`
        : `bash -c "${cmd.replace(/"/g, '\\"')}"`;

      // NAPRAWKA: Usunięto shell override - powershell.exe już jest w fullCommand
      // Poprzednio był shell mismatch: powershell.exe uruchamiany przez cmd.exe
      const { stdout, stderr } = await execAsync(fullCommand, {
        timeout: this.config.taskTimeout,
        windowsHide: this.config.silentExec,
        // NIE ustawiamy shell - pozwalamy Node.js użyć domyślnej powłoki
      });

      const output = `EXECUTION REPORT:
COMMAND: ${cmd}
OUTPUT:
${stdout}
${stderr ? `STDERR:\n${stderr}` : ''}`;

      return {
        id: taskId,
        success: true,
        logs: [output],
      };
    } catch (error: unknown) {
      return {
        id: taskId,
        success: false,
        error: `EXEC FAILED: ${getErrorMessage(error)}`,
        logs: [`EXEC FAILURE:\nCOMMAND: ${cmd}\nERROR: ${getErrorMessage(error)}`],
      };
    }
  }

  /**
   * Translate Linux shell commands to Windows equivalents.
   * Agents (LLMs) often generate Linux commands regardless of platform.
   * This ensures they work on Windows by converting common patterns.
   */
  private translateLinuxToWindows(cmd: string): string {
    const original = cmd;

    // grep -r "pattern" path → findstr /S /I /C:"pattern" "path\*"
    cmd = cmd.replace(
      /^grep\s+(-[a-zA-Z]*r[a-zA-Z]*\s+)?(?:-[a-zA-Z]+\s+)*["']?([^"'\s]+)["']?\s+(.+)$/,
      (_, _flags, pattern, searchPath) => {
        const cleanPath = searchPath.replace(/\/$/, '').trim();
        return `findstr /S /I /C:"${pattern}" "${path.resolve(this.rootDir, cleanPath)}\\*"`;
      },
    );

    // grep "pattern" file → findstr /I /C:"pattern" "file"
    cmd = cmd.replace(
      /^grep\s+(?:-[a-zA-Z]+\s+)*["']?([^"'\s]+)["']?\s+(.+)$/,
      (_, pattern, filePath) => {
        return `findstr /I /C:"${pattern}" "${path.resolve(this.rootDir, filePath.trim())}"`;
      },
    );

    // find path -name "pattern" → Get-ChildItem -Path "path" -Filter "pattern" -Recurse -File
    cmd = cmd.replace(/^find\s+(\S+)\s+-name\s+["']?([^"'\s]+)["']?/, (_, searchPath, pattern) => {
      const cleanPath = path.resolve(this.rootDir, searchPath.trim());
      return `Get-ChildItem -Path "${cleanPath}" -Filter "${pattern}" -Recurse -File | Select-Object -ExpandProperty FullName`;
    });

    // find path -type f → Get-ChildItem -Path "path" -Recurse -File
    cmd = cmd.replace(/^find\s+(\S+)\s+-type\s+f/, (_, searchPath) => {
      const cleanPath = path.resolve(this.rootDir, searchPath.trim());
      return `Get-ChildItem -Path "${cleanPath}" -Recurse -File | Select-Object -ExpandProperty FullName`;
    });

    // find path -type d → Get-ChildItem -Path "path" -Recurse -Directory
    cmd = cmd.replace(/^find\s+(\S+)\s+-type\s+d/, (_, searchPath) => {
      const cleanPath = path.resolve(this.rootDir, searchPath.trim());
      return `Get-ChildItem -Path "${cleanPath}" -Recurse -Directory | Select-Object -ExpandProperty FullName`;
    });

    // cat file → Get-Content "file"
    cmd = cmd.replace(/^cat\s+(.+)$/, (_, filePath) => {
      return `Get-Content "${path.resolve(this.rootDir, filePath.trim())}"`;
    });

    // ls -la path | ls -l path | ls path → Get-ChildItem "path"
    cmd = cmd.replace(/^ls\s+(?:-[a-zA-Z]+\s+)*(.*)$/, (_, dirPath) => {
      const cleanPath = dirPath.trim() || this.rootDir;
      return `Get-ChildItem "${path.resolve(this.rootDir, cleanPath)}"`;
    });

    // head -n N file → Get-Content "file" -Head N
    cmd = cmd.replace(/^head\s+-n?\s*(\d+)\s+(.+)$/, (_, n, filePath) => {
      return `Get-Content "${path.resolve(this.rootDir, filePath.trim())}" -Head ${n}`;
    });

    // tail -n N file → Get-Content "file" -Tail N
    cmd = cmd.replace(/^tail\s+-n?\s*(\d+)\s+(.+)$/, (_, n, filePath) => {
      return `Get-Content "${path.resolve(this.rootDir, filePath.trim())}" -Tail ${n}`;
    });

    // wc -l file → (Get-Content "file" | Measure-Object -Line).Lines
    cmd = cmd.replace(/^wc\s+-l\s+(.+)$/, (_, filePath) => {
      return `(Get-Content "${path.resolve(this.rootDir, filePath.trim())}" | Measure-Object -Line).Lines`;
    });

    // which command → Get-Command "command"
    cmd = cmd.replace(/^which\s+(.+)$/, (_, command) => {
      return `Get-Command "${command.trim()}" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source`;
    });

    // rm -rf path → Remove-Item "path" -Recurse -Force (BLOCKED for safety)
    // rm/chmod are NOT translated - they should be blocked by security

    if (cmd !== original) {
      console.log(
        chalk.cyan(
          `  [EXEC] Translated: "${original.substring(0, 40)}..." → "${cmd.substring(0, 40)}..."`,
        ),
      );
    }

    return cmd;
  }

  /**
   * Get current status
   */
  getStatus(): { completed: number; total: number; failed: number } {
    const results = Array.from(this.results.values());
    return {
      completed: results.length,
      total: this.completedTasks.size,
      failed: results.filter((r) => !r.success).length,
    };
  }
}

/**
 * Simple execution helper (for single-use)
 */
export async function executeGraphTasks(
  tasks: SwarmTask[],
  config?: GraphProcessorConfig,
): Promise<ExecutionResult[]> {
  const processor = new GraphProcessor(config);
  return processor.process(tasks);
}

export default GraphProcessor;

/**
 * CommandRegistry - Main class for CLI command management
 *
 * Provides unified command registration, execution, help generation,
 * rate limiting with token bucket algorithm, and fuzzy matching.
 *
 * @module cli/commandregistry/CommandRegistry
 */

import chalk from 'chalk';
import type { ErrorCommandContext, ErrorHandler, ErrorLogEntry } from '../CommandErrors.js';

// Import error handling
import {
  CommandError,
  CommandErrorCode,
  detectErrorCode,
  ExecutionError,
  globalErrorLogger,
  isRetryableError,
  TemporaryError,
  ValidationError,
} from '../CommandErrors.js';
// Import enhanced argument parser
import {
  type CommandWithFlags,
  parseArgs as enhancedParseArgs,
  generateFlagHelp,
  tokenizeInput,
  validateCommandFlags,
} from '../EnhancedArgParser.js';

// Import types
import type {
  ArgType,
  Command,
  CommandArg,
  CommandContext,
  CommandInfo,
  CommandPriority,
  CommandRateLimitConfig,
  CommandResult,
  ConflictInfo,
  ConflictLogger,
  FlagDefinition,
  ParsedArgs,
  RateLimitConfig,
  RateLimitStatus,
  ValidationResult,
} from './types.js';

import { RateLimitExceededError, type RegisterOptions } from './types.js';

// ============================================================================
// Default Logger
// ============================================================================

/**
 * Default console logger
 */
const defaultLogger: ConflictLogger = {
  warn: (msg: string) => console.warn(chalk.yellow(`[CommandRegistry] ${msg}`)),
  info: (msg: string) => console.log(chalk.gray(`[CommandRegistry] ${msg}`)),
  debug: (msg: string) => console.log(chalk.dim(`[CommandRegistry] ${msg}`)),
};

// ============================================================================
// CommandRegistry Class
// ============================================================================

/**
 * Registry for managing CLI commands with rate limiting
 */
export class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private aliasMap: Map<string, string> = new Map();
  private categories: Map<string, Set<string>> = new Map();
  private namespaces: Map<string, Set<string>> = new Map();
  private conflictHistory: ConflictInfo[] = [];
  private debugMode: boolean = false;
  private logger: ConflictLogger;

  // Rate limiting - Token Bucket state
  private rateLimitConfig: RateLimitConfig = {
    maxCommandsPerSecond: 10,
    maxCommandsPerMinute: 60,
    enabled: false,
  };
  private tokensPerSecond: number = 10;
  private tokensPerMinute: number = 60;
  private lastSecondRefill: number = Date.now();
  private lastMinuteRefill: number = Date.now();

  // Sliding window for command tracking
  private commandHistory: { command: string; timestamp: number }[] = [];
  private readonly HISTORY_RETENTION_MS = 60000;

  // Whitelist for commands that bypass rate limiting
  private whitelistedCommands: Set<string> = new Set(['help', 'h', '?', 'version', 'v']);

  // Per-command rate limits (stricter than global)
  private perCommandLimits: Map<string, CommandRateLimitConfig> = new Map();

  // Global error handler for all command errors
  private globalErrorHandler: ErrorHandler | null = null;

  // Default timeout for command execution (30 seconds)
  private defaultTimeout: number = 30000;

  constructor(logger?: ConflictLogger) {
    this.logger = logger || defaultLogger;
  }

  // ============================================================================
  // Error Handling Methods
  // ============================================================================

  setErrorHandler(handler: ErrorHandler): void {
    this.globalErrorHandler = handler;
    this.debugLog('Global error handler set');
  }

  removeErrorHandler(): void {
    this.globalErrorHandler = null;
    this.debugLog('Global error handler removed');
  }

  getErrorHandler(): ErrorHandler | null {
    return this.globalErrorHandler;
  }

  setDefaultTimeout(timeoutMs: number): void {
    if (timeoutMs < 0) {
      throw new Error('Timeout must be non-negative');
    }
    this.defaultTimeout = timeoutMs;
    this.debugLog(`Default timeout set to ${timeoutMs}ms`);
  }

  getDefaultTimeout(): number {
    return this.defaultTimeout;
  }

  getErrorLog(): ErrorLogEntry[] {
    return globalErrorLogger.getLog();
  }

  clearErrorLog(): void {
    globalErrorLogger.clear();
    this.debugLog('Error log cleared');
  }

  getUnresolvedErrors(): ErrorLogEntry[] {
    return globalErrorLogger.getUnresolved();
  }

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  setLogger(logger: ConflictLogger): void {
    this.logger = logger;
  }

  private debugLog(message: string): void {
    if (this.debugMode) {
      this.logger.debug(message);
    }
  }

  // ============================================================================
  // Namespace and Priority Helpers
  // ============================================================================

  private getFullName(command: Command): string {
    if (command.namespace) {
      return `${command.namespace}.${command.name}`;
    }
    return command.name;
  }

  parseNamespacedName(identifier: string): { namespace?: string; name: string } {
    const parts = identifier.split('.');
    if (parts.length > 1) {
      return {
        namespace: parts.slice(0, -1).join('.'),
        name: parts[parts.length - 1],
      };
    }
    return { name: identifier };
  }

  getPriorityString(priority: CommandPriority): string {
    switch (priority) {
      case 2:
        return 'built-in'; // BUILTIN
      case 1:
        return 'user'; // USER
      case 0:
        return 'plugin'; // PLUGIN
      default:
        return 'unknown';
    }
  }

  // ============================================================================
  // Conflict Detection
  // ============================================================================

  private checkConflicts(
    command: Command,
    options: RegisterOptions = {},
  ): { hasConflict: boolean; conflicts: ConflictInfo[] } {
    const conflicts: ConflictInfo[] = [];
    const fullName = this.getFullName(command);
    const newPriority = command.priority ?? 0; // PLUGIN

    // Check main name conflict
    if (this.commands.has(fullName)) {
      const existing = this.commands.get(fullName);
      if (!existing) throw new Error(`Unexpected missing command: ${fullName}`);
      const existingPriority = existing.priority ?? 0;
      conflicts.push({
        identifier: fullName,
        type: 'name',
        existingCommand: this.getFullName(existing),
        newCommand: fullName,
        existingPriority,
        newPriority,
        wouldOverwrite: newPriority > existingPriority || options.overwrite === true,
        timestamp: Date.now(),
      });
    }

    // Check alias conflicts
    for (const alias of command.aliases || []) {
      const fullAlias = command.namespace ? `${command.namespace}.${alias}` : alias;

      if (this.aliasMap.has(fullAlias)) {
        const existingName = this.aliasMap.get(fullAlias);
        if (!existingName) continue;
        const existing = this.commands.get(existingName);
        if (existing) {
          const existingPriority = existing.priority ?? 0;
          conflicts.push({
            identifier: fullAlias,
            type: 'alias',
            existingCommand: this.getFullName(existing),
            newCommand: fullName,
            existingPriority,
            newPriority,
            wouldOverwrite: newPriority > existingPriority || options.overwrite === true,
            timestamp: Date.now(),
          });
        }
      }

      if (this.commands.has(fullAlias)) {
        const existing = this.commands.get(fullAlias);
        if (!existing) continue;
        const existingPriority = existing.priority ?? 0;
        conflicts.push({
          identifier: fullAlias,
          type: 'alias',
          existingCommand: this.getFullName(existing),
          newCommand: fullName,
          existingPriority,
          newPriority,
          wouldOverwrite: newPriority > existingPriority || options.overwrite === true,
          timestamp: Date.now(),
        });
      }
    }

    // Check short name shadowing
    if (command.namespace && this.commands.has(command.name)) {
      const existing = this.commands.get(command.name);
      if (existing && !existing.namespace) {
        const existingPriority = existing.priority ?? 0;
        conflicts.push({
          identifier: command.name,
          type: 'name',
          existingCommand: existing.name,
          newCommand: fullName,
          existingPriority,
          newPriority,
          wouldOverwrite: false,
          timestamp: Date.now(),
        });
      }
    }

    return { hasConflict: conflicts.length > 0, conflicts };
  }

  private logConflicts(conflicts: ConflictInfo[], silent: boolean = false): void {
    if (silent) return;

    for (const conflict of conflicts) {
      const priorityStr = this.getPriorityString(conflict.existingPriority);
      const newPriorityStr = this.getPriorityString(conflict.newPriority);

      if (conflict.wouldOverwrite) {
        this.logger.warn(
          `Command ${conflict.type} '${conflict.identifier}' conflict: ` +
            `'${conflict.newCommand}' (${newPriorityStr}) overwrites ` +
            `'${conflict.existingCommand}' (${priorityStr})`,
        );
      } else {
        this.logger.warn(
          `Command ${conflict.type} '${conflict.identifier}' conflict: ` +
            `'${conflict.newCommand}' (${newPriorityStr}) blocked by ` +
            `'${conflict.existingCommand}' (${priorityStr})`,
        );
      }
    }
  }

  unregister(nameOrAlias: string): boolean {
    const command = this.get(nameOrAlias);
    if (!command) return false;

    const fullName = this.getFullName(command);
    this.commands.delete(fullName);

    for (const alias of command.aliases || []) {
      const fullAlias = command.namespace ? `${command.namespace}.${alias}` : alias;
      this.aliasMap.delete(fullAlias);
      if (command.namespace) {
        this.aliasMap.delete(alias);
      }
    }

    if (command.namespace) {
      this.aliasMap.delete(command.name);
    }

    const category = command.category || 'general';
    this.categories.get(category)?.delete(fullName);

    if (command.namespace) {
      this.namespaces.get(command.namespace)?.delete(fullName);
    }

    this.debugLog(`Unregistered command: ${fullName}`);
    return true;
  }

  // ============================================================================
  // Rate Limiting Methods
  // ============================================================================

  setRateLimit(config: Partial<RateLimitConfig>): void {
    if (config.maxCommandsPerSecond !== undefined) {
      this.rateLimitConfig.maxCommandsPerSecond = config.maxCommandsPerSecond;
      this.tokensPerSecond = config.maxCommandsPerSecond;
    }
    if (config.maxCommandsPerMinute !== undefined) {
      this.rateLimitConfig.maxCommandsPerMinute = config.maxCommandsPerMinute;
      this.tokensPerMinute = config.maxCommandsPerMinute;
    }
    if (config.enabled !== undefined) {
      this.rateLimitConfig.enabled = config.enabled;
    }
    this.debugLog(`Rate limit configured: ${JSON.stringify(this.rateLimitConfig)}`);
  }

  getRateLimitStatus(): RateLimitStatus {
    this.refillTokens();
    this.cleanupHistory();
    return {
      enabled: this.rateLimitConfig.enabled,
      tokensPerSecond: this.tokensPerSecond,
      tokensPerMinute: this.tokensPerMinute,
      maxTokensPerSecond: this.rateLimitConfig.maxCommandsPerSecond,
      maxTokensPerMinute: this.rateLimitConfig.maxCommandsPerMinute,
      lastRefillTime: Math.max(this.lastSecondRefill, this.lastMinuteRefill),
      whitelistedCommands: Array.from(this.whitelistedCommands),
      perCommandLimits: Object.fromEntries(this.perCommandLimits),
      recentCommands: [...this.commandHistory],
    };
  }

  addToWhitelist(...commands: string[]): void {
    for (const cmd of commands) {
      this.whitelistedCommands.add(cmd);
    }
    this.debugLog(`Added to whitelist: ${commands.join(', ')}`);
  }

  removeFromWhitelist(...commands: string[]): void {
    for (const cmd of commands) {
      this.whitelistedCommands.delete(cmd);
    }
    this.debugLog(`Removed from whitelist: ${commands.join(', ')}`);
  }

  isWhitelisted(command: string): boolean {
    if (this.whitelistedCommands.has(command)) return true;
    const realName = this.aliasMap.get(command);
    if (realName && this.whitelistedCommands.has(realName)) return true;
    return false;
  }

  setCommandRateLimit(command: string, config: CommandRateLimitConfig): void {
    this.perCommandLimits.set(command, config);
    this.debugLog(`Per-command rate limit set for '${command}': ${JSON.stringify(config)}`);
  }

  removeCommandRateLimit(command: string): void {
    this.perCommandLimits.delete(command);
    this.debugLog(`Per-command rate limit removed for '${command}'`);
  }

  private refillTokens(): void {
    const now = Date.now();
    const secondsElapsed = (now - this.lastSecondRefill) / 1000;
    if (secondsElapsed >= 1) {
      const tokensToAdd = Math.floor(secondsElapsed) * this.rateLimitConfig.maxCommandsPerSecond;
      this.tokensPerSecond = Math.min(
        this.rateLimitConfig.maxCommandsPerSecond,
        this.tokensPerSecond + tokensToAdd,
      );
      this.lastSecondRefill = now - (secondsElapsed % 1) * 1000;
    }
    const minutesElapsed = (now - this.lastMinuteRefill) / 60000;
    if (minutesElapsed >= 1) {
      const tokensToAdd = Math.floor(minutesElapsed) * this.rateLimitConfig.maxCommandsPerMinute;
      this.tokensPerMinute = Math.min(
        this.rateLimitConfig.maxCommandsPerMinute,
        this.tokensPerMinute + tokensToAdd,
      );
      this.lastMinuteRefill = now - (minutesElapsed % 1) * 60000;
    }
  }

  private cleanupHistory(): void {
    const cutoff = Date.now() - this.HISTORY_RETENTION_MS;
    this.commandHistory = this.commandHistory.filter((entry) => entry.timestamp > cutoff);
  }

  private checkPerCommandLimit(command: string): {
    allowed: boolean;
    retryAfterMs?: number;
    limitType?: 'second' | 'minute';
  } {
    const config = this.perCommandLimits.get(command);
    if (!config) return { allowed: true };

    const now = Date.now();
    const commandEntries = this.commandHistory.filter((e) => e.command === command);

    if (config.maxPerSecond !== undefined) {
      const oneSecondAgo = now - 1000;
      const recentCount = commandEntries.filter((e) => e.timestamp > oneSecondAgo).length;
      if (recentCount >= config.maxPerSecond) {
        const oldestInWindow = commandEntries.find((e) => e.timestamp > oneSecondAgo);
        const retryAfter = oldestInWindow ? oldestInWindow.timestamp + 1000 - now : 1000;
        return { allowed: false, retryAfterMs: Math.max(retryAfter, 0), limitType: 'second' };
      }
    }

    if (config.maxPerMinute !== undefined) {
      const oneMinuteAgo = now - 60000;
      const recentCount = commandEntries.filter((e) => e.timestamp > oneMinuteAgo).length;
      if (recentCount >= config.maxPerMinute) {
        const oldestInWindow = commandEntries.find((e) => e.timestamp > oneMinuteAgo);
        const retryAfter = oldestInWindow ? oldestInWindow.timestamp + 60000 - now : 60000;
        return { allowed: false, retryAfterMs: Math.max(retryAfter, 0), limitType: 'minute' };
      }
    }

    return { allowed: true };
  }

  private checkRateLimit(command: string): void {
    if (!this.rateLimitConfig.enabled) return;
    if (this.isWhitelisted(command)) {
      this.debugLog(`Command '${command}' is whitelisted, bypassing rate limit`);
      return;
    }
    this.refillTokens();

    const perCmdCheck = this.checkPerCommandLimit(command);
    if (!perCmdCheck.allowed) {
      throw new RateLimitExceededError(
        perCmdCheck.limitType ?? 'second',
        perCmdCheck.retryAfterMs ?? 0,
      );
    }
    if (this.tokensPerSecond <= 0) {
      const timeToRefill = 1000 - (Date.now() - this.lastSecondRefill);
      throw new RateLimitExceededError('second', Math.max(timeToRefill, 0));
    }
    if (this.tokensPerMinute <= 0) {
      const timeToRefill = 60000 - (Date.now() - this.lastMinuteRefill);
      throw new RateLimitExceededError('minute', Math.max(timeToRefill, 0));
    }
  }

  private consumeRateLimitToken(command: string): void {
    if (!this.rateLimitConfig.enabled || this.isWhitelisted(command)) return;
    this.tokensPerSecond--;
    this.tokensPerMinute--;
    this.commandHistory.push({ command, timestamp: Date.now() });
    if (this.commandHistory.length > 1000) {
      this.cleanupHistory();
    }
  }

  resetRateLimits(): void {
    this.tokensPerSecond = this.rateLimitConfig.maxCommandsPerSecond;
    this.tokensPerMinute = this.rateLimitConfig.maxCommandsPerMinute;
    this.lastSecondRefill = Date.now();
    this.lastMinuteRefill = Date.now();
    this.commandHistory = [];
    this.debugLog('Rate limits reset');
  }

  // ============================================================================
  // Command Registration Methods
  // ============================================================================

  register(command: Command, options: RegisterOptions = {}): boolean {
    if (!command.name) throw new Error('Command must have a name');
    if (!command.handler) throw new Error(`Command ${command.name} must have a handler`);

    const fullName = this.getFullName(command);
    const { hasConflict, conflicts } = this.checkConflicts(command, options);

    if (hasConflict) {
      this.conflictHistory.push(...conflicts);
      this.logConflicts(conflicts, options.silent);
      const shouldRegister = conflicts.every((c) => c.wouldOverwrite) || options.overwrite;
      if (!shouldRegister) {
        this.debugLog(`Registration blocked for: ${fullName} due to conflicts`);
        return false;
      }
      for (const conflict of conflicts) {
        if (conflict.wouldOverwrite) {
          if (conflict.type === 'name') {
            this.unregister(conflict.existingCommand);
          } else {
            this.aliasMap.delete(conflict.identifier);
          }
        }
      }
    }

    this.commands.set(fullName, command);
    this.debugLog(`Registered command: ${fullName}`);

    if (command.namespace && !this.commands.has(command.name) && !this.aliasMap.has(command.name)) {
      this.aliasMap.set(command.name, fullName);
      this.debugLog(`  - Short name alias: ${command.name} -> ${fullName}`);
    }

    for (const alias of command.aliases || []) {
      const fullAlias = command.namespace ? `${command.namespace}.${alias}` : alias;
      this.aliasMap.set(fullAlias, fullName);
      this.debugLog(`  - Alias: ${fullAlias} -> ${fullName}`);
      if (command.namespace && !this.aliasMap.has(alias) && !this.commands.has(alias)) {
        this.aliasMap.set(alias, fullName);
        this.debugLog(`  - Short alias: ${alias} -> ${fullName}`);
      }
    }

    const category = command.category || 'general';
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
      this.debugLog(`  - Created category: ${category}`);
    }
    this.categories.get(category)?.add(fullName);
    this.debugLog(`  - Added to category: ${category}`);

    if (command.namespace) {
      if (!this.namespaces.has(command.namespace)) {
        this.namespaces.set(command.namespace, new Set());
        this.debugLog(`  - Created namespace: ${command.namespace}`);
      }
      this.namespaces.get(command.namespace)?.add(fullName);
      this.debugLog(`  - Added to namespace: ${command.namespace}`);
    }

    return true;
  }

  registerAll(
    commands: Command[],
    options: RegisterOptions = {},
  ): { registered: number; failed: number } {
    let registered = 0;
    let failed = 0;
    for (const cmd of commands) {
      if (this.register(cmd, options)) {
        registered++;
      } else {
        failed++;
      }
    }
    return { registered, failed };
  }

  get(nameOrAlias: string): Command | undefined {
    if (this.commands.has(nameOrAlias)) return this.commands.get(nameOrAlias);
    const realName = this.aliasMap.get(nameOrAlias);
    if (realName) return this.commands.get(realName);
    return undefined;
  }

  has(nameOrAlias: string): boolean {
    return this.commands.has(nameOrAlias) || this.aliasMap.has(nameOrAlias);
  }

  isCommandRegistered(name: string): boolean {
    return this.commands.has(name);
  }

  listAllCommands(): CommandInfo[] {
    const result: CommandInfo[] = [];
    for (const [name, cmd] of this.commands) {
      result.push({
        name,
        aliases: cmd.aliases || [],
        description: cmd.description,
        category: cmd.category || 'general',
        usage: cmd.usage,
        args: cmd.args,
        hidden: cmd.hidden || false,
        hasSubcommands: cmd.subcommands ? cmd.subcommands.size > 0 : false,
        namespace: cmd.namespace,
        priority: cmd.priority,
      });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ============================================================================
  // Fuzzy Matching (Levenshtein)
  // ============================================================================

  private levenshteinDistance(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }
    return dp[m][n];
  }

  findSimilarCommands(
    input: string,
    maxSuggestions: number = 3,
    maxDistance: number = 3,
  ): string[] {
    const lowerInput = input.toLowerCase();
    const candidates: Array<{ name: string; distance: number; isAlias: boolean }> = [];
    for (const name of this.commands.keys()) {
      const distance = this.levenshteinDistance(lowerInput, name);
      if (distance <= maxDistance) {
        candidates.push({ name, distance, isAlias: false });
      }
    }
    for (const alias of this.aliasMap.keys()) {
      const distance = this.levenshteinDistance(lowerInput, alias);
      if (distance <= maxDistance) {
        const realName = this.aliasMap.get(alias);
        if (realName && !candidates.some((c) => c.name === realName && !c.isAlias)) {
          candidates.push({ name: alias, distance, isAlias: true });
        }
      }
    }
    for (const name of this.commands.keys()) {
      if (name.toLowerCase().startsWith(lowerInput) && !candidates.some((c) => c.name === name)) {
        candidates.push({ name, distance: 0.5, isAlias: false });
      }
    }
    return candidates
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxSuggestions)
      .map((c) => c.name);
  }

  // ============================================================================
  // Command Execution
  // ============================================================================

  async execute(nameOrAlias: string, ctx: Omit<CommandContext, 'flags'>): Promise<CommandResult> {
    const command = this.get(nameOrAlias);

    if (!command) {
      const suggestions = this.findSimilarCommands(nameOrAlias);
      let errorMsg = `Unknown command: '${nameOrAlias}'.`;
      if (suggestions.length > 0) {
        errorMsg += ` Did you mean: ${suggestions.map((s) => `/${s}`).join(', ')}?`;
      } else {
        errorMsg += ' Use /help to see available commands.';
      }

      const ctxArgs0 = (ctx.args ?? []) as string[];
      const cmdError = new CommandError(
        errorMsg,
        CommandErrorCode.EXECUTION_NOT_FOUND,
        nameOrAlias,
        ctxArgs0,
        { suggestions },
      );

      const fullCtx: CommandContext = {
        ...ctx,
        args: ctxArgs0,
        flags: {},
        rawArgs: ctxArgs0.join(' '),
        cwd: ('cwd' in ctx && typeof ctx.cwd === 'string' ? ctx.cwd : '') || process.cwd(),
      } as CommandContext;
      const toErrorCtx0 = (c: CommandContext): ErrorCommandContext => ({
        cwd: c.cwd,
        args: c.args,
        flags: c.flags,
        rawArgs: (c.rawArgs as string) || '',
      });
      globalErrorLogger.log(cmdError, toErrorCtx0(fullCtx));
      this.debugLog(
        `Command not found: ${nameOrAlias}. Suggestions: ${suggestions.join(', ') || 'none'}`,
      );

      if (this.globalErrorHandler) {
        try {
          await this.globalErrorHandler(cmdError, toErrorCtx0(fullCtx));
        } catch (handlerErr) {
          this.debugLog(`Error handler threw: ${handlerErr}`);
        }
      }

      return {
        success: false,
        error: errorMsg,
        data: {
          code: CommandErrorCode.EXECUTION_NOT_FOUND,
          suggestion: cmdError.suggestion,
          retryable: false,
        },
      };
    }

    const ctxArgs = ctx.args as string[];
    const { positional, flags } = this.parseArgs(ctxArgs);
    const fullCtx: CommandContext = {
      ...ctx,
      args: positional,
      flags,
      rawArgs: ctxArgs.join(' '),
      cwd: ('cwd' in ctx && typeof ctx.cwd === 'string' ? ctx.cwd : '') || process.cwd(),
    } as CommandContext;
    const toErrorCtx = (c: CommandContext): ErrorCommandContext => ({
      cwd: c.cwd,
      args: c.args,
      flags: c.flags,
      rawArgs: (c.rawArgs as string) || '',
    });

    try {
      this.checkRateLimit(command.name);

      if (command.args && command.args.length > 0) {
        const validation = this.validateArgs(command, positional);
        if (!validation.valid) {
          const errorLines = validation.errors.join('\n');
          const helpHint = `\nUse /help ${command.name} to see required arguments.`;
          const valError = new ValidationError(validation.errors[0], command.name, positional, {
            code: CommandErrorCode.VALIDATION_MISSING_ARG,
            context: { allErrors: validation.errors },
          });
          globalErrorLogger.log(valError, toErrorCtx(fullCtx));

          if (this.globalErrorHandler) {
            try {
              await this.globalErrorHandler(valError, toErrorCtx(fullCtx));
            } catch (handlerErr) {
              this.debugLog(`Error handler threw: ${handlerErr}`);
            }
          }

          return {
            success: false,
            error: errorLines + helpHint,
            data: {
              code: CommandErrorCode.VALIDATION_MISSING_ARG,
              suggestion: valError.suggestion,
              retryable: false,
            },
          };
        }
      }

      this.consumeRateLimitToken(command.name);
      return await command.handler(fullCtx);
    } catch (err) {
      let cmdError: CommandError;
      if (err instanceof CommandError) {
        cmdError = err;
      } else if (err instanceof RateLimitExceededError) {
        cmdError = new TemporaryError(err.message, command.name, positional, {
          code: CommandErrorCode.TEMPORARY_RATE_LIMITED,
          retryAfterMs: err.retryAfterMs,
        });
      } else if (err instanceof Error) {
        const code = detectErrorCode(err);
        if (isRetryableError(code)) {
          cmdError = new TemporaryError(err.message, command.name, positional, { code });
        } else {
          cmdError = new ExecutionError(err.message, command.name, positional, {
            cause: err,
            code,
          });
        }
      } else {
        cmdError = new CommandError(
          String(err),
          CommandErrorCode.UNKNOWN,
          command.name,
          positional,
        );
      }

      globalErrorLogger.log(cmdError, toErrorCtx(fullCtx));

      if (this.globalErrorHandler) {
        try {
          await this.globalErrorHandler(cmdError, toErrorCtx(fullCtx));
        } catch (handlerErr) {
          this.debugLog(`Error handler threw: ${handlerErr}`);
        }
      }

      let errorMessage = `Error executing /${command.name}: ${cmdError.message}`;
      if (cmdError.suggestion) {
        errorMessage += `\n${chalk.cyan('Suggestion:')} ${cmdError.suggestion}`;
      }
      if (this.debugMode && cmdError.stack) {
        errorMessage += `\n${chalk.gray(cmdError.stack)}`;
      }

      return {
        success: false,
        error: errorMessage,
        data: {
          code: cmdError.code,
          suggestion: cmdError.suggestion,
          retryable: cmdError.isRetryable(),
          context: cmdError.context,
        },
      };
    }
  }

  async executeWithTimeout(
    nameOrAlias: string,
    ctx: Omit<CommandContext, 'flags'>,
    timeoutMs: number,
    _onProgress?: (progress: {
      current: number;
      total?: number;
      message?: string;
      percentage?: number;
    }) => void,
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      let isResolved = false;
      let timeoutId: NodeJS.Timeout | undefined;

      timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          resolve({
            success: false,
            error: `Command '${nameOrAlias}' timed out after ${timeoutMs}ms`,
            data: { timeout: true, timeoutMs },
          });
        }
      }, timeoutMs);

      this.execute(nameOrAlias, ctx)
        .then((result) => {
          if (!isResolved) {
            isResolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            resolve(result);
          }
        })
        .catch((err) => {
          if (!isResolved) {
            isResolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            resolve({
              success: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        });
    });
  }

  // ============================================================================
  // Enhanced Argument Parsing
  // ============================================================================

  tokenizeInputString(input: string): string[] {
    return tokenizeInput(input);
  }

  parseArgsEnhanced(input: string | string[], flagDefs?: FlagDefinition[]): ParsedArgs {
    return enhancedParseArgs(input, flagDefs);
  }

  private parseArgs(args: string[]): {
    positional: string[];
    flags: Record<string, string | boolean>;
  } {
    const result = enhancedParseArgs(args);
    return {
      positional: result.positional,
      flags: result.flags as Record<string, string | boolean>,
    };
  }

  validateParsedFlags(
    parsedArgs: ParsedArgs,
    command: Command,
  ): { valid: boolean; warnings: string[]; errors: string[] } {
    return validateCommandFlags(parsedArgs, command as CommandWithFlags);
  }

  generateCommandFlagHelp(command: Command): string {
    return generateFlagHelp(command as CommandWithFlags);
  }

  // ============================================================================
  // Argument Validation Methods
  // ============================================================================

  validateArgs(command: Command, providedArgs: string[]): ValidationResult {
    const result: ValidationResult = { valid: true, errors: [], parsedArgs: {} };
    const argDefs = command.args || [];

    for (let i = 0; i < argDefs.length; i++) {
      const argDef = argDefs[i];
      const providedValue = providedArgs[i];

      if (argDef.required && (providedValue === undefined || providedValue === '')) {
        if (argDef.default === undefined) {
          result.valid = false;
          result.errors.push(`Komenda ${command.name} wymaga argumentu ${argDef.name}`);
          continue;
        }
      }

      let valueToUse: string | undefined;
      if (providedValue !== undefined && providedValue !== '') {
        valueToUse = providedValue;
      } else if (argDef.default !== undefined) {
        valueToUse = String(argDef.default);
      }

      if (valueToUse === undefined) continue;
      if (argDef.choices && argDef.choices.length > 0) {
        if (!argDef.choices.includes(valueToUse)) {
          result.valid = false;
          result.errors.push(
            `Argument ${argDef.name} musi byc jednym z: ${argDef.choices.join(', ')} (podano: ${valueToUse})`,
          );
          continue;
        }
      }

      const typeResult = this.validateAndParseType(valueToUse, argDef);
      if (typeResult.error) {
        result.valid = false;
        result.errors.push(`Argument ${argDef.name}: ${typeResult.error}`);
        continue;
      }

      if (argDef.validate) {
        const customResult = argDef.validate(valueToUse);
        if (customResult !== true) {
          result.valid = false;
          const errorMsg =
            typeof customResult === 'string' ? customResult : 'nieprawidlowa wartosc';
          result.errors.push(`Argument ${argDef.name}: ${errorMsg}`);
          continue;
        }
      }

      if (typeResult.value !== undefined) {
        result.parsedArgs[argDef.name] = typeResult.value;
      }
    }

    return result;
  }

  private validateAndParseType(
    value: string,
    argDef: CommandArg,
  ): { value?: string | number | boolean; error?: string } {
    const type = argDef.type || 'string';
    switch (type) {
      case 'string':
        return { value };
      case 'number': {
        const num = Number(value);
        if (Number.isNaN(num)) return { error: `oczekiwano liczby, otrzymano "${value}"` };
        return { value: num };
      }
      case 'boolean': {
        const lower = value.toLowerCase();
        if (['true', '1', 'yes', 'tak', 'on'].includes(lower)) return { value: true };
        if (['false', '0', 'no', 'nie', 'off'].includes(lower)) return { value: false };
        return { error: `oczekiwano wartosci boolean (true/false), otrzymano "${value}"` };
      }
      case 'path': {
        const invalidChars = /[<>"|?*]/;
        if (invalidChars.test(value))
          return { error: `sciezka zawiera nieprawidlowe znaki: ${value}` };
        const normalizedPath = value.replace(/\\/g, '/');
        return { value: normalizedPath };
      }
      default:
        return { value };
    }
  }

  private getTypeDisplay(type?: ArgType): string {
    switch (type) {
      case 'number':
        return 'liczba';
      case 'boolean':
        return 'tak/nie';
      case 'path':
        return 'sciezka';
      default:
        return 'tekst';
    }
  }

  generateArgHelp(command: Command): string {
    if (!command.args || command.args.length === 0) return '';
    const lines: string[] = [];
    lines.push(chalk.bold('Argumenty:'));
    for (const arg of command.args) {
      const reqMark = arg.required ? chalk.red('*') : chalk.gray('?');
      const typeStr = chalk.blue(`[${this.getTypeDisplay(arg.type)}]`);
      const defStr = arg.default !== undefined ? chalk.gray(` (domyslnie: ${arg.default})`) : '';
      const choicesStr =
        arg.choices && arg.choices.length > 0
          ? chalk.gray(` dozwolone: ${arg.choices.join('|')}`)
          : '';
      lines.push(
        `  ${reqMark} ${chalk.cyan(arg.name)} ${typeStr} - ${arg.description}${defStr}${choicesStr}`,
      );
    }
    lines.push('');
    lines.push(chalk.gray(`  ${chalk.red('*')} = wymagane, ${chalk.gray('?')} = opcjonalne`));
    return lines.join('\n');
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  getAll(): Command[] {
    return Array.from(this.commands.values()).filter((cmd) => !cmd.hidden);
  }

  getByCategory(category: string): Command[] {
    const names = this.categories.get(category);
    if (!names) return [];
    return Array.from(names)
      .map((name) => this.commands.get(name))
      .filter((cmd): cmd is Command => cmd != null && !cmd.hidden);
  }

  getCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  getCommandsByCategory(): Map<string, Command[]> {
    const result = new Map<string, Command[]>();
    for (const category of this.categories.keys()) {
      const commands = this.getByCategory(category);
      if (commands.length > 0) result.set(category, commands);
    }
    return result;
  }

  getByNamespace(namespace: string): Command[] {
    const names = this.namespaces.get(namespace);
    if (!names) return [];
    return Array.from(names)
      .map((name) => this.commands.get(name))
      .filter((cmd): cmd is Command => cmd != null && !cmd.hidden);
  }

  getNamespaces(): string[] {
    return Array.from(this.namespaces.keys());
  }

  detectConflicts(): ConflictInfo[] {
    return [...this.conflictHistory];
  }

  getConflictsFor(nameOrAlias: string): ConflictInfo[] {
    return this.conflictHistory.filter(
      (c) => c.existingCommand === nameOrAlias || c.newCommand === nameOrAlias,
    );
  }

  clearConflictHistory(): void {
    this.conflictHistory = [];
  }

  // ============================================================================
  // Help Generation
  // ============================================================================

  getHelp(nameOrAlias?: string): string {
    if (nameOrAlias) return this.getCommandHelp(nameOrAlias);
    return this.getGeneralHelp();
  }

  private getCommandHelp(nameOrAlias: string): string {
    const command = this.get(nameOrAlias);
    if (!command) return chalk.red(`Unknown command: ${nameOrAlias}`);

    const lines: string[] = [];
    const fullName = this.getFullName(command);

    lines.push(chalk.bold.cyan(`\n Command: /${fullName}\n`));
    lines.push(command.description);
    lines.push('');

    if (command.namespace) {
      lines.push(chalk.bold('Namespace:'));
      lines.push(`  ${chalk.magenta(command.namespace)}`);
      lines.push('');
    }

    if (command.priority !== undefined) {
      lines.push(chalk.bold('Priority:'));
      lines.push(`  ${chalk.blue(this.getPriorityString(command.priority))}`);
      lines.push('');
    }

    if (command.usage) {
      lines.push(chalk.bold('Usage:'));
      lines.push(`  ${chalk.yellow(`/${fullName}`)} ${command.usage}`);
      lines.push('');
    }
    if (command.args && command.args.length > 0) {
      lines.push(this.generateArgHelp(command));
      lines.push('');
    }

    if (command.flags && command.flags.length > 0) {
      lines.push(this.generateCommandFlagHelp(command));
      lines.push('');
    }

    if (command.aliases && command.aliases.length > 0) {
      lines.push(chalk.bold('Aliases:'));
      const aliasDisplay = command.aliases
        .map((a) => {
          const fullAlias = command.namespace ? `${command.namespace}.${a}` : a;
          return chalk.yellow(`/${fullAlias}`);
        })
        .join(', ');
      lines.push(`  ${aliasDisplay}`);
      lines.push('');
    }

    if (command.subcommands && command.subcommands.size > 0) {
      lines.push(chalk.bold('Subcommands:'));
      for (const [name, subcmd] of command.subcommands) {
        lines.push(`  ${chalk.yellow(name).padEnd(20)} ${subcmd.description}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  private getGeneralHelp(): string {
    const lines: string[] = [];
    lines.push(chalk.bold.cyan('\n Available Commands\n'));
    lines.push(chalk.gray('─'.repeat(50)));

    for (const category of this.getCategories()) {
      const commands = this.getByCategory(category);
      if (commands.length === 0) continue;
      lines.push(chalk.bold(`\n ${category.charAt(0).toUpperCase() + category.slice(1)}:`));
      for (const cmd of commands) {
        const fullName = this.getFullName(cmd);
        const aliases = cmd.aliases.length > 0 ? chalk.gray(` (${cmd.aliases.join(', ')})`) : '';
        const ns = cmd.namespace ? chalk.magenta(`[${cmd.namespace}] `) : '';
        const priority =
          cmd.priority !== undefined ? chalk.dim(` [${this.getPriorityString(cmd.priority)}]`) : '';
        lines.push(
          `  ${ns}${chalk.yellow(`/${fullName}`).padEnd(30)} ${cmd.description}${aliases}${priority}`,
        );
      }
    }

    const namespaces = this.getNamespaces();
    if (namespaces.length > 0) {
      lines.push(chalk.bold(`\n Namespaces:`));
      for (const ns of namespaces) {
        const count = this.namespaces.get(ns)?.size || 0;
        lines.push(`  ${chalk.magenta(ns)} - ${count} command(s)`);
      }
    }
    if (this.conflictHistory.length > 0) {
      lines.push(chalk.bold.yellow(`\n Conflicts: ${this.conflictHistory.length}`));
      lines.push(chalk.gray(`  Use /conflicts to see details`));
    }

    lines.push(chalk.gray('\n─'.repeat(50)));
    lines.push(
      chalk.gray(`Use ${chalk.white('/help <command>')} for detailed help on a specific command\n`),
    );
    return lines.join('\n');
  }

  // ============================================================================
  // Autocomplete
  // ============================================================================

  autocomplete(partial: string): string[] {
    const lowerPartial = partial.toLowerCase();
    const suggestions: string[] = [];
    for (const name of this.commands.keys()) {
      if (name.toLowerCase().startsWith(lowerPartial)) suggestions.push(`/${name}`);
    }
    for (const alias of this.aliasMap.keys()) {
      if (alias.toLowerCase().startsWith(lowerPartial)) suggestions.push(`/${alias}`);
    }
    return suggestions.sort();
  }

  autocompleteSubcommand(commandName: string, partial: string): string[] {
    const command = this.get(commandName);
    if (!command || !command.subcommands) return [];
    const lowerPartial = partial.toLowerCase();
    const suggestions: string[] = [];
    for (const subName of command.subcommands.keys()) {
      if (subName.toLowerCase().startsWith(lowerPartial)) suggestions.push(subName);
    }
    return suggestions.sort();
  }

  // ============================================================================
  // Registry Management
  // ============================================================================

  clear(): void {
    this.commands.clear();
    this.aliasMap.clear();
    this.categories.clear();
    this.namespaces.clear();
    this.conflictHistory = [];
  }

  get size(): number {
    return this.commands.size;
  }

  get conflictCount(): number {
    return this.conflictHistory.length;
  }

  get namespaceCount(): number {
    return this.namespaces.size;
  }
  getStats(): {
    commands: number;
    aliases: number;
    categories: number;
    namespaces: number;
    conflicts: number;
  } {
    return {
      commands: this.commands.size,
      aliases: this.aliasMap.size,
      categories: this.categories.size,
      namespaces: this.namespaces.size,
      conflicts: this.conflictHistory.length,
    };
  }

  get aliasCount(): number {
    return this.aliasMap.size;
  }

  getAllAliases(): Map<string, string> {
    return new Map(this.aliasMap);
  }

  // ============================================================================
  // Alias Management Methods
  // ============================================================================

  private registerAliasInternal(commandName: string, alias: string): boolean {
    if (this.commands.has(alias)) {
      console.warn(
        chalk.yellow(
          `[CommandRegistry] Warning: Alias '${alias}' conflicts with existing command name. Alias will not be registered.`,
        ),
      );
      return false;
    }
    if (this.aliasMap.has(alias)) {
      const existingCommand = this.aliasMap.get(alias);
      if (existingCommand !== commandName) {
        console.warn(
          chalk.yellow(
            `[CommandRegistry] Warning: Alias '${alias}' already exists for command '${existingCommand}'. Overwriting with '${commandName}'.`,
          ),
        );
      }
    }
    this.aliasMap.set(alias, commandName);
    this.debugLog(`  - Alias: ${alias} -> ${commandName}`);
    return true;
  }

  getAliasesForCommand(commandName: string): string[] {
    const aliases: string[] = [];
    if (!this.commands.has(commandName)) return aliases;
    for (const [alias, targetCommand] of this.aliasMap.entries()) {
      if (targetCommand === commandName) aliases.push(alias);
    }
    return aliases;
  }

  getCommandForAlias(alias: string): string | null {
    return this.aliasMap.get(alias) ?? null;
  }
  registerAlias(commandName: string, newAlias: string): boolean {
    if (!this.commands.has(commandName)) {
      console.warn(
        chalk.yellow(
          `[CommandRegistry] Warning: Cannot register alias '${newAlias}' - command '${commandName}' does not exist.`,
        ),
      );
      return false;
    }
    const registered = this.registerAliasInternal(commandName, newAlias);
    if (registered) {
      const command = this.commands.get(commandName);
      if (command && !command.aliases.includes(newAlias)) {
        command.aliases.push(newAlias);
      }
    }
    return registered;
  }

  unregisterAlias(alias: string): boolean {
    if (!this.aliasMap.has(alias)) {
      this.debugLog(`Alias '${alias}' not found, nothing to unregister`);
      return false;
    }
    const commandName = this.aliasMap.get(alias) ?? alias;
    this.aliasMap.delete(alias);
    this.debugLog(`Unregistered alias: ${alias} (was mapped to ${commandName})`);
    const command = this.commands.get(commandName);
    if (command) {
      const aliasIndex = command.aliases.indexOf(alias);
      if (aliasIndex > -1) command.aliases.splice(aliasIndex, 1);
    }
    return true;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a success result
 */
export function success(data?: unknown, message?: string): CommandResult {
  return { success: true, data, message };
}

/**
 * Create an error result
 */
export function error(errorMessage: string, data?: unknown): CommandResult {
  return { success: false, error: errorMessage, data };
}

/**
 * Singleton command registry instance
 */
export const commandRegistry = new CommandRegistry();

export default commandRegistry;

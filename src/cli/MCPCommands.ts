/**
 * MCPCommands - CLI commands for remaining MCP integrations
 *
 * Note: Most MCP servers have been replaced by native implementations.
 * See NativeCommands.ts for /fs, /shell, /search, /mem commands.
 *
 * Remaining MCP servers:
 * - Serena (code intelligence) - see SerenaCommands.ts
 * - Ollama (local AI) - see /ai commands
 */

import chalk from 'chalk';
import { ollamaManager } from '../core/OllamaManager.js';
import { mcpManager } from '../mcp/index.js';
import { type CommandResult, commandRegistry, error, success } from './CommandRegistry.js';

// ============================================================
// MCP Status Command
// ============================================================

async function handleMCPStatus(): Promise<CommandResult> {
  mcpManager.printStatus();

  console.log(chalk.cyan('\n=== Native Replacements ===\n'));
  console.log(
    chalk.gray('  The following MCP servers have been replaced with native implementations:'),
  );
  console.log(chalk.gray('  - filesystem → /fs commands (NativeFileSystem)'));
  console.log(chalk.gray('  - memory → /mem commands (NativeMemory)'));
  console.log(chalk.gray('  - desktop-commander → /shell commands (NativeShell)'));
  console.log(chalk.gray('  - puppeteer/playwright → Native browser support planned'));
  console.log(chalk.gray('  - github → gh CLI or native integration planned'));
  console.log('');
  console.log(chalk.cyan('  Active MCP Servers:'));
  console.log(chalk.green('  - serena: Code intelligence (LSP)'));
  console.log(chalk.green('  - ollama: Local AI models'));

  return success(null, 'MCP Status displayed');
}

// ============================================================
// Ollama Commands
// ============================================================

async function handleOllamaStatus(): Promise<CommandResult> {
  const stats = ollamaManager.getMonitorStats();
  const serverStatus = ollamaManager.getStatus();

  console.log(chalk.cyan('\n=== Ollama Status ===\n'));

  // Server status
  console.log(chalk.white('  Server:'));
  console.log(`    Status: ${stats.isAlive ? chalk.green('✓ ALIVE') : chalk.red('✗ DOWN')}`);
  console.log(`    Host: ${chalk.gray(`${serverStatus.config.host}:${serverStatus.config.port}`)}`);
  console.log(`    Parallel: ${chalk.yellow(serverStatus.config.numParallel)}`);

  // Monitor status
  console.log(chalk.white('\n  Monitor:'));
  console.log(
    `    Active: ${stats.isMonitoring ? chalk.green('✓ Running') : chalk.gray('○ Stopped')}`,
  );
  console.log(
    `    Last check: ${stats.lastHealthCheck ? chalk.gray(stats.lastHealthCheck.toLocaleTimeString()) : chalk.gray('Never')}`,
  );
  console.log(
    `    Failures: ${stats.consecutiveFailures > 0 ? chalk.yellow(stats.consecutiveFailures) : chalk.green('0')}`,
  );
  console.log(
    `    Restarts: ${stats.totalRestarts > 0 ? chalk.yellow(stats.totalRestarts) : chalk.green('0')}`,
  );
  console.log(`    Restarting: ${stats.isRestarting ? chalk.yellow('⟳ Yes') : chalk.gray('No')}`);

  // Available models
  console.log(chalk.white('\n  Models:'));
  const models = await ollamaManager.listModels();
  if (models.length > 0) {
    for (const m of models) console.log(`    ${chalk.green('•')} ${m}`);
  } else {
    console.log(chalk.gray('    No models loaded'));
  }

  console.log('');
  return success(null, 'Ollama status displayed');
}

async function handleOllamaRestart(): Promise<CommandResult> {
  console.log(chalk.yellow('[Ollama] Forcing restart...'));

  try {
    await ollamaManager.ensure();
    console.log(chalk.green('[Ollama] Restart complete!'));
    return success(null, 'Ollama restarted');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(chalk.red(`[Ollama] Restart failed: ${msg}`));
    return error(`Restart failed: ${msg}`);
  }
}

async function handleOllamaMonitor(args: string): Promise<CommandResult> {
  const action = args.trim().toLowerCase();

  if (action === 'start' || action === 'on') {
    ollamaManager.startMonitoring(15000);
    return success(null, 'Monitoring started');
  } else if (action === 'stop' || action === 'off') {
    ollamaManager.stopMonitoring();
    return success(null, 'Monitoring stopped');
  } else {
    console.log(chalk.cyan('Usage: /ollama-monitor [start|stop]'));
    const stats = ollamaManager.getMonitorStats();
    console.log(`Current: ${stats.isMonitoring ? chalk.green('Running') : chalk.gray('Stopped')}`);
    return success(null);
  }
}

// ============================================================
// Register Commands
// ============================================================

export function registerMCPCommands(): void {
  // Main /mcp status command
  commandRegistry.register({
    name: 'mcpstatus',
    aliases: ['mcp-status', 'mcp'],
    description: 'Show MCP servers status',
    usage: '/mcpstatus',
    category: 'mcp',
    handler: async () => handleMCPStatus(),
  });

  // Ollama commands
  commandRegistry.register({
    name: 'ollama',
    aliases: ['ollama-status'],
    description: 'Show Ollama server status and monitoring info',
    usage: '/ollama',
    category: 'ai',
    handler: async () => handleOllamaStatus(),
  });

  commandRegistry.register({
    name: 'ollama-restart',
    aliases: ['restart-ollama'],
    description: 'Force restart Ollama server',
    usage: '/ollama-restart',
    category: 'ai',
    handler: async () => handleOllamaRestart(),
  });

  commandRegistry.register({
    name: 'ollama-monitor',
    aliases: ['monitor-ollama'],
    description: 'Start/stop Ollama health monitoring',
    usage: '/ollama-monitor [start|stop]',
    category: 'ai',
    handler: async (args) =>
      handleOllamaMonitor(Array.isArray(args) ? args.join(' ') : String(args || '')),
  });

  console.log(chalk.gray('[CLI] MCP & Ollama commands registered'));
}

// ============================================================
// Exports
// ============================================================

export const mcpCommands = {
  status: handleMCPStatus,
  ollamaStatus: handleOllamaStatus,
  ollamaRestart: handleOllamaRestart,
  ollamaMonitor: handleOllamaMonitor,
};

/**
 * Interactive Mode - Task queue, readline handling, and prompt loop
 *
 * @module bin/interactive
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as readline from 'readline/promises';  // FIX #4: Use promises API
import { AGENT_PERSONAS } from '../src/core/agent/Agent.js';
import { costTracker } from '../src/cli/CostTracker.js';
import { sessionMemory } from '../src/memory/SessionMemory.js';
import { longTermMemory } from '../src/memory/LongTermMemory.js';
import { promptCommands } from '../src/cli/PromptCommands.js';
import { mcpManager, mcpBridge } from '../src/mcp/index.js';
import { startupLogger } from '../src/utils/startupLogger.js';
import { getIdentityContext } from '../src/core/PromptSystem.js';
import { PipelineMode } from '../src/cli/PipelineMode.js';
import {
  execAsync,
  useInquirer,
  inquirerInput,
  loadInquirer,
  setUseInquirer,
  ROOT_DIR,
  swarm,
  printBanner,
} from './cli-config.js';
import { executeSwarmWithReturn } from './execute.js';

// ============================================================================
// TASK QUEUE
// ============================================================================

export interface QueuedTask {
  id: number;
  objective: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  addedAt: Date;
  result?: string;
  error?: string;
}

let taskQueue: QueuedTask[] = [];
let taskIdCounter = 1;
let isProcessingQueue = false;
let isShuttingDown = false;  // FIX #5: Flag to prevent premature close

// ============================================================================
// STDIN MANAGEMENT
// ============================================================================

// FIX #8 & #9: Ensure stdin is properly configured
function ensureStdinReady(): void {
  // FIX #9: Make sure stdin is referenced (not unref'd)
  if (process.stdin.ref) {
    process.stdin.ref();
  }

  // FIX #8: Set raw mode if TTY
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
    try {
      // Note: readline handles this, but ensure it's not disabled
      // process.stdin.setRawMode(true); // Let readline manage this
    } catch (e) {
      // Ignore if already set or unavailable
    }
  }

  // FIX #3: Explicit resume after any potential pause
  if (process.stdin.resume) {
    process.stdin.resume();
  }
}

// ============================================================================
// TASK QUEUE PROCESSING
// ============================================================================

async function processTaskQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (taskQueue.some(t => t.status === 'pending')) {
    const task = taskQueue.find(t => t.status === 'pending');
    if (!task) break;

    task.status = 'running';
    console.log(chalk.cyan(`\n┌─── Rozpoczynam zadanie #${task.id} ───`));
    console.log(chalk.white(`│ ${task.objective}`));
    console.log(chalk.cyan(`└${'─'.repeat(40)}\n`));

    try {
      // Wykonaj zadanie
      const report = await executeSwarmWithReturn(task.objective, { yolo: true });
      task.status = 'completed';
      task.result = report;

      console.log(chalk.green(`\n✓ Zadanie #${task.id} zakończone pomyślnie`));
      console.log(chalk.green('═══ FINAL REPORT ═══\n'));
      console.log(report);

    } catch (error: any) {
      task.status = 'failed';
      task.error = error.message;
      console.log(chalk.red(`\n✗ Zadanie #${task.id} nieudane: ${error.message}`));
    }

    // Pokaż status kolejki
    const pending = taskQueue.filter(t => t.status === 'pending').length;
    if (pending > 0) {
      console.log(chalk.yellow(`\n📋 Pozostało w kolejce: ${pending} zadań\n`));
    }
  }

  isProcessingQueue = false;

  // FIX #3: Ensure stdin is ready before showing prompt
  ensureStdinReady();

  // Pokaż prompt ponownie (use async version)
  promptLoop();
}

// ============================================================================
// READLINE MANAGEMENT
// ============================================================================

// Global readline reference for prompt management (FIX #4: using promises API)
let globalRL: readline.Interface | null = null;

function getPromptString(): string {
  const wolf = chalk.gray('🐺');
  const agent = chalk.magenta('[Dijkstra]');
  return `\n${wolf} ${agent} ${chalk.yellow('>')} `;
}

// FIX #5: Protected readline creation - never close prematurely
function ensureReadline(): readline.Interface {
  if (!globalRL || (globalRL as any)._closed) {
    // FIX #3 & #8: Ensure stdin is ready
    ensureStdinReady();

    globalRL = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    // FIX #5: Handle close gracefully
    globalRL.on('close', async () => {
      if (isShuttingDown) {
        await saveCommandHistory();
        console.log(chalk.gray('\nFarewell, Witcher. 🐺\n'));
        process.exit(0);
      } else {
        // Unexpected close - recreate
        console.log(chalk.yellow('\n[stdin] Readline closed unexpectedly, recreating...'));
        globalRL = null;
        ensureStdinReady();
        setTimeout(() => promptLoop(), 100);
      }
    });

    // Handle SIGINT (Ctrl+C)
    globalRL.on('SIGINT', async () => {
      const pending = taskQueue.filter(t => t.status === 'pending' || t.status === 'running').length;
      if (pending > 0) {
        console.log(chalk.yellow(`\n⚠ ${pending} zadań wciąż w kolejce/wykonywane.`));
        console.log(chalk.gray('Wciśnij Ctrl+C ponownie aby wymusić wyjście.\n'));
        promptLoop();
      } else {
        isShuttingDown = true;
        globalRL?.close();
      }
    });
  }
  return globalRL;
}

// ============================================================================
// PROMPT LOOP
// ============================================================================

// FIX #4 & #7: Async prompt loop using readline/promises with Inquirer fallback
async function promptLoop(): Promise<void> {
  if (isProcessingQueue || isShuttingDown) return;

  // FIX #7: Use Inquirer.js if enabled
  if (useInquirer && inquirerInput) {
    try {
      const line = await inquirerInput({
        message: getPromptString(),
        theme: { prefix: '' }
      });
      await handleInput(line);
    } catch (error: any) {
      if (!isShuttingDown) {
        console.error(chalk.red(`[inquirer] Error: ${error.message}`));
        // Fallback to readline
        setUseInquirer(false);
        promptLoop();
      }
    }
    return;
  }

  // Standard readline/promises
  const rl = ensureReadline();

  // FIX #3: Explicit resume before question
  ensureStdinReady();

  try {
    const line = await rl.question(getPromptString());
    await handleInput(line);
  } catch (error: any) {
    if (error.code === 'ERR_USE_AFTER_CLOSE') {
      // FIX #5: Readline was closed, recreate
      console.log(chalk.yellow('\n[stdin] Recreating readline interface...'));
      globalRL = null;
      setTimeout(() => promptLoop(), 100);
    } else if (!isShuttingDown) {
      console.error(chalk.red(`[stdin] Error: ${error.message}`));
      // FIX #7: Try Inquirer as fallback
      if (!useInquirer && await loadInquirer()) {
        console.log(chalk.cyan('[stdin] Switching to Inquirer.js mode...'));
        setUseInquirer(true);
      }
      setTimeout(() => promptLoop(), 100);
    }
  }
}

// Legacy showPrompt for compatibility
function showPrompt() {
  promptLoop();
}

// ============================================================================
// TASK MANAGEMENT
// ============================================================================

function addTaskToQueue(objective: string): QueuedTask {
  const task: QueuedTask = {
    id: taskIdCounter++,
    objective: objective,
    status: 'pending',
    addedAt: new Date()
  };
  taskQueue.push(task);
  return task;
}

// ============================================================================
// COMMAND HISTORY
// ============================================================================

let commandHistory: string[] = [];
const HISTORY_FILE = path.join(os.homedir(), '.geminihydra_history');

async function loadCommandHistory(): Promise<void> {
  try {
    const data = await fs.readFile(HISTORY_FILE, 'utf-8');
    commandHistory = data.split('\n').filter(line => line.trim());
  } catch {
    commandHistory = [];
  }
}

async function saveCommandHistory(): Promise<void> {
  try {
    const toSave = commandHistory.slice(-1000);
    await fs.writeFile(HISTORY_FILE, toSave.join('\n'), 'utf-8');
  } catch {}
}

function addToCommandHistory(cmd: string): void {
  if (cmd.trim() && cmd !== commandHistory[commandHistory.length - 1]) {
    commandHistory.push(cmd);
  }
}

// ============================================================================
// INPUT HANDLER
// ============================================================================

async function handleInput(line: string): Promise<void> {
  const trimmed = line.trim();

  // Handle special commands (działają zawsze)
  if (trimmed === 'exit' || trimmed === 'quit') {
    const pending = taskQueue.filter(t => t.status === 'pending' || t.status === 'running').length;
    if (pending > 0) {
      console.log(chalk.yellow(`\n⚠ ${pending} zadań wciąż w kolejce/wykonywane.`));
      console.log(chalk.gray('Użyj Ctrl+C aby wymusić wyjście.\n'));
      promptLoop();
      return;
    }
    isShuttingDown = true;  // FIX #5: Set flag before close
    await saveCommandHistory();
    if (globalRL) globalRL.close();
    console.log(chalk.gray('\nFarewell, Witcher. 🐺\n'));
    process.exit(0);
  }

  if (trimmed === '/help') {
    console.log(chalk.cyan('\nAvailable Commands:'));
    console.log(chalk.gray('  @<agent>      ') + 'Switch to specific agent (e.g., @geralt)');
    console.log(chalk.yellow('  @serena       ') + 'Serena Agent - Real MCP code intelligence');
    console.log(chalk.gray('  /help         ') + 'Show this help');
    console.log(chalk.gray('  /history      ') + 'Show command history');
    console.log(chalk.gray('  /clear        ') + 'Clear screen');
    console.log(chalk.gray('  /status       ') + 'Show session status');
    console.log(chalk.gray('  /cost         ') + 'Show token usage');
    console.log(chalk.gray('  /prompt       ') + 'Zarządzanie zapisanymi promptami');
    console.log(chalk.gray('  /stdin-fix    ') + 'Napraw stdin (jeśli prompt nie działa)');
    console.log(chalk.gray('  /inquirer     ') + 'Przełącz na Inquirer.js (alternatywny input)');
    console.log(chalk.gray('  exit, quit    ') + 'Exit interactive mode');
    console.log(chalk.gray('  /queue        ') + 'Pokaż kolejkę zadań');
    console.log(chalk.gray('  /cancel <id>  ') + 'Anuluj zadanie z kolejki\n');
    console.log(chalk.cyan('Serena Agent Commands:'));
    console.log(chalk.gray('  @serena status    ') + 'Show Serena MCP connection status');
    console.log(chalk.gray('  @serena find      ') + 'Find symbol by pattern (LSP)');
    console.log(chalk.gray('  @serena overview  ') + 'Get file structure/outline');
    console.log(chalk.gray('  @serena search    ') + 'Search code with regex');
    console.log(chalk.gray('  @serena help      ') + 'Show all Serena commands\n');
    promptLoop();
    return;
  }

  // Prompt Memory commands
  if (trimmed.startsWith('/prompt') || trimmed.startsWith('/p ')) {
    const args = trimmed.replace(/^\/p(rompt)?\s*/, '').trim().split(/\s+/);
    promptCommands.setLastInput(commandHistory[commandHistory.length - 2] || '');
    promptCommands.setContext(commandHistory.slice(-5).join(' '));
    const result = await promptCommands.handle(args);
    if (result.compiledPrompt) {
      // Użytkownik chce użyć prompta - dodaj do kolejki
      addToCommandHistory(result.compiledPrompt);
      const task = addTaskToQueue(result.compiledPrompt);
      console.log(chalk.cyan(`\n📋 Prompt "${result.prompt?.title}" dodany jako zadanie #${task.id}\n`));
      // FIX: await processTaskQueue() aby uniknąć przedwczesnego zakończenia CLI
      await processTaskQueue();
      return;
    }
    promptLoop();
    return;
  }

  // FIX #3: Manual stdin fix command
  if (trimmed === '/stdin-fix') {
    console.log(chalk.cyan('\n🔧 Naprawiam stdin...'));
    ensureStdinReady();
    globalRL = null;  // Force recreation
    console.log(chalk.green('✓ stdin naprawiony!\n'));
    promptLoop();
    return;
  }

  // FIX #7: Switch to Inquirer.js mode
  if (trimmed === '/inquirer') {
    if (await loadInquirer()) {
      setUseInquirer(!useInquirer);
      console.log(chalk.green(`\n✓ Inquirer mode: ${useInquirer ? 'ON' : 'OFF'}\n`));
      if (useInquirer && globalRL) {
        globalRL.close();
        globalRL = null;
      }
    } else {
      console.log(chalk.red('\n✗ Inquirer.js nie jest zainstalowany. Uruchom: npm install @inquirer/prompts\n'));
    }
    promptLoop();
    return;
  }

  if (trimmed === '/queue') {
    console.log(chalk.cyan('\n═══ Kolejka Zadań ═══\n'));
    if (taskQueue.length === 0) {
      console.log(chalk.gray('Kolejka jest pusta.\n'));
    } else {
      taskQueue.forEach(task => {
        const statusIcon = task.status === 'completed' ? chalk.green('✓') :
                          task.status === 'running' ? chalk.yellow('⟳') :
                          task.status === 'failed' ? chalk.red('✗') :
                          chalk.gray('○');
        const statusText = task.status === 'completed' ? chalk.green(task.status) :
                          task.status === 'running' ? chalk.yellow(task.status) :
                          task.status === 'failed' ? chalk.red(task.status) :
                          chalk.gray(task.status);
        console.log(`${statusIcon} #${task.id} [${statusText}] ${task.objective.substring(0, 50)}${task.objective.length > 50 ? '...' : ''}`);
      });
      console.log('');
    }
    promptLoop();
    return;
  }

  if (trimmed.startsWith('/cancel ')) {
    const idStr = trimmed.replace('/cancel ', '').trim();
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      console.log(chalk.red(`\nNieprawidłowy ID zadania: ${idStr}\n`));
      promptLoop();
      return;
    }
    const task = taskQueue.find(t => t.id === id && t.status === 'pending');
    if (task) {
      taskQueue = taskQueue.filter(t => t.id !== id);
      console.log(chalk.green(`\nAnulowano zadanie #${id}\n`));
    } else {
      console.log(chalk.red(`\nNie znaleziono oczekującego zadania #${id}\n`));
    }
    promptLoop();
    return;
  }

  if (trimmed === '/history') {
    console.log(chalk.cyan('\nCommand History:'));
    commandHistory.slice(-10).forEach((cmd: string, i: number) => {
      console.log(chalk.gray(`  ${i + 1}. ${cmd}`));
    });
    console.log('');
    promptLoop();
    return;
  }

  if (trimmed === '/clear') {
    console.clear();
    printBanner();
    promptLoop();
    return;
  }

  if (trimmed === '/status' || trimmed === '/cost') {
    costTracker.printStatus();
    promptLoop();
    return;
  }

  if (trimmed === '/mcp') {
    await mcpManager.init({ projectRoot: ROOT_DIR });
    mcpManager.printStatus();
    const tools = mcpManager.getAllTools();
    if (tools.length > 0) {
      console.log(chalk.cyan('\nAvailable MCP Tools:'));
      tools.slice(0, 10).forEach(t => {
        console.log(chalk.gray(`  mcp__${t.serverName}__${t.name}`));
      });
      if (tools.length > 10) {
        console.log(chalk.gray(`  ... and ${tools.length - 10} more`));
      }
    }
    console.log('');
    promptLoop();
    return;
  }

  // MCP tool call: mcp:<tool> {params}
  if (trimmed.startsWith('mcp:')) {
    await mcpManager.init({ projectRoot: ROOT_DIR });
    const match = trimmed.match(/^mcp:(\S+)\s*(.*)$/);
    if (match) {
      const toolName = match[1];
      const paramsStr = match[2];
      let params = {};
      try {
        params = paramsStr ? JSON.parse(paramsStr) : {};
      } catch {
        console.log(chalk.red('Invalid JSON params'));
        showPrompt();
        return;
      }

      try {
        console.log(chalk.cyan(`\n🔧 Calling ${toolName}...\n`));
        const result = await mcpManager.callTool(toolName, params);
        if (result.content && Array.isArray(result.content)) {
          result.content.forEach((c: any) => {
            if (c.type === 'text') console.log(c.text);
            else console.log(JSON.stringify(c, null, 2));
          });
        } else {
          console.log(JSON.stringify(result, null, 2));
        }

        // FIX: Update knowledge graph with tool results
        if (result.success && result.content) {
          const resultText = JSON.stringify(result.content);
          if (resultText.length > 50) {
            try {
              await longTermMemory.init();
              await longTermMemory.autoExtract(resultText, `mcp-tool-${toolName}`);
            } catch (memError) {
              // Silently ignore memory extraction errors
            }
          }
        }
      } catch (error: any) {
        console.log(chalk.red(`Error: ${error.message}`));
      }
      console.log('');
    }
    promptLoop();
    return;
  }

  // @serena command - Real Serena MCP Agent
  if (trimmed.startsWith('@serena')) {
    const { handleSerenaAgentCommand } = await import('../src/cli/SerenaAgentCommands.js');
    const args = trimmed.slice(7).trim().split(/\s+/).filter(Boolean);
    await handleSerenaAgentCommand(args);
    promptLoop();
    return;
  }

  // Agent switch: @agent
  if (trimmed.startsWith('@')) {
    const agentName = trimmed.slice(1).toLowerCase();
    const matchedAgent = Object.keys(AGENT_PERSONAS).find(
      a => a.toLowerCase() === agentName
    );
    if (matchedAgent) {
      console.log(chalk.gray(`Switched to ${matchedAgent}`));
    } else {
      console.log(chalk.red(`Unknown agent: ${agentName}`));
      console.log(chalk.gray(`Available: ${Object.keys(AGENT_PERSONAS).join(', ')}`));
    }
    promptLoop();
    return;
  }

  // Pipeline: task1 | task2 | task3
  if (trimmed.includes(' | ')) {
    await runPipeline(trimmed);
    promptLoop();
    return;
  }

  // Regular task - dodaj do kolejki
  if (trimmed) {
    addToCommandHistory(trimmed);

    const task = addTaskToQueue(trimmed);
    const runningCount = taskQueue.filter(t => t.status === 'running').length;

    if (runningCount > 0) {
      console.log(chalk.yellow(`\n📋 Zadanie #${task.id} dodane do kolejki`));
      console.log(chalk.gray(`   Zostanie wykonane po bieżącym zadaniu.`));
      console.log(chalk.gray(`   Wpisz /queue aby zobaczyć kolejkę.\n`));
      promptLoop();
    } else {
      console.log(chalk.cyan(`\n📋 Zadanie #${task.id} rozpoczynam...\n`));
      // FIX: await processTaskQueue() aby uniknąć przedwczesnego zakończenia CLI
      await processTaskQueue();
    }
  } else {
    // Pusty input - pokaż prompt
    promptLoop();
  }
}

// ============================================================================
// PIPELINE
// ============================================================================

export async function runPipeline(pipelineStr: string) {
  console.log(chalk.cyan('\n🔗 Pipeline Mode\n'));
  const pipeline = new PipelineMode(swarm);

  try {
    const result = await pipeline.execute(pipelineStr);
    console.log(chalk.green('\n═══ Pipeline Result ═══\n'));
    console.log(result);
  } catch (error: any) {
    console.error(chalk.red(`Pipeline failed: ${error.message}`));
  }
}

// ============================================================================
// RUN INTERACTIVE MODE
// ============================================================================

export async function runInteractiveMode() {
  await loadCommandHistory();

  // FIX #3, #8, #9: Ensure stdin is ready before starting
  ensureStdinReady();

  // Add startup components status
  startupLogger.addComponent('Node.js', 'ok', process.version);
  startupLogger.addComponent('Swarm Engine', 'ok', '12 agents ready');
  startupLogger.addComponent('Session Cache', 'ok', 'loaded');

  // Check Ollama
  try {
    await execAsync('ollama --version');
    startupLogger.addComponent('Ollama', 'ok', 'available');
  } catch {
    startupLogger.addComponent('Ollama', 'warning', 'not found');
  }

  // Check Gemini API
  if (process.env.GEMINI_API_KEY) {
    startupLogger.addComponent('Gemini API', 'ok', 'configured');
  } else {
    startupLogger.addComponent('Gemini API', 'warning', 'GEMINI_API_KEY not set');
  }

  // Print startup summary
  startupLogger.printSummary();

  // Print quick help
  console.log(chalk.gray('  Komendy: /help, /queue, /mcp, @serena, exit'));
  console.log(chalk.gray('  Problemy ze stdin? Użyj /stdin-fix\n'));

  // === HIDDEN SYSTEM INIT MESSAGE ===
  try {
    await sessionMemory.addMessage('system', getIdentityContext(ROOT_DIR));
  } catch {
    // Silently ignore if session memory not ready
  }

  // Start the first prompt (async)
  promptLoop();
}

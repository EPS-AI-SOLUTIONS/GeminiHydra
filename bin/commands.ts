/**
 * CLI Commands - All Commander.js subcommands registration
 *
 * @module bin/commands
 */

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { Agent, AGENT_PERSONAS } from '../src/core/agent/Agent.js';
import { WatchMode } from '../src/cli/WatchMode.js';
import { ProjectContext } from '../src/cli/ProjectContext.js';
import { costTracker } from '../src/cli/CostTracker.js';
import { sessionMemory } from '../src/memory/SessionMemory.js';
import { longTermMemory } from '../src/memory/LongTermMemory.js';
import { agentMemory } from '../src/memory/AgentMemory.js';
import { projectMemory } from '../src/memory/ProjectMemory.js';
import { promptCommands } from '../src/cli/PromptCommands.js';
import { FileHandlers } from '../src/files/FileHandlers.js';
import { DebugLoop } from '../src/debug/DebugLoop.js';
import { mcpManager } from '../src/mcp/index.js';
import {
  execAsync,
  ROOT_DIR,
  swarm,
  printBanner,
  initializeSwarm,
  setProjectContext,
} from './cli-config.js';
import { runPipeline } from './interactive.js';
import { executeSwarm } from './execute.js';

// ============================================================================
// REGISTER ALL SUBCOMMANDS
// ============================================================================

export function registerCommands(program: Command): void {
  // ── PIPELINE ──
  program
    .command('pipe <tasks...>')
    .description('Execute tasks in a pipeline (chained)')
    .action(async (tasks) => {
      printBanner();
      await initializeSwarm();

      const pipelineStr = tasks.join(' | ');
      await runPipeline(pipelineStr);
    });

  // ── WATCH ──
  program
    .command('watch <directory>')
    .description('Watch directory and execute task on changes')
    .option('-t, --task <task>', 'Task to execute on change', 'review and suggest improvements')
    .option('-d, --debounce <ms>', 'Debounce time in ms', '1000')
    .option('-a, --agent <agent>', 'Use specific agent')
    .action(async (directory, options) => {
      printBanner();
      await initializeSwarm();

      const parsedDebounce = parseInt(options.debounce, 10);
      const watchMode = new WatchMode(swarm, {
        debounce: isNaN(parsedDebounce) || parsedDebounce < 0 ? 1000 : parsedDebounce,
        agent: options.agent,
      });

      await watchMode.watch(directory, options.task);
    });

  // ── INIT ──
  program
    .command('init')
    .description('Initialize project context (index codebase)')
    .option('-p, --path <path>', 'Project path', process.cwd())
    .action(async (options) => {
      printBanner();
      const ctx = new ProjectContext(options.path);
      setProjectContext(ctx);
      await ctx.init();
    });

  // ── STATUS/COST ──
  program
    .command('status')
    .alias('cost')
    .description('Show token usage and cost report')
    .action(async () => {
      printBanner();
      await costTracker.load();
      costTracker.printStatus();
    });

  program
    .command('budget <amount>')
    .description('Set daily budget limit')
    .action(async (amount) => {
      await costTracker.load();
      const parsedBudget = parseFloat(amount);
      if (isNaN(parsedBudget) || parsedBudget < 0) {
        console.error(chalk.red('Invalid budget amount. Must be a non-negative number.'));
        return;
      }
      await costTracker.setBudget(parsedBudget);
    });

  // ── DOCTOR ──
  program
    .command('doctor')
    .description('Check system health')
    .action(async () => {
      printBanner();
      console.log(chalk.blue('\n🔍 System Diagnostics\n'));

      // Node
      console.log(chalk.gray('Node.js:'), chalk.green(process.version));

      // Ollama
      try {
        await execAsync('ollama --version');
        console.log(chalk.gray('Ollama:'), chalk.green('✓ Available'));
      } catch {
        console.log(chalk.gray('Ollama:'), chalk.red('✗ Not found'));
      }

      // Gemini API
      if (process.env.GEMINI_API_KEY) {
        console.log(chalk.gray('Gemini API:'), chalk.green('✓ Key configured'));
      } else {
        console.log(chalk.gray('Gemini API:'), chalk.red('✗ GEMINI_API_KEY not set'));
      }

      // Features
      console.log(chalk.gray('\nProtocol v14.0 Features:'));
      console.log(chalk.gray('  Phase A (Planning):'), chalk.green('✓'));
      console.log(chalk.gray('  Phase B (Execution):'), chalk.green('✓'));
      console.log(chalk.gray('  Phase C (Self-Healing):'), chalk.green('✓'));
      console.log(chalk.gray('  Phase D (Synthesis):'), chalk.green('✓'));
      console.log(chalk.gray('  Interactive Mode:'), chalk.green('✓'));
      console.log(chalk.gray('  Pipeline Mode:'), chalk.green('✓'));
      console.log(chalk.gray('  Watch Mode:'), chalk.green('✓'));
      console.log(chalk.gray('  YOLO Mode:'), chalk.green('✓ Active'));

      // Agents
      console.log(chalk.gray('\n12 Witcher Agents:'));
      Object.entries(AGENT_PERSONAS).forEach(([name, persona]) => {
        const model = persona.model === 'gemini-cloud' ? chalk.cyan('Gemini') : chalk.yellow(persona.model);
        console.log(chalk.gray(`  ${name.padEnd(10)} ${persona.role.padEnd(12)} ${model}`));
      });

      // MCP Status
      console.log(chalk.gray('\nMCP Integration:'));
      try {
        await mcpManager.init({ projectRoot: ROOT_DIR });
        const servers = mcpManager.getAllServers();
        const tools = mcpManager.getAllTools();
        if (servers.length > 0) {
          console.log(chalk.gray('  Servers:'), chalk.green(`${servers.length} connected`));
          console.log(chalk.gray('  Tools:'), chalk.green(`${tools.length} available`));
        } else {
          console.log(chalk.gray('  Status:'), chalk.yellow('No servers configured'));
          console.log(chalk.gray('  Add with: gemini mcp --add <name> --command "..."'));
        }
      } catch (error: any) {
        console.log(chalk.gray('  Status:'), chalk.yellow('Not initialized'));
      }

      console.log(chalk.green('\n✓ System Ready\n'));
    });

  // ── SHELL/READ ──
  program
    .command('shell <command...>')
    .description('Execute shell command')
    .action(async (command) => {
      try {
        const { stdout, stderr } = await execAsync(command.join(' '));
        if (stdout) console.log(stdout);
        if (stderr) console.error(chalk.yellow(stderr));
      } catch (error: any) {
        console.error(chalk.red(error.message));
      }
    });

  program
    .command('read <filepath>')
    .description('Read file contents')
    .action(async (filepath) => {
      try {
        const content = await fs.readFile(filepath, 'utf-8');
        console.log(content);
      } catch (error: any) {
        console.error(chalk.red(`Cannot read: ${error.message}`));
      }
    });

  // ── AGENT ──
  program
    .command('agent <name> <task>')
    .alias('a')
    .description('Execute task with specific agent')
    .action(async (name, task) => {
      printBanner();
      await costTracker.load();

      const matchedAgent = Object.keys(AGENT_PERSONAS).find(
        a => a.toLowerCase() === name.toLowerCase()
      );

      if (!matchedAgent) {
        console.error(chalk.red(`Unknown agent: ${name}`));
        console.log(chalk.gray(`Available: ${Object.keys(AGENT_PERSONAS).join(', ')}`));
        return;
      }

      console.log(chalk.cyan(`\n🐺 ${matchedAgent} executing task...\n`));

      const agent = new Agent(matchedAgent as any);
      const result = await agent.think(task);

      console.log(chalk.green('\n═══ Result ═══\n'));
      console.log(result);
    });

  // ── MEMORY ──
  program
    .command('memory')
    .description('Memory management commands')
    .option('-l, --list', 'List all memories')
    .option('-s, --search <query>', 'Search memories')
    .option('-r, --remember <text>', 'Remember something')
    .option('-c, --category <cat>', 'Memory category (decision/bug/pattern/preference/todo/fact)')
    .option('--stats', 'Show memory statistics')
    .action(async (options) => {
      await longTermMemory.init();

      if (options.stats) {
        longTermMemory.printSummary();
        return;
      }

      if (options.remember) {
        const category = options.category || 'fact';
        await longTermMemory.remember(options.remember, category as any);
        console.log(chalk.green('Memory saved!'));
        return;
      }

      if (options.search) {
        const results = longTermMemory.search(options.search);
        console.log(chalk.cyan(`\nSearch results for "${options.search}":\n`));
        results.forEach(m => {
          console.log(chalk.gray(`[${m.category}] ${m.content}`));
        });
        return;
      }

      if (options.list) {
        longTermMemory.printSummary();
      }
    });

  // ── SESSION ──
  program
    .command('session')
    .description('Session management')
    .option('-l, --list', 'List all sessions')
    .option('-r, --resume [id]', 'Resume a session')
    .option('-n, --new <name>', 'Start new named session')
    .option('-e, --export <file>', 'Export current session')
    .action(async (options) => {
      await sessionMemory.init();

      if (options.list) {
        const sessions = await sessionMemory.listSessions();
        console.log(chalk.cyan('\n═══ Sessions ═══\n'));
        sessions.forEach(s => {
          console.log(chalk.gray(`${s.id} | ${s.name} | ${s.messageCount} msgs | ${s.updated.toISOString()}`));
        });
        return;
      }

      if (options.resume !== undefined) {
        const session = await sessionMemory.resumeSession(options.resume || undefined);
        if (session) {
          console.log(chalk.green(`Resumed: ${session.name}`));
        }
        return;
      }

      if (options.new) {
        await sessionMemory.startSession(options.new);
        return;
      }

      if (options.export) {
        await sessionMemory.exportToFile(options.export);
        return;
      }
    });

  // ── AGENTS ──
  program
    .command('agents')
    .description('Agent memory and stats')
    .option('-l, --list', 'List all agents')
    .option('-s, --stats <agent>', 'Show agent stats')
    .action(async (options) => {
      await agentMemory.init();

      if (options.stats) {
        const profile = agentMemory.getProfile(options.stats as any);
        if (profile) {
          console.log(chalk.cyan(`\n═══ ${profile.name} ═══`));
          console.log(chalk.gray(`Specialty: ${profile.specialty}`));
          console.log(chalk.gray(`Tasks: ${profile.totalTasks}`));
          console.log(chalk.gray(`Success rate: ${(profile.successRate * 100).toFixed(1)}%`));
        }
        return;
      }

      agentMemory.printSummary();
    });

  // ── FILE ──
  program
    .command('file <filepath>')
    .alias('f')
    .description('Process a file (drag & drop supported)')
    .option('-a, --analyze', 'Analyze file content')
    .option('-e, --extract', 'Extract text content')
    .option('-t, --task <task>', 'Run task with file as context')
    .action(async (filepath, options) => {
      printBanner();

      // Handle quoted paths from drag & drop
      filepath = filepath.replace(/^["']|["']$/g, '').trim();

      console.log(chalk.cyan(`\n📄 Processing: ${path.basename(filepath)}\n`));

      const info = await FileHandlers.getFileInfo(filepath);
      console.log(chalk.gray(`Type: ${info.type}`));
      console.log(chalk.gray(`Size: ${((info.size ?? 0) / 1024).toFixed(1)} KB`));

      const content = await FileHandlers.extractContent(filepath);

      if (options.extract) {
        console.log(chalk.cyan('\n═══ Extracted Content ═══\n'));
        console.log(content.text);
        return;
      }

      if (options.analyze || !options.task) {
        console.log(chalk.cyan('\n═══ Analysis ═══\n'));
        console.log(content.text.substring(0, 2000));
        if (content.text.length > 2000) {
          console.log(chalk.gray(`\n... (${content.text.length - 2000} more characters)`));
        }
        return;
      }

      if (options.task) {
        await initializeSwarm();
        const fullTask = `File content:\n${content.text.substring(0, 5000)}\n\nTask: ${options.task}`;
        await executeSwarm(fullTask, { yolo: true });
      }
    });

  // ── IMAGE ──
  program
    .command('image <filepath>')
    .alias('img')
    .description('Analyze an image with Gemini Vision')
    .option('-p, --prompt <prompt>', 'Custom analysis prompt')
    .action(async (filepath, options) => {
      printBanner();

      filepath = filepath.replace(/^["']|["']$/g, '').trim();

      console.log(chalk.cyan(`\n🖼️  Analyzing image: ${path.basename(filepath)}\n`));

      const result = await FileHandlers.analyzeImage(filepath, options.prompt);

      console.log(chalk.green('═══ Image Analysis ═══\n'));
      console.log(result.text);
    });

  // ── DEBUG ──
  program
    .command('debug [target]')
    .description('Start debug loop with screenshots')
    .option('-m, --max <iterations>', 'Max iterations', '10')
    .option('-a, --auto-fix', 'Enable auto-fix', true)
    .option('-s, --screenshot <cmd>', 'Custom screenshot command')
    .action(async (target, options) => {
      printBanner();

      console.log(chalk.cyan('\n🔧 Debug Loop Mode\n'));

      const debugLoop = new DebugLoop();
      const parsedMax = parseInt(options.max, 10);
      const session = await debugLoop.startDebugLoop(target || process.cwd(), {
        maxIterations: isNaN(parsedMax) || parsedMax < 1 ? 10 : parsedMax,
        autoFix: options.autoFix,
        screenshotCommand: options.screenshot,
      });

      if (session.resolved) {
        console.log(chalk.green('\n✓ Debug session resolved successfully!'));
      } else {
        console.log(chalk.yellow('\n⚠ Debug session completed but issues may remain'));
      }
    });

  // ── INDEX ──
  program
    .command('index')
    .description('Index project for memory')
    .option('-f, --full', 'Full re-index')
    .action(async (options) => {
      printBanner();

      if (options.full) {
        await projectMemory.init();
      } else {
        const loaded = await projectMemory.load();
        if (!loaded) {
          console.log(chalk.yellow('No existing index found, creating new...'));
          await projectMemory.init();
        } else {
          projectMemory.printSummary();
        }
      }
    });

  // ── PROMPT ──
  program
    .command('prompt [subcommand] [args...]')
    .alias('p')
    .description('Prompt memory management (save, list, search, use)')
    .action(async (subcommand, args) => {
      printBanner();

      const allArgs = subcommand ? [subcommand, ...args] : [];
      const result = await promptCommands.handle(allArgs);

      if (!result.success && result.message) {
        console.error(chalk.red(result.message));
      }
    });

  // ── MCP ──
  program
    .command('mcp')
    .description('MCP server management')
    .option('-l, --list', 'List all MCP servers and tools')
    .option('-s, --status', 'Show MCP status')
    .option('-a, --add <name>', 'Add a new MCP server')
    .option('-r, --remove <name>', 'Remove an MCP server')
    .option('-c, --call <tool>', 'Call an MCP tool')
    .option('--command <cmd>', 'Command to run (for add)')
    .option('--args <args>', 'Arguments (comma-separated)')
    .option('--url <url>', 'Server URL (for SSE transport)')
    .option('--params <json>', 'Tool parameters as JSON (for call)')
    .action(async (options) => {
      printBanner();

      // Add server
      if (options.add) {
        if (!options.command && !options.url) {
          console.error(chalk.red('Error: --command or --url required'));
          console.log(chalk.gray('Example: gemini mcp --add myserver --command "npx -y @server/mcp"'));
          return;
        }

        await mcpManager.addServer({
          name: options.add,
          command: options.command,
          args: options.args ? options.args.split(',') : [],
          url: options.url,
          enabled: true,
        });

        // Try to connect
        try {
          await mcpManager.connectServer({
            name: options.add,
            command: options.command,
            args: options.args ? options.args.split(',') : [],
            url: options.url,
          });
        } catch (error: any) {
          console.log(chalk.yellow(`Note: Could not connect immediately: ${error.message}`));
        }
        return;
      }

      // Remove server
      if (options.remove) {
        await mcpManager.removeServer(options.remove);
        return;
      }

      // Call tool
      if (options.call) {
        await mcpManager.init({ projectRoot: ROOT_DIR });
        const params = options.params ? JSON.parse(options.params) : {};

        console.log(chalk.cyan(`\n🔧 Calling MCP tool: ${options.call}\n`));

        try {
          const result = await mcpManager.callTool(options.call, params);
          console.log(chalk.green('═══ Result ═══\n'));

          if (result.content && Array.isArray(result.content)) {
            result.content.forEach((c: any) => {
              if (c.type === 'text') console.log(c.text);
              else if (c.type === 'image') console.log(chalk.gray(`[Image: ${c.mimeType}]`));
              else console.log(JSON.stringify(c, null, 2));
            });
          } else {
            console.log(JSON.stringify(result, null, 2));
          }
        } catch (error: any) {
          console.error(chalk.red(`Error: ${error.message}`));
        }
        return;
      }

      // List servers/tools or show status
      await mcpManager.init({ projectRoot: ROOT_DIR });
      mcpManager.printStatus();

      // List all tools
      const tools = mcpManager.getAllTools();
      if (tools.length > 0) {
        console.log(chalk.cyan('\n═══ Available Tools ═══\n'));
        tools.forEach(tool => {
          console.log(chalk.white(`mcp__${tool.serverName}__${tool.name}`));
          console.log(chalk.gray(`  ${tool.description.substring(0, 80)}${tool.description.length > 80 ? '...' : ''}`));
        });
      }

      // List prompts
      const prompts = mcpManager.getAllPrompts();
      if (prompts.length > 0) {
        console.log(chalk.cyan('\n═══ Available Prompts ═══\n'));
        prompts.forEach(prompt => {
          console.log(chalk.white(`${prompt.serverName}/${prompt.name}`));
          console.log(chalk.gray(`  ${prompt.description || 'No description'}`));
        });
      }

      // List resources
      const resources = mcpManager.getAllResources();
      if (resources.length > 0) {
        console.log(chalk.cyan('\n═══ Available Resources ═══\n'));
        resources.forEach(resource => {
          console.log(chalk.white(`${resource.name}`));
          console.log(chalk.gray(`  ${resource.uri}`));
        });
      }
    });

  // ── MCP:CALL ──
  program
    .command('mcp:call <tool> [params...]')
    .description('Quick MCP tool call')
    .action(async (tool, params) => {
      await mcpManager.init({ projectRoot: ROOT_DIR });

      // Parse params: key=value key2=value2
      const parsedParams: Record<string, any> = {};
      params.forEach((p: string) => {
        const [key, ...valueParts] = p.split('=');
        const value = valueParts.join('=');
        try {
          parsedParams[key] = JSON.parse(value);
        } catch {
          parsedParams[key] = value;
        }
      });

      console.log(chalk.cyan(`\n🔧 ${tool}\n`));

      try {
        const result = await mcpManager.callTool(tool, parsedParams);

        if (result.content && Array.isArray(result.content)) {
          result.content.forEach((c: any) => {
            if (c.type === 'text') console.log(c.text);
            else console.log(JSON.stringify(c, null, 2));
          });
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
      } catch (error: any) {
        console.error(chalk.red(error.message));
      }
    });

  // ── MCP:SERVERS ──
  program
    .command('mcp:servers')
    .description('List MCP servers')
    .action(async () => {
      await mcpManager.init({ projectRoot: ROOT_DIR });
      const servers = mcpManager.getAllServers();

      console.log(chalk.cyan('\n═══ MCP Servers ═══\n'));

      if (servers.length === 0) {
        console.log(chalk.gray('No servers configured.'));
        console.log(chalk.gray('\nAdd one with:'));
        console.log(chalk.white('  gemini mcp --add <name> --command "npx -y @server/mcp"'));
        return;
      }

      servers.forEach(s => {
        const icon = s.status === 'connected' ? '✓' : s.status === 'connecting' ? '...' : '✗';
        const color = s.status === 'connected' ? chalk.green : s.status === 'error' ? chalk.red : chalk.yellow;
        console.log(color(`${icon} ${s.name}`));
        console.log(chalk.gray(`    Tools: ${s.tools} | Prompts: ${s.prompts} | Resources: ${s.resources}`));
      });
    });
}

#!/usr/bin/env node
/**
 * GeminiHydra CLI - YOLO Edition v14.0 "School of the Wolf"
 *
 * Protocol v14.0 - Full Node.js Implementation
 *
 * Features:
 * 1. Interactive Mode with History (FIXED: readline issues)
 * 2. Pipeline Mode (task chaining)
 * 3. Watch Mode (file monitoring)
 * 4. Project Context (awareness)
 * 5. Cost Tracking
 * 6. 5-Phase Execution (PRE-A → A → B → C → D)
 * 7. Self-Healing Repair Loop
 * 8. MCP Integration
 *
 * STDIN FIXES APPLIED:
 * - Fix #1: Quick Edit Mode warning
 * - Fix #3: Explicit stdin.resume() after async
 * - Fix #4: readline/promises support
 * - Fix #5: Protected readline close
 * - Fix #6: MCP subprocess stdin.end()
 * - Fix #7: Inquirer.js fallback
 * - Fix #8: setRawMode for interactivity
 * - Fix #9: process.stdin.ref() protection
 *
 * @module bin/gemini
 */

// UTF-8 Encoding Fix: Ensure Polish characters (ó, ą, ę, ś, etc.) display correctly
process.stdout.setDefaultEncoding('utf8');
process.stderr.setDefaultEncoding('utf8');

import { Command } from 'commander';
import { printBanner, initializeSwarm } from './cli-config.js';
import { runInteractiveMode } from './interactive.js';
import { registerCommands } from './commands.js';
import { executeSwarm } from './execute.js';

// ═══════════════════════════════════════════════════════════════
// PROGRAM SETUP
// ═══════════════════════════════════════════════════════════════

const program = new Command();

program
  .name('gemini')
  .description('GeminiHydra Agent Swarm CLI - School of the Wolf Edition')
  .version('14.0.0');

// ═══════════════════════════════════════════════════════════════
// DEFAULT COMMAND - Interactive/Swarm Mode
// ═══════════════════════════════════════════════════════════════
program
  .argument('[objective]', 'Mission objective (or enter interactive mode)')
  .option('-i, --interactive', 'Force interactive mode')
  .option('-y, --yolo', 'YOLO mode (default: true)', true)
  .option('-v, --verbose', 'Verbose output')
  .action(async (objective, options) => {
    printBanner();
    await initializeSwarm();

    if (!objective || options.interactive) {
      // Interactive Mode
      await runInteractiveMode();
    } else {
      // Direct execution
      await executeSwarm(objective, options);
    }
  });

// ═══════════════════════════════════════════════════════════════
// REGISTER ALL SUBCOMMANDS
// ═══════════════════════════════════════════════════════════════
registerCommands(program);

// Parse and run
program.parse();

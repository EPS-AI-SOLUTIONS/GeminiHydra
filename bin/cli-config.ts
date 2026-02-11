/**
 * CLI Configuration - Global config, banner, and initialization
 *
 * @module bin/cli-config
 */

import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import chalk from 'chalk';
import { costTracker } from '../src/cli/CostTracker.js';
import type { ProjectContext } from '../src/cli/ProjectContext.js';
import { validateEnvVars } from '../src/config/config.js';
import { Swarm } from '../src/core/swarm/Swarm.js';
import { startupLogger } from '../src/utils/startupLogger.js';

export const execAsync = promisify(exec);

// FIX #7: Inquirer.js fallback for problematic terminals
export let useInquirer = false;
export let inquirerInput: any = null;

export async function loadInquirer() {
  try {
    const inquirer = await import('@inquirer/prompts');
    inquirerInput = inquirer.input;
    return true;
  } catch {
    console.log(chalk.yellow('[stdin] Inquirer.js not available, using readline'));
    return false;
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ROOT_DIR should point to project root, not dist/
export const ROOT_DIR = __dirname.includes('dist')
  ? path.resolve(__dirname, '..', '..')
  : path.resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════
// YOLO MODE CONFIGURATION
// ═══════════════════════════════════════════════════════════════
export const YOLO_CONFIG = {
  autoApprove: true,
  fileSystemAccess: true,
  shellAccess: true,
  networkAccess: true,
  maxConcurrency: 8,
  timeout: 300000,
  rootDir: ROOT_DIR,
};

// Banner
export function printBanner() {
  startupLogger.reset();
  startupLogger.printBanner();
  startupLogger.printWindowsWarning();
}

// Global resources
export let swarm: Swarm;
export let projectContext: ProjectContext;

export async function initializeSwarm() {
  // ESM Fix: Dynamic import ensures dotenv loads .env BEFORE validateEnvVars checks process.env
  // Static imports are hoisted in ESM and don't guarantee execution order
  await import('dotenv/config');
  validateEnvVars();
  swarm = new Swarm(path.join(ROOT_DIR, '.serena'), YOLO_CONFIG);
  await swarm.initialize();
  await costTracker.load();
}

export function setProjectContext(ctx: ProjectContext) {
  projectContext = ctx;
}

export function setUseInquirer(value: boolean) {
  useInquirer = value;
}

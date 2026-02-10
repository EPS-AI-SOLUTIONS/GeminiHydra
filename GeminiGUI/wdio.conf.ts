/**
 * WebdriverIO Configuration for Tauri E2E Tests
 *
 * Uses tauri-driver to connect to the REAL Tauri application.
 * No mocks - tests run against the actual Rust backend + React frontend.
 *
 * Requirements:
 * - cargo install tauri-driver
 * - Debug build: src-tauri/target/debug/geminigui.exe
 * - msedgedriver in drivers/ directory
 */

import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the built Tauri application binary
const TAURI_APP_PATH = path.resolve(
  __dirname,
  'src-tauri/target/debug/geminigui.exe'
);

// Path to msedgedriver directory
const DRIVERS_DIR = path.resolve(__dirname, 'drivers');

let tauriDriver: ChildProcess | null = null;
let viteServer: ChildProcess | null = null;

/** Wait for Vite dev server to be ready at localhost:1420 */
async function waitForVite(timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = http.get('http://localhost:1420', (res) => {
          res.resume();
          resolve();
        });
        req.on('error', reject);
        req.setTimeout(1000, () => { req.destroy(); reject(new Error('timeout')); });
      });
      return; // Server is up
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('Vite dev server did not start within ' + timeoutMs + 'ms');
}

export const config: WebdriverIO.Config = {
  // ==================
  // Runner Configuration
  // ==================
  runner: 'local',
  autoCompileOpts: {
    tsNodeOpts: {
      project: './tsconfig.json',
    },
  },

  // ==================
  // Test Files
  // ==================
  specs: ['./tests/e2e-tauri/**/*.spec.ts'],

  // ==================
  // Capabilities
  // ==================
  maxInstances: 1,
  capabilities: [
    {
      maxInstances: 1,
      browserName: 'edge',
      'tauri:options': {
        application: TAURI_APP_PATH,
        webviewOptions: {},
      },
    },
  ],

  // ==================
  // Test Framework
  // ==================
  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },

  // ==================
  // Reporter
  // ==================
  reporters: ['spec'],

  // ==================
  // Connection
  // ==================
  hostname: '127.0.0.1',
  port: 4444,

  // ==================
  // Timeouts
  // ==================
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,

  // ==================
  // Hooks
  // ==================

  /**
   * Before the test session starts:
   * 1. Start Vite dev server (the debug build loads UI from localhost:1420)
   * 2. Start tauri-driver which proxies WebDriver commands to the Tauri app.
   */
  beforeSession: async function () {
    // 1. Start Vite dev server for the frontend
    console.log('[WDIO] Starting Vite dev server...');
    viteServer = spawn('npx', ['vite', '--port', '1420'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      cwd: __dirname,
    });
    viteServer.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[vite] ${msg}`);
    });
    viteServer.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[vite:err] ${msg}`);
    });

    await waitForVite();
    console.log('[WDIO] Vite dev server ready at http://localhost:1420');

    // 2. Start tauri-driver
    console.log('[WDIO] Starting tauri-driver...');
    const env = { ...process.env };
    env.PATH = DRIVERS_DIR + path.delimiter + (env.PATH || '');

    tauriDriver = spawn('tauri-driver', [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      env,
    });

    tauriDriver.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[tauri-driver] ${msg}`);
    });

    tauriDriver.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[tauri-driver:err] ${msg}`);
    });

    // Give tauri-driver time to start
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log('[WDIO] tauri-driver started (pid:', tauriDriver.pid, ')');
  },

  /**
   * After browser session is created but before tests run:
   * Wait for the Tauri app UI to fully load.
   * The debug binary navigates to devUrl (localhost:1420) automatically,
   * but we may need to wait or navigate manually.
   */
  before: async function () {
    // Check current URL - if still about:blank, the app may need a moment
    const url = await browser.getUrl();
    console.log('[WDIO] Current URL:', url);

    if (url === 'about:blank' || !url.includes('localhost')) {
      // Wait a moment for the app to navigate to devUrl
      await browser.pause(3000);
      const url2 = await browser.getUrl();
      console.log('[WDIO] URL after wait:', url2);

      if (url2 === 'about:blank' || !url2.includes('localhost')) {
        // Navigate manually to the dev server
        console.log('[WDIO] Navigating to http://localhost:1420...');
        await browser.url('http://localhost:1420');
      }
    }

    // Wait for the app to load (React renders the main element)
    await browser.waitUntil(
      async () => {
        try {
          const main = await $('main');
          return await main.isDisplayed();
        } catch {
          return false;
        }
      },
      {
        timeout: 30000,
        interval: 500,
        timeoutMsg: 'Tauri app UI did not load within 30 seconds',
      }
    );
    console.log('[WDIO] Tauri app UI loaded successfully');
  },

  /**
   * After the test session:
   * Kill tauri-driver and Vite dev server.
   */
  afterSession: async function () {
    if (tauriDriver) {
      console.log('[WDIO] Stopping tauri-driver...');
      tauriDriver.kill();
      tauriDriver = null;
    }
    if (viteServer) {
      console.log('[WDIO] Stopping Vite dev server...');
      viteServer.kill();
      viteServer = null;
    }
  },
};

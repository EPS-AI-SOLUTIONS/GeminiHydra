/**
 * OllamaManager - Health check, warmup, and environment management for Ollama
 * Ported from AgentSwarm.psm1 lines 240-312
 */

import { type ChildProcess, exec, spawn } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import chalk from 'chalk';

const execAsync = promisify(exec);

interface OllamaConfig {
  keepAlive: string;
  numParallel: number;
  flashAttention: boolean;
  host: string;
  port: number;
}

const DEFAULT_CONFIG: OllamaConfig = {
  keepAlive: '24h',
  numParallel: 8, // Increased for Phase B parallel agent execution
  flashAttention: true,
  host: 'localhost',
  port: 11434,
};

// Models to warmup on startup
const WARMUP_MODELS = ['qwen3:4b', 'qwen3:0.6b'];

class OllamaManager {
  private config: OllamaConfig;
  private isAlive: boolean = false;
  private process: ChildProcess | null = null;
  private monitorInterval: NodeJS.Timeout | null = null;
  private consecutiveFailures: number = 0;
  private lastHealthCheck: Date | null = null;
  private totalRestarts: number = 0;
  private isRestarting: boolean = false;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start continuous health monitoring with auto-restart
   */
  startMonitoring(intervalMs: number = 15000): void {
    if (this.monitorInterval) {
      console.log(chalk.gray('[Ollama Monitor] Already running'));
      return;
    }

    console.log(chalk.cyan(`[Ollama Monitor] Starting (check every ${intervalMs / 1000}s)`));

    this.monitorInterval = setInterval(async () => {
      await this.healthCheck();
    }, intervalMs);

    // Immediate first check
    this.healthCheck();
  }

  /**
   * Stop health monitoring
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log(chalk.gray('[Ollama Monitor] Stopped'));
    }
  }

  /**
   * Perform health check with auto-restart on failure
   */
  private async healthCheck(): Promise<void> {
    if (this.isRestarting) return;

    this.lastHealthCheck = new Date();
    const alive = await this.testPulse();

    if (alive) {
      if (this.consecutiveFailures > 0) {
        console.log(
          chalk.green(`[Ollama Monitor] ✓ Recovered after ${this.consecutiveFailures} failures`),
        );
      }
      this.consecutiveFailures = 0;
      return;
    }

    // Server not responding
    this.consecutiveFailures++;
    console.log(
      chalk.yellow(
        `[Ollama Monitor] ⚠ Health check failed (${this.consecutiveFailures} consecutive)`,
      ),
    );

    // Auto-restart after 2 consecutive failures
    if (this.consecutiveFailures >= 2) {
      await this.autoRestart();
    }
  }

  /**
   * Auto-restart Ollama server
   */
  private async autoRestart(): Promise<void> {
    if (this.isRestarting) return;

    this.isRestarting = true;
    this.totalRestarts++;

    console.log(
      chalk.magenta(
        `[Ollama Monitor] 🔄 Auto-restarting server (restart #${this.totalRestarts})...`,
      ),
    );

    try {
      await this.killExisting();
      await this.startOllama();

      // Wait for startup (max 30 seconds for auto-restart)
      for (let i = 0; i < 15; i++) {
        await this.sleep(2000);

        if (await this.testPulse()) {
          console.log(chalk.green(`[Ollama Monitor] ✓ Server restarted successfully!`));
          this.consecutiveFailures = 0;
          this.isAlive = true;

          // Quick warmup after restart
          await this.warmup(['llama3.2:3b']);
          break;
        }

        if (i % 5 === 0) {
          console.log(chalk.gray(`[Ollama Monitor] Waiting for restart... (${i * 2}s)`));
        }
      }

      if (!this.isAlive) {
        console.log(chalk.red('[Ollama Monitor] ✗ Auto-restart failed - server not responding'));
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(chalk.red(`[Ollama Monitor] ✗ Auto-restart error: ${msg}`));
    } finally {
      this.isRestarting = false;
    }
  }

  /**
   * Get monitoring statistics
   */
  getMonitorStats(): {
    isMonitoring: boolean;
    consecutiveFailures: number;
    totalRestarts: number;
    lastHealthCheck: Date | null;
    isAlive: boolean;
    isRestarting: boolean;
  } {
    return {
      isMonitoring: this.monitorInterval !== null,
      consecutiveFailures: this.consecutiveFailures,
      totalRestarts: this.totalRestarts,
      lastHealthCheck: this.lastHealthCheck,
      isAlive: this.isAlive,
      isRestarting: this.isRestarting,
    };
  }

  /**
   * Health check - Test if Ollama is responding
   * Equivalent to Test-OllamaPulse in PS1
   */
  async testPulse(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${this.config.host}:${this.config.port}/api/tags`, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      this.isAlive = response.ok;
      return response.ok;
    } catch {
      this.isAlive = false;
      return false;
    }
  }

  /**
   * Kill existing Ollama processes
   */
  private async killExisting(): Promise<void> {
    try {
      if (process.platform === 'win32') {
        // Use taskkill without redirection - errors are caught by .catch()
        await execAsync('taskkill /F /IM ollama.exe', { windowsHide: true }).catch(() => {});
      } else {
        await execAsync('pkill -f ollama', { windowsHide: true }).catch(() => {});
      }
      // Wait for process to die
      await this.sleep(1000);
    } catch {
      // Ignore errors - process might not exist
    }
  }

  /**
   * Start Ollama with optimized environment variables
   */
  private async startOllama(): Promise<void> {
    console.log(chalk.cyan('[Ollama] Starting server with optimized settings...'));

    const env = {
      ...process.env,
      OLLAMA_KEEP_ALIVE: this.config.keepAlive,
      OLLAMA_NUM_PARALLEL: String(this.config.numParallel),
      OLLAMA_FLASH_ATTENTION: this.config.flashAttention ? '1' : '0',
      OLLAMA_HOST: `${this.config.host}:${this.config.port}`,
    };

    // Find Ollama executable
    const ollamaPath = await this.findOllamaPath();

    if (!ollamaPath) {
      throw new Error('Ollama executable not found. Please install Ollama.');
    }

    this.process = spawn(ollamaPath, ['serve'], {
      env,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });

    this.process.unref();

    console.log(chalk.gray(`[Ollama] Server started (PID: ${this.process.pid})`));
  }

  /**
   * Find Ollama executable path
   */
  private async findOllamaPath(): Promise<string | null> {
    // Check common locations
    const possiblePaths = [
      'ollama', // In PATH
      path.join(process.cwd(), 'bin', 'ollama.exe'),
      path.join(process.cwd(), 'bin', 'ollama'),
      `C:\\Users\\${process.env.USERNAME}\\AppData\\Local\\Programs\\Ollama\\ollama.exe`,
      '/usr/local/bin/ollama',
      '/usr/bin/ollama',
    ];

    for (const p of possiblePaths) {
      try {
        if (p === 'ollama') {
          // Check if in PATH
          const { stdout } = await execAsync(
            process.platform === 'win32' ? 'where ollama' : 'which ollama',
          );
          if (stdout.trim()) return 'ollama';
        }
        // For explicit paths, we'd need to check file exists
        // For simplicity, just try 'ollama' command
      } catch {}
    }

    return 'ollama'; // Fallback to hoping it's in PATH
  }

  /**
   * Warmup models by sending minimal requests
   * Equivalent to PS1 lines 292-303
   */
  async warmup(models: string[] = WARMUP_MODELS): Promise<void> {
    console.log(chalk.cyan('[Ollama] Warming up models...'));

    for (const model of models) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        await fetch(`http://${this.config.host}:${this.config.port}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            prompt: 'hi',
            stream: false,
            options: { num_predict: 1 },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        console.log(chalk.green(`  [${model}] OK`));
      } catch {
        console.log(chalk.yellow(`  [${model}] SKIP (not available)`));
      }
    }
  }

  /**
   * Ensure Ollama is running - start if needed
   * Equivalent to Ensure-Ollama in PS1 lines 251-311
   */
  async ensure(): Promise<void> {
    // Check if already running
    if (await this.testPulse()) {
      console.log(chalk.green('[Ollama] Server already running'));
      return;
    }

    console.log(chalk.yellow('[Ollama] Server not responding. Starting...'));

    // Kill any zombie processes
    await this.killExisting();

    // Start fresh
    await this.startOllama();

    // Wait for startup (max 60 seconds)
    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(2000);

      if (await this.testPulse()) {
        console.log(chalk.green('[Ollama] Server is ready!'));
        this.isAlive = true;

        // Warmup common models
        await this.warmup();
        return;
      }

      if (i % 5 === 0) {
        console.log(chalk.gray(`[Ollama] Waiting for startup... (${i * 2}s)`));
      }
    }

    throw new Error('CRITICAL: Ollama server failed to start after 60 seconds');
  }

  /**
   * Get list of available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/api/tags`);

      if (!response.ok) return [];

      const data = await response.json();
      return data.models?.map((m: { name: string }) => m.name) || [];
    } catch {
      return [];
    }
  }

  /**
   * Check if a specific model is available
   */
  async hasModel(modelName: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some((m) => m.includes(modelName));
  }

  /**
   * Get server status
   */
  getStatus(): { alive: boolean; config: OllamaConfig } {
    return {
      alive: this.isAlive,
      config: this.config,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const ollamaManager = new OllamaManager();

// Export class for custom instances
export { OllamaManager };
export type { OllamaConfig };

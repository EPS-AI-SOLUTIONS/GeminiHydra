/**
 * GeminiHydra - LlamaCpp Server Manager
 * Automatyczne uruchamianie i zarządzanie serwerem llama-cpp-python
 * + automatyczne pobieranie modeli GGUF z Hugging Face
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import { existsSync, mkdirSync, createWriteStream, statSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { get as httpsGet } from 'https';

export interface LlamaCppServerConfig {
  modelPath: string;
  port?: number;
  host?: string;
  nCtx?: number;
  nGpuLayers?: number;
  chatFormat?: string;
  verbose?: boolean;
}

export interface ServerStatus {
  running: boolean;
  pid?: number;
  port?: number;
  model?: string;
  error?: string;
}

// Popularne małe modele GGUF do pobrania
export const RECOMMENDED_MODELS = {
  'llama-3.2-1b': {
    repo: 'hugging-quants/Llama-3.2-1B-Instruct-Q4_K_M-GGUF',
    file: 'llama-3.2-1b-instruct-q4_k_m.gguf',
    size: '0.8GB',
  },
  'llama-3.2-3b': {
    repo: 'hugging-quants/Llama-3.2-3B-Instruct-Q4_K_M-GGUF',
    file: 'llama-3.2-3b-instruct-q4_k_m.gguf',
    size: '2.0GB',
  },
  'phi-3-mini': {
    repo: 'microsoft/Phi-3-mini-4k-instruct-gguf',
    file: 'Phi-3-mini-4k-instruct-q4.gguf',
    size: '2.2GB',
  },
  'qwen2.5-1.5b': {
    repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
    file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: '1.0GB',
  },
  'tinyllama': {
    repo: 'TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF',
    file: 'tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf',
    size: '0.7GB',
  },
} as const;

export type RecommendedModel = keyof typeof RECOMMENDED_MODELS;

class LlamaCppServerManager {
  private process: ChildProcess | null = null;
  private port: number = 8000;
  private modelPath: string = '';
  private startPromise: Promise<boolean> | null = null;

  /**
   * Sprawdź czy serwer już działa
   */
  async isRunning(): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${this.port}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Uruchom serwer llama-cpp-python
   */
  async start(config: LlamaCppServerConfig): Promise<boolean> {
    if (this.startPromise) {
      return this.startPromise;
    }

    if (await this.isRunning()) {
      console.log('[llama-cpp] Server already running on port', this.port);
      return true;
    }

    this.startPromise = this.doStart(config);
    const result = await this.startPromise;
    this.startPromise = null;
    return result;
  }

  private async doStart(config: LlamaCppServerConfig): Promise<boolean> {
    this.port = config.port || 8000;
    this.modelPath = config.modelPath;

    if (!existsSync(config.modelPath)) {
      console.error(`[llama-cpp] Model not found: ${config.modelPath}`);
      return false;
    }

    // Sprawdź czy llama-cpp-python jest zainstalowany
    try {
      execSync('python -c "import llama_cpp"', { stdio: 'pipe' });
    } catch {
      console.error('[llama-cpp] llama-cpp-python is not installed!');
      console.error('[llama-cpp] Install it with:');
      console.error('  pip install llama-cpp-python[server]');
      console.error('');
      console.error('  # For GPU support (CUDA):');
      console.error('  CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python[server]');
      return false;
    }

    const args = [
      '-m', 'llama_cpp.server',
      '--model', config.modelPath,
      '--port', String(this.port),
      '--host', config.host || '0.0.0.0',
    ];

    if (config.nCtx) {
      args.push('--n_ctx', String(config.nCtx));
    }

    if (config.nGpuLayers !== undefined) {
      args.push('--n_gpu_layers', String(config.nGpuLayers));
    }

    if (config.chatFormat) {
      args.push('--chat_format', config.chatFormat);
    }

    console.log(`[llama-cpp] Starting server with model: ${basename(config.modelPath)}`);

    return new Promise((resolve) => {
      try {
        this.process = spawn('python', args, {
          stdio: config.verbose ? 'inherit' : 'pipe',
          detached: false,
        });

        let stderr = '';
        if (this.process.stderr) {
          this.process.stderr.on('data', (data) => {
            stderr += data.toString();
          });
        }

        this.process.on('error', (err) => {
          console.error('[llama-cpp] Failed to start:', err.message);
          this.process = null;
          resolve(false);
        });

        this.process.on('exit', (code) => {
          if (code !== 0 && code !== null) {
            console.error(`[llama-cpp] Server exited with code ${code}`);
            if (stderr) {
              console.error('[llama-cpp] Error:', stderr.slice(0, 500));
            }
          }
          this.process = null;
        });

        this.waitForServer(30000).then(resolve);
      } catch (err) {
        console.error('[llama-cpp] Failed to spawn process:', err);
        resolve(false);
      }
    });
  }

  private async waitForServer(timeout: number): Promise<boolean> {
    const start = Date.now();
    const interval = 500;

    while (Date.now() - start < timeout) {
      if (await this.isRunning()) {
        console.log(`[llama-cpp] Server ready on port ${this.port}`);
        return true;
      }
      await new Promise(r => setTimeout(r, interval));
    }

    console.error('[llama-cpp] Server startup timeout');
    return false;
  }

  stop(): void {
    if (this.process) {
      console.log('[llama-cpp] Stopping server...');
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  async getStatus(): Promise<ServerStatus> {
    const running = await this.isRunning();
    return {
      running,
      pid: this.process?.pid,
      port: this.port,
      model: this.modelPath,
    };
  }

  static findModels(directory: string): string[] {
    const models: string[] = [];
    try {
      const files = readdirSync(directory);
      for (const file of files) {
        if (file.endsWith('.gguf')) {
          models.push(join(directory, file));
        }
      }
    } catch {
      // Ignore
    }
    return models;
  }

  static autoDetectModel(): string | null {
    const searchPaths = [
      './models',
      '../models',
      process.env.LLAMA_CPP_MODELS_DIR,
      join(process.env.HOME || process.env.USERPROFILE || '', '.cache', 'llama-cpp', 'models'),
      join(process.env.HOME || process.env.USERPROFILE || '', 'models'),
    ].filter(Boolean) as string[];

    for (const dir of searchPaths) {
      if (existsSync(dir)) {
        const models = LlamaCppServerManager.findModels(dir);
        if (models.length > 0) {
          const sorted = models.sort((a, b) => {
            try {
              return statSync(a).size - statSync(b).size;
            } catch {
              return 0;
            }
          });
          return sorted[0];
        }
      }
    }
    return null;
  }
}

// Singleton
export const llamaCppServer = new LlamaCppServerManager();

/**
 * Pobierz model GGUF z Hugging Face
 */
export async function downloadModel(
  modelName: RecommendedModel | string,
  targetDir: string = './models'
): Promise<string | null> {
  // Sprawdź czy to znany model
  const modelInfo = RECOMMENDED_MODELS[modelName as RecommendedModel];

  if (!modelInfo) {
    console.error(`[llama-cpp] Unknown model: ${modelName}`);
    console.log('[llama-cpp] Available models:', Object.keys(RECOMMENDED_MODELS).join(', '));
    return null;
  }

  // Utwórz katalog
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const targetPath = join(targetDir, modelInfo.file);

  // Sprawdź czy już istnieje
  if (existsSync(targetPath)) {
    console.log(`[llama-cpp] Model already exists: ${targetPath}`);
    return targetPath;
  }

  console.log(`[llama-cpp] Downloading ${modelName} (${modelInfo.size})...`);
  console.log(`[llama-cpp] From: ${modelInfo.repo}`);

  // Spróbuj użyć huggingface-cli
  try {
    const hfCmd = `huggingface-cli download ${modelInfo.repo} ${modelInfo.file} --local-dir "${targetDir}" --local-dir-use-symlinks False`;
    console.log(`[llama-cpp] Running: ${hfCmd}`);
    execSync(hfCmd, { stdio: 'inherit' });

    if (existsSync(targetPath)) {
      console.log(`[llama-cpp] Downloaded: ${targetPath}`);
      return targetPath;
    }
  } catch {
    console.log('[llama-cpp] huggingface-cli not available, trying direct download...');
  }

  // Bezpośrednie pobieranie przez HTTP
  const url = `https://huggingface.co/${modelInfo.repo}/resolve/main/${modelInfo.file}`;

  return new Promise((resolve) => {
    console.log(`[llama-cpp] Downloading from: ${url}`);

    const downloadWithRedirect = (downloadUrl: string) => {
      httpsGet(downloadUrl, (response) => {
        // Obsługa przekierowania
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            downloadWithRedirect(redirectUrl);
            return;
          }
        }

        if (response.statusCode !== 200) {
          console.error(`[llama-cpp] Download failed: HTTP ${response.statusCode}`);
          resolve(null);
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloaded = 0;
        let lastPercent = 0;

        const file = createWriteStream(targetPath);

        response.on('data', (chunk) => {
          downloaded += chunk.length;
          const percent = Math.floor((downloaded / totalSize) * 100);
          if (percent > lastPercent && percent % 10 === 0) {
            console.log(`[llama-cpp] Progress: ${percent}%`);
            lastPercent = percent;
          }
        });

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log(`[llama-cpp] Downloaded: ${targetPath}`);
          resolve(targetPath);
        });

        file.on('error', (err) => {
          console.error(`[llama-cpp] Write error: ${err.message}`);
          resolve(null);
        });
      }).on('error', (err) => {
        console.error(`[llama-cpp] Download error: ${err.message}`);
        resolve(null);
      });
    };

    downloadWithRedirect(url);
  });
}

/**
 * Upewnij się że serwer działa - z automatycznym pobieraniem modelu
 */
export async function ensureLlamaCppServer(config?: Partial<LlamaCppServerConfig> & {
  autoDownload?: boolean;
  preferredModel?: RecommendedModel;
}): Promise<boolean> {
  // Sprawdź czy już działa
  if (await llamaCppServer.isRunning()) {
    return true;
  }

  // Pobierz model z env lub auto-detect
  let modelPath = config?.modelPath
    || process.env.LLAMA_CPP_MODEL_PATH
    || LlamaCppServerManager.autoDetectModel();

  // Jeśli brak modelu i autoDownload włączony, pobierz
  if (!modelPath && (config?.autoDownload ?? true)) {
    const preferredModel = config?.preferredModel || 'tinyllama';
    console.log(`[llama-cpp] No model found. Downloading ${preferredModel}...`);

    modelPath = await downloadModel(preferredModel, './models');
  }

  if (!modelPath) {
    console.warn('[llama-cpp] No model available.');
    console.warn('[llama-cpp] Options:');
    console.warn('  1. Set LLAMA_CPP_MODEL_PATH=/path/to/model.gguf');
    console.warn('  2. Place .gguf files in ./models/');
    console.warn('  3. Run: npx tsx -e "import {downloadModel} from \'./src/services/LlamaCppServer.js\'; downloadModel(\'tinyllama\')"');
    return false;
  }

  return llamaCppServer.start({
    modelPath,
    port: config?.port || parseInt(process.env.LLAMA_CPP_PORT || '8000', 10),
    nCtx: config?.nCtx || parseInt(process.env.LLAMA_CPP_CTX || '4096', 10),
    nGpuLayers: config?.nGpuLayers ?? (process.env.LLAMA_CPP_GPU_LAYERS ? parseInt(process.env.LLAMA_CPP_GPU_LAYERS, 10) : -1),
    chatFormat: config?.chatFormat || process.env.LLAMA_CPP_CHAT_FORMAT,
    verbose: config?.verbose ?? process.env.LLAMA_CPP_VERBOSE === 'true',
  });
}

/**
 * Lista dostępnych modeli do pobrania
 */
export function listAvailableModels(): void {
  console.log('\n[llama-cpp] Available models for download:\n');
  for (const [name, info] of Object.entries(RECOMMENDED_MODELS)) {
    console.log(`  ${name.padEnd(15)} ${info.size.padEnd(8)} ${info.repo}`);
  }
  console.log('\nDownload: downloadModel("model-name", "./models")');
}

// Cleanup
process.on('exit', () => llamaCppServer.stop());
process.on('SIGINT', () => {
  llamaCppServer.stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  llamaCppServer.stop();
  process.exit(0);
});

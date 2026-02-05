/**
 * GeminiHydra - Configuration Manager
 * GeminiCLI-style configuration with .hydrarc, .hydraignore support
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import type { HydraConfig, ProviderConfig, SwarmConfig, PathConfig, FeatureFlags, PipelineModels, LocalLLMConfig } from '../types/index.js';

// Default configuration
const DEFAULT_CONFIG: HydraConfig = {
  provider: {
    type: 'gemini',
    model: 'gemini-2.0-flash',
  },
  models: {
    phaseA: 'gemini-3-pro-preview',
    phaseBA: 'gemini-3-flash-preview',
    phaseB: 'llama-3.2-3b',
    phaseC: 'gemini-3-flash-preview',
    phaseD: 'gemini-3-flash-preview',
  },
  localLLM: {
    baseUrl: 'http://localhost:8000',  // llama-cpp-python default port
    models: [
      { name: 'llama-3.2-1b', difficulty: ['simple'], contextSize: 2048, description: 'Small, fast' },
      { name: 'llama-3.2-3b', difficulty: ['simple', 'moderate'], contextSize: 4096, description: 'Balanced' },
      { name: 'llama-3.1-8b', difficulty: ['moderate', 'complex'], contextSize: 8192, description: 'Large' },
    ],
    defaultModel: 'llama-3.2-3b',
  },
  swarm: {
    maxTasks: 3,
    timeout: 60000,
    maxRetries: 2,
    maxHealingCycles: 3,
    parallelExecution: true,
  },
  paths: {
    projectRoot: process.cwd(),
    trustedFolders: [],
    ignorePatterns: [
      'node_modules',
      '.git',
      'dist',
      'build',
      '*.log',
      '.env*',
    ],
  },
  features: {
    streaming: true,
    headless: false,
    verbose: false,
    sandbox: false,
    selfHealing: true,
    translation: true,
  },
};

/**
 * Configuration loader with file discovery (GeminiCLI pattern)
 */
export class ConfigManager {
  private config: HydraConfig;
  private configPath?: string;

  constructor(customPath?: string) {
    this.config = { ...DEFAULT_CONFIG };
    this.loadFromFiles(customPath);
    this.loadFromEnv();
  }

  /**
   * Load configuration from files (priority: custom > .hydrarc > .hydrarc.json)
   */
  private loadFromFiles(customPath?: string): void {
    const searchPaths = customPath
      ? [customPath]
      : [
          join(process.cwd(), '.hydrarc'),
          join(process.cwd(), '.hydrarc.json'),
          join(process.cwd(), 'hydra.config.json'),
          join(process.env.HOME || '', '.hydrarc'),
        ];

    for (const filePath of searchPaths) {
      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          const fileConfig = JSON.parse(content);
          this.mergeConfig(fileConfig);
          this.configPath = filePath;
          break;
        } catch {
          // Skip invalid config files
        }
      }
    }

    // Load ignore patterns from .hydraignore
    this.loadIgnorePatterns();
  }

  /**
   * Load .hydraignore file (similar to .geminiignore)
   */
  private loadIgnorePatterns(): void {
    const ignorePath = join(process.cwd(), '.hydraignore');
    if (existsSync(ignorePath)) {
      try {
        const content = readFileSync(ignorePath, 'utf-8');
        const patterns = content
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
        this.config.paths.ignorePatterns.push(...patterns);
      } catch {
        // Skip invalid ignore file
      }
    }
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnv(): void {
    // Provider settings
    if (process.env.GEMINI_API_KEY) {
      this.config.provider.type = 'gemini';
      this.config.provider.apiKey = process.env.GEMINI_API_KEY;
    }

    if (process.env.LOCAL_LLM_URL) {
      this.config.provider.type = 'local';
      this.config.provider.baseUrl = process.env.LOCAL_LLM_URL;
    }

    if (process.env.HYDRA_MODEL) {
      this.config.provider.model = process.env.HYDRA_MODEL;
    }

    // Feature flags
    if (process.env.HYDRA_HEADLESS === 'true') {
      this.config.features.headless = true;
    }

    if (process.env.HYDRA_VERBOSE === 'true') {
      this.config.features.verbose = true;
    }

    if (process.env.HYDRA_STREAMING === 'false') {
      this.config.features.streaming = false;
    }

    // Swarm settings
    if (process.env.HYDRA_MAX_TASKS) {
      this.config.swarm.maxTasks = parseInt(process.env.HYDRA_MAX_TASKS, 10);
    }

    if (process.env.HYDRA_TIMEOUT) {
      this.config.swarm.timeout = parseInt(process.env.HYDRA_TIMEOUT, 10);
    }
  }

  /**
   * Merge partial config into current config
   */
  private mergeConfig(partial: Partial<HydraConfig>): void {
    if (partial.provider) {
      this.config.provider = { ...this.config.provider, ...partial.provider };
    }
    if (partial.swarm) {
      this.config.swarm = { ...this.config.swarm, ...partial.swarm };
    }
    if (partial.paths) {
      this.config.paths = { ...this.config.paths, ...partial.paths };
    }
    if (partial.features) {
      this.config.features = { ...this.config.features, ...partial.features };
    }
  }

  // Getters
  get provider(): ProviderConfig {
    return this.config.provider;
  }

  get swarm(): SwarmConfig {
    return this.config.swarm;
  }

  get paths(): PathConfig {
    return this.config.paths;
  }

  get features(): FeatureFlags {
    return this.config.features;
  }

  get all(): HydraConfig {
    return { ...this.config };
  }

  get configFile(): string | undefined {
    return this.configPath;
  }

  /**
   * Check if path is in trusted folders
   */
  isTrustedPath(path: string): boolean {
    const resolved = resolve(path);
    const root = resolve(this.config.paths.projectRoot);

    // Always trust project root
    if (resolved.startsWith(root)) {
      return true;
    }

    // Check trusted folders
    return this.config.paths.trustedFolders.some(folder => {
      const trustedPath = resolve(folder);
      return resolved.startsWith(trustedPath);
    });
  }

  /**
   * Check if path matches ignore patterns
   */
  isIgnored(path: string): boolean {
    return this.config.paths.ignorePatterns.some(pattern => {
      if (pattern.includes('*')) {
        // Simple glob matching
        const regex = new RegExp(
          '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
        );
        return regex.test(path);
      }
      return path.includes(pattern);
    });
  }

  /**
   * Update config at runtime
   */
  set(key: keyof HydraConfig, value: Partial<HydraConfig[keyof HydraConfig]>): void {
    if (key in this.config) {
      (this.config as unknown as Record<string, unknown>)[key] = {
        ...(this.config[key] as object),
        ...(value as object),
      };
    }
  }
}

// Singleton instance
let configInstance: ConfigManager | null = null;

export function getConfig(customPath?: string): ConfigManager {
  if (!configInstance || customPath) {
    configInstance = new ConfigManager(customPath);
  }
  return configInstance;
}

export function resetConfig(): void {
  configInstance = null;
}

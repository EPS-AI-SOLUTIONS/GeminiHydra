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
    model: 'gemini-3-pro-preview',
  },
  models: {
    phaseA: 'gemini-3-pro-preview',
    phaseBA: 'gemini-3-pro-preview',
    phaseB: 'qwen3-4b',
    phaseC: 'gemini-3-pro-preview',
    phaseD: 'gemini-3-pro-preview',
  },
  localLLM: {
    baseUrl: 'http://localhost:8000',  // llama-cpp-python default port
    models: [
      { name: 'qwen3-0.6b', difficulty: ['simple'], contextSize: 32768, description: 'Ultra-fast scout' },
      { name: 'qwen3-4b', difficulty: ['simple', 'medium'], contextSize: 262144, description: 'Primary workhorse' },
      { name: 'qwen3-8b', difficulty: ['medium', 'complex'], contextSize: 131072, description: 'High quality' },
    ],
    defaultModel: 'qwen3-4b',
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
      const parsed = parseInt(process.env.HYDRA_MAX_TASKS, 10);
      if (!isNaN(parsed) && parsed > 0) {
        this.config.swarm.maxTasks = parsed;
      }
    }

    if (process.env.HYDRA_TIMEOUT) {
      const parsed = parseInt(process.env.HYDRA_TIMEOUT, 10);
      if (!isNaN(parsed) && parsed > 0) {
        this.config.swarm.timeout = parsed;
      }
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
    return this.config.paths.trustedFolders.some((folder: string) => {
      const trustedPath = resolve(folder);
      return resolved.startsWith(trustedPath);
    });
  }

  /**
   * Check if path matches ignore patterns
   */
  isIgnored(path: string): boolean {
    return this.config.paths.ignorePatterns.some((pattern: string) => {
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
  set<K extends keyof HydraConfig>(key: K, value: Partial<HydraConfig[K]>): void {
    if (key in this.config) {
      this.config[key] = {
        ...this.config[key],
        ...value,
      } as HydraConfig[K];
    }
  }
}

/**
 * Validate required and optional environment variables at startup.
 * Throws an error listing ALL missing required vars (not just the first one).
 * Logs warnings for missing optional vars.
 */
export function validateEnvVars(): void {
  const requiredVars: { name: string; description: string }[] = [
    { name: 'GEMINI_API_KEY', description: 'Gemini API key for LLM provider' },
  ];

  const optionalVars: { name: string; description: string; defaultHint: string }[] = [
    { name: 'HYDRA_MODEL', description: 'Model override', defaultHint: 'gemini-3-pro-preview' },
    { name: 'HYDRA_MAX_TASKS', description: 'Max swarm tasks', defaultHint: '3' },
    { name: 'HYDRA_TIMEOUT', description: 'Swarm timeout in ms', defaultHint: '60000' },
    { name: 'HYDRA_HEADLESS', description: 'Headless mode', defaultHint: 'false' },
    { name: 'HYDRA_VERBOSE', description: 'Verbose logging', defaultHint: 'false' },
    { name: 'HYDRA_STREAMING', description: 'Enable streaming', defaultHint: 'true' },
    { name: 'LOCAL_LLM_URL', description: 'Local LLM server URL', defaultHint: 'http://localhost:8000' },
  ];

  // Check required vars
  const missing: string[] = [];
  for (const v of requiredVars) {
    const value = process.env[v.name];
    if (!value || value.trim() === '') {
      missing.push(`  - ${v.name}: ${v.description}`);
    }
  }

  // Warn about missing optional vars
  for (const v of optionalVars) {
    if (!process.env[v.name]) {
      console.warn(`[config] Optional env var ${v.name} not set (${v.description}). Using default: ${v.defaultHint}`);
    }
  }

  // Throw if any required vars are missing
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.join('\n')}\n\nSet them in your .env file or shell environment.`
    );
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

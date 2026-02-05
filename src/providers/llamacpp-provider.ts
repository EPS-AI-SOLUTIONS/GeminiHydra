/**
 * GeminiHydra - LlamaCpp Provider
 * Local LLM inference using node-llama-cpp
 */

import { EnhancedProvider } from './base-provider.js';
import { ConnectionPool, RateLimiter, ManagedPool } from '../core/pool.js';
import { CircuitBreaker, withRetry, type RetryOptions } from '../core/retry.js';
import { LlamaCppError } from '../core/errors.js';
import type {
  ProviderResult,
  HealthCheckResult,
  ProviderOptions,
  ProviderConfig,
  PoolConfig,
  RateLimitConfig,
  CircuitBreakerConfig
} from '../types/provider.js';
import type { CircuitBreakerStatus } from '../core/retry.js';
import type { PoolStatus } from '../core/pool.js';

/**
 * LlamaCpp-specific configuration
 */
export interface LlamaCppConfig extends ProviderConfig {
  modelPath?: string;
  modelUrl?: string;
  contextSize?: number;
  gpuLayers?: number;
  threads?: number;
  batchSize?: number;
  pool?: PoolConfig;
  rateLimit?: RateLimitConfig;
  circuitBreaker?: CircuitBreakerConfig;
  retry?: Partial<RetryOptions>;
}

/**
 * Default LlamaCpp configuration
 */
export const DEFAULT_LLAMACPP_CONFIG: LlamaCppConfig = {
  defaultModel: 'llama-3.2-3b-instruct',
  timeout: 120000,
  costPerToken: 0, // Local = free
  contextSize: 4096,
  gpuLayers: 0, // CPU by default
  threads: 4,
  batchSize: 512,
  pool: {
    maxConcurrent: 2, // Local model - limited concurrency
    maxQueueSize: 20,
    acquireTimeout: 60000
  },
  rateLimit: {
    enabled: false // No rate limit for local
  },
  circuitBreaker: {
    failureThreshold: 3,
    successThreshold: 1,
    timeout: 60000,
    halfOpenMaxCalls: 1
  },
  retry: {
    maxRetries: 2,
    baseDelay: 2000,
    maxDelay: 10000,
    jitter: false
  }
};

// Dynamic imports for node-llama-cpp (ESM module)
type LlamaModule = typeof import('node-llama-cpp');
type LlamaInstance = Awaited<ReturnType<LlamaModule['getLlama']>>;
type LlamaModel = Awaited<ReturnType<LlamaInstance['loadModel']>>;
type LlamaContext = Awaited<ReturnType<LlamaModel['createContext']>>;

/**
 * LlamaCpp Provider for local inference
 */
export class LlamaCppProvider extends EnhancedProvider {
  private llama: LlamaInstance | null = null;
  private model: LlamaModel | null = null;
  private context: LlamaContext | null = null;
  private pool: ManagedPool;
  private circuitBreaker: CircuitBreaker;
  protected override config: LlamaCppConfig;
  private initialized = false;
  private initializing = false;

  constructor(config: LlamaCppConfig = {}) {
    const mergedConfig = { ...DEFAULT_LLAMACPP_CONFIG, ...config };
    super('llamacpp', mergedConfig);

    this.config = mergedConfig;

    // Initialize pool
    this.pool = new ManagedPool(
      mergedConfig.pool,
      mergedConfig.rateLimit
    );

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker(mergedConfig.circuitBreaker);
  }

  /**
   * Initialize llama.cpp (lazy loading)
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializing) {
      // Wait for ongoing initialization
      while (this.initializing) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.initializing = true;

    try {
      // Dynamic import of node-llama-cpp
      const { getLlama } = await import('node-llama-cpp');

      this.llama = await getLlama();

      // Determine model path
      const modelPath = this.config.modelPath;

      if (!modelPath) {
        throw new LlamaCppError('Model path is required. Set modelPath in config.');
      }

      // Load model
      this.model = await this.llama.loadModel({
        modelPath,
        gpuLayers: this.config.gpuLayers
      });

      // Create context
      this.context = await this.model.createContext({
        contextSize: this.config.contextSize,
        batchSize: this.config.batchSize
      });

      this.initialized = true;
    } catch (error) {
      throw new LlamaCppError(
        `Failed to initialize llama.cpp: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error instanceof Error ? error : undefined }
      );
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Execute with all protections
   */
  async executeWithProtections<T>(fn: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      return this.pool.execute(() =>
        withRetry(fn, this.config.retry)
      );
    });
  }

  /**
   * Generate completion
   */
  async generate(prompt: string, options: ProviderOptions = {}): Promise<ProviderResult> {
    const startTime = Date.now();

    try {
      await this.initialize();

      if (!this.context || !this.model) {
        throw new LlamaCppError('Model not initialized');
      }

      const result = await this.executeWithProtections(async () => {
        const { LlamaChatSession } = await import('node-llama-cpp');

        const session = new LlamaChatSession({
          contextSequence: this.context!.getSequence()
        });

        const response = await session.prompt(prompt, {
          maxTokens: options.maxTokens ?? 2048,
          temperature: options.temperature ?? 0.7
        });

        return response;
      });

      const duration = Date.now() - startTime;
      const tokens = Math.ceil(result.length / 4); // Approximate

      const providerResult: ProviderResult = {
        content: result,
        model: this.config.defaultModel || 'llama.cpp',
        duration_ms: duration,
        tokens,
        success: true
      };

      this.updateStats(providerResult, true);
      return providerResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const providerResult: ProviderResult = {
        content: '',
        model: this.config.defaultModel || 'llama.cpp',
        duration_ms: duration,
        success: false,
        error: errorMessage
      };

      this.updateStats(providerResult, false);

      if (error instanceof LlamaCppError) {
        throw error;
      }

      throw new LlamaCppError(errorMessage, { cause: error instanceof Error ? error : undefined });
    }
  }

  /**
   * Stream completion
   */
  async *streamGenerate(prompt: string, options: ProviderOptions = {}): AsyncGenerator<string, void, unknown> {
    const startTime = Date.now();

    try {
      await this.initialize();

      if (!this.context || !this.model) {
        throw new LlamaCppError('Model not initialized');
      }

      const { LlamaChatSession } = await import('node-llama-cpp');

      const session = new LlamaChatSession({
        contextSequence: this.context.getSequence()
      });

      let fullContent = '';

      // Use prompt with streaming callback
      const onToken = (token: string) => {
        fullContent += token;
      };

      // Note: node-llama-cpp streaming API may differ
      // This is a simplified implementation
      const response = await session.prompt(prompt, {
        maxTokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7
      });

      // For now, yield the full response
      // TODO: Implement proper streaming when API supports it
      yield response;
      fullContent = response;

      const duration = Date.now() - startTime;
      const tokens = Math.ceil(fullContent.length / 4);

      this.updateStats({
        content: fullContent,
        model: this.config.defaultModel || 'llama.cpp',
        duration_ms: duration,
        tokens,
        success: true
      }, true);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.updateStats({
        content: '',
        model: this.config.defaultModel || 'llama.cpp',
        duration_ms: duration,
        success: false,
        error: errorMessage
      }, false);

      throw new LlamaCppError(errorMessage, { cause: error instanceof Error ? error : undefined });
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const cached = this.getCachedHealth();
    if (cached) return cached;

    const startTime = Date.now();

    try {
      await this.initialize();

      if (!this.model || !this.context) {
        throw new LlamaCppError('Model not loaded');
      }

      // Quick test generation
      const { LlamaChatSession } = await import('node-llama-cpp');
      const session = new LlamaChatSession({
        contextSequence: this.context.getSequence()
      });

      await session.prompt('Hi', { maxTokens: 5 });

      const latency = Date.now() - startTime;

      const healthResult: HealthCheckResult = {
        healthy: true,
        available: true,
        latency_ms: latency,
        models: [this.config.defaultModel || 'llama.cpp'],
        version: `node-llama-cpp (${this.config.modelPath || 'default'})`,
        checkedAt: new Date()
      };

      this.updateHealthCache(healthResult);
      return healthResult;

    } catch (error) {
      const healthResult: HealthCheckResult = {
        healthy: false,
        available: false,
        error: error instanceof Error ? error.message : 'Health check failed',
        checkedAt: new Date()
      };

      this.updateHealthCache(healthResult, 5000);
      return healthResult;
    }
  }

  /**
   * Check if ready
   */
  isReady(): boolean {
    return this.initialized && this.circuitBreaker.isAvailable();
  }

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    this.pool.drain();

    if (this.context) {
      // Dispose context if method exists
      this.context = null;
    }

    if (this.model) {
      // Dispose model if method exists
      this.model = null;
    }

    this.llama = null;
    this.initialized = false;
  }

  /**
   * Get pool status
   */
  getPoolStatus(): PoolStatus {
    return this.pool.getStatus().pool;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitStatus(): CircuitBreakerStatus {
    return this.circuitBreaker.getStatus();
  }

  /**
   * Check model support
   */
  supportsModel(model: string): boolean {
    // LlamaCpp supports GGUF models
    return model.endsWith('.gguf') || model.includes('llama') || model.includes('qwen');
  }

  /**
   * Get model info
   */
  getModelInfo(): { loaded: boolean; path?: string; contextSize?: number } {
    return {
      loaded: this.initialized,
      path: this.config.modelPath,
      contextSize: this.config.contextSize
    };
  }
}

/**
 * Create a LlamaCpp provider instance
 */
export function createLlamaCppProvider(config?: LlamaCppConfig): LlamaCppProvider {
  return new LlamaCppProvider(config);
}

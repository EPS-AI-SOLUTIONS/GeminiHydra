/**
 * GeminiHydra - Gemini Provider
 * Enhanced Google Gemini AI provider with pooling, circuit breaker, and rate limiting
 */

import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { EnhancedProvider } from './base-provider.js';
import { ConnectionPool, RateLimiter, ManagedPool } from '../core/pool.js';
import { CircuitBreaker, withRetry, type RetryOptions } from '../core/retry.js';
import { GeminiError, NetworkError, RateLimitError } from '../core/errors.js';
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
 * Gemini-specific configuration
 */
export interface GeminiConfig extends ProviderConfig {
  apiKey?: string;
  pool?: PoolConfig;
  rateLimit?: RateLimitConfig;
  circuitBreaker?: CircuitBreakerConfig;
  retry?: Partial<RetryOptions>;
  models?: {
    commander?: string;
    coordinator?: string;
    executor?: string;
  };
}

/**
 * Default Gemini configuration
 */
export const DEFAULT_GEMINI_CONFIG: GeminiConfig = {
  defaultModel: 'gemini-2.0-flash-exp',
  timeout: 60000,
  costPerToken: 0.000001,
  models: {
    commander: 'gemini-2.0-pro-exp',
    coordinator: 'gemini-2.0-flash-exp',
    executor: 'gemini-2.0-flash-exp'
  },
  pool: {
    maxConcurrent: 5,
    maxQueueSize: 50,
    acquireTimeout: 30000
  },
  rateLimit: {
    enabled: true,
    tokensPerInterval: 10,
    interval: 1000,
    maxBurst: 15
  },
  circuitBreaker: {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 30000,
    halfOpenMaxCalls: 3
  },
  retry: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    jitter: true
  }
};

/**
 * Model tier
 */
export type GeminiTier = 'commander' | 'coordinator' | 'executor';

/**
 * Enhanced Gemini Provider
 */
export class GeminiProvider extends EnhancedProvider {
  private genAI: GoogleGenerativeAI;
  private models: Map<string, GenerativeModel> = new Map();
  private pool: ManagedPool;
  private circuitBreaker: CircuitBreaker;
  protected override config: GeminiConfig;
  private initialized = false;

  constructor(config: GeminiConfig = {}) {
    const mergedConfig = { ...DEFAULT_GEMINI_CONFIG, ...config };
    super('gemini', mergedConfig);

    this.config = mergedConfig;

    // Initialize Gemini API
    const apiKey = config.apiKey || process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      throw new GeminiError('GEMINI_API_KEY is required');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);

    // Initialize pool
    this.pool = new ManagedPool(
      mergedConfig.pool,
      mergedConfig.rateLimit
    );

    // Initialize circuit breaker
    this.circuitBreaker = new CircuitBreaker(mergedConfig.circuitBreaker);
  }

  /**
   * Initialize models (lazy loading)
   */
  private initializeModels(): void {
    if (this.initialized) return;

    const modelNames = [
      this.config.defaultModel,
      this.config.models?.commander,
      this.config.models?.coordinator,
      this.config.models?.executor
    ].filter((m): m is string => !!m);

    for (const modelName of new Set(modelNames)) {
      this.models.set(modelName, this.genAI.getGenerativeModel({ model: modelName }));
    }

    this.initialized = true;
  }

  /**
   * Get model instance
   */
  private getModel(name?: string): GenerativeModel {
    this.initializeModels();

    const modelName = name || this.config.defaultModel || 'gemini-2.0-flash-exp';
    let model = this.models.get(modelName);

    if (!model) {
      model = this.genAI.getGenerativeModel({ model: modelName });
      this.models.set(modelName, model);
    }

    return model;
  }

  /**
   * Get model by tier
   */
  getModelByTier(tier: GeminiTier): GenerativeModel {
    const modelName = this.config.models?.[tier] || this.config.defaultModel;
    return this.getModel(modelName);
  }

  /**
   * Get model name by tier
   */
  getModelNameByTier(tier: GeminiTier): string {
    return this.config.models?.[tier] || this.config.defaultModel || 'gemini-2.0-flash-exp';
  }

  /**
   * Execute with all protections
   */
  async executeWithProtections<T>(fn: () => Promise<T>): Promise<T> {
    // Circuit breaker wrapper
    return this.circuitBreaker.execute(async () => {
      // Pool + Rate limit + Retry
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
    const modelName = options.model || this.config.defaultModel || 'gemini-2.0-flash-exp';

    try {
      const result = await this.executeWithProtections(async () => {
        const model = this.getModel(modelName);

        const generationConfig: Record<string, unknown> = {};
        if (options.temperature !== undefined) {
          generationConfig.temperature = options.temperature;
        }
        if (options.maxTokens !== undefined) {
          generationConfig.maxOutputTokens = options.maxTokens;
        }

        const response = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig
        });

        return response;
      });

      const text = result.response.text();
      const duration = Date.now() - startTime;

      // Estimate tokens (Gemini doesn't always return token count)
      const tokens = Math.ceil(text.length / 4);

      const providerResult: ProviderResult = {
        content: text,
        model: modelName,
        duration_ms: duration,
        tokens,
        success: true
      };

      this.updateStats(providerResult, true);
      return providerResult;

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Handle rate limit errors
      if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        throw new RateLimitError(`Gemini rate limit exceeded: ${errorMessage}`);
      }

      const providerResult: ProviderResult = {
        content: '',
        model: modelName,
        duration_ms: duration,
        success: false,
        error: errorMessage
      };

      this.updateStats(providerResult, false);

      throw new GeminiError(errorMessage, { cause: error instanceof Error ? error : undefined });
    }
  }

  /**
   * Generate with tier selection
   */
  async generateWithTier(
    prompt: string,
    tier: GeminiTier,
    options: ProviderOptions = {}
  ): Promise<ProviderResult> {
    const modelName = this.getModelNameByTier(tier);
    return this.generate(prompt, { ...options, model: modelName });
  }

  /**
   * Stream completion
   */
  async *streamGenerate(prompt: string, options: ProviderOptions = {}): AsyncGenerator<string, void, unknown> {
    const modelName = options.model || this.config.defaultModel || 'gemini-2.0-flash-exp';
    const startTime = Date.now();

    try {
      const model = this.getModel(modelName);

      const generationConfig: Record<string, unknown> = {};
      if (options.temperature !== undefined) {
        generationConfig.temperature = options.temperature;
      }
      if (options.maxTokens !== undefined) {
        generationConfig.maxOutputTokens = options.maxTokens;
      }

      const result = await model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig
      });

      let fullContent = '';

      for await (const chunk of result.stream) {
        const text = chunk.text();
        fullContent += text;
        yield text;
      }

      const duration = Date.now() - startTime;
      const tokens = Math.ceil(fullContent.length / 4);

      this.updateStats({
        content: fullContent,
        model: modelName,
        duration_ms: duration,
        tokens,
        success: true
      }, true);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.updateStats({
        content: '',
        model: modelName,
        duration_ms: duration,
        success: false,
        error: errorMessage
      }, false);

      throw new GeminiError(errorMessage, { cause: error instanceof Error ? error : undefined });
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    // Return cached if valid
    const cached = this.getCachedHealth();
    if (cached) return cached;

    const startTime = Date.now();

    try {
      // Quick ping with minimal request
      const model = this.getModel();
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 5 }
      });

      const text = result.response.text();
      const latency = Date.now() - startTime;

      const healthResult: HealthCheckResult = {
        healthy: true,
        available: true,
        latency_ms: latency,
        models: Array.from(this.models.keys()),
        version: 'gemini-2.0',
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

      this.updateHealthCache(healthResult, 5000); // Short TTL for failures
      return healthResult;
    }
  }

  /**
   * Check if ready
   */
  isReady(): boolean {
    return this.circuitBreaker.isAvailable();
  }

  /**
   * Shutdown gracefully
   */
  async shutdown(): Promise<void> {
    this.pool.drain();
    this.models.clear();
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
    const supportedPrefixes = ['gemini-1', 'gemini-2', 'gemini-pro', 'gemini-flash'];
    return supportedPrefixes.some(prefix => model.startsWith(prefix));
  }

  /**
   * Get available models
   */
  getAvailableModels(): string[] {
    return [
      'gemini-2.0-flash-exp',
      'gemini-2.0-pro-exp',
      'gemini-1.5-flash',
      'gemini-1.5-pro'
    ];
  }
}

/**
 * Create a Gemini provider instance
 */
export function createGeminiProvider(config?: GeminiConfig): GeminiProvider {
  return new GeminiProvider(config);
}

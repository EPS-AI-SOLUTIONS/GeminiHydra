/**
 * GeminiHydra - Base Provider Abstract Class
 * Defines the contract for all AI providers
 */

import type {
  ProviderResult,
  HealthCheckResult,
  ProviderOptions,
  ProviderStats,
  ProviderConfig
} from '../types/provider.js';
import type { CircuitBreakerStatus } from '../core/retry.js';
import type { PoolStatus } from '../core/pool.js';

/**
 * Provider status
 */
export interface ProviderStatus {
  name: string;
  healthy: boolean;
  lastCheck: string | null;
  stats: ProviderStats;
  pool?: PoolStatus;
  circuit?: CircuitBreakerStatus;
}

/**
 * Error record for statistics
 */
interface ErrorRecord {
  error: string;
  timestamp: Date;
}

/**
 * Internal stats tracker
 */
interface InternalStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalDuration: number;
  errors: ErrorRecord[];
}

/**
 * Abstract Provider Interface
 * All AI providers must extend this class and implement required methods
 */
export abstract class BaseProvider {
  readonly name: string;
  protected config: ProviderConfig;
  protected _healthCache: HealthCheckResult | null = null;
  protected _healthCacheExpiry = 0;
  protected _stats: InternalStats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalTokens: 0,
    totalDuration: 0,
    errors: []
  };

  /**
   * Creates a new provider instance
   * @param name - Unique provider identifier
   * @param config - Provider configuration
   */
  constructor(name: string, config: ProviderConfig = {}) {
    this.name = name;
    this.config = config;
  }

  /**
   * Generate completion from the provider
   * MUST be implemented by subclasses
   */
  abstract generate(prompt: string, options?: ProviderOptions): Promise<ProviderResult>;

  /**
   * Stream completion from the provider
   * MUST be implemented by subclasses
   */
  abstract streamGenerate(prompt: string, options?: ProviderOptions): AsyncGenerator<string, void, unknown>;

  /**
   * Perform health check on the provider
   * MUST be implemented by subclasses
   */
  abstract healthCheck(): Promise<HealthCheckResult>;

  /**
   * Get the provider name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Get provider statistics
   */
  getStats(): ProviderStats {
    return {
      totalRequests: this._stats.totalRequests,
      successfulRequests: this._stats.successfulRequests,
      failedRequests: this._stats.failedRequests,
      totalTokens: this._stats.totalTokens,
      totalLatency: this._stats.totalDuration,
      totalDuration: this._stats.totalDuration,
      averageLatency: this._stats.totalRequests > 0
        ? this._stats.totalDuration / this._stats.totalRequests
        : 0,
      successRate: this._stats.totalRequests > 0
        ? (this._stats.successfulRequests / this._stats.totalRequests * 100)
        : 0,
      lastErrors: this._stats.errors.slice(-10).map(e => ({
        message: e.error,
        timestamp: e.timestamp.toISOString()
      }))
    };
  }

  /**
   * Reset all statistics to initial values
   */
  resetStats(): void {
    this._stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      totalDuration: 0,
      errors: []
    };
  }

  /**
   * Update statistics after a request
   */
  protected updateStats(result: ProviderResult, success: boolean): void {
    this._stats.totalRequests++;

    if (success) {
      this._stats.successfulRequests++;
      this._stats.totalTokens += result.tokens ?? 0;
      this._stats.totalDuration += result.duration_ms ?? 0;
    } else {
      this._stats.failedRequests++;
      this._stats.errors.push({
        error: result.error ?? 'Unknown error',
        timestamp: new Date()
      });

      // Keep only last 100 errors
      if (this._stats.errors.length > 100) {
        this._stats.errors = this._stats.errors.slice(-100);
      }
    }
  }

  /**
   * Check if provider supports a specific model
   */
  supportsModel(_model: string): boolean {
    return false; // Override in subclass
  }

  /**
   * Get the default model for this provider
   */
  getDefaultModel(): string {
    return this.config.defaultModel ?? 'default';
  }

  /**
   * Get estimated cost per token
   */
  getCostPerToken(): number {
    return this.config.costPerToken ?? 0;
  }

  /**
   * Get current provider status
   */
  getStatus(): ProviderStatus {
    return {
      name: this.name,
      healthy: this._healthCache?.available ?? false,
      lastCheck: this._healthCacheExpiry > 0
        ? new Date(this._healthCacheExpiry - 30000).toISOString()
        : null,
      stats: this.getStats()
    };
  }

  /**
   * Get connection pool status
   * Override in subclass if using connection pooling
   */
  getPoolStatus(): PoolStatus | null {
    return null;
  }

  /**
   * Get circuit breaker status
   * Override in subclass if using circuit breaker
   */
  getCircuitStatus(): CircuitBreakerStatus | null {
    return null;
  }

  /**
   * Check if health cache is valid
   */
  protected isHealthCacheValid(): boolean {
    return this._healthCache !== null && Date.now() < this._healthCacheExpiry;
  }

  /**
   * Update health cache
   */
  protected updateHealthCache(result: HealthCheckResult, ttlMs = 30000): void {
    this._healthCache = result;
    this._healthCacheExpiry = Date.now() + ttlMs;
  }

  /**
   * Get cached health result
   */
  getCachedHealth(): HealthCheckResult | null {
    if (this.isHealthCacheValid()) {
      return this._healthCache;
    }
    return null;
  }
}

/**
 * Provider with enhanced features (pooling, circuit breaker, rate limiting)
 * Extend this for production-grade providers
 */
export abstract class EnhancedProvider extends BaseProvider {
  /**
   * Execute with all protections (pool + circuit + retry)
   */
  abstract executeWithProtections<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * Check if provider is ready for requests
   */
  abstract isReady(): boolean;

  /**
   * Shutdown provider gracefully
   */
  abstract shutdown(): Promise<void>;
}

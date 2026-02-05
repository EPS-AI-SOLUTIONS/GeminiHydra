/**
 * GeminiHydra - Provider Registry
 * Centralized management for multiple AI providers
 */

import { BaseProvider, type ProviderStatus } from './base-provider.js';
import type { HealthCheckResult } from '../types/provider.js';

/**
 * Health check results map
 */
export type HealthCheckResults = Map<string, HealthCheckResult>;

/**
 * Provider selection strategy
 */
export type SelectionStrategy =
  | 'default'
  | 'round-robin'
  | 'random'
  | 'fastest'
  | 'healthiest'
  | 'first-available'   // Alias for healthiest
  | 'lowest-latency';   // Alias for fastest

/**
 * Provider Registry - Manages multiple AI providers
 */
export class ProviderRegistry {
  private providers: Map<string, BaseProvider> = new Map();
  private defaultProvider: string | null = null;
  private roundRobinIndex = 0;
  private latencyStats: Map<string, number[]> = new Map();

  /**
   * Register a provider with the registry
   * @param name - Unique provider name
   * @param provider - Provider instance
   * @param isDefault - Set as default provider
   */
  register(name: string, provider: BaseProvider, isDefault = false): void {
    if (!(provider instanceof BaseProvider)) {
      throw new Error('Provider must extend BaseProvider');
    }

    this.providers.set(name, provider);
    this.latencyStats.set(name, []);

    if (isDefault || !this.defaultProvider) {
      this.defaultProvider = name;
    }
  }

  /**
   * Unregister a provider from the registry
   */
  unregister(name: string): boolean {
    const removed = this.providers.delete(name);
    this.latencyStats.delete(name);

    if (removed && this.defaultProvider === name) {
      const firstKey = this.providers.keys().next().value;
      this.defaultProvider = firstKey ?? null;
    }

    return removed;
  }

  /**
   * Get a provider by name
   */
  get(name: string): BaseProvider | null {
    return this.providers.get(name) ?? null;
  }

  /**
   * Get the default provider
   */
  getDefault(): BaseProvider | null {
    if (!this.defaultProvider) return null;
    return this.providers.get(this.defaultProvider) ?? null;
  }

  /**
   * Set a provider as the default
   */
  setDefault(name: string): boolean {
    if (this.providers.has(name)) {
      this.defaultProvider = name;
      return true;
    }
    return false;
  }

  /**
   * Get default provider name
   */
  getDefaultName(): string | null {
    return this.defaultProvider;
  }

  /**
   * Get all registered provider names
   */
  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * List all registered providers (alias for getProviderNames)
   */
  list(): string[] {
    return this.getProviderNames();
  }

  /**
   * Get all providers as an object
   */
  getAll(): Record<string, BaseProvider> {
    return Object.fromEntries(this.providers);
  }

  /**
   * Get number of registered providers
   */
  get size(): number {
    return this.providers.size;
  }

  /**
   * Check if a provider is registered
   */
  has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Perform health check on all providers
   */
  async healthCheckAll(): Promise<HealthCheckResults> {
    const results: HealthCheckResults = new Map();

    const checks = Array.from(this.providers.entries()).map(
      async ([name, provider]) => {
        try {
          const result = await provider.healthCheck();
          results.set(name, result);
        } catch (error) {
          results.set(name, {
            healthy: false,
            available: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    );

    await Promise.all(checks);
    return results;
  }

  /**
   * Check health of all providers (alias for healthCheckAll)
   */
  async checkAllHealth(): Promise<HealthCheckResults> {
    return this.healthCheckAll();
  }

  /**
   * Get all healthy providers
   */
  async getHealthyProviders(): Promise<BaseProvider[]> {
    const healthResults = await this.healthCheckAll();
    const healthy: BaseProvider[] = [];

    for (const [name, result] of healthResults) {
      if (result.healthy) {
        const provider = this.providers.get(name);
        if (provider) {
          healthy.push(provider);
        }
      }
    }

    return healthy;
  }

  /**
   * Get the first available provider
   */
  async getFirstAvailable(): Promise<BaseProvider | null> {
    // Check default first
    if (this.defaultProvider) {
      const defaultProv = this.providers.get(this.defaultProvider);
      if (defaultProv) {
        try {
          const health = await defaultProv.healthCheck();
          if (health.available) {
            return defaultProv;
          }
        } catch {
          // Continue to others
        }
      }
    }

    // Check others
    for (const [name, provider] of this.providers) {
      if (name === this.defaultProvider) continue;

      try {
        const health = await provider.healthCheck();
        if (health.available) {
          return provider;
        }
      } catch {
        // Continue to next provider
      }
    }

    return null;
  }

  /**
   * Select a provider using a strategy
   */
  async selectProvider(strategy: SelectionStrategy = 'default'): Promise<BaseProvider | null> {
    switch (strategy) {
      case 'default':
        return this.getDefault();

      case 'round-robin':
        return this.selectRoundRobin();

      case 'random':
        return this.selectRandom();

      case 'fastest':
      case 'lowest-latency':
        return this.selectLowestLatency();

      case 'healthiest':
      case 'first-available':
        return this.getFirstAvailable();

      default:
        return this.getDefault();
    }
  }

  /**
   * Round-robin selection
   */
  private selectRoundRobin(): BaseProvider | null {
    const names = this.getProviderNames();
    if (names.length === 0) return null;

    const name = names[this.roundRobinIndex % names.length];
    this.roundRobinIndex++;
    return this.providers.get(name) ?? null;
  }

  /**
   * Random selection
   */
  private selectRandom(): BaseProvider | null {
    const names = this.getProviderNames();
    if (names.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * names.length);
    return this.providers.get(names[randomIndex]) ?? null;
  }

  /**
   * Select fastest provider based on latency stats
   */
  private selectFastest(): BaseProvider | null {
    let fastestName: string | null = null;
    let fastestLatency = Infinity;

    for (const [name, latencies] of this.latencyStats) {
      if (latencies.length === 0) continue;

      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      if (avgLatency < fastestLatency) {
        fastestLatency = avgLatency;
        fastestName = name;
      }
    }

    return fastestName ? this.providers.get(fastestName) ?? null : this.getDefault();
  }

  /**
   * Select provider with lowest latency from health checks
   */
  private async selectLowestLatency(): Promise<BaseProvider | null> {
    const healthResults = await this.healthCheckAll();
    let fastestName: string | null = null;
    let fastestLatency = Infinity;

    for (const [name, result] of healthResults) {
      if (!result.healthy) continue;

      const latency = result.latency ?? result.latency_ms ?? Infinity;
      if (latency < fastestLatency) {
        fastestLatency = latency;
        fastestName = name;
      }
    }

    return fastestName ? this.providers.get(fastestName) ?? null : null;
  }

  /**
   * Record latency for a provider
   */
  recordLatency(name: string, latencyMs: number): void {
    const stats = this.latencyStats.get(name);
    if (stats) {
      stats.push(latencyMs);
      // Keep last 100 samples
      if (stats.length > 100) {
        stats.shift();
      }
    }
  }

  /**
   * Get all provider statuses
   */
  getAllStatuses(): Map<string, ProviderStatus> {
    const statuses = new Map<string, ProviderStatus>();
    for (const [name, provider] of this.providers) {
      statuses.set(name, provider.getStatus());
    }
    return statuses;
  }

  /**
   * Get stats for all providers
   */
  getAllStats(): Map<string, import('../types/provider.js').ProviderStats> {
    const stats = new Map<string, import('../types/provider.js').ProviderStats>();
    for (const [name, provider] of this.providers) {
      stats.set(name, provider.getStats());
    }
    return stats;
  }

  /**
   * Get available providers (cached health)
   */
  getAvailableProviders(): BaseProvider[] {
    const available: BaseProvider[] = [];

    for (const provider of this.providers.values()) {
      const cached = provider.getCachedHealth();
      if (cached?.available) {
        available.push(provider);
      }
    }

    return available;
  }

  /**
   * Clear all providers
   */
  clear(): void {
    this.providers.clear();
    this.latencyStats.clear();
    this.defaultProvider = null;
    this.roundRobinIndex = 0;
  }

  /**
   * Iterate over all providers
   */
  [Symbol.iterator](): IterableIterator<[string, BaseProvider]> {
    return this.providers.entries();
  }

  /**
   * ForEach iteration
   */
  forEach(callback: (provider: BaseProvider, name: string, registry: ProviderRegistry) => void): void {
    for (const [name, provider] of this.providers) {
      callback(provider, name, this);
    }
  }
}

// Singleton instance
let registryInstance: ProviderRegistry | null = null;

/**
 * Get or create provider registry singleton
 */
export function getProviderRegistry(): ProviderRegistry {
  if (!registryInstance) {
    registryInstance = new ProviderRegistry();
  }
  return registryInstance;
}

/**
 * Reset the registry singleton
 */
export function resetProviderRegistry(): void {
  if (registryInstance) {
    registryInstance.clear();
  }
  registryInstance = null;
}

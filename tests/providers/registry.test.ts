/**
 * GeminiHydra - Provider Registry Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderRegistry } from '../../src/providers/registry.js';
import { BaseProvider } from '../../src/providers/base-provider.js';
import type { ProviderOptions, ProviderResult, HealthCheckResult } from '../../src/types/provider.js';

// Mock provider implementation
class MockProvider extends BaseProvider {
  private _healthy: boolean;
  private _latency: number;

  constructor(name: string, healthy = true, latency = 100) {
    super(name, {
      models: ['mock-model'],
      maxRetries: 3,
      timeout: 5000
    });
    this._healthy = healthy;
    this._latency = latency;
  }

  async generate(prompt: string, options?: ProviderOptions): Promise<ProviderResult> {
    if (!this._healthy) {
      throw new Error('Provider unhealthy');
    }
    return {
      content: `Response to: ${prompt}`,
      model: 'mock-model',
      success: true,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    };
  }

  async *streamGenerate(prompt: string, options?: ProviderOptions): AsyncGenerator<string, void, unknown> {
    yield 'Hello ';
    yield 'World';
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return {
      healthy: this._healthy,
      available: this._healthy,
      latency: this._latency
    };
  }

  setHealthy(healthy: boolean): void {
    this._healthy = healthy;
  }

  setLatency(latency: number): void {
    this._latency = latency;
  }
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = new ProviderRegistry();
  });

  describe('registration', () => {
    it('should register a provider', () => {
      const provider = new MockProvider('test');
      registry.register('test', provider);

      expect(registry.get('test')).toBe(provider);
    });

    it('should set default provider', () => {
      const provider = new MockProvider('test');
      registry.register('test', provider, true);

      expect(registry.getDefault()).toBe(provider);
    });

    it('should override existing provider', () => {
      const provider1 = new MockProvider('test1');
      const provider2 = new MockProvider('test2');

      registry.register('test', provider1);
      registry.register('test', provider2);

      expect(registry.get('test')).toBe(provider2);
    });

    it('should unregister a provider', () => {
      const provider = new MockProvider('test');
      registry.register('test', provider);

      expect(registry.unregister('test')).toBe(true);
      expect(registry.get('test')).toBeNull();
    });

    it('should return false when unregistering non-existent provider', () => {
      expect(registry.unregister('nonexistent')).toBe(false);
    });
  });

  describe('retrieval', () => {
    it('should return null for non-existent provider', () => {
      expect(registry.get('nonexistent')).toBeNull();
    });

    it('should list all registered providers', () => {
      registry.register('provider1', new MockProvider('p1'));
      registry.register('provider2', new MockProvider('p2'));

      const names = registry.list();

      expect(names).toContain('provider1');
      expect(names).toContain('provider2');
      expect(names).toHaveLength(2);
    });

    it('should check if provider exists', () => {
      registry.register('test', new MockProvider('test'));

      expect(registry.has('test')).toBe(true);
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('selection strategies', () => {
    beforeEach(() => {
      registry.register('healthy1', new MockProvider('healthy1', true, 100));
      registry.register('healthy2', new MockProvider('healthy2', true, 50));
      registry.register('unhealthy', new MockProvider('unhealthy', false, 200));
    });

    it('should select first available provider', async () => {
      const provider = await registry.selectProvider('first-available');
      expect(provider).not.toBeNull();
    });

    it('should select provider with lowest latency', async () => {
      const provider = await registry.selectProvider('lowest-latency');

      // Should select healthy2 with latency 50
      expect(provider?.name).toBe('healthy2');
    });

    it('should select using round-robin', async () => {
      // Reset to only healthy providers
      registry = new ProviderRegistry();
      registry.register('p1', new MockProvider('p1', true, 100));
      registry.register('p2', new MockProvider('p2', true, 100));
      registry.register('p3', new MockProvider('p3', true, 100));

      const selected: string[] = [];
      for (let i = 0; i < 6; i++) {
        const provider = await registry.selectProvider('round-robin');
        if (provider) {
          selected.push(provider.name);
        }
      }

      // Should rotate through all providers
      expect(selected.filter(n => n === 'p1').length).toBeGreaterThanOrEqual(1);
      expect(selected.filter(n => n === 'p2').length).toBeGreaterThanOrEqual(1);
      expect(selected.filter(n => n === 'p3').length).toBeGreaterThanOrEqual(1);
    });

    it('should select random provider', async () => {
      // Reset to only healthy providers
      registry = new ProviderRegistry();
      registry.register('p1', new MockProvider('p1', true, 100));
      registry.register('p2', new MockProvider('p2', true, 100));
      registry.register('p3', new MockProvider('p3', true, 100));

      const provider = await registry.selectProvider('random');
      expect(provider).not.toBeNull();
      expect(['p1', 'p2', 'p3']).toContain(provider?.name);
    });

    it('should return null when no healthy providers', async () => {
      registry = new ProviderRegistry();
      registry.register('unhealthy1', new MockProvider('u1', false, 100));
      registry.register('unhealthy2', new MockProvider('u2', false, 100));

      const provider = await registry.selectProvider('first-available');
      expect(provider).toBeNull();
    });
  });

  describe('getFirstAvailable', () => {
    it('should return first healthy provider', async () => {
      registry.register('unhealthy', new MockProvider('unhealthy', false, 100));
      registry.register('healthy', new MockProvider('healthy', true, 100));

      const provider = await registry.getFirstAvailable();
      expect(provider?.name).toBe('healthy');
    });

    it('should return null when no providers registered', async () => {
      const provider = await registry.getFirstAvailable();
      expect(provider).toBeNull();
    });
  });

  describe('health checks', () => {
    it('should check health of all providers', async () => {
      registry.register('healthy', new MockProvider('healthy', true, 100));
      registry.register('unhealthy', new MockProvider('unhealthy', false, 200));

      const results = await registry.checkAllHealth();

      expect(results.get('healthy')?.healthy).toBe(true);
      expect(results.get('unhealthy')?.healthy).toBe(false);
    });

    it('should get all healthy providers', async () => {
      registry.register('h1', new MockProvider('h1', true, 100));
      registry.register('h2', new MockProvider('h2', true, 50));
      registry.register('u1', new MockProvider('u1', false, 200));

      const healthy = await registry.getHealthyProviders();

      expect(healthy).toHaveLength(2);
      expect(healthy.map(p => p.name)).toContain('h1');
      expect(healthy.map(p => p.name)).toContain('h2');
    });
  });

  describe('stats', () => {
    it('should return stats for all providers', () => {
      registry.register('p1', new MockProvider('p1', true, 100));
      registry.register('p2', new MockProvider('p2', true, 50));

      const stats = registry.getAllStats();

      expect(stats.size).toBe(2);
      expect(stats.has('p1')).toBe(true);
      expect(stats.has('p2')).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all providers', () => {
      registry.register('p1', new MockProvider('p1'));
      registry.register('p2', new MockProvider('p2'));

      registry.clear();

      expect(registry.list()).toHaveLength(0);
      expect(registry.getDefault()).toBeNull();
    });
  });
});

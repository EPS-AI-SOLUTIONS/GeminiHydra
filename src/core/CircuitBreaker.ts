/**
 * CircuitBreaker - Compatibility Adapter
 * Feature #8: Circuit Breaker Pattern
 *
 * ARCHITECTURE FIX (#12): This file is now a thin compatibility adapter
 * over the modern CircuitBreaker in retry.ts. The canonical implementation
 * lives in retry.ts. This adapter maintains the legacy UPPERCASE state API
 * used by MCPCircuitBreaker and src/index.ts.
 *
 * Prefer importing from './retry.js' for new code.
 *
 * @deprecated Use CircuitBreaker from './retry.js' for new code
 */

import chalk from 'chalk';
import {
  type CircuitBreakerStatus,
  CircuitBreaker as ModernCircuitBreaker,
  type CircuitState as ModernCircuitState,
} from './retry.js';

// Legacy UPPERCASE state type (for backwards compatibility)
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  onStateChange?: (from: CircuitState, to: CircuitState, name: string) => void;
}

// State mapping between legacy UPPERCASE and modern lowercase
const toLegacyState = (state: ModernCircuitState): CircuitState => {
  switch (state) {
    case 'closed':
      return 'CLOSED';
    case 'open':
      return 'OPEN';
    case 'half-open':
      return 'HALF_OPEN';
    default:
      return 'CLOSED';
  }
};

/**
 * Circuit Breaker - Legacy Adapter
 *
 * Wraps the modern CircuitBreaker from retry.ts with UPPERCASE state API.
 * For new code, use `import { CircuitBreaker } from './retry.js'` directly.
 *
 * @deprecated Use CircuitBreaker from './retry.js' for new code
 */
export class CircuitBreaker {
  private inner: ModernCircuitBreaker;
  private _name: string;
  private onStateChangeFn: (from: CircuitState, to: CircuitState, name: string) => void;
  private lastKnownState: CircuitState = 'CLOSED';

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this._name = name;
    this.onStateChangeFn =
      options.onStateChange ??
      ((from, to, name) => {
        console.log(chalk.yellow(`[CircuitBreaker:${name}] ${from} → ${to}`));
      });

    this.inner = new ModernCircuitBreaker({
      failureThreshold: options.failureThreshold ?? 3,
      successThreshold: options.successThreshold ?? 2,
      timeout: options.timeout ?? 30000,
      halfOpenMaxCalls: 3,
    });
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const prevState = this.lastKnownState;

    try {
      const result = await this.inner.execute(fn);
      this.checkStateTransition(prevState);
      return result;
    } catch (error) {
      this.checkStateTransition(prevState);
      throw error;
    }
  }

  private checkStateTransition(prevState: CircuitState): void {
    const currentState = toLegacyState(this.inner.getState());
    if (currentState !== prevState) {
      this.onStateChangeFn(prevState, currentState, this._name);
      this.lastKnownState = currentState;
    } else {
      this.lastKnownState = currentState;
    }
  }

  getState(): CircuitState {
    this.lastKnownState = toLegacyState(this.inner.getState());
    return this.lastKnownState;
  }

  reset(): void {
    const prevState = this.lastKnownState;
    this.inner.forceClose();
    this.lastKnownState = 'CLOSED';
    if (prevState !== 'CLOSED') {
      this.onStateChangeFn(prevState, 'CLOSED', this._name);
    }
  }

  getStats(): { state: CircuitState; failures: number; successes: number } {
    const status: CircuitBreakerStatus = this.inner.getStatus();
    return {
      state: toLegacyState(status.state),
      failures: status.failureCount,
      successes: status.successCount,
    };
  }

  /** Get the underlying modern CircuitBreaker */
  getInner(): ModernCircuitBreaker {
    return this.inner;
  }
}

/**
 * Circuit Breaker Registry - manage multiple breakers
 * @deprecated Use CircuitBreakerRegistry from './retry.js' for new code
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  getOrCreate(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(name, options);
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) breaker.reset();
  }

  getAllStats(): Record<string, ReturnType<CircuitBreaker['getStats']>> {
    const stats: Record<string, ReturnType<CircuitBreaker['getStats']>> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }
}

// Global registry
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

export default CircuitBreaker;

/**
 * MCP Circuit Breaker Manager - Per-server circuit breaker management
 *
 * Extracted from MCPManager.ts for better separation of concerns.
 * Manages circuit breakers for each MCP server to handle failures gracefully.
 */

import chalk from 'chalk';
import { CircuitBreaker, type CircuitBreakerOptions } from '../core/CircuitBreaker.js';
import { logError } from '../utils/errorHandling.js';

// ============================================================
// Types
// ============================================================

export interface MCPCircuitBreakerConfig {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
}

export type ReconnectionHandler = (serverName: string) => Promise<void>;

// ============================================================
// Default Configuration
// ============================================================

const DEFAULT_CONFIG: Required<MCPCircuitBreakerConfig> = {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30000,
};

// ============================================================
// MCPCircuitBreakerManager Class
// ============================================================

export class MCPCircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private config: Required<MCPCircuitBreakerConfig>;
  private reconnectionHandler: ReconnectionHandler | null = null;

  constructor(config: MCPCircuitBreakerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================================
  // Configuration
  // ============================================================

  /**
   * Set the reconnection handler called when circuit goes to HALF_OPEN
   */
  setReconnectionHandler(handler: ReconnectionHandler): void {
    this.reconnectionHandler = handler;
  }

  /**
   * Update configuration for all new circuit breakers
   */
  updateConfig(config: Partial<MCPCircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ============================================================
  // Circuit Breaker Management
  // ============================================================

  /**
   * Get or create a circuit breaker for a server
   */
  getBreaker(serverName: string): CircuitBreaker {
    if (!this.breakers.has(serverName)) {
      this.breakers.set(serverName, this.createBreaker(serverName));
    }
    return this.breakers.get(serverName) ?? this.createBreaker(serverName);
  }

  /**
   * Create a new circuit breaker with configured options
   */
  private createBreaker(serverName: string): CircuitBreaker {
    const options: CircuitBreakerOptions = {
      failureThreshold: this.config.failureThreshold,
      successThreshold: this.config.successThreshold,
      timeout: this.config.timeout,
      onStateChange: async (from, to, name) => {
        console.log(chalk.yellow(`[MCP:${name}] Circuit: ${from} -> ${to}`));

        if (to === 'HALF_OPEN' && this.reconnectionHandler) {
          try {
            console.log(chalk.cyan(`[MCP:${name}] Attempting reconnection...`));
            await this.reconnectionHandler(name);
          } catch (error) {
            logError(`MCP:${name}`, 'Reconnection failed', error);
          }
        }
      },
    };

    return new CircuitBreaker(serverName, options);
  }

  /**
   * Remove circuit breaker for a server
   */
  removeBreaker(serverName: string): void {
    this.breakers.delete(serverName);
  }

  /**
   * Execute an operation through the circuit breaker
   */
  async execute<T>(serverName: string, operation: () => Promise<T>): Promise<T> {
    const breaker = this.getBreaker(serverName);
    return breaker.execute(operation);
  }

  /**
   * Execute with retry and circuit breaker
   */
  async executeWithRetry<T>(
    serverName: string,
    operation: () => Promise<T>,
    options: { maxRetries?: number; retryDelay?: number } = {},
  ): Promise<T> {
    const { maxRetries = 3, retryDelay = 1000 } = options;
    const breaker = this.getBreaker(serverName);

    return breaker.execute(async () => {
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await operation();
        } catch (error: unknown) {
          lastError = error instanceof Error ? error : new Error(String(error));
          const msg = error instanceof Error ? error.message : String(error);
          console.log(
            chalk.yellow(`[MCP:${serverName}] Attempt ${attempt}/${maxRetries} failed: ${msg}`),
          );

          if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt));
          }
        }
      }

      throw lastError || new Error('Operation failed after retries');
    });
  }

  // ============================================================
  // Status
  // ============================================================

  /**
   * Get the state of a circuit breaker
   */
  getState(serverName: string): 'CLOSED' | 'OPEN' | 'HALF_OPEN' | 'UNKNOWN' {
    const breaker = this.breakers.get(serverName);
    if (!breaker) return 'UNKNOWN';
    return breaker.getState();
  }

  /**
   * Get all circuit breaker states
   */
  getAllStates(): Map<string, 'CLOSED' | 'OPEN' | 'HALF_OPEN'> {
    const states = new Map<string, 'CLOSED' | 'OPEN' | 'HALF_OPEN'>();
    for (const [name, breaker] of this.breakers) {
      states.set(name, breaker.getState());
    }
    return states;
  }

  /**
   * Check if any circuit breaker is open
   */
  hasOpenBreakers(): boolean {
    for (const breaker of this.breakers.values()) {
      if (breaker.getState() === 'OPEN') {
        return true;
      }
    }
    return false;
  }

  /**
   * Get list of servers with open circuits
   */
  getOpenCircuits(): string[] {
    const open: string[] = [];
    for (const [name, breaker] of this.breakers) {
      if (breaker.getState() === 'OPEN') {
        open.push(name);
      }
    }
    return open;
  }

  // ============================================================
  // Reset
  // ============================================================

  /**
   * Reset a specific circuit breaker
   */
  resetBreaker(serverName: string): void {
    const breaker = this.breakers.get(serverName);
    if (breaker) {
      breaker.reset();
      console.log(chalk.green(`[MCP:${serverName}] Circuit breaker reset`));
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const [_name, breaker] of this.breakers) {
      breaker.reset();
    }
    console.log(chalk.green(`[MCP] All circuit breakers reset`));
  }

  /**
   * Clear all circuit breakers
   */
  clear(): void {
    this.breakers.clear();
  }
}

// ============================================================
// Singleton
// ============================================================

export const mcpCircuitBreakerManager = new MCPCircuitBreakerManager();

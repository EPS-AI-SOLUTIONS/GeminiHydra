/**
 * AdaptiveRetry - Feature #11: Adaptive Retry Strategy
 *
 * Implements intelligent retry logic that adapts based on error type.
 * Different error categories (rate_limit, network, timeout, logic, validation)
 * receive customized retry configurations with appropriate delays,
 * backoff multipliers, and jitter factors.
 *
 * Part of GeminiHydra ExecutionEngine
 */

import chalk from 'chalk';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export type ErrorType = 'rate_limit' | 'network' | 'timeout' | 'logic' | 'validation' | 'unknown';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

// =============================================================================
// DEFAULT CONFIGURATIONS
// =============================================================================

const DEFAULT_RETRY_CONFIGS: Record<ErrorType, RetryConfig> = {
  rate_limit: {
    maxRetries: 5,
    baseDelay: 5000, // 5s for rate limits
    maxDelay: 60000, // Max 1 minute
    backoffMultiplier: 2,
    jitterFactor: 0.3,
  },
  network: {
    maxRetries: 4,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.2,
  },
  timeout: {
    maxRetries: 3,
    baseDelay: 3000,
    maxDelay: 20000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.1,
  },
  logic: {
    maxRetries: 2, // Logic errors rarely fix with retry
    baseDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 1,
    jitterFactor: 0,
  },
  validation: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 2000,
    backoffMultiplier: 1,
    jitterFactor: 0,
  },
  unknown: {
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 15000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.2,
  },
};

// =============================================================================
// ERROR CLASSIFICATION
// =============================================================================

/**
 * Classify error type from error message/object
 */
export function classifyError(error: Error | string): ErrorType {
  const message = typeof error === 'string' ? error : error.message;
  const lowerMsg = message.toLowerCase();

  if (
    lowerMsg.includes('rate') ||
    lowerMsg.includes('quota') ||
    lowerMsg.includes('429') ||
    lowerMsg.includes('too many')
  ) {
    return 'rate_limit';
  }
  if (
    lowerMsg.includes('network') ||
    lowerMsg.includes('econnrefused') ||
    lowerMsg.includes('enotfound') ||
    lowerMsg.includes('socket')
  ) {
    return 'network';
  }
  if (
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('timed out') ||
    lowerMsg.includes('deadline')
  ) {
    return 'timeout';
  }
  if (
    lowerMsg.includes('invalid') ||
    lowerMsg.includes('validation') ||
    lowerMsg.includes('schema') ||
    lowerMsg.includes('parse')
  ) {
    return 'validation';
  }
  if (
    lowerMsg.includes('logic') ||
    lowerMsg.includes('assertion') ||
    lowerMsg.includes('expected')
  ) {
    return 'logic';
  }

  return 'unknown';
}

// =============================================================================
// DELAY CALCULATION
// =============================================================================

/**
 * Calculate delay with jitter
 */
function calculateDelay(config: RetryConfig, attempt: number): number {
  const exponentialDelay = config.baseDelay * config.backoffMultiplier ** attempt;
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
  const jitter = cappedDelay * config.jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(cappedDelay + jitter));
}

// =============================================================================
// ADAPTIVE RETRY FUNCTION
// =============================================================================

/**
 * Execute with adaptive retry based on error type
 */
export async function adaptiveRetry<T>(
  fn: () => Promise<T>,
  options: {
    onRetry?: (attempt: number, error: Error, errorType: ErrorType, delay: number) => void;
    customConfigs?: Partial<Record<ErrorType, Partial<RetryConfig>>>;
  } = {},
): Promise<T> {
  let lastError: Error | null = null;
  let lastErrorType: ErrorType = 'unknown';

  // Merge custom configs
  const configs = { ...DEFAULT_RETRY_CONFIGS };
  if (options.customConfigs) {
    for (const [type, config] of Object.entries(options.customConfigs)) {
      configs[type as ErrorType] = { ...configs[type as ErrorType], ...config };
    }
  }

  // Start with unknown config, switch based on error type
  let currentConfig = configs.unknown;
  let totalAttempts = 0;
  const maxTotalAttempts = 10; // Safety limit

  while (totalAttempts < maxTotalAttempts) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      lastErrorType = classifyError(lastError);
      currentConfig = configs[lastErrorType];

      const attemptForType = totalAttempts % currentConfig.maxRetries;

      if (attemptForType >= currentConfig.maxRetries - 1) {
        console.log(
          chalk.red(
            `[AdaptiveRetry] Max retries (${currentConfig.maxRetries}) reached for ${lastErrorType}`,
          ),
        );
        break;
      }

      const delay = calculateDelay(currentConfig, attemptForType);
      totalAttempts++;

      console.log(
        chalk.yellow(
          `[AdaptiveRetry] ${lastErrorType} error (attempt ${totalAttempts}), waiting ${delay}ms`,
        ),
      );

      if (options.onRetry) {
        options.onRetry(
          totalAttempts,
          lastError ?? new Error('Unknown error'),
          lastErrorType,
          delay,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error('Adaptive retry exhausted');
}

// =============================================================================
// EXPORTS
// =============================================================================

export { DEFAULT_RETRY_CONFIGS };

export default {
  adaptiveRetry,
  classifyError,
  DEFAULT_RETRY_CONFIGS,
};

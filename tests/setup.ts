/**
 * GeminiHydra - Test Setup
 * Global configuration for vitest
 */

import { afterAll } from 'vitest';

// Suppress unhandled rejection warnings during tests
// These typically come from intentional promise rejections in tests
const originalOnUnhandledRejection = process.listeners('unhandledRejection');
process.removeAllListeners('unhandledRejection');
process.on('unhandledRejection', (reason, promise) => {
  // Only log if it's not a known test-related rejection
  const knownPatterns = [
    'Pool drained',
    'Pool acquire timeout',
    'timeout',
    'Custom timeout message',
    'TIMEOUT_ERROR',
  ];

  const reasonStr = String(reason);
  const isKnown = knownPatterns.some(pattern => reasonStr.includes(pattern));

  if (!isKnown) {
    console.error('Unhandled Rejection:', reason);
  }
});

afterAll(() => {
  // Restore original handlers after all tests
  process.removeAllListeners('unhandledRejection');
  originalOnUnhandledRejection.forEach(listener => {
    process.on('unhandledRejection', listener);
  });
});

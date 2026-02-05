/**
 * GeminiHydra - Playwright Configuration
 * E2E tests for CLI and integration testing
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  use: {
    trace: 'on-first-retry',
  },
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],
  projects: [
    {
      name: 'cli',
      testMatch: /.*\.cli\.test\.ts/,
    },
    {
      name: 'integration',
      testMatch: /.*\.integration\.test\.ts/,
    },
  ],
});

/**
 * Auth-mocking test fixture for GeminiHydra E2E tests.
 * Built on top of the shared @jaskier/testing/fixtures base.
 */
import { test as mockAuthTest, expect } from '@jaskier/testing/fixtures';

export { expect };

export const test = mockAuthTest.extend({
  storageKey: 'gemini-hydra-v15-view' as never,
});

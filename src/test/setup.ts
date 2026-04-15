// @ts-nocheck
import * as matchers from '@testing-library/jest-dom/matchers';
import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest';
import { server } from '../mocks/server';

// ── MSW: intercept HTTP requests in Node.js/Vitest (B1142-T09) ───────────────
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

process.on('unhandledRejection', () => {});

expect.extend(matchers);

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem(key: string) {
      return store[key] || null;
    },
    setItem(key: string, value: string) {
      store[key] = value.toString();
    },
    clear() {
      store = {};
    },
    removeItem(key: string) {
      delete store[key];
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

global.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })));

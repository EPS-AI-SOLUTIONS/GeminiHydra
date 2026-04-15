// src/mocks/browser.ts
// MSW v2 browser service worker — used in development/Storybook
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

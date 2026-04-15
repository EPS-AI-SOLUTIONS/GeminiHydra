// src/mocks/server.ts
// MSW v2 Node.js server — used by Vitest (Node/jsdom environment)
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

#!/usr/bin/env npx tsx
/**
 * GeminiHydra API Server Entry Point
 * Starts the HTTP server for GUI communication
 */

import 'dotenv/config';
import { startServer } from '../src/api/index.js';

const PORT = parseInt(process.env.API_PORT || '8080', 10);
const HOST = process.env.API_HOST || '0.0.0.0';

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 Shutting down server...');
  process.exit(0);
});

// Start the server
startServer({ port: PORT, host: HOST }).catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

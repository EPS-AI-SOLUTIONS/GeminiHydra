/// <reference types="vitest/config" />
import { createViteConfig } from '@jaskier/core/vite';

export default createViteConfig({
  port: 5176,
  backendPort: 8081,
  partnerBackendPort: 8082,
  rootDir: __dirname,
});

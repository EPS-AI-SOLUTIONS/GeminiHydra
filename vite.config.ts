/// <reference types="vitest/config" />
import { createViteConfig } from '../../packages/core/src/vite/createViteConfig.ts';

export default createViteConfig({
  port: 5176,
  backendPort: 8081,
  partnerBackendPort: 8082,
  rootDir: __dirname,
});

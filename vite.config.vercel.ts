import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

function iconsMockPlugin(): Plugin {
  return {
    name: 'icons-mock',
    resolveId(id: string) {
      if (id.startsWith('~icons/')) return `\0icons-mock:${id}`;
      return null;
    },
    load(id: string) {
      if (id.startsWith('\0icons-mock:')) {
        return `import { createElement } from 'react';
export default function MockIcon(props) { return createElement('span', props); };
`;
      }
      return null;
    },
  };
}

// Vite 8 builds both client + SSR environments by default.
// GeminiHydra is a client-only SPA — skip the SSR environment build.
export default defineConfig({
  builder: {
    async buildApp(builder) {
      await builder.build(builder.environments.client);
    },
  },
  clearScreen: false,
  plugins: [
    iconsMockPlugin(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query', 'zustand', 'i18next', 'react-i18next', 'motion'],
  },
  build: {
    target: 'esnext',
    sourcemap: false,
    modulePreload: {
      polyfill: true,
    },
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          if (/[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (/[\\/]motion[\\/]/.test(id)) return 'vendor-motion';
          if (/[\\/](i18next|react-i18next)[\\/]/.test(id)) return 'vendor-i18n';
          if (/[\\/]@tanstack[\\/]react-query[\\/]/.test(id)) return 'vendor-query';
          if (/[\\/](sonner|dompurify)[\\/]/.test(id)) return 'vendor-ui';
          if (/[\\/]zod[\\/]/.test(id)) return 'vendor-zod';
          if (/[\\/]zustand[\\/]/.test(id)) return 'vendor-zustand';
        },
      },
    },
  },
});

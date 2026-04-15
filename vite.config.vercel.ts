import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Virtual plugin: maps ~icons/lucide/foo-bar → default export from lucide-react.
 * Required because @jaskier/hydra-app uses unplugin-icons ~icons/lucide/* imports.
 * Rolldown (Vite 8 bundler) cannot resolve these without this virtual module shim.
 */
function lucideIconsPlugin(): Plugin {
  const PREFIX = '~icons/lucide/';
  const VIRTUAL_PREFIX = '\0virtual:lucide:';
  return {
    name: 'virtual-lucide-icons',
    resolveId(id) {
      if (id.startsWith(PREFIX)) return VIRTUAL_PREFIX + id.slice(PREFIX.length);
    },
    load(id) {
      if (id.startsWith(VIRTUAL_PREFIX)) {
        const kebab = id.slice(VIRTUAL_PREFIX.length);
        const pascal = kebab
          .split('-')
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join('');
        return `export { ${pascal} as default } from 'lucide-react';`;
      }
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
  plugins: [lucideIconsPlugin(), react(), tailwindcss()],
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
          if (/[\\/]lucide-react[\\/]/.test(id)) return 'vendor-icons';
          if (/[\\/]zod[\\/]/.test(id)) return 'vendor-zod';
          if (/[\\/]zustand[\\/]/.test(id)) return 'vendor-zustand';
        },
      },
    },
  },
});

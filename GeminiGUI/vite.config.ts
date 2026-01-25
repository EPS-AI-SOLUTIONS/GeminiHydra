import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from '@tailwindcss/vite';
import viteCompression from 'vite-plugin-compression';
import path from 'path';
import os from 'os';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isTest = env.APP_ENV === 'test';
  const mockPath = path.resolve(process.cwd(), 'src/mocks/tauri.ts');
  const isProd = mode === 'production';

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Gzip compression for production
      isProd && viteCompression({
        algorithm: 'gzip',
        threshold: 1024,
        deleteOriginFile: false,
      }),
      // Brotli compression for production
      isProd && viteCompression({
        algorithm: 'brotliCompress',
        threshold: 1024,
        deleteOriginFile: false,
      }),
    ].filter(Boolean),

    resolve: {
      alias: isTest ? {
        '@tauri-apps/api/core': mockPath,
        '@tauri-apps/api/event': mockPath,
        '@tauri-apps/api/window': mockPath,
        '@tauri-apps/api/webviewWindow': mockPath,
      } : {},
    },

    // Build optimization
    build: {
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: isProd,
          drop_debugger: isProd,
        },
      },
      cssCodeSplit: true,
      sourcemap: !isProd,
      rollupOptions: {
        output: {
          manualChunks: {
            // Core React - loads first, most stable
            'vendor-react': ['react', 'react-dom'],
            // Markdown rendering - heavy, lazy loaded
            'vendor-markdown': ['react-markdown', 'remark-gfm'],
            // Animation library
            'vendor-motion': ['framer-motion'],
            // Icons - tree-shaken
            'vendor-icons': ['lucide-react'],
            // State management
            'vendor-state': ['zustand'],
            // Query management
            'vendor-query': ['@tanstack/react-query'],
            // Tauri APIs
            'vendor-tauri': ['@tauri-apps/api'],
          },
        },
      },
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
      // Proxy for Ollama API (CORS bypass)
      proxy: {
        '/api/ollama': {
          target: 'http://127.0.0.1:11434',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
        },
      },
    },
  };
});

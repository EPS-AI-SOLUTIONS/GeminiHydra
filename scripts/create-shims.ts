/**
 * create-shims.ts — Create stub @jaskier/* packages for Vercel deployment.
 *
 * On Vercel, the app is deployed from its own repo (not the monorepo),
 * so workspace:* dependencies can't resolve. This script creates minimal
 * shim packages in node_modules so that the build can proceed.
 *
 * Shimmed packages: @jaskier/ui, @jaskier/core, @jaskier/hydra-app
 */

import fs from "fs";
import path from "path";

const basePath: string = path.join(process.cwd(), "node_modules");

/** Create a shim package with the given name, exports map, and index code. */
function createShim(name: string, indexCode: string, subpaths: Record<string, string> = {}): void {
  const dir: string = path.join(basePath, name);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Main index.js
  fs.writeFileSync(path.join(dir, "index.js"), indexCode);

  // package.json with exports map
  const exports: Record<string, string> = { ".": "./index.js" };
  for (const [subpath, file] of Object.entries(subpaths)) {
    exports[subpath] = `./${file}`;
  }

  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name,
        version: "1.0.0",
        main: "index.js",
        type: "module",
        exports,
      },
      null,
      2,
    ),
  );

  // Create subpath files
  for (const [, file] of Object.entries(subpaths)) {
    const filePath: string = path.join(dir, file);
    const fileDir: string = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "export {};\n");
    }
  }

  console.log(`Shim created: ${name}`);
}

// ── @jaskier/ui ──
createShim(
  "@jaskier/ui",
  `export const cn = (...args) => args.filter(Boolean).join(' ');
export const Button = () => null;
export const Input = () => null;
export const Card = () => null;
export const Badge = () => null;
export const Skeleton = () => null;
export const AgentAvatar = () => null;
export const BaseArtifactView = () => null;
export const BaseChatInput = () => null;
export const CommandPalette = () => null;
export const EmptyState = () => null;
export const FooterControls = () => null;
export const LogoButton = () => null;
export const SessionItem = () => null;
export const SessionSearch = () => null;
export const TabBar = () => null;
export const ViewSkeleton = () => null;
export const ThemeProvider = ({ children }) => children;
export const useTheme = () => ({ theme: 'dark', resolvedTheme: 'dark', setTheme: () => {} });
export class ErrorBoundary { constructor(p) { this.props = p; } render() { return this.props.children; } }
`,
);

// ── @jaskier/ui CSS stubs ──
// Vercel build imports @jaskier/ui/styles/base.css and @jaskier/ui/styles/globals.css
const uiStylesDir: string = path.join(basePath, "@jaskier/ui", "styles");
if (!fs.existsSync(uiStylesDir)) {
  fs.mkdirSync(uiStylesDir, { recursive: true });
}
// Empty CSS stubs — the real design system CSS lives in each app's local styles
fs.writeFileSync(path.join(uiStylesDir, "base.css"), "/* @jaskier/ui base — stub for Vercel */\n");
fs.writeFileSync(path.join(uiStylesDir, "globals.css"), "/* @jaskier/ui globals — stub for Vercel */\n");

// Update @jaskier/ui package.json exports to include CSS subpaths
const uiPkgPath: string = path.join(basePath, "@jaskier/ui", "package.json");
const uiPkg: { exports: Record<string, string> } = JSON.parse(fs.readFileSync(uiPkgPath, "utf8"));
uiPkg.exports["./styles/base.css"] = "./styles/base.css";
uiPkg.exports["./styles/globals.css"] = "./styles/globals.css";
uiPkg.exports["./styles/*"] = "./styles/*";
fs.writeFileSync(uiPkgPath, JSON.stringify(uiPkg, null, 2));
console.log("CSS stubs added to @jaskier/ui");

// ── @jaskier/core ──
const coreIndex: string = `export const cn = (...args) => args.filter(Boolean).join(' ');
export {};
`;

createShim("@jaskier/core", coreIndex, {
  "./api": "api/index.js",
  "./hooks": "hooks/index.js",
  "./utils": "utils/index.js",
  "./types": "types/index.js",
  "./schemas": "schemas.js",
  "./i18n": "i18n/index.js",
  "./telemetry": "telemetry.js",
  "./vite": "vite/index.js",
});

// Write meaningful stubs for subpaths used by Hydras
fs.writeFileSync(
  path.join(basePath, "@jaskier/core/api/index.js"),
  `import { createContext, useContext } from 'react';
const Ctx = createContext(null);
export const ApiClientProvider = ({ children }) => children;
export const useApiClient = () => ({});
export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/core/i18n/index.js"),
  `export const createI18nConfig = () => ({});
export {};
`,
);

// ── @jaskier/hydra-app ──
const noop: string = "() => null";
const hydraIndex: string = `export const AppShell = ${noop};
export const Sidebar = ${noop};
export const StatusFooter = ${noop};
export const TabBar = ${noop};
export const CommandPalette = ${noop};
export const fetchPartnerSessions = async () => [];
export const fetchPartnerSession = async () => null;
export {};
`;

const hydraSubpaths: Record<string, string> = {
  "./features/chat": "features/chat/index.js",
  "./features/settings": "features/settings/index.js",
  "./features/agents": "features/agents/index.js",
  "./features/auth": "features/auth/index.js",
  "./features/delegations": "features/delegations/index.js",
  "./features/health": "features/health/index.js",
  "./features/home": "features/home/index.js",
  "./features/logs": "features/logs/index.js",
  "./features/memory": "features/memory/index.js",
  "./features/restore": "features/restore/index.js",
  "./features/results": "features/results/index.js",
  "./features/upload": "features/upload/index.js",
  "./features/crop": "features/crop/index.js",
  "./components/molecules": "components/molecules/index.js",
  "./components/organisms": "components/organisms/index.js",
  "./stores": "stores/index.js",
  "./shared/api": "shared/api/client.js",
  "./shared/api/queryClient": "shared/api/queryClient.js",
  "./shared/api/sseClient": "shared/api/sseClient.js",
  "./shared/api/schemas": "shared/api/schemas.js",
  "./shared/hooks": "shared/hooks/index.js",
  "./shared/types": "shared/types/index.js",
  "./contexts/ThemeContext": "contexts/ThemeContext.js",
  "./contexts/HydraAppConfig": "contexts/HydraAppConfig.js",
};

createShim("@jaskier/hydra-app", hydraIndex, hydraSubpaths);

// Write richer stubs for heavily-used subpaths
const featureStub = (exports: string[]): string =>
  exports.map((e) => `export const ${e} = () => null;`).join("\n") + "\nexport {};\n";

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/chat/index.js"),
  featureStub(["ChatContainer", "ChatViewWrapper", "PartnerChatModal"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/settings/index.js"),
  featureStub(["SettingsView", "OAuthBanner"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/agents/index.js"),
  featureStub(["AgentsView"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/auth/index.js"),
  featureStub(["LoginView"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/delegations/index.js"),
  featureStub(["DelegationsView"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/health/index.js"),
  featureStub(["ProviderHealthWidget"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/home/index.js"),
  featureStub(["WelcomeScreen"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/logs/index.js"),
  featureStub(["LogsView"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/memory/index.js"),
  featureStub(["KnowledgeGraphView"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/features/upload/index.js"),
  featureStub(["UploadView"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/components/molecules/index.js"),
  featureStub(["FeatureErrorFallback", "QueryError", "SessionSearch", "ViewSkeleton"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/components/organisms/index.js"),
  featureStub(["AppShell", "Sidebar", "StatusFooter", "TabBar"]),
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/stores/index.js"),
  `export const useViewStore = () => ({});
export const useCurrentChatHistory = () => [];
export const useCurrentSession = () => null;
export const useCurrentSessionId = () => null;
export const useLiveLogStore = () => ({});
export const createChatSlice = () => ({});
export const createSessionSlice = () => ({});
export const createViewSlice = () => ({});
export const initViewStore = () => {};
export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/shared/api/client.js"),
  `export const initApiClient = () => ({});
export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/shared/api/queryClient.js"),
  `export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/shared/api/schemas.js"),
  `export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/shared/hooks/index.js"),
  `export const useAuthGate = () => ({ isAuthenticated: true, isLoading: false });
export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/shared/types/index.js"),
  `export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/contexts/HydraAppConfig.js"),
  `import { createContext, useContext } from 'react';
const Ctx = createContext({});
export const HydraAppConfigProvider = ({ children }) => children;
export const useHydraAppConfig = () => useContext(Ctx);
export {};
`,
);

fs.writeFileSync(
  path.join(basePath, "@jaskier/hydra-app/contexts/ThemeContext.js"),
  `export {};
`,
);

// ── Vercel: rewrite vite.config.ts to be self-contained ──
// The original imports createViteConfig from ../../packages/core/... which doesn't exist on Vercel.
// We replace it with an inline config that uses locally-installed dependencies.
const viteConfigPath: string = path.join(process.cwd(), "vite.config.ts");
fs.writeFileSync(
  viteConfigPath,
  `/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendUrl = env.VITE_BACKEND_URL || 'http://localhost:8081';
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: { globPatterns: ['**/*.{js,css,html,ico,png,svg}'] },
      }),
    ],
    resolve: { alias: { '@': resolve(__dirname, './src') } },
    clearScreen: false,
    build: {
      target: 'esnext',
      sourcemap: mode !== 'production',
      modulePreload: { polyfill: true },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
    },
  };
});
`,
);
console.log("vite.config.ts rewritten for Vercel (inline config)");

console.log("All @jaskier/* shims created successfully.");

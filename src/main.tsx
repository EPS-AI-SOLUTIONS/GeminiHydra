// @ts-nocheck
// src/main.tsx
/**
 * GeminiHydra v15 - Application Entry Point
 * ============================================
 * Wires: QueryClientProvider, ThemeProvider, ErrorBoundary, AuthGate, AppShell, ViewRouter, Toaster, i18n.
 * Phase 7: Views are lazy-loaded with React.lazy + Suspense for code-splitting.
 * ThemeProvider hoisted above AppShell so LoginView (outside AppShell) has access to theme.
 */

import { type AuthConfig, AuthProvider, LoginButton, useAuth } from '@jaskier/auth';
import { ApiClientProvider } from '@jaskier/core/api';
import { useAuthGate } from '@jaskier/hydra-app';
import { ApprovalGate } from '@jaskier/hydra-app/components/molecules';
import { ErrorBoundary } from '@jaskier/ui';
import { QueryClientProvider, QueryErrorResetBoundary } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { AnimatePresence, motion } from 'motion/react';
import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { FeatureErrorFallback } from '@/components/molecules/FeatureErrorFallback';
import { ViewSkeleton } from '@/components/molecules/ViewSkeleton';
import { AppShell } from '@/components/organisms/AppShell';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ChatViewWrapper } from '@/features/chat/components/ChatViewWrapper';
import { apiDelete, apiGet, apiGetPolling, apiPatch, apiPost, apiPostFormData, BASE_URL } from '@/shared/api/client';
import { queryClient } from '@/shared/api/queryClient';
import { useViewStore } from '@/stores/viewStore';
import '@/i18n';
import './styles/globals.css';

// ============================================================================
// LAZY-LOADED VIEWS
// ============================================================================

const LazyWelcomeScreen = lazy(() => import('@/features/home/components/WelcomeScreen'));
const LazyAgentsView = lazy(() => import('@/features/agents/components/AgentsView'));
const LazyKnowledgeGraphView = lazy(() => import('@/features/memory/components/KnowledgeGraphView'));
const LazySettingsView = lazy(() => import('@/features/settings/components/SettingsView'));
const LazyLogsView = lazy(() => import('@/features/logs/components/LogsView'));
const LazyDelegationsView = lazy(() => import('@/features/delegations/components/DelegationsView'));
const LazyLoginView = lazy(() => import('@/features/auth/components/LoginView'));

// ============================================================================
// VIEW ROUTER
// ============================================================================

function ViewRouter() {
  const currentView = useViewStore((s) => s.currentView);
  const isChatView = currentView === 'chat';

  function renderNonChatView() {
    switch (currentView) {
      case 'home':
        return <LazyWelcomeScreen />;
      case 'agents':
        return (
          <ErrorBoundary fallback={<FeatureErrorFallback feature="Agents" onRetry={() => window.location.reload()} />}>
            <LazyAgentsView />
          </ErrorBoundary>
        );
      case 'brain':
        return (
          <ErrorBoundary
            fallback={<FeatureErrorFallback feature="Knowledge Graph" onRetry={() => window.location.reload()} />}
          >
            <LazyKnowledgeGraphView />
          </ErrorBoundary>
        );
      case 'settings':
        return (
          <ErrorBoundary
            fallback={<FeatureErrorFallback feature="Settings" onRetry={() => window.location.reload()} />}
          >
            <LazySettingsView />
          </ErrorBoundary>
        );
      case 'logs':
        return (
          <ErrorBoundary fallback={<FeatureErrorFallback feature="Logs" onRetry={() => window.location.reload()} />}>
            <LazyLogsView />
          </ErrorBoundary>
        );
      case 'delegations':
        return (
          <ErrorBoundary
            fallback={<FeatureErrorFallback feature="Delegations" onRetry={() => window.location.reload()} />}
          >
            <LazyDelegationsView />
          </ErrorBoundary>
        );
      default:
        return <LazyWelcomeScreen />;
    }
  }

  return (
    <div className="h-full overflow-hidden relative">
      {/* Chat always mounted — preserves WebSocket connection across view switches */}
      <div className={isChatView ? 'h-full w-full' : 'hidden'}>
        <ErrorBoundary fallback={<FeatureErrorFallback feature="Chat" onRetry={() => window.location.reload()} />}>
          <Suspense fallback={<ViewSkeleton />}>
            <ChatViewWrapper />
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* Non-chat views with enter/exit animations */}
      <AnimatePresence mode="wait">
        {!isChatView && (
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="h-full w-full"
          >
            <QueryErrorResetBoundary>
              {() => (
                <ErrorBoundary fallback={<ViewSkeleton />}>
                  <Suspense fallback={<ViewSkeleton />}>{renderNonChatView()}</Suspense>
                </ErrorBoundary>
              )}
            </QueryErrorResetBoundary>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// AUTH GATE — renders LoginView or AppShell based on auth state
// ============================================================================

function AuthGate() {
  const currentView = useViewStore((s) => s.currentView);
  useAuthGate();

  if (currentView === 'login') {
    return (
      <Suspense fallback={<ViewSkeleton />}>
        <LazyLoginView />
      </Suspense>
    );
  }

  return (
    <AppShell>
      <ViewRouter />
    </AppShell>
  );
}

// ============================================================================
// APP
// ============================================================================

const apiClient = { apiGet, apiGetPolling, apiPost, apiPatch, apiDelete, apiPostFormData, BASE_URL };

const authConfig: AuthConfig = {
  apiUrl: import.meta.env.VITE_AUTH_API_URL || 'http://localhost:8086',
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  appId: 'geminihydra',
};

function JaskierAuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <ViewSkeleton />;
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-6 font-mono">
        <h1 className="text-2xl font-bold">GeminiHydra</h1>
        <p className="text-zinc-500">Sign in to continue</p>
        <LoginButton />
      </div>
    );
  }

  return <ApprovalGate appName="Gemini Hydra">{children}</ApprovalGate>;
}

function App() {
  return (
    <AuthProvider config={authConfig}>
      <QueryClientProvider client={queryClient}>
        <ApiClientProvider client={apiClient}>
          <ThemeProvider defaultTheme="dark">
            <QueryErrorResetBoundary>
              {() => (
                <ErrorBoundary fallback={<ViewSkeleton />}>
                  <JaskierAuthGate>
                    <AuthGate />
                  </JaskierAuthGate>
                </ErrorBoundary>
              )}
            </QueryErrorResetBoundary>
            <Toaster position="bottom-right" theme="dark" richColors />
          </ThemeProvider>
        </ApiClientProvider>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </AuthProvider>
  );
}

// ============================================================================
// MOUNT
// ============================================================================

// Jaskier Shared Pattern -- createRoot with HMR safety & documentation
/**
 * Application Mount Point
 * =======================
 * - React 19.2.4 + Vite 7 with Hot Module Replacement (HMR)
 * - StrictMode intentionally enabled in DEV for side-effect detection
 * - Double-renders in StrictMode are EXPECTED and INTENTIONAL (React 18+ behavior)
 * - This helps catch bugs in component lifecycle (effects, reducers, etc.)
 *
 * HMR Safety (Vite + @vitejs/plugin-react):
 * - import.meta.hot?.dispose() cleans up the root before HMR re-import
 * - Prevents "createRoot() on container already passed to createRoot()" error
 * - On code change: dispose() unmounts old tree → module re-imports → new createRoot()
 * - Production: import.meta.hot is undefined (Vite tree-shaking removes block)
 *
 * Reference: https://vitejs.dev/guide/ssr.html#setting-up-the-dev-server
 */

const root = document.getElementById('root');
if (root) {
  const appRoot = createRoot(root);
  appRoot.render(
    <StrictMode>
      <App />
      <Analytics />
      <SpeedInsights />
    </StrictMode>,
  );

  // HMR cleanup: unmount root before hot reload to prevent double-mount
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      appRoot.unmount();
    });
  }
}

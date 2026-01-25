/**
 * Lazy-loaded components for code splitting and performance optimization
 * Uses React 19 patterns with proper Suspense integration
 * Ported from ClaudeHydra.
 *
 * Benefits:
 * - Reduces initial bundle size
 * - Code splitting at component level
 * - Better performance for users with slower connections
 * - Components only loaded when needed
 */

import { lazy, Suspense, ReactNode } from 'react';
import { SuspenseFallback } from './SuspenseFallback';

/**
 * Lazy-loaded SettingsModal component
 * Heavy component due to extensive form fields
 */
const SettingsModalLazy = lazy(() =>
  import('./SettingsModal').then((m) => ({
    default: m.SettingsModal,
  }))
);

/**
 * Lazy-loaded MemoryPanel component
 * Heavy due to knowledge graph visualization
 */
const MemoryPanelLazy = lazy(() =>
  import('./MemoryPanel').then((m) => ({
    default: m.MemoryPanel,
  }))
);

/**
 * Lazy-loaded BridgePanel component
 * Contains command approval system
 */
const BridgePanelLazy = lazy(() =>
  import('./BridgePanel').then((m) => ({
    default: m.BridgePanel,
  }))
);

/**
 * Lazy-loaded ShortcutsModal component
 * Keyboard shortcuts reference
 */
const ShortcutsModalLazy = lazy(() =>
  import('./ShortcutsModal').then((m) => ({
    default: m.ShortcutsModal,
  }))
);

/**
 * Lazy-loaded ErrorBoundary component
 * Error handling UI
 */
const ErrorBoundaryLazy = lazy(() =>
  import('./ErrorBoundary').then((m) => ({
    default: m.ErrorBoundary,
  }))
);

interface LazyComponentWrapperProps {
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Wrapper component for lazy-loaded components with Suspense fallback
 * Provides consistent loading experience across all lazy components
 */
function LazyComponentWrapper({
  children,
  fallback,
}: LazyComponentWrapperProps) {
  return (
    <Suspense fallback={fallback || <SuspenseFallback />}>
      {children}
    </Suspense>
  );
}

/**
 * Higher-order component to wrap lazy-loaded components with Suspense
 * Usage: <WithSuspense component={MyLazyComponent} />
 */
function WithSuspense({
  component: Component,
  fallback,
  ...props
}: any) {
  return (
    <LazyComponentWrapper fallback={fallback}>
      <Component {...props} />
    </LazyComponentWrapper>
  );
}

export {
  // Lazy components
  SettingsModalLazy,
  MemoryPanelLazy,
  BridgePanelLazy,
  ShortcutsModalLazy,
  ErrorBoundaryLazy,
  // Utilities
  LazyComponentWrapper,
  WithSuspense,
};

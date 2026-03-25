// GeminiHydra AppShell — extends shared AppShell with ProviderHealthWidget (M1-03)
import { AppShell as SharedAppShell } from '@jaskier/hydra-app/components/organisms';
import { ProviderHealthWidget } from '@jaskier/hydra-app/features/health';
import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
}

/**
 * GeminiHydra-specific AppShell.
 * Wraps the shared AppShell and injects a ProviderHealthWidget
 * in the top-right corner of the main content area, showing
 * real-time Gemini API connection status.
 */
export function AppShell({ children }: AppShellProps) {
  return (
    <SharedAppShell>
      <div className="relative h-full w-full">
        {/* Provider health status widget — top-right of content area */}
        <div className="absolute top-1 right-3 z-20">
          <ProviderHealthWidget />
        </div>
        {children}
      </div>
    </SharedAppShell>
  );
}

AppShell.displayName = 'GeminiHydraAppShell';

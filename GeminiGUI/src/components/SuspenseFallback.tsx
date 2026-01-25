/**
 * SuspenseFallback Component
 * @module components/SuspenseFallback
 *
 * Loading fallback for React Suspense boundaries.
 * Ported from ClaudeHydra.
 */

import { memo } from 'react';
import { Loader2 } from 'lucide-react';

interface SuspenseFallbackProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const SuspenseFallback = memo<SuspenseFallbackProps>(
  ({ message = 'Ladowanie...', size = 'md' }) => {
    const sizeClasses = {
      sm: 'h-8 w-8',
      md: 'h-12 w-12',
      lg: 'h-16 w-16',
    };

    return (
      <div className="flex flex-col items-center justify-center h-full w-full gap-3 text-[var(--matrix-text-dim)]">
        <Loader2 className={`${sizeClasses[size]} animate-spin text-[var(--matrix-accent)]`} />
        <span className="text-sm font-mono">{message}</span>
      </div>
    );
  }
);

SuspenseFallback.displayName = 'SuspenseFallback';

export default SuspenseFallback;

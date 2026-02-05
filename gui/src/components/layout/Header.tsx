/**
 * Header Component - Matrix Glass Theme
 */

import { clsx } from 'clsx';
import { Wifi, WifiOff } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { useHealthCheck } from '../../hooks/useApi';

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const { data: health, isError, isFetching } = useHealthCheck();

  const isConnected = health?.status === 'ok' && !isError;

  return (
    <header className="h-14 px-6 flex items-center justify-between border-b border-[var(--matrix-border)] bg-[var(--glass-bg)] backdrop-blur-sm">
      {/* Title */}
      <div>
        <h1 className="text-lg font-semibold text-[var(--matrix-text)]">{title}</h1>
        {subtitle && (
          <p className="text-xs text-[var(--matrix-text-dim)]">{subtitle}</p>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center gap-4">
        {health?.version && (
          <Badge variant="default">v{health.version}</Badge>
        )}

        <Badge
          variant={isConnected ? 'success' : 'error'}
          icon={
            isConnected ? (
              <Wifi className="w-3 h-3" />
            ) : (
              <WifiOff className="w-3 h-3" />
            )
          }
        >
          {isFetching ? (
            'Łączenie...'
          ) : isConnected ? (
            'Połączono'
          ) : (
            'Rozłączono'
          )}
        </Badge>

        <div
          className={clsx(
            'w-2 h-2 rounded-full',
            isConnected
              ? 'bg-[var(--matrix-success)] animate-pulse'
              : 'bg-[var(--matrix-error)]'
          )}
        />
      </div>
    </header>
  );
}

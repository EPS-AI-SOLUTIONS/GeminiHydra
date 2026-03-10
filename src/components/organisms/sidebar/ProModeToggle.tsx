// src/components/organisms/sidebar/ProModeToggle.tsx
/**
 * ProModeToggle — forces all agents to use the top-tier Pro model.
 * When active: sets force_model = "gemini-3.1-pro-preview-customtools" in settings.
 * When inactive: clears force_model (agents use their own model selection logic).
 */

import { cn } from '@jaskier/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Gem } from 'lucide-react';
import { useState } from 'react';
import { useSettingsQuery } from '@/features/settings/hooks/useSettings';
import { apiPatch } from '@/shared/api/client';
import { useViewTheme } from '@/shared/hooks/useViewTheme';

const PRO_MODEL = 'gemini-3.1-pro-preview-customtools';

interface ProModeToggleProps {
  collapsed: boolean;
}

export function ProModeToggle({ collapsed }: ProModeToggleProps) {
  const theme = useViewTheme();
  const isLight = theme.isLight;
  const queryClient = useQueryClient();
  const { data: settings } = useSettingsQuery();
  const [loading, setLoading] = useState(false);

  const isActive = !!settings?.force_model;

  const toggle = async () => {
    setLoading(true);
    try {
      await apiPatch('/api/settings', {
        force_model: isActive ? '' : PRO_MODEL,
      });
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      data-testid="sidebar-pro-mode-toggle"
      title={
        collapsed
          ? isActive
            ? `PRO MODE aktywny: ${settings?.force_model}`
            : 'Włącz PRO MODE — wymusza model Pro dla wszystkich agentów'
          : undefined
      }
      aria-label={isActive ? 'Wyłącz PRO MODE' : 'Włącz PRO MODE'}
      className={cn(
        'flex items-center gap-3 w-full p-2 rounded-lg transition-all group relative',
        collapsed ? 'justify-center' : 'justify-start',
        isActive
          ? isLight
            ? 'bg-emerald-500/15 hover:bg-emerald-500/25'
            : 'bg-[--matrix-accent]/15 hover:bg-[--matrix-accent]/25'
          : isLight
            ? 'hover:bg-black/5'
            : 'hover:bg-white/5',
        loading && 'opacity-50 cursor-wait',
      )}
    >
      {/* Icon with glow when active */}
      <div className="relative shrink-0">
        <Gem
          size={18}
          className={cn(
            'transition-colors',
            isActive
              ? isLight
                ? 'text-emerald-600'
                : 'text-[--matrix-accent]'
              : cn(theme.iconMuted, isLight ? 'group-hover:text-emerald-600' : 'group-hover:text-white'),
          )}
        />
        {isActive && (
          <span
            className={cn(
              'absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full',
              isLight
                ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
                : 'bg-[--matrix-accent] shadow-[0_0_6px_var(--matrix-accent)]',
            )}
          />
        )}
      </div>

      {/* Label (only when expanded) */}
      {!collapsed && (
        <div className="flex items-center justify-between w-full min-w-0">
          <span
            className={cn(
              'text-base font-mono truncate',
              isActive
                ? isLight
                  ? 'text-emerald-700 font-semibold'
                  : 'text-[--matrix-accent] font-semibold'
                : cn(theme.textMuted, isLight ? 'group-hover:text-black' : 'group-hover:text-white'),
            )}
          >
            PRO MODE
          </span>
          {/* ON/OFF badge */}
          <span
            className={cn(
              'text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0',
              isActive
                ? isLight
                  ? 'bg-emerald-500/20 text-emerald-700'
                  : 'bg-[--matrix-accent]/20 text-[--matrix-accent]'
                : isLight
                  ? 'bg-black/8 text-black/40'
                  : 'bg-white/8 text-white/30',
            )}
          >
            {isActive ? 'ON' : 'OFF'}
          </span>
        </div>
      )}
    </button>
  );
}

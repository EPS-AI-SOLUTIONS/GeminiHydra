// src/components/layout/Header.tsx
/**
 * Application Header - Tissaia Style
 * ====================================
 * Top bar with breadcrumbs, status indicator, and quick actions.
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Home, ChevronRight, Server } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppStore } from '../../store/useAppStore';
import { useViewTheme } from '../../hooks';

interface HeaderProps {
  isDark?: boolean;
  statusBadgeState: { className: string; text: string };
  currentModel: string;
}

// View labels for breadcrumbs
const viewLabels: Record<string, { pl: string; en: string }> = {
  chat: { pl: 'Chat', en: 'Chat' },
  agents: { pl: 'Agenci', en: 'Agents' },
  history: { pl: 'Historia', en: 'History' },
  settings: { pl: 'Ustawienia', en: 'Settings' },
  status: { pl: 'Status', en: 'Status' },
};

export const Header = memo<HeaderProps>(({
  statusBadgeState,
  currentModel,
}) => {
  const { i18n } = useTranslation();
  const { resolvedTheme } = useTheme();
  const { currentView, setCurrentView } = useAppStore();
  const theme = useViewTheme();

  const currentLabel = viewLabels[currentView]?.[i18n.language as 'pl' | 'en'] || currentView;

  return (
    <header className={`px-6 py-3 border-b ${theme.border} ${theme.header}`}>
      <div className="flex items-center justify-between">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setCurrentView('chat')}
            className={`flex items-center gap-1 ${theme.textMuted} hover:text-matrix-accent transition-colors`}
          >
            <Home size={14} />
            <span className="font-medium">GeminiHydra</span>
          </button>
          <ChevronRight size={14} className={theme.textMuted} />
          <span className={theme.textAccent + ' font-medium'}>{currentLabel}</span>

          {/* Status indicator */}
          <div className="flex items-center gap-2 ml-4">
            <span
              className={`w-2 h-2 rounded-full ${
                resolvedTheme === 'light' ? 'bg-emerald-500' : 'bg-matrix-accent'
              } animate-pulse`}
            />
            <span className={`text-xs ${theme.textMuted}`}>
              {currentModel}
            </span>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          {/* Status badge */}
          <div className={`status-badge flex items-center gap-1.5 px-2.5 py-1 rounded-full ${statusBadgeState.className} transition-all duration-300`}>
            <Server size={10} />
            <span className="font-mono font-medium text-[10px]">{statusBadgeState.text}</span>
          </div>

          {/* Refresh */}
          <button
            onClick={() => window.location.reload()}
            className={`p-2 rounded-lg ${theme.btnGhost}`}
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
    </header>
  );
});

Header.displayName = 'Header';

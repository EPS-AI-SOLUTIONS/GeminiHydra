import { memo } from 'react';
import { Zap, Eraser, Settings, Sun, Moon, Server } from 'lucide-react';

interface HeaderProps {
  isDark: boolean;
  logoSrc: string;
  headerSpanClass: string;
  statusBadgeState: { className: string; text: string };
  onClearHistory: () => void;
  onToggleSettings: () => void;
  onToggleTheme: () => void;
}

export const Header = memo<HeaderProps>(({
  isDark,
  logoSrc,
  headerSpanClass,
  statusBadgeState,
  onClearHistory,
  onToggleSettings,
  onToggleTheme
}) => {
  return (
    <header className="flex items-center justify-between border-b border-[var(--matrix-border)] shrink-0 bg-[var(--matrix-bg)]/80 backdrop-blur-md sticky top-0 z-40 px-2 py-1 transition-colors duration-300">
      <div className="flex items-center gap-3 group cursor-default">
        <img
          src={logoSrc}
          alt="Gemini Logo"
          className="w-12 h-12 object-contain transition-all duration-500 group-hover:rotate-180 group-hover:scale-110 drop-shadow-[0_0_8px_rgba(0,255,0,0.3)]"
        />
        <h1 className="text-2xl font-bold flex items-center gap-2 text-[var(--matrix-accent)] transition-colors duration-300 tracking-tight">
          Gemini
          <span className={`${headerSpanClass} font-light`}>Hydra</span>
        </h1>
      </div>

      <div className="flex gap-2 items-center">
        <div className="hidden md:flex bg-[var(--matrix-accent)]/5 text-[var(--matrix-accent)] rounded-full px-2 py-0.5 border border-[var(--matrix-accent)]/30 items-center gap-1 shadow-[0_0_10px_rgba(0,255,0,0.1)]">
          <Zap size={10} fill="currentColor" className="animate-pulse" />
          <span className="text-[10px] font-bold tracking-wider">WOLF SWARM v3.0</span>
        </div>

        <div className="h-4 w-px bg-[var(--matrix-border)] mx-1 opacity-50" />

        <div className="flex gap-1">
          <HeaderButton onClick={onClearHistory} icon={<Eraser size={14} />} title="Wyczyść Czat (Ctrl+L)" />
          <HeaderButton onClick={onToggleSettings} icon={<Settings size={14} />} title="Ustawienia (Ctrl+,)" />
          <HeaderButton onClick={onToggleTheme} icon={isDark ? <Sun size={14} /> : <Moon size={14} />} title="Zmień Motyw" />
        </div>

        <div className={`ml-1 status-badge flex items-center gap-1 px-2 py-0.5 rounded-md border ${statusBadgeState.className} transition-all duration-300`}>
          <Server size={10} />
          <span className="font-mono font-medium text-[10px]">{statusBadgeState.text}</span>
        </div>
      </div>
    </header>
  );
});

const HeaderButton = ({ onClick, icon, title }: { onClick: () => void; icon: React.ReactNode; title: string }) => (
  <button
    onClick={onClick}
    className="p-1.5 rounded-md hover:bg-[var(--matrix-accent)]/10 border border-transparent hover:border-[var(--matrix-accent)]/30 transition-all text-[var(--matrix-text)] hover:text-[var(--matrix-accent)] hover:shadow-[0_0_15px_rgba(0,255,0,0.15)] active:scale-95"
    title={title}
  >
    {icon}
  </button>
);

Header.displayName = 'Header';

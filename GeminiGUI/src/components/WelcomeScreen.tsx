/**
 * GeminiGUI - WelcomeScreen Component
 * @module components/WelcomeScreen
 *
 * Static welcome screen shown when a session has no messages.
 * Displays quick-action cards that auto-send commands to the chat.
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import {
  Monitor,
  FolderTree,
  GitBranch,
  HardDrive,
  Network,
  Cpu,
  Keyboard,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

// ============================================================================
// QUICK ACTIONS
// ============================================================================

const QUICK_ACTIONS = [
  {
    id: 'sysinfo',
    icon: Monitor,
    label: 'System Info',
    description: 'Informacje o systemie',
    command: 'Pokaz informacje o systemie',
  },
  {
    id: 'files',
    icon: FolderTree,
    label: 'Pliki projektu',
    description: 'Struktura katalogow',
    command: 'Pokaz strukture projektu',
  },
  {
    id: 'git',
    icon: GitBranch,
    label: 'Git Status',
    description: 'Status repozytorium',
    command: 'Pokaz status git',
  },
  {
    id: 'disk',
    icon: HardDrive,
    label: 'Dyski',
    description: 'Wolne miejsce',
    command: 'Pokaz wolne miejsce na dyskach',
  },
  {
    id: 'network',
    icon: Network,
    label: 'Siec',
    description: 'Konfiguracja sieci',
    command: 'Pokaz konfiguracje sieci',
  },
  {
    id: 'processes',
    icon: Cpu,
    label: 'Procesy',
    description: 'Aktywne procesy',
    command: 'Pokaz najwazniejsze procesy',
  },
] as const;

const SHORTCUTS = [
  { keys: 'Enter', label: 'Wyslij' },
  { keys: 'Ctrl+N', label: 'Nowa sesja' },
  { keys: 'Ctrl+,', label: 'Ustawienia' },
  { keys: 'Ctrl+L', label: 'Wyczysc' },
] as const;

// ============================================================================
// COMPONENT
// ============================================================================

interface WelcomeScreenProps {
  onQuickAction: (command: string) => void;
}

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.08 * i, duration: 0.3, ease: 'easeOut' as const },
  }),
};

export const WelcomeScreen = memo<WelcomeScreenProps>(({ onQuickAction }) => {
  const settings = useAppStore((s) => s.settings);
  const hasApiKey = !!settings.geminiApiKey;
  const currentModel = settings.selectedModel || 'brak';

  return (
    <div className="welcome-screen">
      {/* Header */}
      <div className="welcome-header">
        <div className="welcome-logo-icon">
          <Cpu size={32} strokeWidth={1.5} />
        </div>
        <h2 className="welcome-title">GeminiHydra</h2>
        <p className="welcome-subtitle">
          Wieloagentowy asystent AI. Wpisz polecenie lub wybierz akcje.
        </p>
      </div>

      {/* Status */}
      <div className="welcome-status">
        <span className="welcome-status-pill">
          <span
            className={`welcome-status-dot ${hasApiKey ? 'welcome-status-dot--ok' : 'welcome-status-dot--warn'}`}
          />
          {hasApiKey ? 'Gemini Ready' : 'Local Only'}
        </span>
        <span className="welcome-status-model">{currentModel}</span>
      </div>

      {/* Quick Actions */}
      <div className="welcome-grid">
        {QUICK_ACTIONS.map((action, i) => (
          <motion.button
            key={action.id}
            className="welcome-card"
            onClick={() => onQuickAction(action.command)}
            custom={i}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="welcome-card-icon">
              <action.icon size={18} strokeWidth={1.5} />
            </div>
            <div>
              <span className="welcome-card-label">{action.label}</span>
              <span className="welcome-card-desc">{action.description}</span>
            </div>
          </motion.button>
        ))}
      </div>

      {/* Keyboard Shortcuts */}
      <div className="welcome-hints">
        <Keyboard size={12} className="opacity-40" />
        {SHORTCUTS.map((s) => (
          <span key={s.keys}>
            <kbd>{s.keys}</kbd> {s.label}
          </span>
        ))}
      </div>
    </div>
  );
});

WelcomeScreen.displayName = 'WelcomeScreen';

export default WelcomeScreen;

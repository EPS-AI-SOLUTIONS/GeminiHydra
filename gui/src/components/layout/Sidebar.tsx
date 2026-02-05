/**
 * Sidebar Component - Matrix Glass Theme
 */

import { clsx } from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Users,
  Settings,
  History,
  ChevronLeft,
  Zap,
  Moon,
  Sun,
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useTheme } from '../../contexts/ThemeContext';

type ViewType = 'chat' | 'agents' | 'history' | 'settings';

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

interface NavItem {
  id: ViewType;
  label: string;
  icon: typeof MessageSquare;
}

const navItems: NavItem[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'agents', label: 'Agenci', icon: Users },
  { id: 'history', label: 'Historia', icon: History },
  { id: 'settings', label: 'Ustawienia', icon: Settings },
];

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const { isSidebarOpen, toggleSidebar } = useAppStore();
  const { theme, toggleTheme } = useTheme();

  return (
    <AnimatePresence mode="wait">
      <motion.aside
        initial={false}
        animate={{ width: isSidebarOpen ? 240 : 64 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="h-full glass-panel-solid flex flex-col border-r border-[var(--matrix-border)]"
      >
        {/* Logo */}
        <div className="p-4 flex items-center justify-between border-b border-[var(--matrix-border)]">
          <AnimatePresence mode="wait">
            {isSidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <Zap className="w-6 h-6 text-[var(--matrix-accent)]" />
                <span className="font-mono font-semibold text-[var(--matrix-accent)] text-glow-subtle">
                  GeminiHydra
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-[var(--glass-bg)] transition-colors"
          >
            <ChevronLeft
              className={clsx(
                'w-5 h-5 text-[var(--matrix-text-dim)] transition-transform',
                !isSidebarOpen && 'rotate-180'
              )}
            />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all',
                  isActive
                    ? 'bg-[var(--matrix-accent)] text-[var(--matrix-bg-primary)]'
                    : 'text-[var(--matrix-text-dim)] hover:text-[var(--matrix-text)] hover:bg-[var(--glass-bg)]'
                )}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <AnimatePresence mode="wait">
                  {isSidebarOpen && (
                    <motion.span
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="text-sm font-medium whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </nav>

        {/* Theme Toggle */}
        <div className="p-4 border-t border-[var(--matrix-border)]">
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--matrix-text-dim)] hover:text-[var(--matrix-text)] hover:bg-[var(--glass-bg)] transition-all"
          >
            {theme === 'dark' ? (
              <Sun className="w-5 h-5 flex-shrink-0" />
            ) : (
              <Moon className="w-5 h-5 flex-shrink-0" />
            )}
            <AnimatePresence mode="wait">
              {isSidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="text-sm font-medium whitespace-nowrap"
                >
                  {theme === 'dark' ? 'Jasny motyw' : 'Ciemny motyw'}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}

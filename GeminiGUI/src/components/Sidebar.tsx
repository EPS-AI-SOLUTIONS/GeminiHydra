// src/components/Sidebar.tsx
/**
 * Navigation Sidebar - Tissaia Style
 * ====================================
 * Matrix Glass styled sidebar with grouped navigation.
 * Adapted from Tissaia design system for GeminiHydra.
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare,
  Users,
  Clock,
  Settings,
  Activity,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Globe,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useTheme } from '../contexts/ThemeContext';
import type { View } from '../types';

// ============================================
// TYPES
// ============================================

type NavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: { id: View; icon: LucideIcon; label: string }[];
};

// ============================================
// SIDEBAR COMPONENT
// ============================================

export default function Sidebar() {
  const { t, i18n } = useTranslation();
  const { currentView, setCurrentView } = useAppStore();
  const { resolvedTheme, toggleTheme } = useTheme();

  // Collapsed state
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('geminihydra_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('geminihydra_sidebar_collapsed', String(isCollapsed));
    } catch { /* ignore */ }
  }, [isCollapsed]);

  // Language dropdown state
  const [showLangDropdown, setShowLangDropdown] = useState(false);

  const languages = [
    { code: 'en', name: 'English', flag: '\u{1F1EC}\u{1F1E7}' },
    { code: 'pl', name: 'Polski', flag: '\u{1F1F5}\u{1F1F1}' },
  ];

  const selectLanguage = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setShowLangDropdown(false);
  };

  const currentLang = languages.find(l => l.code === i18n.language) || languages[1];

  // Navigation groups adapted for GeminiHydra
  const navGroups: NavGroup[] = [
    {
      id: 'main',
      label: t('sidebar.groups.main', 'MAIN'),
      icon: Sparkles,
      items: [
        { id: 'chat', icon: MessageSquare, label: t('nav.chat', 'Chat') },
        { id: 'agents', icon: Users, label: t('nav.agents', 'Agenci') },
      ]
    },
    {
      id: 'data',
      label: t('sidebar.groups.data', 'DANE'),
      icon: Clock,
      items: [
        { id: 'history', icon: Clock, label: t('nav.history', 'Historia') },
        { id: 'settings', icon: Settings, label: t('nav.settings', 'Ustawienia') },
      ]
    },
    {
      id: 'system',
      label: t('sidebar.groups.system', 'SYSTEM'),
      icon: Activity,
      items: [
        { id: 'status', icon: Activity, label: t('nav.status', 'Status') },
      ]
    },
  ];

  // Track expanded groups
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('geminihydra_expanded_groups');
      return saved ? JSON.parse(saved) : { main: true, data: true, system: true };
    } catch {
      return { main: true, data: true, system: true };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('geminihydra_expanded_groups', JSON.stringify(expandedGroups));
    } catch { /* ignore */ }
  }, [expandedGroups]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const isLight = resolvedTheme === 'light';
  const glassPanel = isLight ? 'glass-panel-light' : 'glass-panel-dark';

  // Light-mode text classes for better readability
  const textMuted = isLight ? 'text-slate-600' : 'text-slate-400';
  const textDim = isLight ? 'text-slate-500' : 'text-slate-500';
  const textHover = isLight ? 'hover:text-slate-900' : 'hover:text-white';
  const iconMuted = isLight ? 'text-slate-500' : 'text-slate-500';
  const iconHover = isLight ? 'group-hover:text-emerald-700' : 'group-hover:text-white';
  const hoverBg = isLight ? 'hover:bg-black/5' : 'hover:bg-white/5';
  const collapseBtn = isLight
    ? 'bg-white/70 border-emerald-600/30 hover:bg-emerald-50 hover:border-emerald-600/50'
    : 'bg-black/40 border-matrix-accent/30 hover:bg-matrix-accent/20 hover:border-matrix-accent/50';
  const collapseIcon = isLight ? 'text-emerald-700' : 'text-matrix-accent';

  return (
    <div className={`${isCollapsed ? 'w-20' : 'w-64'} shrink-0 h-full flex flex-col z-20 transition-all duration-300 relative p-2 gap-2 overflow-y-auto scrollbar-thin scrollbar-thumb-matrix-accent/20`}>

      {/* Collapse Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={`absolute -right-3 top-20 z-30 hidden md:flex items-center justify-center w-6 h-6 border rounded-full transition-all ${collapseBtn}`}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {isCollapsed ? (
          <ChevronRight size={14} className={collapseIcon} />
        ) : (
          <ChevronLeft size={14} className={collapseIcon} />
        )}
      </button>

      {/* Logo */}
      <div className="flex items-center justify-center py-6 flex-shrink-0">
        <img
          src={resolvedTheme === 'light' ? '/logolight.webp' : '/logodark.webp'}
          alt="GeminiHydra"
          className={`${isCollapsed ? 'w-16 h-16' : 'w-48 h-auto'} object-contain transition-all duration-300`}
          style={{ filter: resolvedTheme === 'light' ? 'drop-shadow(0 0 20px rgba(45,106,79,0.5))' : 'drop-shadow(0 0 20px rgba(0,255,65,0.6))' }}
        />
      </div>

      {/* Grouped Navigation */}
      <nav className="flex flex-col gap-2 flex-shrink-0">
        {navGroups.map((group) => {
          const isExpanded = expandedGroups[group.id];
          const hasActiveItem = group.items.some(item => item.id === currentView);
          const GroupIcon = group.icon;

          return (
            <div key={group.id} className={`${glassPanel} overflow-hidden`}>
              {/* Group Header */}
              {!isCollapsed ? (
                <button
                  onClick={() => toggleGroup(group.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 transition-all group ${
                    hasActiveItem
                      ? (isLight ? 'text-emerald-700 bg-emerald-500/10' : 'text-matrix-accent bg-matrix-accent/5')
                      : `${textMuted} ${textHover} ${hoverBg}`
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <GroupIcon size={14} />
                    <span className="text-[10px] font-bold tracking-[0.12em] uppercase">{group.label}</span>
                  </div>
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
                  />
                </button>
              ) : null}

              {/* Group Items */}
              <div className={`px-1.5 pb-1.5 space-y-0.5 overflow-hidden transition-all duration-200 ${
                !isCollapsed && !isExpanded ? 'max-h-0 opacity-0 pb-0' : 'max-h-96 opacity-100'
              } ${isCollapsed ? 'py-1.5' : ''}`}>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setCurrentView(item.id)}
                    className={`relative w-full flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'} px-3 py-2 rounded-lg transition-all duration-200 group ${
                      currentView === item.id
                        ? (isLight ? 'bg-emerald-500/15 text-emerald-800' : 'bg-matrix-accent/15 text-matrix-accent')
                        : `${textMuted} ${hoverBg} ${textHover}`
                    }`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <item.icon size={16} className={`${currentView === item.id ? (isLight ? 'text-emerald-700' : 'text-matrix-accent') : `${iconMuted} ${iconHover}`} transition-colors flex-shrink-0`} />
                    {!isCollapsed && <span className="font-medium text-xs tracking-wide truncate">{item.label}</span>}
                    {currentView === item.id && (
                      <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full ${isLight ? 'bg-emerald-600 shadow-[0_0_8px_rgba(5,150,105,0.5)]' : 'bg-matrix-accent shadow-[0_0_8px_#00ff41]'}`} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer / Lang & Theme Toggle */}
      <div className={`${glassPanel} p-2 space-y-1`}>
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'} gap-3 w-full p-2 rounded-lg ${hoverBg} transition-all group`}
          title={isCollapsed ? `Theme: ${resolvedTheme === 'dark' ? 'Dark' : 'Light'}` : undefined}
        >
          <div className="relative">
            {resolvedTheme === 'dark' ? (
              <Moon size={18} className="text-slate-500 group-hover:text-matrix-accent transition-colors" />
            ) : (
              <Sun size={18} className="text-amber-600 group-hover:text-amber-500 transition-colors" />
            )}
          </div>
          {!isCollapsed && (
            <span className={`text-xs font-mono ${textMuted} ${textHover} truncate`}>
              {resolvedTheme === 'dark'
                ? (i18n.language === 'pl' ? 'TRYB CIEMNY' : 'DARK MODE')
                : (i18n.language === 'pl' ? 'TRYB JASNY' : 'LIGHT MODE')}
            </span>
          )}
        </button>

        {/* Language Selector */}
        <div className="relative">
          <button
            onClick={() => setShowLangDropdown(!showLangDropdown)}
            className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} gap-3 w-full p-2 rounded-lg ${hoverBg} transition-all group`}
            title={isCollapsed ? `Language: ${currentLang.name}` : undefined}
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <Globe size={18} className={`${iconMuted} ${iconHover} transition-colors`} />
              </div>
              {!isCollapsed && (
                <span className={`text-xs font-mono ${textMuted} ${textHover} truncate`}>
                  <span className="mr-1.5">{currentLang.flag}</span>
                  <span className={`font-bold ${isLight ? 'text-emerald-700' : 'text-matrix-accent'}`}>{currentLang.code.toUpperCase()}</span>
                </span>
              )}
            </div>
            {!isCollapsed && (
              <ChevronDown size={14} className={`${textDim} transition-transform duration-200 ${showLangDropdown ? 'rotate-180' : ''}`} />
            )}
          </button>

          {/* Language Dropdown */}
          {showLangDropdown && (
            <div className={`absolute bottom-full left-0 right-0 mb-1 rounded-xl backdrop-blur-xl border overflow-hidden z-50 ${
              isLight
                ? 'bg-white/95 border-emerald-600/20 shadow-[0_8px_32px_rgba(0,0,0,0.15)]'
                : 'bg-black/90 border-matrix-accent/20 shadow-[0_8px_32px_rgba(0,0,0,0.6)]'
            }`}>
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => selectLanguage(lang.code)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs transition-all ${
                    i18n.language === lang.code
                      ? (isLight ? 'bg-emerald-500/15 text-emerald-800' : 'bg-matrix-accent/20 text-matrix-accent')
                      : `${textMuted} ${hoverBg} ${textHover}`
                  }`}
                >
                  <span className="text-base">{lang.flag}</span>
                  <span className="font-mono">{lang.name}</span>
                  {i18n.language === lang.code && (
                    <div className={`ml-auto w-1.5 h-1.5 rounded-full ${isLight ? 'bg-emerald-600 shadow-[0_0_6px_rgba(5,150,105,0.5)]' : 'bg-matrix-accent shadow-[0_0_6px_#00ff41]'}`} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Version */}
      {!isCollapsed && (
        <div className={`text-center text-[10px] py-2 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
          <span className={isLight ? 'text-emerald-700' : 'text-matrix-accent'}>GeminiHydra</span> v2.0.0 | Wolf Swarm
        </div>
      )}
    </div>
  );
}

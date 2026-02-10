import { useMemo } from 'react';
import { useTheme } from '../contexts/ThemeContext';

export interface ViewTheme {
  container: string;
  containerInner: string;
  glassPanel: string;
  glassPanelHover: string;
  header: string;
  headerTitle: string;
  headerSubtitle: string;
  headerIcon: string;
  title: string;
  subtitle: string;
  text: string;
  textMuted: string;
  textAccent: string;
  input: string;
  inputIcon: string;
  btnPrimary: string;
  btnSecondary: string;
  btnDanger: string;
  btnGhost: string;
  card: string;
  cardHover: string;
  listItem: string;
  listItemHover: string;
  badge: string;
  badgeAccent: string;
  border: string;
  divider: string;
  scrollbar: string;
  empty: string;
  loading: string;
  error: string;
  dropdown: string;
  dropdownItem: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  iconDefault: string;
  iconAccent: string;
  iconMuted: string;
  isLight: boolean;
}

export const useViewTheme = (): ViewTheme => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  return useMemo(() => ({
    isLight,

    container: isLight
      ? 'bg-[rgba(255,255,255,0.4)] backdrop-blur-xl'
      : 'bg-black/20 backdrop-blur-sm',
    containerInner: isLight
      ? 'bg-white/30'
      : 'bg-black/30',

    glassPanel: isLight
      ? 'bg-white/40 backdrop-blur-xl border border-white/20 shadow-lg'
      : 'bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl',
    glassPanelHover: isLight
      ? 'hover:bg-white/50 hover:border-emerald-500/30'
      : 'hover:bg-black/50 hover:border-matrix-accent/30',

    header: isLight
      ? 'bg-white/30 backdrop-blur-xl border-b border-white/20'
      : 'bg-black/30 backdrop-blur-xl border-b border-white/10',
    headerTitle: isLight
      ? 'text-slate-800 font-bold'
      : 'text-white font-bold',
    headerSubtitle: isLight
      ? 'text-slate-500'
      : 'text-slate-400',
    headerIcon: isLight
      ? 'text-emerald-600'
      : 'text-matrix-accent',

    title: isLight ? 'text-slate-800' : 'text-white',
    subtitle: isLight ? 'text-slate-600' : 'text-slate-300',
    text: isLight ? 'text-slate-700' : 'text-slate-200',
    textMuted: isLight ? 'text-slate-500' : 'text-slate-400',
    textAccent: isLight ? 'text-emerald-600' : 'text-matrix-accent',

    input: isLight
      ? 'bg-white/50 border border-slate-200/50 text-slate-800 placeholder:text-slate-400 focus:border-emerald-500/50 focus:bg-white/70 rounded-xl outline-none transition-all'
      : 'bg-black/30 border border-white/10 text-slate-200 placeholder:text-slate-500 focus:border-matrix-accent/50 focus:bg-black/50 rounded-xl outline-none transition-all',
    inputIcon: isLight
      ? 'text-slate-400'
      : 'text-slate-500',

    btnPrimary: isLight
      ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 border border-emerald-500/30 backdrop-blur-sm rounded-xl transition-all'
      : 'bg-matrix-accent/10 hover:bg-matrix-accent/20 text-matrix-accent border border-matrix-accent/30 backdrop-blur-sm rounded-xl transition-all',
    btnSecondary: isLight
      ? 'bg-white/30 hover:bg-white/50 text-slate-600 border border-slate-200/50 backdrop-blur-sm rounded-xl transition-all'
      : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 backdrop-blur-sm rounded-xl transition-all',
    btnDanger: isLight
      ? 'bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/20 backdrop-blur-sm rounded-xl transition-all'
      : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 backdrop-blur-sm rounded-xl transition-all',
    btnGhost: isLight
      ? 'hover:bg-slate-500/10 text-slate-600 rounded-xl transition-all'
      : 'hover:bg-white/5 text-slate-400 rounded-xl transition-all',

    card: isLight
      ? 'bg-white/40 backdrop-blur-sm border border-white/20 rounded-2xl shadow-md'
      : 'bg-black/40 backdrop-blur-sm border border-white/5 rounded-2xl shadow-lg',
    cardHover: isLight
      ? 'hover:bg-white/50 hover:border-emerald-500/30 hover:shadow-lg'
      : 'hover:bg-black/50 hover:border-matrix-accent/30 hover:shadow-xl',
    listItem: isLight
      ? 'bg-white/30 border border-white/10 rounded-xl'
      : 'bg-black/30 border border-white/5 rounded-xl',
    listItemHover: isLight
      ? 'hover:bg-white/50 hover:border-emerald-500/20'
      : 'hover:bg-black/40 hover:border-white/10',

    badge: isLight
      ? 'bg-slate-500/10 text-slate-600 border border-slate-200/50 rounded-md px-2 py-1 text-xs'
      : 'bg-white/5 text-slate-400 border border-white/10 rounded-md px-2 py-1 text-xs',
    badgeAccent: isLight
      ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-md px-2 py-1 text-xs'
      : 'bg-matrix-accent/10 text-matrix-accent border border-matrix-accent/20 rounded-md px-2 py-1 text-xs',

    border: isLight
      ? 'border-slate-200/50'
      : 'border-white/10',
    divider: isLight
      ? 'border-t border-slate-200/30'
      : 'border-t border-white/5',

    scrollbar: isLight
      ? 'scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent'
      : 'scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent',

    empty: isLight
      ? 'text-slate-400 italic'
      : 'text-slate-500 italic',
    loading: isLight
      ? 'text-emerald-600 animate-pulse'
      : 'text-matrix-accent animate-pulse',
    error: isLight
      ? 'text-red-600 bg-red-500/10 border border-red-500/20 rounded-xl p-4'
      : 'text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4',

    dropdown: isLight
      ? 'bg-white/95 backdrop-blur-xl border border-slate-200/50 rounded-xl shadow-xl'
      : 'bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl',
    dropdownItem: isLight
      ? 'hover:bg-emerald-500/10 text-slate-700 rounded-lg transition-all'
      : 'hover:bg-white/5 text-slate-300 rounded-lg transition-all',

    accentBg: isLight
      ? 'bg-emerald-500/10'
      : 'bg-matrix-accent/10',
    accentText: isLight
      ? 'text-emerald-600'
      : 'text-matrix-accent',
    accentBorder: isLight
      ? 'border-emerald-500/30'
      : 'border-matrix-accent/30',

    iconDefault: isLight ? 'text-slate-600' : 'text-slate-300',
    iconAccent: isLight ? 'text-emerald-600' : 'text-matrix-accent',
    iconMuted: isLight ? 'text-slate-400' : 'text-slate-500',
  }), [isLight]);
};

export default useViewTheme;

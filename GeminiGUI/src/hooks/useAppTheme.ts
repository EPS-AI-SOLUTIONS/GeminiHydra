/**
 * useAppTheme - Theme Management Hook (Adapter)
 * @module hooks/useAppTheme
 *
 * Backward-compatible adapter that delegates to ThemeContext.
 * Existing components using useAppTheme() continue to work unchanged.
 */

import { useTheme } from '../contexts/ThemeContext';

interface UseAppThemeReturn {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light' | 'system') => void;
  isDark: boolean;
}

/**
 * Hook for managing application theme.
 * Now delegates to ThemeContext (supports dark/light/system).
 *
 * @example
 * ```tsx
 * const { theme, toggleTheme, isDark } = useAppTheme();
 * ```
 */
export const useAppTheme = (): UseAppThemeReturn => {
  const { resolvedTheme, toggleTheme, setTheme } = useTheme();

  return {
    theme: resolvedTheme,
    toggleTheme,
    setTheme,
    isDark: resolvedTheme === 'dark',
  };
};

export default useAppTheme;

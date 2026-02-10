import { useTheme } from '../contexts/ThemeContext';

/**
 * Hook returning the appropriate glass panel class based on current theme.
 */
export const useGlassPanel = (): string => {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === 'light' ? 'glass-panel-light' : 'glass-panel-dark';
};

/**
 * Hook returning whether current theme is light mode.
 */
export const useIsLightTheme = (): boolean => {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === 'light';
};

/**
 * Hook returning the appropriate class based on current theme.
 */
export const useThemeClass = (lightClass: string, darkClass: string): string => {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === 'light' ? lightClass : darkClass;
};

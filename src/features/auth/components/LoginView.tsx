// GeminiHydra — LoginView wrapper (thin shell)
// Wraps @jaskier/hydra-app LoginView with app-specific defaults.

import { LoginView as SharedLoginView } from '@jaskier/hydra-app/features/auth';
import { useTheme } from '@/contexts/ThemeContext';
import { useViewStore } from '@/stores/viewStore';

function LoginView() {
  const { resolvedTheme } = useTheme();
  const setCurrentView = useViewStore((s) => s.setCurrentView);
  return (
    <SharedLoginView
      resolvedTheme={resolvedTheme as 'light' | 'dark'}
      onAuthenticated={() => setCurrentView('home')}
      appName="GeminiHydra"
    />
  );
}

LoginView.displayName = 'LoginView';
export default LoginView;
export { LoginView };

// @ts-nocheck
// GeminiHydra — useAuthGate wrapper (thin shell)
// Wraps @jaskier/hydra-app useAuthGate with local store hooks.

import { useAuthGate as _useAuthGate } from '@jaskier/hydra-app/shared/hooks';
import { useViewStore } from '@/stores/viewStore';

export function useAuthGate() {
  const currentView = useViewStore((s) => s.currentView);
  const setCurrentView = useViewStore((s) => s.setCurrentView);
  return _useAuthGate({ currentView, setCurrentView });
}

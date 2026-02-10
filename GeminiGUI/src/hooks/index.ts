/**
 * GeminiGUI - Custom Hooks
 * @module hooks
 *
 * Centralized export of all custom React hooks.
 */

export { useAppTheme } from './useAppTheme';
export { useStreamListeners } from './useStreamListeners';
export { useGeminiModels } from './useGeminiModels';
export type { UseGeminiModelsReturn } from './useGeminiModels';
export { useLlamaModels } from './useLlamaModels';
export type { UseLlamaModelsReturn } from './useLlamaModels';
export { useLlamaChat } from './useLlamaChat';
export type { UseLlamaChatOptions, UseLlamaChatReturn } from './useLlamaChat';
export { useEnvLoader } from './useEnvLoader';
export {
  useKeyboardListener,
  isHotkeyPressed,
  applyEventModifiers,
  DEFAULT_KEYBOARD_OPTIONS,
  KEY_MAP,
} from './useKeyboardListener';
export type { UseKeyboardOptions } from './useKeyboardListener';
export { useCopyToClipboard } from './useCopyToClipboard';
export { useAppKeyboardShortcuts } from './useAppKeyboardShortcuts';
export type { KeyboardShortcutHandlers } from './useAppKeyboardShortcuts';
export { useCommandExecution } from './useCommandExecution';
export type { UseCommandExecutionOptions, UseCommandExecutionReturn } from './useCommandExecution';
export { useContextMenuActions } from './useContextMenuActions';
export type { ContextAction, ContextActionDetail, UseContextMenuActionsOptions } from './useContextMenuActions';

// Tissaia design system hooks
export { useViewTheme } from './useViewTheme';
export type { ViewTheme } from './useViewTheme';
export { useGlassPanel, useIsLightTheme, useThemeClass } from './useThemeClass';

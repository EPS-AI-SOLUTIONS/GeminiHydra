/**
 * useEnvLoader - Environment Variables Loader
 * @module hooks/useEnvLoader
 *
 * Loads API keys and settings from .env file on startup.
 */

import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/useAppStore';
import { TAURI_COMMANDS } from '../constants';

interface UseEnvLoaderReturn {
  isLoaded: boolean;
  error: string | null;
}

/**
 * Hook for loading environment variables from .env
 *
 * @example
 * ```tsx
 * const { isLoaded, error } = useEnvLoader();
 * ```
 */
export const useEnvLoader = (): UseEnvLoaderReturn => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const geminiApiKey = useAppStore((state) => state.settings.geminiApiKey);
  const updateSettings = useAppStore((state) => state.updateSettings);

  useEffect(() => {
    const loadEnv = async () => {
      try {
        const env = await invoke<Record<string, string>>(
          TAURI_COMMANDS.GET_ENV_VARS
        ) || {};

        const newSettings: Record<string, string> = {};

        // Load Gemini API key if not already set
        if (!geminiApiKey && env.GEMINI_API_KEY) {
          newSettings.geminiApiKey = env.GEMINI_API_KEY;
          console.log('[useEnvLoader] Loaded GEMINI_API_KEY from .env');
        }

        // Load Google API key as fallback
        if (!geminiApiKey && !env.GEMINI_API_KEY && env.GOOGLE_API_KEY) {
          newSettings.geminiApiKey = env.GOOGLE_API_KEY;
          console.log('[useEnvLoader] Loaded GOOGLE_API_KEY as fallback');
        }

        // Apply loaded settings
        if (Object.keys(newSettings).length > 0) {
          updateSettings(newSettings);
        }

        setIsLoaded(true);
        setError(null);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.warn('[useEnvLoader] Failed to load .env:', errorMessage);
        setError(errorMessage);
        setIsLoaded(true); // Mark as loaded even on error
      }
    };

    loadEnv();
  }, [geminiApiKey, updateSettings]);

  return {
    isLoaded,
    error,
  };
};

export default useEnvLoader;

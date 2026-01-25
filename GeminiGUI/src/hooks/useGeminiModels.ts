/**
 * useGeminiModels - Gemini Model Fetching Hook
 * @module hooks/useGeminiModels
 *
 * Fetches available Gemini models from the API.
 * Falls back to default models if API key not set.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../store/useAppStore';
import { QUERY_KEYS, FALLBACK_MODELS, TAURI_COMMANDS } from '../constants';

interface UseGeminiModelsReturn {
  models: string[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  hasApiKey: boolean;
}

/**
 * Hook for fetching Gemini models
 *
 * @example
 * ```tsx
 * const { models, isLoading, error } = useGeminiModels();
 * ```
 */
export const useGeminiModels = (): UseGeminiModelsReturn => {
  const geminiApiKey = useAppStore((state) => state.settings.geminiApiKey);

  const {
    data: models,
    isPending: isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [QUERY_KEYS.GEMINI_MODELS, geminiApiKey],
    queryFn: async (): Promise<string[]> => {
      console.log('[useGeminiModels] Fetching models...');

      // No API key - return fallback models
      if (!geminiApiKey) {
        console.warn('[useGeminiModels] No API key - using fallback models');
        return [...FALLBACK_MODELS.gemini];
      }

      try {
        const fetchedModels = await invoke<string[]>(
          TAURI_COMMANDS.GET_GEMINI_MODELS,
          { apiKey: geminiApiKey }
        );

        console.log('[useGeminiModels] Models loaded:', fetchedModels);

        if (fetchedModels && fetchedModels.length > 0) {
          return fetchedModels;
        }

        return [...FALLBACK_MODELS.gemini];
      } catch (error) {
        console.error('[useGeminiModels] Failed to fetch:', error);
        return [...FALLBACK_MODELS.gemini];
      }
    },
    enabled: true,
    retry: 1,
    staleTime: Infinity, // Keep data fresh forever unless manually invalidated
    refetchOnMount: false, // Don't refetch on every mount
    refetchOnWindowFocus: false,
  });

  const finalModels = useMemo(() => models ?? [...FALLBACK_MODELS.gemini], [models]);

  return {
    models: finalModels,
    isLoading,
    error: error as Error | null,
    refetch,
    hasApiKey: !!geminiApiKey,
  };
};

export default useGeminiModels;

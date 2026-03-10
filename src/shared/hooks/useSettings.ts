// Re-export from feature-local hooks + add mutation (Jaskier Shared Pattern)
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPost } from '@/shared/api/client';
import type { Settings } from '@/shared/api/schemas';

export { useSettingsQuery } from '@/features/settings/hooks/useSettings';

export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<Settings>) => apiPost<Settings>('/api/settings', settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

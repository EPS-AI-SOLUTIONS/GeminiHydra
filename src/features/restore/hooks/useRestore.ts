// src/features/restore/hooks/useRestore.ts
/**
 * TanStack Query mutation for photo restoration.
 */

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiPost } from '@/shared/api/client';
import type { RestoreResponse } from '@/shared/api/schemas';

interface RestoreRequest {
  image_base64: string;
  mime_type: string;
  mode: string;
  file_name?: string;
  crop_count?: number;
  target_ratio?: string;
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export function useRestoreMutation() {
  return useMutation({
    mutationFn: (data: RestoreRequest) => apiPost<RestoreResponse>('/api/restore', data),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Operation failed');
    },
  });
}

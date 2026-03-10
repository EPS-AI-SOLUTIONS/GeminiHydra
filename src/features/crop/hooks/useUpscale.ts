// src/features/crop/hooks/useUpscale.ts
/**
 * TanStack Query mutation for ONNX super-resolution upscaling.
 */

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiPost } from '@/shared/api/client';
import type { UpscaleResponse } from '@/shared/api/schemas';

interface UpscaleRequest {
  image_base64: string;
  mime_type: string;
  scale?: number;
}

export function useUpscaleMutation() {
  return useMutation({
    mutationFn: (data: UpscaleRequest) => apiPost<UpscaleResponse>('/api/upscale', data),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Upscale failed');
    },
  });
}

// src/features/crop/hooks/useCrop.ts
/**
 * TanStack Query mutation for image cropping.
 */

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiPost } from '@/shared/api/client';

interface CropResponse {
  crops: Array<{
    index: number;
    cropped_base64: string;
    width: number;
    height: number;
  }>;
}

interface CropRequest {
  image_base64: string;
  mime_type: string;
  bounding_boxes: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation_angle: number;
  }[];
}

export function useCropMutation() {
  return useMutation({
    mutationFn: (data: CropRequest) => apiPost<CropResponse>('/api/crop', data),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Operation failed');
    },
  });
}

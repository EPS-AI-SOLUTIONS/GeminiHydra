// src/features/crop/utils/batchRestoreGrid.ts
/**
 * Call /api/restore/batch-stream SSE endpoint for up to 4 crops at once.
 * Returns an array of { index, restored_base64, provider_used, processing_time_ms, thumbnail_base64 }.
 */

export interface BatchCropInput {
  image_base64: string;
  mime_type: string;
  file_name: string;
  width: number;
  height: number;
}

export interface BatchCropResult {
  index: number;
  restored_base64: string;
  provider_used: string;
  processing_time_ms: number;
  thumbnail_base64?: string | null;
  safety_fallback?: boolean | null;
}

export async function batchRestoreGrid(crops: BatchCropInput[], totalCropCount: number): Promise<BatchCropResult[]> {
  const { createSSEStream } = await import('@/shared/api/sseClient');

  return new Promise((resolve, reject) => {
    const results: BatchCropResult[] = [];

    createSSEStream({
      path: '/api/restore/batch-stream',
      body: {
        crops: crops.map((c) => ({
          image_base64: c.image_base64,
          mime_type: c.mime_type,
          file_name: c.file_name,
          width: c.width,
          height: c.height,
        })),
        total_crop_count: totalCropCount,
      },
      onComplete: () => {},
      onEvent: (event: any) => {
        if (event.event === 'complete') {
          const data = event.data as { results?: BatchCropResult[] };
          if (data.results) {
            resolve(data.results);
          } else {
            resolve(results);
          }
        } else if (event.event === 'error') {
          const data = event.data as { error?: string };
          reject(new Error(data.error ?? 'Batch restore failed'));
        } else if (event.event === 'progress') {
          const data = event.data as { step?: string; result?: BatchCropResult };
          if (data.result) {
            results.push(data.result);
          }
        }
      },
      onError: (err: any) => reject(err),
    });
  });
}

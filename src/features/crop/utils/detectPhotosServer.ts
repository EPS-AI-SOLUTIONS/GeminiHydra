// src/features/crop/utils/detectPhotosServer.ts
/**
 * Server-side photo detection via YOLO OBB (multipart upload).
 * Falls back to client-side classical CV if backend is unavailable.
 */

import { apiPostFormData } from '@/shared/api/client';
import { resizeFileIfNeeded } from '@/shared/utils/imageResize';
import type { BoundingBox } from '../stores/cropStore';
import { detectPhotosInScan } from './detectPhotos';

interface DetectionResult {
  id: string;
  photo_count: number;
  bounding_boxes: ServerBoundingBox[];
  provider_used: string;
}

interface ServerBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  label: string | null;
  rotation_angle: number;
}

/**
 * Detect photos using backend YOLO OBB model via multipart upload.
 * Falls back to client-side detection on failure.
 */
export async function detectPhotos(
  file: File,
  previewUrl: string,
  expectedCount?: number,
): Promise<{ boxes: BoundingBox[]; provider: string }> {
  try {
    // Resize before upload to reduce payload for large scans
    // 2000px is more than enough for Gemini 1.5 Flash detection
    const { file: uploadFile, wasResized } = await resizeFileIfNeeded(file, 2000);
    if (wasResized) {
      console.info(
        `[detectPhotos] Resized ${file.name} for upload: ${(uploadFile.size / 1024).toFixed(0)}KB (was ${(file.size / 1024).toFixed(0)}KB)`,
      );
    }

    const formData = new FormData();
    formData.append('file', uploadFile, uploadFile.name);

    const result = await apiPostFormData<DetectionResult>('/api/detect/upload', formData);

    const boxes: BoundingBox[] = result.bounding_boxes.map((b, i) => ({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      confidence: b.confidence,
      label: b.label ?? `photo ${i + 1}`,
      rotation_angle: b.rotation_angle,
      contour: [],
      needs_outpaint: false,
    }));

    return { boxes, provider: result.provider_used };
  } catch (err: any) {
    const errorString = String(err?.message || err);
    if (errorString.includes('No active Google OAuth session found')) {
      if (window.confirm('Brak aktywnej sesji Google OAuth. Czy chcesz zalogować się teraz?')) {
        fetch('http://localhost:8080/api/auth/login', { method: 'POST' })
          .then((res) => res.json())
          .then((data) => {
            if (data.auth_url) window.location.href = data.auth_url;
          })
          .catch((e) => console.error('OAuth init failed:', e));
        throw new Error('Przekierowywanie do Google...');
      }
    }
    console.warn('[detectPhotos] Server detection failed, falling back to client-side:', err);
    const boxes = await detectPhotosInScan(previewUrl, expectedCount);
    return { boxes, provider: 'client_cv' };
  }
}

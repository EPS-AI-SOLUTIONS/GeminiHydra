// src/shared/utils/imageResize.ts
/**
 * Client-side Image Compression
 * ==============================
 * Resizes images that exceed a maximum dimension before sending to the API.
 * Uses canvas-based resize to maintain aspect ratio.
 * Max dimension: 4000px (configurable).
 */

const DEFAULT_MAX_DIMENSION = 4000;
const DEFAULT_QUALITY = 0.92;

/**
 * Resize an image if it exceeds the max dimension threshold.
 * Returns the original base64 if no resize is needed.
 *
 * @param base64DataUrl - Full data URL (data:image/...;base64,...)
 * @param maxDimension - Maximum width or height in pixels (default 4000)
 * @param quality - JPEG/WebP quality 0-1 (default 0.92)
 * @returns Resized data URL, or the original if already within bounds
 */
export async function resizeImageIfNeeded(
  base64DataUrl: string,
  maxDimension = DEFAULT_MAX_DIMENSION,
  quality = DEFAULT_QUALITY,
): Promise<string> {
  const img = await loadImage(base64DataUrl);

  // No resize needed if both dimensions are within the threshold
  if (img.naturalWidth <= maxDimension && img.naturalHeight <= maxDimension) {
    return base64DataUrl;
  }

  // Calculate scaled dimensions preserving aspect ratio
  const scale = maxDimension / Math.max(img.naturalWidth, img.naturalHeight);
  const newWidth = Math.round(img.naturalWidth * scale);
  const newHeight = Math.round(img.naturalHeight * scale);

  // Draw on canvas at new size
  const canvas = document.createElement('canvas');
  canvas.width = newWidth;
  canvas.height = newHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Use high-quality image smoothing for downscale
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, newWidth, newHeight);

  // Extract MIME type from original data URL
  const mimeMatch = base64DataUrl.match(/^data:(image\/[^;]+);/);
  const mimeType = mimeMatch?.[1] ?? 'image/jpeg';

  // Convert to data URL — use quality param for lossy formats
  const outputMime = mimeType === 'image/png' ? 'image/png' : mimeType;
  return canvas.toDataURL(outputMime, quality);
}

/**
 * Resize a File object if it exceeds the max dimension threshold.
 * Returns a new File with resized content, or the original File if no resize needed.
 */
export async function resizeFileIfNeeded(
  file: File,
  maxDimension = DEFAULT_MAX_DIMENSION,
  quality = DEFAULT_QUALITY,
): Promise<{ file: File; wasResized: boolean }> {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);

  if (img.naturalWidth <= maxDimension && img.naturalHeight <= maxDimension) {
    return { file, wasResized: false };
  }

  const resizedDataUrl = await resizeImageIfNeeded(dataUrl, maxDimension, quality);
  const resizedBlob = dataUrlToBlob(resizedDataUrl);
  const resizedFile = new File([resizedBlob], file.name, { type: file.type, lastModified: Date.now() });

  return { file: resizedFile, wasResized: true };
}

// ============================================
// UPSCALE TO MATCH (for before/after comparison)
// ============================================

/**
 * Upscale an image (data URL or blob URL) to match a target image's dimensions.
 * Used to ensure the "original" in before/after comparisons has the same pixel
 * dimensions as the "restored" image, preventing browser upscaling blur.
 *
 * Uses canvas with high-quality image smoothing (browser bicubic).
 * Returns the original src unchanged if it's already >= target dimensions.
 *
 * @param originalSrc - data URL or blob URL of the original image
 * @param targetWidth - target pixel width to match
 * @param targetHeight - target pixel height to match
 * @param quality - JPEG quality 0-1 (default 0.92)
 * @returns data URL of the upscaled image, or original if no upscale needed
 */
export async function upscaleToMatch(
  originalSrc: string,
  targetWidth: number,
  targetHeight: number,
  quality = DEFAULT_QUALITY,
): Promise<string> {
  const img = await loadImage(originalSrc);

  // No upscale needed if original is already at or above target dimensions
  if (img.naturalWidth >= targetWidth && img.naturalHeight >= targetHeight) {
    return originalSrc;
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return originalSrc;

  // Use high-quality smoothing for upscale
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Detect MIME from src
  const mimeMatch = originalSrc.match(/^data:(image\/[^;]+);/);
  const mimeType = mimeMatch?.[1] ?? 'image/jpeg';

  return canvas.toDataURL(mimeType, quality);
}

/**
 * Get the natural dimensions of an image from a data URL or blob URL.
 */
export function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to load image for dimension check'));
    img.src = src;
  });
}

/**
 * Upscale the "before" image to match the "after" image's dimensions.
 * Convenience wrapper that loads the target image to get dimensions, then upscales.
 *
 * @param originalSrc - data URL of the original (before) image
 * @param restoredSrc - data URL of the restored (after) image
 * @returns data URL of the upscaled original
 */
export async function upscaleOriginalToMatchRestored(originalSrc: string, restoredSrc: string): Promise<string> {
  try {
    const { width, height } = await getImageDimensions(restoredSrc);
    return upscaleToMatch(originalSrc, width, height);
  } catch {
    // If anything fails, return the original unchanged
    return originalSrc;
  }
}

// ============================================
// INTERNAL HELPERS
// ============================================

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for resize'));
    img.src = src;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader did not return a string'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const splitIndex = dataUrl.indexOf(',');
  if (splitIndex === -1) throw new Error('Invalid data URL');
  const header = dataUrl.slice(0, splitIndex);
  const base64 = dataUrl.slice(splitIndex + 1);
  const mimeMatch = header.match(/data:(.*?);/);
  const mime = mimeMatch?.[1] ?? 'image/jpeg';
  const byteString = atob(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

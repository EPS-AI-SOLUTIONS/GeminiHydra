/**
 * Shared Image Utilities
 * ======================
 * Common helper functions for image loading and manipulation.
 */

/**
 * Load an image from a source URL.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

/**
 * Calculate scaled dimensions to fit within max dimensions while preserving aspect ratio.
 */
function getScaledDimensions(
  width: number,
  height: number,
  maxDim: number,
): { width: number; height: number; scale: number } {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    scale,
  };
}

/**
 * Create a canvas with the image drawn on it, optionally scaled.
 */
export async function creatingImageCanvas(
  source: string | HTMLImageElement,
  maxDim?: number,
): Promise<{ canvas: HTMLCanvasElement; width: number; height: number; scale: number }> {
  const img = typeof source === 'string' ? await loadImage(source) : source;

  const { width, height, scale } = maxDim
    ? getScaledDimensions(img.width, img.height, maxDim)
    : { width: img.width, height: img.height, scale: 1 };

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.drawImage(img, 0, 0, width, height);

  return { canvas, width, height, scale };
}

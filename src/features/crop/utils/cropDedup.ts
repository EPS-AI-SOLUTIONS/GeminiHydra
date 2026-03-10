/**
 * Crop Deduplication Utility
 * ==========================
 * Detects near-duplicate crops across DIFFERENT source photos in a batch.
 * Uses a canvas-based perceptual fingerprint: aspect ratio + downsampled average color grid.
 *
 * Two crops from the SAME source photo are never considered duplicates
 * (same-scan duplicates are a separate concern handled by detection).
 */

/** Fingerprint for a single crop — aspect ratio + color grid hash. */
interface CropFingerprint {
  aspectRatio: number;
  /** 4x4 grid of average RGB values (48 numbers total). */
  colorGrid: number[];
}

/** Minimum crop info needed for dedup comparison. */
export interface DedupCropInfo {
  /** Index of the source photo this crop came from. */
  photoIndex: number;
  /** Base64-encoded image data (no data: prefix). */
  cropped_base64: string;
  /** Pixel width of the crop. */
  width: number;
  /** Pixel height of the crop. */
  height: number;
}

/** Result of dedup filtering. */
export interface DedupResult<T extends DedupCropInfo> {
  /** Crops that passed dedup (unique). */
  kept: T[];
  /** Crops that were identified as duplicates and removed. */
  removed: Array<{ crop: T; duplicateOf: T }>;
}

/** Aspect ratio tolerance: 5% relative difference. */
const ASPECT_RATIO_TOLERANCE = 0.05;

/** Color grid distance threshold (Euclidean per channel, 0-255 scale). */
const COLOR_DISTANCE_THRESHOLD = 25;

/** Grid resolution for fingerprint (NxN). */
const GRID_SIZE = 4;

/**
 * Compute a perceptual fingerprint from a base64 crop image.
 * Draws to an offscreen canvas, then samples a NxN grid of average colors.
 */
async function computeFingerprint(base64: string, width: number, height: number): Promise<CropFingerprint> {
  const aspectRatio = width / height;

  // Draw image onto a small canvas for color sampling
  const canvas = document.createElement('canvas');
  const sampleSize = GRID_SIZE * 4; // 16x16 pixels — enough for 4x4 grid averaging
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    // Fallback: return aspect ratio only, with empty color grid
    return { aspectRatio, colorGrid: [] };
  }

  const img = await loadImageFromBase64(base64);
  ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
  const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
  const pixels = imageData.data;

  // Compute NxN grid of average colors
  const cellW = Math.floor(sampleSize / GRID_SIZE);
  const cellH = Math.floor(sampleSize / GRID_SIZE);
  const colorGrid: number[] = [];

  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      let rSum = 0,
        gSum = 0,
        bSum = 0,
        count = 0;
      for (let py = gy * cellH; py < (gy + 1) * cellH; py++) {
        for (let px = gx * cellW; px < (gx + 1) * cellW; px++) {
          const idx = (py * sampleSize + px) * 4;
          rSum += pixels[idx] ?? 0;
          gSum += pixels[idx + 1] ?? 0;
          bSum += pixels[idx + 2] ?? 0;
          count++;
        }
      }
      colorGrid.push(Math.round(rSum / count), Math.round(gSum / count), Math.round(bSum / count));
    }
  }

  return { aspectRatio, colorGrid };
}

/** Load an HTMLImageElement from raw base64 (without data: prefix). */
function loadImageFromBase64(base64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load crop image for dedup'));
    // Auto-detect mime from base64 header or default to jpeg
    const mime = base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png';
    img.src = `data:${mime};base64,${base64}`;
  });
}

/**
 * Check if two fingerprints represent the same physical photograph.
 * Requires BOTH aspect ratio similarity AND color grid similarity.
 */
function areSimilar(a: CropFingerprint, b: CropFingerprint): boolean {
  // Check aspect ratio within tolerance
  const ratioDiff = Math.abs(a.aspectRatio - b.aspectRatio) / Math.max(a.aspectRatio, b.aspectRatio);
  if (ratioDiff > ASPECT_RATIO_TOLERANCE) return false;

  // If either fingerprint has no color data (canvas failed), use only aspect ratio
  if (a.colorGrid.length === 0 || b.colorGrid.length === 0) return false;

  // Compute mean Euclidean distance across grid cells
  const cells = GRID_SIZE * GRID_SIZE;
  let totalDist = 0;
  for (let i = 0; i < cells; i++) {
    const rDiff = (a.colorGrid[i * 3] ?? 0) - (b.colorGrid[i * 3] ?? 0);
    const gDiff = (a.colorGrid[i * 3 + 1] ?? 0) - (b.colorGrid[i * 3 + 1] ?? 0);
    const bDiff = (a.colorGrid[i * 3 + 2] ?? 0) - (b.colorGrid[i * 3 + 2] ?? 0);
    totalDist += Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
  }
  const avgDist = totalDist / cells;

  return avgDist < COLOR_DISTANCE_THRESHOLD;
}

/**
 * Deduplicate crops across different source photos.
 *
 * For each crop, computes a perceptual fingerprint. Then compares all pairs
 * from DIFFERENT source photos. If a match is found, the later crop (higher
 * globalIndex) is marked as a duplicate and removed.
 *
 * Crops from the SAME source photo are never compared.
 */
export async function deduplicateCrops<T extends DedupCropInfo>(crops: T[]): Promise<DedupResult<T>> {
  if (crops.length <= 1) {
    return { kept: [...crops], removed: [] };
  }

  // Check if all crops come from the same photo — skip dedup entirely
  const uniquePhotos = new Set(crops.map((c) => c.photoIndex));
  if (uniquePhotos.size <= 1) {
    return { kept: [...crops], removed: [] };
  }

  // Compute fingerprints in parallel
  const fingerprints = await Promise.all(crops.map((c) => computeFingerprint(c.cropped_base64, c.width, c.height)));

  const removedIndices = new Set<number>();
  const removed: Array<{ crop: T; duplicateOf: T }> = [];

  // Compare all pairs from different photos
  for (let i = 0; i < crops.length; i++) {
    if (removedIndices.has(i)) continue;

    for (let j = i + 1; j < crops.length; j++) {
      if (removedIndices.has(j)) continue;

      // Only compare crops from DIFFERENT source photos
      if (crops[i]?.photoIndex === crops[j]?.photoIndex) continue;

      // biome-ignore lint/style/noNonNullAssertion: parallel array, same bounds as crops loop
      if (areSimilar(fingerprints[i]!, fingerprints[j]!)) {
        removedIndices.add(j);
        // biome-ignore lint/style/noNonNullAssertion: loop-bounded array access
        removed.push({ crop: crops[j]!, duplicateOf: crops[i]! });
      }
    }
  }

  const kept = crops.filter((_, idx) => !removedIndices.has(idx));
  return { kept, removed };
}

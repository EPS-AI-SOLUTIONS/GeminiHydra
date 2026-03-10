// src/features/crop/utils/detectPhotos.ts
/**
 * Client-side photo detection for scanned images.
 * Uses a multi-step approach:
 *   1. Detect scanner bed color via histogram bright peak (not border pixels,
 *      which pick up scanner frame shadow instead of the actual bed color).
 *   2. Create photo region mask using brightness threshold relative to scanner bed.
 *   3. Morphological CLOSE (small radius) to fill internal holes in photos.
 *   4. Morphological OPEN (larger radius) to break narrow bridges between
 *      adjacent photos that the close may have connected.
 *   5. Connected component labeling + size filtering + split large boxes.
 *
 * Returns BoundingBox[] in normalized 0-1000 coordinate space.
 */

import { creatingImageCanvas } from '@/shared/utils/imageUtils';
import type { BoundingBox } from '../stores/cropStore';

// Typed-array index helper — all accesses are bounds-checked by loops
function at(arr: Uint8Array | Uint8ClampedArray | Int32Array | Float64Array, i: number): number {
  return arr[i] as number;
}

// ============================================
// PUBLIC API
// ============================================

export async function detectPhotosInScan(imageUrl: string, expectedCount?: number): Promise<BoundingBox[]> {
  // Higher working resolution for better gap detection
  const { canvas, width: w, height: h } = await creatingImageCanvas(imageUrl, 1200);
  const ctx = canvas.getContext('2d')!;

  const { data } = ctx.getImageData(0, 0, w, h);

  // 1. Detect scanner background: use histogram bright peak (scanner bed)
  //    with border sampling as fallback. Border pixels often pick up scanner
  //    frame shadow (~180) instead of the actual bed color (~245).
  const bg = detectScannerBackground(data, w, h);

  // 2. Create photo region mask using brightness threshold from scanner bed.
  const mask = createPhotoRegionMask(data, w, h, bg);

  // 3. Morphological CLOSE (small radius) — fills tiny internal holes
  //    within each photo (scratches, bright spots in B&W content).
  const minDim = Math.min(w, h);
  const closeRadius = Math.max(2, Math.min(4, Math.round(minDim * 0.004)));
  let processed = dilateFast(mask, w, h, closeRadius);
  processed = erodeFast(processed, w, h, closeRadius);

  // 4. Morphological OPEN (larger radius) — breaks narrow bridges between
  //    adjacent photos that the close may have connected.
  //    Only structures wider than 2*openRadius survive the erosion step.
  const openRadius = Math.max(3, Math.min(8, Math.round(minDim * 0.006)));
  processed = erodeFast(processed, w, h, openRadius);
  processed = dilateFast(processed, w, h, openRadius);

  // 5. Connected component labeling
  const { labels, count } = labelComponents(processed, w, h);

  // 6. Extract and filter bounding boxes
  const rawBoxes = extractBoxes(labels, count, w, h);
  const imgArea = w * h;

  const sizeFiltered = rawBoxes.filter((b) => {
    const area = b.bw * b.bh;
    const boxMinDim = Math.min(b.bw, b.bh);
    const aspectRatio = Math.max(b.bw, b.bh) / Math.max(1, boxMinDim);
    // Photo must be: ≥0.4% of image area, min dimension ≥3% of shorter side,
    // and aspect ratio ≤5:1 (reject thin slivers from morphological artifacts)
    return area >= imgArea * 0.004 && boxMinDim >= minDim * 0.03 && aspectRatio <= 5;
  });

  // 5a. Merge fragments of the same photo that got split by internal bright bands.
  //     Only merge if boxes share >40% overlap in one axis (same photo row/column)
  //     AND are close in the other axis.
  const merged = mergePhotoFragments(sizeFiltered, w, h);

  // 5b. Split large boxes that contain multiple photos side-by-side or stacked.
  //     Uses projection profiles to find internal white gaps.
  //     Very aggressive thresholds: 8% area OR 40% width OR 30% height
  //     to catch any box that might contain multiple photos.
  // Helper: check if a split sub-box is a valid photo (not a sliver artifact)
  const isValidSubBox = (sb: RawBox, parent: RawBox): boolean => {
    const isTooNarrow = sb.bw < parent.bw * 0.08;
    const isTooShort = sb.bh < parent.bh * 0.08;
    const sbMinDim = Math.min(sb.bw, sb.bh);
    const sbAspect = Math.max(sb.bw, sb.bh) / Math.max(1, sbMinDim);
    return (
      !isTooNarrow && !isTooShort && sb.bw * sb.bh >= imgArea * 0.003 && sbMinDim >= minDim * 0.02 && sbAspect <= 5
    );
  };

  const splitAreaThreshold = imgArea * 0.08;
  const filtered: RawBox[] = [];
  for (const box of merged) {
    const area = box.bw * box.bh;
    const isWide = box.bw > w * 0.4;
    const isTall = box.bh > h * 0.3;
    if (area > splitAreaThreshold || isWide || isTall) {
      const splits = splitLargeBox(box, mask, w, h);
      if (splits.length > 1) {
        for (const sb of splits) {
          if (isValidSubBox(sb, box)) filtered.push(sb);
        }
      } else {
        filtered.push(box);
      }
    } else {
      filtered.push(box);
    }
  }

  // 5c. Second-pass split: check if any remaining boxes are still too large
  //     (catches cases where first split only split one axis)
  const secondPass: RawBox[] = [];
  for (const box of filtered) {
    const area = box.bw * box.bh;
    const isStillWide = box.bw > w * 0.4;
    const isStillTall = box.bh > h * 0.25;
    if (area > splitAreaThreshold && (isStillWide || isStillTall)) {
      const splits = splitLargeBox(box, mask, w, h);
      if (splits.length > 1) {
        for (const sb of splits) {
          if (isValidSubBox(sb, box)) secondPass.push(sb);
        }
      } else {
        secondPass.push(box);
      }
    } else {
      secondPass.push(box);
    }
  }

  // 6. Final cleanup: remove residual slivers that survived split filtering.
  //    Uses stricter criteria than split sub-box filter (absolute thresholds).
  const finalBoxes = secondPass.filter((b) => {
    const bMinDim = Math.min(b.bw, b.bh);
    const bAspect = Math.max(b.bw, b.bh) / Math.max(1, bMinDim);
    // Minimum 3.5% of shorter image side AND aspect ratio ≤ 4:1
    return bMinDim >= minDim * 0.035 && bAspect <= 4;
  });

  // 7. Adjust to expected photo count if specified
  if (expectedCount != null && expectedCount > 0 && finalBoxes.length !== expectedCount) {
    adjustToExpectedCount(finalBoxes, expectedCount, mask, w, h, imgArea, minDim);
  }

  // 8. Sort: top-to-bottom rows, then left-to-right
  const rowHeight = h * 0.08;
  finalBoxes.sort((a, b) => {
    const rowA = Math.floor(a.by / rowHeight);
    const rowB = Math.floor(b.by / rowHeight);
    if (rowA !== rowB) return rowA - rowB;
    return a.bx - b.bx;
  });

  // 9. Convert to 0-1000 normalized space
  return finalBoxes.map((b, i) => ({
    x: Math.round((b.bx / w) * 1000),
    y: Math.round((b.by / h) * 1000),
    width: Math.round((b.bw / w) * 1000),
    height: Math.round((b.bh / h) * 1000),
    confidence: Math.max(0.7, 0.95 - i * 0.02),
    label: `photo ${i + 1}`,
    rotation_angle: 0,
    contour: [],
    needs_outpaint: false,
  }));
}

// ============================================
// BACKGROUND DETECTION
// ============================================

interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Detect the scanner background (bed) color using histogram analysis.
 * Border pixel sampling is unreliable because scanner frames often produce
 * dark shadows (~180 brightness) that don't represent the actual bed color
 * (~245 brightness). The histogram bright peak is much more reliable.
 *
 * Falls back to border sampling if no clear bright peak exists
 * (e.g., a single photo filling the entire scan).
 */
function detectScannerBackground(data: Uint8ClampedArray, w: number, h: number): RGB {
  // Build brightness histogram
  const totalPixels = w * h;
  const hist = new Int32Array(256);
  for (let i = 0; i < totalPixels; i++) {
    const pi = i * 4;
    const bin = Math.round((at(data, pi) + at(data, pi + 1) + at(data, pi + 2)) / 3);
    hist[bin] = at(hist, bin) + 1;
  }

  // Find the bright peak in 220-255 range (scanner bed)
  let peakBright = 240;
  let peakVal = 0;
  for (let i = 220; i < 256; i++) {
    if (at(hist, i) > peakVal) {
      peakVal = at(hist, i);
      peakBright = i;
    }
  }

  // If bright peak is significant (>1% of pixels), use it
  if (peakVal > totalPixels * 0.01) {
    // Average the RGB of pixels near the bright peak for accurate color
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;
    for (let i = 0; i < totalPixels; i++) {
      const pi = i * 4;
      const brightness = (at(data, pi) + at(data, pi + 1) + at(data, pi + 2)) / 3;
      if (brightness >= peakBright - 5 && brightness <= peakBright + 5) {
        rSum += at(data, pi);
        gSum += at(data, pi + 1);
        bSum += at(data, pi + 2);
        count++;
      }
    }
    if (count > 0) {
      return { r: rSum / count, g: gSum / count, b: bSum / count };
    }
  }

  // Fallback: border pixel sampling (original approach)
  return sampleBorderColor(data, w, h);
}

function sampleBorderColor(data: Uint8ClampedArray, w: number, h: number): RGB {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  const addPixel = (i: number) => {
    rSum += at(data, i);
    gSum += at(data, i + 1);
    bSum += at(data, i + 2);
    count++;
  };

  for (let x = 0; x < w; x += 2) {
    for (const y of [0, 1, h - 2, h - 1]) {
      addPixel((y * w + x) * 4);
    }
  }
  for (let y = 0; y < h; y += 2) {
    for (const x of [0, 1, w - 2, w - 1]) {
      addPixel((y * w + x) * 4);
    }
  }

  return { r: rSum / count, g: gSum / count, b: bSum / count };
}

// ============================================
// PHOTO REGION MASK
// ============================================

/**
 * Creates a mask of photo content using brightness threshold relative to
 * the detected scanner background. Uses scanner bed brightness (not border)
 * so the cutoff correctly separates photos from the inter-photo gaps.
 *
 * Color distance is a secondary signal for yellowed/tinted photo content
 * that might be bright but differs in hue from the neutral scanner bed.
 */
function createPhotoRegionMask(data: Uint8ClampedArray, w: number, h: number, bg: RGB): Uint8Array {
  const mask = new Uint8Array(w * h);

  const bgBrightness = (bg.r + bg.g + bg.b) / 3;

  // Scanner edge margin: zero out ~1.5% on each edge to remove scanner shadow
  const marginX = Math.max(4, Math.round(w * 0.015));
  const marginY = Math.max(4, Math.round(h * 0.015));

  // Brightness cutoff relative to scanner bed.
  // margin of 25 gives clean separation: scanner bed noise (±10) stays out,
  // while photo content (even light gray areas) is captured.
  const brightCutoff = bgBrightness - 25;

  // Color distance catches yellowed/tinted photo content that might be bright
  // but differs in color from the neutral scanner bed.
  const colorDistThreshold = 40;

  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = (i - x) / w;

    if (x < marginX || x >= w - marginX || y < marginY || y >= h - marginY) {
      continue;
    }

    const pi = i * 4;
    const r = at(data, pi);
    const g = at(data, pi + 1);
    const b = at(data, pi + 2);
    const brightness = (r + g + b) / 3;

    if (brightness < brightCutoff) {
      mask[i] = 1;
      continue;
    }

    const dr = r - bg.r;
    const dg = g - bg.g;
    const db = b - bg.b;
    const colorDist = Math.sqrt(dr * dr + dg * dg + db * db);
    mask[i] = colorDist > colorDistThreshold ? 1 : 0;
  }

  return mask;
}

// ============================================
// MORPHOLOGICAL OPERATIONS (separable box filter)
// ============================================

function dilateFast(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const hPass = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) {
      sum += at(mask, y * w + x);
    }
    for (let x = 0; x < w; x++) {
      hPass[y * w + x] = sum > 0 ? 1 : 0;
      const addX = x + r + 1;
      if (addX < w) sum += at(mask, y * w + addX);
      const remX = x - r;
      if (remX >= 0) sum -= at(mask, y * w + remX);
    }
  }

  const result = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) {
      sum += at(hPass, y * w + x);
    }
    for (let y = 0; y < h; y++) {
      result[y * w + x] = sum > 0 ? 1 : 0;
      const addY = y + r + 1;
      if (addY < h) sum += at(hPass, addY * w + x);
      const remY = y - r;
      if (remY >= 0) sum -= at(hPass, remY * w + x);
    }
  }

  return result;
}

function erodeFast(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inv[i] = at(mask, i) ? 0 : 1;
  const dilated = dilateFast(inv, w, h, r);
  const result = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) result[i] = at(dilated, i) ? 0 : 1;
  return result;
}

// ============================================
// CONNECTED COMPONENT LABELING (flood fill)
// ============================================

function labelComponents(mask: Uint8Array, w: number, h: number): { labels: Int32Array; count: number } {
  const labels = new Int32Array(w * h).fill(-1);
  let label = 0;
  const stack: number[] = [];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (at(mask, idx) === 0 || at(labels, idx) >= 0) continue;

      labels[idx] = label;
      stack.push(idx);

      while (stack.length > 0) {
        const ci = stack.pop()!;
        const cx = ci % w;
        const cy = (ci - cx) / w;

        if (cx > 0 && at(mask, ci - 1) && at(labels, ci - 1) < 0) {
          labels[ci - 1] = label;
          stack.push(ci - 1);
        }
        if (cx < w - 1 && at(mask, ci + 1) && at(labels, ci + 1) < 0) {
          labels[ci + 1] = label;
          stack.push(ci + 1);
        }
        if (cy > 0 && at(mask, ci - w) && at(labels, ci - w) < 0) {
          labels[ci - w] = label;
          stack.push(ci - w);
        }
        if (cy < h - 1 && at(mask, ci + w) && at(labels, ci + w) < 0) {
          labels[ci + w] = label;
          stack.push(ci + w);
        }
      }

      label++;
    }
  }

  return { labels, count: label };
}

// ============================================
// BOUNDING BOX EXTRACTION
// ============================================

interface RawBox {
  bx: number;
  by: number;
  bw: number;
  bh: number;
}

// ============================================
// MERGE PHOTO FRAGMENTS
// ============================================

/**
 * Merge boxes that are fragments of the same photo split by internal bright bands.
 * Two boxes are considered fragments of the same photo when:
 *   - They share >35% overlap in one axis (same column or row of photos)
 *   - AND the gap between them in the other axis is small (<2.5% of image dim)
 *   - OR the smaller box is a sliver (<40% area of larger) and gap < 4%
 */
function mergePhotoFragments(boxes: RawBox[], w: number, h: number): RawBox[] {
  const result = boxes.map((b) => ({ ...b }));
  let didMerge = true;

  while (didMerge) {
    didMerge = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const a = result[i]!;
        const b = result[j]!;

        // Calculate overlap ratio in each axis
        const overlapXStart = Math.max(a.bx, b.bx);
        const overlapXEnd = Math.min(a.bx + a.bw, b.bx + b.bw);
        const overlapX = Math.max(0, overlapXEnd - overlapXStart);
        const minWidth = Math.min(a.bw, b.bw);
        const xOverlapRatio = minWidth > 0 ? overlapX / minWidth : 0;

        const overlapYStart = Math.max(a.by, b.by);
        const overlapYEnd = Math.min(a.by + a.bh, b.by + b.bh);
        const overlapY = Math.max(0, overlapYEnd - overlapYStart);
        const minHeight = Math.min(a.bh, b.bh);
        const yOverlapRatio = minHeight > 0 ? overlapY / minHeight : 0;

        // Gap in the non-overlapping axis
        const gapX = Math.max(0, Math.max(a.bx, b.bx) - Math.min(a.bx + a.bw, b.bx + b.bw));
        const gapY = Math.max(0, Math.max(a.by, b.by) - Math.min(a.by + a.bh, b.by + b.bh));

        const areaA = a.bw * a.bh;
        const areaB = b.bw * b.bh;
        const smallerArea = Math.min(areaA, areaB);
        const largerArea = Math.max(areaA, areaB);
        const isSliverRatio = smallerArea < largerArea * 0.4;

        const touching = gapX === 0 && gapY === 0;

        // Merge conditions:
        // 1. Touching/overlapping + axis overlap > 35%
        // 2. Nearby (gap < 2.5%) + axis overlap > 35% + sliver
        // 3. Sliver fragment very close (gap < 4% in any direction)
        const maxGapNormal = Math.max(w, h) * 0.025;
        const maxGapSliver = Math.max(w, h) * 0.04;

        const sameColumn = xOverlapRatio > 0.35 && (touching || (gapY < maxGapNormal && isSliverRatio) || gapY === 0);
        const sameRow = yOverlapRatio > 0.35 && (touching || (gapX < maxGapNormal && isSliverRatio) || gapX === 0);

        // Sliver merge: very small fragment near a larger box
        const sliverMerge =
          isSliverRatio &&
          ((xOverlapRatio > 0.3 && gapY < maxGapSliver) || (yOverlapRatio > 0.3 && gapX < maxGapSliver));

        if (sameColumn || sameRow || sliverMerge) {
          const minX = Math.min(a.bx, b.bx);
          const minY = Math.min(a.by, b.by);
          const maxX = Math.max(a.bx + a.bw, b.bx + b.bw);
          const maxY = Math.max(a.by + a.bh, b.by + b.bh);
          result[i] = { bx: minX, by: minY, bw: maxX - minX, bh: maxY - minY };
          result.splice(j, 1);
          didMerge = true;
          break;
        }
      }
      if (didMerge) break;
    }
  }

  return result;
}

// ============================================
// SPLIT LARGE BOXES (projection profiles)
// ============================================

/**
 * Given a bounding box that may contain multiple photos arranged in rows,
 * use a TWO-STEP projection profile approach:
 *   Step 1: Split HORIZONTALLY into rows (find horizontal gaps that span full width)
 *   Step 2: For each row, split VERTICALLY (find gaps between side-by-side photos)
 *
 * This two-step approach is critical because different rows may have vertical gaps
 * at different x-positions. A single-pass grid approach would miss them because
 * the vertical projection over the full height wouldn't show clean valleys.
 */
function splitLargeBox(box: RawBox, mask: Uint8Array, w: number, _h: number): RawBox[] {
  const gapThreshold = 0.15;

  // Step 1: Find horizontal splits (row boundaries)
  // Horizontal projection: for each row, fraction of photo pixels
  const hProj = new Float64Array(box.bh);
  for (let ly = 0; ly < box.bh; ly++) {
    let photoCount = 0;
    for (let lx = 0; lx < box.bw; lx++) {
      const gx = box.bx + lx;
      const gy = box.by + ly;
      if (at(mask, gy * w + gx)) photoCount++;
    }
    hProj[ly] = photoCount / box.bw;
  }

  const minGapWidthH = Math.max(3, Math.floor(box.bh * 0.005)); // 0.5% of box height
  const hSplits = findGaps(hProj, box.bh, gapThreshold, minGapWidthH);

  // Build row strips from horizontal splits
  const yEdges = [0, ...hSplits, box.bh];
  const rows: RawBox[] = [];
  for (let yi = 0; yi < yEdges.length - 1; yi++) {
    const sy = box.by + yEdges[yi]!;
    const sh = yEdges[yi + 1]! - yEdges[yi]!;
    if (sh > 0) {
      rows.push({ bx: box.bx, by: sy, bw: box.bw, bh: sh });
    }
  }

  // If no horizontal splits, treat the whole box as one row
  if (rows.length === 0) rows.push(box);

  // Step 2: For each row, find vertical splits independently
  const subBoxes: RawBox[] = [];
  for (const row of rows) {
    // Vertical projection for this row only
    const vProj = new Float64Array(row.bw);
    for (let lx = 0; lx < row.bw; lx++) {
      let photoCount = 0;
      for (let ly = 0; ly < row.bh; ly++) {
        const gx = row.bx + lx;
        const gy = row.by + ly;
        if (at(mask, gy * w + gx)) photoCount++;
      }
      vProj[lx] = photoCount / row.bh;
    }

    const minGapWidthV = Math.max(3, Math.floor(row.bw * 0.005)); // 0.5% of row width
    const vSplits = findGaps(vProj, row.bw, gapThreshold, minGapWidthV);

    if (vSplits.length === 0) {
      subBoxes.push(row);
    } else {
      const xEdges = [0, ...vSplits, row.bw];
      for (let xi = 0; xi < xEdges.length - 1; xi++) {
        const sx = row.bx + xEdges[xi]!;
        const sw = xEdges[xi + 1]! - xEdges[xi]!;
        if (sw > 0) {
          subBoxes.push({ bx: sx, by: row.by, bw: sw, bh: row.bh });
        }
      }
    }
  }

  return subBoxes.length > 1 ? subBoxes : [box];
}

/**
 * Find gap centers in a projection profile using two methods:
 *   1. Threshold: contiguous runs where values < threshold.
 *   2. Valley detection (fallback): local minima that drop to <40% of
 *      surrounding peaks. Catches narrow gaps between touching photos
 *      where the absolute value never drops below threshold.
 */
function findGaps(proj: Float64Array, len: number, threshold: number, minWidth: number): number[] {
  // Method 1: absolute threshold
  // Ignore edge artifacts: only consider gaps in the central 10-90% region.
  // Scanner bed edges and photo boundaries create false low-density strips
  // at the very edges of bounding boxes that aren't real inter-photo gaps.
  const edgeMargin = Math.round(len * 0.1);
  const gaps: number[] = [];
  let gapStart = -1;

  for (let i = 0; i < len; i++) {
    if (at(proj, i) < threshold) {
      if (gapStart < 0) gapStart = i;
    } else {
      if (gapStart >= 0) {
        const gapCenter = gapStart + Math.floor((i - gapStart) / 2);
        const gapWidth = i - gapStart;
        if (gapWidth >= minWidth && gapCenter >= edgeMargin && gapCenter < len - edgeMargin) {
          gaps.push(gapCenter);
        }
        gapStart = -1;
      }
    }
  }

  if (gaps.length > 0) return gaps;

  // Method 2: valley detection — find local minima significantly lower than neighbors.
  // Only search the central 20–80% to avoid edge artifacts.
  const searchStart = Math.round(len * 0.2);
  const searchEnd = Math.round(len * 0.8);
  const windowSize = Math.max(10, Math.round(len * 0.03));

  for (let i = searchStart; i < searchEnd; i++) {
    const val = at(proj, i);
    // Must be a local minimum (lower than immediate neighbors)
    if (i > 0 && at(proj, i - 1) <= val) continue;
    if (i < len - 1 && at(proj, i + 1) <= val) continue;

    // Average of neighborhoods on each side
    let leftSum = 0;
    let leftCount = 0;
    for (let j = Math.max(0, i - windowSize * 2); j < Math.max(0, i - 2); j++) {
      leftSum += at(proj, j);
      leftCount++;
    }
    let rightSum = 0;
    let rightCount = 0;
    for (let j = Math.min(len - 1, i + 3); j <= Math.min(len - 1, i + windowSize * 2); j++) {
      rightSum += at(proj, j);
      rightCount++;
    }

    if (leftCount === 0 || rightCount === 0) continue;

    const leftAvg = leftSum / leftCount;
    const rightAvg = rightSum / rightCount;
    const peakAvg = Math.max(leftAvg, rightAvg);
    const minSideAvg = Math.min(leftAvg, rightAvg);

    // Valley must drop to <30% of surrounding peaks, and peaks must be substantial.
    // peakAvg > 0.6: surrounding content must be dense enough to indicate two real photos.
    // minSideAvg > 0.4: BOTH sides must have content (rejects photo-edge false valleys).
    if (peakAvg > 0.6 && minSideAvg > 0.4 && val < peakAvg * 0.3) {
      gaps.push(i);
    }
  }

  return gaps;
}

// ============================================
// BOUNDING BOX EXTRACTION
// ============================================

// ============================================
// EXPECTED COUNT ADJUSTMENT
// ============================================

/**
 * Adjust detected boxes to match the user's expected photo count.
 * - Too many boxes → merge the closest pairs (by gap distance)
 * - Too few boxes → aggressively split the largest boxes
 * Mutates the array in place.
 */
function adjustToExpectedCount(
  boxes: RawBox[],
  expectedCount: number,
  mask: Uint8Array,
  w: number,
  h: number,
  _imgArea: number,
  _minDim: number,
): void {
  // ── Too many: merge closest pairs ──
  while (boxes.length > expectedCount && boxes.length > 1) {
    let bestDist = Infinity;
    let bestI = 0;
    let bestJ = 1;

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        // Distance between box centers
        const dx = a.bx + a.bw / 2 - (b.bx + b.bw / 2);
        const dy = a.by + a.bh / 2 - (b.by + b.bh / 2);
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestI = i;
          bestJ = j;
        }
      }
    }

    // Merge bestI and bestJ
    const a = boxes[bestI]!;
    const b = boxes[bestJ]!;
    const minX = Math.min(a.bx, b.bx);
    const minY = Math.min(a.by, b.by);
    const maxX = Math.max(a.bx + a.bw, b.bx + b.bw);
    const maxY = Math.max(a.by + a.bh, b.by + b.bh);
    boxes[bestI] = { bx: minX, by: minY, bw: maxX - minX, bh: maxY - minY };
    boxes.splice(bestJ, 1);
  }

  // ── Too few: split the largest boxes ──
  let maxAttempts = 10;
  while (boxes.length < expectedCount && maxAttempts > 0) {
    maxAttempts--;

    // Find the largest box by area
    let largestIdx = 0;
    let largestArea = 0;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (!box) continue;
      const area = box.bw * box.bh;
      if (area > largestArea) {
        largestArea = area;
        largestIdx = i;
      }
    }

    const box = boxes[largestIdx]!;
    // Try splitting with lower threshold
    const splits = splitLargeBoxAggressive(box, mask, w, h);
    if (splits.length > 1) {
      boxes.splice(largestIdx, 1, ...splits);
    } else {
      // If projection profile can't find a gap, split in half along the longer axis
      if (box.bw >= box.bh) {
        const halfW = Math.floor(box.bw / 2);
        boxes.splice(
          largestIdx,
          1,
          { bx: box.bx, by: box.by, bw: halfW, bh: box.bh },
          { bx: box.bx + halfW, by: box.by, bw: box.bw - halfW, bh: box.bh },
        );
      } else {
        const halfH = Math.floor(box.bh / 2);
        boxes.splice(
          largestIdx,
          1,
          { bx: box.bx, by: box.by, bw: box.bw, bh: halfH },
          { bx: box.bx, by: box.by + halfH, bw: box.bw, bh: box.bh - halfH },
        );
      }
    }

    // Trim excess if splits produced too many
    if (boxes.length > expectedCount) {
      // Remove smallest boxes until we match
      while (boxes.length > expectedCount) {
        let smallestIdx = 0;
        let smallestArea = Infinity;
        for (let i = 0; i < boxes.length; i++) {
          const box = boxes[i];
          if (!box) continue;
          const area = box.bw * box.bh;
          if (area < smallestArea) {
            smallestArea = area;
            smallestIdx = i;
          }
        }
        boxes.splice(smallestIdx, 1);
      }
    }
  }
}

/**
 * Aggressive split variant with lower gap threshold for expected count adjustment.
 */
function splitLargeBoxAggressive(box: RawBox, mask: Uint8Array, w: number, _h: number): RawBox[] {
  const gapThreshold = 0.08; // Much lower than default 0.15

  // Horizontal projection
  const hProj = new Float64Array(box.bh);
  for (let ly = 0; ly < box.bh; ly++) {
    let photoCount = 0;
    for (let lx = 0; lx < box.bw; lx++) {
      if (at(mask, (box.by + ly) * w + box.bx + lx)) photoCount++;
    }
    hProj[ly] = photoCount / box.bw;
  }

  const minGapH = Math.max(2, Math.floor(box.bh * 0.003));
  const hSplits = findGaps(hProj, box.bh, gapThreshold, minGapH);

  const yEdges = [0, ...hSplits, box.bh];
  const rows: RawBox[] = [];
  for (let yi = 0; yi < yEdges.length - 1; yi++) {
    const sh = yEdges[yi + 1]! - yEdges[yi]!;
    if (sh > 0) rows.push({ bx: box.bx, by: box.by + yEdges[yi]!, bw: box.bw, bh: sh });
  }
  if (rows.length === 0) rows.push(box);

  const subBoxes: RawBox[] = [];
  for (const row of rows) {
    const vProj = new Float64Array(row.bw);
    for (let lx = 0; lx < row.bw; lx++) {
      let photoCount = 0;
      for (let ly = 0; ly < row.bh; ly++) {
        if (at(mask, (row.by + ly) * w + row.bx + lx)) photoCount++;
      }
      vProj[lx] = photoCount / row.bh;
    }

    const minGapV = Math.max(2, Math.floor(row.bw * 0.003));
    const vSplits = findGaps(vProj, row.bw, gapThreshold, minGapV);

    if (vSplits.length === 0) {
      subBoxes.push(row);
    } else {
      const xEdges = [0, ...vSplits, row.bw];
      for (let xi = 0; xi < xEdges.length - 1; xi++) {
        const sw = xEdges[xi + 1]! - xEdges[xi]!;
        if (sw > 0) subBoxes.push({ bx: row.bx + xEdges[xi]!, by: row.by, bw: sw, bh: row.bh });
      }
    }
  }

  return subBoxes.length > 1 ? subBoxes : [box];
}

// ============================================
// BOUNDING BOX EXTRACTION
// ============================================

function extractBoxes(labels: Int32Array, count: number, w: number, h: number): RawBox[] {
  const minXArr = new Int32Array(count).fill(w);
  const minYArr = new Int32Array(count).fill(h);
  const maxXArr = new Int32Array(count).fill(0);
  const maxYArr = new Int32Array(count).fill(0);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const lbl = at(labels, y * w + x);
      if (lbl < 0) continue;
      if (x < at(minXArr, lbl)) minXArr[lbl] = x;
      if (x > at(maxXArr, lbl)) maxXArr[lbl] = x;
      if (y < at(minYArr, lbl)) minYArr[lbl] = y;
      if (y > at(maxYArr, lbl)) maxYArr[lbl] = y;
    }
  }

  const result: RawBox[] = [];
  for (let i = 0; i < count; i++) {
    result.push({
      bx: at(minXArr, i),
      by: at(minYArr, i),
      bw: at(maxXArr, i) - at(minXArr, i) + 1,
      bh: at(maxYArr, i) - at(minYArr, i) + 1,
    });
  }

  return result;
}

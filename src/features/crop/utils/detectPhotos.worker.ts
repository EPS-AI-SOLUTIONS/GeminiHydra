// Removed unused BoundingBox import

// Typed-array index helper
function at(arr: Uint8Array | Uint8ClampedArray | Int32Array | Float64Array, i: number): number {
  return arr[i] as number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface RawBox {
  bx: number;
  by: number;
  bw: number;
  bh: number;
}

function detectScannerBackground(data: Uint8ClampedArray, w: number, h: number): RGB {
  const totalPixels = w * h;
  const hist = new Int32Array(256);
  for (let i = 0; i < totalPixels; i++) {
    const pi = i * 4;
    const bin = Math.round((at(data, pi) + at(data, pi + 1) + at(data, pi + 2)) / 3);
    hist[bin] = at(hist, bin) + 1;
  }

  let peakBright = 240;
  let peakVal = 0;
  for (let i = 220; i < 256; i++) {
    if (at(hist, i) > peakVal) {
      peakVal = at(hist, i);
      peakBright = i;
    }
  }

  if (peakVal > totalPixels * 0.01) {
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

  return sampleBorderColor(data, w, h);
}

function sampleBorderColor(data: Uint8ClampedArray, w: number, h: number): RGB {
  let rSum = 0,
    gSum = 0,
    bSum = 0,
    count = 0;
  const addPixel = (i: number) => {
    rSum += at(data, i);
    gSum += at(data, i + 1);
    bSum += at(data, i + 2);
    count++;
  };
  for (let x = 0; x < w; x += 2) {
    for (const y of [0, 1, h - 2, h - 1]) addPixel((y * w + x) * 4);
  }
  for (let y = 0; y < h; y += 2) {
    for (const x of [0, 1, w - 2, w - 1]) addPixel((y * w + x) * 4);
  }
  return { r: rSum / count, g: gSum / count, b: bSum / count };
}

function createPhotoRegionMask(data: Uint8ClampedArray, w: number, h: number, bg: RGB): Uint8Array {
  const mask = new Uint8Array(w * h);
  const bgBrightness = (bg.r + bg.g + bg.b) / 3;
  const marginX = Math.max(4, Math.round(w * 0.015));
  const marginY = Math.max(4, Math.round(h * 0.015));
  const brightCutoff = bgBrightness - 25;
  const colorDistThreshold = 40;

  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = (i - x) / w;
    if (x < marginX || x >= w - marginX || y < marginY || y >= h - marginY) continue;

    const pi = i * 4;
    const r = at(data, pi),
      g = at(data, pi + 1),
      b = at(data, pi + 2);
    const brightness = (r + g + b) / 3;

    if (brightness < brightCutoff) {
      mask[i] = 1;
      continue;
    }

    const dr = r - bg.r,
      dg = g - bg.g,
      db = b - bg.b;
    const colorDist = Math.sqrt(dr * dr + dg * dg + db * db);
    mask[i] = colorDist > colorDistThreshold ? 1 : 0;
  }
  return mask;
}

function dilateFast(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const hPass = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) sum += at(mask, y * w + x);
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
    for (let y = 0; y <= Math.min(r, h - 1); y++) sum += at(hPass, y * w + x);
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
        // biome-ignore lint/style/noNonNullAssertion: stack.length > 0 checked by while condition
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

function mergePhotoFragments(boxes: RawBox[], w: number, h: number): RawBox[] {
  const result = boxes.map((b) => ({ ...b }));
  let didMerge = true;
  while (didMerge) {
    didMerge = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        // biome-ignore lint/style/noNonNullAssertion: loop-bounded array access
        const a = result[i]!;
        // biome-ignore lint/style/noNonNullAssertion: loop-bounded array access
        const b = result[j]!;
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

        const gapX = Math.max(0, Math.max(a.bx, b.bx) - Math.min(a.bx + a.bw, b.bx + b.bw));
        const gapY = Math.max(0, Math.max(a.by, b.by) - Math.min(a.by + a.bh, b.by + b.bh));

        const areaA = a.bw * a.bh;
        const areaB = b.bw * b.bh;
        const smallerArea = Math.min(areaA, areaB);
        const largerArea = Math.max(areaA, areaB);
        const isSliverRatio = smallerArea < largerArea * 0.4;
        const touching = gapX === 0 && gapY === 0;

        const maxGapNormal = Math.max(w, h) * 0.025;
        const maxGapSliver = Math.max(w, h) * 0.04;

        const sameColumn = xOverlapRatio > 0.35 && (touching || (gapY < maxGapNormal && isSliverRatio) || gapY === 0);
        const sameRow = yOverlapRatio > 0.35 && (touching || (gapX < maxGapNormal && isSliverRatio) || gapX === 0);
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

function findGaps(proj: Float64Array, len: number, threshold: number, minWidth: number): number[] {
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
        if (gapWidth >= minWidth && gapCenter >= edgeMargin && gapCenter < len - edgeMargin) gaps.push(gapCenter);
        gapStart = -1;
      }
    }
  }
  if (gaps.length > 0) return gaps;

  const searchStart = Math.round(len * 0.2);
  const searchEnd = Math.round(len * 0.8);
  const windowSize = Math.max(10, Math.round(len * 0.03));

  for (let i = searchStart; i < searchEnd; i++) {
    const val = at(proj, i);
    if (i > 0 && at(proj, i - 1) <= val) continue;
    if (i < len - 1 && at(proj, i + 1) <= val) continue;

    let leftSum = 0,
      leftCount = 0;
    for (let j = Math.max(0, i - windowSize * 2); j < Math.max(0, i - 2); j++) {
      leftSum += at(proj, j);
      leftCount++;
    }
    let rightSum = 0,
      rightCount = 0;
    for (let j = Math.min(len - 1, i + 3); j <= Math.min(len - 1, i + windowSize * 2); j++) {
      rightSum += at(proj, j);
      rightCount++;
    }

    if (leftCount === 0 || rightCount === 0) continue;
    const leftAvg = leftSum / leftCount,
      rightAvg = rightSum / rightCount;
    const peakAvg = Math.max(leftAvg, rightAvg),
      minSideAvg = Math.min(leftAvg, rightAvg);

    if (peakAvg > 0.6 && minSideAvg > 0.4 && val < peakAvg * 0.3) gaps.push(i);
  }
  return gaps;
}

function splitLargeBox(box: RawBox, mask: Uint8Array, w: number, _h: number): RawBox[] {
  const gapThreshold = 0.15;
  const hProj = new Float64Array(box.bh);
  for (let ly = 0; ly < box.bh; ly++) {
    let photoCount = 0;
    for (let lx = 0; lx < box.bw; lx++) {
      if (at(mask, (box.by + ly) * w + box.bx + lx)) photoCount++;
    }
    hProj[ly] = photoCount / box.bw;
  }
  const minGapWidthH = Math.max(3, Math.floor(box.bh * 0.005));
  const hSplits = findGaps(hProj, box.bh, gapThreshold, minGapWidthH);
  const yEdges = [0, ...hSplits, box.bh];
  const rows: RawBox[] = [];
  for (let yi = 0; yi < yEdges.length - 1; yi++) {
    // biome-ignore lint/style/noNonNullAssertion: yi bounded by yEdges.length - 1
    const sh = yEdges[yi + 1]! - yEdges[yi]!;
    // biome-ignore lint/style/noNonNullAssertion: yi bounded by yEdges.length - 1
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
    const minGapWidthV = Math.max(3, Math.floor(row.bw * 0.005));
    const vSplits = findGaps(vProj, row.bw, gapThreshold, minGapWidthV);
    if (vSplits.length === 0) {
      subBoxes.push(row);
    } else {
      const xEdges = [0, ...vSplits, row.bw];
      for (let xi = 0; xi < xEdges.length - 1; xi++) {
        // biome-ignore lint/style/noNonNullAssertion: xi bounded by xEdges.length - 1
        const sw = xEdges[xi + 1]! - xEdges[xi]!;
        // biome-ignore lint/style/noNonNullAssertion: xi bounded by xEdges.length - 1
        if (sw > 0) subBoxes.push({ bx: row.bx + xEdges[xi]!, by: row.by, bw: sw, bh: row.bh });
      }
    }
  }
  return subBoxes.length > 1 ? subBoxes : [box];
}

function splitLargeBoxAggressive(box: RawBox, mask: Uint8Array, w: number, _h: number): RawBox[] {
  const gapThreshold = 0.08;
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
    // biome-ignore lint/style/noNonNullAssertion: yi bounded by yEdges.length - 1
    const sh = yEdges[yi + 1]! - yEdges[yi]!;
    // biome-ignore lint/style/noNonNullAssertion: yi bounded by yEdges.length - 1
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
        // biome-ignore lint/style/noNonNullAssertion: xi bounded by xEdges.length - 1
        const sw = xEdges[xi + 1]! - xEdges[xi]!;
        // biome-ignore lint/style/noNonNullAssertion: xi bounded by xEdges.length - 1
        if (sw > 0) subBoxes.push({ bx: row.bx + xEdges[xi]!, by: row.by, bw: sw, bh: row.bh });
      }
    }
  }
  return subBoxes.length > 1 ? subBoxes : [box];
}

function adjustToExpectedCount(
  boxes: RawBox[],
  expectedCount: number,
  mask: Uint8Array,
  w: number,
  h: number,
  _imgArea: number,
  _minDim: number,
): void {
  while (boxes.length > expectedCount && boxes.length > 1) {
    let bestDist = Infinity,
      bestI = 0,
      bestJ = 1;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        // biome-ignore lint/style/noNonNullAssertion: loop-bounded array access
        const a = boxes[i]!,
          // biome-ignore lint/style/noNonNullAssertion: loop-bounded array access
          b = boxes[j]!;
        const dx = a.bx + a.bw / 2 - (b.bx + b.bw / 2),
          dy = a.by + a.bh / 2 - (b.by + b.bh / 2);
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestI = i;
          bestJ = j;
        }
      }
    }
    // biome-ignore lint/style/noNonNullAssertion: bestI/bestJ set from valid loop indices
    const a = boxes[bestI]!,
      // biome-ignore lint/style/noNonNullAssertion: bestI/bestJ set from valid loop indices
      b = boxes[bestJ]!;
    const minX = Math.min(a.bx, b.bx),
      minY = Math.min(a.by, b.by);
    const maxX = Math.max(a.bx + a.bw, b.bx + b.bw),
      maxY = Math.max(a.by + a.bh, b.by + b.bh);
    boxes[bestI] = { bx: minX, by: minY, bw: maxX - minX, bh: maxY - minY };
    boxes.splice(bestJ, 1);
  }

  let maxAttempts = 10;
  while (boxes.length < expectedCount && maxAttempts > 0) {
    maxAttempts--;
    let largestIdx = 0,
      largestArea = 0;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (!box) continue;
      const area = box.bw * box.bh;
      if (area > largestArea) {
        largestArea = area;
        largestIdx = i;
      }
    }
    // biome-ignore lint/style/noNonNullAssertion: largestIdx set from valid loop index
    const box = boxes[largestIdx]!;
    const splits = splitLargeBoxAggressive(box, mask, w, h);
    if (splits.length > 1) {
      boxes.splice(largestIdx, 1, ...splits);
    } else {
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
    if (boxes.length > expectedCount) {
      while (boxes.length > expectedCount) {
        let smallestIdx = 0,
          smallestArea = Infinity;
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

self.onmessage = async (e: MessageEvent<{ bitmap: ImageBitmap; expectedCount?: number }>) => {
  try {
    const { bitmap, expectedCount } = e.data;

    let w = bitmap.width;
    let h = bitmap.height;

    const maxDim = 1200;
    if (Math.max(w, h) > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    const canvas = new OffscreenCanvas(w, h);
    // biome-ignore lint/style/noNonNullAssertion: OffscreenCanvas 2D context always available
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, w, h);

    const { data } = ctx.getImageData(0, 0, w, h);

    const bg = detectScannerBackground(data, w, h);
    const mask = createPhotoRegionMask(data, w, h, bg);

    const minDim = Math.min(w, h);
    const closeRadius = Math.max(2, Math.min(4, Math.round(minDim * 0.004)));
    let processed = dilateFast(mask, w, h, closeRadius);
    processed = erodeFast(processed, w, h, closeRadius);

    const openRadius = Math.max(3, Math.min(8, Math.round(minDim * 0.006)));
    processed = erodeFast(processed, w, h, openRadius);
    processed = dilateFast(processed, w, h, openRadius);

    const { labels, count } = labelComponents(processed, w, h);
    const rawBoxes = extractBoxes(labels, count, w, h);
    const imgArea = w * h;

    const sizeFiltered = rawBoxes.filter((b) => {
      const area = b.bw * b.bh;
      const boxMinDim = Math.min(b.bw, b.bh);
      const aspectRatio = Math.max(b.bw, b.bh) / Math.max(1, boxMinDim);
      return area >= imgArea * 0.004 && boxMinDim >= minDim * 0.03 && aspectRatio <= 5;
    });

    const merged = mergePhotoFragments(sizeFiltered, w, h);

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

    const finalBoxes = secondPass.filter((b) => {
      const bMinDim = Math.min(b.bw, b.bh);
      const bAspect = Math.max(b.bw, b.bh) / Math.max(1, bMinDim);
      return bMinDim >= minDim * 0.035 && bAspect <= 4;
    });

    if (expectedCount != null && expectedCount > 0 && finalBoxes.length !== expectedCount) {
      adjustToExpectedCount(finalBoxes, expectedCount, mask, w, h, imgArea, minDim);
    }

    const rowHeight = h * 0.08;
    finalBoxes.sort((a, b) => {
      const rowA = Math.floor(a.by / rowHeight);
      const rowB = Math.floor(b.by / rowHeight);
      if (rowA !== rowB) return rowA - rowB;
      return a.bx - b.bx;
    });

    const result = finalBoxes.map((b, i) => ({
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

    self.postMessage({ type: 'success', data: result });
  } catch (error) {
    self.postMessage({ type: 'error', error: (error as Error).message });
  }
};

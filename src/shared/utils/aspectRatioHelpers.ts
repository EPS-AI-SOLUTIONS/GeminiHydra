/** Jaskier Shared Pattern */

/** Standard photo ratios for automatic outpainting. */
export const STANDARD_RATIOS = [
  { key: '3:2', value: 3 / 2 },
  { key: '4:3', value: 4 / 3 },
  { key: '5:4', value: 5 / 4 },
  { key: '1:1', value: 1 },
  { key: '16:9', value: 16 / 9 },
];

/** Find the closest standard photo ratio for given dimensions. */
export function findClosestRatio(width: number, height: number): string {
  const aspect = width / height;
  // Also consider portrait orientation (flip ratio)
  let bestKey = STANDARD_RATIOS[0]?.key;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const r of STANDARD_RATIOS) {
    const diffLandscape = Math.abs(aspect - r.value);
    const diffPortrait = Math.abs(aspect - 1 / r.value);
    const diff = Math.min(diffLandscape, diffPortrait);
    if (diff < bestDiff) {
      bestDiff = diff;
      // Use portrait key format (e.g. "2:3") when portrait is closer
      bestKey = diffPortrait < diffLandscape ? r.key.split(':').reverse().join(':') : r.key;
    }
  }
  return bestKey ?? '1:1';
}

// src/features/crop/components/cropConstants.ts
/**
 * Shared constants and utility functions for CropView sub-components.
 */

import type { AspectRatioLock } from '@/features/crop/stores/cropStore';

/** Threshold: crops smaller than this (both dimensions) qualify for grid batching */
export const BATCH_THRESHOLD_PX = 400;
/** Minimum total crop count before grid batching kicks in */
export const BATCH_MIN_TOTAL = 8;

export const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'border-emerald-400/70 bg-emerald-400/10',
  medium: 'border-yellow-400/70 bg-yellow-400/10',
  low: 'border-red-400/70 bg-red-400/10',
};

export function getConfidenceLevel(confidence: number): 'high' | 'medium' | 'low' {
  const c = typeof confidence === 'number' && !Number.isNaN(confidence) ? confidence : 0;
  if (c >= 0.85) return 'high';
  if (c >= 0.7) return 'medium';
  return 'low';
}

/**
 * Format a bounding box confidence value (0-1 float) as a percentage string.
 * Defensively handles non-numeric / NaN values that can arrive from AI backends.
 */
export function formatConfidence(confidence: number): string {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) return '0%';
  // Detect 0-1 range vs 0-100 range: values > 1 are already percentages
  const pct = confidence > 1 ? Math.round(confidence) : Math.round(confidence * 100);
  return `${pct}%`;
}

/** Aspect ratio lock options for the dropdown. */
export const ASPECT_RATIO_OPTIONS: { value: AspectRatioLock; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: '3:2', label: '3:2' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
];

// ============================================
// MODULE-LEVEL ANIMATION VARIANTS (#43)
// ============================================

export const fadeInUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } };
export const fadeIn = { initial: { opacity: 0 }, animate: { opacity: 1 } };
export const scaleIn = { initial: { opacity: 0, scale: 0.9 }, animate: { opacity: 1, scale: 1 } };
export const expandIn = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: 'auto' as const } };

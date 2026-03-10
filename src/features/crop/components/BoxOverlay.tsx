// src/features/crop/components/BoxOverlay.tsx
/**
 * Bounding box overlay drawn on the ImageCanvas.
 * Displays confidence badge, remove button, and corner handles.
 */

import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { memo } from 'react';
import type { BoundingBox } from '@/features/crop/stores/cropStore';
import { cn } from '@/shared/utils/cn';
import { CONFIDENCE_COLORS, formatConfidence, getConfidenceLevel, scaleIn } from './cropConstants';

export interface BoxOverlayProps {
  box: BoundingBox;
  index: number;
  isHighlighted: boolean;
  onRemove: (index: number) => void;
}

/** Improvement #12: label positioning fix for boxes near top edge */
const BoxOverlay = memo(function BoxOverlay({ box, index, isHighlighted, onRemove }: BoxOverlayProps) {
  const level = getConfidenceLevel(box.confidence);
  const colorClasses = CONFIDENCE_COLORS[level] ?? CONFIDENCE_COLORS.low;

  // Convert 0-1000 normalized coords to percentages
  const left = `${box.x / 10}%`;
  const top = `${box.y / 10}%`;
  const width = `${box.width / 10}%`;
  const height = `${box.height / 10}%`;

  // #12: If box is near top edge (y < 60 in 0-1000 space, i.e. 0.06 normalized), position label inside
  const labelNearTop = box.y < 60;

  return (
    <motion.div
      {...scaleIn}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ delay: index * 0.1 }}
      className={cn(
        'absolute border-2 group cursor-pointer transition-all duration-200',
        'hover:shadow-[0_0_15px_rgba(255,255,255,0.15)]',
        isHighlighted && 'ring-2 ring-[var(--matrix-accent)] ring-offset-1 ring-offset-transparent animate-pulse',
        colorClasses,
      )}
      style={{ left, top, width, height }}
    >
      {/* Label badge — #12: conditional position */}
      <div
        className={cn(
          'absolute left-0 flex items-center gap-1',
          'bg-[var(--matrix-bg-primary)]/90 backdrop-blur-sm',
          'text-sm font-mono px-2 py-0.5',
          'border border-white/20',
          'whitespace-nowrap',
          labelNearTop ? 'top-1 rounded border-b' : '-top-6 rounded-t border-b-0',
        )}
      >
        <span className="font-bold text-[var(--matrix-accent)]">#{index + 1}</span>
        {box.label && <span className="text-[var(--matrix-text-secondary)] ml-1">{box.label}</span>}
        <span className="text-[var(--matrix-text-secondary)]/60 ml-1">{formatConfidence(box.confidence)}</span>
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(index);
        }}
        className={cn(
          'absolute -top-2 -right-2 w-5 h-5',
          'bg-red-500 text-white rounded-full',
          'flex items-center justify-center',
          'opacity-0 group-hover:opacity-100',
          'transition-opacity duration-200',
          'hover:bg-red-400 hover:scale-110',
        )}
      >
        <X size={10} />
      </button>

      {/* Corner handles */}
      <div className="absolute -top-1 -left-1 w-2 h-2 border-t-2 border-l-2 border-white/60" />
      <div className="absolute -top-1 -right-1 w-2 h-2 border-t-2 border-r-2 border-white/60" />
      <div className="absolute -bottom-1 -left-1 w-2 h-2 border-b-2 border-l-2 border-white/60" />
      <div className="absolute -bottom-1 -right-1 w-2 h-2 border-b-2 border-r-2 border-white/60" />
    </motion.div>
  );
});
BoxOverlay.displayName = 'BoxOverlay';

export default BoxOverlay;

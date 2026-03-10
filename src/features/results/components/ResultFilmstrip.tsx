// src/features/results/components/ResultFilmstrip.tsx
/**
 * ResultFilmstrip — horizontal thumbnail strip for batch image navigation.
 * Shows thumbnails of all restored images with active selection highlight.
 */
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResultsImageData } from '@/features/results/stores/resultsStore';
import { cn } from '@/shared/utils/cn';

// ============================================
// TYPES
// ============================================

export interface ResultFilmstripProps {
  images: ResultsImageData[];
  activeIndex: number;
  onSelectImage: (index: number) => void;
}

// ============================================
// COMPONENT
// ============================================

export const ResultFilmstrip = memo(function ResultFilmstrip({
  images,
  activeIndex,
  onSelectImage,
}: ResultFilmstripProps) {
  const { t } = useTranslation();

  if (images.length <= 1) return null;

  return (
    <div className="flex gap-2 overflow-x-auto py-2 snap-x snap-mandatory scrollbar-thin">
      {images.map((img, idx) => {
        const isNearActive = Math.abs(idx - activeIndex) <= 20;
        return (
          <button
            key={ilmstrip-}
            type="button"
            onClick={() => onSelectImage(idx)}
            aria-label={t('results.goToImage', 'Go to image {{num}}', { num: idx + 1 })}
            className={cn(
              'flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 snap-center transition-all',
              idx === activeIndex
                ? 'border-[var(--matrix-accent)] shadow-[0_0_8px_var(--matrix-accent)]'
                : 'border-transparent opacity-60 hover:opacity-100',
            )}
          >
            {isNearActive ? (
              <img
                src={img.thumbnail || img.restoredImage}
                alt={t('results.thumbnailAlt', 'Thumbnail {{num}}', { num: idx + 1 })}
                className="w-full h-full object-cover"
                loading="lazy"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full bg-[var(--matrix-bg-secondary)]" />
            )}
          </button>
        );
      })}
    </div>
  );
});

ResultFilmstrip.displayName = 'ResultFilmstrip';

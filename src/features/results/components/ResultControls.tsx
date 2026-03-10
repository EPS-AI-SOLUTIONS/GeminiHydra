// src/features/results/components/ResultControls.tsx
/**
 * ResultControls — comparison mode toggle, rotation, zoom, navigation,
 * hold-to-compare, and re-restore controls.
 */

import { Card, cn } from '@jaskier/ui';
import {
  ChevronLeft,
  ChevronRight,
  Columns2,
  Eye,
  RefreshCw,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComparisonMode } from '@/features/results/stores/resultsStore';
import type { ViewTheme } from '@/shared/hooks/useViewTheme';

// ============================================
// TYPES
// ============================================

export interface ResultControlsProps {
  comparisonMode: ComparisonMode;
  onModeChange: (mode: ComparisonMode) => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  zoom: number;
  rotation: number;
  imageCount: number;
  activeIndex: number;
  onPrevImage: () => void;
  onNextImage: () => void;
  onHoldOriginalStart: () => void;
  onHoldOriginalEnd: () => void;
  theme: ViewTheme;
  onReRestore?: () => void;
  onReRestoreAlternative?: () => void;
  isReRestoring?: boolean;
}

// ============================================
// COMPONENT
// ============================================

export const ResultControls = memo(function ResultControls({
  comparisonMode,
  onModeChange,
  onRotateLeft,
  onRotateRight,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  zoom,
  rotation,
  imageCount,
  activeIndex,
  onPrevImage,
  onNextImage,
  onHoldOriginalStart,
  onHoldOriginalEnd,
  theme,
  onReRestore,
  onReRestoreAlternative,
  isReRestoring,
}: ResultControlsProps) {
  const { t } = useTranslation();
  return (
    <Card variant="glass" padding="sm" className="flex items-center gap-2 flex-wrap">
      {/* Comparison mode toggle */}
      <div className="flex items-center gap-1 mr-2">
        <button
          type="button"
          onClick={() => onModeChange('slider')}
          title={t('results.sliderComparison', 'Slider comparison')}
          aria-label={t('results.sliderComparison', 'Slider comparison')}
          data-testid="results-mode-slider"
          className={cn(
            'p-2 rounded-lg transition-all',
            comparisonMode === 'slider'
              ? cn('bg-white/15 border border-white/20', theme.textAccent)
              : cn(theme.textMuted, 'hover:bg-white/5'),
          )}
        >
          <SlidersHorizontal size={16} />
        </button>
        <button
          type="button"
          onClick={() => onModeChange('side-by-side')}
          title={t('results.sideBySide', 'Side by side')}
          aria-label={t('results.sideBySide', 'Side by side')}
          data-testid="results-mode-sidebyside"
          className={cn(
            'p-2 rounded-lg transition-all',
            comparisonMode === 'side-by-side'
              ? cn('bg-white/15 border border-white/20', theme.textAccent)
              : cn(theme.textMuted, 'hover:bg-white/5'),
          )}
        >
          <Columns2 size={16} />
        </button>
      </div>

      {/* Image navigation (only when multiple images) */}
      {imageCount > 1 && (
        <>
          <div className="w-px h-6 bg-white/10" />
          <div className="flex items-center gap-1 mx-2">
            <button
              type="button"
              onClick={onPrevImage}
              disabled={activeIndex <= 0}
              title={t('results.prevImage', 'Previous image')}
              aria-label={t('results.prevImage', 'Previous image')}
              data-testid="results-prev-image"
              className={cn('p-2 rounded-lg transition-all', theme.textMuted, 'hover:bg-white/5 disabled:opacity-30')}
            >
              <ChevronLeft size={16} />
            </button>
            <span className={cn('text-sm font-mono tabular-nums min-w-[3.5rem] text-center', theme.textAccent)}>
              {activeIndex + 1} / {imageCount}
            </span>
            <button
              type="button"
              onClick={onNextImage}
              disabled={activeIndex >= imageCount - 1}
              title={t('results.nextImage', 'Next image')}
              aria-label={t('results.nextImage', 'Next image')}
              data-testid="results-next-image"
              className={cn('p-2 rounded-lg transition-all', theme.textMuted, 'hover:bg-white/5 disabled:opacity-30')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}

      {/* Divider */}
      <div className="w-px h-6 bg-white/10" />

      {/* Rotation */}
      <div className="flex items-center gap-1 mx-2">
        <button
          type="button"
          onClick={onRotateLeft}
          title={t('results.rotateLeft', 'Rotate left 90deg')}
          aria-label={t('results.rotateLeft', 'Rotate left 90deg')}
          data-testid="results-rotate-left"
          className={cn('p-2 rounded-lg transition-all', theme.textMuted, 'hover:bg-white/5')}
        >
          <RotateCcw size={16} />
        </button>
        <button
          type="button"
          onClick={onRotateRight}
          title={t('results.rotateRight', 'Rotate right 90deg')}
          aria-label={t('results.rotateRight', 'Rotate right 90deg')}
          data-testid="results-rotate-right"
          className={cn('p-2 rounded-lg transition-all', theme.textMuted, 'hover:bg-white/5')}
        >
          <RotateCw size={16} />
        </button>
        {rotation !== 0 && <span className={cn('text-sm font-mono', theme.textMuted)}>{rotation}deg</span>}
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-white/10" />

      {/* Zoom */}
      <div className="flex items-center gap-1 mx-2">
        <button
          type="button"
          onClick={onZoomOut}
          title={t('results.zoomOut', 'Zoom out')}
          aria-label={t('results.zoomOut', 'Zoom out')}
          data-testid="results-zoom-out"
          disabled={zoom <= 0.25}
          className={cn('p-2 rounded-lg transition-all', theme.textMuted, 'hover:bg-white/5 disabled:opacity-30')}
        >
          <ZoomOut size={16} />
        </button>
        <button
          type="button"
          onClick={onResetZoom}
          title={t('results.resetZoom', 'Reset zoom')}
          aria-label={t('results.resetZoom', 'Reset zoom')}
          className={cn('px-2 py-1 rounded-lg transition-all text-sm font-mono', theme.textMuted, 'hover:bg-white/5')}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          title={t('results.zoomIn', 'Zoom in')}
          aria-label={t('results.zoomIn', 'Zoom in')}
          data-testid="results-zoom-in"
          disabled={zoom >= 4}
          className={cn('p-2 rounded-lg transition-all', theme.textMuted, 'hover:bg-white/5 disabled:opacity-30')}
        >
          <ZoomIn size={16} />
        </button>
      </div>

      {/* Divider */}
      <div className="w-px h-6 bg-white/10" />

      {/* Hold-to-compare toggle */}
      <button
        type="button"
        onPointerDown={onHoldOriginalStart}
        onPointerUp={onHoldOriginalEnd}
        onPointerLeave={onHoldOriginalEnd}
        title={t('results.holdToCompare', 'Hold to see original')}
        aria-label={t('results.holdToCompare', 'Hold to see original')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all text-sm',
          theme.textMuted,
          'hover:bg-white/5 active:bg-white/10',
        )}
      >
        <Eye size={16} />
        <span className="hidden sm:inline">{t('results.holdOriginal', 'Hold to see original')}</span>
      </button>

      {/* Re-restore current crop */}
      {onReRestore && (
        <>
          <div className="w-px h-6 bg-white/10" />
          <button
            type="button"
            onClick={onReRestore}
            disabled={isReRestoring}
            title={t('results.reRestore', 'Ponów (Standard)')}
            aria-label={t('results.reRestore', 'Ponów (Standard)')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all text-sm',
              isReRestoring ? 'text-[var(--matrix-accent)] animate-pulse' : theme.textMuted,
              'hover:bg-white/5 active:bg-white/10',
              isReRestoring && 'pointer-events-none',
            )}
          >
            <RefreshCw size={16} className={isReRestoring ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">
              {isReRestoring ? t('results.reRestoring', 'Restauracja...') : t('results.reRestore', 'Ponów (Standard)')}
            </span>
          </button>
        </>
      )}

      {/* Re-restore with alternative pipeline */}
      {onReRestoreAlternative && (
        <>
          <div className="w-px h-6 bg-white/10" />
          <button
            type="button"
            onClick={onReRestoreAlternative}
            disabled={isReRestoring}
            title={t('results.reRestoreAlternative', 'Ponów (Alternatywny)')}
            aria-label={t('results.reRestoreAlternative', 'Ponów (Alternatywny)')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all text-sm',
              isReRestoring ? 'text-[var(--matrix-accent)] animate-pulse' : theme.textMuted,
              'hover:bg-[var(--matrix-accent)]/20 active:bg-white/10 text-[var(--matrix-accent)]',
              isReRestoring && 'pointer-events-none',
            )}
          >
            <RefreshCw size={16} className={isReRestoring ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">
              {isReRestoring
                ? t('results.reRestoring', 'Restauracja...')
                : t('results.tryAgain', 'Ponów (Alternatywny)')}
            </span>
          </button>
        </>
      )}
    </Card>
  );
});

ResultControls.displayName = 'ResultControls';

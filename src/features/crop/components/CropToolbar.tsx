// src/features/crop/components/CropToolbar.tsx
/**
 * Sidebar controls for the CropView: expected photo count, aspect ratio,
 * draw box mode, zoom, detection zones list, undo/redo, and reset.
 */

import { cn } from '@jaskier/ui';
import { BoxSelect, Images, Minus, Plus, Redo2, RotateCcw, Undo2, X, ZoomIn } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card } from '@/components/atoms';
import type { AspectRatioLock, BoundingBox } from '@/features/crop/stores/cropStore';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { ASPECT_RATIO_OPTIONS, formatConfidence, getConfidenceLevel } from './cropConstants';

export interface CropToolbarProps {
  /** Detection boxes to display in the zones list */
  detectionBoxes: BoundingBox[];
  /** Whether AI detection is in progress */
  isDetecting: boolean;
  /** User-specified expected photo count (null = auto) */
  expectedPhotoCount: number | null;
  /** Current zoom level */
  zoom: number;
  /** Current aspect ratio lock */
  aspectRatioLock: AspectRatioLock;
  /** Whether draw-box mode is active */
  isDrawingMode: boolean;
  /** Index of the highlighted detection zone */
  highlightedZoneIndex: number | null;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;

  // Actions
  setExpectedPhotoCount: (count: number | null) => void;
  onReDetect: () => void;
  setAspectRatioLock: (lock: AspectRatioLock) => void;
  setIsDrawingMode: (active: boolean) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  removeDetectionBox: (index: number) => void;
  onZoneActivate: (index: number) => void;
  undo: () => void;
  redo: () => void;
  onReset: () => void;
}

const CropToolbar = memo(function CropToolbar({
  detectionBoxes,
  isDetecting,
  expectedPhotoCount,
  zoom,
  aspectRatioLock,
  isDrawingMode,
  highlightedZoneIndex,
  canUndo,
  canRedo,
  setExpectedPhotoCount,
  onReDetect,
  setAspectRatioLock,
  setIsDrawingMode,
  zoomIn,
  zoomOut,
  resetZoom,
  removeDetectionBox,
  onZoneActivate,
  undo,
  redo,
  onReset,
}: CropToolbarProps) {
  const theme = useViewTheme();
  const { t } = useTranslation();

  return (
    <Card variant="glass" padding="md" className="w-64 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
      {/* Expected photo count */}
      <div>
        <h4 className={cn('text-sm font-semibold uppercase tracking-wider mb-2', theme.textMuted)}>
          {t('crop.expectedCount', 'Expected Photos')}
        </h4>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpectedPhotoCount(Math.max(1, (expectedPhotoCount ?? detectionBoxes.length) - 1))}
            disabled={isDetecting || (expectedPhotoCount ?? detectionBoxes.length) <= 1}
            className="p-1.5"
          >
            <Minus size={14} />
          </Button>
          <div className={cn('flex-1 text-center', theme.text)}>
            <span className="text-lg font-bold font-mono">
              {expectedPhotoCount ?? (detectionBoxes.length || '\u2014')}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpectedPhotoCount((expectedPhotoCount ?? detectionBoxes.length) + 1)}
            disabled={isDetecting || (expectedPhotoCount ?? detectionBoxes.length) >= 20}
            className="p-1.5"
          >
            <Plus size={14} />
          </Button>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={onReDetect}
          disabled={isDetecting}
          isLoading={isDetecting}
          loadingText={t('crop.detectingProgress', 'Detecting...')}
          className="w-full mt-2"
          leftIcon={<Images size={14} />}
          data-testid="crop-redetect-btn"
        >
          {t('crop.reDetectCount', 'Re-detect ({{count}})', { count: expectedPhotoCount ?? detectionBoxes.length })}
        </Button>
        {expectedPhotoCount != null && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpectedPhotoCount(null)}
            className="w-full mt-1"
            leftIcon={<X size={12} />}
          >
            {t('crop.clearExpected', 'Auto-detect')}
          </Button>
        )}
      </div>

      {/* #44: Aspect ratio lock */}
      <div>
        <h4 className={cn('text-sm font-semibold uppercase tracking-wider mb-2', theme.textMuted)}>
          {t('crop.aspectRatio', 'Aspect Ratio')}
        </h4>
        <select
          value={aspectRatioLock}
          onChange={(e) => setAspectRatioLock(e.target.value as AspectRatioLock)}
          className={cn(
            'w-full rounded-lg px-3 py-1.5 text-sm font-mono',
            'bg-white/5 border border-white/10',
            'text-[var(--matrix-text-primary)]',
            'focus:outline-none focus:ring-1 focus:ring-[var(--matrix-accent)]',
          )}
        >
          {ASPECT_RATIO_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {aspectRatioLock !== 'auto' && (
          <p className={cn('text-xs mt-1', theme.textMuted)}>{t('crop.ratioHint', 'Applied on next re-detect')}</p>
        )}
      </div>

      {/* #29: Draw Box mode toggle */}
      <div>
        <Button
          variant={isDrawingMode ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setIsDrawingMode(!isDrawingMode)}
          className="w-full"
          leftIcon={<BoxSelect size={14} />}
          data-testid="crop-draw-box-btn"
        >
          {isDrawingMode ? t('crop.drawBoxActive', 'Drawing Mode ON') : t('crop.drawBox', 'Draw Box')}
        </Button>
        {isDrawingMode && (
          <p className={cn('text-xs mt-1', theme.textMuted)}>
            {t('crop.drawBoxHint', 'Click and drag on the image to draw a detection box')}
          </p>
        )}
      </div>

      {/* Zoom controls */}
      <div>
        <h4 className={cn('text-sm font-semibold uppercase tracking-wider mb-2', theme.textMuted)}>
          {t('crop.zoom', 'Zoom')}
        </h4>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={zoomOut}
            disabled={zoom <= 0.25}
            className="p-1.5"
            data-testid="crop-zoom-out"
          >
            <Minus size={14} />
          </Button>
          <div className={cn('flex-1 text-center text-sm font-mono', theme.text)}>{Math.round(zoom * 100)}%</div>
          <Button
            variant="ghost"
            size="sm"
            onClick={zoomIn}
            disabled={zoom >= 4.0}
            className="p-1.5"
            data-testid="crop-zoom-in"
          >
            <Plus size={14} />
          </Button>
        </div>
        <Button variant="ghost" size="sm" onClick={resetZoom} className="w-full mt-1.5" leftIcon={<ZoomIn size={14} />}>
          {t('crop.fitToView', 'Fit to view')}
        </Button>
      </div>

      {/* Detection zones — #31: keyboard focusable */}
      <div>
        <h4 className={cn('text-sm font-semibold uppercase tracking-wider mb-2', theme.textMuted)}>
          {t('crop.detectionZones', 'Detection Zones')}
        </h4>
        {detectionBoxes.length === 0 && !isDetecting ? (
          <p className={cn('text-sm italic', theme.textMuted)}>{t('crop.noZones', 'No zones detected')}</p>
        ) : (
          <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
            {detectionBoxes.map((box, idx) => {
              const level = getConfidenceLevel(box.confidence);
              const zoneKey = `zone-${box.x}-${box.y}-${box.width}-${box.height}`;
              return (
                <div
                  key={zoneKey}
                  className={cn(
                    'flex items-center justify-between px-2 py-1.5 rounded-lg',
                    'bg-white/5 border border-white/10',
                    'text-sm',
                    highlightedZoneIndex === idx && 'ring-1 ring-[var(--matrix-accent)] bg-[var(--matrix-accent)]/10',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onZoneActivate(idx)}
                    className={cn(
                      'flex items-center gap-2 flex-1',
                      'cursor-pointer hover:opacity-80 transition-opacity',
                      'focus:outline-none focus:ring-1 focus:ring-[var(--matrix-accent)] rounded',
                    )}
                  >
                    <span className={cn('font-bold', theme.text)}>#{idx + 1}</span>
                    <Badge variant={level === 'high' ? 'success' : level === 'medium' ? 'warning' : 'error'} size="sm">
                      {formatConfidence(box.confidence)}
                    </Badge>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDetectionBox(idx)}
                    className="text-[var(--matrix-text-secondary)] hover:text-red-400 transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Undo/Redo buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={undo}
          disabled={!canUndo}
          className="flex-1"
          leftIcon={<Undo2 size={14} />}
          title="Ctrl+Z"
          data-testid="crop-undo-btn"
        >
          {t('crop.undo', 'Undo')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={redo}
          disabled={!canRedo}
          className="flex-1"
          leftIcon={<Redo2 size={14} />}
          title="Ctrl+Shift+Z"
          data-testid="crop-redo-btn"
        >
          {t('crop.redo', 'Redo')}
        </Button>
      </div>

      {/* Reset button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onReset}
        className="w-full"
        leftIcon={<RotateCcw size={14} />}
        data-testid="crop-reset-btn"
      >
        {t('crop.resetAll', 'Reset All')}
      </Button>
    </Card>
  );
});
CropToolbar.displayName = 'CropToolbar';

export default CropToolbar;

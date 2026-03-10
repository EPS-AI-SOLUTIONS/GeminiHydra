// src/features/crop/components/CropCanvas.tsx
/**
 * Canvas-based image display with AI detection zone overlays and zoom.
 * Supports mouse-drag drawing of manual bounding boxes.
 */

import { Scan } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProgressBar } from '@/components/atoms';
import type { BoundingBox } from '@/features/crop/stores/cropStore';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';
import BoxOverlay from './BoxOverlay';
import { fadeIn } from './cropConstants';

export interface CropCanvasProps {
  src: string;
  alt: string;
  boxes: BoundingBox[];
  isDetecting: boolean;
  onRemoveBox: (index: number) => void;
  zoom: number;
  highlightedZoneIndex: number | null;
  isDrawingMode: boolean;
  onDrawComplete: (box: BoundingBox) => void;
}

const CropCanvas = memo(function CropCanvas({
  src,
  alt,
  boxes,
  isDetecting,
  onRemoveBox,
  zoom,
  highlightedZoneIndex,
  isDrawingMode,
  onDrawComplete,
}: CropCanvasProps) {
  const theme = useViewTheme();
  const { t } = useTranslation();
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [imgLayout, setImgLayout] = useState<{
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // #29: Drawing state
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  // ── RAF-throttled layout update for zoom/pan (debounced to 60fps) ──
  const rafIdRef = useRef<number | null>(null);

  const updateLayout = useCallback(() => {
    // Cancel any pending RAF to avoid redundant redraws
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const container = containerRef.current;
      const img = imgRef.current;
      if (!container || !img || !img.naturalWidth || !img.naturalHeight) return;

      const containerW = container.clientWidth;
      const containerH = container.clientHeight;
      const scale = Math.min(containerW / img.naturalWidth, containerH / img.naturalHeight);
      const renderedW = img.naturalWidth * scale;
      const renderedH = img.naturalHeight * scale;

      setImgLayout({
        width: renderedW,
        height: renderedH,
        offsetX: (containerW - renderedW) / 2,
        offsetY: (containerH - renderedH) / 2,
      });
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const img = imgRef.current;
    if (!container || !img) return;

    img.addEventListener('load', updateLayout);
    const observer = new ResizeObserver(updateLayout);
    observer.observe(container);

    if (img.complete) updateLayout();

    return () => {
      img.removeEventListener('load', updateLayout);
      observer.disconnect();
      // Cleanup pending RAF on unmount
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [updateLayout]);

  // #29: Convert mouse position to normalized 0-1000 coords relative to the overlay
  const toNormalized = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const overlay = overlayRef.current;
      if (!overlay || !imgLayout) return null;
      const rect = overlay.getBoundingClientRect();
      const px = ((clientX - rect.left) / rect.width) * 1000;
      const py = ((clientY - rect.top) / rect.height) * 1000;
      return { x: Math.max(0, Math.min(1000, px)), y: Math.max(0, Math.min(1000, py)) };
    },
    [imgLayout],
  );

  // #29: Mouse handlers for drawing mode
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawingMode) return;
      const pt = toNormalized(e.clientX, e.clientY);
      if (pt) {
        setDrawStart(pt);
        setDrawCurrent(pt);
      }
    },
    [isDrawingMode, toNormalized],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDrawingMode || !drawStart) return;
      const pt = toNormalized(e.clientX, e.clientY);
      if (pt) {
        setDrawCurrent(pt);
      }
    },
    [isDrawingMode, drawStart, toNormalized],
  );

  const handleMouseUp = useCallback(() => {
    if (!isDrawingMode || !drawStart || !drawCurrent) return;

    const x = Math.min(drawStart.x, drawCurrent.x);
    const y = Math.min(drawStart.y, drawCurrent.y);
    const w = Math.abs(drawCurrent.x - drawStart.x);
    const h = Math.abs(drawCurrent.y - drawStart.y);

    // Minimum size threshold (20 in 0-1000 space = 2% of image)
    if (w > 20 && h > 20) {
      onDrawComplete({
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(w),
        height: Math.round(h),
        confidence: 1.0,
        label: 'manual',
        rotation_angle: 0,
        contour: [],
        needs_outpaint: false,
      });
    }

    setDrawStart(null);
    setDrawCurrent(null);
  }, [isDrawingMode, drawStart, drawCurrent, onDrawComplete]);

  // #29: Compute the preview rectangle style for drawing
  const drawPreviewStyle =
    drawStart && drawCurrent
      ? {
          left: `${Math.min(drawStart.x, drawCurrent.x) / 10}%`,
          top: `${Math.min(drawStart.y, drawCurrent.y) / 10}%`,
          width: `${Math.abs(drawCurrent.x - drawStart.x) / 10}%`,
          height: `${Math.abs(drawCurrent.y - drawStart.y) / 10}%`,
        }
      : null;

  return (
    <div ref={containerRef} className={cn('relative w-full h-full select-none', isDrawingMode && 'cursor-crosshair')}>
      {/* Zoom wrapper — centers the image+overlay group */}
      <div
        className="w-full h-full flex items-center justify-center overflow-hidden"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
      >
        {/* Image + overlay wrapper — sized to exact rendered dimensions */}
        <div
          className="relative flex-shrink-0"
          style={imgLayout ? { width: imgLayout.width, height: imgLayout.height } : undefined}
        >
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className="w-full h-full rounded-lg"
            style={
              imgLayout
                ? { width: imgLayout.width, height: imgLayout.height }
                : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
            }
            draggable={false}
          />

          {/* Bounding box overlays — inside the same wrapper, percentage coords work directly */}
          {imgLayout && !isDetecting && (
            <div
              ref={overlayRef}
              className="absolute inset-0 pointer-events-auto"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <AnimatePresence>
                {boxes.map((box, idx) => (
                  <BoxOverlay
                    // biome-ignore lint/suspicious/noArrayIndexKey: boxes reordered by user
                    key={idx}
                    box={box}
                    index={idx}
                    isHighlighted={highlightedZoneIndex === idx}
                    onRemove={onRemoveBox}
                  />
                ))}
              </AnimatePresence>

              {/* #29: Drawing preview rectangle */}
              {drawPreviewStyle && (
                <div
                  className="absolute border-2 border-dashed border-[var(--matrix-accent)] bg-[var(--matrix-accent)]/10 pointer-events-none"
                  style={drawPreviewStyle}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detection in progress overlay */}
      {isDetecting && (
        <motion.div {...fadeIn} className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
          <div className="text-center space-y-3">
            <Scan size={48} className="mx-auto text-[var(--matrix-accent)] animate-pulse" />
            <p className={cn('text-sm font-medium', theme.text)}>
              {t('crop.detectingPhotos', 'AI detecting photos in scan...')}
            </p>
            {/* #16: Phase text alongside progress bar */}
            <div className="w-48 mx-auto space-y-1">
              <ProgressBar size="sm" />
              <p className={cn('text-xs animate-pulse', theme.textMuted)}>
                {t('crop.detectingPhase', 'AI detecting photos in scan...')}
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
});
CropCanvas.displayName = 'CropCanvas';

export default CropCanvas;

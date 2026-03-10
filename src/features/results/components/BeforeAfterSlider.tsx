// src/features/results/components/BeforeAfterSlider.tsx
/**
 * BeforeAfterSlider — image comparison slider and side-by-side view.
 *
 * Features:
 * - Slider-based overlay comparison with drag handle
 * - Side-by-side view with pan/zoom
 * - Keyboard navigation (arrow keys)
 * - Progressive image loading via ProgressiveImage
 */

import { Badge, Card, cn } from '@jaskier/ui';
import { SlidersHorizontal } from 'lucide-react';
import { motion } from 'motion/react';
import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { ViewTheme } from '@/shared/hooks/useViewTheme';
import { ProgressiveImage } from './ProgressiveImage';

// ============================================
// COMPARISON SLIDER
// ============================================

export interface ComparisonSliderProps {
  originalSrc: string;
  restoredSrc: string;
  sliderPosition: number;
  onSliderChange: (position: number) => void;
  rotation: number;
  zoom: number;
  pan: { x: number; y: number };
  onPanChange: (x: number, y: number) => void;
  theme: ViewTheme;
}

export const ComparisonSlider = memo(function ComparisonSlider({
  originalSrc,
  restoredSrc,
  sliderPosition,
  onSliderChange,
  rotation,
  zoom,
  pan,
  onPanChange,
}: ComparisonSliderProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const [showPulse, setShowPulse] = useState(true);

  // Stop pulsing animation after 2 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowPulse(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  // Keyboard slider control (Left/Right arrows)
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onSliderChange(Math.max(0, sliderPosition - 5));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onSliderChange(Math.min(100, sliderPosition + 5));
      }
    },
    [onSliderChange, sliderPosition],
  );

  // Track container width for correct original image sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.offsetWidth);
    return () => observer.disconnect();
  }, []);

  const updatePosition = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const pct = Math.min(100, Math.max(0, (x / rect.width) * 100));
      onSliderChange(pct);
    },
    [onSliderChange],
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const sliderX = (sliderPosition / 100) * rect.width;

      // If near the slider line (within 30px), use slider mode
      if (Math.abs(x - sliderX) < 30 || zoom <= 1) {
        setIsDragging(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        updatePosition(e.clientX);
      } else if (zoom > 1) {
        // Pan mode
        setIsPanning(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      }
    },
    [updatePosition, zoom, sliderPosition, pan],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (isDragging) {
        updatePosition(e.clientX);
      } else if (isPanning && panStartRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        onPanChange(panStartRef.current.panX + dx, panStartRef.current.panY + dy);
      }
    },
    [isDragging, isPanning, updatePosition, onPanChange],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  const transformStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
    transition: 'transform 0.3s ease-out',
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="slider"
      aria-label={t('results.comparisonSlider', 'Before/after comparison slider')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(sliderPosition)}
      className={cn(
        'relative w-full overflow-hidden rounded-xl select-none outline-none',
        'max-h-[calc(100vh-18rem)]',
        'focus-visible:ring-2 focus-visible:ring-[var(--matrix-accent)] focus-visible:ring-offset-2',
        zoom > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-col-resize',
      )}
      data-testid="results-comparison-slider"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      {/* Restored (full, behind) */}
      <div className="relative w-full" style={transformStyle}>
        <ProgressiveImage
          src={restoredSrc}
          alt={t('results.restored', 'Restored')}
          className="w-full h-auto block max-h-[calc(100vh-18rem)] object-contain"
        />
      </div>

      {/* Original (clipped) */}
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPosition}%` }}>
        <div style={{ ...transformStyle, width: containerWidth || '100%' }}>
          <ProgressiveImage
            src={originalSrc}
            alt={t('results.original', 'Original')}
            className="h-auto block max-h-[calc(100vh-18rem)] object-contain"
            style={{ width: containerWidth || '100%' }}
          />
        </div>
      </div>

      {/* Slider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)] z-10"
        style={{ left: `${sliderPosition}%` }}
      >
        {/* Handle — 48x48 with attention pulse on first render */}
        <motion.div
          animate={showPulse ? { scale: [1, 1.1, 1] } : undefined}
          transition={showPulse ? { repeat: 2, duration: 0.8 } : undefined}
          className={cn(
            'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'w-12 h-12 rounded-full bg-white/20 backdrop-blur-md',
            'border-2 border-white/60 shadow-lg',
            'flex items-center justify-center touch-none',
            isDragging && 'scale-110',
          )}
          style={{ transition: 'transform 0.15s ease' }}
        >
          <SlidersHorizontal size={18} className="text-white" />
        </motion.div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 z-10">
        <Badge variant="default" size="sm">
          {t('results.original', 'Original')}
        </Badge>
      </div>
      <div className="absolute top-3 right-3 z-10">
        <Badge variant="accent" size="sm">
          {t('results.restored', 'Restored')}
        </Badge>
      </div>
    </div>
  );
});

ComparisonSlider.displayName = 'ComparisonSlider';

// ============================================
// SIDE-BY-SIDE VIEW
// ============================================

export interface SideBySideProps {
  originalSrc: string;
  restoredSrc: string;
  rotation: number;
  zoom: number;
  pan: { x: number; y: number };
  onPanChange: (x: number, y: number) => void;
  theme: ViewTheme;
}

export const SideBySideView = memo(function SideBySideView({
  originalSrc,
  restoredSrc,
  rotation,
  zoom,
  pan,
  onPanChange,
  theme,
}: SideBySideProps) {
  const { t } = useTranslation();
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const transformStyle = {
    transform: `translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
    transition: 'transform 0.3s ease-out',
  };

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (zoom <= 1) return;
      setIsPanning(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [zoom, pan],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!isPanning || !panStartRef.current) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      onPanChange(panStartRef.current.panX + dx, panStartRef.current.panY + dy);
    },
    [isPanning, onPanChange],
  );

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  return (
    <div
      className={cn(
        'grid grid-cols-1 md:grid-cols-2 gap-4 select-none',
        zoom > 1 ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : '',
      )}
      data-testid="results-side-by-side"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      {/* Original */}
      <Card variant="glass" padding="sm">
        <h4 className={cn('text-sm font-semibold mb-2 px-1', theme.textMuted)}>{t('results.original', 'Original')}</h4>
        <div className="overflow-hidden rounded-lg">
          <ProgressiveImage
            src={originalSrc}
            alt={t('results.original', 'Original')}
            className="w-full h-auto max-h-[calc(100vh-20rem)] object-contain"
            style={transformStyle}
          />
        </div>
      </Card>

      {/* Restored */}
      <Card variant="glass" padding="sm">
        <h4 className={cn('text-sm font-semibold mb-2 px-1', theme.textAccent)}>{t('results.restored', 'Restored')}</h4>
        <div className="overflow-hidden rounded-lg">
          <ProgressiveImage
            src={restoredSrc}
            alt={t('results.restored', 'Restored')}
            className="w-full h-auto max-h-[calc(100vh-20rem)] object-contain"
            style={transformStyle}
          />
        </div>
      </Card>
    </div>
  );
});

SideBySideView.displayName = 'SideBySideView';

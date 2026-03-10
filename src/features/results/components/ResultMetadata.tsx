// src/features/results/components/ResultMetadata.tsx
/**
 * ResultMetadata — displays restoration details: improvements, timing,
 * provider, resolution, and upscale factor.
 */

import { Badge, Card } from '@jaskier/ui';
import { AlertTriangle, CheckCircle, Clock, ImageIcon, Maximize2 } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';
import { formatMs, formatTimestamp } from '@/shared/utils/formatters';

// ============================================
// TYPES
// ============================================

export interface ResultMetadataProps {
  improvements: string[];
  processingTimeMs: number;
  providerUsed: string;
  timestamp: string;
  fileName: string;
  imageDimensions: {
    original: { w: number; h: number } | null;
    restored: { w: number; h: number } | null;
  };
  upscaleFactor: number | null;
  safetyFallback?: boolean;
  theme: ViewTheme;
}

// ============================================
// COMPONENT
// ============================================

export const ResultMetadata = memo(function ResultMetadata({
  improvements,
  processingTimeMs,
  providerUsed,
  timestamp,
  fileName,
  imageDimensions,
  upscaleFactor,
  safetyFallback,
  theme,
}: ResultMetadataProps) {
  const { t } = useTranslation();
  return (
    <Card variant="glass" padding="md" className="space-y-3">
      <h3 className={cn('text-sm font-semibold flex items-center gap-2', theme.title)}>
        <CheckCircle size={14} className={theme.iconAccent} />
        {t('results.details', 'Restoration Details')}
      </h3>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className={cn('p-3 rounded-lg text-center', theme.accentBg)}>
          <div className={cn('text-lg font-bold', theme.textAccent)}>{improvements.length}</div>
          <div className={cn('text-sm', theme.textMuted)}>{t('results.improvementsCount', 'Improvements')}</div>
        </div>
        <div className={cn('p-3 rounded-lg text-center', theme.accentBg)}>
          <div className={cn('text-lg font-bold', theme.textAccent)}>{formatMs(processingTimeMs)}</div>
          <div className={cn('text-sm', theme.textMuted)}>{t('results.time', 'Time')}</div>
        </div>
        <div className={cn('p-3 rounded-lg text-center', theme.accentBg)}>
          <div className={cn('text-lg font-bold capitalize', theme.textAccent)}>{providerUsed}</div>
          <div className={cn('text-sm', theme.textMuted)}>{t('results.provider', 'Provider')}</div>
        </div>
        <div className={cn('p-3 rounded-lg text-center', theme.accentBg)}>
          <div className={cn('flex items-center justify-center gap-1', theme.textAccent)}>
            <Clock size={16} />
            <span className="text-sm font-bold">{formatTimestamp(timestamp)}</span>
          </div>
          <div className={cn('text-sm', theme.textMuted)}>{t('results.completed', 'Completed')}</div>
        </div>
      </div>

      {/* Safety fallback warning */}
      {safetyFallback && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
          <AlertTriangle size={14} className="text-yellow-400 shrink-0" />
          <span className="text-xs text-yellow-300">
            {t(
              'results.safetyFallback',
              'Safety filter triggered — restored with reduced resolution. Quality may be lower than usual.',
            )}
          </span>
        </div>
      )}

      {/* File name */}
      <div className="flex items-center gap-2">
        <ImageIcon size={14} className={theme.iconMuted} />
        <span className={cn('text-sm font-mono truncate', theme.textMuted)}>{fileName}</span>
      </div>

      {/* Resolution info */}
      {imageDimensions.restored && (
        <div className="flex items-center gap-2">
          <Maximize2 size={14} className={theme.iconMuted} />
          <span className={cn('text-sm font-mono', theme.textMuted)}>
            {t('results.resolution', 'Resolution')}: {imageDimensions.restored.w} x {imageDimensions.restored.h}
            {imageDimensions.original && (
              <span className={cn('ml-2', theme.textMuted)}>
                ({t('results.originalRes', 'original')}: {imageDimensions.original.w} x {imageDimensions.original.h})
              </span>
            )}
          </span>
          {upscaleFactor && (
            <Badge variant="accent" size="sm">
              {upscaleFactor}x {t('results.upscale', 'upscale')}
            </Badge>
          )}
        </div>
      )}

      {/* Improvements tags */}
      {improvements.length > 0 && (
        <div>
          <p className={cn('text-sm font-semibold mb-2', theme.textMuted)}>
            {t('results.improvements', 'Applied improvements')}:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {improvements.map((imp) => (
              <Badge key={imp} variant="default" size="sm">
                {imp}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
});

ResultMetadata.displayName = 'ResultMetadata';

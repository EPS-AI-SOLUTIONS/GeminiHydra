// src/features/crop/components/CropHeader.tsx
/**
 * Header bar for CropView: title, detection status, photo navigation,
 * progress bar, and processing phase text.
 */

import { ArrowLeft, ArrowRight, Crop, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, ProgressBar } from '@/components/atoms';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';
import { expandIn } from './cropConstants';

export interface CropHeaderProps {
  /** Number of detected bounding boxes */
  detectionCount: number;
  /** Whether AI detection is running */
  isDetecting: boolean;
  /** Whether crop/restore is in progress */
  isCropping: boolean;
  /** Current processing phase text */
  processingPhase: string | null;
  /** SSE stream progress bar value (0-100, undefined = hidden) */
  streamProgress: number | undefined;
  /** Total number of uploaded photos */
  photoCount: number;
  /** Currently active photo index */
  activePhotoIndex: number;
  /** Callback to change the active photo */
  setActivePhotoIndex: (index: number) => void;
}

const CropHeader = memo(function CropHeader({
  detectionCount,
  isDetecting,
  isCropping,
  processingPhase,
  streamProgress,
  photoCount,
  activePhotoIndex,
  setActivePhotoIndex,
}: CropHeaderProps) {
  const theme = useViewTheme();
  const { t } = useTranslation();

  return (
    <div className="mb-4">
      <div className={cn('flex', photoCount > 1 ? 'flex-col gap-2' : 'items-center justify-between')}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[var(--matrix-accent)]/10 relative">
            {isDetecting ? (
              <Loader2 className="text-[var(--matrix-accent)] animate-spin" size={24} />
            ) : (
              <Crop className="text-[var(--matrix-accent)]" size={24} />
            )}
          </div>
          <div>
            <h2 className={cn('text-2xl font-bold', theme.title)} data-testid="crop-heading">
              {t('crop.title', 'Crop & Detect')}
            </h2>
            <p className={theme.textMuted}>
              {isDetecting ? (
                t('crop.analyzing', 'Analyzing image for photos...')
              ) : processingPhase ? (
                processingPhase
              ) : (
                <>
                  {/* #40: Animated counter on detection count */}
                  <motion.span
                    key={detectionCount}
                    initial={{ scale: 1.3, opacity: 0.5 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="inline-block"
                  >
                    {detectionCount}
                  </motion.span>{' '}
                  {t('crop.photosDetectedSuffix', 'photo(s) detected')}
                </>
              )}
            </p>
            {streamProgress !== undefined && <ProgressBar value={streamProgress} size="sm" className="mt-1 w-48" />}
          </div>
        </div>

        {/* #21: Photo navigation on its own row when multiple photos */}
        {photoCount > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (activePhotoIndex > 0) {
                  setActivePhotoIndex(activePhotoIndex - 1);
                }
              }}
              disabled={activePhotoIndex <= 0 || isDetecting || isCropping}
              className="p-1.5"
            >
              <ArrowLeft size={16} />
            </Button>
            <Badge variant="accent" size="md">
              {t('crop.photoOf', 'Photo {{current}} of {{total}}', {
                current: activePhotoIndex + 1,
                total: photoCount,
              })}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (activePhotoIndex < photoCount - 1) {
                  setActivePhotoIndex(activePhotoIndex + 1);
                }
              }}
              disabled={activePhotoIndex >= photoCount - 1 || isDetecting || isCropping}
              className="p-1.5"
            >
              <ArrowRight size={16} />
            </Button>
          </div>
        )}
      </div>

      {/* Detection progress — #16: enhanced with phase info */}
      {isDetecting && (
        <motion.div {...expandIn} className="mt-3">
          <ProgressBar size="sm" />
          <p className={cn('text-sm mt-1 animate-pulse', theme.textMuted)}>
            {t('crop.analyzingScanPhase', 'AI detecting photos in scan... this may take a few seconds')}
          </p>
        </motion.div>
      )}
    </div>
  );
});
CropHeader.displayName = 'CropHeader';

export default CropHeader;

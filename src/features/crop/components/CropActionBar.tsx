// src/features/crop/components/CropActionBar.tsx
/**
 * Bottom action bar for CropView: back button, file name badge,
 * "Restore All" (multi-photo) and "Apply & Restore" buttons.
 */

import { ArrowLeft, ArrowRight, Images, Loader2 } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button } from '@/components/atoms';

export interface CropActionBarProps {
  /** Name of the current photo */
  currentPhotoName: string;
  /** Total number of uploaded photos */
  photoCount: number;
  /** Whether AI detection is running */
  isDetecting: boolean;
  /** Whether crop/restore is in progress */
  isCropping: boolean;
  /** Current processing phase text (null = not processing) */
  processingPhase: string | null;

  onBack: () => void;
  onApplyCrop: () => void;
  onApplyAllPhotos: () => void;
}

const CropActionBar = memo(function CropActionBar({
  currentPhotoName,
  photoCount,
  isDetecting,
  isCropping,
  processingPhase,
  onBack,
  onApplyCrop,
  onApplyAllPhotos,
}: CropActionBarProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-4 flex items-center justify-between">
      <Button variant="ghost" size="md" onClick={onBack} leftIcon={<ArrowLeft size={16} />} data-testid="crop-back-btn">
        {t('crop.backToUpload', 'Back to Upload')}
      </Button>

      <div className="flex items-center gap-3">
        {/* File name badge */}
        <Badge variant="default" size="sm" className="max-w-[200px] truncate">
          {currentPhotoName}
        </Badge>

        {photoCount > 1 && !processingPhase && (
          <Button
            variant="primary"
            size="lg"
            onClick={onApplyAllPhotos}
            disabled={isDetecting || isCropping}
            leftIcon={<Images size={18} />}
            rightIcon={isCropping ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            data-testid="crop-apply-all-btn"
          >
            {t('crop.restoreAll', 'Restore All ({{count}})', { count: photoCount })}
          </Button>
        )}

        {/* #42: Contextual button label */}
        <Button
          variant="primary"
          size="lg"
          onClick={onApplyCrop}
          disabled={isDetecting || isCropping}
          rightIcon={isCropping ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
          data-testid="crop-apply-btn"
        >
          {processingPhase ??
            (photoCount > 1
              ? t('crop.restoreThisPhoto', 'Restore This Photo')
              : t('crop.applyRestore', 'Apply & Restore'))}
        </Button>
      </div>
    </div>
  );
});
CropActionBar.displayName = 'CropActionBar';

export default CropActionBar;

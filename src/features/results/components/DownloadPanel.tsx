// src/features/results/components/DownloadPanel.tsx
/**
 * DownloadPanel — bottom download card showing download button
 * and current save directory info.
 */

import { Button, Card, cn } from '@jaskier/ui';
import { Download, FolderOpen } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ViewTheme } from '@/shared/hooks/useViewTheme';

// ============================================
// TYPES
// ============================================

export interface DownloadPanelProps {
  onDownloadRestored: () => void;
  isDownloading: boolean;
  supportsDirectoryPicker: boolean;
  saveDirectoryName: string | null;
  theme: ViewTheme;
}

// ============================================
// COMPONENT
// ============================================

export const DownloadPanel = memo(function DownloadPanel({
  onDownloadRestored,
  isDownloading,
  supportsDirectoryPicker,
  saveDirectoryName,
  theme,
}: DownloadPanelProps) {
  const { t } = useTranslation();

  return (
    <Card variant="glass" padding="md">
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Download size={14} />}
          onClick={onDownloadRestored}
          isLoading={isDownloading}
          data-testid="results-download-restored"
        >
          {t('results.downloadRestored', 'Restored Image')}
        </Button>
        {supportsDirectoryPicker && saveDirectoryName && (
          <span className={cn('text-xs flex items-center gap-1.5', theme.textMuted)}>
            <FolderOpen size={12} />
            {t('results.savingTo', 'Saving to')} {saveDirectoryName}
          </span>
        )}
      </div>
    </Card>
  );
});

DownloadPanel.displayName = 'DownloadPanel';

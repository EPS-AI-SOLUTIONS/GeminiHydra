// src/features/results/components/ResultActions.tsx
/**
 * ResultActions — header action buttons for the results view.
 * Includes save to history, restore another, animate, OCR, folder selection,
 * download all, and download single.
 */

import { Badge, Button } from '@jaskier/ui';
import {
  BookmarkPlus,
  CheckCircle,
  Clapperboard,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

// ============================================
// TYPES
// ============================================

export interface ResultActionsProps {
  savedToHistory: boolean;
  onSaveToHistory: () => void;
  onRestoreAnother: () => void;
  onAnimate: () => void;
  onExtractText: () => void;
  isOcrProcessing: boolean;
  hasOcrResult: boolean;
  saveDirectoryName: string | null;
  onClearSaveDirectory: () => void;
  backendOutputDir: string;
  supportsDirectoryPicker: boolean;
  onChooseFolder: () => void;
  imageCount: number;
  onDownloadAll: () => void;
  onDownloadRestored: () => void;
  isDownloading: boolean;
}

// ============================================
// COMPONENT
// ============================================

export const ResultActions = memo(function ResultActions({
  savedToHistory,
  onSaveToHistory,
  onRestoreAnother,
  onAnimate,
  onExtractText,
  isOcrProcessing,
  hasOcrResult,
  saveDirectoryName,
  onClearSaveDirectory,
  backendOutputDir,
  supportsDirectoryPicker,
  onChooseFolder,
  imageCount,
  onDownloadAll,
  onDownloadRestored,
  isDownloading,
}: ResultActionsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        leftIcon={savedToHistory ? <CheckCircle size={14} /> : <BookmarkPlus size={14} />}
        onClick={onSaveToHistory}
        disabled={savedToHistory}
        data-testid="results-save-btn"
      >
        <span className="hidden sm:inline">
          {savedToHistory ? t('results.saved', 'Saved') : t('results.saveToHistory', 'Save to History')}
        </span>
      </Button>
      <Button variant="secondary" size="sm" leftIcon={<Upload size={14} />} onClick={onRestoreAnother}>
        <span className="hidden sm:inline">{t('results.restoreAnother', 'Restore Another')}</span>
      </Button>
      <Button variant="secondary" size="sm" leftIcon={<Clapperboard size={14} />} onClick={onAnimate}>
        <span className="hidden sm:inline">{t('results.animatePhoto', 'Animate')}</span>
      </Button>
      <Button
        variant="secondary"
        size="sm"
        leftIcon={isOcrProcessing ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
        onClick={onExtractText}
        disabled={isOcrProcessing}
      >
        <span className="hidden sm:inline">
          {hasOcrResult ? t('results.textExtracted', 'Text') : t('results.extractText', 'Extract Text')}
        </span>
      </Button>
      {saveDirectoryName ? (
        <Badge variant="accent" size="sm" className="flex items-center gap-1.5 cursor-default">
          <FolderOpen size={12} />
          <span className="max-w-[120px] truncate">{saveDirectoryName}</span>
          <button
            type="button"
            onClick={onClearSaveDirectory}
            className="ml-0.5 hover:text-[var(--matrix-error)] transition-colors"
            aria-label={t('results.clearFolder', 'Clear save folder')}
          >
            <X size={12} />
          </button>
        </Badge>
      ) : backendOutputDir ? (
        <Badge variant="accent" size="sm" className="flex items-center gap-1.5 cursor-default">
          <FolderOpen size={12} />
          <span className="max-w-[120px] truncate">{backendOutputDir.split(/[/\\]/).pop() ?? backendOutputDir}</span>
        </Badge>
      ) : supportsDirectoryPicker ? (
        <Button variant="ghost" size="sm" leftIcon={<FolderOpen size={14} />} onClick={onChooseFolder}>
          <span className="hidden sm:inline">{t('results.chooseFolder', 'Folder zapisu')}</span>
        </Button>
      ) : null}
      {imageCount > 1 && (
        <Button
          variant="primary"
          size="sm"
          leftIcon={<Download size={14} />}
          onClick={onDownloadAll}
          isLoading={isDownloading}
        >
          <span className="hidden sm:inline">
            {t('results.downloadAllShort', 'Download All ({{count}})', { count: imageCount })}
          </span>
        </Button>
      )}
      <Button
        variant="primary"
        size="sm"
        leftIcon={<Download size={14} />}
        isLoading={isDownloading}
        onClick={onDownloadRestored}
        data-testid="results-download-btn"
      >
        <span className="hidden sm:inline">{t('common.download', 'Download')}</span>
      </Button>
    </div>
  );
});

ResultActions.displayName = 'ResultActions';

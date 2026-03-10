// src/features/results/components/ResultsView.tsx
/**
 * ResultsView - Phase 4
 * =====================
 * Display restoration results with before/after comparison.
 *
 * Features:
 * - Slider-based before/after comparison
 * - Side-by-side toggle
 * - Download button (original + restored)
 * - Rotate controls (left/right)
 * - Zoom controls (in/out/reset)
 * - Image metadata display
 * - "Restore Another" navigation to upload
 * - "Save to History" action
 * - Glass panel controls
 * - Responsive layout
 *
 * Sub-components:
 * - BeforeAfterSlider (ComparisonSlider + SideBySideView)
 * - ResultControls
 * - ResultFilmstrip
 * - ResultActions
 * - ResultMetadata
 * - DownloadPanel
 */

import { Button } from '@jaskier/ui';
import { CheckCircle, ImageIcon, Upload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EmptyState } from '@/components/molecules/EmptyState';
import { OcrResultPanel } from '@/components/molecules/OcrResultPanel';
import { useAnimateStore } from '@/features/animate/stores/animateStore';
import { performOcr } from '@/features/ocr/api/ocrApi';
import { useRestoreStream } from '@/features/restore/hooks/useRestoreStream';
import { useRestoreStore } from '@/features/restore/stores/restoreStore';
import { useResultsStore } from '@/features/results/stores/resultsStore';
import { useUploadStore } from '@/features/upload/stores/uploadStore';
import { apiPost } from '@/shared/api/client';
import type { OcrResponse, SaveImageResponse } from '@/shared/api/schemas';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';
import { saveToDirectory, urlToBlob } from '@/shared/utils/fileSystemAccess';
import { useViewStore } from '@/stores/viewStore';

// Sub-components
import { ComparisonSlider, SideBySideView } from './BeforeAfterSlider';
import { DownloadPanel } from './DownloadPanel';
import { ResultActions } from './ResultActions';
import { ResultControls } from './ResultControls';
import { ResultFilmstrip } from './ResultFilmstrip';
import { ResultMetadata } from './ResultMetadata';
import { downloadImage } from './resultsUtils';

// ============================================
// MAIN COMPONENT
// ============================================

export function ResultsView() {
  const theme = useViewTheme();
  const { t } = useTranslation();
  const setView = useViewStore((s) => s.setView);

  // Results store
  const comparisonMode = useResultsStore((s) => s.comparisonMode);
  const setComparisonMode = useResultsStore((s) => s.setComparisonMode);
  const sliderPosition = useResultsStore((s) => s.sliderPosition);
  const setSliderPosition = useResultsStore((s) => s.setSliderPosition);
  const transform = useResultsStore((s) => s.transform);
  const rotateLeft = useResultsStore((s) => s.rotateLeft);
  const rotateRight = useResultsStore((s) => s.rotateRight);
  const zoomIn = useResultsStore((s) => s.zoomIn);
  const zoomOut = useResultsStore((s) => s.zoomOut);
  const resetZoom = useResultsStore((s) => s.resetZoom);
  const setPan = useResultsStore((s) => s.setPan);
  const images = useResultsStore((s) => s.images);
  const activeIndex = useResultsStore((s) => s.activeIndex);
  const setActiveIndex = useResultsStore((s) => s.setActiveIndex);
  const savedToHistory = useResultsStore((s) => s.savedToHistory);
  const setSavedToHistory = useResultsStore((s) => s.setSavedToHistory);
  const isDownloading = useResultsStore((s) => s.isDownloading);
  const setIsDownloading = useResultsStore((s) => s.setIsDownloading);
  const saveDirectoryHandle = useResultsStore((s) => s.saveDirectoryHandle);
  const saveDirectoryName = useResultsStore((s) => s.saveDirectoryName);
  const setSaveDirectory = useResultsStore((s) => s.setSaveDirectory);
  const clearSaveDirectory = useResultsStore((s) => s.clearSaveDirectory);
  const updateRestoredImage = useResultsStore((s) => s.updateRestoredImage);
  const resultsReset = useResultsStore((s) => s.reset);

  const supportsDirectoryPicker = 'showDirectoryPicker' in window;

  // Backend-persisted output directory
  const { data: settingsData } = useSettingsQuery();
  const backendOutputDir = settingsData?.output_directory ?? '';

  // Upload store — for clearing + output directory fallback
  const clearPhotos = useUploadStore((s) => s.clearPhotos);
  const uploadOutputHandle = useUploadStore((s) => s.outputDirectoryHandle);
  const uploadOutputName = useUploadStore((s) => s.outputDirectoryName);

  // Effective directory: resultsStore override, else uploadStore
  const effectiveHandle = saveDirectoryHandle ?? uploadOutputHandle;
  const effectiveName = saveDirectoryName ?? uploadOutputName;

  // Restore store — for result data fallback
  const restoreResult = useRestoreStore((s) => s.result);
  const restoreReset = useRestoreStore((s) => s.reset);

  // Determine current image data (from results store or restore store)
  const activeImage = images[activeIndex];

  // Build demo data if images not explicitly set but restore result exists
  const hasContent = activeImage !== undefined || restoreResult !== null;

  const displayData =
    activeImage ??
    (restoreResult
      ? {
          originalImage: restoreResult.originalImage,
          restoredImage: restoreResult.restoredImage,
          fileName: restoreResult.fileName,
          mimeType: restoreResult.mimeType,
          improvements: restoreResult.improvements,
          processingTimeMs: restoreResult.processingTimeMs,
          providerUsed: restoreResult.providerUsed,
          timestamp: restoreResult.timestamp,
        }
      : null);

  // Construct image sources (handle blob:, data:, and raw base64)
  const originalSrc = displayData
    ? displayData.originalImage.startsWith('data:') || displayData.originalImage.startsWith('blob:')
      ? displayData.originalImage
      : `data:${displayData.mimeType};base64,${displayData.originalImage}`
    : '';

  const restoredSrc = displayData
    ? displayData.restoredImage.startsWith('data:') || displayData.restoredImage.startsWith('blob:')
      ? displayData.restoredImage
      : `data:${displayData.mimeType};base64,${displayData.restoredImage}`
    : '';

  // Download handlers
  const handleDownloadRestored = useCallback(async () => {
    if (!displayData) return;
    setIsDownloading(true);
    try {
      const fileName = `restored_${displayData.fileName}`;
      if (effectiveHandle) {
        // Priority 1: File System Access API (session handle)
        const blob = await urlToBlob(restoredSrc);
        if (!blob) return;
        await saveToDirectory(effectiveHandle, blob, fileName);
        toast.success(t('results.savedToFolder', 'Saved to {{folder}}', { folder: effectiveName }));
      } else if (backendOutputDir) {
        // Priority 2: Backend-persisted output directory
        const blob = await urlToBlob(restoredSrc);
        if (!blob) return;
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1] ?? '');
          };
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        await apiPost<SaveImageResponse>('/api/files/save-image', {
          image_base64: base64,
          filename: fileName,
        });
        const folderName = backendOutputDir.split(/[/\\]/).pop() ?? backendOutputDir;
        toast.success(t('upload.savedToBackend', 'Saved to {{folder}}', { folder: folderName }));
      } else {
        // Priority 3: Browser download dialog
        await downloadImage(restoredSrc, fileName);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error(t('results.downloadFailed', 'Download failed'));
      }
    } finally {
      setIsDownloading(false);
    }
  }, [displayData, restoredSrc, setIsDownloading, effectiveHandle, effectiveName, backendOutputDir, t]);

  // Save to history
  const handleSaveToHistory = useCallback(() => {
    // In a real implementation this would call the API
    setSavedToHistory(true);
  }, [setSavedToHistory]);

  // Image navigation
  const handlePrevImage = useCallback(() => {
    if (activeIndex > 0) setActiveIndex(activeIndex - 1);
  }, [activeIndex, setActiveIndex]);

  const handleNextImage = useCallback(() => {
    if (activeIndex < images.length - 1) setActiveIndex(activeIndex + 1);
  }, [activeIndex, images.length, setActiveIndex]);

  // Pan change handler
  const handlePanChange = useCallback(
    (x: number, y: number) => {
      setPan(x, y);
    },
    [setPan],
  );

  // Download all restored images (supports blob: and data: URLs)
  const handleDownloadAll = useCallback(async () => {
    if (images.length === 0) return;
    setIsDownloading(true);
    try {
      // Use pre-selected directory (results or upload), or prompt for one
      let dirHandle: FileSystemDirectoryHandle | null = effectiveHandle;
      if (!dirHandle && !backendOutputDir && 'showDirectoryPicker' in window) {
        try {
          dirHandle = await (
            window as unknown as { showDirectoryPicker: (opts: any) => Promise<any> }
          ).showDirectoryPicker({ mode: 'readwrite' });
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError') return;
          dirHandle = null;
        }
      }

      if (dirHandle) {
        // File System Access API path
        for (const img of images) {
          const src =
            img.restoredImage.startsWith('data:') || img.restoredImage.startsWith('blob:')
              ? img.restoredImage
              : `data:${img.mimeType};base64,${img.restoredImage}`;
          const blob = await urlToBlob(src);
          if (!blob) continue;
          await saveToDirectory(dirHandle, blob, `restored_${img.fileName}`);
        }
        toast.success(t('results.allSavedToFolder', 'All images saved to {{folder}}', { folder: dirHandle.name }));
        return;
      }

      if (backendOutputDir) {
        // Backend-persisted output directory path
        for (const img of images) {
          const src =
            img.restoredImage.startsWith('data:') || img.restoredImage.startsWith('blob:')
              ? img.restoredImage
              : `data:${img.mimeType};base64,${img.restoredImage}`;
          const blob = await urlToBlob(src);
          if (!blob) continue;
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1] ?? '');
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
          await apiPost<SaveImageResponse>('/api/files/save-image', {
            image_base64: base64,
            filename: `restored_${img.fileName}`,
          });
        }
        const folderName = backendOutputDir.split(/[/\\]/).pop() ?? backendOutputDir;
        toast.success(
          t('upload.batchSaveComplete', '{{count}} photos saved to {{folder}}', {
            count: images.length,
            folder: folderName,
          }),
        );
        return;
      }

      // Fallback: sequential regular downloads
      for (let idx = 0; idx < images.length; idx++) {
        const img = images[idx];
        \n
        if (!img) continue;
        const src =
          img.restoredImage.startsWith('data:') || img.restoredImage.startsWith('blob:')
            ? img.restoredImage
            : `data:${img.mimeType};base64,${img.restoredImage}`;
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            void downloadImage(src, `restored_${img.fileName}`);
            resolve();
          }, idx * 300);
        });
      }
    } finally {
      setTimeout(() => setIsDownloading(false), 500);
    }
  }, [images, setIsDownloading, effectiveHandle, backendOutputDir, t]);

  // Choose save folder
  const handleChooseFolder = useCallback(async () => {
    if (!('showDirectoryPicker' in window)) return;
    try {
      const handle = await (
        window as unknown as { showDirectoryPicker: (opts: any) => Promise<any> }
      ).showDirectoryPicker({ mode: 'readwrite' });
      setSaveDirectory(handle);
      toast.success(t('results.folderSelected', 'Save folder: {{folder}}', { folder: handle.name }));
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      toast.error(t('results.folderSelectFailed', 'Could not select folder'));
    }
  }, [setSaveDirectory, t]);

  // Restore another
  const handleRestoreAnother = useCallback(() => {
    clearPhotos();
    restoreReset();
    resultsReset();
    setView('upload');
  }, [clearPhotos, restoreReset, resultsReset, setView]);

  // Animate photo
  const animateReset = useAnimateStore((s) => s.reset);
  const setAnimateSource = useAnimateStore((s) => s.setSourceImage);
  const handleAnimate = useCallback(() => {
    if (!displayData) return;
    animateReset();
    const restoredSrcFull =
      displayData.restoredImage.startsWith('data:') || displayData.restoredImage.startsWith('blob:')
        ? displayData.restoredImage
        : `data:${displayData.mimeType};base64,${displayData.restoredImage}`;
    setAnimateSource({
      imageUrl: restoredSrcFull,
      mimeType: displayData.mimeType,
      fileName: displayData.fileName,
    });
    setView('animate');
  }, [displayData, animateReset, setAnimateSource, setView]);

  // OCR — extract text from restored image
  const [ocrResult, setOcrResult] = useState<OcrResponse | null>(null);
  const [htmlOcrResult, setHtmlOcrResult] = useState<OcrResponse | null>(null);
  const [ocrOutputFormat, setOcrOutputFormat] = useState<'text' | 'html'>('text');
  const [isOcrFormatLoading, setIsOcrFormatLoading] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const lastOcrRequestRef = useRef<{ data_base64: string; mime_type: string } | null>(null);

  const handleExtractText = useCallback(async () => {
    if (!displayData || isOcrProcessing) return;
    // Use cached result if available
    if (ocrResult) return;
    setIsOcrProcessing(true);
    try {
      // Extract base64 from restored image src
      const src = displayData.restoredImage.startsWith('data:')
        ? displayData.restoredImage
        : displayData.restoredImage.startsWith('blob:')
          ? displayData.restoredImage
          : `data:${displayData.mimeType};base64,${displayData.restoredImage}`;

      let base64Data: string;
      if (src.startsWith('data:')) {
        base64Data = src.split(',')[1] ?? '';
      } else {
        // blob: URL — convert via fetch
        const blob = await urlToBlob(src);
        if (!blob) throw new Error('Could not read image');
        const reader = new FileReader();
        base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      }

      lastOcrRequestRef.current = { data_base64: base64Data, mime_type: displayData.mimeType };
      const response = await performOcr({
        data_base64: base64Data,
        mime_type: displayData.mimeType,
      });
      setOcrResult(response);
      toast.success(
        t('results.ocrComplete', 'Text extracted — {{time}}s', {
          time: (response.processing_time_ms / 1000).toFixed(1),
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'OCR failed');
    } finally {
      setIsOcrProcessing(false);
    }
  }, [displayData, isOcrProcessing, ocrResult, t]);

  const currentOcrResult = ocrOutputFormat === 'html' && htmlOcrResult ? htmlOcrResult : ocrResult;

  const handleOcrFormatChange = useCallback(
    async (format: 'text' | 'html') => {
      setOcrOutputFormat(format);
      if (format === 'text') return;
      if (htmlOcrResult) return;
      if (!lastOcrRequestRef.current) return;
      setIsOcrFormatLoading(true);
      try {
        const response = await performOcr({ ...lastOcrRequestRef.current, output_format: 'html' });
        setHtmlOcrResult(response);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'HTML OCR failed');
        setOcrOutputFormat('text');
      } finally {
        setIsOcrFormatLoading(false);
      }
    },
    [htmlOcrResult],
  );

  // Reset OCR result when active image changes
  useEffect(() => {
    setOcrResult(null);
    setHtmlOcrResult(null);
    setOcrOutputFormat('text');
    lastOcrRequestRef.current = null;
  }, []);

  // Hold-to-compare — temporarily show only original
  const savedSliderRef = useRef(sliderPosition);
  const handleHoldOriginalStart = useCallback(() => {
    savedSliderRef.current = sliderPosition;
    setSliderPosition(100); // Show full original
  }, [sliderPosition, setSliderPosition]);

  const handleHoldOriginalEnd = useCallback(() => {
    setSliderPosition(savedSliderRef.current);
  }, [setSliderPosition]);

  // Re-restore: use SSE stream to re-restore active image with different settings
  const { startStream: reRestoreStream } = useRestoreStream();
  const [isReRestoring, setIsReRestoring] = useState(false);

  const handleReRestore = useCallback(async () => {
    if (!displayData || isReRestoring) return;
    setIsReRestoring(true);
    try {
      // Extract base64 from original image (we re-restore from original, not already-restored)
      const origSrc =
        displayData.originalImage.startsWith('data:') || displayData.originalImage.startsWith('blob:')
          ? displayData.originalImage
          : `data:${displayData.mimeType};base64,${displayData.originalImage}`;

      let base64Data: string;
      if (origSrc.startsWith('data:')) {
        base64Data = origSrc.split(',')[1] ?? '';
      } else {
        // blob: URL — convert via fetch
        const blob = await urlToBlob(origSrc);
        if (!blob) throw new Error('Could not read original image');
        const reader = new FileReader();
        base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      }

      const result = await reRestoreStream({
        image_base64: base64Data,
        mime_type: displayData.mimeType,
        file_name: displayData.fileName,
        crop_count: 1,
      });

      // Update the restored image in-place
      updateRestoredImage(activeIndex, result.restored_base64);
      toast.success(t('results.reRestoreComplete', 'Re-restore complete'));
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error(err instanceof Error ? err.message : 'Re-restore failed');
      }
    } finally {
      setIsReRestoring(false);
    }
  }, [displayData, isReRestoring, activeIndex, reRestoreStream, updateRestoredImage, t]);

  const handleReRestoreAlternative = useCallback(async () => {
    if (!displayData || isReRestoring) return;
    setIsReRestoring(true);
    try {
      const origSrc =
        displayData.originalImage.startsWith('data:') || displayData.originalImage.startsWith('blob:')
          ? displayData.originalImage
          : `data:${displayData.mimeType};base64,${displayData.originalImage}`;

      let base64Data: string;
      if (origSrc.startsWith('data:')) {
        base64Data = origSrc.split(',')[1] ?? '';
      } else {
        const blob = await urlToBlob(origSrc);
        if (!blob) throw new Error('Could not read original image');
        const reader = new FileReader();
        base64Data = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      }

      const result = await reRestoreStream({
        image_base64: base64Data,
        mime_type: displayData.mimeType,
        file_name: displayData.fileName,
        crop_count: 1,
        mode: 'alternative',
      });

      updateRestoredImage(activeIndex, result.restored_base64);
      toast.success(t('results.reRestoreComplete', 'Re-restore complete'));
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        toast.error(err instanceof Error ? err.message : 'Re-restore failed');
      }
    } finally {
      setIsReRestoring(false);
    }
  }, [displayData, isReRestoring, activeIndex, reRestoreStream, updateRestoredImage, t]);

  // Image dimensions for metadata
  const [imageDimensions, setImageDimensions] = useState<{
    original: { w: number; h: number } | null;
    restored: { w: number; h: number } | null;
  }>({ original: null, restored: null });

  useEffect(() => {
    if (!originalSrc || !restoredSrc) return;
    setImageDimensions({ original: null, restored: null });

    const loadDimensions = (src: string): Promise<{ w: number; h: number } | null> =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = src;
      });

    void Promise.all([loadDimensions(originalSrc), loadDimensions(restoredSrc)]).then(([original, restored]) =>
      setImageDimensions({ original, restored }),
    );
  }, [originalSrc, restoredSrc]);

  // Compute upscale factor
  const upscaleFactor = useMemo(() => {
    if (!imageDimensions.original || !imageDimensions.restored) return null;
    const origPixels = imageDimensions.original.w * imageDimensions.original.h;
    const resPixels = imageDimensions.restored.w * imageDimensions.restored.h;
    if (resPixels <= origPixels) return null;
    return Math.round((resPixels / origPixels) * 10) / 10;
  }, [imageDimensions]);

  // ---- Empty state ----
  if (!hasContent) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="h-full flex flex-col items-center justify-center p-6"
        data-testid="results-empty-state"
      >
        <EmptyState
          icon={ImageIcon}
          title={t('results.noResults', 'No restorations yet')}
          description={t('results.noResultsDesc', 'Upload and restore a photo to see before/after comparison results.')}
          action={
            <Button variant="primary" onClick={() => setView('upload')} leftIcon={<Upload size={16} />}>
              {t('results.uploadPhoto', 'Upload a Photo')}
            </Button>
          }
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="h-full flex flex-col"
      data-testid="results-view"
    >
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-6 py-4 border-b border-white/5"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={cn('p-2 rounded-xl flex-shrink-0', theme.accentBg)}>
            <CheckCircle size={20} className={theme.iconAccent} />
          </div>
          <div className="min-w-0">
            <h2 className={cn('text-lg font-bold', theme.title)} data-testid="results-heading">
              {t('results.title', 'Restoration Results')}
            </h2>
            <p className={cn('text-sm truncate', theme.textMuted)}>
              {displayData?.fileName ?? t('results.completedSuccess', 'Restoration completed successfully')}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <ResultActions
          savedToHistory={savedToHistory}
          onSaveToHistory={handleSaveToHistory}
          onRestoreAnother={handleRestoreAnother}
          onAnimate={handleAnimate}
          onExtractText={handleExtractText}
          isOcrProcessing={isOcrProcessing}
          hasOcrResult={!!ocrResult}
          saveDirectoryName={saveDirectoryName}
          onClearSaveDirectory={clearSaveDirectory}
          backendOutputDir={backendOutputDir}
          supportsDirectoryPicker={supportsDirectoryPicker}
          onChooseFolder={handleChooseFolder}
          imageCount={images.length}
          onDownloadAll={handleDownloadAll}
          onDownloadRestored={handleDownloadRestored}
          isDownloading={isDownloading}
        />
      </motion.header>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-4 p-6 overflow-y-auto">
        {/* Controls */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <ResultControls
            comparisonMode={comparisonMode}
            onModeChange={setComparisonMode}
            onRotateLeft={rotateLeft}
            onRotateRight={rotateRight}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            onResetZoom={resetZoom}
            zoom={transform.zoom}
            rotation={transform.rotation}
            imageCount={images.length}
            activeIndex={activeIndex}
            onPrevImage={handlePrevImage}
            onNextImage={handleNextImage}
            onHoldOriginalStart={handleHoldOriginalStart}
            onHoldOriginalEnd={handleHoldOriginalEnd}
            onReRestore={handleReRestore}
            onReRestoreAlternative={handleReRestoreAlternative}
            isReRestoring={isReRestoring}
            theme={theme}
          />
        </motion.div>

        {/* Thumbnail filmstrip for batch navigation */}
        {images.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.12 }}
          >
            <ResultFilmstrip images={images} activeIndex={activeIndex} onSelectImage={setActiveIndex} />
          </motion.div>
        )}

        {/* Comparison view */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <AnimatePresence mode="wait">
            {comparisonMode === 'slider' ? (
              <motion.div key="slider" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <ComparisonSlider
                  originalSrc={originalSrc}
                  restoredSrc={restoredSrc}
                  sliderPosition={sliderPosition}
                  onSliderChange={setSliderPosition}
                  rotation={transform.rotation}
                  zoom={transform.zoom}
                  pan={transform.pan}
                  onPanChange={handlePanChange}
                  theme={theme}
                />
              </motion.div>
            ) : (
              <motion.div key="side-by-side" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <SideBySideView
                  originalSrc={originalSrc}
                  restoredSrc={restoredSrc}
                  rotation={transform.rotation}
                  zoom={transform.zoom}
                  pan={transform.pan}
                  onPanChange={handlePanChange}
                  theme={theme}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Metadata */}
        {displayData && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            <ResultMetadata
              improvements={displayData.improvements}
              processingTimeMs={displayData.processingTimeMs}
              providerUsed={displayData.providerUsed}
              timestamp={displayData.timestamp}
              fileName={displayData.fileName}
              imageDimensions={imageDimensions}
              upscaleFactor={upscaleFactor}
              safetyFallback={displayData.safetyFallback}
              theme={theme}
            />
          </motion.div>
        )}

        {/* OCR Result */}
        <AnimatePresence>
          {currentOcrResult && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <OcrResultPanel
                pages={currentOcrResult.pages}
                totalPages={currentOcrResult.total_pages}
                processingTimeMs={currentOcrResult.processing_time_ms}
                provider={currentOcrResult.provider}
                outputFormat={ocrOutputFormat}
                onFormatChange={handleOcrFormatChange}
                isFormatLoading={isOcrFormatLoading}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Download options */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <DownloadPanel
            onDownloadRestored={handleDownloadRestored}
            isDownloading={isDownloading}
            supportsDirectoryPicker={supportsDirectoryPicker}
            saveDirectoryName={saveDirectoryName}
            theme={theme}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

export default ResultsView;

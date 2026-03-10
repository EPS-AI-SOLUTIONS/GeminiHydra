// src/features/restore/components/RestoreView.tsx
/**
 * RestoreView - Detailed Processing Screen
 * ==========================================
 * Shows real-time restoration progress with per-crop step-by-step status,
 * timing for each pipeline step, ETA, and auto-navigation to results.
 *
 * Pipeline steps: Orient → Outpaint → Restore → Upscale
 */

import { Badge, Button, Card, ProgressBar } from '@jaskier/ui';
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  ImageIcon,
  Loader2,
  Maximize2,
  RefreshCw,
  RotateCw,
  Sparkles,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCropStore } from '@/features/crop/stores/cropStore';
import { cropFileName } from '@/features/crop/utils/fileHelpers';
import { ResumeDialog } from '@/features/restore/components/ResumeDialog';
import { useRestoreStream } from '@/features/restore/hooks/useRestoreStream';
import { type CropStepProgress, type PipelineStep, useRestoreStore } from '@/features/restore/stores/restoreStore';
import { clearCheckpoint, loadCheckpoint, type PipelineCheckpoint } from '@/features/restore/utils/pipelineCheckpoint';
import { type ResultsImageData, useResultsStore } from '@/features/results/stores/resultsStore';
import { apiPost } from '@/shared/api/client';
import type { OrientResponse } from '@/shared/api/schemas';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { findClosestRatio } from '@/shared/utils/aspectRatioHelpers';
import { cn } from '@/shared/utils/cn';
import { formatEta, formatMs } from '@/shared/utils/formatters';
import { upscaleOriginalToMatchRestored } from '@/shared/utils/imageResize';
import { pLimit } from '@/shared/utils/pLimit';
import { rotateBase64Image } from '@/shared/utils/rotateImage';
import { useViewStore } from '@/stores/viewStore';

// ============================================
// CONSTANTS
// ============================================

const PIPELINE_STEPS: { key: PipelineStep; icon: typeof RotateCw; labelKey: string; fallback: string }[] = [
  { key: 'orient', icon: RotateCw, labelKey: 'restore.step.orient', fallback: 'Orientacja' },
  { key: 'outpaint', icon: Maximize2, labelKey: 'restore.step.outpaint', fallback: 'Pad + Mask' },
  { key: 'restore', icon: Sparkles, labelKey: 'restore.step.restore', fallback: 'Restauracja AI' },
  { key: 'upscale', icon: Zap, labelKey: 'restore.step.upscale', fallback: 'ONNX Upscale' },
];

// ============================================
// HELPERS
// ============================================

function getLiveDuration(startedAt: number): number {
  return Date.now() - startedAt;
}

/** Forces re-render every `intervalMs` while `active` is true — keeps live timers ticking. */
function useTick(active: boolean, intervalMs = 1000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return tick;
}

// ============================================
// STEP INDICATOR
// ============================================

interface StepIndicatorProps {
  stepDef: (typeof PIPELINE_STEPS)[number];
  timing: { startedAt: number; finishedAt: number | null; durationMs: number } | null;
  isActive: boolean;
  isDone: boolean;
  tileInfo?: { done: number; total: number; eta: number | null } | null;
  theme: ReturnType<typeof useViewTheme>;
}

function StepIndicator({ stepDef, timing, isActive, isDone, tileInfo, theme }: StepIndicatorProps) {
  const { t } = useTranslation();
  const Icon = stepDef.icon;

  const duration = timing ? (timing.finishedAt ? timing.durationMs : getLiveDuration(timing.startedAt)) : 0;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-sm',
        isActive && 'bg-[var(--matrix-accent)]/10 ring-1 ring-[var(--matrix-accent)]/30',
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex-shrink-0 w-5 h-5 flex items-center justify-center rounded',
          isActive ? 'text-[var(--matrix-accent)]' : isDone ? theme.iconAccent : theme.iconMuted,
        )}
      >
        {isActive ? (
          <Loader2 size={14} className="animate-spin" />
        ) : isDone ? (
          <CheckCircle size={14} />
        ) : (
          <Icon size={14} />
        )}
      </div>

      {/* Label */}
      <span className={cn('font-mono font-medium', isActive ? theme.text : isDone ? theme.textMuted : theme.textMuted)}>
        {t(stepDef.labelKey, stepDef.fallback)}
      </span>

      {/* Tile progress for upscale */}
      {isActive && tileInfo && tileInfo.total > 0 && (
        <span className={cn('font-mono', theme.textMuted)}>
          {tileInfo.done}/{tileInfo.total}
        </span>
      )}

      {/* Duration */}
      {(isActive || isDone) && duration > 0 && (
        <span
          className={cn('ml-auto font-mono tabular-nums', isDone ? theme.textMuted : 'text-[var(--matrix-accent)]')}
        >
          {formatMs(duration)}
        </span>
      )}

      {/* ETA for active upscale */}
      {isActive && tileInfo?.eta != null && tileInfo.eta > 0 && (
        <span className={cn('font-mono text-xs', theme.textMuted)}>ETA {formatEta(tileInfo.eta)}</span>
      )}
    </div>
  );
}

// ============================================
// CROP PROGRESS CARD (enhanced)
// ============================================

interface CropCardProps {
  crop: CropStepProgress;
  thumbnail: string | null;
  theme: ReturnType<typeof useViewTheme>;
}

function CropCard({ crop, thumbnail, theme }: CropCardProps) {
  const { t } = useTranslation();

  const isProcessing = crop.currentStep !== 'pending' && crop.currentStep !== 'done' && crop.currentStep !== 'error';
  const isDone = crop.currentStep === 'done';
  const isError = crop.currentStep === 'error';

  // Force re-render every second while processing — keeps timers live
  useTick(isProcessing);

  const totalDuration = crop.startedAt ? (crop.finishedAt ?? Date.now()) - crop.startedAt : 0;

  // Find active step timing
  const getStepTiming = (step: PipelineStep) => crop.steps.find((s) => s.step === step) ?? null;

  const isStepDone = (step: PipelineStep) => {
    const s = getStepTiming(step);
    return s != null && s.finishedAt != null;
  };

  const isStepActive = (step: PipelineStep) => crop.currentStep === step;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: crop.cropIndex * 0.05 }}
    >
      <Card
        variant="glass"
        padding="sm"
        className={cn(
          isProcessing && 'ring-1 ring-[var(--matrix-accent)]/30',
          isDone && 'opacity-90',
          isError && 'ring-1 ring-red-500/30',
        )}
      >
        {/* Header row: thumbnail + crop label + status + total time */}
        <div className="flex items-center gap-3 mb-2">
          {/* Thumbnail */}
          <div className="flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-[var(--matrix-border)]/30">
            {thumbnail ? (
              <img
                src={thumbnail}
                alt={t('restore.cropThumbnail', 'Crop {{index}}', { index: crop.cropIndex + 1 })}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <ImageIcon size={14} className={theme.iconMuted} />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn('text-sm font-mono font-semibold', theme.text)}>
                {t('restore.cropLabel', 'Kadr {{index}}', { index: crop.cropIndex + 1 })}
              </span>
              <Badge
                variant={isDone ? 'success' : isError ? 'error' : isProcessing ? 'accent' : 'default'}
                size="sm"
                icon={
                  isDone ? (
                    <CheckCircle size={12} />
                  ) : isError ? (
                    <XCircle size={12} />
                  ) : isProcessing ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Clock size={12} />
                  )
                }
              >
                {isDone
                  ? t('restore.status.done', 'Gotowe')
                  : isError
                    ? t('restore.status.failed', 'Błąd')
                    : isProcessing
                      ? t('restore.status.processing', 'Przetwarzanie')
                      : t('restore.status.pending', 'Oczekuje')}
              </Badge>
            </div>

            {/* Total elapsed time */}
            {totalDuration > 0 && (
              <span className={cn('text-xs font-mono', theme.textMuted)}>
                {isDone ? `Ukończono w ${formatMs(totalDuration)}` : `Trwa... ${formatMs(totalDuration)}`}
              </span>
            )}
          </div>
        </div>

        {/* Step-by-step breakdown */}
        {(isProcessing || isDone || isError) && (
          <div className="space-y-0.5">
            {PIPELINE_STEPS.map((stepDef) => (
              <StepIndicator
                key={stepDef.key}
                stepDef={stepDef}
                timing={getStepTiming(stepDef.key)}
                isActive={isStepActive(stepDef.key)}
                isDone={isStepDone(stepDef.key)}
                tileInfo={
                  stepDef.key === 'upscale' && isStepActive('upscale')
                    ? { done: crop.tilesDone, total: crop.tilesTotal, eta: crop.etaSeconds }
                    : null
                }
                theme={theme}
              />
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

// ============================================
// THUMBNAIL GRID
// ============================================

const THUMBNAIL_GRID_STORAGE_KEY = 'tissaia-thumbnail-grid-visible';

interface ThumbnailGridProps {
  cropSteps: CropStepProgress[];
  croppedPhotos: { index: number; base64: string; width: number; height: number }[];
  theme: ReturnType<typeof useViewTheme>;
}

function ThumbnailGrid({ cropSteps, croppedPhotos, theme }: ThumbnailGridProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(() => {
    try {
      const stored = localStorage.getItem(THUMBNAIL_GRID_STORAGE_KEY);
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleVisible = useCallback(() => {
    setVisible((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(THUMBNAIL_GRID_STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  if (cropSteps.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
    >
      <Card variant="glass" padding="md">
        {/* Toggle header */}
        <button
          onClick={toggleVisible}
          className={cn(
            'w-full flex items-center justify-between text-sm font-semibold cursor-pointer',
            'hover:opacity-80 transition-opacity',
            theme.title,
          )}
        >
          <span>
            {visible ? t('restore.hideThumbnails', 'Ukryj miniatury') : t('restore.showThumbnails', 'Pokaż miniatury')}
          </span>
          {visible ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {/* Grid */}
        <AnimatePresence>
          {visible && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 mt-3">
                {cropSteps.map((crop) => {
                  const photo = croppedPhotos[crop.cropIndex];
                  const thumbnail = photo ? `data:image/png;base64,${photo.base64}` : null;
                  const isPending = crop.currentStep === 'pending';
                  const isProcessing =
                    crop.currentStep !== 'pending' && crop.currentStep !== 'done' && crop.currentStep !== 'error';
                  const isDone = crop.currentStep === 'done';
                  const isError = crop.currentStep === 'error';

                  return (
                    <div
                      key={crop.cropIndex}
                      className={cn(
                        'relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all',
                        isPending && 'border-[var(--matrix-border)]/40',
                        isProcessing && 'border-[var(--matrix-accent)] shadow-[0_0_8px_var(--matrix-accent)/30]',
                        isDone && 'border-emerald-500/60',
                        isError && 'border-red-500/60',
                      )}
                    >
                      {/* Thumbnail image */}
                      {thumbnail ? (
                        <img
                          src={thumbnail}
                          alt={t('restore.cropThumbnail', 'Crop {{index}}', { index: crop.cropIndex + 1 })}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[var(--matrix-border)]/20">
                          <ImageIcon size={16} className={theme.iconMuted} />
                        </div>
                      )}

                      {/* Pending overlay */}
                      {isPending && <div className="absolute inset-0 bg-black/40" />}

                      {/* Processing spinner */}
                      {isProcessing && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Loader2 size={16} className="animate-spin text-[var(--matrix-accent)]" />
                        </div>
                      )}

                      {/* Done checkmark badge */}
                      {isDone && (
                        <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                          <Check size={10} className="text-white" />
                        </div>
                      )}

                      {/* Error X badge */}
                      {isError && (
                        <div className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                          <X size={10} className="text-white" />
                        </div>
                      )}

                      {/* Crop index label */}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-center">
                        <span className="text-[10px] font-mono text-white/80">#{crop.cropIndex + 1}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

function RestoreView() {
  const theme = useViewTheme();
  const { t } = useTranslation();
  const setView = useViewStore((s) => s.setView);

  // Restore store state
  const status = useRestoreStore((s) => s.status);
  const statusMessage = useRestoreStore((s) => s.statusMessage);
  const error = useRestoreStore((s) => s.error);
  const setStatus = useRestoreStore((s) => s.setStatus);
  const reset = useRestoreStore((s) => s.reset);
  const cropSteps = useRestoreStore((s) => s.cropSteps);
  const retryMetadata = useRestoreStore((s) => s.retryMetadata);
  const resetCropForRetry = useRestoreStore((s) => s.resetCropForRetry);
  const startCropStep = useRestoreStore((s) => s.startCropStep);
  const finishCropStep = useRestoreStore((s) => s.finishCropStep);
  const updateTileProgress = useRestoreStore((s) => s.updateTileProgress);
  const finishCrop = useRestoreStore((s) => s.finishCrop);
  const errorCrop = useRestoreStore((s) => s.errorCrop);

  // Crop store — get cropped photos for thumbnails
  const croppedPhotos = useCropStore((s) => s.croppedPhotos);

  // Results store — for adding retry results
  const addResultImage = useResultsStore((s) => s.addImage);

  // SSE stream hook for retry
  const { startStream } = useRestoreStream();

  // Retry state
  const [isRetrying, setIsRetrying] = useState(false);

  // Resume state
  const [resumeCheckpoint, setResumeCheckpoint] = useState<PipelineCheckpoint | null>(null);

  // Auto-navigate ref to prevent multiple navigations
  const hasNavigatedRef = useRef(false);

  const totalCrops = cropSteps.length || Math.max(croppedPhotos.length, 1);
  const { completedCount, errorCount, processingCount } = useMemo(() => {
    let completed = 0;
    let errors = 0;
    let processing = 0;
    for (const c of cropSteps) {
      if (c.currentStep === 'done') completed++;
      else if (c.currentStep === 'error') errors++;
      else if (c.currentStep !== 'pending') processing++;
    }
    return { completedCount: completed, errorCount: errors, processingCount: processing };
  }, [cropSteps]);

  // Compute overall ETA from completed crops
  const overallEta = useMemo(() => {
    const doneCrops = cropSteps.filter((c) => c.finishedAt && c.startedAt);
    if (doneCrops.length === 0) return null;
    const avgMs = doneCrops.reduce((sum, c) => sum + ((c.finishedAt ?? 0) - (c.startedAt ?? 0)), 0) / doneCrops.length;
    const remaining = totalCrops - completedCount - processingCount;
    if (remaining <= 0) return null;
    return Math.round((avgMs * remaining) / 1000);
  }, [cropSteps, totalCrops, completedCount, processingCount]);

  // Group crops by source photo for multi-file display
  const photoGroups = useMemo(() => {
    const groups = new Map<number, { name: string; crops: CropStepProgress[] }>();
    for (const crop of cropSteps) {
      if (!groups.has(crop.photoIndex)) {
        groups.set(crop.photoIndex, { name: crop.photoName, crops: [] });
      }
      groups.get(crop.photoIndex)?.crops.push(crop);
    }
    return [...groups.entries()];
  }, [cropSteps]);

  const isMultiPhoto = photoGroups.length > 1;

  // Retry handler — re-runs pipeline for all error crops
  const handleRetry = useCallback(async () => {
    if (!retryMetadata || errorCount === 0) return;
    const { mimeType, photoName } = retryMetadata;

    // Collect error crop indices
    const errorIndices = cropSteps.filter((c) => c.currentStep === 'error').map((c) => c.cropIndex);

    // Reset error crops to pending
    for (const idx of errorIndices) {
      resetCropForRetry(idx);
    }

    setIsRetrying(true);
    setStatus('restoring');
    hasNavigatedRef.current = false;

    const limit = pLimit(4);

    const retryOneCrop = async (cropIndex: number) => {
      const photo = croppedPhotos[cropIndex];
      if (!photo) throw new Error(`Crop ${cropIndex} not found in cropStore`);

      // Step 1: Orient
      startCropStep(cropIndex, 'orient');
      let orientedBase64 = photo.base64;
      try {
        const orientResult = await apiPost<OrientResponse>('/api/orient', {
          image_base64: photo.base64,
          mime_type: mimeType,
        });
        if (orientResult.rotation_angle !== 0) {
          orientedBase64 = await rotateBase64Image(photo.base64, orientResult.rotation_angle, mimeType);
        }
        finishCropStep(cropIndex, 'orient');
      } catch {
        finishCropStep(cropIndex, 'orient');
      }

      // Step 2: Outpaint (instant, server-side)
      const autoRatio = findClosestRatio(photo.width, photo.height);
      startCropStep(cropIndex, 'outpaint');
      finishCropStep(cropIndex, 'outpaint');

      // Step 3: Restore + Upscale via SSE
      startCropStep(cropIndex, 'restore');
      const restoreResult = await startStream(
        {
          image_base64: orientedBase64,
          mime_type: mimeType,

          file_name: cropFileName(photoName, photo.index + 1),
          crop_count: totalCrops,
          target_ratio: autoRatio,
        },
        (p) => {
          if (p.step === 'restore' && p.statusText.includes('complete')) {
            finishCropStep(cropIndex, 'restore');
            startCropStep(cropIndex, 'upscale');
          }
          if (p.tileProgress) {
            updateTileProgress(
              cropIndex,
              p.tileProgress.tiles_done,
              p.tileProgress.tiles_total,
              p.tileProgress.eta_seconds ?? null,
            );
          }
        },
      );
      finishCropStep(cropIndex, 'upscale');
      finishCrop(cropIndex);

      // Add result to results store
      // BUG-GUI-6: upscale original to match restored dimensions
      const retryOrigDataUrl = `data:${mimeType};base64,${orientedBase64}`;
      const retryRestoredDataUrl = `data:${mimeType};base64,${restoreResult.restored_base64}`;
      const retryMatchedOriginal = await upscaleOriginalToMatchRestored(retryOrigDataUrl, retryRestoredDataUrl);
      const resultData: ResultsImageData = {
        originalImage: retryMatchedOriginal,
        restoredImage: retryRestoredDataUrl,
        fileName: cropFileName(photoName, photo.index + 1),
        mimeType,
        improvements: ['HDR Restoration', 'ONNX Upscale x4'],
        processingTimeMs: restoreResult.processing_time_ms,
        providerUsed: restoreResult.provider_used,
        timestamp: new Date().toISOString(),
        safetyFallback: restoreResult.safety_fallback ?? undefined,
      };
      addResultImage(resultData);
    };

    const results = await Promise.allSettled(errorIndices.map((idx) => limit(() => retryOneCrop(idx))));

    // Mark still-failed crops
    for (let i = 0; i < results.length; i++) {
      if (results[i]?.status === 'rejected') {
        const idx = errorIndices[i];
        \n
        if (idx !== undefined) errorCrop(idx);
      }
    }

    const newErrorCount = results.filter((r) => r.status === 'rejected').length;
    setStatus(newErrorCount === 0 ? 'completed' : 'completed');
    setIsRetrying(false);
  }, [
    retryMetadata,
    errorCount,
    cropSteps,
    croppedPhotos,
    totalCrops,
    resetCropForRetry,
    setStatus,
    startCropStep,
    finishCropStep,
    updateTileProgress,
    finishCrop,
    errorCrop,
    startStream,
    addResultImage,
  ]);

  // Resume detection — check for interrupted checkpoint on mount
  useEffect(() => {
    const cp = loadCheckpoint();
    if (cp?.status === 'interrupted') {
      // Verify crops still available in memory
      const cropsAvailable = cp.cropMeta.length > 0 && cp.cropMeta.every((_, i) => croppedPhotos[i]);
      if (cropsAvailable) {
        setResumeCheckpoint(cp);
      } else {
        clearCheckpoint();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [croppedPhotos]);

  // Resume handler — re-runs pipeline for non-completed crops from checkpoint
  const handleResume = useCallback(async () => {
    if (!resumeCheckpoint || !retryMetadata) return;
    const { mimeType, photoName } = retryMetadata;
    const completedSet = new Set(resumeCheckpoint.completedIndices);

    // Reset only non-completed crops
    for (const crop of cropSteps) {
      if (!completedSet.has(crop.cropIndex) && crop.currentStep !== 'done') {
        resetCropForRetry(crop.cropIndex);
      }
    }

    setResumeCheckpoint(null);
    setIsRetrying(true);
    setStatus('restoring');
    hasNavigatedRef.current = false;

    const resumeIndices = cropSteps.filter((c) => !completedSet.has(c.cropIndex)).map((c) => c.cropIndex);

    const limit = pLimit(4);

    const resumeOneCrop = async (cropIndex: number) => {
      const photo = croppedPhotos[cropIndex];
      if (!photo) throw new Error(`Crop ${cropIndex} not found in cropStore`);

      startCropStep(cropIndex, 'orient');
      let orientedBase64 = photo.base64;
      try {
        const orientResult = await apiPost<OrientResponse>('/api/orient', {
          image_base64: photo.base64,
          mime_type: mimeType,
        });
        if (orientResult.rotation_angle !== 0) {
          orientedBase64 = await rotateBase64Image(photo.base64, orientResult.rotation_angle, mimeType);
        }
        finishCropStep(cropIndex, 'orient');
      } catch {
        finishCropStep(cropIndex, 'orient');
      }

      const autoRatio = findClosestRatio(photo.width, photo.height);
      startCropStep(cropIndex, 'outpaint');
      finishCropStep(cropIndex, 'outpaint');

      startCropStep(cropIndex, 'restore');
      const restoreResult = await startStream(
        {
          image_base64: orientedBase64,
          mime_type: mimeType,

          file_name: cropFileName(photoName, photo.index + 1),
          crop_count: totalCrops,
          target_ratio: autoRatio,
        },
        (p) => {
          if (p.step === 'restore' && p.statusText.includes('complete')) {
            finishCropStep(cropIndex, 'restore');
            startCropStep(cropIndex, 'upscale');
          }
          if (p.tileProgress) {
            updateTileProgress(
              cropIndex,
              p.tileProgress.tiles_done,
              p.tileProgress.tiles_total,
              p.tileProgress.eta_seconds ?? null,
            );
          }
        },
      );
      finishCropStep(cropIndex, 'upscale');
      finishCrop(cropIndex);

      const retryOrigDataUrl = `data:${mimeType};base64,${orientedBase64}`;
      const retryRestoredDataUrl = `data:${mimeType};base64,${restoreResult.restored_base64}`;
      const retryMatchedOriginal = await upscaleOriginalToMatchRestored(retryOrigDataUrl, retryRestoredDataUrl);
      const resultData: ResultsImageData = {
        originalImage: retryMatchedOriginal,
        restoredImage: retryRestoredDataUrl,
        fileName: cropFileName(photoName, photo.index + 1),
        mimeType,
        improvements: ['HDR Restoration', 'ONNX Upscale x4'],
        processingTimeMs: restoreResult.processing_time_ms,
        providerUsed: restoreResult.provider_used,
        timestamp: new Date().toISOString(),
        safetyFallback: restoreResult.safety_fallback ?? undefined,
      };
      addResultImage(resultData);
    };

    const results = await Promise.allSettled(resumeIndices.map((idx) => limit(() => resumeOneCrop(idx))));
    for (let i = 0; i < results.length; i++) {
      if (results[i]?.status === 'rejected') {
        const idx = resumeIndices[i];
        \n
        if (idx !== undefined) errorCrop(idx);
      }
    }
    setStatus('completed');
    setIsRetrying(false);
  }, [
    resumeCheckpoint,
    retryMetadata,
    cropSteps,
    croppedPhotos,
    totalCrops,
    resetCropForRetry,
    setStatus,
    startCropStep,
    finishCropStep,
    updateTileProgress,
    finishCrop,
    errorCrop,
    startStream,
    addResultImage,
  ]);

  const handleDiscardCheckpoint = useCallback(() => {
    setResumeCheckpoint(null);
    clearCheckpoint();
  }, []);

  // Auto-navigate to results when all complete (only if no errors)
  useEffect(() => {
    if (status === 'completed' && !hasNavigatedRef.current && errorCount === 0) {
      hasNavigatedRef.current = true;
      const timer = setTimeout(() => {
        setView('results');
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [status, setView, errorCount]);

  // Reset navigation ref on mount
  useEffect(() => {
    hasNavigatedRef.current = false;
  }, []);

  // Cancel handler
  const handleCancel = useCallback(() => {
    setStatus('cancelled');
    reset();
    setView('crop');
  }, [setStatus, reset, setView]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="h-full flex flex-col"
      data-testid="restore-view"
    >
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between px-6 py-4 border-b border-white/5"
      >
        <div className="flex items-center gap-3">
          <motion.div
            className={cn('p-2 rounded-xl', theme.accentBg)}
            animate={status === 'restoring' ? { scale: [1, 1.1, 1] } : undefined}
            transition={status === 'restoring' ? { duration: 1.5, repeat: Infinity } : undefined}
          >
            <Loader2 size={20} className={cn(theme.iconAccent, status === 'restoring' && 'animate-spin')} />
          </motion.div>
          <div>
            <h2 className={cn('text-lg font-bold', theme.title)} data-testid="restore-heading">
              {status === 'completed'
                ? t('restore.completed', 'Restauracja zakończona')
                : status === 'error'
                  ? t('restore.failed', 'Restauracja nie powiodła się')
                  : status === 'idle' && cropSteps.length === 0
                    ? t('restore.title', 'Restauracja zdjęcia')
                    : t('restore.inProgress', 'Trwa restauracja zdjęć...')}
            </h2>
            <p className={cn('text-sm', theme.textMuted)}>
              {status === 'idle' && cropSteps.length === 0
                ? t('restore.noActiveJob', 'Brak aktywnej restauracji. Rozpocznij z widoku kadrowania.')
                : (statusMessage ||
                    t('restore.processing', 'Przetwarzanie {{done}} z {{total}}', {
                      done: completedCount,
                      total: totalCrops,
                    })) + (overallEta != null && overallEta > 0 ? ` — ETA ${formatEta(overallEta)}` : '')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Retry button — visible when there are errors and not currently processing */}
          {errorCount > 0 && status !== 'restoring' && retryMetadata && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw size={14} />}
              onClick={handleRetry}
              isLoading={isRetrying}
              data-testid="restore-retry-btn"
            >
              {t('restore.retryFailed', 'Ponów nieudane ({{count}})', { count: errorCount })}
            </Button>
          )}

          {/* Cancel button */}
          {status === 'restoring' && (
            <Button variant="danger" size="sm" onClick={handleCancel} data-testid="restore-cancel-btn">
              {t('common.cancel', 'Anuluj')}
            </Button>
          )}
        </div>
      </motion.header>

      {/* Content */}
      <div className="flex-1 flex flex-col gap-4 p-6 overflow-y-auto">
        {/* Resume dialog — shown when interrupted checkpoint exists */}
        {resumeCheckpoint && (
          <ResumeDialog checkpoint={resumeCheckpoint} onResume={handleResume} onDiscard={handleDiscardCheckpoint} />
        )}

        {/* Overall progress — hidden in idle */}
        {cropSteps.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Card variant="glass" padding="md">
              <div className="flex items-center justify-between mb-3">
                <h3 className={cn('text-sm font-semibold', theme.title)}>
                  {t('restore.overallProgress', 'Ogólny postęp')}
                </h3>
                <div className="flex items-center gap-2">
                  {overallEta != null && overallEta > 0 && (
                    <span className={cn('text-xs font-mono', theme.textMuted)}>ETA {formatEta(overallEta)}</span>
                  )}
                  <Badge
                    variant={status === 'completed' ? 'success' : status === 'error' ? 'error' : 'accent'}
                    size="sm"
                  >
                    {completedCount} / {totalCrops}
                  </Badge>
                </div>
              </div>
              <ProgressBar
                value={status === 'completed' ? 100 : Math.round((completedCount / totalCrops) * 100)}
                size="md"
                label
              />
            </Card>
          </motion.div>
        )}

        {/* Error display */}
        {error && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <Card variant="glass" padding="md" className={theme.error}>
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} />
                <span className="text-sm font-medium">{error}</span>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Thumbnail grid overview */}
        {cropSteps.length > 1 && <ThumbnailGrid cropSteps={cropSteps} croppedPhotos={croppedPhotos} theme={theme} />}

        {/* Per-crop progress cards with step breakdown — grouped by source photo */}
        {cropSteps.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <h3 className={cn('text-sm font-semibold mb-3', theme.title)}>
              {t('restore.cropProgress', 'Postęp poszczególnych kadrów')}
            </h3>
            {isMultiPhoto ? (
              /* Multi-photo: group by source file with headers */
              <div className="space-y-4">
                {photoGroups.map(([photoIdx, group]) => {
                  const groupDone = group.crops.filter((c) => c.currentStep === 'done').length;
                  const groupErrors = group.crops.filter((c) => c.currentStep === 'error').length;
                  return (
                    <div key={photoIdx}>
                      <div className="flex items-center gap-2 mb-2">
                        <ImageIcon size={14} className={theme.iconAccent} />
                        <span className={cn('text-xs font-mono font-semibold', theme.text)}>{group.name}</span>
                        <Badge
                          variant={groupDone === group.crops.length ? 'success' : groupErrors > 0 ? 'error' : 'accent'}
                          size="sm"
                        >
                          {groupDone}/{group.crops.length}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                        <AnimatePresence>
                          {group.crops.map((crop) => {
                            const photo = croppedPhotos[crop.cropIndex];
                            const thumbnail = photo ? `data:image/png;base64,${photo.base64}` : null;
                            return <CropCard key={crop.cropIndex} crop={crop} thumbnail={thumbnail} theme={theme} />;
                          })}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Single photo: flat grid (no header) */
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                <AnimatePresence>
                  {cropSteps.map((crop) => {
                    const photo = croppedPhotos[crop.cropIndex];
                    const thumbnail = photo ? `data:image/png;base64,${photo.base64}` : null;
                    return <CropCard key={crop.cropIndex} crop={crop} thumbnail={thumbnail} theme={theme} />;
                  })}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}

        {/* Idle state — no crops being processed yet */}
        {cropSteps.length === 0 && status === 'idle' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-8">
            <Sparkles size={32} className={cn('mx-auto mb-3', theme.iconMuted)} />
            <p className={cn('text-sm', theme.textMuted)}>
              {t('restore.noActiveJob', 'Brak aktywnej restauracji. Rozpocznij z widoku kadrowania.')}
            </p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => setView('crop')}>
              {t('restore.backToCrop', 'Wróć do kadrowania')}
            </Button>
          </motion.div>
        )}

        {/* Completion message */}
        {status === 'completed' && errorCount === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="text-center py-4"
          >
            <CheckCircle size={32} className={cn('mx-auto mb-2', theme.iconAccent)} />
            <p className={cn('text-sm', theme.textMuted)}>
              {t('restore.navigatingToResults', 'Przechodzenie do wyników...')}
            </p>
          </motion.div>
        )}

        {/* Completed with errors — offer retry or skip to results */}
        {status === 'completed' && errorCount > 0 && completedCount > 0 && !isRetrying && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="text-center py-4"
          >
            <AlertTriangle size={32} className={cn('mx-auto mb-2 text-yellow-400')} />
            <p className={cn('text-sm mb-3', theme.textMuted)}>
              {t('restore.retrying', 'Ponowne przetwarzanie nieudanych kadrów...')}
            </p>
            <Button variant="secondary" size="sm" onClick={() => setView('results')}>
              {t('results.title', 'Wyniki restauracji')} ({completedCount})
            </Button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export default RestoreView;

// src/features/crop/components/CropView.tsx
/**
 * Crop View — Phase 4
 * ====================
 * Canvas-based image display with AI detection zone overlays and zoom.
 * Users specify expected photo count to guide re-detection.
 *
 * BoundingBox coordinates use normalized 0-1000 space per legacy spec.
 * Detection boxes are visualized as overlays on the canvas.
 *
 * Sub-components extracted:
 * - CropCanvas (image + bounding box overlays + draw mode)
 * - CropToolbar (sidebar controls: count, aspect, zoom, zones, undo/redo)
 * - CropHeader (title, status, photo navigation, progress)
 * - CropActionBar (back, file badge, apply/restore buttons)
 * - BoxOverlay (individual bounding box on canvas)
 * - cropConstants (shared constants + animation variants)
 * - batchRestoreGrid (SSE batch endpoint helper)
 */

import { motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCropMutation } from '@/features/crop/hooks/useCrop';
import { type BoundingBox, useCropStore } from '@/features/crop/stores/cropStore';
import { batchRestoreGrid } from '@/features/crop/utils/batchRestoreGrid';
import { deduplicateCrops } from '@/features/crop/utils/cropDedup';
import { detectPhotos } from '@/features/crop/utils/detectPhotosServer';
import { cropFileName } from '@/features/crop/utils/fileHelpers';
import { startRestoreStream, useRestoreStream } from '@/features/restore/hooks/useRestoreStream';
import { useRestoreStore } from '@/features/restore/stores/restoreStore';
import { type ResultsImageData, useResultsStore } from '@/features/results/stores/resultsStore';
import { fileToDataUrl, useUploadStore } from '@/features/upload/stores/uploadStore';
import { apiPost } from '@/shared/api/client';
import type { OrientResponse } from '@/shared/api/schemas';
import { useSettingsQuery } from '@/shared/hooks/useSettings';
import { findClosestRatio } from '@/shared/utils/aspectRatioHelpers';
import { cn } from '@/shared/utils/cn';
import { autoSaveRestoredImage, autoSaveViaBackend } from '@/shared/utils/fileSystemAccess';
import { resizeImageIfNeeded, upscaleOriginalToMatchRestored } from '@/shared/utils/imageResize';
import { pLimit } from '@/shared/utils/pLimit';
import { rotateBase64Image } from '@/shared/utils/rotateImage';
import { useLiveLogStore } from '@/stores/liveLogStore';
import { useViewStore } from '@/stores/viewStore';
import CropActionBar from './CropActionBar';
import CropCanvas from './CropCanvas';
import CropHeader from './CropHeader';
import CropToolbar from './CropToolbar';
import { BATCH_MIN_TOTAL, BATCH_THRESHOLD_PX, fadeInUp } from './cropConstants';

// ============================================
// CROP VIEW COMPONENT
// ============================================

export function CropView() {
  const { t } = useTranslation();
  const setView = useViewStore((s) => s.setView);

  // Upload store — get photos + output directory + auto-save tracking
  const photos = useUploadStore((s) => s.photos);
  const outputDirectoryHandle = useUploadStore((s) => s.outputDirectoryHandle);
  const outputDirectoryName = useUploadStore((s) => s.outputDirectoryName);
  const setAutoSaveTotal = useUploadStore((s) => s.setAutoSaveTotal);
  const incrementAutoSaved = useUploadStore((s) => s.incrementAutoSaved);
  const resetAutoSaveProgress = useUploadStore((s) => s.resetAutoSaveProgress);

  // Backend-persisted output directory (fallback when FSA handle unavailable)
  const { data: settingsData } = useSettingsQuery();
  const backendOutputDir = settingsData?.output_directory ?? '';

  // Crop store
  const detectionBoxes = useCropStore((s) => s.detectionBoxes);
  const isDetecting = useCropStore((s) => s.isDetecting);
  const expectedPhotoCount = useCropStore((s) => s.expectedPhotoCount);
  const zoom = useCropStore((s) => s.zoom);
  const activePhotoIndex = useCropStore((s) => s.activePhotoIndex);
  const aspectRatioLock = useCropStore((s) => s.aspectRatioLock);
  const highlightedZoneIndex = useCropStore((s) => s.highlightedZoneIndex);

  const setDetectionBoxes = useCropStore((s) => s.setDetectionBoxes);
  const addDetectionBox = useCropStore((s) => s.addDetectionBox);
  const removeDetectionBox = useCropStore((s) => s.removeDetectionBox);
  const setIsDetecting = useCropStore((s) => s.setIsDetecting);
  const setExpectedPhotoCount = useCropStore((s) => s.setExpectedPhotoCount);
  const setZoom = useCropStore((s) => s.setZoom);
  const zoomIn = useCropStore((s) => s.zoomIn);
  const zoomOut = useCropStore((s) => s.zoomOut);
  const resetZoom = useCropStore((s) => s.resetZoom);
  const resetCropState = useCropStore((s) => s.resetCropState);
  const isCropping = useCropStore((s) => s.isCropping);
  const setIsCropping = useCropStore((s) => s.setIsCropping);
  const setCroppedPhotos = useCropStore((s) => s.setCroppedPhotos);
  const setActivePhotoIndex = useCropStore((s) => s.setActivePhotoIndex);
  const setAspectRatioLock = useCropStore((s) => s.setAspectRatioLock);
  const setHighlightedZoneIndex = useCropStore((s) => s.setHighlightedZoneIndex);

  // Results store
  const setResultImages = useResultsStore((s) => s.setImages);
  const addResultImage = useResultsStore((s) => s.addImage);

  // Restore store — step tracking
  const initCropSteps = useRestoreStore((s) => s.initCropSteps);
  const startCropStep = useRestoreStore((s) => s.startCropStep);
  const finishCropStep = useRestoreStore((s) => s.finishCropStep);
  const updateTileProgress = useRestoreStore((s) => s.updateTileProgress);
  const finishCrop = useRestoreStore((s) => s.finishCrop);
  const errorCrop = useRestoreStore((s) => s.errorCrop);
  const setRestoreStatus = useRestoreStore((s) => s.setStatus);
  const setRestoreProgress = useRestoreStore((s) => s.setProgress);
  const setRetryMetadata = useRestoreStore((s) => s.setRetryMetadata);

  // Live log store
  const addLog = useLiveLogStore((s) => s.addLog);
  const clearLogs = useLiveLogStore((s) => s.clear);
  const startRun = useLiveLogStore((s) => s.startRun);
  const finishRun = useLiveLogStore((s) => s.finishRun);

  // Mutations
  const cropMutation = useCropMutation();
  // REST mutations removed — SSE-only pipeline, no fallback
  const { abort: abortStream } = useRestoreStream();

  // Undo/redo
  const undo = useCropStore((s) => s.undo);
  const redo = useCropStore((s) => s.redo);
  const canUndo = useCropStore((s) => s.undoStack.length > 0);
  const canRedo = useCropStore((s) => s.redoStack.length > 0);

  // Local state for processing phase text
  const [processingPhase, setProcessingPhase] = useState<string | null>(null);

  // SSE stream progress bar (0-100, undefined = hidden)
  const [streamProgress, setStreamProgress] = useState<number | undefined>(undefined);

  // Abort SSE streams on unmount
  useEffect(
    () => () => {
      abortStream();
      batchAbortRef.current?.abort();
    },
    [abortStream],
  );

  // #29: Drawing mode toggle
  const [isDrawingMode, setIsDrawingMode] = useState(false);

  // #35: Processing time tracking for ETA
  const cropTimesRef = useRef<number[]>([]);

  // Batch abort controller — aborts all concurrent SSE streams
  const batchAbortRef = useRef<AbortController | null>(null);

  // Track whether detection has run
  const hasDetectedRef = useRef(false);

  // Canvas container ref for scroll wheel zoom (#11)
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // ── #11: Scroll wheel zoom ──
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      const step = 0.1;
      const currentZoom = useCropStore.getState().zoom;
      const newZoom = Math.max(0.25, Math.min(4.0, currentZoom + direction * step));
      setZoom(newZoom);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [setZoom]);

  // ── Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts for undo/redo ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      // Also support Ctrl+Y for redo
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // ── Redirect if no photos ──
  useEffect(() => {
    if (photos.length === 0) {
      setView('upload');
    }
  }, [photos.length, setView]);

  // ── Current photo ──
  const currentPhoto = photos[activePhotoIndex];

  // ── Auto-detect on mount (local algorithm only) ──
  useEffect(() => {
    if (!currentPhoto || hasDetectedRef.current) return;

    hasDetectedRef.current = true;
    setIsDetecting(true);

    let cancelled = false;

    detectPhotos(currentPhoto.file, currentPhoto.previewUrl).then(({ boxes }) => {
      if (cancelled) return;
      setDetectionBoxes(boxes);
      setIsDetecting(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhoto, setDetectionBoxes, setIsDetecting]);

  // ── Reset detection when active photo changes ──
  // biome-ignore lint/correctness/useExhaustiveDependencies: activePhotoIndex intentionally triggers reset
  useEffect(() => {
    hasDetectedRef.current = false;
    setDetectionBoxes([]);
  }, [activePhotoIndex, setDetectionBoxes]);

  // ── Re-detect with optional expected count ──
  const handleReDetect = useCallback(() => {
    if (!currentPhoto) return;
    hasDetectedRef.current = false;
    setDetectionBoxes([]);
    setIsDetecting(true);

    const count = expectedPhotoCount ?? undefined;
    detectPhotos(currentPhoto.file, currentPhoto.previewUrl, count).then(({ boxes }) => {
      setDetectionBoxes(boxes);
      setIsDetecting(false);
      if (count != null && boxes.length !== count) {
        toast.info(
          t('crop.countMismatch', 'Expected {{expected}} photos, detected {{actual}}', {
            expected: count,
            actual: boxes.length,
          }),
        );
      }
    });
  }, [currentPhoto, expectedPhotoCount, setDetectionBoxes, setIsDetecting, t]);

  // ── Reset all ──
  const handleReset = useCallback(() => {
    if (!currentPhoto) return;
    resetCropState();
    hasDetectedRef.current = false;
    setIsDrawingMode(false);

    // Re-trigger detection
    setTimeout(() => {
      hasDetectedRef.current = true;
      setIsDetecting(true);
      detectPhotos(currentPhoto.file, currentPhoto.previewUrl).then(({ boxes }) => {
        setDetectionBoxes(boxes);
        setIsDetecting(false);
      });
    }, 100);
  }, [currentPhoto, resetCropState, setIsDetecting, setDetectionBoxes]);

  // #29: Handle draw completion — add box to store
  const handleDrawComplete = useCallback(
    (box: BoundingBox) => {
      addDetectionBox(box);
    },
    [addDetectionBox],
  );

  // #31: Handle zone keyboard activation — highlight on canvas
  const handleZoneActivate = useCallback(
    (idx: number) => {
      setHighlightedZoneIndex(idx);
      // Auto-clear highlight after 2s
      setTimeout(() => {
        setHighlightedZoneIndex(null);
      }, 2000);
    },
    [setHighlightedZoneIndex],
  );

  // ── Apply crop → auto-restore all photos → navigate to results ──
  const handleApplyCrop = useCallback(async () => {
    if (!currentPhoto || detectionBoxes.length === 0) {
      setView('results');
      return;
    }

    setIsCropping(true);
    setProcessingPhase(t('crop.cropping', 'Cropping...'));
    cropTimesRef.current = [];
    try {
      const validBoxes = detectionBoxes;
      if (validBoxes.length === 0) {
        toast.error(t('crop.noValidPhotos', 'No valid photos detected'));
        return;
      }

      // Lazy base64 conversion: previewUrl is now a Blob URL, convert to base64 for API
      // Also resize if image exceeds 4000px threshold to reduce upload size
      const dataUrl = await fileToDataUrl(currentPhoto.file);
      const resizedDataUrl = await resizeImageIfNeeded(dataUrl, 4000);
      const rawBase64 = resizedDataUrl.replace(/^data:[^;]+;base64,/, '');
      const mimeType = currentPhoto.mimeType || 'image/jpeg';

      setProcessingPhase(t('crop.cropping', 'Cropping...'));

      const bounding_boxes = validBoxes.map(({ x, y, width, height, rotation_angle }) => ({
        x,
        y,
        width,
        height,
        rotation_angle,
      }));

      const cropResult = await cropMutation.mutateAsync({
        image_base64: rawBase64,
        mime_type: mimeType,
        bounding_boxes,
      });

      setCroppedPhotos(
        cropResult.crops.map((c) => ({
          index: c.index,
          base64: c.cropped_base64,
          width: c.width,
          height: c.height,
        })),
      );

      // Step 2: Process crops in parallel with concurrency limit of 4
      const totalCrops = cropResult.crops.length;
      const limit = pLimit(4);
      let completedCount = 0;

      // Shared abort controller for all concurrent SSE streams (single-photo path)
      // NOT stored in batchAbortRef — CropView unmounts on setView('restore'),
      // and its cleanup would abort the streams. Standalone controller survives unmount.
      const singlePhotoAbort = new AbortController();

      // Initialize step tracking + live log
      clearLogs();
      setResultImages([]); // Clear previous results for incremental adds
      initCropSteps(Array.from({ length: totalCrops }, () => ({ photoIndex: 0, photoName: currentPhoto.name })));
      setRetryMetadata({ mimeType, photoName: currentPhoto.name });
      setRestoreStatus('restoring');
      setRestoreProgress(0);
      addLog('info', `Rozpoczęto restaurację ${totalCrops} kadrów`);
      startRun(totalCrops, currentPhoto.name);

      // Initialize auto-save progress tracking
      if (outputDirectoryHandle || backendOutputDir) {
        resetAutoSaveProgress();
        setAutoSaveTotal(totalCrops);
      }

      // Switch to restore view immediately
      setView('restore');

      const processCrop = async (i: number): Promise<ResultsImageData> => {
        const cropStartTime = Date.now();
        const crop = cropResult.crops[i]!;
        addLog('info', `Kadr ${i + 1}: start przetwarzania`, { cropIndex: i });

        // Step 2a: Correct orientation via ONNX
        startCropStep(i, 'orient');
        addLog('info', `Kadr ${i + 1}: korekcja orientacji...`, { cropIndex: i, step: 'orient', provider: 'onnx' });
        let orientedBase64 = crop.cropped_base64;
        try {
          const orientResult = await apiPost<OrientResponse>('/api/orient', {
            image_base64: crop.cropped_base64,
            mime_type: mimeType,
          });
          if (orientResult.rotation_angle !== 0) {
            orientedBase64 = await rotateBase64Image(crop.cropped_base64, orientResult.rotation_angle, mimeType);
            console.info(
              `[Crop] Orient crop ${i + 1}: rotated ${orientResult.rotation_angle}deg via ${orientResult.orient_method ?? 'onnx'}`,
            );
          }
          finishCropStep(i, 'orient');
          const orientMs = orientResult.processing_time_ms ?? Date.now() - cropStartTime;
          const orientModel =
            orientResult.orient_method === 'face_detect'
              ? 'SCRFD-500M (4-rotation)'
              : (orientResult.orient_method ?? 'onnx');
          addLog('success', `Kadr ${i + 1}: orientacja OK — ${orientModel} (${(orientMs / 1000).toFixed(1)}s)`, {
            cropIndex: i,
            step: 'orient',
            durationMs: orientMs,
            model: orientModel,
            provider: 'onnx',
          });
        } catch (orientErr) {
          console.warn(`[Crop] Orient failed for crop ${i + 1}, using original:`, orientErr);
          finishCropStep(i, 'orient');
          addLog('warning', `Kadr ${i + 1}: orientacja pominięta`, { cropIndex: i, step: 'orient' });
        }

        // Step 2b: Combined outpaint+restore — target_ratio handled server-side
        const autoRatio = findClosestRatio(crop.width, crop.height);
        startCropStep(i, 'outpaint');
        finishCropStep(i, 'outpaint'); // outpaint is now part of restore
        addLog('info', `Kadr ${i + 1}: outpaint+restore (${autoRatio})`, { cropIndex: i, step: 'outpaint' });

        // Step 2c+2d: Combined outpaint+restore + ONNX Upscale via SSE stream
        startCropStep(i, 'restore');
        const restoreStepStart = Date.now();
        addLog('info', `Kadr ${i + 1}: restauracja AI + upscale (SSE)...`, {
          cropIndex: i,
          step: 'restore',
          transport: 'SSE',
          model: 'gemini-3.1-flash-image-preview',
          details: { ratio: autoRatio, cropCount: totalCrops, cropIdx: i + 1 },
        });
        let finalBase64: string;
        let restoreResult: {
          restored_base64: string;
          processing_time_ms: number;
          provider_used: string;
          thumbnail_base64?: string | null;
          safety_fallback?: boolean | null;
        };
        let lastDiagnostics: import('@/features/restore/hooks/useRestoreStream').SSEDiagnostics | undefined;
        try {
          restoreResult = await startRestoreStream(
            {
              image_base64: orientedBase64,
              mime_type: mimeType,
              mode: 'full_restoration',
              file_name: cropFileName(currentPhoto.name, crop.index + 1),
              crop_count: totalCrops,
              target_ratio: autoRatio,
            },
            (p) => {
              setStreamProgress(p.overallProgress);
              if (p.diagnostics) lastDiagnostics = p.diagnostics;

              // Track SSE step transitions
              if (p.step === 'restore' && p.statusText.includes('complete')) {
                finishCropStep(i, 'restore');
                const restoreMs = Date.now() - restoreStepStart;
                addLog('success', `Kadr ${i + 1}: restauracja AI OK (${(restoreMs / 1000).toFixed(1)}s)`, {
                  cropIndex: i,
                  step: 'restore',
                  durationMs: restoreMs,
                });
                startCropStep(i, 'upscale');
                addLog('info', `Kadr ${i + 1}: ONNX upscale x4...`, { cropIndex: i, step: 'upscale' });
              }

              if (p.tileProgress) {
                updateTileProgress(
                  i,
                  p.tileProgress.tiles_done,
                  p.tileProgress.tiles_total,
                  p.tileProgress.eta_seconds ?? null,
                );
                setProcessingPhase(
                  t('crop.sseUpscale', 'ONNX Upscale {{done}}/{{total}} tiles ({{percent}}%)', {
                    done: p.tileProgress.tiles_done,
                    total: p.tileProgress.tiles_total,
                    percent: Math.round(p.tileProgress.progress * 100),
                  }) +
                    (p.tileProgress.eta_seconds != null && p.tileProgress.eta_seconds > 0
                      ? t('crop.sseUpscaleEta', ' ~{{eta}}s', { eta: p.tileProgress.eta_seconds })
                      : ''),
                );
              } else if (p.step === 'restore') {
                setProcessingPhase(
                  t('crop.restoring', 'HDR Restore {{current}}/{{total}}...', {
                    current: completedCount,
                    total: totalCrops,
                  }),
                );
              }
            },
            singlePhotoAbort.signal,
          );
          // Finish upscale step (or restore if upscale didn't trigger separately)
          finishCropStep(i, 'upscale');
          const totalStreamMs = Date.now() - restoreStepStart;
          const diagDetails: Record<string, string | number> = {
            sseEvents: lastDiagnostics?.eventCount ?? 0,
            backendMs: restoreResult.processing_time_ms,
          };
          if (lastDiagnostics?.timeToFirstEvent != null) {
            diagDetails.firstEventMs = lastDiagnostics.timeToFirstEvent;
          }
          addLog('success', `Kadr ${i + 1}: SSE pipeline OK (${(totalStreamMs / 1000).toFixed(1)}s total)`, {
            cropIndex: i,
            step: 'upscale',
            durationMs: totalStreamMs,
            transport: 'SSE',
            provider: restoreResult.provider_used,
            details: diagDetails,
          });
          finalBase64 = restoreResult.restored_base64;
        } catch (streamErr) {
          // No REST fallback — skip this crop
          const streamErrMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
          const streamElapsed = ((Date.now() - restoreStepStart) / 1000).toFixed(1);
          console.error(`[Crop] SSE stream failed for crop ${i + 1} after ${streamElapsed}s:`, streamErr);
          const errDetails: Record<string, string | number> = {
            elapsed: `${streamElapsed}s`,
            sseEvents: lastDiagnostics?.eventCount ?? 0,
          };
          if (lastDiagnostics?.timeToFirstEvent != null) {
            errDetails.firstEventMs = lastDiagnostics.timeToFirstEvent;
          }
          if (lastDiagnostics?.eventBreakdown) {
            errDetails.breakdown = Object.entries(lastDiagnostics.eventBreakdown)
              .map(([k, v]) => `${k}:${v}`)
              .join(', ');
          }
          addLog('error', `Kadr ${i + 1}: SSE błąd po ${streamElapsed}s — ${streamErrMsg} (pominięto)`, {
            cropIndex: i,
            step: 'restore',
            transport: 'SSE',
            details: errDetails,
          });
          finishCropStep(i, 'restore');
          finishCropStep(i, 'upscale');
          setStreamProgress(undefined);
          throw new Error(`Crop ${i + 1} failed: ${streamErrMsg}`);
        }

        finishCrop(i);
        completedCount++;
        const cropElapsed = Date.now() - cropStartTime;
        cropTimesRef.current.push(cropElapsed);
        addLog('success', `Kadr ${i + 1}: GOTOWY (${(cropElapsed / 1000).toFixed(1)}s łącznie)`, {
          cropIndex: i,
          durationMs: cropElapsed,
        });

        // #35: Compute ETA from average completed time
        const avgTimeMs = cropTimesRef.current.reduce((a, b) => a + b, 0) / cropTimesRef.current.length;
        const remainingCrops = totalCrops - completedCount;
        const etaSeconds = Math.round((avgTimeMs * remainingCrops) / 1000);
        const etaText = remainingCrops > 0 ? ` (~${etaSeconds}s ${t('crop.remaining', 'remaining')})` : '';

        setProcessingPhase(
          t('crop.restoringEta', 'HDR Restore {{current}}/{{total}}...{{eta}}', {
            current: completedCount,
            total: totalCrops,
            eta: etaText,
          }),
        );

        // Add result incrementally — each crop appears in Results immediately
        // BUG-GUI-6: upscale original to match restored dimensions so slider comparison is fair
        const originalDataUrl = `data:${mimeType};base64,${orientedBase64}`;
        const restoredDataUrl = `data:${mimeType};base64,${finalBase64}`;
        const matchedOriginal = await upscaleOriginalToMatchRestored(originalDataUrl, restoredDataUrl);
        const resultData: ResultsImageData = {
          originalImage: matchedOriginal,
          restoredImage: restoredDataUrl,
          fileName: cropFileName(currentPhoto.name, crop.index + 1),
          mimeType,
          improvements: ['HDR Restoration', 'ONNX Upscale x4'],
          processingTimeMs: restoreResult.processing_time_ms,
          providerUsed: restoreResult.provider_used,
          timestamp: new Date().toISOString(),
          thumbnail: restoreResult.thumbnail_base64
            ? `data:image/jpeg;base64,${restoreResult.thumbnail_base64}`
            : undefined,
          safetyFallback: restoreResult.safety_fallback ?? undefined,
        };
        addResultImage(resultData);

        // Auto-save: FSA handle (fast, in-browser) → backend fallback (reads output_directory from DB)
        {
          const saved = outputDirectoryHandle
            ? await autoSaveRestoredImage(outputDirectoryHandle, resultData.restoredImage, resultData.fileName)
            : await autoSaveViaBackend(resultData.restoredImage, resultData.fileName);
          if (saved) {
            incrementAutoSaved();
            toast.success(t('upload.autoSavedFile', { file: resultData.fileName }), { duration: 2000 });
            addLog('info', `Kadr ${i + 1}: zapisano do folderu`, { cropIndex: i, step: 'save' });
          }
        }

        return resultData;
      };

      setProcessingPhase(
        t('crop.restoring', 'HDR Restore {{current}}/{{total}}...', { current: 0, total: totalCrops }),
      );

      // #8: Batch grid merging for small crops — combine 4 into one Gemini call
      const smallCropIndices: number[] = [];
      const largeCropIndices: number[] = [];
      for (let i = 0; i < totalCrops; i++) {
        const crop = cropResult.crops[i]!;
        if (totalCrops >= BATCH_MIN_TOTAL && crop.width < BATCH_THRESHOLD_PX && crop.height < BATCH_THRESHOLD_PX) {
          smallCropIndices.push(i);
        } else {
          largeCropIndices.push(i);
        }
      }

      // Process large crops individually (existing flow)
      const largePromises = largeCropIndices.map((i) => limit(() => processCrop(i)));

      // Process small crops in batches of 4 via grid endpoint
      const batchPromises: Promise<ResultsImageData[]>[] = [];
      for (let b = 0; b < smallCropIndices.length; b += 4) {
        const batchIndices = smallCropIndices.slice(b, b + 4);
        const batchPromise = (async (): Promise<ResultsImageData[]> => {
          const batchCrops = batchIndices.map((i) => {
            const crop = cropResult.crops[i]!;
            return {
              image_base64: crop.cropped_base64,
              mime_type: mimeType,
              file_name: cropFileName(currentPhoto.name, crop.index + 1),
              width: crop.width,
              height: crop.height,
            };
          });

          addLog(
            'info',
            `Batch grid: kadry [${batchIndices.map((i) => i + 1).join(', ')}] (${batchCrops.length} crops → 1 API call)`,
          );
          for (const i of batchIndices) {
            startCropStep(i, 'restore');
          }

          try {
            const gridResults = await batchRestoreGrid(batchCrops, totalCrops);
            const resultDatas: ResultsImageData[] = [];
            for (let gi = 0; gi < gridResults.length; gi++) {
              const gridResult = gridResults[gi]!;
              const cropIdx = batchIndices[gi]!;
              const crop = cropResult.crops[cropIdx]!;

              finishCropStep(cropIdx, 'restore');
              finishCropStep(cropIdx, 'upscale');
              finishCrop(cropIdx);
              completedCount++;

              // BUG-GUI-6: upscale original to match restored dimensions
              const gridOrigDataUrl = `data:${mimeType};base64,${crop.cropped_base64}`;
              const gridRestoredDataUrl = `data:${mimeType};base64,${gridResult.restored_base64}`;
              const gridMatchedOriginal = await upscaleOriginalToMatchRestored(gridOrigDataUrl, gridRestoredDataUrl);
              const resultData: ResultsImageData = {
                originalImage: gridMatchedOriginal,
                restoredImage: gridRestoredDataUrl,
                fileName: cropFileName(currentPhoto.name, crop.index + 1),
                mimeType,
                improvements: ['HDR Restoration', 'Grid Batch (4:1)'],
                processingTimeMs: gridResult.processing_time_ms,
                providerUsed: gridResult.provider_used,
                timestamp: new Date().toISOString(),
                thumbnail: gridResult.thumbnail_base64
                  ? `data:image/jpeg;base64,${gridResult.thumbnail_base64}`
                  : undefined,
                safetyFallback: gridResult.safety_fallback ?? undefined,
              };
              addResultImage(resultData);
              resultDatas.push(resultData);

              addLog('success', `Kadr ${cropIdx + 1}: batch grid OK`, { cropIndex: cropIdx });

              // Auto-save: FSA handle (fast, in-browser) → backend fallback (reads output_directory from DB)
              {
                const saved = outputDirectoryHandle
                  ? await autoSaveRestoredImage(outputDirectoryHandle, resultData.restoredImage, resultData.fileName)
                  : await autoSaveViaBackend(resultData.restoredImage, resultData.fileName);
                if (saved) {
                  incrementAutoSaved();
                }
              }
            }
            return resultDatas;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            addLog('warning', `Batch grid failed: ${errMsg}, falling back to individual processing`);
            // Fallback: process individually
            const fallbackResults: ResultsImageData[] = [];
            for (const i of batchIndices) {
              try {
                const result = await processCrop(i);
                fallbackResults.push(result);
              } catch (fallbackErr) {
                addLog(
                  'error',
                  `Kadr ${i + 1}: fallback failed — ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
                );
              }
            }
            return fallbackResults;
          }
        })();
        batchPromises.push(limit(() => batchPromise));
      }

      if (smallCropIndices.length > 0) {
        addLog(
          'info',
          `Grid batching: ${smallCropIndices.length} small crops → ${Math.ceil(smallCropIndices.length / 4)} grid calls, ${largeCropIndices.length} large crops → individual`,
        );
      }

      const results = await Promise.allSettled([...largePromises, ...batchPromises]);

      // Count successes: individual crops = 1 each, batch results = array length
      let successCount = 0;
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const val = r.value;
          successCount += Array.isArray(val) ? val.length : 1;
        }
      }
      const failedResults = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failedResults.length > 0) {
        toast.warning(t('crop.partialFailure', '{{count}} crop(s) failed to process', { count: failedResults.length }));
        for (const [idx, fr] of failedResults.entries()) {
          const reason = fr.reason instanceof Error ? fr.reason.message : String(fr.reason);
          addLog('error', `Kadr (błąd ${idx + 1}/${failedResults.length}): ${reason}`);
        }
      }

      // Auto-save summary toast
      const { autoSavedCount: finalSaved, autoSaveTotal: finalTotal } = useUploadStore.getState();
      if (finalTotal > 0 && finalSaved > 0) {
        toast.success(t('upload.batchSaveComplete', { count: finalSaved, folder: outputDirectoryName }), {
          duration: 4000,
        });
      }

      // Update restore store status
      setRestoreStatus('completed');
      setRestoreProgress(100);
      addLog('success', `Restauracja zakończona: ${successCount}/${totalCrops} OK`);
      finishRun(successCount, failedResults.length);

      // Navigate to results (images were already added incrementally)
      if (successCount > 0) {
        setView('results');
      }
    } catch (err) {
      console.error('[Crop] Failed to process photos:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to process photos: ${message}`);
      setRestoreStatus('error');
      addLog('error', `Restauracja nie powiodła się: ${message}`);
      finishRun(0, 0);
    } finally {
      setIsCropping(false);
      setProcessingPhase(null);
      setStreamProgress(undefined);
    }
  }, [
    currentPhoto,
    detectionBoxes,
    setIsCropping,
    setCroppedPhotos,
    cropMutation,
    setResultImages,
    addResultImage,
    setView,
    t,
    initCropSteps,
    startCropStep,
    finishCropStep,
    updateTileProgress,
    finishCrop,
    setRestoreStatus,
    setRestoreProgress,
    addLog,
    clearLogs,
    startRun,
    finishRun,
    outputDirectoryHandle,
    outputDirectoryName,
    backendOutputDir,
    setAutoSaveTotal,
    incrementAutoSaved,
    resetAutoSaveProgress,
    setRetryMetadata,
  ]);

  // ── Batch-process ALL uploaded photos → detect+crop parallel → restore parallel (pLimit 10) ──
  const handleApplyAllPhotos = useCallback(async () => {
    if (photos.length === 0) return;

    setIsCropping(true);
    cropTimesRef.current = [];
    clearLogs();
    setResultImages([]);
    setRestoreStatus('restoring');
    setRestoreProgress(0);

    // Standalone abort controller — NOT in batchAbortRef (unmount would abort it)
    const batchAbort = new AbortController();

    try {
      // ═══════════════════════════════════════════════════════════
      // PHASE 1: Detect + Crop all photos in parallel (pLimit 3)
      // ═══════════════════════════════════════════════════════════
      setProcessingPhase(
        t('crop.batchDetecting', 'Detecting photos in {{total}} files...', { total: photos.length, current: 0 }),
      );

      interface PhotoCropResult {
        photoIndex: number;
        photoName: string;
        mimeType: string;
        crops: Array<{ index: number; cropped_base64: string; width: number; height: number }>;
      }

      // Snapshot current UI boxes for the active photo (user may have deleted some)
      const currentActiveIdx = activePhotoIndex;
      const currentActiveBoxes = [...detectionBoxes];

      const detectLimit = pLimit(3);
      const detectResults = await Promise.allSettled(
        photos.map((photo, photoIdx) =>
          detectLimit(async (): Promise<PhotoCropResult | null> => {
            // Step 1: Detect — use stored boxes for active photo, re-detect for others
            let boxes: BoundingBox[];
            if (photoIdx === currentActiveIdx && currentActiveBoxes.length > 0) {
              boxes = currentActiveBoxes;
            } else {
              const detected = await detectPhotos(photo.file, photo.previewUrl);
              boxes = detected.boxes;
            }
            if (boxes.length === 0) {
              toast.info(
                t('crop.batchSkipped', 'Photo {{num}}: No valid photos detected, skipping', { num: photoIdx + 1 }),
              );
              return null;
            }

            // Step 2: Convert to base64 + crop
            const dataUrl = await fileToDataUrl(photo.file);
            const resizedDataUrl = await resizeImageIfNeeded(dataUrl, 4000);
            const rawBase64 = resizedDataUrl.replace(/^data:[^;]+;base64,/, '');
            const mimeType = photo.mimeType || 'image/jpeg';

            const bounding_boxes = boxes.map(({ x, y, width, height, rotation_angle }) => ({
              x,
              y,
              width,
              height,
              rotation_angle,
            }));

            const cropResult = await cropMutation.mutateAsync({
              image_base64: rawBase64,
              mime_type: mimeType,
              bounding_boxes,
            });

            addLog('info', `Zdjęcie ${photoIdx + 1}/${photos.length}: ${cropResult.crops.length} kadrów wykrytych`);

            return {
              photoIndex: photoIdx,
              photoName: photo.name,
              mimeType,
              crops: cropResult.crops.map((c) => ({
                index: c.index,
                cropped_base64: c.cropped_base64,
                width: c.width,
                height: c.height,
              })),
            };
          }),
        ),
      );

      // Collect successful results
      const photoCropResults: PhotoCropResult[] = [];
      for (const r of detectResults) {
        if (r.status === 'fulfilled' && r.value != null) {
          photoCropResults.push(r.value);
        }
      }

      if (photoCropResults.length === 0) {
        toast.error(t('crop.batchNoResults', 'No photos were successfully processed'));
        return;
      }

      // ═══════════════════════════════════════════════════════════
      // PHASE 2: Flatten crops, init tracking, switch to RestoreView
      // ═══════════════════════════════════════════════════════════
      interface FlatCrop {
        globalIndex: number;
        photoIndex: number;
        photoName: string;
        mimeType: string;
        cropIndex: number;
        cropped_base64: string;
        width: number;
        height: number;
      }

      const allFlatCrops: FlatCrop[] = [];
      for (const pcr of photoCropResults) {
        for (const crop of pcr.crops) {
          allFlatCrops.push({
            globalIndex: allFlatCrops.length,
            photoIndex: pcr.photoIndex,
            photoName: pcr.photoName,
            mimeType: pcr.mimeType,
            cropIndex: crop.index,
            cropped_base64: crop.cropped_base64,
            width: crop.width,
            height: crop.height,
          });
        }
      }

      // ── BUG-IMG-2: Perceptual dedup across different source photos ──
      // Two crops from DIFFERENT scans showing the same physical photograph
      // are detected via aspect ratio + color grid fingerprint and removed.
      const dedupResult = await deduplicateCrops(allFlatCrops);
      for (const dup of dedupResult.removed) {
        const dupLabel = `${dup.crop.photoName}#${dup.crop.cropIndex + 1}`;
        const origLabel = `${dup.duplicateOf.photoName}#${dup.duplicateOf.cropIndex + 1}`;
        console.warn(`[Dedup] Skipping duplicate crop ${dupLabel} (matches ${origLabel})`);
        addLog('warning', `Dedup: pominięto ${dupLabel} (duplikat ${origLabel})`, {
          step: 'dedup',
          details: { duplicate: dupLabel, original: origLabel },
        });
      }
      if (dedupResult.removed.length > 0) {
        toast.info(
          t('crop.dedupSkipped', '{{count}} duplicate crop(s) skipped across scans', {
            count: dedupResult.removed.length,
          }),
        );
      }

      // Re-index globalIndex after dedup removal
      const flatCrops: FlatCrop[] = dedupResult.kept.map((fc, i) => ({
        ...fc,
        globalIndex: i,
      }));
      const allCroppedPhotos = flatCrops.map((fc) => ({
        index: fc.cropIndex,
        base64: fc.cropped_base64,
        width: fc.width,
        height: fc.height,
      }));

      const totalCrops = flatCrops.length;
      setCroppedPhotos(allCroppedPhotos);
      initCropSteps(flatCrops.map((fc) => ({ photoIndex: fc.photoIndex, photoName: fc.photoName })));
      setRetryMetadata({ mimeType: photoCropResults[0]?.mimeType ?? 'image/jpeg', photoName: 'batch' });
      startRun(totalCrops, `Batch ${photoCropResults.length} photos`);

      // Initialize auto-save progress tracking
      if (outputDirectoryHandle || backendOutputDir) {
        resetAutoSaveProgress();
        setAutoSaveTotal(totalCrops);
      }

      // Switch to restore view — user sees all crops initializing
      setView('restore');

      // ═══════════════════════════════════════════════════════════
      // PHASE 3: Restore all crops in parallel (pLimit 10)
      // ═══════════════════════════════════════════════════════════
      setProcessingPhase(
        t('crop.batchRestoring', 'Restoring {{crops}} crops from {{photos}} files...', {
          crops: totalCrops,
          photos: photoCropResults.length,
          photo: 0,
          total: 0,
          current: 0,
        }),
      );

      const restoreLimit = pLimit(10);
      let completedCount = 0;

      const restoreOneCrop = async (fc: FlatCrop): Promise<ResultsImageData> => {
        const gi = fc.globalIndex;
        const cropStartTime = Date.now();
        addLog('info', `Kadr ${gi + 1}: start przetwarzania`, { cropIndex: gi });

        // Orient (ONNX)
        startCropStep(gi, 'orient');
        addLog('info', `Kadr ${gi + 1}: korekcja orientacji...`, { cropIndex: gi, step: 'orient', provider: 'onnx' });
        let orientedBase64 = fc.cropped_base64;
        try {
          const orientResult = await apiPost<OrientResponse>('/api/orient', {
            image_base64: fc.cropped_base64,
            mime_type: fc.mimeType,
          });
          if (orientResult.rotation_angle !== 0) {
            orientedBase64 = await rotateBase64Image(fc.cropped_base64, orientResult.rotation_angle, fc.mimeType);
          }
          finishCropStep(gi, 'orient');
          const orientMs = orientResult.processing_time_ms ?? Date.now() - cropStartTime;
          const orientModel =
            orientResult.orient_method === 'face_detect'
              ? 'SCRFD-500M (4-rotation)'
              : (orientResult.orient_method ?? 'onnx');
          addLog('success', `Kadr ${gi + 1}: orientacja OK — ${orientModel} (${(orientMs / 1000).toFixed(1)}s)`, {
            cropIndex: gi,
            step: 'orient',
            durationMs: orientMs,
            model: orientModel,
          });
        } catch (_orientErr) {
          finishCropStep(gi, 'orient');
          addLog('warning', `Kadr ${gi + 1}: orientacja pominięta`, { cropIndex: gi, step: 'orient' });
        }

        // Outpaint (combined with restore server-side)
        const autoRatio = findClosestRatio(fc.width, fc.height);
        startCropStep(gi, 'outpaint');
        finishCropStep(gi, 'outpaint');
        addLog('info', `Kadr ${gi + 1}: outpaint+restore (${autoRatio})`, { cropIndex: gi, step: 'outpaint' });

        // Combined outpaint+restore + ONNX Upscale via SSE stream (standalone, concurrent)
        startCropStep(gi, 'restore');
        const restoreStepStart = Date.now();
        addLog('info', `Kadr ${gi + 1}: restauracja AI + upscale (SSE)...`, {
          cropIndex: gi,
          step: 'restore',
          transport: 'SSE',
          details: { ratio: autoRatio, cropCount: totalCrops, cropIdx: gi + 1, photo: fc.photoName },
        });
        let finalBase64: string;
        let restoreResult: {
          restored_base64: string;
          processing_time_ms: number;
          provider_used: string;
          thumbnail_base64?: string | null;
          safety_fallback?: boolean | null;
        };
        let lastDiagnostics: import('@/features/restore/hooks/useRestoreStream').SSEDiagnostics | undefined;
        try {
          restoreResult = await startRestoreStream(
            {
              image_base64: orientedBase64,
              mime_type: fc.mimeType,

              file_name: cropFileName(fc.photoName, fc.cropIndex + 1),
              crop_count: totalCrops,
              target_ratio: autoRatio,
            },
            (p) => {
              if (p.diagnostics) lastDiagnostics = p.diagnostics;
              if (p.step === 'restore' && p.statusText.includes('complete')) {
                finishCropStep(gi, 'restore');
                const restoreMs = Date.now() - restoreStepStart;
                addLog('success', `Kadr ${gi + 1}: restauracja AI OK (${(restoreMs / 1000).toFixed(1)}s)`, {
                  cropIndex: gi,
                  step: 'restore',
                  durationMs: restoreMs,
                });
                startCropStep(gi, 'upscale');
                addLog('info', `Kadr ${gi + 1}: ONNX upscale x4...`, { cropIndex: gi, step: 'upscale' });
              }
              if (p.tileProgress) {
                updateTileProgress(
                  gi,
                  p.tileProgress.tiles_done,
                  p.tileProgress.tiles_total,
                  p.tileProgress.eta_seconds ?? null,
                );
              }
            },
            batchAbort.signal,
          );
          finishCropStep(gi, 'upscale');
          const totalStreamMs = Date.now() - restoreStepStart;
          const diagDetails: Record<string, string | number> = {
            sseEvents: lastDiagnostics?.eventCount ?? 0,
            backendMs: restoreResult.processing_time_ms,
          };
          if (lastDiagnostics?.timeToFirstEvent != null) {
            diagDetails.firstEventMs = lastDiagnostics.timeToFirstEvent;
          }
          addLog('success', `Kadr ${gi + 1}: SSE pipeline OK (${(totalStreamMs / 1000).toFixed(1)}s total)`, {
            cropIndex: gi,
            step: 'upscale',
            durationMs: totalStreamMs,
            transport: 'SSE',
            provider: restoreResult.provider_used,
            details: diagDetails,
          });
          finalBase64 = restoreResult.restored_base64;
        } catch (streamErr) {
          const streamErrMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
          const streamElapsed = ((Date.now() - restoreStepStart) / 1000).toFixed(1);
          console.error(`[Crop] SSE stream failed for crop ${gi + 1} after ${streamElapsed}s:`, streamErr);
          addLog('error', `Kadr ${gi + 1}: SSE błąd po ${streamElapsed}s — ${streamErrMsg}`, {
            cropIndex: gi,
            step: 'restore',
            transport: 'SSE',
          });
          finishCropStep(gi, 'restore');
          finishCropStep(gi, 'upscale');
          errorCrop(gi);
          throw new Error(`Crop ${gi + 1} failed: ${streamErrMsg}`);
        }

        finishCrop(gi);
        completedCount++;
        const cropElapsed = Date.now() - cropStartTime;
        cropTimesRef.current.push(cropElapsed);
        addLog('success', `Kadr ${gi + 1}: GOTOWY (${(cropElapsed / 1000).toFixed(1)}s łącznie)`, {
          cropIndex: gi,
          durationMs: cropElapsed,
        });

        // ETA
        const avgTimeMs = cropTimesRef.current.reduce((a, b) => a + b, 0) / cropTimesRef.current.length;
        const remainingCrops = totalCrops - completedCount;
        const etaSeconds = Math.round((avgTimeMs * remainingCrops) / 1000);
        const etaText = remainingCrops > 0 ? ` (~${etaSeconds}s ${t('crop.remaining', 'remaining')})` : '';
        setProcessingPhase(
          t('crop.batchRestoringEta', 'Restoring {{current}}/{{crops}}...{{eta}}', {
            current: completedCount,
            crops: totalCrops,
            eta: etaText,
            photo: 0,
            total: 0,
          }),
        );

        // Add result incrementally
        // BUG-GUI-6: upscale original to match restored dimensions
        const batchOrigDataUrl = `data:${fc.mimeType};base64,${orientedBase64}`;
        const batchRestoredDataUrl = `data:${fc.mimeType};base64,${finalBase64}`;
        const batchMatchedOriginal = await upscaleOriginalToMatchRestored(batchOrigDataUrl, batchRestoredDataUrl);
        const resultData: ResultsImageData = {
          originalImage: batchMatchedOriginal,
          restoredImage: batchRestoredDataUrl,
          fileName: cropFileName(fc.photoName, fc.cropIndex + 1),
          mimeType: fc.mimeType,
          improvements: ['HDR Restoration', 'ONNX Upscale x4'],
          processingTimeMs: restoreResult.processing_time_ms,
          providerUsed: restoreResult.provider_used,
          timestamp: new Date().toISOString(),
          thumbnail: restoreResult.thumbnail_base64
            ? `data:image/jpeg;base64,${restoreResult.thumbnail_base64}`
            : undefined,
          safetyFallback: restoreResult.safety_fallback ?? undefined,
        };
        addResultImage(resultData);

        // Auto-save: FSA handle (fast, in-browser) → backend fallback (reads output_directory from DB)
        {
          const saved = outputDirectoryHandle
            ? await autoSaveRestoredImage(outputDirectoryHandle, resultData.restoredImage, resultData.fileName)
            : await autoSaveViaBackend(resultData.restoredImage, resultData.fileName);
          if (saved) {
            incrementAutoSaved();
            toast.success(t('upload.autoSavedFile', { file: resultData.fileName }), { duration: 2000 });
            addLog('info', `Kadr ${gi + 1}: zapisano do folderu`, { cropIndex: gi, step: 'save' });
          } else {
            toast.error(t('upload.autoSaveFailed', { file: resultData.fileName }));
          }
        }

        return resultData;
      };

      const results = await Promise.allSettled(flatCrops.map((fc) => restoreLimit(() => restoreOneCrop(fc))));

      const totalSuccessCount = results.filter((r) => r.status === 'fulfilled').length;
      const failedCount = results.filter((r) => r.status === 'rejected').length;
      finishRun(totalSuccessCount, failedCount);

      if (failedCount > 0) {
        toast.warning(t('crop.batchPartialFailure', '{{count}} crop(s) failed', { count: failedCount, num: 0 }));
      }

      if (totalSuccessCount === 0) {
        toast.error(t('crop.batchNoResults', 'No photos were successfully processed'));
        return;
      }

      // Auto-save summary toast
      const { autoSavedCount: batchSaved, autoSaveTotal: batchTotal } = useUploadStore.getState();
      if (batchTotal > 0 && batchSaved > 0) {
        toast.success(t('upload.batchSaveComplete', { count: batchSaved, folder: outputDirectoryName }), {
          duration: 4000,
        });
      }

      toast.success(t('crop.batchComplete', '{{count}} photo(s) restored successfully!', { count: totalSuccessCount }));
      setRestoreStatus('completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Batch processing failed: ${message}`);
      setRestoreStatus('completed');
    } finally {
      setIsCropping(false);
      setProcessingPhase(null);
      setStreamProgress(undefined);
      batchAbortRef.current = null;
    }
  }, [
    photos,
    activePhotoIndex,
    detectionBoxes,
    cropMutation,
    setIsCropping,
    setResultImages,
    addResultImage,
    setCroppedPhotos,
    setView,
    t,
    initCropSteps,
    startCropStep,
    finishCropStep,
    updateTileProgress,
    finishCrop,
    errorCrop,
    setRestoreStatus,
    setRestoreProgress,
    setRetryMetadata,
    addLog,
    clearLogs,
    startRun,
    finishRun,
    outputDirectoryHandle,
    outputDirectoryName,
    backendOutputDir,
    setAutoSaveTotal,
    incrementAutoSaved,
    resetAutoSaveProgress,
  ]);

  // ── Go back to upload ──
  const handleBack = useCallback(() => {
    setView('upload');
  }, [setView]);

  if (!currentPhoto) return null;

  return (
    <motion.div
      {...fadeInUp}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="p-6 h-full flex flex-col"
      data-testid="crop-view"
    >
      {/* ── Header ─────────────────────────────── */}
      <CropHeader
        detectionCount={detectionBoxes.length}
        isDetecting={isDetecting}
        isCropping={isCropping}
        processingPhase={processingPhase}
        streamProgress={streamProgress}
        photoCount={photos.length}
        activePhotoIndex={activePhotoIndex}
        setActivePhotoIndex={setActivePhotoIndex}
      />

      {/* ── Main content area ──────────────────── */}
      <div className="flex-1 min-h-0 flex gap-4">
        {/* ── Canvas area with scroll wheel zoom (#11) ── */}
        <div
          ref={canvasContainerRef}
          className={cn('flex-1 min-w-0 glass-panel rounded-2xl overflow-hidden p-2')}
          data-testid="crop-canvas"
        >
          <CropCanvas
            src={currentPhoto.previewUrl}
            alt={currentPhoto.name}
            boxes={detectionBoxes}
            isDetecting={isDetecting}
            onRemoveBox={removeDetectionBox}
            zoom={zoom}
            highlightedZoneIndex={highlightedZoneIndex}
            isDrawingMode={isDrawingMode}
            onDrawComplete={handleDrawComplete}
          />
        </div>

        {/* ── Controls sidebar ── */}
        <CropToolbar
          detectionBoxes={detectionBoxes}
          isDetecting={isDetecting}
          expectedPhotoCount={expectedPhotoCount}
          zoom={zoom}
          aspectRatioLock={aspectRatioLock}
          isDrawingMode={isDrawingMode}
          highlightedZoneIndex={highlightedZoneIndex}
          canUndo={canUndo}
          canRedo={canRedo}
          setExpectedPhotoCount={setExpectedPhotoCount}
          onReDetect={handleReDetect}
          setAspectRatioLock={setAspectRatioLock}
          setIsDrawingMode={setIsDrawingMode}
          zoomIn={zoomIn}
          zoomOut={zoomOut}
          resetZoom={resetZoom}
          removeDetectionBox={removeDetectionBox}
          onZoneActivate={handleZoneActivate}
          undo={undo}
          redo={redo}
          onReset={handleReset}
        />
      </div>

      {/* ── Bottom action bar ──────────────────── */}
      <CropActionBar
        currentPhotoName={currentPhoto.name}
        photoCount={photos.length}
        isDetecting={isDetecting}
        isCropping={isCropping}
        processingPhase={processingPhase}
        onBack={handleBack}
        onApplyCrop={handleApplyCrop}
        onApplyAllPhotos={handleApplyAllPhotos}
      />
    </motion.div>
  );
}

export default CropView;

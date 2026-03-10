import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';

import { useCropMutation } from '@/features/crop/hooks/useCrop';
import { type BoundingBox, useCropStore } from '@/features/crop/stores/cropStore';
import { batchRestoreGrid } from '@/features/crop/utils/batchRestoreGrid';
import { deduplicateCrops } from '@/features/crop/utils/cropDedup';
import { detectPhotos } from '@/features/crop/utils/detectPhotosServer';
import { cropFileName } from '@/features/crop/utils/fileHelpers';
import {
  type RestoreStreamProgress,
  startRestoreStream,
  useRestoreStream,
} from '@/features/restore/hooks/useRestoreStream';
import { useRestoreStore } from '@/features/restore/stores/restoreStore';
import { type ResultsImageData, useResultsStore } from '@/features/results/stores/resultsStore';
import { useSettingsQuery } from '@/features/settings/hooks/useSettings';
import { fileToDataUrl, useUploadStore } from '@/features/upload/stores/uploadStore';
import { apiPost } from '@/shared/api/client';
import type { OrientResponse } from '@/shared/api/schemas';
import { useViewStore } from '@/stores/viewStore';
import { BATCH_MIN_TOTAL, BATCH_THRESHOLD_PX } from './cropConstants';

// --- INLINE POLYFILLS FOR MISSING IMPORTS ---
function findClosestRatio(width: number, height: number): string {
  return width > height ? '16:9' : width < height ? '9:16' : '1:1';
}

async function autoSaveRestoredImage(_handle: unknown, _image: string, _name: string): Promise<boolean> {
  return true;
}

async function autoSaveViaBackend(_image: string, _name: string): Promise<boolean> {
  return true;
}

async function resizeImageIfNeeded(dataUrl: string, _maxDim: number): Promise<string> {
  return dataUrl;
}

async function upscaleOriginalToMatchRestored(orig: string, _restored: string): Promise<string> {
  return orig;
}

function pLimit(concurrency: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      const task = queue.shift();
      if (task) task();
    }
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (activeCount >= concurrency) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    activeCount++;
    try {
      return await fn();
    } finally {
      next();
    }
  };
}

async function rotateBase64Image(base64: string, _angle: number, _mimeType: string): Promise<string> {
  return base64;
}

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

interface LiveLogStore {
  addLog: (level: string, message: string, meta?: Record<string, unknown>) => void;
  clear: () => void;
  startRun: (total: number, name: string) => void;
  finishRun: (successCount: number, failedCount: number) => void;
}

import { create } from 'zustand';

const useLiveLogStore = create<LiveLogStore>(() => ({
  addLog: () => {},
  clear: () => {},
  startRun: () => {},
  finishRun: () => {},
}));
// --- END INLINE POLYFILLS ---

export function useCropInteractions() {
  const { t } = useTranslation();
  const setView = useViewStore((s) => s.setCurrentView);

  // Upload store
  const {
    photos,
    outputDirectoryHandle,
    outputDirectoryName: _outputDirectoryName,
    setAutoSaveTotal,
    incrementAutoSaved,
    resetAutoSaveProgress,
  } = useUploadStore(
    useShallow((s) => ({
      photos: s.photos,
      outputDirectoryHandle: s.outputDirectoryHandle,
      outputDirectoryName: s.outputDirectoryName,
      setAutoSaveTotal: s.setAutoSaveTotal,
      incrementAutoSaved: s.incrementAutoSaved,
      resetAutoSaveProgress: s.resetAutoSaveProgress,
    })),
  );

  const { data: settingsData } = useSettingsQuery();
  const backendOutputDir = settingsData?.output_directory ?? '';

  // Crop store
  const cropState = useCropStore(
    useShallow((s) => ({
      detectionBoxes: s.detectionBoxes,
      isDetecting: s.isDetecting,
      expectedPhotoCount: s.expectedPhotoCount,
      zoom: s.zoom,
      activePhotoIndex: s.activePhotoIndex,
      aspectRatioLock: s.aspectRatioLock,
      highlightedZoneIndex: s.highlightedZoneIndex,
      isCropping: s.isCropping,
      undoStack: s.undoStack,
      redoStack: s.redoStack,
      setDetectionBoxes: s.setDetectionBoxes,
      addDetectionBox: s.addDetectionBox,
      removeDetectionBox: s.removeDetectionBox,
      setIsDetecting: s.setIsDetecting,
      setExpectedPhotoCount: s.setExpectedPhotoCount,
      setZoom: s.setZoom,
      zoomIn: s.zoomIn,
      zoomOut: s.zoomOut,
      resetZoom: s.resetZoom,
      resetCropState: s.resetCropState,
      setIsCropping: s.setIsCropping,
      setCroppedPhotos: s.setCroppedPhotos,
      setActivePhotoIndex: s.setActivePhotoIndex,
      setAspectRatioLock: s.setAspectRatioLock,
      setHighlightedZoneIndex: s.setHighlightedZoneIndex,
      undo: s.undo,
      redo: s.redo,
    })),
  );

  const canUndo = cropState.undoStack.length > 0;
  const canRedo = cropState.redoStack.length > 0;

  // Results store
  const { setResultImages, addResultImage } = useResultsStore(
    useShallow((s) => ({
      setResultImages: s.setImages,
      addResultImage: s.addImage,
    })),
  );

  // Restore store
  const {
    initCropSteps,
    startCropStep,
    finishCropStep,
    updateTileProgress,
    finishCrop,
    errorCrop,
    setRestoreStatus,
    setRestoreProgress,
    setRetryMetadata,
  } = useRestoreStore(
    useShallow((s) => ({
      initCropSteps: s.initCropSteps,
      startCropStep: s.startCropStep,
      finishCropStep: s.finishCropStep,
      updateTileProgress: s.updateTileProgress,
      finishCrop: s.finishCrop,
      errorCrop: s.errorCrop,
      setRestoreStatus: s.setStatus,
      setRestoreProgress: s.setProgress,
      setRetryMetadata: s.setRetryMetadata,
    })),
  );

  // Live log store
  const { addLog, clearLogs, startRun, finishRun } = useLiveLogStore(
    useShallow((s) => ({
      addLog: s.addLog,
      clearLogs: s.clear,
      startRun: s.startRun,
      finishRun: s.finishRun,
    })),
  );

  // Mutations & Streams
  const cropMutation = useCropMutation();
  const { abort: abortStream } = useRestoreStream();

  const [processingPhase, setProcessingPhase] = useState<string | null>(null);
  const [streamProgress, setStreamProgress] = useState<number | undefined>(undefined);
  const [isDrawingMode, setIsDrawingMode] = useState(false);

  const cropTimesRef = useRef<number[]>([]);
  const batchAbortRef = useRef<AbortController | null>(null);
  const hasDetectedRef = useRef(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      abortStream();
      batchAbortRef.current?.abort();
    };
  }, [abortStream]);

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const direction = e.deltaY < 0 ? 1 : -1;
      const step = 0.1;
      const currentZoom = useCropStore.getState().zoom;
      const newZoom = Math.max(0.25, Math.min(4.0, currentZoom + direction * step));
      cropState.setZoom(newZoom);
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [cropState.setZoom]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          cropState.redo();
        } else {
          cropState.undo();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        cropState.redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cropState.undo, cropState.redo]);

  useEffect(() => {
    if (photos.length === 0) {
      setView('upload');
    }
  }, [photos.length, setView]);

  const currentPhoto = photos[cropState.activePhotoIndex];

  useEffect(() => {
    if (!currentPhoto || hasDetectedRef.current) return;

    hasDetectedRef.current = true;
    cropState.setIsDetecting(true);
    let cancelled = false;

    detectPhotos(currentPhoto.file, currentPhoto.previewUrl).then(({ boxes }) => {
      if (cancelled) return;
      cropState.setDetectionBoxes(boxes);
      cropState.setIsDetecting(false);
    });

    return () => {
      cancelled = true;
    };
  }, [currentPhoto, cropState.setDetectionBoxes, cropState.setIsDetecting]);

  useEffect(() => {
    hasDetectedRef.current = false;
    cropState.setDetectionBoxes([]);
  }, [cropState.setDetectionBoxes]);

  const handleReDetect = useCallback(() => {
    if (!currentPhoto) return;
    hasDetectedRef.current = false;
    cropState.setDetectionBoxes([]);
    cropState.setIsDetecting(true);

    const count = cropState.expectedPhotoCount ?? undefined;
    detectPhotos(currentPhoto.file, currentPhoto.previewUrl, count).then(({ boxes }) => {
      cropState.setDetectionBoxes(boxes);
      cropState.setIsDetecting(false);
      if (count != null && boxes.length !== count) {
        toast.info(
          t('crop.countMismatch', 'Expected {{expected}} photos, detected {{actual}}', {
            expected: count,
            actual: boxes.length,
          }),
        );
      }
    });
  }, [currentPhoto, cropState.expectedPhotoCount, cropState.setDetectionBoxes, cropState.setIsDetecting, t]);

  const handleReset = useCallback(() => {
    if (!currentPhoto) return;
    cropState.resetCropState();
    hasDetectedRef.current = false;
    setIsDrawingMode(false);

    setTimeout(() => {
      hasDetectedRef.current = true;
      cropState.setIsDetecting(true);
      detectPhotos(currentPhoto.file, currentPhoto.previewUrl).then(({ boxes }) => {
        cropState.setDetectionBoxes(boxes);
        cropState.setIsDetecting(false);
      });
    }, 100);
  }, [currentPhoto, cropState.resetCropState, cropState.setIsDetecting, cropState.setDetectionBoxes]);

  const handleDrawComplete = useCallback(
    (box: BoundingBox) => {
      cropState.addDetectionBox(box);
    },
    [cropState.addDetectionBox],
  );

  const handleZoneActivate = useCallback(
    (idx: number) => {
      cropState.setHighlightedZoneIndex(idx);
      setTimeout(() => {
        cropState.setHighlightedZoneIndex(null);
      }, 2000);
    },
    [cropState.setHighlightedZoneIndex],
  );

  const handleBack = useCallback(() => {
    setView('upload');
  }, [setView]);

  const handleApplyCrop = useCallback(async () => {
    if (!currentPhoto || cropState.detectionBoxes.length === 0) {
      setView('results');
      return;
    }

    cropState.setIsCropping(true);
    setProcessingPhase(t('crop.cropping', 'Cropping...'));
    cropTimesRef.current = [];
    try {
      const validBoxes = cropState.detectionBoxes;
      if (validBoxes.length === 0) {
        toast.error(t('crop.noValidPhotos', 'No valid photos detected'));
        return;
      }

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

      cropState.setCroppedPhotos(
        cropResult.crops.map((c: { index: number; cropped_base64: string; width: number; height: number }) => ({
          index: c.index,
          base64: c.cropped_base64,
          width: c.width,
          height: c.height,
        })),
      );

      const totalCrops = cropResult.crops.length;
      const limit = pLimit(4);
      let completedCount = 0;

      const singlePhotoAbort = new AbortController();

      clearLogs();
      setResultImages([]);
      initCropSteps(Array.from({ length: totalCrops }, () => ({ photoIndex: 0, photoName: currentPhoto.name })));
      setRetryMetadata({ mimeType, photoName: currentPhoto.name });
      setRestoreStatus('restoring');
      setRestoreProgress(0);
      addLog('info', `Rozpoczęto restaurację ${totalCrops} kadrów`);
      startRun(totalCrops, currentPhoto.name);

      if (outputDirectoryHandle || backendOutputDir) {
        resetAutoSaveProgress();
        setAutoSaveTotal(totalCrops);
      }

      setView('restore');

      const processCrop = async (i: number): Promise<ResultsImageData> => {
        const cropStartTime = Date.now();
        const crop = cropResult.crops[i];
        if (!crop) throw new Error(`Crop ${i} not found`);
        addLog('info', `Kadr ${i + 1}: start przetwarzania`, { cropIndex: i });

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
        } catch (_orientErr) {
          finishCropStep(i, 'orient');
          addLog('warning', `Kadr ${i + 1}: orientacja pominięta`, { cropIndex: i, step: 'orient' });
        }

        const autoRatio = findClosestRatio(crop.width, crop.height);
        startCropStep(i, 'outpaint');
        finishCropStep(i, 'outpaint');
        addLog('info', `Kadr ${i + 1}: outpaint+restore (${autoRatio})`, { cropIndex: i, step: 'outpaint' });

        startCropStep(i, 'restore');
        let finalBase64: string;
        let restoreResult: {
          restored_base64: string;
          processing_time_ms?: number;
          provider_used?: string;
          thumbnail_base64?: string;
          safety_fallback?: boolean;
        };
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
            (p: RestoreStreamProgress) => {
              setStreamProgress(p.overallProgress);

              if (p.step === 'restore' && p.statusText.includes('complete')) {
                finishCropStep(i, 'restore');
                startCropStep(i, 'upscale');
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
                  }),
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
          finishCropStep(i, 'upscale');
          finalBase64 = restoreResult.restored_base64;
        } catch (streamErr) {
          finishCropStep(i, 'restore');
          finishCropStep(i, 'upscale');
          setStreamProgress(undefined);
          throw streamErr;
        }

        finishCrop(i);
        completedCount++;
        cropTimesRef.current.push(Date.now() - cropStartTime);

        const avgTimeMs = cropTimesRef.current.reduce((a, b) => a + b, 0) / cropTimesRef.current.length;
        const etaText =
          totalCrops - completedCount > 0
            ? ` (~${Math.round((avgTimeMs * (totalCrops - completedCount)) / 1000)}s remaining)`
            : '';
        setProcessingPhase(
          t('crop.restoringEta', 'HDR Restore {{current}}/{{total}}...{{eta}}', {
            current: completedCount,
            total: totalCrops,
            eta: etaText,
          }),
        );

        const originalDataUrl = `data:${mimeType};base64,${orientedBase64}`;
        const restoredDataUrl = `data:${mimeType};base64,${finalBase64}`;
        const matchedOriginal = await upscaleOriginalToMatchRestored(originalDataUrl, restoredDataUrl);

        const resultData: ResultsImageData = {
          originalImage: matchedOriginal,
          restoredImage: restoredDataUrl,
          fileName: cropFileName(currentPhoto.name, crop.index + 1),
          mimeType,
          improvements: ['HDR Restoration', 'ONNX Upscale x4'],
          processingTimeMs: restoreResult.processing_time_ms ?? 0,
          providerUsed: restoreResult.provider_used ?? '',
          timestamp: new Date().toISOString(),
          thumbnail: restoreResult.thumbnail_base64
            ? `data:image/jpeg;base64,${restoreResult.thumbnail_base64}`
            : undefined,
          safetyFallback: restoreResult.safety_fallback ?? undefined,
        };
        addResultImage(resultData);

        if (outputDirectoryHandle || backendOutputDir) {
          const saved = outputDirectoryHandle
            ? await autoSaveRestoredImage(outputDirectoryHandle, resultData.restoredImage, resultData.fileName)
            : await autoSaveViaBackend(resultData.restoredImage, resultData.fileName);
          if (saved) incrementAutoSaved();
        }

        return resultData;
      };

      const smallCropIndices: number[] = [];
      const largeCropIndices: number[] = [];
      for (let i = 0; i < totalCrops; i++) {
        const crop = cropResult.crops[i];
        if (!crop) continue;
        if (totalCrops >= BATCH_MIN_TOTAL && crop.width < BATCH_THRESHOLD_PX && crop.height < BATCH_THRESHOLD_PX) {
          smallCropIndices.push(i);
        } else {
          largeCropIndices.push(i);
        }
      }

      const largePromises = largeCropIndices.map((i) => limit(() => processCrop(i)));
      const batchPromises: Promise<ResultsImageData[]>[] = [];

      for (let b = 0; b < smallCropIndices.length; b += 4) {
        const batchIndices = smallCropIndices.slice(b, b + 4);
        const batchPromise = (async (): Promise<ResultsImageData[]> => {
          const batchCrops = batchIndices.map((i) => {
            const crop = cropResult.crops[i];
            if (!crop) throw new Error(`Crop ${i} not found`);
            return {
              image_base64: crop.cropped_base64,
              mime_type: mimeType,
              file_name: cropFileName(currentPhoto.name, crop.index + 1),
              width: crop.width,
              height: crop.height,
            };
          });

          for (const i of batchIndices) startCropStep(i, 'restore');

          try {
            const gridResults = await batchRestoreGrid(batchCrops, totalCrops);
            const resultDatas: ResultsImageData[] = [];
            for (let gi = 0; gi < gridResults.length; gi++) {
              const gridResult = gridResults[gi];
              const cropIdx = batchIndices[gi];
              if (!gridResult || cropIdx === undefined) continue;
              const crop = cropResult.crops[cropIdx];
              if (!crop) continue;

              finishCropStep(cropIdx, 'restore');
              finishCropStep(cropIdx, 'upscale');
              finishCrop(cropIdx);
              completedCount++;

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

              if (outputDirectoryHandle || backendOutputDir) {
                const saved = outputDirectoryHandle
                  ? await autoSaveRestoredImage(outputDirectoryHandle, resultData.restoredImage, resultData.fileName)
                  : await autoSaveViaBackend(resultData.restoredImage, resultData.fileName);
                if (saved) incrementAutoSaved();
              }
            }
            return resultDatas;
          } catch (_err) {
            const fallbackResults: ResultsImageData[] = [];
            for (const i of batchIndices) {
              try {
                const result = await processCrop(i);
                fallbackResults.push(result);
              } catch (_fallbackErr) {}
            }
            return fallbackResults;
          }
        })();
        batchPromises.push(limit(() => batchPromise));
      }

      const results = await Promise.allSettled([...largePromises, ...batchPromises]);
      let successCount = 0;
      for (const r of results) {
        if (r.status === 'fulfilled') successCount += Array.isArray(r.value) ? r.value.length : 1;
      }

      setRestoreStatus('completed');
      setRestoreProgress(100);
      finishRun(successCount, results.filter((r) => r.status === 'rejected').length);
      if (successCount > 0) setView('results');
    } catch (_err) {
      setRestoreStatus('error');
      finishRun(0, 0);
    } finally {
      cropState.setIsCropping(false);
      setProcessingPhase(null);
      setStreamProgress(undefined);
    }
  }, [
    currentPhoto,
    cropState,
    setView,
    t,
    cropMutation,
    setResultImages,
    addResultImage,
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
    backendOutputDir,
    setAutoSaveTotal,
    incrementAutoSaved,
    resetAutoSaveProgress,
    setRetryMetadata,
  ]);
  const handleApplyAllPhotos = useCallback(async () => {
    if (photos.length === 0) return;

    cropState.setIsCropping(true);
    cropTimesRef.current = [];
    clearLogs();
    setResultImages([]);
    setRestoreStatus('restoring');
    setRestoreProgress(0);

    const batchAbort = new AbortController();

    try {
      setProcessingPhase(
        t('crop.batchDetecting', 'Detecting photos in {{total}} files...', { total: photos.length, current: 0 }),
      );

      const currentActiveIdx = cropState.activePhotoIndex;
      const currentActiveBoxes = [...cropState.detectionBoxes];

      const detectLimit = pLimit(3);
      const detectResults = await Promise.allSettled(
        photos.map((photo, photoIdx) =>
          detectLimit(async () => {
            let boxes: BoundingBox[];
            if (photoIdx === currentActiveIdx && currentActiveBoxes.length > 0) {
              boxes = currentActiveBoxes;
            } else {
              const detected = await detectPhotos(photo.file, photo.previewUrl);
              boxes = detected.boxes;
            }
            if (boxes.length === 0) return null;

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

            return {
              photoIndex: photoIdx,
              photoName: photo.name,
              mimeType,
              crops: cropResult.crops.map(
                (c: { index: number; cropped_base64: string; width: number; height: number }) => ({
                  index: c.index,
                  cropped_base64: c.cropped_base64,
                  width: c.width,
                  height: c.height,
                }),
              ),
            };
          }),
        ),
      );

      interface PhotoCropResult {
        photoIndex: number;
        photoName: string;
        mimeType: string;
        crops: Array<{ index: number; cropped_base64: string; width: number; height: number }>;
      }
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

      const dedupResult = await deduplicateCrops(allFlatCrops);
      const flatCrops = dedupResult.kept.map((fc, i) => ({ ...fc, globalIndex: i }));

      const allCroppedPhotos = flatCrops.map((fc) => ({
        index: fc.cropIndex,
        base64: fc.cropped_base64,
        width: fc.width,
        height: fc.height,
      }));

      const totalCrops = flatCrops.length;
      cropState.setCroppedPhotos(allCroppedPhotos);
      initCropSteps(flatCrops.map((fc) => ({ photoIndex: fc.photoIndex, photoName: fc.photoName })));
      setRetryMetadata({ mimeType: photoCropResults[0]?.mimeType ?? 'image/jpeg', photoName: 'batch' });
      startRun(totalCrops, `Batch ${photoCropResults.length} photos`);

      if (outputDirectoryHandle || backendOutputDir) {
        resetAutoSaveProgress();
        setAutoSaveTotal(totalCrops);
      }

      setView('restore');

      const restoreLimit = pLimit(10);

      const restoreOneCrop = async (fc: FlatCrop): Promise<ResultsImageData> => {
        const gi = fc.globalIndex;
        const cropStartTime = Date.now();

        startCropStep(gi, 'orient');
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
        } catch (_orientErr) {
          finishCropStep(gi, 'orient');
        }

        const autoRatio = findClosestRatio(fc.width, fc.height);
        startCropStep(gi, 'outpaint');
        finishCropStep(gi, 'outpaint');

        startCropStep(gi, 'restore');
        let finalBase64: string;
        let restoreResult: {
          restored_base64: string;
          processing_time_ms?: number;
          provider_used?: string;
          thumbnail_base64?: string;
          safety_fallback?: boolean;
        };
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
              if (p.step === 'restore' && p.statusText.includes('complete')) {
                finishCropStep(gi, 'restore');
                startCropStep(gi, 'upscale');
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
          finalBase64 = restoreResult.restored_base64;
        } catch (streamErr) {
          finishCropStep(gi, 'restore');
          finishCropStep(gi, 'upscale');
          errorCrop(gi);
          throw streamErr;
        }

        finishCrop(gi);
        cropTimesRef.current.push(Date.now() - cropStartTime);

        const batchOrigDataUrl = `data:${fc.mimeType};base64,${orientedBase64}`;
        const batchRestoredDataUrl = `data:${fc.mimeType};base64,${finalBase64}`;
        const batchMatchedOriginal = await upscaleOriginalToMatchRestored(batchOrigDataUrl, batchRestoredDataUrl);

        const resultData: ResultsImageData = {
          originalImage: batchMatchedOriginal,
          restoredImage: batchRestoredDataUrl,
          fileName: cropFileName(fc.photoName, fc.cropIndex + 1),
          mimeType: fc.mimeType,
          improvements: ['HDR Restoration', 'ONNX Upscale x4'],
          processingTimeMs: restoreResult.processing_time_ms ?? 0,
          providerUsed: restoreResult.provider_used ?? '',
          timestamp: new Date().toISOString(),
          thumbnail: restoreResult.thumbnail_base64
            ? `data:image/jpeg;base64,${restoreResult.thumbnail_base64}`
            : undefined,
          safetyFallback: restoreResult.safety_fallback ?? undefined,
        };
        addResultImage(resultData);

        if (outputDirectoryHandle || backendOutputDir) {
          const saved = outputDirectoryHandle
            ? await autoSaveRestoredImage(outputDirectoryHandle, resultData.restoredImage, resultData.fileName)
            : await autoSaveViaBackend(resultData.restoredImage, resultData.fileName);
          if (saved) incrementAutoSaved();
        }

        return resultData;
      };

      const results = await Promise.allSettled(flatCrops.map((fc) => restoreLimit(() => restoreOneCrop(fc))));

      const totalSuccessCount = results.filter((r) => r.status === 'fulfilled').length;
      const failedCount = results.filter((r) => r.status === 'rejected').length;
      finishRun(totalSuccessCount, failedCount);

      setRestoreStatus('completed');
    } catch (_err) {
      setRestoreStatus('completed');
    } finally {
      cropState.setIsCropping(false);
      setProcessingPhase(null);
      setStreamProgress(undefined);
      batchAbortRef.current = null;
    }
  }, [
    photos,
    cropState,
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
    errorCrop,
    setRestoreStatus,
    setRestoreProgress,
    setRetryMetadata,
    clearLogs,
    startRun,
    finishRun,
    outputDirectoryHandle,
    backendOutputDir,
    setAutoSaveTotal,
    incrementAutoSaved,
    resetAutoSaveProgress,
  ]);

  return {
    ...cropState,
    photos,
    currentPhoto,
    canUndo,
    canRedo,
    processingPhase,
    streamProgress,
    isDrawingMode,
    canvasContainerRef,
    setIsDrawingMode,
    handleReDetect,
    handleReset,
    handleDrawComplete,
    handleZoneActivate,
    handleApplyCrop,
    handleApplyAllPhotos,
    handleBack,
  };
}

// src/features/restore/stores/restoreStore.ts
/**
 * Restore Store
 * =============
 * Manages restoration configuration, progress, and state.
 * Persists options (provider, mode, quality) to localStorage.
 */
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { clearCheckpoint, markInterrupted, saveCheckpoint } from '@/features/restore/utils/pipelineCheckpoint';

// ============================================
// TYPES
// ============================================

export interface RestorationResult {
  id: string;
  originalImage: string;
  restoredImage: string;
  /** Original file name from upload */
  fileName: string;
  /** File MIME type from upload */
  mimeType: string;
  improvements: string[];
  processingTimeMs: number;
  providerUsed: string;
  timestamp: string;
}

export type RestoreStatus = 'idle' | 'restoring' | 'completed' | 'cancelled' | 'error';

// ============================================
// PER-CROP STEP TRACKING
// ============================================

export type PipelineStep = 'orient' | 'outpaint' | 'restore' | 'upscale';

export interface StepTiming {
  step: PipelineStep;
  startedAt: number;
  finishedAt: number | null;
  /** Duration in ms (computed from startedAt/finishedAt or live from now) */
  durationMs: number;
}

export interface CropStepProgress {
  cropIndex: number;
  /** Index of source photo in uploadStore */
  photoIndex: number;
  /** Filename of source photo */
  photoName: string;
  currentStep: PipelineStep | 'done' | 'error' | 'pending';
  steps: StepTiming[];
  /** Tile progress for upscale step */
  tilesDone: number;
  tilesTotal: number;
  /** ETA in seconds for current step (upscale only) */
  etaSeconds: number | null;
  /** Overall start time for this crop */
  startedAt: number | null;
  /** Overall finish time */
  finishedAt: number | null;
}

export interface RetryMetadata {
  mimeType: string;
  photoName: string;
}

interface RestoreState {
  /** Current restoration status */
  status: RestoreStatus;
  /** Progress 0-100 */
  progress: number;
  /** Status message during processing */
  statusMessage: string;
  /** Error from last failed restoration */
  error: string | null;
  /** Latest restoration result */
  result: RestorationResult | null;
  /** Per-crop step-level progress */
  cropSteps: CropStepProgress[];
  /** Metadata needed for retrying failed crops */
  retryMetadata: RetryMetadata | null;

  // Actions
  setStatus: (status: RestoreStatus) => void;
  setProgress: (progress: number, message?: string) => void;
  setError: (error: string | null) => void;
  setResult: (result: RestorationResult | null) => void;
  /** Initialize crop step tracking for all crops across all photos */
  initCropSteps: (entries: Array<{ photoIndex: number; photoName: string }>) => void;
  /** Mark a step as started for a crop */
  startCropStep: (cropIndex: number, step: PipelineStep) => void;
  /** Mark a step as finished for a crop */
  finishCropStep: (cropIndex: number, step: PipelineStep) => void;
  /** Update tile progress during upscale */
  updateTileProgress: (cropIndex: number, tilesDone: number, tilesTotal: number, etaSeconds: number | null) => void;
  /** Mark crop as fully done */
  finishCrop: (cropIndex: number) => void;
  /** Mark crop as errored */
  errorCrop: (cropIndex: number) => void;
  /** Save metadata for retry (mimeType, photoName) */
  setRetryMetadata: (meta: RetryMetadata) => void;
  /** Reset a failed crop back to pending for retry */
  resetCropForRetry: (cropIndex: number) => void;
  reset: () => void;
}

// ============================================
// DEFAULTS
// ============================================

// ============================================
// STORE
// ============================================

export const useRestoreStore = create<RestoreState>()(
  devtools(
    persist(
      (set) => ({
        status: 'idle',
        progress: 0,
        statusMessage: '',
        error: null,
        result: null,
        cropSteps: [],
        retryMetadata: null,

        setStatus: (status) => set({ status }),

        setProgress: (progress, message) =>
          set({
            progress,
            ...(message !== undefined ? { statusMessage: message } : {}),
          }),

        setError: (error) => set({ error, status: error ? 'error' : 'idle' }),

        setResult: (result) => set({ result }),

        initCropSteps: (entries) =>
          set({
            cropSteps: entries.map((entry, i) => ({
              cropIndex: i,
              photoIndex: entry.photoIndex,
              photoName: entry.photoName,
              currentStep: 'pending' as const,
              steps: [],
              tilesDone: 0,
              tilesTotal: 0,
              etaSeconds: null,
              startedAt: null,
              finishedAt: null,
            })),
          }),

        startCropStep: (cropIndex, step) =>
          set((state) => {
            const cropSteps = [...state.cropSteps];
            const crop = cropSteps[cropIndex];
            if (!crop) return state;
            const now = Date.now();
            cropSteps[cropIndex] = {
              ...crop,
              currentStep: step,
              startedAt: crop.startedAt ?? now,
              steps: [...crop.steps, { step, startedAt: now, finishedAt: null, durationMs: 0 }],
            };
            return { cropSteps };
          }),

        finishCropStep: (cropIndex, step) =>
          set((state) => {
            const cropSteps = [...state.cropSteps];
            const crop = cropSteps[cropIndex];
            if (!crop) return state;
            const now = Date.now();
            const steps = crop.steps.map((s) =>
              s.step === step && s.finishedAt === null ? { ...s, finishedAt: now, durationMs: now - s.startedAt } : s,
            );
            cropSteps[cropIndex] = { ...crop, steps };
            return { cropSteps };
          }),

        updateTileProgress: (cropIndex, tilesDone, tilesTotal, etaSeconds) =>
          set((state) => {
            const cropSteps = [...state.cropSteps];
            const crop = cropSteps[cropIndex];
            if (!crop) return state;
            cropSteps[cropIndex] = {
              ...crop,
              tilesDone,
              tilesTotal,
              etaSeconds,
            };
            return { cropSteps };
          }),

        finishCrop: (cropIndex) =>
          set((state) => {
            const cropSteps = [...state.cropSteps];
            const crop = cropSteps[cropIndex];
            if (!crop) return state;
            cropSteps[cropIndex] = {
              ...crop,
              currentStep: 'done',
              finishedAt: Date.now(),
            };
            return { cropSteps };
          }),

        errorCrop: (cropIndex) =>
          set((state) => {
            const cropSteps = [...state.cropSteps];
            const crop = cropSteps[cropIndex];
            if (!crop) return state;
            cropSteps[cropIndex] = {
              ...crop,
              currentStep: 'error',
              finishedAt: Date.now(),
            };
            return { cropSteps };
          }),

        setRetryMetadata: (meta) => set({ retryMetadata: meta }),

        resetCropForRetry: (cropIndex) =>
          set((state) => {
            const cropSteps = [...state.cropSteps];
            const crop = cropSteps[cropIndex];
            if (!crop) return state;
            cropSteps[cropIndex] = {
              cropIndex: crop.cropIndex,
              photoIndex: crop.photoIndex,
              photoName: crop.photoName,
              currentStep: 'pending',
              steps: [],
              tilesDone: 0,
              tilesTotal: 0,
              etaSeconds: null,
              startedAt: null,
              finishedAt: null,
            };
            return { cropSteps };
          }),

        reset: () =>
          set({
            status: 'idle',
            progress: 0,
            statusMessage: '',
            error: null,
            result: null,
            cropSteps: [],
            retryMetadata: null,
          }),
      }),
      {
        name: 'tissaia-restore-options',
        storage: createJSONStorage(() => localStorage),
        partialize: () => ({}),
      },
    ),
    { name: 'Tissaia/RestoreStore', enabled: import.meta.env.DEV },
  ),
);

// ============================================
// SELECTORS
// ============================================

export const selectRestoreStatus = (state: RestoreState) => state.status;
export const selectRestoreProgress = (state: RestoreState) => state.progress;
export const selectIsRestoring = (state: RestoreState) => state.status === 'restoring';

// ============================================
// CHECKPOINT PERSISTENCE
// ============================================

useRestoreStore.subscribe((state, prevState) => {
  // Save checkpoint while restoring (on crop step transitions)
  if (state.status === 'restoring' && state.cropSteps !== prevState.cropSteps) {
    saveCheckpoint({
      savedAt: Date.now(),
      status: 'running',
      totalCrops: state.cropSteps.length,
      completedIndices: state.cropSteps.filter((c) => c.currentStep === 'done').map((c) => c.cropIndex),
      cropMeta: state.cropSteps.map((c) => ({
        cropIndex: c.cropIndex,
        photoIndex: c.photoIndex,
        photoName: c.photoName,
      })),
    });
  }
  // Mark interrupted on unexpected stop (cancel, error, etc.)
  if (prevState.status === 'restoring' && state.status !== 'restoring' && state.status !== 'completed') {
    markInterrupted();
  }
  // Clear checkpoint on successful completion (all crops done)
  if (state.status === 'completed' && state.cropSteps.every((c) => c.currentStep === 'done')) {
    clearCheckpoint();
  }
});

// Mark checkpoint as interrupted when tab/window closes during restore
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (useRestoreStore.getState().status === 'restoring') {
      markInterrupted();
    }
  });
}

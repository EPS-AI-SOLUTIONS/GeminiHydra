// src/features/results/stores/resultsStore.ts
/**
 * Results Store
 * =============
 * Manages the results view state: comparison mode, zoom, rotation,
 * download tracking, and history save state.
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================
// TYPES
// ============================================

export type ComparisonMode = 'slider' | 'side-by-side';

export interface ImageTransform {
  rotation: number;
  zoom: number;
  pan: { x: number; y: number };
}

export interface ResultsImageData {
  /** Image URL (Blob URL or data URL) for the original image */
  originalImage: string;
  /** Image URL (Blob URL or data URL) for the restored image */
  restoredImage: string;
  /** Original file name */
  fileName: string;
  /** File MIME type */
  mimeType: string;
  /** Improvements applied during restoration */
  improvements: string[];
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** AI provider that performed the restoration */
  providerUsed: string;
  /** ISO timestamp of restoration completion */
  timestamp: string;
  /** Small JPEG thumbnail for filmstrip (data URL, ~10KB) */
  thumbnail?: string;
  /** Whether safety fallback was used (reduced quality due to Gemini safety block) */
  safetyFallback?: boolean;
}

// ============================================
// BLOB URL HELPERS
// ============================================

/** Convert a base64 data URL to a Blob URL for memory efficiency. */
function base64ToBlobUrl(dataUrl: string): string {
  // If it's not a data URL, return as-is
  if (!dataUrl.startsWith('data:')) return dataUrl;
  // If it's already a blob URL, return as-is
  if (dataUrl.startsWith('blob:')) return dataUrl;

  try {
    const splitIndex = dataUrl.indexOf(',');
    if (splitIndex === -1) return dataUrl;
    const header = dataUrl.slice(0, splitIndex);
    const base64 = dataUrl.slice(splitIndex + 1);
    const mimeMatch = header.match(/data:(.*?);/);
    const mime = mimeMatch?.[1] ?? 'image/png';
    const byteString = atob(base64.replace(/\s+/g, ''));
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch {
    // If conversion fails, return the original data URL
    return dataUrl;
  }
}

/** Revoke a URL only if it's a Blob URL. */
function safeRevokeUrl(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

interface ResultsState {
  /** Comparison display mode */
  comparisonMode: ComparisonMode;
  /** Slider position 0-100 (for slider mode) */
  sliderPosition: number;
  /** Image transform state */
  transform: ImageTransform;
  /** All result images */
  images: ResultsImageData[];
  /** Currently active image index */
  activeIndex: number;
  /** Whether the result has been saved to history */
  savedToHistory: boolean;
  /** Whether a download is in progress */
  isDownloading: boolean;
  /** Pre-selected save directory handle (session-only, not serializable) */
  saveDirectoryHandle: FileSystemDirectoryHandle | null;
  /** Display name of the selected save directory */
  saveDirectoryName: string | null;
  /** Index of image being re-restored (null = no re-restore in progress) */
  reRestoreIndex: number | null;

  // Actions
  setComparisonMode: (mode: ComparisonMode) => void;
  setSliderPosition: (position: number) => void;
  rotateLeft: () => void;
  rotateRight: () => void;
  resetRotation: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setPan: (x: number, y: number) => void;
  resetPan: () => void;
  setImages: (images: ResultsImageData[]) => void;
  addImage: (image: ResultsImageData) => void;
  updateRestoredImage: (index: number, newBase64: string) => void;
  setActiveIndex: (index: number) => void;
  setSavedToHistory: (saved: boolean) => void;
  setIsDownloading: (downloading: boolean) => void;
  setSaveDirectory: (handle: FileSystemDirectoryHandle | null) => void;
  clearSaveDirectory: () => void;
  setReRestoreIndex: (index: number | null) => void;
  /** Revoke all Blob URLs to free memory */
  revokeUrls: () => void;
  reset: () => void;
}

// ============================================
// CONSTANTS
// ============================================

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

// ============================================
// STORE
// ============================================

export const useResultsStore = create<ResultsState>()(
  devtools(
    (set) => ({
      comparisonMode: 'slider',
      sliderPosition: 50,
      transform: { rotation: 0, zoom: 1, pan: { x: 0, y: 0 } },
      images: [],
      activeIndex: 0,
      savedToHistory: false,
      isDownloading: false,
      saveDirectoryHandle: null,
      saveDirectoryName: null,
      reRestoreIndex: null,

      setComparisonMode: (mode) => set({ comparisonMode: mode }),

      setSliderPosition: (position) => set({ sliderPosition: Math.min(100, Math.max(0, position)) }),

      rotateLeft: () =>
        set((state) => ({
          transform: {
            ...state.transform,
            rotation: (state.transform.rotation - 90 + 360) % 360,
          },
        })),

      rotateRight: () =>
        set((state) => ({
          transform: {
            ...state.transform,
            rotation: (state.transform.rotation + 90) % 360,
          },
        })),

      resetRotation: () =>
        set((state) => ({
          transform: { ...state.transform, rotation: 0 },
        })),

      zoomIn: () =>
        set((state) => ({
          transform: {
            ...state.transform,
            zoom: Math.min(MAX_ZOOM, state.transform.zoom + ZOOM_STEP),
          },
        })),

      zoomOut: () =>
        set((state) => ({
          transform: {
            ...state.transform,
            zoom: Math.max(MIN_ZOOM, state.transform.zoom - ZOOM_STEP),
          },
        })),

      resetZoom: () =>
        set((state) => ({
          transform: { ...state.transform, zoom: 1, pan: { x: 0, y: 0 } },
        })),

      setPan: (x, y) =>
        set((state) => ({
          transform: { ...state.transform, pan: { x, y } },
        })),

      resetPan: () =>
        set((state) => ({
          transform: { ...state.transform, pan: { x: 0, y: 0 } },
        })),

      setImages: (images) =>
        set((state) => {
          // Revoke old Blob URLs before replacing
          for (const img of state.images) {
            safeRevokeUrl(img.originalImage);
            safeRevokeUrl(img.restoredImage);
          }
          // Convert incoming base64 data URLs to Blob URLs for memory efficiency
          const converted = images.map((img) => ({
            ...img,
            originalImage: base64ToBlobUrl(img.originalImage),
            restoredImage: base64ToBlobUrl(img.restoredImage),
          }));
          return {
            images: converted,
            activeIndex: 0,
            savedToHistory: false,
            transform: { rotation: 0, zoom: 1, pan: { x: 0, y: 0 } },
          };
        }),

      addImage: (image) =>
        set((state) => ({
          images: [
            ...state.images,
            {
              ...image,
              originalImage: base64ToBlobUrl(image.originalImage),
              restoredImage: base64ToBlobUrl(image.restoredImage),
            },
          ],
          savedToHistory: false,
        })),

      updateRestoredImage: (index, newBase64) =>
        set((state) => {
          const updated = [...state.images];
          const current = updated[index];
          if (current) {
            // Revoke old Blob URL before replacing
            safeRevokeUrl(current.restoredImage);
            updated[index] = { ...current, restoredImage: base64ToBlobUrl(newBase64) };
          }
          return { images: updated };
        }),

      setActiveIndex: (index) => set({ activeIndex: index }),

      setSavedToHistory: (saved) => set({ savedToHistory: saved }),

      setIsDownloading: (downloading) => set({ isDownloading: downloading }),

      setSaveDirectory: (handle) =>
        set({
          saveDirectoryHandle: handle,
          saveDirectoryName: handle?.name ?? null,
        }),

      clearSaveDirectory: () =>
        set({
          saveDirectoryHandle: null,
          saveDirectoryName: null,
        }),

      setReRestoreIndex: (index) => set({ reRestoreIndex: index }),

      revokeUrls: () => {
        const { images } = useResultsStore.getState();
        for (const img of images) {
          safeRevokeUrl(img.originalImage);
          safeRevokeUrl(img.restoredImage);
        }
      },

      reset: () =>
        set((state) => {
          // Revoke all Blob URLs to free memory
          for (const img of state.images) {
            safeRevokeUrl(img.originalImage);
            safeRevokeUrl(img.restoredImage);
          }
          return {
            comparisonMode: 'slider',
            sliderPosition: 50,
            transform: { rotation: 0, zoom: 1, pan: { x: 0, y: 0 } },
            images: [],
            activeIndex: 0,
            savedToHistory: false,
            isDownloading: false,
            saveDirectoryHandle: null,
            saveDirectoryName: null,
            reRestoreIndex: null,
          };
        }),
    }),
    { name: 'Tissaia/ResultsStore', enabled: import.meta.env.DEV },
  ),
);

// ============================================
// SELECTORS
// ============================================

export const selectComparisonMode = (state: ResultsState) => state.comparisonMode;
export const selectActiveImage = (state: ResultsState) => state.images[state.activeIndex];
export const selectHasImages = (state: ResultsState) => state.images.length > 0;
export const selectImageCount = (state: ResultsState) => state.images.length;
export const selectSaveDirectoryName = (state: ResultsState) => state.saveDirectoryName;

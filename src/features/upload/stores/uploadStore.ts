// src/features/upload/stores/uploadStore.ts
/**
 * Upload Store
 * ============
 * Manages uploaded photo files, previews, and upload state.
 * Uses Blob URLs for lightweight previews — base64 conversion is deferred
 * to API call time (lazy conversion) to reduce memory footprint.
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================
// TYPES
// ============================================

export interface UploadedPhoto {
  /** Unique identifier */
  id: string;
  /** Original File reference */
  file: File;
  /** Blob URL for preview display (lightweight, revoked on removal) */
  previewUrl: string;
  /** Original file name */
  name: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** ISO timestamp of when the file was added */
  addedAt: string;
}

interface UploadState {
  /** All uploaded photos */
  photos: UploadedPhoto[];
  /** Whether an upload operation is in progress */
  isUploading: boolean;
  /** Upload progress 0-100 */
  uploadProgress: number;
  /** Error message from last failed upload */
  uploadError: string | null;
  /** Pre-selected output directory handle (File System Access API, Chromium only) */
  outputDirectoryHandle: FileSystemDirectoryHandle | null;
  /** Display name of the selected output directory */
  outputDirectoryName: string | null;
  /** Count of files auto-saved to output folder in current batch */
  autoSavedCount: number;
  /** Total files expected to be saved in current batch */
  autoSaveTotal: number;

  // Actions
  addPhoto: (photo: UploadedPhoto) => void;
  addPhotos: (photos: UploadedPhoto[]) => void;
  removePhoto: (id: string) => void;
  movePhoto: (fromIndex: number, toIndex: number) => void;
  clearPhotos: () => void;
  setIsUploading: (uploading: boolean) => void;
  setUploadProgress: (progress: number) => void;
  setUploadError: (error: string | null) => void;
  setOutputDirectory: (handle: FileSystemDirectoryHandle | null) => void;
  clearOutputDirectory: () => void;
  setAutoSaveTotal: (total: number) => void;
  incrementAutoSaved: () => void;
  resetAutoSaveProgress: () => void;
}

// ============================================
// HELPERS
// ============================================

let idCounter = 0;

export function generatePhotoId(): string {
  idCounter += 1;
  return `photo_${Date.now()}_${idCounter}`;
}

/**
 * Create a Blob URL for lightweight preview rendering.
 * Blob URLs are memory-efficient compared to base64 data URLs because
 * they reference the original blob data without base64 expansion (~33% overhead).
 * Must be revoked via URL.revokeObjectURL() when no longer needed.
 */
export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

/**
 * Convert a File to a base64 data URL for API submission.
 * Only called lazily when sending to backend — NOT for preview display.
 * Uses FileReader API (works in all browsers and WebViews).
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader did not return a string'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(i, units.length - 1);
  const unit = units[idx];
  if (unit === undefined) return `${bytes} B`;
  return `${(bytes / k ** idx).toFixed(1)} ${unit}`;
}

// ============================================
// STORE
// ============================================

export const useUploadStore = create<UploadState>()(
  devtools(
    (set) => ({
      photos: [],
      isUploading: false,
      uploadProgress: 0,
      uploadError: null,
      outputDirectoryHandle: null,
      outputDirectoryName: null,
      autoSavedCount: 0,
      autoSaveTotal: 0,

      addPhoto: (photo) =>
        set((state) => ({
          photos: [...state.photos, photo],
        })),

      addPhotos: (photos) =>
        set((state) => ({
          photos: [...state.photos, ...photos],
        })),

      removePhoto: (id) =>
        set((state) => {
          const photo = state.photos.find((p) => p.id === id);
          if (photo) {
            URL.revokeObjectURL(photo.previewUrl);
          }
          return { photos: state.photos.filter((p) => p.id !== id) };
        }),

      movePhoto: (fromIndex, toIndex) =>
        set((state) => {
          if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= state.photos.length ||
            toIndex >= state.photos.length ||
            fromIndex === toIndex
          ) {
            return state;
          }
          const next = [...state.photos];
          const [moved] = next.splice(fromIndex, 1);
          if (moved) next.splice(toIndex, 0, moved);
          return { photos: next };
        }),

      clearPhotos: () =>
        set((state) => {
          for (const photo of state.photos) {
            URL.revokeObjectURL(photo.previewUrl);
          }
          return {
            photos: [],
            outputDirectoryHandle: null,
            outputDirectoryName: null,
            autoSavedCount: 0,
            autoSaveTotal: 0,
          };
        }),

      setIsUploading: (uploading) => set({ isUploading: uploading }),

      setUploadProgress: (progress) => set({ uploadProgress: progress }),

      setUploadError: (error) => set({ uploadError: error }),

      setOutputDirectory: (handle) =>
        set({
          outputDirectoryHandle: handle,
          outputDirectoryName: handle?.name ?? null,
        }),

      clearOutputDirectory: () =>
        set({
          outputDirectoryHandle: null,
          outputDirectoryName: null,
        }),

      setAutoSaveTotal: (total) => set({ autoSaveTotal: total, autoSavedCount: 0 }),

      incrementAutoSaved: () => set((state) => ({ autoSavedCount: state.autoSavedCount + 1 })),

      resetAutoSaveProgress: () => set({ autoSavedCount: 0, autoSaveTotal: 0 }),
    }),
    { name: 'Tissaia/UploadStore', enabled: import.meta.env.DEV },
  ),
);

// ============================================
// SELECTORS
// ============================================

export const selectPhotos = (state: UploadState) => state.photos;
export const selectIsUploading = (state: UploadState) => state.isUploading;
export const selectUploadProgress = (state: UploadState) => state.uploadProgress;
export const selectHasPhotos = (state: UploadState) => state.photos.length > 0;
export const selectOutputDirectoryName = (state: UploadState) => state.outputDirectoryName;
export const selectHasOutputDirectory = (state: UploadState) => state.outputDirectoryHandle !== null;
export const selectAutoSavedCount = (state: UploadState) => state.autoSavedCount;
export const selectAutoSaveTotal = (state: UploadState) => state.autoSaveTotal;

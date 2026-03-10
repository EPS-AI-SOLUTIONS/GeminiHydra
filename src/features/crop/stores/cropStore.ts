// src/features/crop/stores/cropStore.ts
/**
 * Crop Store
 * ==========
 * Manages crop state: bounding boxes, zoom, crop mode, and manual selection.
 * BoundingBox coordinates use normalized 0-1000 space per legacy spec.
 * Includes undo/redo stack (max 20 entries) for bounding box changes.
 */
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================
// TYPES
// ============================================

export type VerificationSource = 'algorithm' | 'gemini' | 'claude' | null;

/**
 * Bounding box in normalized 0-1000 coordinate space.
 * Matches the legacy BoundingBox format from Tissaia v3.
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  label: string | null;
  /** Rotation angle in degrees (clockwise) for upright alignment. */
  rotation_angle: number;
  /** Precise polygon contour (normalized 0-1000 coordinates). */
  contour: Point2D[];
  /** Whether this photo needs generative outpainting. */
  needs_outpaint: boolean;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface CroppedPhoto {
  index: number;
  base64: string;
  width: number;
  height: number;
}

/** Aspect ratio lock options for detection boxes */
export type AspectRatioLock = 'auto' | '3:2' | '4:3' | '1:1' | '16:9';

/** Maximum undo/redo stack depth */
const MAX_UNDO_STACK = 20;

interface CropState {
  /** AI-detected bounding boxes */
  detectionBoxes: BoundingBox[];
  /** Whether AI detection is running */
  isDetecting: boolean;
  /** Whether AI verification cascade is running */
  isVerifying: boolean;
  /** Which system verified the boxes */
  verificationSource: VerificationSource;
  /** Cascade metadata (JSON object or null) */
  verificationDetail: Record<string, unknown> | null;
  /** Expected number of photos (user override for re-detection) */
  expectedPhotoCount: number | null;
  /** Zoom level (1.0 = 100%) */
  zoom: number;
  /** Index of currently selected photo (from upload store) */
  activePhotoIndex: number;
  /** Cropped photos returned from backend */
  croppedPhotos: CroppedPhoto[];
  /** Whether crop request is in flight */
  isCropping: boolean;
  /** Aspect ratio lock for detection boxes */
  aspectRatioLock: AspectRatioLock;
  /** Index of the highlighted detection zone (keyboard focus) */
  highlightedZoneIndex: number | null;

  /** Undo stack — previous bounding box states */
  undoStack: BoundingBox[][];
  /** Redo stack — forward bounding box states */
  redoStack: BoundingBox[][];

  // Actions
  setDetectionBoxes: (boxes: BoundingBox[]) => void;
  addDetectionBox: (box: BoundingBox) => void;
  removeDetectionBox: (index: number) => void;
  clearDetectionBoxes: () => void;
  setIsDetecting: (detecting: boolean) => void;
  setIsVerifying: (verifying: boolean) => void;
  setVerificationSource: (source: VerificationSource) => void;
  setVerificationDetail: (detail: Record<string, unknown> | null) => void;
  setExpectedPhotoCount: (count: number | null) => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setActivePhotoIndex: (index: number) => void;
  setCroppedPhotos: (photos: CroppedPhoto[]) => void;
  setIsCropping: (cropping: boolean) => void;
  setAspectRatioLock: (ratio: AspectRatioLock) => void;
  setHighlightedZoneIndex: (index: number | null) => void;
  resetCropState: () => void;
  undo: () => void;
  redo: () => void;
}

// ============================================
// CONSTANTS
// ============================================

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 0.25;

// ============================================
// HELPERS
// ============================================

/** Push current boxes onto undo stack, clear redo stack (new action branch). */
function pushUndo(state: CropState): { undoStack: BoundingBox[][]; redoStack: BoundingBox[][] } {
  const newUndoStack = [...state.undoStack, [...state.detectionBoxes]];
  // Cap undo stack at MAX_UNDO_STACK entries
  if (newUndoStack.length > MAX_UNDO_STACK) {
    newUndoStack.shift();
  }
  return { undoStack: newUndoStack, redoStack: [] };
}

// ============================================
// STORE
// ============================================

export const useCropStore = create<CropState>()(
  devtools(
    (set) => ({
      detectionBoxes: [],
      isDetecting: false,
      isVerifying: false,
      verificationSource: null,
      verificationDetail: null,
      expectedPhotoCount: null,
      zoom: 1.0,
      activePhotoIndex: 0,
      croppedPhotos: [],
      isCropping: false,
      aspectRatioLock: 'auto',
      highlightedZoneIndex: null,
      undoStack: [],
      redoStack: [],

      setDetectionBoxes: (boxes) =>
        set((state) => ({
          ...pushUndo(state),
          detectionBoxes: boxes,
        })),

      addDetectionBox: (box) =>
        set((state) => ({
          ...pushUndo(state),
          detectionBoxes: [...state.detectionBoxes, box],
        })),

      removeDetectionBox: (index) =>
        set((state) => ({
          ...pushUndo(state),
          detectionBoxes: state.detectionBoxes.filter((_, i) => i !== index),
        })),

      clearDetectionBoxes: () =>
        set((state) => ({
          ...pushUndo(state),
          detectionBoxes: [],
        })),

      setIsDetecting: (detecting) => set({ isDetecting: detecting }),

      setIsVerifying: (verifying) => set({ isVerifying: verifying }),

      setVerificationSource: (source) => set({ verificationSource: source }),

      setVerificationDetail: (detail) => set({ verificationDetail: detail }),

      setExpectedPhotoCount: (count) => set({ expectedPhotoCount: count }),

      setZoom: (zoom) => set({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),

      zoomIn: () =>
        set((state) => ({
          zoom: Math.min(MAX_ZOOM, state.zoom + ZOOM_STEP),
        })),

      zoomOut: () =>
        set((state) => ({
          zoom: Math.max(MIN_ZOOM, state.zoom - ZOOM_STEP),
        })),

      resetZoom: () => set({ zoom: 1.0 }),

      setActivePhotoIndex: (index) => set({ activePhotoIndex: index }),

      setCroppedPhotos: (photos) => set({ croppedPhotos: photos }),

      setIsCropping: (cropping) => set({ isCropping: cropping }),

      setAspectRatioLock: (ratio) => set({ aspectRatioLock: ratio }),

      setHighlightedZoneIndex: (index) => set({ highlightedZoneIndex: index }),

      undo: () =>
        set((state) => {
          if (state.undoStack.length === 0) return state;
          const newUndoStack = [...state.undoStack];
          const previousBoxes = newUndoStack.pop();
          if (!previousBoxes) return state;
          return {
            undoStack: newUndoStack,
            redoStack: [...state.redoStack, [...state.detectionBoxes]],
            detectionBoxes: previousBoxes,
          };
        }),

      redo: () =>
        set((state) => {
          if (state.redoStack.length === 0) return state;
          const newRedoStack = [...state.redoStack];
          const nextBoxes = newRedoStack.pop()!;
          return {
            redoStack: newRedoStack,
            undoStack: [...state.undoStack, [...state.detectionBoxes]],
            detectionBoxes: nextBoxes,
          };
        }),

      resetCropState: () =>
        set({
          detectionBoxes: [],
          isDetecting: false,
          isVerifying: false,
          verificationSource: null,
          verificationDetail: null,
          expectedPhotoCount: null,
          zoom: 1.0,
          activePhotoIndex: 0,
          croppedPhotos: [],
          isCropping: false,
          aspectRatioLock: 'auto',
          highlightedZoneIndex: null,
          undoStack: [],
          redoStack: [],
        }),
    }),
    { name: 'Tissaia/CropStore', enabled: import.meta.env.DEV },
  ),
);

// ============================================
// MOCK DETECTION DATA
// ============================================

/**
 * Mock AI detection result for development.
 * Returns bounding boxes in normalized 0-1000 coordinate space.
 */
export function getMockDetectionBoxes(): BoundingBox[] {
  return [
    {
      x: 50,
      y: 60,
      width: 420,
      height: 380,
      confidence: 0.94,
      label: 'damaged area',
      rotation_angle: 0,
      contour: [],
      needs_outpaint: false,
    },
    {
      x: 520,
      y: 100,
      width: 350,
      height: 300,
      confidence: 0.87,
      label: 'scratch region',
      rotation_angle: 0,
      contour: [],
      needs_outpaint: false,
    },
    {
      x: 200,
      y: 550,
      width: 500,
      height: 350,
      confidence: 0.72,
      label: 'faded area',
      rotation_angle: 0,
      contour: [],
      needs_outpaint: false,
    },
  ];
}

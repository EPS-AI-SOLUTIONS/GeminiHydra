// src/features/restore/utils/pipelineCheckpoint.ts

const CHECKPOINT_KEY = 'tissaia-pipeline-checkpoint';
const CHECKPOINT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface CropMeta {
  cropIndex: number;
  photoIndex: number;
  photoName: string;
}

export interface PipelineCheckpoint {
  savedAt: number;
  status: 'running' | 'interrupted' | 'completed';
  totalCrops: number;
  completedIndices: number[];
  cropMeta: CropMeta[];
}

export function saveCheckpoint(checkpoint: PipelineCheckpoint): void {
  try {
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(checkpoint));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function loadCheckpoint(): PipelineCheckpoint | null {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return null;
    const cp: PipelineCheckpoint = JSON.parse(raw);
    // Check TTL
    if (Date.now() - cp.savedAt > CHECKPOINT_TTL_MS) {
      localStorage.removeItem(CHECKPOINT_KEY);
      return null;
    }
    return cp;
  } catch {
    return null;
  }
}

export function clearCheckpoint(): void {
  try {
    localStorage.removeItem(CHECKPOINT_KEY);
  } catch {
    // ignore
  }
}

export function markInterrupted(): void {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return;
    const cp: PipelineCheckpoint = JSON.parse(raw);
    cp.status = 'interrupted';
    cp.savedAt = Date.now();
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(cp));
  } catch {
    // ignore
  }
}

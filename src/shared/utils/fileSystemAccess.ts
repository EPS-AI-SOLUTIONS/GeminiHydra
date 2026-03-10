// src/shared/utils/fileSystemAccess.ts
/**
 * File System Access API utilities.
 * Provides helpers for writing restored images to a user-selected directory.
 * Chromium-only API — graceful fallback via backend POST /api/files/save-image.
 */

import { apiPost } from '@/shared/api/client';

/** Check if showDirectoryPicker is available (Chromium-only API). */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Prompt the user to select a directory for saving files. */
export async function pickOutputDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) return null;
  try {
    return await (window as any).showDirectoryPicker({ mode: 'readwrite' });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') return null;
    throw err;
  }
}

/** Convert a data URL (data:image/...;base64,...) to a Blob. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  if (!dataUrl.startsWith('data:')) return null;
  const splitIndex = dataUrl.indexOf(',');
  if (splitIndex === -1) return null;
  const header = dataUrl.slice(0, splitIndex);
  const base64 = dataUrl.slice(splitIndex + 1);
  const mimeMatch = header.match(/data:(.*?);/);
  const mime = mimeMatch?.[1] ?? 'image/png';
  try {
    const byteString = atob(base64.replace(/\s+/g, ''));
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

/** Convert any image URL (blob: or data:) to a Blob. */
export async function urlToBlob(src: string): Promise<Blob | null> {
  if (src.startsWith('blob:')) {
    try {
      const resp = await fetch(src);
      return await resp.blob();
    } catch {
      return null;
    }
  }
  return dataUrlToBlob(src);
}

/** Save a blob to a directory handle without showing a dialog. */
export async function saveToDirectory(
  dirHandle: FileSystemDirectoryHandle,
  blob: Blob,
  fileName: string,
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/**
 * Auto-save a restored image to the output directory.
 * Converts base64 data URL or blob URL to Blob and writes to the directory.
 * Returns true if saved successfully, false otherwise.
 */
export async function autoSaveRestoredImage(
  dirHandle: FileSystemDirectoryHandle,
  imageUrl: string,
  fileName: string,
): Promise<boolean> {
  try {
    const blob = await urlToBlob(imageUrl);
    if (!blob) return false;
    const safeName = `restored_${fileName}`.replace(/[<>:"/\\|?*]/g, '_');
    await saveToDirectory(dirHandle, blob, safeName);
    return true;
  } catch (err) {
    console.warn('[AutoSave] Failed to save:', fileName, err);
    return false;
  }
}

/** Convert a Blob to a raw base64 string (without the data URL prefix). */
async function blobToBase64(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * Auto-save a restored image via the backend output directory.
 * Uses POST /api/files/save-image which writes to the configured output_directory in ti_settings.
 * Fallback for when File System Access API handle is unavailable (non-Chromium or page reload).
 */
export async function autoSaveViaBackend(imageUrl: string, fileName: string): Promise<boolean> {
  try {
    const blob = await urlToBlob(imageUrl);
    if (!blob) return false;
    const base64 = await blobToBase64(blob);
    if (!base64) return false;
    const safeName = `restored_${fileName}`.replace(/[<>:"/\\|?*]/g, '_');
    await apiPost('/api/files/save-image', {
      image_base64: base64,
      filename: safeName,
    });
    return true;
  } catch (err) {
    console.warn('[AutoSave] Backend save failed:', fileName, err);
    return false;
  }
}

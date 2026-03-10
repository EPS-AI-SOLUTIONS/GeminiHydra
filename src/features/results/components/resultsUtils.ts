// src/features/results/components/resultsUtils.ts
/** Utilities for the Results feature. */

import { urlToBlob } from '@/shared/utils/fileSystemAccess';

/** Download an image from a data: or blob: URL using browser APIs. */
export async function downloadImage(src: string, fileName: string): Promise<void> {
  const blob = await urlToBlob(src);
  if (!blob) return;

  // Try File System Access API for save dialog
  if ('showSaveFilePicker' in window) {
    try {
      const ext = fileName.includes('.') ? `.${fileName.split('.').pop()}` : '.png';
      const handle = await (
        window as unknown as { showSaveFilePicker: (opts: any) => Promise<any> }
      ).showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: 'Image', accept: { [blob.type]: [ext] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      // Fall through to regular download
    }
  }

  // Fallback: regular download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

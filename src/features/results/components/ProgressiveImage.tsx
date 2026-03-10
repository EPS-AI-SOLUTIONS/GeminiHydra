// src/features/results/components/ProgressiveImage.tsx
/**
 * ProgressiveImage — low-res blur placeholder that crossfades to full-res when loaded.
 * Uses createImageBitmap for off-main-thread thumbnail generation.
 */
import { memo, useEffect, useRef, useState } from 'react';

// ============================================
// CONSTANTS
// ============================================

const THUMBNAIL_WIDTH = 200;

// ============================================
// THUMBNAIL GENERATION
// ============================================

/** Generate a small thumbnail data URL using createImageBitmap (async, off main thread). */
async function generateThumbnail(src: string, maxWidth = THUMBNAIL_WIDTH): Promise<string> {
  try {
    // Load the image into a blob for createImageBitmap
    let blob: Blob;
    if (src.startsWith('blob:') || src.startsWith('http')) {
      const resp = await fetch(src);
      blob = await resp.blob();
    } else if (src.startsWith('data:')) {
      const splitIndex = src.indexOf(',');
      if (splitIndex === -1) return src;
      const header = src.slice(0, splitIndex);
      const base64 = src.slice(splitIndex + 1);
      const mimeMatch = header.match(/data:(.*?);/);
      const mime = mimeMatch?.[1] ?? 'image/png';
      const byteString = atob(base64.replace(/\s+/g, ''));
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i++) {
        bytes[i] = byteString.charCodeAt(i);
      }
      blob = new Blob([bytes], { type: mime });
    } else {
      return src;
    }

    // Use createImageBitmap for async, off-main-thread resize
    const bitmap = await createImageBitmap(blob, { resizeWidth: maxWidth, resizeQuality: 'medium' });
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return src;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.5);
  } catch {
    // Fallback: return original src
    return src;
  }
}

// ============================================
// HOOK
// ============================================

/** Hook that returns a thumbnail URL for progressive loading. */
function useThumbnail(src: string): string | null {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const prevSrcRef = useRef<string>('');

  useEffect(() => {
    if (!src || src === prevSrcRef.current) return;
    prevSrcRef.current = src;
    setThumbnail(null);
    let cancelled = false;
    generateThumbnail(src).then((result) => {
      if (!cancelled) setThumbnail(result);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return thumbnail;
}

// ============================================
// COMPONENT
// ============================================

export interface ProgressiveImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  draggable?: boolean;
}

/** Image with low-res blur placeholder that crossfades to full-res when loaded. */
export const ProgressiveImage = memo(function ProgressiveImage({
  src,
  alt,
  className,
  style,
  draggable = false,
}: ProgressiveImageProps) {
  const thumbnail = useThumbnail(src);
  const [fullLoaded, setFullLoaded] = useState(false);
  const prevSrcRef = useRef<string>('');

  // Reset loaded state when src changes
  useEffect(() => {
    if (src !== prevSrcRef.current) {
      prevSrcRef.current = src;
      setFullLoaded(false);
    }
  }, [src]);

  return (
    <div className="relative" style={style}>
      {/* Low-res placeholder with blur */}
      {thumbnail && !fullLoaded && (
        <img
          src={thumbnail}
          alt=""
          className={className}
          style={{
            ...style,
            filter: 'blur(10px)',
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          draggable={false}
          aria-hidden
        />
      )}
      {/* Full-res image — crossfade in */}
      <img
        src={src}
        alt={alt}
        className={className}
        style={{
          ...style,
          opacity: fullLoaded ? 1 : 0,
          transition: 'opacity 0.3s ease-in-out, filter 0.3s ease-in-out',
        }}
        draggable={draggable}
        onLoad={() => setFullLoaded(true)}
      />
    </div>
  );
});

ProgressiveImage.displayName = 'ProgressiveImage';

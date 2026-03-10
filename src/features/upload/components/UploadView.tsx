// src/features/upload/components/UploadView.tsx
/**
 * Upload View — Phase 4
 * =====================
 * Drag-and-drop photo upload with preview, file validation,
 * and glass panel styling. Supports multiple files.
 *
 * Uses react-dropzone for drag/drop, motion for animations,
 * and connects to viewStore for navigation to crop view.
 */

import { AlertCircle, Camera, ChevronLeft, ChevronRight, ImagePlus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
// @ts-expect-error
import { type FileRejection, useDropzone } from 'react-dropzone';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Badge, Button, Card, ProgressBar } from '@/components/atoms';
import {
  createPreviewUrl,
  formatBytes,
  generatePhotoId,
  type UploadedPhoto,
  useUploadStore,
} from '@/features/upload/stores/uploadStore';
import { useViewTheme } from '@/shared/hooks/useViewTheme';
import { cn } from '@/shared/utils/cn';
import { useViewStore } from '@/stores/viewStore';
import { OutputFolderPicker } from './OutputFolderPicker';

// ============================================
// CONSTANTS
// ============================================

const MAX_FILE_SIZE = 120 * 1024 * 1024; // 120 MB
const MAX_FILE_SIZE_LABEL = '120 MB';
const MAX_PHOTOS = 100;

const ACCEPTED_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/tiff': ['.tiff', '.tif'],
};

const ACCEPTED_EXTENSIONS_LABEL = 'JPG, PNG, WebP, TIFF';

// ============================================
// FILE ERROR MAPPING
// ============================================

interface FileError {
  fileName: string;
  message: string;
}

function mapRejectionToError(rejection: FileRejection): FileError {
  const firstError = rejection.errors[0];
  if (!firstError) {
    return { fileName: rejection.file.name, message: 'Unknown error' };
  }

  switch (firstError.code) {
    case 'file-too-large':
      return {
        fileName: rejection.file.name,
        message: `File exceeds ${MAX_FILE_SIZE_LABEL} limit (${formatBytes(rejection.file.size)})`,
      };
    case 'file-invalid-type':
      return {
        fileName: rejection.file.name,
        message: `Unsupported format. Use: ${ACCEPTED_EXTENSIONS_LABEL}`,
      };
    default:
      return {
        fileName: rejection.file.name,
        message: firstError.message,
      };
  }
}

// ============================================
// THUMBNAIL COMPONENT
// ============================================

interface ThumbnailProps {
  photo: UploadedPhoto;
  index: number;
  total: number;
  onRemove: (id: string) => void;
  onMoveLeft: (index: number) => void;
  onMoveRight: (index: number) => void;
}

const Thumbnail = memo(function Thumbnail({ photo, index, total, onRemove, onMoveLeft, onMoveRight }: ThumbnailProps) {
  const theme = useViewTheme();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="relative group"
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border aspect-square',
          'bg-[var(--matrix-bg-tertiary)]',
          'border-[var(--matrix-border)]',
          'group-hover:border-[var(--matrix-accent)]/30',
          'transition-all duration-200',
        )}
      >
        <img src={photo.previewUrl} alt={photo.name} className="w-full h-full object-cover" loading="lazy" />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Remove button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(photo.id);
          }}
          className={cn(
            'absolute top-1.5 right-1.5 p-1 rounded-lg',
            'bg-red-500/80 text-white',
            'opacity-0 group-hover:opacity-100',
            'transition-all duration-200',
            'hover:bg-red-500 hover:scale-110',
          )}
          aria-label={`Remove ${photo.name}`}
        >
          <X size={12} />
        </button>

        {/* Move left / right buttons (#1) */}
        <div className="absolute bottom-1.5 left-0 right-0 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {index > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveLeft(index);
              }}
              className={cn(
                'p-0.5 rounded-md',
                'bg-black/60 text-white',
                'hover:bg-black/80 hover:scale-110',
                'transition-all duration-150',
              )}
              aria-label={`Move ${photo.name} left`}
            >
              <ChevronLeft size={12} />
            </button>
          )}
          {index < total - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveRight(index);
              }}
              className={cn(
                'p-0.5 rounded-md',
                'bg-black/60 text-white',
                'hover:bg-black/80 hover:scale-110',
                'transition-all duration-150',
              )}
              aria-label={`Move ${photo.name} right`}
            >
              <ChevronRight size={12} />
            </button>
          )}
        </div>
      </div>

      {/* File info — #30 text hierarchy + #45 gradient fade */}
      <div className="mt-1.5 px-0.5">
        <p className={cn('text-sm relative overflow-hidden whitespace-nowrap', theme.text)}>
          {photo.name}
          <span className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[var(--matrix-bg-secondary)] to-transparent" />
        </p>
        <p className={cn('text-xs opacity-60', theme.textMuted)}>{formatBytes(photo.size)}</p>
      </div>
    </motion.div>
  );
});

// ============================================
// UPLOAD VIEW COMPONENT
// ============================================

export function UploadView() {
  const { t } = useTranslation();
  const theme = useViewTheme();
  const setView = useViewStore((s) => s.setView);

  // Upload store
  const photos = useUploadStore((s) => s.photos);
  const addPhotos = useUploadStore((s) => s.addPhotos);
  const removePhoto = useUploadStore((s) => s.removePhoto);
  const movePhoto = useUploadStore((s) => s.movePhoto);
  const clearPhotos = useUploadStore((s) => s.clearPhotos);
  const isUploading = useUploadStore((s) => s.isUploading);
  const setIsUploading = useUploadStore((s) => s.setIsUploading);
  const uploadProgress = useUploadStore((s) => s.uploadProgress);
  const setUploadProgress = useUploadStore((s) => s.setUploadProgress);

  // Local state
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileErrors, setFileErrors] = useState<FileError[]>([]);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // #41: Whether photo limit is reached
  const isLimitReached = photos.length >= MAX_PHOTOS;

  // ── Move handlers (#1) ─────────────────────
  const handleMoveLeft = useCallback(
    (index: number) => {
      movePhoto(index, index - 1);
    },
    [movePhoto],
  );

  const handleMoveRight = useCallback(
    (index: number) => {
      movePhoto(index, index + 1);
    },
    [movePhoto],
  );

  // ── Confirmation clear (#14) ───────────────
  const handleClearClick = useCallback(() => {
    if (confirmingClear) {
      // Second click — actually clear
      clearPhotos();
      setConfirmingClear(false);
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    } else {
      // First click — enter confirmation state
      setConfirmingClear(true);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmingClear(false);
        confirmTimerRef.current = null;
      }, 3000);
    }
  }, [confirmingClear, clearPhotos]);

  // Clean up confirmation timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
      }
    };
  }, []);

  // ── Paste from clipboard (#15) ─────────────
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.files;
      if (!items || items.length === 0) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const file = items[i];
        if (file?.type.startsWith('image/')) {
          imageFiles.push(file);
        }
      }

      if (imageFiles.length === 0) return;

      // Respect upload limit
      const remaining = MAX_PHOTOS - useUploadStore.getState().photos.length;
      if (remaining <= 0) return;

      const filesToAdd = imageFiles.slice(0, remaining);
      const processed: UploadedPhoto[] = filesToAdd.map((file) => ({
        id: generatePhotoId(),
        file,
        previewUrl: createPreviewUrl(file),
        name: file.name || `pasted-image-${Date.now()}.png`,
        size: file.size,
        mimeType: file.type,
        addedAt: new Date().toISOString(),
      }));

      if (processed.length > 0) {
        useUploadStore.getState().addPhotos(processed);
        toast.success(
          t('upload.pastedPhotos', '{{count}} photo(s) pasted from clipboard', { count: processed.length }),
        );
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [t]);

  // ── Handle file drop ──────────────────────────
  const onDrop = useCallback(
    async (acceptedFiles: File[], rejections: FileRejection[]) => {
      // Map rejections to error messages
      const errors = rejections.map(mapRejectionToError);
      setFileErrors(errors);

      if (acceptedFiles.length === 0) return;

      // Respect upload limit (#41)
      const currentCount = useUploadStore.getState().photos.length;
      const remaining = MAX_PHOTOS - currentCount;
      const filesToProcess = acceptedFiles.slice(0, remaining);

      if (filesToProcess.length < acceptedFiles.length) {
        setFileErrors((prev) => [
          ...prev,
          {
            fileName: '',
            message: t(
              'upload.limitExceeded',
              'Upload limit reached ({{max}} photos max). {{skipped}} file(s) skipped.',
              {
                max: MAX_PHOTOS,
                skipped: acceptedFiles.length - filesToProcess.length,
              },
            ),
          },
        ]);
      }

      if (filesToProcess.length === 0) return;

      setIsUploading(true);
      setUploadProgress(0);

      const processed: UploadedPhoto[] = [];
      const total = filesToProcess.length;

      for (let i = 0; i < total; i++) {
        const file = filesToProcess[i];
        if (!file) continue;

        try {
          // Use Blob URL for lightweight preview (no base64 expansion)
          const previewUrl = createPreviewUrl(file);

          processed.push({
            id: generatePhotoId(),
            file,
            previewUrl,
            name: file.name,
            size: file.size,
            mimeType: file.type,
            addedAt: new Date().toISOString(),
          });
        } catch {
          setFileErrors((prev) => [...prev, { fileName: file.name, message: 'Failed to read file' }]);
        }

        // Update progress
        setUploadProgress(Math.round(((i + 1) / total) * 100));
      }

      if (processed.length > 0) {
        addPhotos(processed);
      }

      setIsUploading(false);
      setUploadProgress(0);
      setIsDragOver(false);
    },
    [addPhotos, setIsUploading, setUploadProgress, t],
  );

  // ── Dropzone config ───────────────────────────
  const { getRootProps, getInputProps, isDragReject, open } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    disabled: isUploading || isLimitReached,
    noClick: isLimitReached,
    onDragEnter: () => setIsDragOver(true),
    onDragLeave: () => setIsDragOver(false),
  });

  // ── Dismiss errors ────────────────────────────
  const dismissErrors = useCallback(() => {
    setFileErrors([]);
  }, []);

  // ── Navigate to crop ──────────────────────────
  const handleProceedToCrop = useCallback(() => {
    if (photos.length > 0) {
      setView('crop');
    }
  }, [photos.length, setView]);

  // ── Camera capture ───────────────────────────
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const handleCameraCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const photo: UploadedPhoto = {
        id: generatePhotoId(),
        file,
        previewUrl: createPreviewUrl(file),
        name: file.name,
        size: file.size,
        mimeType: file.type,
        addedAt: new Date().toISOString(),
      };
      addPhotos([photo]);
      // Reset input
      e.target.value = '';
    },
    [addPhotos],
  );

  // ── Browse files handler (#48) ─────────────────
  const handleBrowseClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      open();
    },
    [open],
  );

  // ── Determine dropzone visual state ───────────
  const dropzoneStateClasses = isDragReject
    ? 'border-red-500/60 bg-red-500/5'
    : isDragOver
      ? 'border-[var(--matrix-accent)]/50 bg-[var(--matrix-accent)]/5 scale-[1.01]'
      : isLimitReached
        ? 'border-[var(--matrix-border)] opacity-50 cursor-not-allowed'
        : 'border-[var(--matrix-border)] hover:border-[var(--matrix-accent)]/30';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="p-6 h-full flex flex-col"
      data-testid="upload-view"
    >
      {/* ── Header ─────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[var(--matrix-accent)]/10">
            <ImagePlus className="text-[var(--matrix-accent)]" size={24} />
          </div>
          <div>
            <h2 className={cn('text-2xl font-bold', theme.title)} data-testid="upload-heading">
              {t('upload.title', 'Upload Photos')}
            </h2>
            <p className={theme.textMuted}>{t('upload.description', 'Drag and drop your photos for AI restoration')}</p>
          </div>
        </div>
      </div>

      {/* Camera capture input */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraCapture}
      />

      {/* ── Error display ──────────────────────── */}
      <AnimatePresence>
        {fileErrors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <div
              className={cn('rounded-xl p-4 space-y-2', 'bg-red-500/10 border border-red-500/20')}
              data-testid="upload-errors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="text-red-400" />
                  <span className="text-sm font-medium text-red-400">
                    {t('upload.filesRejected', '{{count}} file(s) rejected', { count: fileErrors.length })}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={dismissErrors}
                  className="p-1 rounded hover:bg-red-500/20 transition-colors"
                >
                  <X size={14} className="text-red-400" />
                </button>
              </div>
              {fileErrors.map((err) => (
                <p key={`${err.fileName}-${err.message}`} className="text-sm text-red-400/80">
                  {err.fileName && <span className="font-medium">{err.fileName}: </span>}
                  {err.message}
                </p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dropzone ───────────────────────────── */}
      <div
        {...getRootProps()}
        data-testid="upload-dropzone"
        className={cn(
          photos.length > 0
            ? 'h-48 flex flex-col items-center justify-center'
            : 'flex-1 flex flex-col items-center justify-center',
          'rounded-2xl border-2 border-dashed',
          'transition-all duration-200 cursor-pointer',
          'glass-panel',
          dropzoneStateClasses,
          isUploading && 'pointer-events-none opacity-70',
        )}
      >
        <input {...getInputProps()} />

        {isUploading ? (
          /* ── Upload progress state ── */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center w-full max-w-xs space-y-4"
            data-testid="upload-progress"
          >
            <div className="w-20 h-20 mx-auto rounded-2xl bg-[var(--matrix-accent)]/10 flex items-center justify-center">
              <Upload size={40} className="text-[var(--matrix-accent)] animate-pulse" />
            </div>
            <p className={cn('text-sm font-medium', theme.text)}>{t('upload.processing', 'Processing files...')}</p>
            <ProgressBar value={uploadProgress} size="md" label />
          </motion.div>
        ) : (
          /* ── Default dropzone state ── */
          <motion.div
            animate={{
              scale: isDragOver ? 1.05 : 1,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="text-center"
          >
            <div
              className={cn(
                'w-24 h-24 mx-auto mb-6 rounded-2xl flex items-center justify-center',
                'bg-[var(--matrix-accent)]/10',
              )}
            >
              <Upload
                size={48}
                className={cn(
                  'transition-colors duration-200',
                  isDragOver ? 'text-[var(--matrix-accent)]' : 'text-[var(--matrix-text-secondary)]',
                )}
              />
            </div>

            <h3 className={cn('text-xl font-semibold mb-2', theme.title)}>
              {isLimitReached
                ? t('upload.limitReached', 'Upload limit reached')
                : isDragOver
                  ? t('upload.dropHere', 'Drop files here')
                  : t('upload.dropzone', 'Drag & drop photos')}
            </h3>
            <p className={cn('mb-4', theme.textMuted)}>
              {isLimitReached
                ? t('upload.limitReachedHint', 'Remove photos to add more')
                : t('upload.clickToBrowse', 'or click to browse')}
            </p>

            {/* #48: Browse button with stopPropagation to prevent double dialog */}
            <Button
              variant="primary"
              size="md"
              type="button"
              onClick={handleBrowseClick}
              disabled={isLimitReached}
              data-testid="upload-browse-btn"
            >
              <Upload size={16} />
              {t('upload.browse', 'Browse Files')}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Camera size={14} />}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                cameraInputRef.current?.click();
              }}
              className="mt-2"
              disabled={isLimitReached}
              data-testid="upload-camera-btn"
            >
              {t('upload.takePhoto', 'Take Photo')}
            </Button>

            <div className={cn('mt-6 text-sm space-y-1', theme.textMuted)}>
              <p>{t('upload.supported', 'Supported: JPG, PNG, WebP, TIFF')}</p>
              <p>{t('upload.maxSize', 'Max size: 20 MB per file')}</p>
            </div>

            {/* Multiple file indicator */}
            <Badge variant="default" size="sm" className="mt-3">
              {t('upload.multipleFiles', 'Multiple files supported')}
            </Badge>
          </motion.div>
        )}
      </div>

      {/* ── Output folder picker (prominent Card) ── */}
      <div className="mt-4">
        <OutputFolderPicker />
      </div>

      {/* ── Uploaded photos preview ────────────── */}
      <AnimatePresence>
        {photos.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="mt-6"
          >
            <Card variant="glass" padding="md" data-testid="upload-thumbnail-grid">
              {/* Section header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className={cn('font-semibold', theme.title)}>{t('upload.uploadedPhotos', 'Uploaded Photos')}</h3>
                  {/* #41: Upload limit indicator */}
                  <Badge variant="accent" size="sm">
                    {photos.length}/{MAX_PHOTOS}
                  </Badge>
                </div>
                {/* #14: Two-step confirmation for Remove All */}
                <Button
                  variant={confirmingClear ? 'danger' : 'ghost'}
                  size="sm"
                  onClick={handleClearClick}
                  leftIcon={<Trash2 size={14} />}
                  data-testid="upload-remove-all-btn"
                >
                  {confirmingClear ? t('upload.confirmRemoveAll', 'Confirm?') : t('upload.removeAll', 'Remove All')}
                </Button>
              </div>

              {/* Thumbnail grid — #36: pb-20 for sticky bar clearance */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 pb-20">
                <AnimatePresence mode="popLayout">
                  {photos.map((photo, index) => (
                    <Thumbnail
                      key={photo.id}
                      photo={photo}
                      index={index}
                      total={photos.length}
                      onRemove={removePhoto}
                      onMoveLeft={handleMoveLeft}
                      onMoveRight={handleMoveRight}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticky bottom action bar — #36: z-10 added */}
      {photos.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky bottom-0 mt-4 -mx-6 -mb-6 px-6 py-4 glass-panel border-t border-[var(--matrix-border)] flex items-center justify-between z-10"
        >
          <div className="flex items-center gap-3">
            <Badge variant="accent" size="md">
              {photos.length}
            </Badge>
            <span className={cn('text-sm font-medium', theme.text)}>
              {t('upload.photosReady', '{{count}} photo(s) ready for processing', { count: photos.length })}
            </span>
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={handleProceedToCrop}
            leftIcon={<Sparkles size={18} />}
            rightIcon={<span>&rarr;</span>}
            data-testid="upload-proceed-sticky-btn"
          >
            {t('upload.proceedToCrop', 'Analyze & Crop')}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}

export default UploadView;

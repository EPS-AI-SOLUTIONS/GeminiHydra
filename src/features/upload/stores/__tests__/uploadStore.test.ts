import { beforeEach, describe, expect, it } from 'vitest';
import type { UploadedPhoto } from '@/features/upload/stores/uploadStore';
import { formatBytes, generatePhotoId, useUploadStore } from '@/features/upload/stores/uploadStore';

/** Create a mock UploadedPhoto for testing. */
function createMockPhoto(overrides: Partial<UploadedPhoto> = {}): UploadedPhoto {
  return {
    id: overrides.id ?? generatePhotoId(),
    file: new File(['dummy'], 'test.jpg', { type: 'image/jpeg' }),
    previewUrl: 'data:image/jpeg;base64,abc',
    name: 'test.jpg',
    size: 1024,
    mimeType: 'image/jpeg',
    addedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('uploadStore', () => {
  beforeEach(() => {
    useUploadStore.setState({
      photos: [],
      isUploading: false,
      uploadProgress: 0,
      uploadError: null,
    });
  });

  describe('initial state', () => {
    it('should start with an empty photos array', () => {
      expect(useUploadStore.getState().photos).toEqual([]);
    });

    it('should start with isUploading false', () => {
      expect(useUploadStore.getState().isUploading).toBe(false);
    });

    it('should start with uploadProgress at 0', () => {
      expect(useUploadStore.getState().uploadProgress).toBe(0);
    });

    it('should start with uploadError as null', () => {
      expect(useUploadStore.getState().uploadError).toBeNull();
    });
  });

  describe('addPhoto', () => {
    it('should add a photo to the store', () => {
      const photo = createMockPhoto({ id: 'photo-1' });
      useUploadStore.getState().addPhoto(photo);
      expect(useUploadStore.getState().photos).toHaveLength(1);
      expect(useUploadStore.getState().photos[0]?.id).toBe('photo-1');
    });

    it('should append photos without removing existing ones', () => {
      const photo1 = createMockPhoto({ id: 'p1' });
      const photo2 = createMockPhoto({ id: 'p2' });
      useUploadStore.getState().addPhoto(photo1);
      useUploadStore.getState().addPhoto(photo2);
      expect(useUploadStore.getState().photos).toHaveLength(2);
    });
  });

  describe('addPhotos', () => {
    it('should add multiple photos at once', () => {
      const photos = [
        createMockPhoto({ id: 'batch-1' }),
        createMockPhoto({ id: 'batch-2' }),
        createMockPhoto({ id: 'batch-3' }),
      ];
      useUploadStore.getState().addPhotos(photos);
      expect(useUploadStore.getState().photos).toHaveLength(3);
    });

    it('should append to existing photos', () => {
      useUploadStore.getState().addPhoto(createMockPhoto({ id: 'existing' }));
      useUploadStore.getState().addPhotos([createMockPhoto({ id: 'new-1' }), createMockPhoto({ id: 'new-2' })]);
      expect(useUploadStore.getState().photos).toHaveLength(3);
    });
  });

  describe('removePhoto', () => {
    it('should remove a photo by id', () => {
      const photo1 = createMockPhoto({ id: 'keep' });
      const photo2 = createMockPhoto({ id: 'remove' });
      useUploadStore.getState().addPhotos([photo1, photo2]);
      useUploadStore.getState().removePhoto('remove');
      expect(useUploadStore.getState().photos).toHaveLength(1);
      expect(useUploadStore.getState().photos[0]?.id).toBe('keep');
    });

    it('should do nothing if id does not exist', () => {
      useUploadStore.getState().addPhoto(createMockPhoto({ id: 'existing' }));
      useUploadStore.getState().removePhoto('nonexistent');
      expect(useUploadStore.getState().photos).toHaveLength(1);
    });
  });

  describe('clearPhotos', () => {
    it('should remove all photos', () => {
      useUploadStore.getState().addPhotos([createMockPhoto({ id: 'a' }), createMockPhoto({ id: 'b' })]);
      useUploadStore.getState().clearPhotos();
      expect(useUploadStore.getState().photos).toEqual([]);
    });
  });

  describe('upload progress state', () => {
    it('should set isUploading', () => {
      useUploadStore.getState().setIsUploading(true);
      expect(useUploadStore.getState().isUploading).toBe(true);
    });

    it('should set uploadProgress', () => {
      useUploadStore.getState().setUploadProgress(75);
      expect(useUploadStore.getState().uploadProgress).toBe(75);
    });

    it('should set uploadError', () => {
      useUploadStore.getState().setUploadError('Network error');
      expect(useUploadStore.getState().uploadError).toBe('Network error');
    });

    it('should clear uploadError by setting null', () => {
      useUploadStore.getState().setUploadError('Error');
      useUploadStore.getState().setUploadError(null);
      expect(useUploadStore.getState().uploadError).toBeNull();
    });
  });
});

describe('generatePhotoId', () => {
  it('should return a string starting with "photo_"', () => {
    const id = generatePhotoId();
    expect(id).toMatch(/^photo_/);
  });

  it('should generate unique ids on successive calls', () => {
    const id1 = generatePhotoId();
    const id2 = generatePhotoId();
    expect(id1).not.toBe(id2);
  });
});

describe('formatBytes', () => {
  it('should return "0 B" for 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('should format bytes correctly', () => {
    expect(formatBytes(500)).toBe('500.0 B');
  });

  it('should format kilobytes correctly', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  it('should format megabytes correctly', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });

  it('should format gigabytes correctly', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('should format fractional values', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });
});

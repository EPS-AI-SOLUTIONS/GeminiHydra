import { beforeEach, describe, expect, it } from 'vitest';
import type { RestorationResult, RestoreStatus } from '@/features/restore/stores/restoreStore';
import { useRestoreStore } from '@/features/restore/stores/restoreStore';

const initialState = () => ({
  status: 'idle' as RestoreStatus,
  progress: 0,
  statusMessage: '',
  error: null as string | null,
  result: null as RestorationResult | null,
});

describe('restoreStore', () => {
  beforeEach(() => {
    useRestoreStore.setState(initialState());
  });

  describe('initial state', () => {
    it('should have idle status', () => {
      expect(useRestoreStore.getState().status).toBe('idle');
    });

    it('should have zero progress', () => {
      expect(useRestoreStore.getState().progress).toBe(0);
    });

    it('should have null error', () => {
      expect(useRestoreStore.getState().error).toBeNull();
    });

    it('should have null result', () => {
      expect(useRestoreStore.getState().result).toBeNull();
    });
  });

  describe('status transitions', () => {
    it('should transition from idle to restoring', () => {
      useRestoreStore.getState().setStatus('restoring');
      expect(useRestoreStore.getState().status).toBe('restoring');
    });

    it('should transition to completed', () => {
      useRestoreStore.getState().setStatus('restoring');
      useRestoreStore.getState().setStatus('completed');
      expect(useRestoreStore.getState().status).toBe('completed');
    });

    it('should transition to cancelled', () => {
      useRestoreStore.getState().setStatus('restoring');
      useRestoreStore.getState().setStatus('cancelled');
      expect(useRestoreStore.getState().status).toBe('cancelled');
    });

    it('should transition to error', () => {
      useRestoreStore.getState().setStatus('error');
      expect(useRestoreStore.getState().status).toBe('error');
    });
  });

  describe('progress updates', () => {
    it('should set progress value', () => {
      useRestoreStore.getState().setProgress(50);
      expect(useRestoreStore.getState().progress).toBe(50);
    });

    it('should set progress with message', () => {
      useRestoreStore.getState().setProgress(75, 'Enhancing faces...');
      expect(useRestoreStore.getState().progress).toBe(75);
      expect(useRestoreStore.getState().statusMessage).toBe('Enhancing faces...');
    });

    it('should not change statusMessage when message is not provided', () => {
      useRestoreStore.getState().setProgress(25, 'Starting...');
      useRestoreStore.getState().setProgress(50);
      expect(useRestoreStore.getState().progress).toBe(50);
      expect(useRestoreStore.getState().statusMessage).toBe('Starting...');
    });
  });

  describe('setError', () => {
    it('should set error and transition status to error', () => {
      useRestoreStore.getState().setError('API timeout');
      expect(useRestoreStore.getState().error).toBe('API timeout');
      expect(useRestoreStore.getState().status).toBe('error');
    });

    it('should clear error and transition status to idle when set to null', () => {
      useRestoreStore.getState().setError('Some error');
      useRestoreStore.getState().setError(null);
      expect(useRestoreStore.getState().error).toBeNull();
      expect(useRestoreStore.getState().status).toBe('idle');
    });
  });

  describe('setResult', () => {
    it('should store a restoration result', () => {
      const result: RestorationResult = {
        id: 'result-1',
        originalImage: 'data:image/jpeg;base64,original',
        restoredImage: 'data:image/jpeg;base64,restored',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        improvements: ['scratch removal', 'color enhancement'],
        processingTimeMs: 5200,
        providerUsed: 'google',
        timestamp: new Date().toISOString(),
      };
      useRestoreStore.getState().setResult(result);
      expect(useRestoreStore.getState().result).toEqual(result);
    });

    it('should clear result when set to null', () => {
      useRestoreStore.getState().setResult({
        id: 'r1',
        originalImage: '',
        restoredImage: '',
        fileName: 'test.png',
        mimeType: 'image/png',
        improvements: [],
        processingTimeMs: 0,
        providerUsed: 'google',
        timestamp: '',
      });
      useRestoreStore.getState().setResult(null);
      expect(useRestoreStore.getState().result).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset status, progress, error, and result', () => {
      useRestoreStore.getState().setStatus('restoring');
      useRestoreStore.getState().setProgress(80, 'Almost done...');
      useRestoreStore.getState().setResult({
        id: 'r1',
        originalImage: '',
        restoredImage: '',
        fileName: 'test.png',
        mimeType: 'image/png',
        improvements: [],
        processingTimeMs: 0,
        providerUsed: 'google',
        timestamp: '',
      });

      useRestoreStore.getState().reset();

      const state = useRestoreStore.getState();
      expect(state.status).toBe('idle');
      expect(state.progress).toBe(0);
      expect(state.statusMessage).toBe('');
      expect(state.error).toBeNull();
      expect(state.result).toBeNull();
    });
  });
});

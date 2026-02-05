/**
 * useApi Hooks Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryWrapper } from '../mocks/query';
import {
  useHealthCheck,
  useAgents,
  useSettings,
  useExecute,
  useHistory,
  useClearHistory,
  useUpdateSettings,
  executeStream,
} from '../../src/hooks/useApi';

describe('useApi hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('useHealthCheck', () => {
    it('fetches health data', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', version: '1.0.0' }),
      } as Response);

      const { result } = renderHook(() => useHealthCheck(), { wrapper: QueryWrapper });

      await waitFor(() => {
        expect(result.current.data).toEqual({ status: 'ok', version: '1.0.0' });
      });
    });

    it('handles error', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useHealthCheck(), { wrapper: QueryWrapper });

      await waitFor(() => {
        // Query will eventually fail after retries exhausted
        expect(result.current.isError || result.current.failureCount > 0).toBe(true);
      }, { timeout: 5000 });
    });
  });

  describe('useAgents', () => {
    it('fetches agents list', async () => {
      const mockAgents = {
        agents: [
          { name: 'geralt', description: 'Coordinator' },
          { name: 'dijkstra', description: 'Strategist' },
        ],
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAgents),
      } as Response);

      const { result } = renderHook(() => useAgents(), { wrapper: QueryWrapper });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockAgents);
      });
    });
  });

  describe('useSettings', () => {
    it('fetches settings', async () => {
      const mockSettings = {
        theme: 'dark',
        streaming: true,
        model: 'gemini-2.5-flash',
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSettings),
      } as Response);

      const { result } = renderHook(() => useSettings(), { wrapper: QueryWrapper });

      await waitFor(() => {
        expect(result.current.data).toEqual(mockSettings);
      });
    });
  });

  describe('useUpdateSettings', () => {
    it('calls PATCH endpoint', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ streaming: false }),
      } as Response);

      const { result } = renderHook(() => useUpdateSettings(), { wrapper: QueryWrapper });

      result.current.mutate({ streaming: false });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/settings',
          expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ streaming: false }),
          })
        );
      });
    });
  });

  describe('useExecute', () => {
    it('calls POST /execute', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ plan: {}, result: 'Done' }),
      } as Response);

      const { result } = renderHook(() => useExecute(), { wrapper: QueryWrapper });

      result.current.mutate({ objective: 'Test task' });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/execute',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ objective: 'Test task' }),
          })
        );
      });
    });
  });

  describe('useHistory', () => {
    it('fetches history with default limit', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ messages: [] }),
      } as Response);

      renderHook(() => useHistory(), { wrapper: QueryWrapper });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/history?limit=50',
          expect.any(Object)
        );
      });
    });

    it('fetches history with custom limit', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ messages: [] }),
      } as Response);

      renderHook(() => useHistory(100), { wrapper: QueryWrapper });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/history?limit=100',
          expect.any(Object)
        );
      });
    });
  });

  describe('useClearHistory', () => {
    it('calls DELETE /history', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      } as Response);

      const { result } = renderHook(() => useClearHistory(), { wrapper: QueryWrapper });

      result.current.mutate();

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/history',
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });
  });

  describe('executeStream', () => {
    it('yields parsed SSE data', async () => {
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"type":"chunk","content":"Hello"}\n'),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"type":"chunk","content":" World"}\n'),
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: [DONE]\n'),
          })
          .mockResolvedValueOnce({ done: true }),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      } as unknown as Response);

      const chunks: unknown[] = [];
      for await (const chunk of executeStream({ objective: 'Test' })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0]).toEqual({ type: 'chunk', content: 'Hello' });
      expect(chunks[1]).toEqual({ type: 'chunk', content: ' World' });
    });

    it('throws on non-ok response', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
      } as Response);

      await expect(async () => {
        for await (const _ of executeStream({ objective: 'Test' })) {
          // should throw
        }
      }).rejects.toThrow('HTTP 500');
    });

    it('throws when no response body', async () => {
      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        body: null,
      } as unknown as Response);

      await expect(async () => {
        for await (const _ of executeStream({ objective: 'Test' })) {
          // should throw
        }
      }).rejects.toThrow('No response body');
    });

    it('skips invalid JSON chunks', async () => {
      const mockReader = {
        read: vi.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: invalid json\ndata: {"valid":true}\n'),
          })
          .mockResolvedValueOnce({ done: true }),
      };

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      } as unknown as Response);

      const chunks: unknown[] = [];
      for await (const chunk of executeStream({ objective: 'Test' })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({ valid: true });
    });
  });
});

/** Jaskier Shared Pattern -- SSE restore stream hook */
// src/features/restore/hooks/useRestoreStream.ts
/**
 * SSE restore stream — standalone function + React hook wrapper.
 *
 * `startRestoreStream()` — standalone, supports multiple concurrent streams.
 * `useRestoreStream()` — React hook with single-stream abort management.
 *
 * Features:
 * - Adaptive inactivity timeout (60s base, extends +30s per keepalive)
 * - Auto-retry with exponential backoff (up to 2 retries: 5s, 15s)
 * - Full SSE diagnostics (event count, breakdown, timing)
 * - SSE health state tracking via liveLogStore
 */

import { useCallback, useRef } from 'react';
import type { RestoreResponse, SSEProgressDetail, SSEProgressEvent } from '@/shared/api/schemas';
import { createSSEStream, type SSEEvent } from '@/shared/api/sseClient';
import { useLiveLogStore } from '@/stores/liveLogStore';

// ── Weight distribution for overall progress bar ──
// orient ~instant (3%), restore = Gemini main pass (57%), upscale = ONNX tiles (40%)
const WEIGHT_ORIENT = 3;
const WEIGHT_RESTORE = 57;
const WEIGHT_UPSCALE = 40;

// ── Types ─────────────────────────────────────────────────

export interface RestoreStreamProgress {
  step: 'idle' | 'orient' | 'restore' | 'upscale' | 'complete' | 'error';
  /** Overall progress 0-100 (weighted across all steps) */
  overallProgress: number;
  /** Per-tile upscale detail (null until upscale/progress events) */
  tileProgress: SSEProgressDetail | null;
  /** Human-readable status text */
  statusText: string;
  /** SSE diagnostics (event count, timeline) — available on complete/error */
  diagnostics?: SSEDiagnostics;
  /** Current retry attempt (0 = first try) */
  retryAttempt?: number;
  /** Whether safety fallback was triggered (downscaled image + simplified prompt) */
  safetyFallback?: boolean;
}

export interface SSEDiagnostics {
  /** Total SSE events received from backend */
  eventCount: number;
  /** Events received by type, e.g. { 'orient/start': 1, 'restore/waiting': 3 } */
  eventBreakdown: Record<string, number>;
  /** Time (ms) from stream start to first SSE event */
  timeToFirstEvent: number | null;
  /** Total stream duration (ms) */
  totalDuration: number;
  /** Number of retry attempts before this result */
  retryAttempt: number;
}

export interface RestoreStreamRequest {
  image_base64: string;
  mime_type: string;
  file_name?: string;
  crop_count?: number;
  target_ratio?: string;
  /** Restoration mode. Defaults to "full_restoration" on backend. */
  mode?: string;
}

export type ProgressCallback = (progress: RestoreStreamProgress) => void;

interface UseRestoreStreamReturn {
  /** Start SSE restore stream with auto-retry. Returns Promise<RestoreResponse>. */
  startStream: (request: RestoreStreamRequest, onProgress?: ProgressCallback) => Promise<RestoreResponse>;
  /** Abort the active stream */
  abort: () => void;
}

// ── Adaptive timeout config ──────────────────────────────

/** Base inactivity timeout — fast fail if no events at all */
const BASE_INACTIVITY_MS = 60_000; // 60s
/** Extra time added per keepalive event received (patient when events flow) */
const KEEPALIVE_EXTENSION_MS = 30_000; // +30s
/** Maximum inactivity timeout cap */
const MAX_INACTIVITY_MS = 300_000; // 5 min cap

// ── Retry config ──────────────────────────────────────────

const MAX_RETRIES = 2;
const RETRY_DELAYS = [5_000, 15_000]; // 5s, 15s backoff

// ── Standalone stream function ───────────────────────────

/**
 * Start an SSE restore stream — standalone (non-hook), supports concurrent calls.
 * Each call creates its own AbortController unless an external `signal` is provided.
 */
export function startRestoreStream(
  request: RestoreStreamRequest,
  onProgress?: ProgressCallback,
  externalSignal?: AbortSignal,
): Promise<RestoreResponse> {
  const ownController = new AbortController();

  // If external signal aborts, propagate to our controller
  if (externalSignal) {
    if (externalSignal.aborted) {
      ownController.abort();
    } else {
      externalSignal.addEventListener('abort', () => ownController.abort(), { once: true });
    }
  }

  const attemptStream = (attempt: number): Promise<RestoreResponse> => {
    return new Promise<RestoreResponse>((resolve, reject) => {
      if (ownController.signal.aborted) {
        reject(new Error('Stream aborted'));
        return;
      }

      let settled = false;
      let lastEventTime = Date.now();
      let lastStep = 'starting';
      const streamStartTime = Date.now();

      // Adaptive timeout tracking
      let currentTimeoutMs = BASE_INACTIVITY_MS;
      let keepaliveCount = 0;

      // SSE diagnostics tracking
      let sseEventCount = 0;
      let timeToFirstEvent: number | null = null;
      const eventBreakdown: Record<string, number> = {};

      const setSSEHealth = useLiveLogStore.getState().setSSEHealth;
      setSSEHealth('connected', 0);

      const trackEvent = (step: string, status: string) => {
        sseEventCount++;
        const key = `${step}/${status}`;
        eventBreakdown[key] = (eventBreakdown[key] ?? 0) + 1;
        if (timeToFirstEvent === null) {
          timeToFirstEvent = Date.now() - streamStartTime;
        }
        setSSEHealth('connected', sseEventCount);

        // Extend timeout on keepalive/waiting events (adaptive)
        if (status === 'waiting' || status === 'progress') {
          keepaliveCount++;
          currentTimeoutMs = Math.min(BASE_INACTIVITY_MS + keepaliveCount * KEEPALIVE_EXTENSION_MS, MAX_INACTIVITY_MS);
        }
      };

      const buildDiagnostics = (): SSEDiagnostics => ({
        eventCount: sseEventCount,
        eventBreakdown: { ...eventBreakdown },
        timeToFirstEvent,
        totalDuration: Date.now() - streamStartTime,
        retryAttempt: attempt,
      });

      let timeoutId: ReturnType<typeof setTimeout>;

      const resetInactivityTimer = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          if (settled) return;
          const elapsed = ((Date.now() - streamStartTime) / 1000).toFixed(1);
          const sinceEvent = ((Date.now() - lastEventTime) / 1000).toFixed(1);
          const diag = buildDiagnostics();
          const evtSummary =
            Object.entries(diag.eventBreakdown)
              .map(([k, v]) => `${k}:${v}`)
              .join(', ') || 'none';
          const msg = `SSE timeout after ${elapsed}s (last: ${lastStep}, ${sinceEvent}s ago, timeout: ${(currentTimeoutMs / 1000).toFixed(0)}s) [events: ${diag.eventCount}, breakdown: ${evtSummary}]`;
          console.error(`[SSE] ${msg}`);
          setSSEHealth('timeout');
          ownController.abort();
          settle(() => reject(new Error(msg)));
        }, currentTimeoutMs);
      };

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        fn();
      };

      const emit = (p: RestoreStreamProgress) => {
        lastEventTime = Date.now();
        lastStep = p.step;
        resetInactivityTimer();
        onProgress?.({ ...p, retryAttempt: attempt });
      };

      // Start initial inactivity timer
      resetInactivityTimer();

      if (attempt > 0) {
        emit({
          step: 'orient',
          overallProgress: 0,
          tileProgress: null,
          statusText: `Retry ${attempt}/${MAX_RETRIES}...`,
        });
      } else {
        emit({
          step: 'orient',
          overallProgress: 0,
          tileProgress: null,
          statusText: 'Starting...',
        });
      }

      const sseController = createSSEStream({
        path: '/api/restore/stream',
        body: request,
        onEvent: (sseEvent: SSEEvent) => {
          const elapsed = ((Date.now() - streamStartTime) / 1000).toFixed(1);
          console.debug(
            `[SSE] event=${sseEvent.event} @ ${elapsed}s (events: ${sseEventCount + 1}, timeout: ${(currentTimeoutMs / 1000).toFixed(0)}s)`,
            sseEvent.data,
          );

          if (sseEvent.event === 'progress') {
            const data = sseEvent.data as SSEProgressEvent;
            trackEvent(data.step, data.status);
            handleProgress(data, emit);
          } else if (sseEvent.event === 'complete') {
            const result = sseEvent.data as RestoreResponse;
            trackEvent('stream', 'complete');
            const diag = buildDiagnostics();
            console.info(`[SSE] Stream complete in ${elapsed}s (${diag.eventCount} events, attempt ${attempt})`);
            setSSEHealth('idle');
            emit({
              step: 'complete',
              overallProgress: 100,
              tileProgress: null,
              statusText: 'Complete',
              diagnostics: diag,
            });
            settle(() => resolve(result));
          } else if (sseEvent.event === 'error') {
            const errorData = sseEvent.data as { error: string };
            const msg = errorData.error ?? 'Unknown SSE error';
            trackEvent('stream', 'error');
            const diag = buildDiagnostics();
            console.error(`[SSE] Stream error at ${elapsed}s: ${msg} (${diag.eventCount} events)`);
            setSSEHealth('error');
            emit({
              step: 'error',
              overallProgress: 0,
              tileProgress: null,
              statusText: msg,
              diagnostics: diag,
            });
            settle(() => reject(new Error(msg)));
          }
        },
        onError: (err: Error) => {
          const elapsed = ((Date.now() - streamStartTime) / 1000).toFixed(1);
          const diag = buildDiagnostics();
          console.error(`[SSE] Network error at ${elapsed}s (${diag.eventCount} events received):`, err);
          setSSEHealth('error');
          settle(() => reject(err));
        },
        onComplete: () => {
          if (!settled) {
            const elapsed = ((Date.now() - streamStartTime) / 1000).toFixed(1);
            const diag = buildDiagnostics();
            const evtSummary =
              Object.entries(diag.eventBreakdown)
                .map(([k, v]) => `${k}:${v}`)
                .join(', ') || 'none';
            const msg = `SSE ended unexpectedly at ${elapsed}s (last: ${lastStep}, events: ${diag.eventCount}, breakdown: ${evtSummary})`;
            console.error(`[SSE] ${msg}`);
            setSSEHealth('error');
            settle(() => reject(new Error(msg)));
          }
        },
      });

      // Propagate abort to the SSE stream controller
      ownController.signal.addEventListener(
        'abort',
        () => {
          sseController.abort();
          if (!settled) {
            settle(() => reject(new Error('Stream aborted')));
          }
        },
        { once: true },
      );
    });
  };

  // Retry wrapper with exponential backoff
  const attemptWithRetry = async (attempt: number): Promise<RestoreResponse> => {
    try {
      return await attemptStream(attempt);
    } catch (err) {
      const isAborted = err instanceof Error && err.message.includes('aborted');
      if (isAborted || attempt >= MAX_RETRIES) {
        throw err;
      }

      const delay = RETRY_DELAYS[attempt] ?? 15_000;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[SSE] Retry ${attempt + 1}/${MAX_RETRIES} in ${delay / 1000}s after: ${errMsg}`);

      useLiveLogStore.getState().addLog('warning', `SSE retry ${attempt + 1}/${MAX_RETRIES} za ${delay / 1000}s...`, {
        step: 'restore',
        transport: 'SSE',
        details: { attempt: attempt + 1, delayMs: delay, reason: errMsg.slice(0, 100) },
      });

      useLiveLogStore.getState().setSSEHealth('waiting');

      await new Promise<void>((r) => setTimeout(r, delay));
      return attemptWithRetry(attempt + 1);
    }
  };

  return attemptWithRetry(0);
}

// ── React Hook wrapper (single-stream abort management) ──

export function useRestoreStream(): UseRestoreStreamReturn {
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    useLiveLogStore.getState().setSSEHealth('idle');
  }, []);

  const startStream = useCallback(
    (request: RestoreStreamRequest, onProgress?: ProgressCallback): Promise<RestoreResponse> => {
      // Abort any previous stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      return startRestoreStream(request, onProgress, controller.signal).finally(() => {
        // Clear ref if this was the active controller
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      });
    },
    [],
  );

  return { startStream, abort };
}

// ── Progress handler ──────────────────────────────────────

function handleProgress(data: SSEProgressEvent, emit: (p: RestoreStreamProgress) => void): void {
  const { step, status, detail } = data;

  let overallProgress = 0;
  let statusText = '';
  let tileProgress: SSEProgressDetail | null = null;
  let safetyFallback: boolean | undefined;

  if (step === 'orient') {
    overallProgress = status === 'done' ? WEIGHT_ORIENT : 0;
    statusText = status === 'done' ? 'Orientation corrected' : 'Correcting orientation...';
  } else if (step === 'restore') {
    if (status === 'safety_fallback') {
      overallProgress = WEIGHT_ORIENT;
      statusText = 'Safety filter triggered — retrying with reduced resolution...';
      safetyFallback = true;
    } else {
      overallProgress = status === 'done' ? WEIGHT_ORIENT + WEIGHT_RESTORE : WEIGHT_ORIENT;
      statusText =
        status === 'done'
          ? 'Restoration complete'
          : status === 'waiting'
            ? 'Waiting for Gemini API...'
            : 'AI restoration in progress...';
    }
  } else if (step === 'upscale') {
    if (status === 'progress' && detail) {
      tileProgress = detail;
      overallProgress = WEIGHT_ORIENT + WEIGHT_RESTORE + WEIGHT_UPSCALE * detail.progress;

      const etaText = detail.eta_seconds != null && detail.eta_seconds > 0 ? ` ~${detail.eta_seconds}s` : '';
      statusText = `ONNX Upscale ${detail.tiles_done}/${detail.tiles_total} tiles (${Math.round(detail.progress * 100)}%)${etaText}`;
    } else if (status === 'done') {
      overallProgress = 100;
      statusText = 'Upscale complete';
    } else {
      overallProgress = WEIGHT_ORIENT + WEIGHT_RESTORE;
      statusText = 'ONNX upscale starting...';
    }
  }

  emit({
    step: step as RestoreStreamProgress['step'],
    overallProgress: Math.round(overallProgress),
    tileProgress,
    statusText,
    safetyFallback,
  });
}

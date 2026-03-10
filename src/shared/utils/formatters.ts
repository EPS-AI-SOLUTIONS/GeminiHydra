/** Jaskier Shared Pattern */

/** Format milliseconds into a human-readable duration string. */
export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** Format seconds into an approximate ETA string. Returns empty string for null/zero. */
export function formatEta(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '';
  if (seconds < 60) return `~${seconds}s`;
  return `~${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** Format an ISO timestamp string to a localized time string. */
export function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

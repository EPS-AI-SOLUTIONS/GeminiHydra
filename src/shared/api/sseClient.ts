export interface SSEEvent {
  event: string;
  data: unknown;
}

export interface SSEStreamConfig {
  path: string;
  body: unknown;
  onEvent: (event: SSEEvent) => void;
  onError: (err: Error) => void;
  onComplete: () => void;
}

export function createSSEStream(_config: SSEStreamConfig): { abort: () => void } {
  return { abort: () => {} };
}

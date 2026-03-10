export interface SSEEvent {
  event: string;
  data: any;
}

export interface SSEStreamConfig {
  path: string;
  body: any;
  onEvent: (event: SSEEvent) => void;
  onError: (err: Error) => void;
  onComplete: () => void;
}

export function createSSEStream(_config: SSEStreamConfig): { abort: () => void } {
  return { abort: () => {} };
}

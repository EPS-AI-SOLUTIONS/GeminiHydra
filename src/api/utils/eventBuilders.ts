/**
 * Event Builders
 * Factory functions for creating SSE events and stream data
 */

import type { SSEEventType, ExecutePlan } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data: T;
}

export interface PlanEventData {
  plan: ExecutePlan;
}

export interface ChunkEventData {
  content: string;
}

export interface ResultEventData {
  result: string;
  duration: number;
}

export interface ErrorEventData {
  error: string;
}

export interface StatusEventData {
  status: string;
  message?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Builders
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a plan event
 */
export function createPlanEvent(plan: ExecutePlan): SSEEvent<PlanEventData> {
  return {
    type: 'plan',
    data: { plan },
  };
}

/**
 * Create a chunk event
 */
export function createChunkEvent(content: string): SSEEvent<ChunkEventData> {
  return {
    type: 'chunk',
    data: { content },
  };
}

/**
 * Create a result event
 */
export function createResultEvent(result: string, duration: number): SSEEvent<ResultEventData> {
  return {
    type: 'result',
    data: { result, duration },
  };
}

/**
 * Create an error event
 */
export function createErrorEvent(error: string): SSEEvent<ErrorEventData> {
  return {
    type: 'error',
    data: { error },
  };
}

/**
 * Create a status event
 */
export function createStatusEvent(status: string, message?: string): SSEEvent<StatusEventData> {
  return {
    type: 'status',
    data: { status, message },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Serialization
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Serialize event to SSE format
 */
export function serializeEvent<T extends object>(event: SSEEvent<T>): string {
  const payload = JSON.stringify({ type: event.type, ...event.data });
  return `data: ${payload}\n\n`;
}

/**
 * Serialize comment for keep-alive
 */
export function serializeComment(comment: string): string {
  return `: ${comment}\n\n`;
}

/**
 * Serialize done marker
 */
export function serializeDone(): string {
  return 'data: [DONE]\n\n';
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Stream Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an async generator that yields events from an array
 */
export async function* arrayToEventStream<T>(
  items: T[],
  transformer: (item: T) => SSEEvent
): AsyncGenerator<SSEEvent> {
  for (const item of items) {
    yield transformer(item);
  }
}

/**
 * Create an async generator that transforms chunks to events
 */
export async function* chunksToEvents(
  chunks: AsyncIterable<string>
): AsyncGenerator<SSEEvent<ChunkEventData>> {
  for await (const chunk of chunks) {
    yield createChunkEvent(chunk);
  }
}

/**
 * Combine multiple event streams into one
 */
export async function* mergeEventStreams(
  ...streams: AsyncGenerator<SSEEvent>[]
): AsyncGenerator<SSEEvent> {
  for (const stream of streams) {
    yield* stream;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Event Type Guards
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if event is a plan event
 */
export function isPlanEvent(event: SSEEvent): event is SSEEvent<PlanEventData> {
  return event.type === 'plan';
}

/**
 * Check if event is a chunk event
 */
export function isChunkEvent(event: SSEEvent): event is SSEEvent<ChunkEventData> {
  return event.type === 'chunk';
}

/**
 * Check if event is a result event
 */
export function isResultEvent(event: SSEEvent): event is SSEEvent<ResultEventData> {
  return event.type === 'result';
}

/**
 * Check if event is an error event
 */
export function isErrorEvent(event: SSEEvent): event is SSEEvent<ErrorEventData> {
  return event.type === 'error';
}

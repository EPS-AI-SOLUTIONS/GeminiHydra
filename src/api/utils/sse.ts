/**
 * SSE (Server-Sent Events) Utilities
 * Helpers for streaming responses
 */

import type { FastifyReply } from 'fastify';
import type { SSEEventType } from '../types/index.js';
import { API_CONFIG } from '../config/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// SSE Writer
// ═══════════════════════════════════════════════════════════════════════════

export class SSEWriter {
  private reply: FastifyReply;
  private closed = false;

  constructor(reply: FastifyReply) {
    this.reply = reply;
    this.setupHeaders();
  }

  /**
   * Setup SSE headers
   */
  private setupHeaders(): void {
    this.reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });
  }

  /**
   * Send an event
   */
  send<T extends object>(type: SSEEventType, data: T): void {
    if (this.closed) return;

    const payload = JSON.stringify({ type, ...data });
    this.reply.raw.write(`data: ${payload}\n\n`);
  }

  /**
   * Send plan event
   */
  sendPlan(plan: object): void {
    this.send('plan', { plan });
  }

  /**
   * Send chunk event
   */
  sendChunk(content: string): void {
    this.send('chunk', { content });
  }

  /**
   * Send result event
   */
  sendResult(result: string, duration: number): void {
    this.send('result', { result, duration });
  }

  /**
   * Send error event
   */
  sendError(error: string): void {
    this.send('error', { error });
  }

  /**
   * Send raw data
   */
  sendRaw(data: string): void {
    if (this.closed) return;
    this.reply.raw.write(`data: ${data}\n\n`);
  }

  /**
   * Send comment (for keep-alive)
   */
  sendComment(comment: string): void {
    if (this.closed) return;
    this.reply.raw.write(`: ${comment}\n\n`);
  }

  /**
   * Close the stream
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.reply.raw.write('data: [DONE]\n\n');
    this.reply.raw.end();
  }

  /**
   * Check if stream is closed
   */
  isClosed(): boolean {
    return this.closed;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Keep-Alive
// ═══════════════════════════════════════════════════════════════════════════

export function createKeepAlive(
  writer: SSEWriter,
  intervalMs: number = API_CONFIG.monitoring.keepAliveIntervalMs
): NodeJS.Timeout {
  return setInterval(() => {
    if (!writer.isClosed()) {
      writer.sendComment('keep-alive');
    }
  }, intervalMs);
}

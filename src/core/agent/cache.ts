/**
 * Agent Cache System - Performance Optimizations (#6, #8, #15)
 *
 * FIX #6:  Gemini model instance caching (avoid getGenerativeModel per request)
 * FIX #8:  Prompt template caching (avoid rebuilding system prompts)
 * FIX #15: Agent lifecycle event emitter
 *
 * @module core/agent/cache
 */

import { EventEmitter } from 'node:events';
import type { GenerativeModel } from '@google/generative-ai';

// ============================================================================
// FIX #6: GEMINI MODEL INSTANCE CACHE
// ============================================================================

interface CachedModel {
  model: GenerativeModel;
  createdAt: number;
}

const modelCache = new Map<string, CachedModel>();

/** Max age for cached model instances (5 minutes) */
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Get or create a cached Gemini model instance.
 * Avoids creating new model objects on every API call.
 */
export function getCachedModel(
  genAI: {
    getGenerativeModel: (config: { model: string; generationConfig?: object }) => GenerativeModel;
  },
  modelName: string,
  generationConfig?: object,
): GenerativeModel {
  // Cache key includes config to handle different temperature/token settings
  const configKey = generationConfig ? JSON.stringify(generationConfig) : '';
  const cacheKey = `${modelName}:${configKey}`;

  const now = Date.now();
  const cached = modelCache.get(cacheKey);

  if (cached && now - cached.createdAt < MODEL_CACHE_TTL_MS) {
    return cached.model;
  }

  // Create new model instance
  // Force temperature to 1.0 for all Gemini calls - do not change
  const forcedConfig = generationConfig
    ? { ...(generationConfig as Record<string, unknown>), temperature: 1.0 }
    : { temperature: 1.0 };
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: forcedConfig,
  });

  modelCache.set(cacheKey, { model, createdAt: now });

  // Hard limit + TTL cleanup to prevent unbounded growth
  const MAX_CACHED_MODELS = 30;
  if (modelCache.size > MAX_CACHED_MODELS) {
    for (const [key, entry] of modelCache) {
      if (now - entry.createdAt > MODEL_CACHE_TTL_MS || modelCache.size > MAX_CACHED_MODELS) {
        modelCache.delete(key);
      }
      if (modelCache.size <= MAX_CACHED_MODELS) break;
    }
  }

  return model;
}

/**
 * Clear the model cache (useful on config change or error recovery)
 */
export function clearModelCache(): void {
  modelCache.clear();
}

// ============================================================================
// FIX #8: PROMPT TEMPLATE CACHE
// ============================================================================

const promptCache = new Map<string, string>();

/**
 * Get or build a cached prompt template.
 * Avoids rebuilding the same system prompt for repeated agent calls.
 */
export function getCachedPrompt(
  agentName: string,
  systemPrompt: string,
  evidenceRules: string,
  taskJson: string,
): string {
  const cacheKey = `${agentName}:${systemPrompt.length}`;

  let template = promptCache.get(cacheKey);
  if (!template) {
    template = `SYSTEM: ${systemPrompt}\n\n${evidenceRules}\n\n`;
    promptCache.set(cacheKey, template);
  }

  // Task-specific part is always unique, so we append it
  return `${template}TASK_JSON: ${taskJson}
INSTRUKCJA: Wykonaj zadanie z TASK_JSON. Odpowiadaj PO POLSKU. Zwróć tylko wynik, bez markdown.
WAŻNE: Dołącz dowody wykonania (===ZAPIS===, [ODCZYTANO], EXEC:, [MCP:], etc.)!`;
}

// ============================================================================
// FIX #15: AGENT LIFECYCLE EVENT SYSTEM
// ============================================================================

/**
 * Agent lifecycle events
 */
export interface AgentEvent {
  agent: string;
  timestamp: number;
}

export interface AgentStartEvent extends AgentEvent {
  type: 'agent:start';
  model: string;
  promptLength: number;
}

export interface AgentSuccessEvent extends AgentEvent {
  type: 'agent:success';
  responseLength: number;
  durationMs: number;
  tokensEstimated: number;
  temperature: number;
}

export interface AgentErrorEvent extends AgentEvent {
  type: 'agent:error';
  error: string;
  willRetry: boolean;
}

export interface AgentFallbackEvent extends AgentEvent {
  type: 'agent:fallback';
  from: string;
  to: string;
}

export type AgentLifecycleEvent =
  | AgentStartEvent
  | AgentSuccessEvent
  | AgentErrorEvent
  | AgentFallbackEvent;

/**
 * Singleton event emitter for agent lifecycle events.
 * Consumers can subscribe to track agent activity across the system.
 *
 * Usage:
 *   agentEvents.on('agent:start', (event) => { ... });
 *   agentEvents.on('agent:success', (event) => { ... });
 *   agentEvents.on('agent:error', (event) => { ... });
 *   agentEvents.on('agent:fallback', (event) => { ... });
 */
class AgentEventEmitter extends EventEmitter {
  /**
   * Emit event on specific channel only.
   * Subscribers to 'agent:*' should use a wildcard listener pattern instead
   * of relying on double-emission which caused duplicate processing.
   */
  private emitEvent(
    type: string,
    event: AgentStartEvent | AgentSuccessEvent | AgentErrorEvent | AgentFallbackEvent,
  ): void {
    this.emit(type, event);
    this.emit('agent:*', event);
  }

  emitStart(agent: string, model: string, promptLength: number): void {
    const event: AgentStartEvent = {
      type: 'agent:start',
      agent,
      model,
      promptLength,
      timestamp: Date.now(),
    };
    this.emitEvent('agent:start', event);
  }

  emitSuccess(
    agent: string,
    responseLength: number,
    durationMs: number,
    tokensEstimated: number,
    temperature: number,
  ): void {
    const event: AgentSuccessEvent = {
      type: 'agent:success',
      agent,
      responseLength,
      durationMs,
      tokensEstimated,
      temperature,
      timestamp: Date.now(),
    };
    this.emitEvent('agent:success', event);
  }

  emitError(agent: string, error: string, willRetry: boolean): void {
    const event: AgentErrorEvent = {
      type: 'agent:error',
      agent,
      error,
      willRetry,
      timestamp: Date.now(),
    };
    this.emitEvent('agent:error', event);
  }

  emitFallback(agent: string, from: string, to: string): void {
    const event: AgentFallbackEvent = {
      type: 'agent:fallback',
      agent,
      from,
      to,
      timestamp: Date.now(),
    };
    this.emitEvent('agent:fallback', event);
  }
}

/** Global agent event emitter singleton */
export const agentEvents = new AgentEventEmitter();

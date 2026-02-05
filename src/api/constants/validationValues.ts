/**
 * Validation Values
 * Centralized enum values and numeric ranges for validation
 */

import type { Theme, Language, ExecutionMode } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Enum Values
// ═══════════════════════════════════════════════════════════════════════════

export const VALID_THEMES: readonly Theme[] = ['dark', 'light', 'system'] as const;
export const VALID_LANGUAGES: readonly Language[] = ['pl', 'en'] as const;
export const VALID_EXECUTION_MODES: readonly ExecutionMode[] = ['basic', 'enhanced', 'swarm'] as const;

export const VALID_MESSAGE_ROLES = ['user', 'assistant', 'system'] as const;
export type ValidMessageRole = (typeof VALID_MESSAGE_ROLES)[number];

// ═══════════════════════════════════════════════════════════════════════════
// Numeric Ranges
// ═══════════════════════════════════════════════════════════════════════════

export const NUMERIC_RANGES = {
  temperature: { min: 0, max: 2 },
  tokens: { min: 1, max: 32768 },
  promptLength: { min: 1, max: 100000 },
  historyLimit: { min: 1, max: 1000 },
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Field Names (for error messages)
// ═══════════════════════════════════════════════════════════════════════════

export const FIELD_NAMES = {
  prompt: 'prompt',
  mode: 'mode',
  theme: 'theme',
  language: 'language',
  temperature: 'temperature',
  maxTokens: 'maxTokens',
  model: 'model',
  streaming: 'streaming',
  verbose: 'verbose',
  limit: 'limit',
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// Type Guards
// ═══════════════════════════════════════════════════════════════════════════

export function isValidTheme(value: unknown): value is Theme {
  return typeof value === 'string' && VALID_THEMES.includes(value as Theme);
}

export function isValidLanguage(value: unknown): value is Language {
  return typeof value === 'string' && VALID_LANGUAGES.includes(value as Language);
}

export function isValidExecutionMode(value: unknown): value is ExecutionMode {
  return typeof value === 'string' && VALID_EXECUTION_MODES.includes(value as ExecutionMode);
}

export function isValidMessageRole(value: unknown): value is ValidMessageRole {
  return typeof value === 'string' && VALID_MESSAGE_ROLES.includes(value as ValidMessageRole);
}

/**
 * Prompt Validation
 * Validators for prompt strings
 */

import { ValidationError } from '../middleware/index.js';
import { NUMERIC_RANGES, VALIDATION_ERRORS } from '../constants/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Prompt Validator
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate prompt string
 * @throws ValidationError if invalid
 */
export function validatePrompt(prompt: unknown): string {
  if (typeof prompt !== 'string') {
    throw new ValidationError(VALIDATION_ERRORS.INVALID_TYPE('prompt', 'string'));
  }

  const trimmed = prompt.trim();

  if (trimmed.length === 0) {
    throw new ValidationError(VALIDATION_ERRORS.REQUIRED('Prompt'));
  }

  const { min, max } = NUMERIC_RANGES.promptLength;
  if (trimmed.length < min || trimmed.length > max) {
    throw new ValidationError(VALIDATION_ERRORS.TOO_LONG('prompt', max));
  }

  return trimmed;
}

/**
 * Check if value is a non-empty string (without throwing)
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

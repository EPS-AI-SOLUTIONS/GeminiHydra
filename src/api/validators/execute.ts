/**
 * Execute Request Validation
 * Validators for execute endpoint requests
 */

import { ValidationError } from '../middleware/index.js';
import { VALID_EXECUTION_MODES, VALIDATION_ERRORS, isValidExecutionMode } from '../constants/index.js';
import { validatePrompt } from './prompt.js';
import type { ExecuteRequest, ExecutionMode } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ExecuteOptions {
  verbose?: boolean;
  skipResearch?: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Execute Request Validator
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate execute request body
 * @throws ValidationError if invalid
 */
export function validateExecuteRequest(body: unknown): ExecuteRequest {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError(VALIDATION_ERRORS.INVALID_TYPE('Request body', 'object'));
  }

  const { prompt, mode, options } = body as Record<string, unknown>;

  // Validate prompt
  const validatedPrompt = validatePrompt(prompt);

  // Validate mode (optional)
  const validatedMode = validateExecutionMode(mode);

  // Validate options (optional)
  const validatedOptions = validateExecuteOptions(options);

  return {
    prompt: validatedPrompt,
    mode: validatedMode,
    options: validatedOptions,
  };
}

/**
 * Validate execution mode
 */
export function validateExecutionMode(mode: unknown): ExecutionMode {
  if (mode === undefined) {
    return 'basic';
  }

  if (!isValidExecutionMode(mode)) {
    throw new ValidationError(VALIDATION_ERRORS.INVALID_ENUM('mode', VALID_EXECUTION_MODES));
  }

  return mode;
}

/**
 * Validate execute options
 */
export function validateExecuteOptions(options: unknown): ExecuteOptions {
  if (options === undefined) {
    return {};
  }

  if (typeof options !== 'object' || options === null) {
    throw new ValidationError(VALIDATION_ERRORS.INVALID_TYPE('options', 'object'));
  }

  const { verbose, skipResearch } = options as Record<string, unknown>;

  return {
    verbose: verbose !== undefined ? Boolean(verbose) : undefined,
    skipResearch: skipResearch !== undefined ? Boolean(skipResearch) : undefined,
  };
}

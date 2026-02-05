/**
 * Agents Validation
 * Validators for agents endpoint requests
 */

import { ValidationError } from '../middleware/index.js';
import { validatePrompt } from './prompt.js';
import { VALIDATION_ERRORS } from '../constants/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export interface ClassifyRequest {
  prompt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Agents Validators
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate classify request body
 */
export function validateClassifyRequest(body: unknown): ClassifyRequest {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError(VALIDATION_ERRORS.INVALID_TYPE('Request body', 'object'));
  }

  const { prompt } = body as Record<string, unknown>;
  return { prompt: validatePrompt(prompt) };
}

/**
 * Validate agent ID parameter
 */
export function validateAgentId(agentId: unknown): string {
  if (typeof agentId !== 'string' || agentId.trim().length === 0) {
    throw new ValidationError(VALIDATION_ERRORS.REQUIRED('Agent ID'));
  }
  return agentId.trim();
}

/**
 * Settings Validation
 * Validators for settings endpoint requests
 */

import { ValidationError } from '../middleware/index.js';
import { API_CONFIG } from '../config/index.js';
import {
  VALID_THEMES,
  VALID_LANGUAGES,
  VALIDATION_ERRORS,
  isValidTheme,
  isValidLanguage,
} from '../constants/index.js';
import type { Settings } from '../types/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Settings Validator
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate settings update
 * @throws ValidationError if invalid
 */
export function validateSettingsUpdate(body: unknown): Partial<Settings> {
  if (typeof body !== 'object' || body === null) {
    throw new ValidationError(VALIDATION_ERRORS.INVALID_TYPE('Request body', 'object'));
  }

  const updates = body as Record<string, unknown>;
  const validated: Partial<Settings> = {};

  // Theme
  if (updates.theme !== undefined) {
    validated.theme = validateTheme(updates.theme);
  }

  // Language
  if (updates.language !== undefined) {
    validated.language = validateLanguage(updates.language);
  }

  // Temperature
  if (updates.temperature !== undefined) {
    validated.temperature = validateTemperature(updates.temperature);
  }

  // Max tokens
  if (updates.maxTokens !== undefined) {
    validated.maxTokens = validateMaxTokens(updates.maxTokens);
  }

  // Booleans
  if (updates.streaming !== undefined) {
    validated.streaming = Boolean(updates.streaming);
  }

  if (updates.verbose !== undefined) {
    validated.verbose = Boolean(updates.verbose);
  }

  // Model
  if (updates.model !== undefined) {
    validated.model = validateModel(updates.model);
  }

  return validated;
}

/**
 * Validate theme value
 */
export function validateTheme(theme: unknown): Settings['theme'] {
  if (!isValidTheme(theme)) {
    throw new ValidationError(VALIDATION_ERRORS.INVALID_ENUM('theme', VALID_THEMES));
  }
  return theme;
}

/**
 * Validate language value
 */
export function validateLanguage(language: unknown): Settings['language'] {
  if (!isValidLanguage(language)) {
    throw new ValidationError(VALIDATION_ERRORS.INVALID_ENUM('language', VALID_LANGUAGES));
  }
  return language;
}

/**
 * Validate temperature value
 */
export function validateTemperature(temperature: unknown): number {
  const temp = Number(temperature);
  const { min, max } = API_CONFIG.settings.temperature;
  if (isNaN(temp) || temp < min || temp > max) {
    throw new ValidationError(VALIDATION_ERRORS.OUT_OF_RANGE('temperature', min, max));
  }
  return temp;
}

/**
 * Validate maxTokens value
 */
export function validateMaxTokens(maxTokens: unknown): number {
  const tokens = Number(maxTokens);
  const { min, max } = API_CONFIG.settings.tokens;
  if (isNaN(tokens) || tokens < min || tokens > max) {
    throw new ValidationError(VALIDATION_ERRORS.OUT_OF_RANGE('maxTokens', min, max));
  }
  return tokens;
}

/**
 * Validate model value
 */
export function validateModel(model: unknown): string {
  if (typeof model !== 'string' || model.trim().length === 0) {
    throw new ValidationError(VALIDATION_ERRORS.EMPTY_STRING('model'));
  }
  return model.trim();
}

/**
 * Settings Store
 * In-memory settings management with validation
 */

import type { Settings } from '../types/index.js';
import { DEFAULT_SETTINGS } from '../types/index.js';
import {
  VALID_THEMES,
  VALID_LANGUAGES,
  NUMERIC_RANGES,
  VALIDATION_ERRORS,
  isValidTheme,
  isValidLanguage,
} from '../constants/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Constants (from centralized config)
// ═══════════════════════════════════════════════════════════════════════════

const { min: TEMP_MIN, max: TEMP_MAX } = NUMERIC_RANGES.temperature;
const { min: TOKENS_MIN, max: TOKENS_MAX } = NUMERIC_RANGES.tokens;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

function validateTheme(theme: unknown): ValidationResult {
  if (!isValidTheme(theme)) {
    return { valid: false, error: VALIDATION_ERRORS.INVALID_ENUM('theme', VALID_THEMES) };
  }
  return { valid: true };
}

function validateLanguage(language: unknown): ValidationResult {
  if (!isValidLanguage(language)) {
    return { valid: false, error: VALIDATION_ERRORS.INVALID_ENUM('language', VALID_LANGUAGES) };
  }
  return { valid: true };
}

function validateTemperature(temperature: unknown): ValidationResult {
  const temp = Number(temperature);
  if (isNaN(temp) || temp < TEMP_MIN || temp > TEMP_MAX) {
    return { valid: false, error: VALIDATION_ERRORS.OUT_OF_RANGE('temperature', TEMP_MIN, TEMP_MAX) };
  }
  return { valid: true };
}

function validateMaxTokens(maxTokens: unknown): ValidationResult {
  const tokens = Number(maxTokens);
  if (isNaN(tokens) || tokens < TOKENS_MIN || tokens > TOKENS_MAX) {
    return { valid: false, error: VALIDATION_ERRORS.OUT_OF_RANGE('maxTokens', TOKENS_MIN, TOKENS_MAX) };
  }
  return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Store Class
// ═══════════════════════════════════════════════════════════════════════════

export class SettingsStore {
  private settings: Settings;

  constructor(initialSettings?: Partial<Settings>) {
    this.settings = { ...DEFAULT_SETTINGS, ...initialSettings };
  }

  /**
   * Get current settings
   */
  get(): Settings {
    return { ...this.settings };
  }

  /**
   * Update settings with validation
   */
  update(updates: Partial<Settings>): Settings | { error: string } {
    const newSettings = { ...this.settings };

    // Validate and apply each update
    if (updates.theme !== undefined) {
      const result = validateTheme(updates.theme);
      if (!result.valid) return { error: result.error! };
      newSettings.theme = updates.theme;
    }

    if (updates.language !== undefined) {
      const result = validateLanguage(updates.language);
      if (!result.valid) return { error: result.error! };
      newSettings.language = updates.language;
    }

    if (updates.temperature !== undefined) {
      const result = validateTemperature(updates.temperature);
      if (!result.valid) return { error: result.error! };
      newSettings.temperature = Number(updates.temperature);
    }

    if (updates.maxTokens !== undefined) {
      const result = validateMaxTokens(updates.maxTokens);
      if (!result.valid) return { error: result.error! };
      newSettings.maxTokens = Number(updates.maxTokens);
    }

    if (updates.streaming !== undefined) {
      newSettings.streaming = Boolean(updates.streaming);
    }

    if (updates.verbose !== undefined) {
      newSettings.verbose = Boolean(updates.verbose);
    }

    if (updates.model !== undefined) {
      newSettings.model = String(updates.model);
    }

    this.settings = newSettings;
    return this.get();
  }

  /**
   * Reset to default settings
   */
  reset(): Settings {
    this.settings = { ...DEFAULT_SETTINGS };
    return this.get();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════

export const settingsStore = new SettingsStore();

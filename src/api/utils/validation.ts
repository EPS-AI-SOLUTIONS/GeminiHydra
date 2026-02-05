/**
 * Validation Utilities
 * Common validation helpers
 */

import { ValidationError } from '../middleware/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// String Validation
// ═══════════════════════════════════════════════════════════════════════════

export function requireString(
  value: unknown,
  fieldName: string,
  minLength: number = 1,
  maxLength: number = 10000
): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }

  if (value.length < minLength) {
    throw new ValidationError(`${fieldName} must be at least ${minLength} characters`);
  }

  if (value.length > maxLength) {
    throw new ValidationError(`${fieldName} must be at most ${maxLength} characters`);
  }

  return value;
}

export function optionalString(
  value: unknown,
  fieldName: string,
  maxLength: number = 10000
): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireString(value, fieldName, 0, maxLength);
}

// ═══════════════════════════════════════════════════════════════════════════
// Number Validation
// ═══════════════════════════════════════════════════════════════════════════

export function requireNumber(
  value: unknown,
  fieldName: string,
  min?: number,
  max?: number
): number {
  const num = Number(value);

  if (isNaN(num)) {
    throw new ValidationError(`${fieldName} must be a number`);
  }

  if (min !== undefined && num < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`);
  }

  if (max !== undefined && num > max) {
    throw new ValidationError(`${fieldName} must be at most ${max}`);
  }

  return num;
}

export function optionalNumber(
  value: unknown,
  fieldName: string,
  min?: number,
  max?: number
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireNumber(value, fieldName, min, max);
}

// ═══════════════════════════════════════════════════════════════════════════
// Boolean Validation
// ═══════════════════════════════════════════════════════════════════════════

export function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') return true;
  if (value === 'false') return false;

  throw new ValidationError(`${fieldName} must be a boolean`);
}

export function optionalBoolean(
  value: unknown,
  fieldName: string
): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireBoolean(value, fieldName);
}

// ═══════════════════════════════════════════════════════════════════════════
// Enum Validation
// ═══════════════════════════════════════════════════════════════════════════

export function requireEnum<T extends string>(
  value: unknown,
  fieldName: string,
  validValues: readonly T[]
): T {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }

  if (!validValues.includes(value as T)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${validValues.join(', ')}`
    );
  }

  return value as T;
}

export function optionalEnum<T extends string>(
  value: unknown,
  fieldName: string,
  validValues: readonly T[]
): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireEnum(value, fieldName, validValues);
}

// ═══════════════════════════════════════════════════════════════════════════
// Object Validation
// ═══════════════════════════════════════════════════════════════════════════

export function requireObject(
  value: unknown,
  fieldName: string
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an object`);
  }
  return value as Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Array Validation
// ═══════════════════════════════════════════════════════════════════════════

export function requireArray<T>(
  value: unknown,
  fieldName: string,
  itemValidator?: (item: unknown, index: number) => T
): T[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }

  if (itemValidator) {
    return value.map((item, index) => itemValidator(item, index));
  }

  return value as T[];
}

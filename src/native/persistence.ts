/**
 * Persistence Utilities - Shared save/load functionality
 *
 * Provides a unified interface for persisting data to JSON files.
 * Used by NativeMemory, CodebaseMemory, ProjectMemory, and other modules
 * that need to save/load data from disk.
 *
 * Features:
 * - Async file operations with proper error handling
 * - Automatic directory creation
 * - Type-safe serialization/deserialization
 * - Graceful handling of missing files
 * - Optional date field restoration
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getErrorCodeSafe } from '../core/errors.js';

// ============================================================
// Types
// ============================================================

/**
 * Interface for objects that can be persisted
 */
export interface Persistable {
  /**
   * Serialize the object to a JSON-compatible value
   */
  toJSON(): unknown;

  /**
   * Restore the object from a JSON-compatible value
   */
  fromJSON(data: unknown): void;
}

/**
 * Options for save operations
 */
export interface SaveOptions {
  /** Pretty-print the JSON output (default: true) */
  pretty?: boolean;
  /** Number of spaces for indentation when pretty is true (default: 2) */
  indent?: number;
  /** Create parent directories if they don't exist (default: true) */
  createDirs?: boolean;
}

/**
 * Options for load operations
 */
export interface LoadOptions {
  /** Fields that should be converted from string to Date */
  dateFields?: string[];
  /** Recursively restore date fields in nested objects/arrays */
  recursiveDates?: boolean;
}

/**
 * Result of a persistence operation
 */
export interface PersistenceResult<T = void> {
  success: boolean;
  data?: T;
  error?: Error;
}

// ============================================================
// Core Functions
// ============================================================

/**
 * Save data to a JSON file
 *
 * @param filePath - Absolute or relative path to the file
 * @param data - Data to save (must be JSON-serializable)
 * @param options - Save options
 *
 * @example
 * ```typescript
 * await saveToFile('/path/to/data.json', { name: 'test', count: 42 });
 * ```
 */
export async function saveToFile(
  filePath: string,
  data: unknown,
  options: SaveOptions = {},
): Promise<void> {
  const { pretty = true, indent = 2, createDirs = true } = options;

  const resolvedPath = path.resolve(filePath);

  // Ensure parent directory exists
  if (createDirs) {
    const dir = path.dirname(resolvedPath);
    await fs.mkdir(dir, { recursive: true });
  }

  // Serialize to JSON
  const json = pretty ? JSON.stringify(data, null, indent) : JSON.stringify(data);

  // Write to file
  await fs.writeFile(resolvedPath, json, 'utf-8');
}

/**
 * Load data from a JSON file
 *
 * @param filePath - Absolute or relative path to the file
 * @param options - Load options
 * @returns The parsed data, or null if the file doesn't exist
 *
 * @example
 * ```typescript
 * const data = await loadFromFile<MyType>('/path/to/data.json');
 * if (data) {
 *   console.log(data.name);
 * }
 * ```
 */
export async function loadFromFile<T>(
  filePath: string,
  options: LoadOptions = {},
): Promise<T | null> {
  const resolvedPath = path.resolve(filePath);

  try {
    const content = await fs.readFile(resolvedPath, 'utf-8');
    let data = JSON.parse(content) as T;

    // Restore date fields if specified
    if (options.dateFields && options.dateFields.length > 0) {
      data = restoreDateFields(data, options.dateFields, options.recursiveDates ?? false);
    }

    return data;
  } catch (error: unknown) {
    // File doesn't exist - return null (not an error)
    if (getErrorCodeSafe(error) === 'ENOENT') {
      return null;
    }
    // Re-throw other errors (parse errors, permission errors, etc.)
    throw error;
  }
}

/**
 * Try to load data from a JSON file, returning a result object
 * This version never throws - all errors are captured in the result
 *
 * @param filePath - Absolute or relative path to the file
 * @param options - Load options
 * @returns A result object with success status, data, and optional error
 */
export async function tryLoadFromFile<T>(
  filePath: string,
  options: LoadOptions = {},
): Promise<PersistenceResult<T>> {
  try {
    const data = await loadFromFile<T>(filePath, options);
    return {
      success: data !== null,
      data: data ?? undefined,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Try to save data to a JSON file, returning a result object
 * This version never throws - all errors are captured in the result
 *
 * @param filePath - Absolute or relative path to the file
 * @param data - Data to save
 * @param options - Save options
 * @returns A result object with success status and optional error
 */
export async function trySaveToFile(
  filePath: string,
  data: unknown,
  options: SaveOptions = {},
): Promise<PersistenceResult> {
  try {
    await saveToFile(filePath, data, options);
    return { success: true };
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Check if a file exists
 *
 * @param filePath - Path to check
 * @returns true if the file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(path.resolve(filePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a persistence file
 *
 * @param filePath - Path to the file to delete
 * @returns true if the file was deleted, false if it didn't exist
 */
export async function deleteFile(filePath: string): Promise<boolean> {
  try {
    await fs.unlink(path.resolve(filePath));
    return true;
  } catch (error: unknown) {
    if (getErrorCodeSafe(error) === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Recursively restore Date objects from string values
 */
function restoreDateFields<T>(data: T, dateFields: string[], recursive: boolean): T {
  if (data === null || data === undefined) {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => restoreDateFields(item, dateFields, recursive)) as unknown as T;
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (dateFields.includes(key) && typeof value === 'string') {
        // Convert string to Date
        result[key] = new Date(value);
      } else if (recursive && typeof value === 'object' && value !== null) {
        // Recursively process nested objects/arrays
        result[key] = restoreDateFields(value, dateFields, recursive);
      } else {
        result[key] = value;
      }
    }

    return result as T;
  }

  return data;
}

/**
 * Create a date reviver function for JSON.parse
 * This can be used for custom date field handling
 *
 * @param dateFields - Field names that should be converted to Date
 * @returns A reviver function for JSON.parse
 */
export function createDateReviver(dateFields: string[]): (key: string, value: unknown) => unknown {
  return (key: string, value: unknown) => {
    if (dateFields.includes(key) && typeof value === 'string') {
      const date = new Date(value);
      // Only return Date if it's valid
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
    return value;
  };
}

/**
 * Load with a custom reviver function
 * Useful when you need fine-grained control over deserialization
 *
 * @param filePath - Path to the file
 * @param reviver - Custom reviver function for JSON.parse
 * @returns The parsed data, or null if file doesn't exist
 */
export async function loadWithReviver<T>(
  filePath: string,
  reviver: (key: string, value: unknown) => unknown,
): Promise<T | null> {
  const resolvedPath = path.resolve(filePath);

  try {
    const content = await fs.readFile(resolvedPath, 'utf-8');
    return JSON.parse(content, reviver) as T;
  } catch (error: unknown) {
    if (getErrorCodeSafe(error) === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

// ============================================================
// Persistable Class Helper
// ============================================================

/**
 * Save a Persistable object to a file
 *
 * @param filePath - Path to save to
 * @param persistable - Object implementing Persistable interface
 * @param options - Save options
 */
export async function savePersistable(
  filePath: string,
  persistable: Persistable,
  options: SaveOptions = {},
): Promise<void> {
  const data = persistable.toJSON();
  await saveToFile(filePath, data, options);
}

/**
 * Load data into a Persistable object from a file
 *
 * @param filePath - Path to load from
 * @param persistable - Object implementing Persistable interface
 * @param options - Load options
 * @returns true if data was loaded, false if file didn't exist
 */
export async function loadPersistable(
  filePath: string,
  persistable: Persistable,
  options: LoadOptions = {},
): Promise<boolean> {
  const data = await loadFromFile(filePath, options);
  if (data !== null) {
    persistable.fromJSON(data);
    return true;
  }
  return false;
}

/**
 * CwdManager - Current Working Directory management for CLI
 *
 * Features:
 * - Get/Set current working directory with setCwd/getCwd
 * - pushd/popd style directory stack
 * - CWD validation before changes
 * - Optional synchronization with process.cwd()
 * - Change event listeners
 * - Environment variable $CWD expansion
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ============================================================================
// CWD Types
// ============================================================================

/**
 * CWD History entry for pushd/popd functionality
 */
export interface CwdHistoryEntry {
  path: string;
  timestamp: Date;
}

/**
 * CWD Manager configuration options
 */
export interface CwdManagerOptions {
  /** Synchronize CWD with process.cwd() */
  syncWithProcess: boolean;
  /** Maximum number of entries in CWD history stack */
  maxHistorySize: number;
  /** Validate directory exists before changing CWD */
  validateOnChange: boolean;
}

/**
 * CWD change event data
 */
export interface CwdChangeEvent {
  previousCwd: string;
  newCwd: string;
  timestamp: Date;
}

/**
 * CWD change listener type
 */
export type CwdChangeListener = (event: CwdChangeEvent) => void;

/**
 * CWD validation result
 */
export interface CwdValidationResult {
  valid: boolean;
  exists: boolean;
  isDirectory: boolean;
  isAccessible: boolean;
  error?: string;
}

// ============================================================================
// CWD Manager Class
// ============================================================================

/**
 * CwdManager - Manages Current Working Directory with history and validation
 */
export class CwdManager {
  private _cwd: string;
  private _cwdStack: CwdHistoryEntry[] = [];
  private _options: CwdManagerOptions;
  private _listeners: CwdChangeListener[] = [];
  private _history: CwdHistoryEntry[] = [];
  private readonly MAX_HISTORY_SIZE = 100;

  constructor(options: Partial<CwdManagerOptions> = {}) {
    this._options = {
      syncWithProcess: options.syncWithProcess ?? false,
      maxHistorySize: options.maxHistorySize ?? 50,
      validateOnChange: options.validateOnChange ?? true,
    };

    // Initialize with process.cwd() or fallback
    try {
      this._cwd = process.cwd();
    } catch {
      this._cwd = process.env.HOME || process.env.USERPROFILE || '/';
    }
  }

  // ========================
  // Core CWD Methods
  // ========================

  /**
   * Get current working directory
   */
  getCwd(): string {
    return this._cwd;
  }

  /**
   * Set current working directory
   * @param newPath - New directory path (absolute or relative)
   * @returns Success status and any error message
   */
  setCwd(newPath: string): { success: boolean; error?: string } {
    // Resolve path (handle relative paths)
    const resolvedPath = path.isAbsolute(newPath) ? newPath : path.resolve(this._cwd, newPath);

    // Normalize path
    const normalizedPath = path.normalize(resolvedPath);

    // Validate if enabled
    if (this._options.validateOnChange) {
      const validation = this.validateCwd(normalizedPath);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
    }

    // Save previous CWD
    const previousCwd = this._cwd;

    // Update CWD
    this._cwd = normalizedPath;

    // Add to history
    this._addToHistory(normalizedPath);

    // Sync with process.cwd() if enabled
    if (this._options.syncWithProcess) {
      try {
        process.chdir(normalizedPath);
      } catch (err) {
        // Revert on failure
        this._cwd = previousCwd;
        const errorMsg = err instanceof Error ? err.message : String(err);
        return { success: false, error: `Failed to sync with process: ${errorMsg}` };
      }
    }

    // Notify listeners
    this._notifyListeners({
      previousCwd,
      newCwd: normalizedPath,
      timestamp: new Date(),
    });

    return { success: true };
  }

  /**
   * Validate a directory path
   */
  validateCwd(dirPath: string): CwdValidationResult {
    const result: CwdValidationResult = {
      valid: false,
      exists: false,
      isDirectory: false,
      isAccessible: false,
    };

    try {
      // Check if path exists
      if (!fs.existsSync(dirPath)) {
        result.error = `Directory does not exist: ${dirPath}`;
        return result;
      }
      result.exists = true;

      // Check if it's a directory
      const stats = fs.statSync(dirPath);
      if (!stats.isDirectory()) {
        result.error = `Path is not a directory: ${dirPath}`;
        return result;
      }
      result.isDirectory = true;

      // Check if accessible (read permission)
      fs.accessSync(dirPath, fs.constants.R_OK);
      result.isAccessible = true;
      result.valid = true;

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      result.error = `Cannot access directory: ${errorMsg}`;
      return result;
    }
  }

  // ========================
  // Directory Stack (pushd/popd)
  // ========================

  /**
   * Push current directory onto stack and change to new directory
   * @param newPath - New directory path
   */
  pushd(newPath: string): { success: boolean; error?: string; stackSize: number } {
    // Resolve the new path
    const resolvedPath = path.isAbsolute(newPath) ? newPath : path.resolve(this._cwd, newPath);

    // Validate the new path
    if (this._options.validateOnChange) {
      const validation = this.validateCwd(resolvedPath);
      if (!validation.valid) {
        return { success: false, error: validation.error, stackSize: this._cwdStack.length };
      }
    }

    // Push current directory onto stack
    this._cwdStack.push({
      path: this._cwd,
      timestamp: new Date(),
    });

    // Limit stack size
    if (this._cwdStack.length > this._options.maxHistorySize) {
      this._cwdStack.shift();
    }

    // Change to new directory
    const result = this.setCwd(resolvedPath);

    if (!result.success) {
      // Pop the directory we just pushed if setCwd fails
      this._cwdStack.pop();
    }

    return { ...result, stackSize: this._cwdStack.length };
  }

  /**
   * Pop directory from stack and change to it
   */
  popd(): { success: boolean; error?: string; poppedPath?: string; stackSize: number } {
    if (this._cwdStack.length === 0) {
      return {
        success: false,
        error: 'Directory stack is empty',
        stackSize: 0,
      };
    }

    const entry = this._cwdStack.pop();
    if (!entry) {
      return {
        success: false,
        error: 'Directory stack is empty',
        stackSize: 0,
      };
    }

    // Validate the popped path still exists
    if (this._options.validateOnChange) {
      const validation = this.validateCwd(entry.path);
      if (!validation.valid) {
        return {
          success: false,
          error: `Cannot return to ${entry.path}: ${validation.error}`,
          poppedPath: entry.path,
          stackSize: this._cwdStack.length,
        };
      }
    }

    const result = this.setCwd(entry.path);

    return {
      ...result,
      poppedPath: entry.path,
      stackSize: this._cwdStack.length,
    };
  }

  /**
   * Get the directory stack
   */
  getStack(): CwdHistoryEntry[] {
    return [...this._cwdStack];
  }

  /**
   * Clear the directory stack
   */
  clearStack(): void {
    this._cwdStack = [];
  }

  /**
   * Rotate the stack (swap current dir with top of stack)
   */
  rotateStack(): { success: boolean; error?: string } {
    if (this._cwdStack.length === 0) {
      return { success: false, error: 'Directory stack is empty' };
    }

    const top = this._cwdStack.pop();
    if (!top) {
      return { success: false, error: 'Directory stack is empty' };
    }
    this._cwdStack.push({ path: this._cwd, timestamp: new Date() });

    return this.setCwd(top.path);
  }

  // ========================
  // History Management
  // ========================

  /**
   * Get CWD history
   */
  getHistory(limit?: number): CwdHistoryEntry[] {
    const history = [...this._history];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * Clear CWD history
   */
  clearHistory(): void {
    this._history = [];
  }

  /**
   * Go back to previous directory in history
   */
  goBack(): { success: boolean; error?: string } {
    if (this._history.length < 2) {
      return { success: false, error: 'No previous directory in history' };
    }

    // Remove current from history
    this._history.pop();

    // Get previous directory
    const previous = this._history[this._history.length - 1];

    // Set without adding to history again
    const resolvedPath = previous.path;

    if (this._options.validateOnChange) {
      const validation = this.validateCwd(resolvedPath);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }
    }

    const previousCwd = this._cwd;
    this._cwd = resolvedPath;

    if (this._options.syncWithProcess) {
      try {
        process.chdir(resolvedPath);
      } catch (err) {
        this._cwd = previousCwd;
        const errorMsg = err instanceof Error ? err.message : String(err);
        return { success: false, error: `Failed to sync with process: ${errorMsg}` };
      }
    }

    this._notifyListeners({
      previousCwd,
      newCwd: resolvedPath,
      timestamp: new Date(),
    });

    return { success: true };
  }

  private _addToHistory(dirPath: string): void {
    // Avoid duplicates of the same path consecutively
    const lastEntry = this._history[this._history.length - 1];
    if (lastEntry && lastEntry.path === dirPath) {
      return;
    }

    this._history.push({
      path: dirPath,
      timestamp: new Date(),
    });

    // Limit history size
    if (this._history.length > this.MAX_HISTORY_SIZE) {
      this._history.shift();
    }
  }

  // ========================
  // Environment Variable Support
  // ========================

  /**
   * Expand $CWD and other variables in a string
   */
  expandVariables(input: string): string {
    let result = input;

    // Replace $CWD with current working directory
    result = result.replace(/\$CWD/g, this._cwd);
    result = result.replace(/\${CWD}/g, this._cwd);

    // Replace $OLDPWD with previous directory (if available)
    if (this._history.length >= 2) {
      const oldPwd = this._history[this._history.length - 2].path;
      result = result.replace(/\$OLDPWD/g, oldPwd);
      result = result.replace(/\${OLDPWD}/g, oldPwd);
    }

    // Replace ~ with home directory
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    result = result.replace(/^~(?=\/|\\|$)/, homeDir);

    return result;
  }

  /**
   * Get environment variables object including $CWD
   */
  getEnvironment(): Record<string, string> {
    const env: Record<string, string> = {
      CWD: this._cwd,
      PWD: this._cwd,
    };

    if (this._history.length >= 2) {
      env.OLDPWD = this._history[this._history.length - 2].path;
    }

    return env;
  }

  // ========================
  // Event Listeners
  // ========================

  /**
   * Add a listener for CWD changes
   */
  onChange(listener: CwdChangeListener): () => void {
    this._listeners.push(listener);

    // Return unsubscribe function
    return () => {
      const index = this._listeners.indexOf(listener);
      if (index >= 0) {
        this._listeners.splice(index, 1);
      }
    };
  }

  /**
   * Remove all listeners
   */
  removeAllListeners(): void {
    this._listeners = [];
  }

  private _notifyListeners(event: CwdChangeEvent): void {
    for (const listener of this._listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('CwdManager listener error:', err);
      }
    }
  }

  // ========================
  // Configuration
  // ========================

  /**
   * Get current options
   */
  getOptions(): CwdManagerOptions {
    return { ...this._options };
  }

  /**
   * Update options
   */
  setOptions(options: Partial<CwdManagerOptions>): void {
    this._options = { ...this._options, ...options };
  }

  /**
   * Enable/disable process.cwd() synchronization
   */
  setSyncWithProcess(enabled: boolean): { success: boolean; error?: string } {
    this._options.syncWithProcess = enabled;

    if (enabled) {
      // Immediately sync
      try {
        process.chdir(this._cwd);
        return { success: true };
      } catch (err) {
        this._options.syncWithProcess = false;
        const errorMsg = err instanceof Error ? err.message : String(err);
        return { success: false, error: `Failed to sync: ${errorMsg}` };
      }
    }

    return { success: true };
  }

  // ========================
  // Utility Methods
  // ========================

  /**
   * Resolve a path relative to CWD
   */
  resolve(...pathSegments: string[]): string {
    return path.resolve(this._cwd, ...pathSegments);
  }

  /**
   * Join paths relative to CWD
   */
  join(...pathSegments: string[]): string {
    return path.join(this._cwd, ...pathSegments);
  }

  /**
   * Get relative path from CWD to target
   */
  relative(targetPath: string): string {
    return path.relative(this._cwd, targetPath);
  }

  /**
   * Check if a path is within CWD
   */
  isWithinCwd(targetPath: string): boolean {
    const resolvedTarget = path.resolve(this._cwd, targetPath);
    const relativePath = path.relative(this._cwd, resolvedTarget);
    return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  }

  /**
   * Get directory name of CWD
   */
  dirname(): string {
    return path.basename(this._cwd);
  }

  /**
   * Get parent directory of CWD
   */
  parent(): string {
    return path.dirname(this._cwd);
  }

  /**
   * Change to parent directory
   */
  up(): { success: boolean; error?: string } {
    return this.setCwd(this.parent());
  }

  /**
   * Reset CWD to initial directory (process start directory or home)
   */
  reset(): { success: boolean; error?: string } {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '/';
    return this.setCwd(homeDir);
  }

  /**
   * Get formatted CWD for display (with ~ for home directory)
   */
  getDisplayPath(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (homeDir && this._cwd.startsWith(homeDir)) {
      return `~${this._cwd.slice(homeDir.length)}`;
    }
    return this._cwd;
  }

  /**
   * Debug info
   */
  getDebugInfo(): {
    cwd: string;
    displayPath: string;
    stackSize: number;
    historySize: number;
    options: CwdManagerOptions;
  } {
    return {
      cwd: this._cwd,
      displayPath: this.getDisplayPath(),
      stackSize: this._cwdStack.length,
      historySize: this._history.length,
      options: this._options,
    };
  }
}

/**
 * Singleton CwdManager instance
 */
export const cwdManager = new CwdManager();

export default cwdManager;

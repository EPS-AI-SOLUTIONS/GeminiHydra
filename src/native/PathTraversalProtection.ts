/**
 * PathTraversalProtection - Comprehensive security module for path traversal attack prevention
 *
 * Features:
 * - Detects all variants of path traversal attacks
 * - URL encoded, double-encoded, Unicode, null bytes
 * - Detailed security audit logging
 * - Path sanitization for safe display
 * - Configurable blocking/logging behavior
 */

import path from 'node:path';
import chalk from 'chalk';

// ============================================================
// Types
// ============================================================

/**
 * Security audit log entry for path traversal attempts
 */
export interface SecurityAuditEntry {
  timestamp: Date;
  type: 'PATH_TRAVERSAL_ATTEMPT' | 'PATH_SANITIZED' | 'ACCESS_DENIED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  originalPath: string;
  detectedPatterns: string[];
  sanitizedPath?: string;
  blocked: boolean;
  stackTrace?: string;
  additionalInfo?: Record<string, unknown>;
}

/**
 * Path traversal detection pattern definition
 */
interface TraversalPattern {
  pattern: RegExp;
  name: string;
  severity: 'HIGH' | 'CRITICAL';
  category: 'basic' | 'encoded' | 'unicode' | 'null_byte' | 'bypass';
}

/**
 * Detection result from path traversal analysis
 */
export interface PathTraversalDetectionResult {
  detected: boolean;
  patterns: string[];
  severity: 'HIGH' | 'CRITICAL' | null;
  categories: string[];
}

// ============================================================
// Path Traversal Patterns
// ============================================================

/**
 * Comprehensive path traversal detection patterns
 * Covers: basic, URL-encoded, double-encoded, Unicode, null bytes, and bypass attempts
 */
const PATH_TRAVERSAL_PATTERNS: TraversalPattern[] = [
  // ===== BASIC TRAVERSAL SEQUENCES =====
  { pattern: /\.\.\//g, name: 'Unix parent directory (../)', severity: 'HIGH', category: 'basic' },
  {
    pattern: /\.\.\\/g,
    name: 'Windows parent directory (..\\)',
    severity: 'HIGH',
    category: 'basic',
  },
  { pattern: /\.\.[/\\]/g, name: 'Generic parent directory', severity: 'HIGH', category: 'basic' },

  // ===== URL ENCODED VARIANTS =====
  // Single URL encoding
  {
    pattern: /%2e%2e%2f/gi,
    name: 'URL encoded ../ (%2e%2e%2f)',
    severity: 'CRITICAL',
    category: 'encoded',
  },
  {
    pattern: /%2e%2e%5c/gi,
    name: 'URL encoded ..\\ (%2e%2e%5c)',
    severity: 'CRITICAL',
    category: 'encoded',
  },
  {
    pattern: /%2e%2e\//gi,
    name: 'Partial URL encoded %2e%2e/',
    severity: 'CRITICAL',
    category: 'encoded',
  },
  {
    pattern: /%2e%2e\\/gi,
    name: 'Partial URL encoded %2e%2e\\',
    severity: 'CRITICAL',
    category: 'encoded',
  },
  { pattern: /\.%2e\//gi, name: 'Mixed encoded .%2e/', severity: 'CRITICAL', category: 'encoded' },
  { pattern: /%2e\.\//gi, name: 'Mixed encoded %2e./', severity: 'CRITICAL', category: 'encoded' },
  { pattern: /\.%2e\\/gi, name: 'Mixed encoded .%2e\\', severity: 'CRITICAL', category: 'encoded' },
  { pattern: /%2e\.\\/gi, name: 'Mixed encoded %2e.\\', severity: 'CRITICAL', category: 'encoded' },
  { pattern: /%2e%2e/gi, name: 'URL encoded dots (%2e%2e)', severity: 'HIGH', category: 'encoded' },

  // Double URL encoding (for WAF bypass)
  {
    pattern: /%252e%252e%252f/gi,
    name: 'Double URL encoded ../',
    severity: 'CRITICAL',
    category: 'encoded',
  },
  {
    pattern: /%252e%252e%255c/gi,
    name: 'Double URL encoded ..\\',
    severity: 'CRITICAL',
    category: 'encoded',
  },
  {
    pattern: /%252e%252e/gi,
    name: 'Double URL encoded dots',
    severity: 'CRITICAL',
    category: 'encoded',
  },

  // Triple URL encoding
  {
    pattern: /%25252e%25252e/gi,
    name: 'Triple URL encoded dots',
    severity: 'CRITICAL',
    category: 'encoded',
  },

  // ===== UNICODE / UTF-8 ENCODED =====
  {
    pattern: /%c0%ae%c0%ae%c0%af/gi,
    name: 'UTF-8 overlong ../',
    severity: 'CRITICAL',
    category: 'unicode',
  },
  {
    pattern: /%c0%ae%c0%ae/gi,
    name: 'UTF-8 overlong dots',
    severity: 'CRITICAL',
    category: 'unicode',
  },
  {
    pattern: /%c1%9c/gi,
    name: 'UTF-8 encoded backslash',
    severity: 'CRITICAL',
    category: 'unicode',
  },
  { pattern: /%c0%af/gi, name: 'UTF-8 encoded slash', severity: 'CRITICAL', category: 'unicode' },
  {
    pattern: /\.\.%c0%af/gi,
    name: 'UTF-8 slash traversal',
    severity: 'CRITICAL',
    category: 'unicode',
  },
  {
    pattern: /\.\.%c1%9c/gi,
    name: 'UTF-8 backslash traversal',
    severity: 'CRITICAL',
    category: 'unicode',
  },
  {
    pattern: /%e0%80%ae/gi,
    name: 'UTF-8 3-byte encoded dot',
    severity: 'CRITICAL',
    category: 'unicode',
  },
  {
    pattern: /\u002e\u002e[\u002f\u005c]/g,
    name: 'Unicode escape sequence',
    severity: 'HIGH',
    category: 'unicode',
  },
  {
    pattern: /\uff0e\uff0e[\uff0f\uff3c]/g,
    name: 'Fullwidth Unicode traversal',
    severity: 'CRITICAL',
    category: 'unicode',
  },

  // ===== NULL BYTE INJECTION =====
  {
    pattern: /%00/g,
    name: 'URL encoded null byte (%00)',
    severity: 'CRITICAL',
    category: 'null_byte',
  },
  {
    // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional null byte detection
    pattern: /\x00/g,
    name: 'Null byte character (\\x00)',
    severity: 'CRITICAL',
    category: 'null_byte',
  },
  { pattern: /\0/g, name: 'Null byte literal (\\0)', severity: 'CRITICAL', category: 'null_byte' },
  {
    pattern: /%u0000/gi,
    name: 'Unicode null byte (%u0000)',
    severity: 'CRITICAL',
    category: 'null_byte',
  },

  // ===== BYPASS ATTEMPTS =====
  {
    pattern: /\.\.\.\.\/\//g,
    name: 'Double traversal bypass (....//)',
    severity: 'CRITICAL',
    category: 'bypass',
  },
  {
    pattern: /\.\.\.\.\\\\/g,
    name: 'Double traversal bypass (....\\\\)',
    severity: 'CRITICAL',
    category: 'bypass',
  },
  {
    pattern: /\.\.\.+[/\\]/g,
    name: 'Multi-dot traversal (.../ or ...\\)',
    severity: 'HIGH',
    category: 'bypass',
  },
  {
    pattern: /\.+\/+\.\./g,
    name: 'Nested traversal pattern',
    severity: 'CRITICAL',
    category: 'bypass',
  },
  { pattern: /[/\\]\.\.$/g, name: 'Trailing traversal', severity: 'HIGH', category: 'bypass' },
  { pattern: /\.\.;/g, name: 'Semicolon bypass (..;)', severity: 'CRITICAL', category: 'bypass' },
  { pattern: /\.\.\?/g, name: 'Query string bypass (..?)', severity: 'HIGH', category: 'bypass' },
  { pattern: /\.\.#/g, name: 'Hash bypass (..#)', severity: 'HIGH', category: 'bypass' },

  // ===== WINDOWS SPECIFIC =====
  {
    pattern: /\.\.[/\\]\.\.+/g,
    name: 'Multiple level traversal',
    severity: 'CRITICAL',
    category: 'bypass',
  },
  // NOTE: Windows absolute paths (C:\...) are NOT blocked - they are validated separately
  // against rootDir in validateSecurePath(). Only block UNC paths (network shares).
  // { pattern: /^[a-zA-Z]:[\\/]/g, name: 'Windows absolute path', severity: 'HIGH', category: 'bypass' },
  { pattern: /^\\\\[^\\]+\\/g, name: 'UNC path', severity: 'HIGH', category: 'bypass' },
];

// ============================================================
// Security Audit Logger
// ============================================================

/**
 * Security audit logger for path traversal and security events
 * Singleton pattern for centralized logging
 */
class SecurityAuditLogger {
  private static instance: SecurityAuditLogger;
  private auditLog: SecurityAuditEntry[] = [];
  private maxLogSize: number = 1000;
  private enabled: boolean = true;

  static getInstance(): SecurityAuditLogger {
    if (!SecurityAuditLogger.instance) {
      SecurityAuditLogger.instance = new SecurityAuditLogger();
    }
    return SecurityAuditLogger.instance;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setMaxLogSize(size: number): void {
    this.maxLogSize = Math.max(100, Math.min(10000, size));
  }

  log(entry: SecurityAuditEntry): void {
    if (!this.enabled) return;

    // Add stack trace for critical events
    if (entry.severity === 'CRITICAL') {
      entry.stackTrace = new Error().stack;
    }

    // Add to in-memory log
    this.auditLog.push(entry);

    // Trim if exceeds max size (FIFO)
    if (this.auditLog.length > this.maxLogSize) {
      this.auditLog = this.auditLog.slice(-this.maxLogSize);
    }

    // Console output with color coding by severity
    this.printEntry(entry);
  }

  private printEntry(entry: SecurityAuditEntry): void {
    const severityColors: Record<string, (text: string) => string> = {
      LOW: chalk.gray,
      MEDIUM: chalk.yellow,
      HIGH: chalk.red,
      CRITICAL: chalk.red.bold.bgBlack,
    };

    const colorFn = severityColors[entry.severity] || chalk.white;
    const timestamp = entry.timestamp.toISOString();
    const separator = '='.repeat(60);

    console.error(colorFn(`\n${separator}`));
    console.error(colorFn(`[SECURITY AUDIT] ${entry.type}`));
    console.error(colorFn(separator));
    console.error(chalk.gray(`  Timestamp:         ${timestamp}`));
    console.error(colorFn(`  Severity:          ${entry.severity}`));
    console.error(chalk.red(`  Original Path:     "${entry.originalPath}"`));

    if (entry.detectedPatterns.length > 0) {
      console.error(chalk.red(`  Detected Patterns:`));
      entry.detectedPatterns.forEach((p) => {
        console.error(chalk.red(`    - ${p}`));
      });
    }

    if (entry.sanitizedPath) {
      console.error(chalk.yellow(`  Sanitized Path:    "${entry.sanitizedPath}"`));
    }

    console.error(
      colorFn(`  Action:            ${entry.blocked ? 'BLOCKED' : 'ALLOWED (after sanitization)'}`),
    );

    if (entry.additionalInfo) {
      console.error(chalk.gray(`  Additional Info:   ${JSON.stringify(entry.additionalInfo)}`));
    }

    if (entry.stackTrace && entry.severity === 'CRITICAL') {
      console.error(chalk.gray(`  Stack Trace:`));
      const stackLines = entry.stackTrace.split('\n').slice(2, 6);
      for (const line of stackLines) console.error(chalk.gray(`    ${line.trim()}`));
    }

    console.error(colorFn(separator));
    console.error('');
  }

  getRecentEntries(count: number = 50): SecurityAuditEntry[] {
    return this.auditLog.slice(-count);
  }

  getEntriesBySeverity(severity: SecurityAuditEntry['severity']): SecurityAuditEntry[] {
    return this.auditLog.filter((e) => e.severity === severity);
  }

  getEntriesByType(type: SecurityAuditEntry['type']): SecurityAuditEntry[] {
    return this.auditLog.filter((e) => e.type === type);
  }

  getStatistics(): {
    total: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    last24Hours: number;
  } {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const bySeverity: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    const byType: Record<string, number> = {};
    let last24Hours = 0;

    for (const entry of this.auditLog) {
      bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
      byType[entry.type] = (byType[entry.type] || 0) + 1;
      if (entry.timestamp >= oneDayAgo) last24Hours++;
    }

    return {
      total: this.auditLog.length,
      bySeverity,
      byType,
      last24Hours,
    };
  }

  clear(): void {
    this.auditLog = [];
  }

  exportLog(): string {
    return JSON.stringify(this.auditLog, null, 2);
  }

  exportLogAsCSV(): string {
    const headers = [
      'timestamp',
      'type',
      'severity',
      'originalPath',
      'detectedPatterns',
      'sanitizedPath',
      'blocked',
    ];
    const rows = this.auditLog.map((e) =>
      [
        e.timestamp.toISOString(),
        e.type,
        e.severity,
        `"${e.originalPath.replace(/"/g, '""')}"`,
        `"${e.detectedPatterns.join('; ')}"`,
        e.sanitizedPath ? `"${e.sanitizedPath.replace(/"/g, '""')}"` : '',
        e.blocked.toString(),
      ].join(','),
    );
    return [headers.join(','), ...rows].join('\n');
  }
}

// Export singleton instance
export const securityAuditLogger = SecurityAuditLogger.getInstance();

// ============================================================
// Path Traversal Error
// ============================================================

/**
 * Path Traversal Attack Error
 * Thrown when a path traversal attack is detected and blocked
 */
export class PathTraversalError extends Error {
  public readonly originalPath: string;
  public readonly detectedPatterns: string[];
  public readonly severity: 'HIGH' | 'CRITICAL';

  constructor(
    originalPath: string,
    detectedPatterns: string[],
    severity: 'HIGH' | 'CRITICAL' = 'HIGH',
  ) {
    const message =
      `[SECURITY] Path traversal attack detected and blocked. ` +
      `Detected patterns: ${detectedPatterns.join(', ')}. ` +
      `Original path: "${originalPath}"`;
    super(message);
    this.name = 'PathTraversalError';
    this.originalPath = originalPath;
    this.detectedPatterns = detectedPatterns;
    this.severity = severity;
  }
}

// ============================================================
// Detection Functions
// ============================================================

/**
 * Detect path traversal patterns in a given path
 * @param inputPath - The path to check for traversal patterns
 * @returns Object with detection results including patterns found and severity
 */
export function detectPathTraversal(inputPath: string): PathTraversalDetectionResult {
  const detectedPatterns: string[] = [];
  const categories = new Set<string>();
  let maxSeverity: 'HIGH' | 'CRITICAL' | null = null;

  for (const { pattern, name, severity, category } of PATH_TRAVERSAL_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;

    if (pattern.test(inputPath)) {
      detectedPatterns.push(name);
      categories.add(category);

      if (severity === 'CRITICAL' || maxSeverity === null) {
        maxSeverity = severity;
      }
    }
  }

  // Additional check: decode and re-check for nested encoding
  try {
    const decoded = decodeURIComponent(inputPath);
    if (decoded !== inputPath) {
      for (const { pattern, name, severity, category } of PATH_TRAVERSAL_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(decoded) && !detectedPatterns.includes(name)) {
          detectedPatterns.push(`${name} (after decoding)`);
          categories.add(category);
          if (severity === 'CRITICAL') maxSeverity = 'CRITICAL';
        }
      }
    }
  } catch {
    // Malformed URI - could be an attack, flag it
    if (inputPath.includes('%')) {
      detectedPatterns.push('Malformed URL encoding (potential attack)');
      categories.add('encoded');
      maxSeverity = 'CRITICAL';
    }
  }

  return {
    detected: detectedPatterns.length > 0,
    patterns: detectedPatterns,
    severity: maxSeverity,
    categories: Array.from(categories),
  };
}

// ============================================================
// Sanitization Functions
// ============================================================

/**
 * Sanitize a path by removing all dangerous sequences
 * WARNING: This should only be used for logging/display purposes.
 * For actual file operations, always reject malicious paths instead of sanitizing them.
 *
 * @param inputPath - The potentially malicious path
 * @returns Sanitized path with dangerous sequences removed
 */
export function sanitizePath(inputPath: string): string {
  let sanitized = inputPath;

  // Step 1: Remove null bytes (highest priority - can truncate paths)
  sanitized = sanitized.replace(/%00/gi, '');
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional null byte removal
  sanitized = sanitized.replace(/\x00/g, '');
  sanitized = sanitized.replace(/\0/g, '');
  sanitized = sanitized.replace(/%u0000/gi, '');

  // Step 2: Decode URL encoding iteratively (handle multiple levels)
  let previousSanitized = '';
  let iterations = 0;
  const maxIterations = 5; // Prevent infinite loops

  while (previousSanitized !== sanitized && iterations < maxIterations) {
    previousSanitized = sanitized;
    iterations++;

    try {
      // Decode URL encoding
      const decoded = decodeURIComponent(sanitized);
      if (decoded !== sanitized) {
        sanitized = decoded;
      }
    } catch {
      // If decoding fails, try to remove problematic sequences manually
      sanitized = sanitized.replace(/%[0-9a-fA-F]{2}/g, '');
    }
  }

  // Step 3: Remove traversal sequences (order matters - remove longer patterns first)
  const traversalSequences = [
    /\.\.\.\.\/\//g, // ....//
    /\.\.\.\.\\\\/g, // ....\\
    /\.\.\.+[/\\]/g, // .../ or ...\
    /\.\.\//g, // ../
    /\.\.\\/g, // ..\
    /\.\.[/\\]/g, // Generic
  ];

  for (const seq of traversalSequences) {
    sanitized = sanitized.replace(seq, '');
  }

  // Step 4: Remove standalone double dots at path boundaries
  sanitized = sanitized.replace(/^\.\.$/g, '');
  sanitized = sanitized.replace(/[/\\]\.\.$/g, '');
  sanitized = sanitized.replace(/^\.\.([/\\])/g, '$1');

  // Step 4b: Remove trailing parenthetical descriptions (AI hallucinations)
  // Examples: "path/file.ts)" or "path/file.ts (new file)"
  sanitized = sanitized.replace(/\s*\([^)]*\)\s*$/, '');
  sanitized = sanitized.replace(/\)$/, '');

  // Step 5: Normalize path separators (convert backslash to forward slash for consistency)
  sanitized = sanitized.replace(/\\/g, '/');

  // Step 6: Remove duplicate slashes
  sanitized = sanitized.replace(/\/+/g, '/');

  // Step 7: Remove leading slashes (make relative)
  sanitized = sanitized.replace(/^\/+/, '');

  // Step 8: Remove any remaining dangerous Unicode characters
  sanitized = sanitized.replace(/[\uff0e\uff0f\uff3c]/g, ''); // Fullwidth . / \

  return sanitized;
}

// ============================================================
// Validation Functions
// ============================================================

/**
 * Options for validateSecurePath function
 */
export interface ValidateSecurePathOptions {
  /** Whether to log security attempts (default: true) */
  logAttempts?: boolean;
  /** Whether to throw an error on detection (default: true) */
  throwOnDetection?: boolean;
  /** Whether to allow sanitization instead of blocking (default: false) */
  allowSanitization?: boolean;
}

/**
 * Validate and secure a path against traversal attacks
 * This is the main security function that should be called for all path operations
 *
 * @param inputPath - The path to validate
 * @param rootDir - The root directory that paths must stay within
 * @param options - Validation options
 * @returns The validated and resolved absolute path
 * @throws PathTraversalError if a traversal attack is detected
 */
export function validateSecurePath(
  inputPath: string,
  rootDir: string,
  options: ValidateSecurePathOptions = {},
): string {
  const { logAttempts = true, throwOnDetection = true, allowSanitization = false } = options;

  // Detect traversal attempts
  const detection = detectPathTraversal(inputPath);

  if (detection.detected) {
    const sanitized = sanitizePath(inputPath);

    // Log the security event
    if (logAttempts) {
      securityAuditLogger.log({
        timestamp: new Date(),
        type: 'PATH_TRAVERSAL_ATTEMPT',
        severity: detection.severity || 'HIGH',
        originalPath: inputPath,
        detectedPatterns: detection.patterns,
        sanitizedPath: sanitized,
        blocked: throwOnDetection,
        additionalInfo: {
          categories: detection.categories,
          rootDir: rootDir,
        },
      });
    }

    if (throwOnDetection) {
      throw new PathTraversalError(inputPath, detection.patterns, detection.severity || 'HIGH');
    }

    // If sanitization is allowed, use sanitized path
    if (allowSanitization) {
      inputPath = sanitized;
    }
  }

  // Resolve the path and verify it's within root
  const resolved = path.resolve(rootDir, inputPath);
  const normalizedRoot = path.normalize(rootDir);

  // Final security check: ensure resolved path is within root
  if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
    if (logAttempts) {
      securityAuditLogger.log({
        timestamp: new Date(),
        type: 'ACCESS_DENIED',
        severity: 'HIGH',
        originalPath: inputPath,
        detectedPatterns: ['Path escapes root directory after resolution'],
        sanitizedPath: undefined,
        blocked: true,
        additionalInfo: {
          resolvedPath: resolved,
          rootDir: normalizedRoot,
        },
      });
    }
    throw new Error(
      `[SECURITY] Access denied: Path "${inputPath}" resolves outside root directory`,
    );
  }

  return resolved;
}

// ============================================================
// Quick Check Functions
// ============================================================

/**
 * Quick check if a path contains any traversal patterns
 * Use this for fast filtering before more expensive operations
 *
 * @param inputPath - The path to check
 * @returns true if traversal patterns detected, false if clean
 */
export function hasTraversalPatterns(inputPath: string): boolean {
  return detectPathTraversal(inputPath).detected;
}

/**
 * Check if a path is safe (no traversal patterns and within root)
 *
 * @param inputPath - The path to check
 * @param rootDir - The root directory
 * @returns true if path is safe, false otherwise
 */
export function isPathSafe(inputPath: string, rootDir: string): boolean {
  try {
    validateSecurePath(inputPath, rootDir, {
      logAttempts: false,
      throwOnDetection: true,
    });
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// Export all patterns for testing/debugging
// ============================================================

/**
 * Get all path traversal patterns (for testing/debugging)
 */
export function getPathTraversalPatterns(): ReadonlyArray<{
  pattern: RegExp;
  name: string;
  severity: 'HIGH' | 'CRITICAL';
  category: string;
}> {
  return PATH_TRAVERSAL_PATTERNS.map((p) => ({
    pattern: new RegExp(p.pattern.source, p.pattern.flags),
    name: p.name,
    severity: p.severity,
    category: p.category,
  }));
}

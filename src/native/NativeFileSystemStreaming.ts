/**
 * NativeFileSystemStreaming - Streaming extensions for NativeFileSystem
 *
 * Provides streaming support for large files (>50MB) with:
 * - Configurable file size limits with named presets
 * - readFileStreaming() for chunk-by-chunk reading
 * - writeFileStreaming() for generator-based writing
 * - Auto-fallback to streaming with warnings
 *
 * @example
 * ```typescript
 * import { NativeFileSystemStreaming, FileSizeLimits } from './NativeFileSystemStreaming.js';
 *
 * const fs = new NativeFileSystemStreaming({
 *   rootDir: '/path/to/project',
 *   maxFileSize: FileSizeLimits.LARGE, // or 'LARGE' or 50 * 1024 * 1024
 *   autoStreamLargeFiles: true
 * });
 *
 * // Streaming read
 * await fs.readFileStreaming('large-file.log', (chunk, progress) => {
 *   console.log(`Chunk ${progress.chunkNumber}: ${chunk.length} bytes, ${progress.percentage}%`);
 * });
 *
 * // Streaming write
 * await fs.writeFileStreaming('output.jsonl', async function*() {
 *   for (let i = 0; i < 1000000; i++) {
 *     yield JSON.stringify({ id: i }) + '\n';
 *   }
 * });
 * ```
 */

import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

// ============================================================
// File Size Limits
// ============================================================

/**
 * File size limit presets for different use cases
 */
export const FileSizeLimits = {
  /** Small files only (1MB) - for quick operations */
  SMALL: 1 * 1024 * 1024,
  /** Medium files (10MB) - default for most operations */
  MEDIUM: 10 * 1024 * 1024,
  /** Large files (50MB) - original default */
  LARGE: 50 * 1024 * 1024,
  /** Very large files (100MB) */
  VERY_LARGE: 100 * 1024 * 1024,
  /** Huge files (500MB) */
  HUGE: 500 * 1024 * 1024,
  /** No limit - use streaming for any size */
  UNLIMITED: Infinity,
} as const;

export type FileSizeLimitPreset = keyof typeof FileSizeLimits;

// ============================================================
// Streaming Types
// ============================================================

/**
 * Options for streaming read operations
 */
export interface StreamingReadOptions {
  /** Chunk size in bytes (default: 64KB) */
  chunkSize?: number;
  /** Encoding for text mode (default: utf-8) */
  encoding?: BufferEncoding;
  /** Read as text (true) or buffer (false, default) */
  asText?: boolean;
  /** Starting byte position (default: 0) */
  start?: number;
  /** Ending byte position (default: end of file) */
  end?: number;
  /** High water mark for stream (default: 64KB) */
  highWaterMark?: number;
  /** Callback for progress updates */
  onProgress?: (progress: StreamingProgress) => void;
}

/**
 * Options for streaming write operations
 */
export interface StreamingWriteOptions {
  /** Encoding for text mode (default: utf-8) */
  encoding?: BufferEncoding;
  /** File mode/permissions */
  mode?: number;
  /** Create parent directories if needed (default: true) */
  createDirs?: boolean;
  /** Append to existing file instead of overwriting */
  append?: boolean;
  /** High water mark for stream (default: 64KB) */
  highWaterMark?: number;
  /** Callback for progress updates */
  onProgress?: (progress: StreamingProgress) => void;
}

/**
 * Progress information for streaming operations
 */
export interface StreamingProgress {
  /** Bytes processed so far */
  bytesProcessed: number;
  /** Total bytes (if known) */
  totalBytes?: number;
  /** Percentage complete (0-100) */
  percentage?: number;
  /** Current chunk number */
  chunkNumber: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Estimated bytes per second */
  bytesPerSecond: number;
}

/**
 * Result of a streaming read operation
 */
export interface StreamingReadResult {
  /** Total bytes read */
  totalBytes: number;
  /** Number of chunks processed */
  chunks: number;
  /** Total time in milliseconds */
  elapsedMs: number;
  /** Whether streaming was used (vs regular read) */
  usedStreaming: boolean;
  /** Warning message if auto-switched to streaming */
  warning?: string;
}

/**
 * Result of a streaming write operation
 */
export interface StreamingWriteResult {
  /** Total bytes written */
  totalBytes: number;
  /** Number of chunks written */
  chunks: number;
  /** Total time in milliseconds */
  elapsedMs: number;
  /** File path written to */
  path: string;
}

/**
 * Data generator for streaming write - can be async iterator or callback
 */
export type StreamingDataGenerator =
  | AsyncIterable<Buffer | string>
  | (() => AsyncGenerator<Buffer | string, void, unknown>);

/**
 * Configuration for streaming filesystem
 */
export interface StreamingConfig {
  rootDir: string;
  /** Max file size for regular read (use FileSizeLimits presets or number in bytes) */
  maxFileSize?: number | FileSizeLimitPreset;
  /** Encoding for text operations (default: utf-8) */
  encoding?: BufferEncoding;
  /** Auto-switch to streaming for files exceeding maxFileSize (default: true) */
  autoStreamLargeFiles?: boolean;
  /** Callback when auto-switching to streaming */
  onStreamingFallback?: (filePath: string, fileSize: number, limit: number) => void;
  /** Blocked paths (default: node_modules, .git, dist) */
  blockedPaths?: string[];
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Resolve file size limit from preset name or number
 */
function resolveFileSizeLimit(limit: number | FileSizeLimitPreset | undefined): number {
  if (limit === undefined) {
    return FileSizeLimits.LARGE; // Default: 50MB
  }
  if (typeof limit === 'string') {
    return FileSizeLimits[limit] ?? FileSizeLimits.LARGE;
  }
  return limit;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes === Infinity) return 'Unlimited';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
}

/** Default chunk size for streaming operations (64KB) */
export const DEFAULT_CHUNK_SIZE = 64 * 1024;

/** Default blocked paths */
export const DEFAULT_BLOCKED_PATHS = ['node_modules', '.git', 'dist'];

// ============================================================
// NativeFileSystemStreaming Class
// ============================================================

/**
 * Streaming-enabled filesystem operations for large files
 */
export class NativeFileSystemStreaming {
  private config: {
    rootDir: string;
    maxFileSize: number;
    encoding: BufferEncoding;
    autoStreamLargeFiles: boolean;
    onStreamingFallback?: (filePath: string, fileSize: number, limit: number) => void;
    blockedPaths: string[];
  };

  constructor(config: StreamingConfig) {
    this.config = {
      rootDir: path.resolve(config.rootDir),
      maxFileSize: resolveFileSizeLimit(config.maxFileSize),
      encoding: config.encoding || 'utf-8',
      autoStreamLargeFiles: config.autoStreamLargeFiles ?? true,
      onStreamingFallback: config.onStreamingFallback,
      blockedPaths: config.blockedPaths || [...DEFAULT_BLOCKED_PATHS],
    };
  }

  // ============================================================
  // Configuration Methods
  // ============================================================

  /**
   * Update max file size limit dynamically
   */
  setMaxFileSize(limit: number | FileSizeLimitPreset): void {
    this.config.maxFileSize = resolveFileSizeLimit(limit);
  }

  /**
   * Get current max file size limit
   */
  getMaxFileSize(): number {
    return this.config.maxFileSize;
  }

  /**
   * Get max file size as human readable string
   */
  getMaxFileSizeFormatted(): string {
    return formatBytes(this.config.maxFileSize);
  }

  /**
   * Get root directory
   */
  getRoot(): string {
    return this.config.rootDir;
  }

  // ============================================================
  // Path Validation
  // ============================================================

  private validatePath(inputPath: string): string {
    const resolved = path.resolve(this.config.rootDir, inputPath);

    // Must be within root
    if (!resolved.startsWith(this.config.rootDir)) {
      throw new Error(`Access denied: Path outside root directory`);
    }

    // Check blocked paths
    for (const blocked of this.config.blockedPaths) {
      if (
        resolved.includes(path.sep + blocked + path.sep) ||
        resolved.endsWith(path.sep + blocked)
      ) {
        throw new Error(`Access denied: Path is blocked (${blocked})`);
      }
    }

    return resolved;
  }

  private toRelative(absolutePath: string): string {
    return path.relative(this.config.rootDir, absolutePath);
  }

  // ============================================================
  // Streaming Read Operations
  // ============================================================

  /**
   * Read file with streaming - handles files of any size
   * Reads chunk by chunk and calls the callback for each chunk
   *
   * @param filePath - Path to the file
   * @param onChunk - Callback called for each chunk (return false to stop reading)
   * @param options - Streaming options
   * @returns Result with statistics
   *
   * @example
   * ```typescript
   * // Process large file chunk by chunk
   * const result = await fs.readFileStreaming('large-file.log', (chunk, info) => {
   *   console.log(`Chunk ${info.chunkNumber}: ${chunk.length} bytes`);
   *   // Return false to stop reading early
   *   return true;
   * }, { chunkSize: 1024 * 1024 }); // 1MB chunks
   * ```
   */
  async readFileStreaming(
    filePath: string,
    onChunk: (
      chunk: Buffer | string,
      info: StreamingProgress,
    ) => boolean | undefined | Promise<boolean | undefined>,
    options?: StreamingReadOptions,
  ): Promise<StreamingReadResult> {
    const resolved = this.validatePath(filePath);
    const stats = await fs.stat(resolved);
    const totalBytes = stats.size;

    const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const encoding = options?.encoding ?? this.config.encoding;
    const asText = options?.asText ?? false;
    const highWaterMark = options?.highWaterMark ?? chunkSize;

    const startTime = Date.now();
    let bytesProcessed = 0;
    let chunkNumber = 0;

    const stream = createReadStream(resolved, {
      start: options?.start,
      end: options?.end,
      highWaterMark,
      encoding: asText ? encoding : undefined,
    });

    try {
      for await (const rawChunk of stream) {
        chunkNumber++;
        const chunk = asText ? rawChunk : (rawChunk as Buffer);
        bytesProcessed +=
          typeof chunk === 'string' ? Buffer.byteLength(chunk, encoding) : chunk.length;

        const elapsedMs = Date.now() - startTime;
        const progress: StreamingProgress = {
          bytesProcessed,
          totalBytes,
          percentage: totalBytes > 0 ? Math.round((bytesProcessed / totalBytes) * 100) : undefined,
          chunkNumber,
          elapsedMs,
          bytesPerSecond: elapsedMs > 0 ? Math.round((bytesProcessed / elapsedMs) * 1000) : 0,
        };

        // Call progress callback if provided
        options?.onProgress?.(progress);

        // Call chunk callback - stop if it returns false
        const shouldContinue = await onChunk(chunk, progress);
        if (shouldContinue === false) {
          stream.destroy();
          break;
        }
      }
    } finally {
      if (!stream.destroyed) {
        stream.destroy();
      }
    }

    const elapsedMs = Date.now() - startTime;

    return {
      totalBytes: bytesProcessed,
      chunks: chunkNumber,
      elapsedMs,
      usedStreaming: true,
    };
  }

  /**
   * Smart read file - automatically uses streaming for large files
   * Returns the full content but warns/callbacks when streaming is used
   *
   * @param filePath - Path to the file
   * @param options - Read options including streaming options
   * @returns File content and metadata
   *
   * @example
   * ```typescript
   * const { content, result } = await fs.readFileAuto('potentially-large.log', {
   *   encoding: 'utf-8',
   *   onProgress: (p) => console.log(`${p.percentage}% complete`)
   * });
   * if (result.warning) {
   *   console.warn(result.warning);
   * }
   * ```
   */
  async readFileAuto(
    filePath: string,
    options?: StreamingReadOptions & { encoding?: BufferEncoding },
  ): Promise<{ content: string; result: StreamingReadResult }> {
    const resolved = this.validatePath(filePath);
    const encoding = options?.encoding ?? this.config.encoding;

    const stats = await fs.stat(resolved);
    const fileSize = stats.size;

    // If file is within limit, use regular read
    if (fileSize <= this.config.maxFileSize) {
      const startTime = Date.now();
      const content = await fs.readFile(resolved, { encoding });
      return {
        content,
        result: {
          totalBytes: fileSize,
          chunks: 1,
          elapsedMs: Date.now() - startTime,
          usedStreaming: false,
        },
      };
    }

    // File exceeds limit - check if auto-streaming is enabled
    if (!this.config.autoStreamLargeFiles) {
      throw new Error(
        `File too large: ${formatBytes(fileSize)} (max: ${formatBytes(this.config.maxFileSize)}). ` +
          `Enable autoStreamLargeFiles or use readFileStreaming() directly.`,
      );
    }

    // Notify about streaming fallback
    const warning = `File ${filePath} (${formatBytes(fileSize)}) exceeds limit (${formatBytes(this.config.maxFileSize)}). Using streaming.`;
    this.config.onStreamingFallback?.(filePath, fileSize, this.config.maxFileSize);

    // Use streaming to read the file
    const chunks: string[] = [];
    const result = await this.readFileStreaming(
      filePath,
      (chunk) => {
        chunks.push(typeof chunk === 'string' ? chunk : chunk.toString(encoding));
        return true;
      },
      { ...options, asText: true, encoding },
    );

    return {
      content: chunks.join(''),
      result: {
        ...result,
        warning,
      },
    };
  }

  /**
   * Read file lines as async generator (memory efficient)
   */
  async *readLines(filePath: string, encoding?: BufferEncoding): AsyncGenerator<string> {
    const resolved = this.validatePath(filePath);
    const stream = createReadStream(resolved, { encoding: encoding ?? this.config.encoding });

    let buffer = '';
    for await (const chunk of stream) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        yield line;
      }
    }

    if (buffer) {
      yield buffer;
    }
  }

  // ============================================================
  // Streaming Write Operations
  // ============================================================

  /**
   * Write file with streaming from a data generator
   * Handles files of any size by writing chunk by chunk
   *
   * @param filePath - Path to the file
   * @param dataGenerator - Async iterable or generator function that yields chunks
   * @param options - Streaming options
   * @returns Result with statistics
   *
   * @example
   * ```typescript
   * // Write large file from generator
   * async function* generateData() {
   *   for (let i = 0; i < 1000000; i++) {
   *     yield `Line ${i}: ${JSON.stringify({ id: i, data: 'x'.repeat(100) })}\n`;
   *   }
   * }
   *
   * const result = await fs.writeFileStreaming('large-output.jsonl', generateData, {
   *   onProgress: (p) => console.log(`Written: ${formatBytes(p.bytesProcessed)}`)
   * });
   * ```
   */
  async writeFileStreaming(
    filePath: string,
    dataGenerator: StreamingDataGenerator,
    options?: StreamingWriteOptions,
  ): Promise<StreamingWriteResult> {
    const resolved = this.validatePath(filePath);
    const encoding = options?.encoding ?? this.config.encoding;
    const highWaterMark = options?.highWaterMark ?? DEFAULT_CHUNK_SIZE;

    // Create parent directories if needed
    if (options?.createDirs !== false) {
      await fs.mkdir(path.dirname(resolved), { recursive: true });
    }

    const startTime = Date.now();
    let bytesWritten = 0;
    let chunkNumber = 0;

    // Create write stream
    const writeStream = createWriteStream(resolved, {
      flags: options?.append ? 'a' : 'w',
      encoding,
      mode: options?.mode,
      highWaterMark,
    });

    // Get the async iterable
    const iterable = typeof dataGenerator === 'function' ? dataGenerator() : dataGenerator;

    try {
      for await (const chunk of iterable) {
        chunkNumber++;

        // Convert to Buffer if needed
        const buffer = typeof chunk === 'string' ? Buffer.from(chunk, encoding) : chunk;
        bytesWritten += buffer.length;

        // Write chunk with backpressure handling
        const canContinue = writeStream.write(buffer);

        if (!canContinue) {
          // Wait for drain event before continuing
          await new Promise<void>((resolve, reject) => {
            writeStream.once('drain', resolve);
            writeStream.once('error', reject);
          });
        }

        // Call progress callback if provided
        const elapsedMs = Date.now() - startTime;
        options?.onProgress?.({
          bytesProcessed: bytesWritten,
          chunkNumber,
          elapsedMs,
          bytesPerSecond: elapsedMs > 0 ? Math.round((bytesWritten / elapsedMs) * 1000) : 0,
        });
      }

      // Wait for stream to finish
      await new Promise<void>((resolve, reject) => {
        writeStream.end(() => resolve());
        writeStream.once('error', reject);
      });
    } finally {
      if (!writeStream.destroyed) {
        writeStream.destroy();
      }
    }

    return {
      totalBytes: bytesWritten,
      chunks: chunkNumber,
      elapsedMs: Date.now() - startTime,
      path: this.toRelative(resolved),
    };
  }

  /**
   * Copy file with streaming - handles large files efficiently
   *
   * @param source - Source file path
   * @param destination - Destination file path
   * @param options - Streaming options
   * @returns Result with statistics
   */
  async copyFileStreaming(
    source: string,
    destination: string,
    options?: StreamingReadOptions & StreamingWriteOptions,
  ): Promise<StreamingWriteResult> {
    const srcResolved = this.validatePath(source);
    const destResolved = this.validatePath(destination);

    // Create parent directories if needed
    if (options?.createDirs !== false) {
      await fs.mkdir(path.dirname(destResolved), { recursive: true });
    }

    const stats = await fs.stat(srcResolved);
    const totalBytes = stats.size;

    const startTime = Date.now();
    let bytesProcessed = 0;
    let chunkNumber = 0;

    const readStream = createReadStream(srcResolved, {
      highWaterMark: options?.highWaterMark ?? DEFAULT_CHUNK_SIZE,
    });

    const writeStream = createWriteStream(destResolved, {
      mode: options?.mode,
      highWaterMark: options?.highWaterMark ?? DEFAULT_CHUNK_SIZE,
    });

    // Track progress
    readStream.on('data', (chunk: Buffer | string) => {
      chunkNumber++;
      bytesProcessed += chunk.length;

      const elapsedMs = Date.now() - startTime;
      options?.onProgress?.({
        bytesProcessed,
        totalBytes,
        percentage: Math.round((bytesProcessed / totalBytes) * 100),
        chunkNumber,
        elapsedMs,
        bytesPerSecond: elapsedMs > 0 ? Math.round((bytesProcessed / elapsedMs) * 1000) : 0,
      });
    });

    await pipeline(readStream, writeStream);

    return {
      totalBytes: bytesProcessed,
      chunks: chunkNumber,
      elapsedMs: Date.now() - startTime,
      path: this.toRelative(destResolved),
    };
  }

  /**
   * Print status information
   */
  printStatus(): void {
    console.log('\n=== NativeFileSystemStreaming ===\n');
    console.log(`  Root: ${this.config.rootDir}`);
    console.log(`  Max File Size: ${formatBytes(this.config.maxFileSize)}`);
    console.log(`  Auto Stream Large Files: ${this.config.autoStreamLargeFiles}`);
    console.log(`  Encoding: ${this.config.encoding}`);
    console.log(`  Default Chunk Size: ${formatBytes(DEFAULT_CHUNK_SIZE)}`);
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a streaming-enabled filesystem instance
 */
export function createStreamingFileSystem(
  rootDir: string,
  options?: Partial<StreamingConfig>,
): NativeFileSystemStreaming {
  return new NativeFileSystemStreaming({ rootDir, ...options });
}

// ============================================================
// Mixin Function for NativeFileSystem
// ============================================================

/**
 * Add streaming capabilities to an existing NativeFileSystem-like object
 * This is a mixin pattern that extends any object with streaming methods
 *
 * @example
 * ```typescript
 * import { NativeFileSystem } from './NativeFileSystem.js';
 * import { addStreamingMethods } from './NativeFileSystemStreaming.js';
 *
 * const fs = new NativeFileSystem({ rootDir: '/path' });
 * const streamingFs = addStreamingMethods(fs);
 *
 * // Now you can use streaming methods
 * await streamingFs.readFileStreaming('large.log', (chunk) => { ... });
 * ```
 */
/** Streaming methods that can be added to any filesystem */
export interface StreamingMethods {
  setMaxFileSize: NativeFileSystemStreaming['setMaxFileSize'];
  getMaxFileSize: NativeFileSystemStreaming['getMaxFileSize'];
  getMaxFileSizeFormatted: NativeFileSystemStreaming['getMaxFileSizeFormatted'];
  readFileStreaming: NativeFileSystemStreaming['readFileStreaming'];
  readFileAuto: NativeFileSystemStreaming['readFileAuto'];
  writeFileStreaming: NativeFileSystemStreaming['writeFileStreaming'];
  copyFileStreaming: NativeFileSystemStreaming['copyFileStreaming'];
}

export function addStreamingMethods<T extends { getRoot(): string }>(
  baseFs: T,
  config?: Partial<Omit<StreamingConfig, 'rootDir'>>,
): T & StreamingMethods {
  const streamingFs = new NativeFileSystemStreaming({
    rootDir: baseFs.getRoot(),
    ...config,
  });

  // Merge streaming methods into base object
  return Object.assign(baseFs, {
    // Configuration
    setMaxFileSize: streamingFs.setMaxFileSize.bind(streamingFs),
    getMaxFileSize: streamingFs.getMaxFileSize.bind(streamingFs),
    getMaxFileSizeFormatted: streamingFs.getMaxFileSizeFormatted.bind(streamingFs),

    // Streaming reads
    readFileStreaming: streamingFs.readFileStreaming.bind(streamingFs),
    readFileAuto: streamingFs.readFileAuto.bind(streamingFs),

    // Streaming writes
    writeFileStreaming: streamingFs.writeFileStreaming.bind(streamingFs),
    copyFileStreaming: streamingFs.copyFileStreaming.bind(streamingFs),
  });
}

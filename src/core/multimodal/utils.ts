/**
 * MultiModal Utilities - Content detection, MIME type resolution, download
 *
 * @module multimodal/utils
 */

import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

import type { ContentType } from './types.js';
import {
  IMAGE_MIME_TYPES,
  AUDIO_MIME_TYPES,
  VIDEO_MIME_TYPES,
  DOCUMENT_MIME_TYPES,
} from './constants.js';

/**
 * Detect content type from file extension or MIME type
 */
export function detectContentType(input: string): ContentType | null {
  // Check if it's a MIME type
  if (input.includes('/')) {
    if (input.startsWith('image/')) return 'image';
    if (input.startsWith('audio/')) return 'audio';
    if (input.startsWith('video/')) return 'video';
    if (input.startsWith('application/pdf') ||
        input.includes('document') ||
        input.includes('spreadsheet') ||
        input.includes('presentation')) return 'document';
    if (input.startsWith('text/')) return 'text';
    return null;
  }

  // Assume it's a file path or extension
  const ext = input.startsWith('.') ? input.toLowerCase() : path.extname(input).toLowerCase();

  if (IMAGE_MIME_TYPES[ext]) return 'image';
  if (AUDIO_MIME_TYPES[ext]) return 'audio';
  if (VIDEO_MIME_TYPES[ext]) return 'video';
  if (DOCUMENT_MIME_TYPES[ext]) return 'document';
  if (['.txt', '.md', '.json', '.xml', '.yaml', '.yml'].includes(ext)) return 'text';

  return null;
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_MIME_TYPES[ext] ||
         AUDIO_MIME_TYPES[ext] ||
         VIDEO_MIME_TYPES[ext] ||
         DOCUMENT_MIME_TYPES[ext] ||
         null;
}

/**
 * Detect if input is base64 encoded
 */
export function isBase64(str: string): boolean {
  if (str.length < 100) return false;
  const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
  // Check first 1000 chars to avoid processing huge strings
  return base64Regex.test(str.substring(0, 1000).replace(/\s/g, ''));
}

/**
 * Download file from URL to buffer
 */
export async function downloadToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadToBuffer(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

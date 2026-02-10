/**
 * MultiModal Constants - MIME types, file sizes, and model lists
 *
 * @module multimodal/constants
 */

/** Supported image MIME types with extensions */
export const IMAGE_MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
};

/** Supported audio MIME types with extensions */
export const AUDIO_MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.wma': 'audio/x-ms-wma',
  '.opus': 'audio/opus',
  '.webm': 'audio/webm',
};

/** Supported video MIME types with extensions */
export const VIDEO_MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.flv': 'video/x-flv',
  '.wmv': 'video/x-ms-wmv',
  '.m4v': 'video/mp4',
};

/** Supported document MIME types with extensions */
export const DOCUMENT_MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.csv': 'text/csv',
};

/** Maximum file sizes by type (in bytes) */
export const MAX_FILE_SIZES = {
  image: 20 * 1024 * 1024,    // 20MB
  audio: 25 * 1024 * 1024,    // 25MB
  video: 100 * 1024 * 1024,   // 100MB
  document: 50 * 1024 * 1024, // 50MB
};

/** Models supporting multimodal input */
export const MULTIMODAL_MODELS = [
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
];

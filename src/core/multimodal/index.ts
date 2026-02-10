/**
 * MultiModal Module - Re-exports and convenience functions
 *
 * @module multimodal
 */

// Types
export type {
  ContentType,
  ImageInput,
  AudioInput,
  VideoInput,
  DocumentInput,
  MultiModalContent,
  MixedContentPrompt,
  AnalysisResult,
  ScreenshotAnalysis,
  ErrorDetection,
  UIElement,
  FixSuggestion,
  CodeSnippet,
  MCPMultiModalResource,
  MCPResourceContent,
  MCPMultiModalToolInput,
} from './types.js';

// Constants
export {
  IMAGE_MIME_TYPES,
  AUDIO_MIME_TYPES,
  VIDEO_MIME_TYPES,
  DOCUMENT_MIME_TYPES,
  MAX_FILE_SIZES,
  MULTIMODAL_MODELS,
} from './constants.js';

// Utils
export {
  detectContentType,
  getMimeType,
  isBase64,
  downloadToBuffer,
} from './utils.js';

// Main class
export { MultiModalProcessor } from './MultiModalProcessor.js';

// Re-export isUrl (deprecated alias)
export { isValidUrl as isUrl } from '../../utils/validators.js';

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

import { MultiModalProcessor } from './MultiModalProcessor.js';
import { isValidUrl } from '../../utils/validators.js';
import type { ImageInput, AnalysisResult, ScreenshotAnalysis, ContentType, MixedContentPrompt } from './types.js';

/**
 * Quick image analysis
 */
export async function analyzeImage(
  imageInput: ImageInput | string,
  prompt?: string
): Promise<AnalysisResult> {
  const processor = new MultiModalProcessor();
  const input: ImageInput = typeof imageInput === 'string'
    ? { source: isValidUrl(imageInput) ? 'url' : 'file', data: imageInput }
    : imageInput;
  return processor.analyzeImage(input, prompt);
}

/**
 * Quick screenshot analysis for debugging
 */
export async function analyzeScreenshot(
  screenshotPath: string
): Promise<ScreenshotAnalysis> {
  const processor = new MultiModalProcessor();
  return processor.analyzeScreenshotForDebug(screenshotPath);
}

/**
 * Build mixed content prompt
 */
export function buildMixedPrompt(
  parts: Array<{ type: ContentType; data: string; mimeType?: string }>,
  prompt: string
): MixedContentPrompt {
  return {
    parts: parts.map(p => ({
      type: p.type,
      data: p.data,
      mimeType: p.mimeType || (p.type === 'text' ? 'text/plain' : 'application/octet-stream'),
    })),
    prompt,
  };
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

/** Default MultiModalProcessor instance */
export const multiModalProcessor = new MultiModalProcessor();

export default multiModalProcessor;

/**
 * Output Format Validation Module
 * Solution #47: Output Format Validator
 *
 * Re-exports all validation types, classes, and utilities.
 */

// Types
export type { FormatType, FormatSpec, JsonSchema, FormatError, FormatValidation } from './types.js';

// Main class
export { OutputFormatValidator } from './OutputFormatValidator.js';

// Sub-validators
export { validateJson, validateJsonSchema, extractJson, autoCorrectJson } from './JsonValidator.js';
export { validateMarkdown, extractMarkdownHeaders, autoCorrectMarkdown } from './MarkdownValidator.js';
export { validateCode, extractCodeBlocks, looksLikeCode, autoCorrectCode } from './CodeValidator.js';
export { validateList, extractListItems, autoCorrectList } from './ListValidator.js';

// Utilities
export { detectFormat, getCorrections } from './FormatDetection.js';
export { CommonFormats, createSpec } from './CommonFormats.js';

// Singleton & convenience functions
import { OutputFormatValidator } from './OutputFormatValidator.js';
import type { FormatSpec, FormatValidation } from './types.js';

export const outputFormatValidator = new OutputFormatValidator();

export function validateOutputFormat(output: string, format: FormatSpec): FormatValidation {
  return outputFormatValidator.validateFormat(output, format);
}

export function autoCorrectOutput(output: string, format: FormatSpec): string {
  return outputFormatValidator.autoCorrect(output, format);
}

export default OutputFormatValidator;

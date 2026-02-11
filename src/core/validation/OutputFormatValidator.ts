/**
 * OutputFormatValidator - Main class that orchestrates format validation
 * Solution #47: Output Format Validator
 */

import chalk from 'chalk';
import { autoCorrectCode, validateCode } from './CodeValidator.js';
import { CommonFormats, createSpec } from './CommonFormats.js';
import { detectFormat, getCorrections } from './FormatDetection.js';
import { autoCorrectJson, validateJson } from './JsonValidator.js';
import { autoCorrectList, validateList } from './ListValidator.js';
import { autoCorrectMarkdown, validateMarkdown } from './MarkdownValidator.js';
import type { FormatError, FormatSpec, FormatType, FormatValidation } from './types.js';

// Re-export types so consumers can import from this file
export type { FormatError, FormatSpec, FormatType, FormatValidation, JsonSchema } from './types.js';

// Re-export CommonFormats
export { CommonFormats };

/**
 * Validates and corrects agent output formats
 */
export class OutputFormatValidator {
  private debug: boolean;

  constructor(options: { debug?: boolean } = {}) {
    this.debug = options.debug ?? false;
  }

  /**
   * Validate output against expected format specification
   */
  validateFormat(output: string, expectedFormat: FormatSpec): FormatValidation {
    const startTime = Date.now();
    const errors: FormatError[] = [];
    const suggestions: string[] = [];
    let correctedOutput: string | undefined;

    // Check for empty output
    if (!output || output.trim().length === 0) {
      if (!expectedFormat.allowEmpty) {
        errors.push({
          type: 'invalid',
          message: 'Output is empty',
          expected: 'Non-empty output',
          actual: 'Empty string',
        });
        suggestions.push('Provide meaningful content in the output');
      }
      return {
        valid: expectedFormat.allowEmpty ?? false,
        errors,
        suggestions,
        metadata: { format: expectedFormat.type, parseTime: Date.now() - startTime },
      };
    }

    // Check max length
    if (expectedFormat.maxLength && output.length > expectedFormat.maxLength) {
      errors.push({
        type: 'length',
        message: `Output exceeds maximum length of ${expectedFormat.maxLength}`,
        expected: `<= ${expectedFormat.maxLength} characters`,
        actual: `${output.length} characters`,
      });
      suggestions.push(
        `Truncate or summarize output to fit within ${expectedFormat.maxLength} characters`,
      );
    }

    // Validate based on format type
    switch (expectedFormat.type) {
      case 'json':
        validateJson(output, expectedFormat, errors, suggestions);
        break;
      case 'markdown':
        validateMarkdown(output, expectedFormat, errors, suggestions);
        break;
      case 'code':
        validateCode(output, expectedFormat, errors, suggestions);
        break;
      case 'list':
        validateList(output, expectedFormat, errors, suggestions);
        break;
      case 'freeform':
        break;
    }

    // Run custom validator if provided
    if (expectedFormat.customValidator) {
      const customErrors = expectedFormat.customValidator(output);
      errors.push(...customErrors);
    }

    // Attempt auto-correction if there are errors
    if (errors.length > 0) {
      correctedOutput = this.autoCorrect(output, expectedFormat);
    }

    const valid = errors.length === 0;

    if (this.debug) {
      console.log(
        chalk.gray(
          `[OutputFormatValidator] Validated ${expectedFormat.type}: ${valid ? chalk.green('VALID') : chalk.red('INVALID')}`,
        ),
      );
      if (errors.length > 0) {
        for (const e of errors) console.log(chalk.yellow(`  - ${e.type}: ${e.message}`));
      }
    }

    return {
      valid,
      errors,
      suggestions,
      correctedOutput,
      metadata: {
        format: expectedFormat.type,
        detectedFormat: detectFormat(output),
        parseTime: Date.now() - startTime,
        corrections: correctedOutput ? getCorrections(output, correctedOutput) : undefined,
      },
    };
  }

  /**
   * Attempt to auto-correct output to match expected format
   */
  autoCorrect(output: string, format: FormatSpec): string {
    let corrected = output;

    switch (format.type) {
      case 'json':
        corrected = autoCorrectJson(output, format);
        break;
      case 'markdown':
        corrected = autoCorrectMarkdown(output, format);
        break;
      case 'code':
        corrected = autoCorrectCode(output, format);
        break;
      case 'list':
        corrected = autoCorrectList(output, format);
        break;
    }

    if (format.maxLength && corrected.length > format.maxLength) {
      corrected = `${corrected.substring(0, format.maxLength - 3)}...`;
    }

    return corrected;
  }

  /**
   * Detect the format of output
   */
  detectFormat(output: string): FormatType {
    return detectFormat(output);
  }

  /**
   * Create a format spec for common use cases
   */
  static createSpec(type: FormatType, options?: Partial<FormatSpec>): FormatSpec {
    return createSpec(type, options);
  }
}

// Singleton instance
export const outputFormatValidator = new OutputFormatValidator();

// Convenience functions
export function validateOutputFormat(output: string, format: FormatSpec): FormatValidation {
  return outputFormatValidator.validateFormat(output, format);
}

export function autoCorrectOutput(output: string, format: FormatSpec): string {
  return outputFormatValidator.autoCorrect(output, format);
}

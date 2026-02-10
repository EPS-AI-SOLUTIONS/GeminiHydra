/**
 * Type definitions for OutputFormatValidator
 * Solution #47: Output Format Validator
 */

/**
 * Supported output format types
 */
export type FormatType = 'json' | 'markdown' | 'code' | 'list' | 'freeform';

/**
 * Format specification for validation
 */
export interface FormatSpec {
  type: FormatType;
  schema?: JsonSchema;                    // JSON schema for 'json' type
  requiredSections?: string[];            // Required headers for 'markdown'
  codeLanguage?: string;                  // Expected language for 'code'
  listStyle?: 'bullet' | 'numbered' | 'both';  // List style for 'list'
  minItems?: number;                      // Minimum items for 'list'
  maxLength?: number;                     // Maximum output length
  allowEmpty?: boolean;                   // Allow empty output
  customValidator?: (output: string) => FormatError[];  // Custom validation
}

/**
 * JSON Schema subset for validation
 */
export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  additionalProperties?: boolean | JsonSchema;
}

/**
 * Format validation error
 */
export interface FormatError {
  type: 'parse' | 'schema' | 'structure' | 'missing' | 'invalid' | 'length' | 'custom';
  message: string;
  position?: number;
  line?: number;
  column?: number;
  expected?: string;
  actual?: string;
  path?: string;                          // JSON path or section name
}

/**
 * Format validation result
 */
export interface FormatValidation {
  valid: boolean;
  errors: FormatError[];
  suggestions: string[];
  correctedOutput?: string;
  metadata?: {
    format: FormatType;
    detectedFormat?: FormatType;
    parseTime?: number;
    corrections?: string[];
  };
}

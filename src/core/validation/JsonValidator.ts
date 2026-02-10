/**
 * JSON validation and auto-correction
 */

import type { FormatSpec, FormatError, JsonSchema } from './types.js';

/**
 * Extract JSON content from text (handles markdown code blocks)
 */
export function extractJson(output: string): string | null {
  const trimmed = output.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return trimmed;
  }

  const codeBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  const jsonMatch = output.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    return jsonMatch[1];
  }

  return null;
}

/**
 * Validate JSON output against spec
 */
export function validateJson(
  output: string,
  spec: FormatSpec,
  errors: FormatError[],
  suggestions: string[]
): void {
  const jsonContent = extractJson(output);

  if (!jsonContent) {
    errors.push({
      type: 'parse',
      message: 'No valid JSON found in output',
      expected: 'Valid JSON object or array',
      actual: output.substring(0, 100) + (output.length > 100 ? '...' : '')
    });
    suggestions.push('Ensure output is valid JSON format');
    suggestions.push('Remove any text before or after the JSON');
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (e) {
    const parseError = e as SyntaxError;
    const position = findJsonErrorPosition(jsonContent, parseError.message);
    errors.push({
      type: 'parse',
      message: `JSON parse error: ${parseError.message}`,
      position: position.offset,
      line: position.line,
      column: position.column,
      expected: 'Valid JSON syntax',
      actual: getContextAround(jsonContent, position.offset)
    });
    suggestions.push('Check for missing quotes, commas, or brackets');
    suggestions.push('Ensure all strings are properly escaped');
    return;
  }

  if (spec.schema) {
    validateJsonSchema(parsed, spec.schema, '', errors, suggestions);
  }
}

/**
 * Validate value against JSON Schema
 */
export function validateJsonSchema(
  value: any,
  schema: JsonSchema,
  path: string,
  errors: FormatError[],
  suggestions: string[]
): void {
  if (schema.type) {
    const actualType = getJsonType(value);
    if (actualType !== schema.type) {
      errors.push({
        type: 'schema',
        message: `Type mismatch at ${path || 'root'}`,
        path,
        expected: schema.type,
        actual: actualType
      });
      return;
    }
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({
      type: 'schema',
      message: `Value not in enum at ${path || 'root'}`,
      path,
      expected: schema.enum.join(' | '),
      actual: String(value)
    });
  }

  if (schema.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (schema.required) {
      for (const req of schema.required) {
        if (!(req in value)) {
          errors.push({
            type: 'missing',
            message: `Missing required property: ${req}`,
            path: path ? `${path}.${req}` : req,
            expected: `Property "${req}"`,
            actual: 'undefined'
          });
          suggestions.push(`Add required property "${req}" to the JSON object`);
        }
      }
    }

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in value) {
          validateJsonSchema(value[key], propSchema, path ? `${path}.${key}` : key, errors, suggestions);
        }
      }
    }

    if (schema.additionalProperties === false) {
      const allowed = new Set(Object.keys(schema.properties || {}));
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          errors.push({
            type: 'schema',
            message: `Unexpected property: ${key}`,
            path: path ? `${path}.${key}` : key,
            expected: 'No additional properties',
            actual: key
          });
        }
      }
    }
  }

  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({
        type: 'schema',
        message: `Array too short at ${path || 'root'}`,
        path,
        expected: `>= ${schema.minItems} items`,
        actual: `${value.length} items`
      });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({
        type: 'schema',
        message: `Array too long at ${path || 'root'}`,
        path,
        expected: `<= ${schema.maxItems} items`,
        actual: `${value.length} items`
      });
    }
    if (schema.items) {
      value.forEach((item, idx) => {
        validateJsonSchema(item, schema.items!, `${path}[${idx}]`, errors, suggestions);
      });
    }
  }

  if (schema.type === 'string' && typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        type: 'schema',
        message: `String too short at ${path || 'root'}`,
        path,
        expected: `>= ${schema.minLength} characters`,
        actual: `${value.length} characters`
      });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        type: 'schema',
        message: `String too long at ${path || 'root'}`,
        path,
        expected: `<= ${schema.maxLength} characters`,
        actual: `${value.length} characters`
      });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push({
        type: 'schema',
        message: `String doesn't match pattern at ${path || 'root'}`,
        path,
        expected: schema.pattern,
        actual: value
      });
    }
  }

  if (schema.type === 'number' && typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        type: 'schema',
        message: `Number too small at ${path || 'root'}`,
        path,
        expected: `>= ${schema.minimum}`,
        actual: String(value)
      });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({
        type: 'schema',
        message: `Number too large at ${path || 'root'}`,
        path,
        expected: `<= ${schema.maximum}`,
        actual: String(value)
      });
    }
  }
}

/**
 * Auto-correct JSON output
 */
export function autoCorrectJson(output: string, spec: FormatSpec): string {
  let json = extractJson(output);

  if (!json) {
    const trimmed = output.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return JSON.stringify({ content: trimmed });
    }
    return output;
  }

  json = json
    .replace(/,(\s*[}\]])/g, '$1')
    .replace(/'/g, '"')
    .replace(/(\{|,)\s*(\w+)\s*:/g, '$1"$2":');

  try {
    const parsed = JSON.parse(json);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return json;
  }
}

function getJsonType(value: any): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function findJsonErrorPosition(json: string, errorMessage: string): { offset: number; line: number; column: number } {
  const posMatch = errorMessage.match(/position\s+(\d+)/i);
  if (posMatch) {
    const offset = parseInt(posMatch[1], 10);
    return offsetToLineColumn(json, offset);
  }

  const lineMatch = errorMessage.match(/line\s+(\d+)/i);
  const colMatch = errorMessage.match(/column\s+(\d+)/i);
  if (lineMatch) {
    const line = parseInt(lineMatch[1], 10);
    const column = colMatch ? parseInt(colMatch[1], 10) : 1;
    return { offset: lineColumnToOffset(json, line, column), line, column };
  }

  return { offset: 0, line: 1, column: 1 };
}

function offsetToLineColumn(text: string, offset: number): { offset: number; line: number; column: number } {
  let line = 1;
  let column = 1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { offset, line, column };
}

function lineColumnToOffset(text: string, line: number, column: number): number {
  let currentLine = 1;
  let offset = 0;
  for (let i = 0; i < text.length; i++) {
    if (currentLine === line) {
      return offset + column - 1;
    }
    if (text[i] === '\n') {
      currentLine++;
    }
    offset++;
  }
  return offset;
}

function getContextAround(text: string, position: number, radius: number = 20): string {
  const start = Math.max(0, position - radius);
  const end = Math.min(text.length, position + radius);
  let context = text.substring(start, end);
  if (start > 0) context = '...' + context;
  if (end < text.length) context = context + '...';
  return context;
}

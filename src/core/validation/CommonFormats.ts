/**
 * Pre-built format specifications for common use cases
 */

import type { FormatSpec, FormatType, JsonSchema } from './types.js';

export const CommonFormats = {
  json: (schema?: JsonSchema): FormatSpec => ({
    type: 'json',
    schema
  }),

  markdown: (requiredSections?: string[]): FormatSpec => ({
    type: 'markdown',
    requiredSections
  }),

  code: (language?: string): FormatSpec => ({
    type: 'code',
    codeLanguage: language
  }),

  bulletList: (minItems?: number): FormatSpec => ({
    type: 'list',
    listStyle: 'bullet',
    minItems
  }),

  numberedList: (minItems?: number): FormatSpec => ({
    type: 'list',
    listStyle: 'numbered',
    minItems
  }),

  taskList: (): FormatSpec => ({
    type: 'json',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'task'],
        properties: {
          id: { type: 'number' },
          task: { type: 'string', minLength: 1 },
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] }
        }
      }
    }
  }),

  apiResponse: (): FormatSpec => ({
    type: 'json',
    schema: {
      type: 'object',
      required: ['success'],
      properties: {
        success: { type: 'boolean' },
        data: {},
        error: { type: 'string' },
        message: { type: 'string' }
      }
    }
  }),

  codeReview: (): FormatSpec => ({
    type: 'markdown',
    requiredSections: ['Summary', 'Issues', 'Suggestions']
  }),

  analysisReport: (): FormatSpec => ({
    type: 'markdown',
    requiredSections: ['Overview', 'Findings', 'Recommendations']
  })
};

/**
 * Create a format spec for common use cases
 */
export function createSpec(type: FormatType, options?: Partial<FormatSpec>): FormatSpec {
  const baseSpec: FormatSpec = { type };

  switch (type) {
    case 'json':
      return { ...baseSpec, schema: options?.schema, ...options };
    case 'markdown':
      return { ...baseSpec, requiredSections: options?.requiredSections || [], ...options };
    case 'code':
      return { ...baseSpec, codeLanguage: options?.codeLanguage, ...options };
    case 'list':
      return { ...baseSpec, listStyle: options?.listStyle || 'both', minItems: options?.minItems, ...options };
    default:
      return { ...baseSpec, ...options };
  }
}

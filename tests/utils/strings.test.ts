/**
 * Tests for string utilities
 */

import { describe, it, expect } from 'vitest';
import {
  truncate,
  truncateObjective,
  truncateTask,
  truncateTaskDisplay,
  truncateContext,
} from '../../src/utils/strings.js';
import {
  OBJECTIVE_TRUNCATION,
  TASK_TRUNCATION,
  TASK_DISPLAY_TRUNCATION,
  CONTEXT_TRUNCATION,
} from '../../src/config/constants.js';

describe('String Utilities', () => {
  describe('truncate', () => {
    it('should return original string if shorter than maxLength', () => {
      const str = 'Hello World';
      expect(truncate(str, 20)).toBe(str);
    });

    it('should return original string if equal to maxLength', () => {
      const str = 'Hello';
      expect(truncate(str, 5)).toBe(str);
    });

    it('should truncate string with ellipsis if longer than maxLength', () => {
      const str = 'Hello World';
      expect(truncate(str, 5)).toBe('Hello...');
    });

    it('should handle empty string', () => {
      expect(truncate('', 10)).toBe('');
    });

    it('should handle maxLength of 0', () => {
      expect(truncate('Hello', 0)).toBe('...');
    });

    it('should handle very long strings', () => {
      const longStr = 'a'.repeat(1000);
      const result = truncate(longStr, 100);
      expect(result).toBe('a'.repeat(100) + '...');
      expect(result.length).toBe(103); // 100 + '...'
    });

    it('should handle unicode characters', () => {
      const str = 'Zażółć gęślą jaźń';
      expect(truncate(str, 10)).toBe('Zażółć gęś...');
    });

    it('should handle strings with newlines', () => {
      const str = 'Hello\nWorld\nTest';
      expect(truncate(str, 8)).toBe('Hello\nWo...');
    });
  });

  describe('truncateObjective', () => {
    it('should truncate to OBJECTIVE_TRUNCATION length', () => {
      const longObjective = 'a'.repeat(OBJECTIVE_TRUNCATION + 50);
      const result = truncateObjective(longObjective);
      expect(result).toBe('a'.repeat(OBJECTIVE_TRUNCATION) + '...');
    });

    it('should not truncate short objectives', () => {
      const shortObjective = 'Write a function';
      expect(truncateObjective(shortObjective)).toBe(shortObjective);
    });

    it('should handle exact length', () => {
      const exactObjective = 'a'.repeat(OBJECTIVE_TRUNCATION);
      expect(truncateObjective(exactObjective)).toBe(exactObjective);
    });
  });

  describe('truncateTask', () => {
    it('should truncate to TASK_TRUNCATION length', () => {
      const longTask = 'b'.repeat(TASK_TRUNCATION + 30);
      const result = truncateTask(longTask);
      expect(result).toBe('b'.repeat(TASK_TRUNCATION) + '...');
    });

    it('should not truncate short tasks', () => {
      const shortTask = 'Execute command';
      expect(truncateTask(shortTask)).toBe(shortTask);
    });

    it('should handle exact length', () => {
      const exactTask = 'b'.repeat(TASK_TRUNCATION);
      expect(truncateTask(exactTask)).toBe(exactTask);
    });
  });

  describe('truncateTaskDisplay', () => {
    it('should truncate to TASK_DISPLAY_TRUNCATION length', () => {
      const longTask = 'c'.repeat(TASK_DISPLAY_TRUNCATION + 40);
      const result = truncateTaskDisplay(longTask);
      expect(result).toBe('c'.repeat(TASK_DISPLAY_TRUNCATION) + '...');
    });

    it('should not truncate short tasks', () => {
      const shortTask = 'Display task';
      expect(truncateTaskDisplay(shortTask)).toBe(shortTask);
    });

    it('should handle exact length', () => {
      const exactTask = 'c'.repeat(TASK_DISPLAY_TRUNCATION);
      expect(truncateTaskDisplay(exactTask)).toBe(exactTask);
    });
  });

  describe('truncateContext', () => {
    it('should truncate to CONTEXT_TRUNCATION length', () => {
      const longContext = 'd'.repeat(CONTEXT_TRUNCATION + 100);
      const result = truncateContext(longContext);
      expect(result).toBe('d'.repeat(CONTEXT_TRUNCATION) + '...');
    });

    it('should not truncate short context', () => {
      const shortContext = 'Some context information';
      expect(truncateContext(shortContext)).toBe(shortContext);
    });

    it('should handle exact length', () => {
      const exactContext = 'd'.repeat(CONTEXT_TRUNCATION);
      expect(truncateContext(exactContext)).toBe(exactContext);
    });

    it('should handle multi-line context', () => {
      const multiLineContext = 'Line 1\nLine 2\nLine 3'.repeat(50);
      const result = truncateContext(multiLineContext);
      expect(result.endsWith('...')).toBe(true);
    });
  });
});

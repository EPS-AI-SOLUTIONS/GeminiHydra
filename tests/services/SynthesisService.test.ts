/**
 * Tests for Synthesis Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SynthesisService, synthesisService } from '../../src/services/SynthesisService.js';
import type { ExecutionResult } from '../../src/types/index.js';

describe('SynthesisService', () => {
  let service: SynthesisService;

  beforeEach(() => {
    service = new SynthesisService();
  });

  // Helper to create execution result
  function createResult(
    id: number,
    success: boolean,
    content: string
  ): ExecutionResult {
    return {
      id,
      agent: 'geralt',
      success,
      content,
      duration: 100,
    };
  }

  describe('needsSynthesis', () => {
    it('should return false for single successful result with sufficient content', () => {
      const results = [
        createResult(1, true, 'A'.repeat(201)), // MIN_SINGLE_RESULT_LENGTH is 200, needs > 200
      ];

      expect(service.needsSynthesis(results)).toBe(false);
    });

    it('should return true for single successful result with short content', () => {
      const results = [
        createResult(1, true, 'Short'),
      ];

      expect(service.needsSynthesis(results)).toBe(true);
    });

    it('should return true for multiple successful results', () => {
      const results = [
        createResult(1, true, 'A'.repeat(201)),
        createResult(2, true, 'B'.repeat(201)),
      ];

      expect(service.needsSynthesis(results)).toBe(true);
    });

    it('should return true for no successful results', () => {
      const results = [
        createResult(1, false, ''),
      ];

      expect(service.needsSynthesis(results)).toBe(true);
    });

    it('should return true for empty results', () => {
      expect(service.needsSynthesis([])).toBe(true);
    });

    it('should ignore failed results when checking', () => {
      const results = [
        createResult(1, false, 'A'.repeat(201)),
        createResult(2, true, 'B'.repeat(201)),
      ];

      // Only one successful result with sufficient content (> 200)
      expect(service.needsSynthesis(results)).toBe(false);
    });
  });

  describe('getSingleResult', () => {
    it('should return content for single successful result with sufficient length', () => {
      const content = 'A'.repeat(201); // needs > MIN_SINGLE_RESULT_LENGTH (200)
      const results = [createResult(1, true, content)];

      expect(service.getSingleResult(results)).toBe(content);
    });

    it('should return null for short content', () => {
      const results = [createResult(1, true, 'Short')];

      expect(service.getSingleResult(results)).toBeNull();
    });

    it('should return null for multiple results', () => {
      const results = [
        createResult(1, true, 'A'.repeat(201)),
        createResult(2, true, 'B'.repeat(201)),
      ];

      expect(service.getSingleResult(results)).toBeNull();
    });

    it('should return null for no successful results', () => {
      const results = [createResult(1, false, 'A'.repeat(201))];

      expect(service.getSingleResult(results)).toBeNull();
    });

    it('should return null for empty results', () => {
      expect(service.getSingleResult([])).toBeNull();
    });
  });

  describe('buildPrompt', () => {
    it('should include objective', () => {
      const objective = 'Test objective';
      const results: ExecutionResult[] = [];

      const prompt = service.buildPrompt(objective, results);

      expect(prompt).toContain('CEL: Test objective');
    });

    it('should include success markers', () => {
      const results = [
        createResult(1, true, 'Success content'),
      ];

      const prompt = service.buildPrompt('Test', results);

      expect(prompt).toContain('[#1]');
      expect(prompt).toContain('✓');
    });

    it('should include failure markers', () => {
      const results = [
        createResult(1, false, 'Failed content'),
      ];

      const prompt = service.buildPrompt('Test', results);

      expect(prompt).toContain('[#1]');
      expect(prompt).toContain('✗');
    });

    it('should truncate long content', () => {
      const longContent = 'A'.repeat(1000);
      const results = [createResult(1, true, longContent)];

      const prompt = service.buildPrompt('Test', results);

      // RESULT_PREVIEW_LENGTH is 500
      expect(prompt.length).toBeLessThan(longContent.length + 500);
    });

    it('should include summary instructions', () => {
      const prompt = service.buildPrompt('Test', []);

      expect(prompt).toContain('podsumowanie');
      expect(prompt).toContain('cel został zrealizowany');
      expect(prompt).toContain('Kluczowe wyniki');
    });

    it('should handle multiple results', () => {
      const results = [
        createResult(1, true, 'Result 1'),
        createResult(2, true, 'Result 2'),
        createResult(3, false, 'Failed result'),
      ];

      const prompt = service.buildPrompt('Multi-task', results);

      expect(prompt).toContain('[#1]');
      expect(prompt).toContain('[#2]');
      expect(prompt).toContain('[#3]');
    });
  });

  describe('singleton export', () => {
    it('should export synthesisService instance', () => {
      expect(synthesisService).toBeInstanceOf(SynthesisService);
    });
  });
});

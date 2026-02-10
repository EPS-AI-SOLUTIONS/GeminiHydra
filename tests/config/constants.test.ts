/**
 * Tests for Constants Configuration
 */

import { describe, it, expect } from 'vitest';
import {
  OBJECTIVE_TRUNCATION,
  TASK_TRUNCATION,
  TASK_DISPLAY_TRUNCATION,
  CONTEXT_TRUNCATION,
  RESULT_PREVIEW_LENGTH,
  MIN_SINGLE_RESULT_LENGTH,
  MAX_TASKS,
  DEFAULT_TIMEOUT,
  DEFAULT_MODEL,
  PIPELINE_MODELS,
  PHASES,
  MAX_HEALING_CYCLES,
  MAX_RETRIES_PER_TASK,
} from '../../src/config/constants.js';

describe('Truncation Constants', () => {
  it('should define OBJECTIVE_TRUNCATION', () => {
    expect(OBJECTIVE_TRUNCATION).toBe(80);
  });

  it('should define TASK_TRUNCATION', () => {
    expect(TASK_TRUNCATION).toBe(50);
  });

  it('should define TASK_DISPLAY_TRUNCATION', () => {
    expect(TASK_DISPLAY_TRUNCATION).toBe(60);
  });

  it('should define CONTEXT_TRUNCATION', () => {
    expect(CONTEXT_TRUNCATION).toBe(500);
  });

  it('should define RESULT_PREVIEW_LENGTH', () => {
    expect(RESULT_PREVIEW_LENGTH).toBe(1500);
  });
});

describe('Synthesis Constants', () => {
  it('should define MIN_SINGLE_RESULT_LENGTH', () => {
    expect(MIN_SINGLE_RESULT_LENGTH).toBe(200);
  });

  it('should define MAX_TASKS', () => {
    expect(MAX_TASKS).toBe(3);
  });
});

describe('Timeout Constants', () => {
  it('should define DEFAULT_TIMEOUT', () => {
    expect(DEFAULT_TIMEOUT).toBe(60000);
  });
});

describe('Model Constants', () => {
  it('should define DEFAULT_MODEL', () => {
    expect(DEFAULT_MODEL).toBe('gemini-3-pro-preview');
  });

  describe('PIPELINE_MODELS', () => {
    it('should define PHASE_A model', () => {
      expect(PIPELINE_MODELS.PHASE_A).toBe('gemini-3-pro-preview');
    });

    it('should define PHASE_BA model', () => {
      expect(PIPELINE_MODELS.PHASE_BA).toBe('gemini-3-pro-preview');
    });

    it('should define PHASE_B model', () => {
      expect(PIPELINE_MODELS.PHASE_B).toBe('qwen3-4b');
    });

    it('should define PHASE_C model', () => {
      expect(PIPELINE_MODELS.PHASE_C).toBe('gemini-3-pro-preview');
    });

    it('should define PHASE_D model', () => {
      expect(PIPELINE_MODELS.PHASE_D).toBe('gemini-3-pro-preview');
    });
  });
});

describe('PHASES', () => {
  it('should define phase A', () => {
    expect(PHASES['A']).toContain('Dijkstra');
    expect(PHASES['A']).toContain('Planning');
  });

  it('should define phase B-A', () => {
    expect(PHASES['B-A']).toContain('Translation');
    expect(PHASES['B-A']).toContain('Refinement');
  });

  it('should define phase B', () => {
    expect(PHASES['B']).toContain('Graph Processor');
    expect(PHASES['B']).toContain('Execution');
  });

  it('should define phase C', () => {
    expect(PHASES['C']).toContain('Self-Healing');
  });

  it('should define phase D', () => {
    expect(PHASES['D']).toContain('Synthesis');
  });

  it('should define backwards compatibility aliases', () => {
    expect(PHASES.PLANNING).toBe('Phase A');
    expect(PHASES.EXECUTION).toBe('Phase B');
    expect(PHASES.SYNTHESIS).toBe('Phase D');
  });
});

describe('Self-healing Constants', () => {
  it('should define MAX_HEALING_CYCLES', () => {
    expect(MAX_HEALING_CYCLES).toBe(3);
  });

  it('should define MAX_RETRIES_PER_TASK', () => {
    expect(MAX_RETRIES_PER_TASK).toBe(3);
  });
});

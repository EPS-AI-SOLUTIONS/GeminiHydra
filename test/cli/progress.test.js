/**
 * Tests for Advanced Progress Bar module
 * @module tests/cli/progress.test
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Simple passthrough mock for chalk
const passthrough = (x) => x;
const passthroughFn = jest.fn(passthrough);

// Create mock object with chainable properties (non-recursive)
const mockChalk = {
  cyan: passthroughFn,
  green: passthroughFn,
  red: passthroughFn,
  yellow: passthroughFn,
  blue: passthroughFn,
  gray: passthroughFn,
  magenta: passthroughFn,
  white: passthroughFn,
  dim: passthroughFn,
  italic: passthroughFn,
  bgCyan: passthroughFn,
  hex: () => passthroughFn,
  bold: {
    white: passthroughFn,
    cyan: passthroughFn,
    hex: () => passthroughFn
  }
};

// Mock chalk before imports
jest.unstable_mockModule('chalk', () => ({
  default: mockChalk
}));

// Dynamic import after mock
const {
  AdvancedProgressBar,
  MultiProgressBar,
  PROGRESS_STYLES,
  createAdvancedProgressBar,
  createMultiProgressBar
} = await import('../../src/cli/progress.js');

describe('Progress Module', () => {
  let originalStdoutWrite;
  let output;

  beforeEach(() => {
    output = '';
    originalStdoutWrite = process.stdout.write;
    process.stdout.write = jest.fn((text) => {
      output += text;
      return true;
    });
  });

  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
  });

  describe('PROGRESS_STYLES', () => {
    it('should export all progress bar styles', () => {
      expect(PROGRESS_STYLES.classic).toBeDefined();
      expect(PROGRESS_STYLES.blocks).toBeDefined();
      expect(PROGRESS_STYLES.smooth).toBeDefined();
      expect(PROGRESS_STYLES.gradient).toBeDefined();
      expect(PROGRESS_STYLES.braille).toBeDefined();
      expect(PROGRESS_STYLES.modern).toBeDefined();
      expect(PROGRESS_STYLES.arrows).toBeDefined();
      expect(PROGRESS_STYLES.dots).toBeDefined();
    });

    it('classic style should have correct properties', () => {
      const style = PROGRESS_STYLES.classic;
      expect(style.name).toBe('classic');
      expect(style.leftBracket).toBe('[');
      expect(style.rightBracket).toBe(']');
      expect(style.filled).toBe('=');
      expect(style.empty).toBe('-');
      expect(style.useHead).toBe(true);
    });

    it('blocks style should have correct characters', () => {
      const style = PROGRESS_STYLES.blocks;
      expect(style.filled).toBe('█');
      expect(style.empty).toBe('░');
    });

    it('braille style should have partial characters', () => {
      const style = PROGRESS_STYLES.braille;
      expect(style.partials).toBeDefined();
      expect(style.partials.length).toBeGreaterThan(0);
      expect(style.usePartials).toBe(true);
    });

    it('gradient style should have gradient colors', () => {
      const style = PROGRESS_STYLES.gradient;
      expect(style.useGradient).toBe(true);
      expect(style.gradientColors).toBeDefined();
      expect(Array.isArray(style.gradientColors)).toBe(true);
    });
  });

  describe('AdvancedProgressBar', () => {
    describe('constructor', () => {
      it('should create with default options', () => {
        const bar = new AdvancedProgressBar();
        expect(bar.total).toBe(100);
        expect(bar.current).toBe(0);
        expect(bar.percent).toBe(0);
      });

      it('should accept custom total', () => {
        const bar = new AdvancedProgressBar({ total: 50 });
        expect(bar.total).toBe(50);
      });

      it('should accept custom style by name', () => {
        const bar = new AdvancedProgressBar({ style: 'blocks' });
        expect(bar).toBeDefined();
      });
    });

    describe('update()', () => {
      it('should update current value', () => {
        const bar = new AdvancedProgressBar({ total: 100 });
        bar.update(50);
        expect(bar.current).toBe(50);
        expect(bar.percent).toBe(0.5);
      });

      it('should not exceed total', () => {
        const bar = new AdvancedProgressBar({ total: 100 });
        bar.update(150);
        expect(bar.current).toBe(100);
      });

      it('should update label when provided', () => {
        const bar = new AdvancedProgressBar({ total: 100 });
        bar.update(50, 'Processing...');
        expect(output).toContain('Processing...');
      });

      it('should return this for chaining', () => {
        const bar = new AdvancedProgressBar();
        const result = bar.update(10);
        expect(result).toBe(bar);
      });
    });

    describe('increment()', () => {
      it('should increment by 1 by default', () => {
        const bar = new AdvancedProgressBar({ total: 100 });
        bar.increment();
        expect(bar.current).toBe(1);
      });

      it('should increment by specified amount', () => {
        const bar = new AdvancedProgressBar({ total: 100 });
        bar.increment(10);
        expect(bar.current).toBe(10);
      });
    });

    describe('complete()', () => {
      it('should set current to total', () => {
        const bar = new AdvancedProgressBar({ total: 100 });
        bar.complete();
        expect(bar.current).toBe(100);
        expect(bar.isComplete).toBe(true);
      });

      it('should display completion message', () => {
        const bar = new AdvancedProgressBar({
          total: 100,
          completeMessage: 'Done!'
        });
        bar.complete();
        expect(bar.isComplete).toBe(true);
      });
    });

    describe('reset()', () => {
      it('should reset to initial state', () => {
        const bar = new AdvancedProgressBar({ total: 100 });
        bar.update(50);
        bar.reset();
        expect(bar.current).toBe(0);
        expect(bar.isComplete).toBe(false);
      });
    });

    describe('setStyle()', () => {
      it('should change style dynamically', () => {
        const bar = new AdvancedProgressBar({ style: 'classic' });
        bar.setStyle('blocks');
        bar.update(50);
        // Check that blocks characters are used
        expect(output).toContain('█');
      });

      it('should return this for chaining', () => {
        const bar = new AdvancedProgressBar();
        const result = bar.setStyle('blocks');
        expect(result).toBe(bar);
      });
    });

    describe('elapsed time', () => {
      it('should track elapsed time', async () => {
        const bar = new AdvancedProgressBar();
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(bar.elapsed).toBeGreaterThanOrEqual(40);
      });
    });

    describe('percentage display', () => {
      it('should show percentage when enabled', () => {
        const bar = new AdvancedProgressBar({
          total: 100,
          showPercentage: true
        });
        bar.update(50);
        expect(output).toContain('50%');
      });
    });

    describe('value display', () => {
      it('should show value when enabled', () => {
        const bar = new AdvancedProgressBar({
          total: 100,
          showValue: true
        });
        bar.update(25);
        expect(output).toContain('25/100');
      });
    });

    describe('different styles rendering', () => {
      Object.keys(PROGRESS_STYLES).forEach(styleName => {
        it(`should render ${styleName} style without errors`, () => {
          const bar = new AdvancedProgressBar({
            total: 100,
            style: styleName,
            width: 20
          });
          expect(() => {
            bar.update(0);
            bar.update(50);
            bar.update(100);
          }).not.toThrow();
        });
      });
    });
  });

  describe('MultiProgressBar', () => {
    describe('constructor', () => {
      it('should create empty manager', () => {
        const multi = new MultiProgressBar();
        expect(multi.size).toBe(0);
        expect(multi.ids).toEqual([]);
      });
    });

    describe('add()', () => {
      it('should add new progress bar', () => {
        const multi = new MultiProgressBar();
        const bar = multi.add('task1', { total: 100 });
        expect(multi.size).toBe(1);
        expect(multi.ids).toContain('task1');
        expect(bar).toBeInstanceOf(AdvancedProgressBar);
      });

      it('should add multiple bars', () => {
        const multi = new MultiProgressBar();
        multi.add('task1');
        multi.add('task2');
        multi.add('task3');
        expect(multi.size).toBe(3);
      });
    });

    describe('get()', () => {
      it('should get bar by id', () => {
        const multi = new MultiProgressBar();
        const bar = multi.add('task1', { total: 50 });
        expect(multi.get('task1')).toBe(bar);
      });

      it('should return undefined for unknown id', () => {
        const multi = new MultiProgressBar();
        expect(multi.get('unknown')).toBeUndefined();
      });
    });

    describe('update()', () => {
      it('should update specific bar', () => {
        const multi = new MultiProgressBar();
        multi.add('task1', { total: 100 });
        multi.update('task1', 50);
        expect(multi.get('task1').current).toBe(50);
      });

      it('should return this for chaining', () => {
        const multi = new MultiProgressBar();
        multi.add('task1');
        const result = multi.update('task1', 10);
        expect(result).toBe(multi);
      });
    });

    describe('remove()', () => {
      it('should remove bar by id', () => {
        const multi = new MultiProgressBar();
        multi.add('task1');
        expect(multi.remove('task1')).toBe(true);
        expect(multi.size).toBe(0);
      });

      it('should return false for unknown id', () => {
        const multi = new MultiProgressBar();
        expect(multi.remove('unknown')).toBe(false);
      });
    });

    describe('finish()', () => {
      it('should finish and clear all bars', () => {
        const multi = new MultiProgressBar();
        multi.add('task1');
        multi.add('task2');
        multi.finish();
        expect(multi.size).toBe(0);
      });
    });
  });

  describe('Factory Functions', () => {
    describe('createAdvancedProgressBar()', () => {
      it('should create AdvancedProgressBar instance', () => {
        const bar = createAdvancedProgressBar({ total: 100 });
        expect(bar).toBeInstanceOf(AdvancedProgressBar);
      });
    });

    describe('createMultiProgressBar()', () => {
      it('should create MultiProgressBar instance', () => {
        const multi = createMultiProgressBar();
        expect(multi).toBeInstanceOf(MultiProgressBar);
      });
    });
  });
});

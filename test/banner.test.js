/**
 * Banner module tests
 */

import { jest, describe, test, expect, beforeEach, afterEach, it } from '@jest/globals';
import {
  showBanner,
  showCompactBanner,
  showMinimalBanner,
  gradients,
  LOGOS,
  BORDERS,
  centerText,
  horizontalLine,
  createBox,
  hexToRgb,
  getTerminalWidth,
  VERSION,
  CODENAME
} from '../src/cli/Banner.js';

describe('Banner Module', () => {
  // Mock console.log
  let consoleSpy;
  let originalWrite;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    originalWrite = process.stdout.write;
    process.stdout.write = jest.fn();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.stdout.write = originalWrite;
  });

  describe('VERSION and CODENAME', () => {
    it('should export VERSION', () => {
      expect(VERSION).toBeDefined();
      expect(typeof VERSION).toBe('string');
      expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('should export CODENAME', () => {
      expect(CODENAME).toBeDefined();
      expect(typeof CODENAME).toBe('string');
    });
  });

  describe('hexToRgb', () => {
    it('should convert hex to RGB', () => {
      expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
      expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('should handle hex without #', () => {
      expect(hexToRgb('ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    });

    it('should return white for invalid hex', () => {
      expect(hexToRgb('invalid')).toEqual({ r: 255, g: 255, b: 255 });
    });
  });

  describe('gradients', () => {
    it('should have all gradient functions', () => {
      expect(typeof gradients.horizontal).toBe('function');
      expect(typeof gradients.cyberPunk).toBe('function');
      expect(typeof gradients.hydra).toBe('function');
      expect(typeof gradients.matrix).toBe('function');
      expect(typeof gradients.sunset).toBe('function');
      expect(typeof gradients.rainbow).toBe('function');
    });

    it('should apply gradient to text', () => {
      const result = gradients.hydra('TEST');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      // Result should contain TEST (with or without ANSI codes depending on terminal support)
      expect(result).toContain('T');
      expect(result).toContain('E');
      expect(result).toContain('S');
    });

    it('should handle empty text', () => {
      const result = gradients.hydra('');
      expect(result).toBe('');
    });

    it('should handle single character', () => {
      const result = gradients.hydra('X');
      expect(result).toBeDefined();
      expect(result).toContain('X');
    });
  });

  describe('LOGOS', () => {
    it('should have all logo variants', () => {
      expect(LOGOS.hydra).toBeDefined();
      expect(LOGOS.compact).toBeDefined();
      expect(LOGOS.large).toBeDefined();
      expect(LOGOS.minimal).toBeDefined();
      expect(LOGOS.dragon).toBeDefined();
    });

    it('should have logos as arrays of strings', () => {
      Object.values(LOGOS).forEach(logo => {
        expect(Array.isArray(logo)).toBe(true);
        logo.forEach(line => {
          expect(typeof line).toBe('string');
        });
      });
    });
  });

  describe('BORDERS', () => {
    it('should have all border styles', () => {
      expect(BORDERS.double).toBeDefined();
      expect(BORDERS.single).toBeDefined();
      expect(BORDERS.rounded).toBeDefined();
      expect(BORDERS.heavy).toBeDefined();
    });

    it('should have all border characters', () => {
      const requiredChars = [
        'topLeft', 'topRight', 'bottomLeft', 'bottomRight',
        'horizontal', 'vertical', 'teeDown', 'teeUp',
        'teeLeft', 'teeRight', 'cross'
      ];

      Object.values(BORDERS).forEach(border => {
        requiredChars.forEach(char => {
          expect(border[char]).toBeDefined();
          expect(typeof border[char]).toBe('string');
        });
      });
    });
  });

  describe('getTerminalWidth', () => {
    it('should return a number', () => {
      const width = getTerminalWidth();
      expect(typeof width).toBe('number');
      expect(width).toBeGreaterThan(0);
    });

    it('should default to 80 if columns not available', () => {
      const originalColumns = process.stdout.columns;
      delete process.stdout.columns;
      const width = getTerminalWidth();
      expect(width).toBe(80);
      process.stdout.columns = originalColumns;
    });
  });

  describe('centerText', () => {
    it('should center text within width', () => {
      const result = centerText('TEST', 20);
      expect(result.length).toBeGreaterThanOrEqual(4);
      expect(result.includes('TEST')).toBe(true);
    });

    it('should not add padding if text is wider than width', () => {
      const result = centerText('VERYLONGTEXT', 5);
      expect(result.includes('VERYLONGTEXT')).toBe(true);
    });
  });

  describe('horizontalLine', () => {
    it('should create a horizontal line', () => {
      const line = horizontalLine('-', 10);
      expect(line).toBe('----------');
    });

    it('should use default character', () => {
      const line = horizontalLine(undefined, 5);
      expect(line.length).toBe(5);
    });
  });

  describe('createBox', () => {
    it('should create a box around content', () => {
      const lines = createBox(['Hello', 'World']);
      expect(Array.isArray(lines)).toBe(true);
      expect(lines.length).toBeGreaterThan(2);
    });

    it('should handle title option', () => {
      const lines = createBox(['Content'], { title: 'Title' });
      expect(Array.isArray(lines)).toBe(true);
      const joined = lines.join('');
      expect(joined).toContain('Title');
    });

    it('should handle empty content', () => {
      const lines = createBox([]);
      expect(Array.isArray(lines)).toBe(true);
    });
  });

  describe('showBanner', () => {
    it('should display banner without errors', async () => {
      await expect(showBanner({ animated: false })).resolves.not.toThrow();
    });

    it('should accept logo option', async () => {
      await expect(showBanner({ animated: false, logo: 'minimal' })).resolves.not.toThrow();
    });

    it('should accept gradient option', async () => {
      await expect(showBanner({ animated: false, gradient: 'cyberPunk' })).resolves.not.toThrow();
    });

    it('should accept showInfo option', async () => {
      await expect(showBanner({ animated: false, showInfo: false })).resolves.not.toThrow();
    });

    it('should accept showCommands option', async () => {
      await expect(showBanner({ animated: false, showCommands: false })).resolves.not.toThrow();
    });
  });

  describe('showCompactBanner', () => {
    it('should display compact banner without errors', () => {
      expect(() => showCompactBanner()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should accept gradient option', () => {
      expect(() => showCompactBanner({ gradient: 'matrix' })).not.toThrow();
    });
  });

  describe('showMinimalBanner', () => {
    it('should display minimal banner without errors', () => {
      expect(() => showMinimalBanner()).not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});

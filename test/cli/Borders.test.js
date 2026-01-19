/**
 * Tests for Borders module
 * @module tests/cli/Borders.test
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock chalk before imports
jest.unstable_mockModule('chalk', () => ({
  default: {
    gray: jest.fn(x => x),
    bold: {
      white: jest.fn(x => x),
      cyan: jest.fn(x => x)
    },
    blue: { bold: jest.fn(x => x) },
    green: { bold: jest.fn(x => x) },
    yellow: { bold: jest.fn(x => x) },
    red: { bold: jest.fn(x => x) },
    cyan: jest.fn(x => x),
    dim: jest.fn(x => x),
    italic: jest.fn(x => x),
    bgCyan: jest.fn(x => x)
  }
}));

// Dynamic import after mock
const {
  BorderRenderer,
  createBorderRenderer,
  quickBox,
  quickPanel,
  SINGLE,
  DOUBLE,
  ROUNDED,
  BOLD,
  DASHED,
  DOTTED,
  ASCII,
  BORDER_STYLES,
  stripAnsi,
  visibleLength,
  padString,
  wordWrap
} = await import('../../src/cli/Borders.js');

describe('Borders Module', () => {
  describe('Border Style Constants', () => {
    it('should export all border styles', () => {
      expect(SINGLE).toBeDefined();
      expect(DOUBLE).toBeDefined();
      expect(ROUNDED).toBeDefined();
      expect(BOLD).toBeDefined();
      expect(DASHED).toBeDefined();
      expect(DOTTED).toBeDefined();
      expect(ASCII).toBeDefined();
    });

    it('should have all required characters in SINGLE style', () => {
      const required = [
        'topLeft', 'topRight', 'bottomLeft', 'bottomRight',
        'horizontal', 'vertical', 'teeRight', 'teeLeft',
        'teeDown', 'teeUp', 'cross'
      ];
      required.forEach(key => {
        expect(SINGLE[key]).toBeDefined();
        expect(typeof SINGLE[key]).toBe('string');
      });
    });

    it('should have BORDER_STYLES mapping', () => {
      expect(BORDER_STYLES.single).toBe(SINGLE);
      expect(BORDER_STYLES.double).toBe(DOUBLE);
      expect(BORDER_STYLES.rounded).toBe(ROUNDED);
      expect(BORDER_STYLES.bold).toBe(BOLD);
      expect(BORDER_STYLES.dashed).toBe(DASHED);
      expect(BORDER_STYLES.dotted).toBe(DOTTED);
      expect(BORDER_STYLES.ascii).toBe(ASCII);
    });
  });

  describe('Utility Functions', () => {
    describe('stripAnsi', () => {
      it('should strip ANSI codes from string', () => {
        expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red');
        expect(stripAnsi('plain text')).toBe('plain text');
        expect(stripAnsi('\x1b[1;32mbold green\x1b[0m')).toBe('bold green');
      });

      it('should handle empty strings', () => {
        expect(stripAnsi('')).toBe('');
      });
    });

    describe('visibleLength', () => {
      it('should return correct length without ANSI codes', () => {
        expect(visibleLength('\x1b[31mtest\x1b[0m')).toBe(4);
        expect(visibleLength('test')).toBe(4);
      });
    });

    describe('padString', () => {
      it('should pad string to width (left align)', () => {
        expect(padString('hi', 5)).toBe('hi   ');
      });

      it('should pad string to width (right align)', () => {
        expect(padString('hi', 5, 'right')).toBe('   hi');
      });

      it('should pad string to width (center align)', () => {
        const result = padString('hi', 6, 'center');
        expect(result).toBe('  hi  ');
      });

      it('should handle strings longer than width', () => {
        expect(padString('hello', 3)).toBe('hello');
      });
    });

    describe('wordWrap', () => {
      it('should wrap long text', () => {
        const text = 'This is a long line that should be wrapped';
        const result = wordWrap(text, 20);
        expect(result.length).toBeGreaterThan(1);
        result.forEach(line => {
          expect(visibleLength(line)).toBeLessThanOrEqual(20);
        });
      });

      it('should preserve short lines', () => {
        expect(wordWrap('short', 50)).toEqual(['short']);
      });

      it('should handle newlines', () => {
        const result = wordWrap('line1\nline2', 50);
        expect(result).toEqual(['line1', 'line2']);
      });

      it('should handle empty input', () => {
        expect(wordWrap('', 50)).toEqual(['']);
        expect(wordWrap(null, 50)).toEqual(['']);
      });
    });
  });

  describe('BorderRenderer', () => {
    let renderer;

    beforeEach(() => {
      renderer = new BorderRenderer({ style: 'single' });
    });

    describe('constructor', () => {
      it('should create renderer with default options', () => {
        const r = new BorderRenderer();
        expect(r.getStyle()).toBe(SINGLE);
      });

      it('should accept style string', () => {
        const r = new BorderRenderer({ style: 'double' });
        expect(r.getStyle()).toBe(DOUBLE);
      });

      it('should accept custom style object', () => {
        const custom = { ...SINGLE, horizontal: '*' };
        const r = new BorderRenderer({ style: custom });
        expect(r.getStyle()).toBe(custom);
      });
    });

    describe('setStyle', () => {
      it('should change style by name', () => {
        renderer.setStyle('rounded');
        expect(renderer.getStyle()).toBe(ROUNDED);
      });

      it('should chain methods', () => {
        const result = renderer.setStyle('bold');
        expect(result).toBe(renderer);
      });
    });

    describe('horizontalLine', () => {
      it('should create horizontal line', () => {
        const line = renderer.horizontalLine(10);
        expect(line.length).toBeGreaterThan(0);
      });

      it('should respect custom character', () => {
        const line = renderer.horizontalLine(5, { char: '=' });
        expect(line).toContain('=');
      });
    });

    describe('box', () => {
      it('should create a box with content', () => {
        const lines = renderer.box('Hello');
        expect(lines.length).toBe(3); // top + content + bottom
      });

      it('should create box with title', () => {
        const lines = renderer.box('Content', { title: 'Title' });
        expect(lines[0]).toContain('Title');
      });

      it('should create box with footer', () => {
        const lines = renderer.box('Content', { footer: 'Footer' });
        const lastLine = lines[lines.length - 1];
        expect(lastLine).toContain('Footer');
      });

      it('should handle array content', () => {
        const lines = renderer.box(['Line 1', 'Line 2']);
        expect(lines.length).toBe(4); // top + 2 content + bottom
      });

      it('should respect padding options', () => {
        const lines = renderer.box('X', {
          padding: 2,
          paddingTop: 1,
          paddingBottom: 1
        });
        expect(lines.length).toBe(5); // top + paddingTop + content + paddingBottom + bottom
      });
    });

    describe('panel', () => {
      it('should create panel with header', () => {
        const lines = renderer.panel('Header', 'Content');
        expect(lines.length).toBeGreaterThan(0);
        expect(lines[0]).toContain('Header');
      });
    });

    describe('preset panels', () => {
      it('should create info panel', () => {
        const lines = renderer.infoPanel('Info message');
        expect(lines.length).toBeGreaterThan(0);
      });

      it('should create success panel', () => {
        const lines = renderer.successPanel('Success message');
        expect(lines.length).toBeGreaterThan(0);
      });

      it('should create warning panel', () => {
        const lines = renderer.warningPanel('Warning message');
        expect(lines.length).toBeGreaterThan(0);
      });

      it('should create error panel', () => {
        const lines = renderer.errorPanel('Error message');
        expect(lines.length).toBeGreaterThan(0);
      });
    });

    describe('sectionHeader', () => {
      it('should create section header', () => {
        const header = renderer.sectionHeader('Section Title', { width: 40 });
        expect(header).toContain('Section Title');
        expect(visibleLength(header)).toBe(40);
      });

      it('should support different positions', () => {
        const left = renderer.sectionHeader('T', { width: 20, position: 'left' });
        const center = renderer.sectionHeader('T', { width: 20, position: 'center' });
        const right = renderer.sectionHeader('T', { width: 20, position: 'right' });

        // All should have same visible length
        expect(visibleLength(left)).toBe(20);
        expect(visibleLength(center)).toBe(20);
        expect(visibleLength(right)).toBe(20);
      });
    });

    describe('section', () => {
      it('should create section with title and content', () => {
        const lines = renderer.section('Section', 'Content here');
        expect(lines.length).toBeGreaterThan(2);
      });
    });

    describe('tableDivider', () => {
      it('should create top divider', () => {
        const divider = renderer.tableDivider([5, 10], 'top');
        expect(divider).toContain(SINGLE.topLeft);
        expect(divider).toContain(SINGLE.topRight);
      });

      it('should create middle divider', () => {
        const divider = renderer.tableDivider([5, 10], 'middle');
        expect(divider).toContain(SINGLE.teeRight);
        expect(divider).toContain(SINGLE.teeLeft);
      });

      it('should create bottom divider', () => {
        const divider = renderer.tableDivider([5, 10], 'bottom');
        expect(divider).toContain(SINGLE.bottomLeft);
        expect(divider).toContain(SINGLE.bottomRight);
      });
    });

    describe('tableRow', () => {
      it('should create table row', () => {
        const row = renderer.tableRow(['A', 'B'], [5, 5]);
        expect(row).toContain('A');
        expect(row).toContain('B');
        expect(row).toContain(SINGLE.vertical);
      });
    });

    describe('sideBySide', () => {
      it('should create side by side boxes', () => {
        const lines = renderer.sideBySide([
          { content: 'Box 1', width: 15 },
          { content: 'Box 2', width: 15 }
        ]);
        expect(lines.length).toBeGreaterThan(0);
      });
    });

    describe('banner', () => {
      it('should create centered banner', () => {
        const lines = renderer.banner('BANNER');
        expect(lines.length).toBeGreaterThan(0);
      });
    });

    describe('callout', () => {
      it('should create callout with icon', () => {
        const lines = renderer.callout('!', 'Important note');
        expect(lines.length).toBeGreaterThan(0);
      });
    });

    describe('quote', () => {
      it('should create quote block', () => {
        const lines = renderer.quote('Quote text', 'Author');
        expect(lines.length).toBe(2);
      });

      it('should work without author', () => {
        const lines = renderer.quote('Just a quote');
        expect(lines.length).toBe(1);
      });
    });

    describe('print methods', () => {
      let consoleSpy;

      beforeEach(() => {
        consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      });

      afterEach(() => {
        consoleSpy.mockRestore();
      });

      it('should print single line', () => {
        renderer.print('test');
        expect(consoleSpy).toHaveBeenCalledWith('test');
      });

      it('should print array of lines', () => {
        renderer.print(['a', 'b']);
        expect(consoleSpy).toHaveBeenCalledWith('a\nb');
      });

      it('should printBox', () => {
        renderer.printBox('content');
        expect(consoleSpy).toHaveBeenCalled();
      });

      it('should printPanel', () => {
        renderer.printPanel('Header', 'content');
        expect(consoleSpy).toHaveBeenCalled();
      });

      it('should printSection', () => {
        renderer.printSection('Title', 'content');
        expect(consoleSpy).toHaveBeenCalled();
      });
    });
  });

  describe('Factory Functions', () => {
    describe('createBorderRenderer', () => {
      it('should create renderer with style', () => {
        const r = createBorderRenderer('double');
        expect(r.getStyle()).toBe(DOUBLE);
      });

      it('should default to single style', () => {
        const r = createBorderRenderer();
        expect(r.getStyle()).toBe(SINGLE);
      });
    });

    describe('quickBox', () => {
      it('should create box without explicit renderer', () => {
        const lines = quickBox('Quick content');
        expect(lines.length).toBeGreaterThan(0);
      });

      it('should accept style option', () => {
        const lines = quickBox('Content', { style: 'rounded' });
        expect(lines[0]).toContain(ROUNDED.topLeft);
      });
    });

    describe('quickPanel', () => {
      it('should create panel without explicit renderer', () => {
        const lines = quickPanel('Header', 'Content');
        expect(lines.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Different Border Styles Visual Check', () => {
    const styles = ['single', 'double', 'rounded', 'bold', 'dashed', 'dotted', 'ascii'];

    styles.forEach(style => {
      it(`should create valid box with ${style} style`, () => {
        const r = new BorderRenderer({ style });
        const lines = r.box('Test content', { title: 'Title' });

        expect(lines.length).toBeGreaterThan(2);
        // First line should contain style's topLeft character
        expect(lines[0]).toContain(BORDER_STYLES[style].topLeft);
        // Last line should contain style's bottomLeft character
        expect(lines[lines.length - 1]).toContain(BORDER_STYLES[style].bottomLeft);
      });
    });
  });
});

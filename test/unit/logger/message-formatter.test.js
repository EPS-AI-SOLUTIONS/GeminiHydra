/**
 * @fileoverview Tests for message-formatter module
 */

import {
  MessageFormatter,
  Icons,
  BoxChars,
  MessageThemes,
  getFormatter,
  resetFormatter,
  formatError,
  formatWarning,
  formatSuccess,
  formatInfo,
  formatDebug,
  formatHint,
  formatInline
} from '../../../src/logger/message-formatter.js';

describe('MessageFormatter', () => {
  let formatter;

  beforeEach(() => {
    resetFormatter();
    formatter = new MessageFormatter({
      maxWidth: 80,
      useColors: false, // Disable colors for easier testing
      useIcons: true
    });
  });

  describe('Icons', () => {
    test('should have all required icons', () => {
      expect(Icons.ERROR).toBeDefined();
      expect(Icons.WARNING).toBeDefined();
      expect(Icons.SUCCESS).toBeDefined();
      expect(Icons.INFO).toBeDefined();
      expect(Icons.DEBUG).toBeDefined();
      expect(Icons.HINT).toBeDefined();
      expect(Icons.ARROW_RIGHT).toBeDefined();
    });
  });

  describe('BoxChars', () => {
    test('should have single, double, and rounded box character sets', () => {
      expect(BoxChars.single).toBeDefined();
      expect(BoxChars.double).toBeDefined();
      expect(BoxChars.rounded).toBeDefined();
    });

    test('should have all required box characters in each set', () => {
      const requiredChars = [
        'topLeft', 'topRight', 'bottomLeft', 'bottomRight',
        'horizontal', 'vertical', 'leftTee', 'rightTee'
      ];

      for (const boxStyle of ['single', 'double', 'rounded']) {
        for (const char of requiredChars) {
          expect(BoxChars[boxStyle][char]).toBeDefined();
        }
      }
    });
  });

  describe('MessageThemes', () => {
    test('should have themes for all message types', () => {
      expect(MessageThemes.error).toBeDefined();
      expect(MessageThemes.warning).toBeDefined();
      expect(MessageThemes.success).toBeDefined();
      expect(MessageThemes.info).toBeDefined();
      expect(MessageThemes.debug).toBeDefined();
      expect(MessageThemes.hint).toBeDefined();
    });

    test('should have required properties in each theme', () => {
      for (const [, theme] of Object.entries(MessageThemes)) {
        expect(theme.icon).toBeDefined();
        expect(theme.borderColor).toBeDefined();
        expect(theme.titleColor).toBeDefined();
        expect(theme.label).toBeDefined();
      }
    });
  });

  describe('wrapText', () => {
    test('should wrap text at specified width', () => {
      const text = 'This is a long text that should be wrapped';
      const wrapped = formatter.wrapText(text, 20);

      expect(wrapped.length).toBeGreaterThan(1);
      wrapped.forEach(line => {
        expect(line.length).toBeLessThanOrEqual(20);
      });
    });

    test('should handle single word longer than width', () => {
      const text = 'superlongwordthatexceedswidth';
      const wrapped = formatter.wrapText(text, 10);

      expect(wrapped.length).toBeGreaterThan(1);
    });

    test('should return empty array for empty string', () => {
      const wrapped = formatter.wrapText('', 20);
      expect(wrapped).toEqual(['']);
    });
  });

  describe('padText', () => {
    test('should pad text to specified width (left)', () => {
      const result = formatter.padText('test', 10, 'left');
      expect(result).toBe('test      ');
    });

    test('should pad text to specified width (right)', () => {
      const result = formatter.padText('test', 10, 'right');
      expect(result).toBe('      test');
    });

    test('should pad text to specified width (center)', () => {
      const result = formatter.padText('test', 10, 'center');
      expect(result).toBe('   test   ');
    });
  });

  describe('formatBox', () => {
    test('should format error box', () => {
      const result = formatter.formatBox('error', 'Test Error', 'Error message');

      expect(result).toContain('ERROR');
      expect(result).toContain('Test Error');
      expect(result).toContain('Error message');
    });

    test('should include details when provided', () => {
      const result = formatter.formatBox('error', 'Test', 'Message', {
        details: { Code: 'ERR001', Path: '/test' }
      });

      expect(result).toContain('Code:');
      expect(result).toContain('ERR001');
      expect(result).toContain('Path:');
      expect(result).toContain('/test');
    });

    test('should include suggestions when provided', () => {
      const result = formatter.formatBox('error', 'Test', 'Message', {
        suggestions: ['Try this', 'Or try that']
      });

      expect(result).toContain('Suggestions');
      expect(result).toContain('Try this');
      expect(result).toContain('Or try that');
    });
  });

  describe('convenience methods', () => {
    test('error() should format error message', () => {
      const result = formatter.error('Error Title', 'Error content');
      expect(result).toContain('ERROR');
      expect(result).toContain('Error Title');
    });

    test('warning() should format warning message', () => {
      const result = formatter.warning('Warning Title', 'Warning content');
      expect(result).toContain('WARNING');
      expect(result).toContain('Warning Title');
    });

    test('success() should format success message', () => {
      const result = formatter.success('Success Title', 'Success content');
      expect(result).toContain('SUCCESS');
      expect(result).toContain('Success Title');
    });

    test('info() should format info message', () => {
      const result = formatter.info('Info Title', 'Info content');
      expect(result).toContain('INFO');
      expect(result).toContain('Info Title');
    });

    test('debug() should format debug message', () => {
      const result = formatter.debug('Debug Title', 'Debug content');
      expect(result).toContain('DEBUG');
      expect(result).toContain('Debug Title');
    });

    test('hint() should format hint message', () => {
      const result = formatter.hint('Hint Title', 'Hint content');
      expect(result).toContain('HINT');
      expect(result).toContain('Hint Title');
    });
  });

  describe('inline', () => {
    test('should format inline message', () => {
      const result = formatter.inline('error', 'Test message');
      expect(result).toContain('ERROR');
      expect(result).toContain('Test message');
    });
  });

  describe('singleton functions', () => {
    test('getFormatter should return formatter instance', () => {
      const f = getFormatter();
      expect(f).toBeInstanceOf(MessageFormatter);
    });

    test('resetFormatter should create new instance', () => {
      const f1 = getFormatter();
      resetFormatter();
      const f2 = getFormatter();
      expect(f1).not.toBe(f2);
    });

    test('formatError convenience function should work', () => {
      resetFormatter();
      const result = formatError('Title', 'Content');
      expect(result).toContain('ERROR');
    });
  });
});

/**
 * Icons Module Tests
 */

import {
  Icons,
  IconsASCII,
  IconGroups,
  Spinners,
  SpinnersASCII,
  BoxChars,
  ProgressChars,
  supportsUnicode,
  supportsEmoji,
  getIcons,
  getSpinner,
  getBoxChars,
  getProgressChars,
  icon,
  coloredIcon,
  statusMessage,
  progressBar
} from '../../src/cli/icons.js';

describe('Icons Module', () => {
  describe('Icons collection', () => {
    it('should have all required basic icons', () => {
      // Status icons
      expect(Icons.checkmark).toBeDefined();
      expect(Icons.cross).toBeDefined();
      expect(Icons.warning).toBeDefined();
      expect(Icons.info).toBeDefined();

      // Arrow icons
      expect(Icons.arrow).toBeDefined();
      expect(Icons.arrowRight).toBeDefined();
      expect(Icons.arrowLeft).toBeDefined();
      expect(Icons.arrowUp).toBeDefined();
      expect(Icons.arrowDown).toBeDefined();

      // Common symbols
      expect(Icons.star).toBeDefined();
      expect(Icons.heart).toBeDefined();
      expect(Icons.lightning).toBeDefined();
      expect(Icons.fire).toBeDefined();
      expect(Icons.rocket).toBeDefined();

      // Technical symbols
      expect(Icons.gear).toBeDefined();
      expect(Icons.lock).toBeDefined();
      expect(Icons.key).toBeDefined();

      // Files and folders
      expect(Icons.folder).toBeDefined();
      expect(Icons.file).toBeDefined();

      // Development
      expect(Icons.code).toBeDefined();
      expect(Icons.bug).toBeDefined();
      expect(Icons.wrench).toBeDefined();
    });

    it('should have Unicode characters for main icons', () => {
      expect(Icons.checkmark).toBe('\u2713');
      expect(Icons.cross).toBe('\u2717');
      expect(Icons.warning).toBe('\u26A0');
      expect(Icons.info).toBe('\u2139');
      expect(Icons.arrow).toBe('\u2192');
      expect(Icons.star).toBe('\u2605');
      expect(Icons.heart).toBe('\u2665');
      expect(Icons.lightning).toBe('\u26A1');
      expect(Icons.gear).toBe('\u2699');
      expect(Icons.bullet).toBe('\u2022');
    });

    it('should have at least 50 icons defined', () => {
      expect(Object.keys(Icons).length).toBeGreaterThanOrEqual(50);
    });
  });

  describe('IconsASCII fallback collection', () => {
    it('should have ASCII fallbacks for all main icons', () => {
      expect(IconsASCII.checkmark).toBe('[OK]');
      expect(IconsASCII.cross).toBe('[X]');
      expect(IconsASCII.warning).toBe('[!]');
      expect(IconsASCII.info).toBe('[i]');
      expect(IconsASCII.arrow).toBe('->');
      expect(IconsASCII.star).toBe('*');
      expect(IconsASCII.folder).toBe('[D]');
      expect(IconsASCII.file).toBe('[F]');
      expect(IconsASCII.code).toBe('</>');
      expect(IconsASCII.bug).toBe('[BUG]');
    });

    it('should have matching keys with Icons', () => {
      const iconKeys = Object.keys(Icons);
      const asciiKeys = Object.keys(IconsASCII);

      // All ASCII icons should have a Unicode equivalent
      asciiKeys.forEach(key => {
        expect(Icons[key]).toBeDefined();
      });
    });
  });

  describe('IconGroups', () => {
    it('should have status icons group', () => {
      expect(IconGroups.status).toBeDefined();
      expect(IconGroups.status.success).toBe(Icons.checkmark);
      expect(IconGroups.status.error).toBe(Icons.cross);
      expect(IconGroups.status.warning).toBe(Icons.warning);
      expect(IconGroups.status.info).toBe(Icons.info);
    });

    it('should have progress icons group', () => {
      expect(IconGroups.progress).toBeDefined();
      expect(IconGroups.progress.pending).toBeDefined();
      expect(IconGroups.progress.running).toBeDefined();
      expect(IconGroups.progress.complete).toBeDefined();
    });

    it('should have files icons group', () => {
      expect(IconGroups.files).toBeDefined();
      expect(IconGroups.files.folder).toBe(Icons.folder);
      expect(IconGroups.files.file).toBe(Icons.file);
      expect(IconGroups.files.code).toBe(Icons.code);
    });

    it('should have security icons group', () => {
      expect(IconGroups.security).toBeDefined();
      expect(IconGroups.security.lock).toBe(Icons.lock);
      expect(IconGroups.security.key).toBe(Icons.key);
      expect(IconGroups.security.shield).toBe(Icons.shield);
    });

    it('should have development icons group', () => {
      expect(IconGroups.development).toBeDefined();
      expect(IconGroups.development.code).toBe(Icons.code);
      expect(IconGroups.development.bug).toBe(Icons.bug);
      expect(IconGroups.development.wrench).toBe(Icons.wrench);
    });
  });

  describe('Spinners', () => {
    it('should have multiple spinner styles', () => {
      expect(Spinners.dots).toBeDefined();
      expect(Spinners.line).toBeDefined();
      expect(Spinners.circle).toBeDefined();
      expect(Spinners.arrows).toBeDefined();
    });

    it('should have arrays of spinner frames', () => {
      expect(Array.isArray(Spinners.dots)).toBe(true);
      expect(Spinners.dots.length).toBeGreaterThan(3);
      expect(Array.isArray(Spinners.line)).toBe(true);
      expect(Spinners.line.length).toBe(4);
    });

    it('should have ASCII fallback spinners', () => {
      expect(SpinnersASCII.dots).toBeDefined();
      expect(SpinnersASCII.line).toBeDefined();
      expect(Array.isArray(SpinnersASCII.line)).toBe(true);
    });
  });

  describe('BoxChars', () => {
    it('should have unicode box characters', () => {
      expect(BoxChars.unicode).toBeDefined();
      expect(BoxChars.unicode.topLeft).toBe('┌');
      expect(BoxChars.unicode.topRight).toBe('┐');
      expect(BoxChars.unicode.bottomLeft).toBe('└');
      expect(BoxChars.unicode.bottomRight).toBe('┘');
      expect(BoxChars.unicode.horizontal).toBe('─');
      expect(BoxChars.unicode.vertical).toBe('│');
    });

    it('should have ASCII box characters', () => {
      expect(BoxChars.ascii).toBeDefined();
      expect(BoxChars.ascii.topLeft).toBe('+');
      expect(BoxChars.ascii.horizontal).toBe('-');
      expect(BoxChars.ascii.vertical).toBe('|');
    });

    it('should have double unicode box characters', () => {
      expect(BoxChars.unicodeDouble).toBeDefined();
      expect(BoxChars.unicodeDouble.topLeft).toBe('╔');
      expect(BoxChars.unicodeDouble.horizontal).toBe('═');
    });

    it('should have rounded unicode box characters', () => {
      expect(BoxChars.unicodeRound).toBeDefined();
      expect(BoxChars.unicodeRound.topLeft).toBe('╭');
      expect(BoxChars.unicodeRound.topRight).toBe('╮');
    });
  });

  describe('ProgressChars', () => {
    it('should have unicode progress characters', () => {
      expect(ProgressChars.unicode).toBeDefined();
      expect(ProgressChars.unicode.filled).toBe('█');
      expect(ProgressChars.unicode.empty).toBe('░');
    });

    it('should have ASCII progress characters', () => {
      expect(ProgressChars.ascii).toBeDefined();
      expect(ProgressChars.ascii.filled).toBe('#');
      expect(ProgressChars.ascii.empty).toBe('-');
    });
  });

  describe('Helper functions', () => {
    describe('supportsUnicode()', () => {
      it('should return a boolean', () => {
        expect(typeof supportsUnicode()).toBe('boolean');
      });
    });

    describe('supportsEmoji()', () => {
      it('should return a boolean', () => {
        expect(typeof supportsEmoji()).toBe('boolean');
      });
    });

    describe('getIcons()', () => {
      it('should return an icon set object', () => {
        const icons = getIcons();
        expect(typeof icons).toBe('object');
        expect(icons.checkmark).toBeDefined();
        expect(icons.cross).toBeDefined();
      });
    });

    describe('getSpinner()', () => {
      it('should return default dots spinner', () => {
        const spinner = getSpinner();
        expect(Array.isArray(spinner)).toBe(true);
        expect(spinner.length).toBeGreaterThan(0);
      });

      it('should return specified spinner style', () => {
        const spinner = getSpinner('line');
        expect(Array.isArray(spinner)).toBe(true);
        expect(spinner.length).toBe(4);
      });

      it('should fall back to dots for unknown style', () => {
        const spinner = getSpinner('nonexistent');
        expect(Array.isArray(spinner)).toBe(true);
      });
    });

    describe('getBoxChars()', () => {
      it('should return unicode box chars by default', () => {
        const box = getBoxChars();
        expect(box).toBeDefined();
        expect(box.topLeft).toBeDefined();
      });

      it('should return specified style', () => {
        const box = getBoxChars('ascii');
        // Should get ASCII chars if unicode not supported, else specified style
        expect(box).toBeDefined();
      });
    });

    describe('getProgressChars()', () => {
      it('should return progress chars', () => {
        const progress = getProgressChars();
        expect(progress).toBeDefined();
        expect(progress.filled).toBeDefined();
        expect(progress.empty).toBeDefined();
      });
    });

    describe('icon()', () => {
      it('should return icon by name', () => {
        const result = icon('checkmark');
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });

      it('should return fallback for unknown icon', () => {
        const result = icon('unknownicon', 'FALLBACK');
        expect(result).toBe('FALLBACK');
      });

      it('should return name if no icon or fallback', () => {
        const result = icon('unknownicon123');
        expect(result).toBe('unknownicon123');
      });
    });

    describe('coloredIcon()', () => {
      it('should return icon without color function', () => {
        const result = coloredIcon('checkmark');
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      });

      it('should apply color function if provided', () => {
        const colorFn = str => `[colored]${str}[/colored]`;
        const result = coloredIcon('checkmark', colorFn);
        expect(result).toContain('[colored]');
        expect(result).toContain('[/colored]');
      });
    });

    describe('statusMessage()', () => {
      it('should create success message', () => {
        const msg = statusMessage('success', 'Done!');
        expect(msg).toContain('Done!');
        expect(typeof msg).toBe('string');
      });

      it('should create error message', () => {
        const msg = statusMessage('error', 'Failed!');
        expect(msg).toContain('Failed!');
      });

      it('should create warning message', () => {
        const msg = statusMessage('warning', 'Caution!');
        expect(msg).toContain('Caution!');
      });

      it('should create info message', () => {
        const msg = statusMessage('info', 'Note:');
        expect(msg).toContain('Note:');
      });
    });

    describe('progressBar()', () => {
      it('should create progress bar at 0%', () => {
        const bar = progressBar(0, 10);
        expect(bar).toContain('0%');
      });

      it('should create progress bar at 50%', () => {
        const bar = progressBar(50, 10);
        expect(bar).toContain('50%');
      });

      it('should create progress bar at 100%', () => {
        const bar = progressBar(100, 10);
        expect(bar).toContain('100%');
      });

      it('should respect width parameter', () => {
        const bar20 = progressBar(50, 20);
        const bar10 = progressBar(50, 10);
        // Longer bar should have more characters (excluding percentage)
        expect(bar20.length).toBeGreaterThan(bar10.length);
      });
    });
  });
});

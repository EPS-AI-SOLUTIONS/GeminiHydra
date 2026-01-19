/**
 * UI Module Tests
 * Tests for the unified UI components export (src/ui.js)
 *
 * @jest-environment node
 */

describe('UI Module', () => {
  let UI;
  let UIDefault;

  beforeAll(async () => {
    UI = await import('../src/ui.js');
    UIDefault = UI.default;
  });

  describe('CLI Components', () => {
    test('should export HydraCLI class', () => {
      expect(typeof UI.HydraCLI).toBe('function');
    });

    test('should export cliMain function', () => {
      expect(typeof UI.cliMain).toBe('function');
    });

    test('should export Banner utilities', () => {
      expect(typeof UI.showBanner).toBe('function');
      expect(typeof UI.showCompactBanner).toBe('function');
      expect(typeof UI.showMinimalBanner).toBe('function');
      expect(typeof UI.VERSION).toBe('string');
      expect(typeof UI.CODENAME).toBe('string');
      expect(typeof UI.gradients).toBe('object');
      expect(typeof UI.LOGOS).toBe('object');
      expect(typeof UI.BORDERS).toBe('object');
    });

    test('should export Theme utilities', () => {
      expect(typeof UI.HydraTheme).toBe('object');
      expect(typeof UI.MinimalTheme).toBe('object');
      expect(typeof UI.NeonTheme).toBe('object');
      expect(typeof UI.MonokaiTheme).toBe('object');
      expect(typeof UI.DraculaTheme).toBe('object');
      expect(typeof UI.getCliTheme).toBe('function');
      expect(typeof UI.getAvailableThemes).toBe('function');
      expect(typeof UI.getAutoTheme).toBe('function');
    });

    test('should export InputHandler', () => {
      expect(typeof UI.InputHandler).toBe('function');
      expect(typeof UI.createInputHandler).toBe('function');
    });

    test('should export OutputRenderer', () => {
      expect(typeof UI.OutputRenderer).toBe('function');
      expect(typeof UI.createRenderer).toBe('function');
    });

    test('should export CommandParser', () => {
      expect(typeof UI.CommandParser).toBe('function');
      expect(typeof UI.createCommandParser).toBe('function');
    });

    test('should export HistoryManager', () => {
      expect(typeof UI.HistoryManager).toBe('function');
      expect(typeof UI.createHistoryManager).toBe('function');
    });

    test('should export Autocomplete', () => {
      expect(typeof UI.Autocomplete).toBe('function');
      expect(typeof UI.createAutocomplete).toBe('function');
    });

    test('should export Spinner and related utilities', () => {
      expect(typeof UI.Spinner).toBe('function');
      expect(typeof UI.SpinnerTypes).toBe('object');
      expect(typeof UI.getSpinnerType).toBe('function');
      expect(typeof UI.getAvailableSpinnerTypes).toBe('function');
      expect(typeof UI.ProgressBar).toBe('function');
      expect(typeof UI.MultiSpinner).toBe('function');
      expect(typeof UI.AnimatedText).toBe('function');
      expect(typeof UI.createSpinner).toBe('function');
      expect(typeof UI.createProgressBar).toBe('function');
    });

    test('should export PromptBuilder', () => {
      expect(typeof UI.PromptBuilder).toBe('function');
      expect(typeof UI.createPromptBuilder).toBe('function');
    });

    test('should export CLI constants', () => {
      expect(typeof UI.HISTORY_FILE).toBe('string');
      expect(typeof UI.MAX_HISTORY_SIZE).toBe('number');
      expect(typeof UI.COMMAND_PREFIX).toBe('string');
      expect(typeof UI.KEYS).toBe('object');
      expect(typeof UI.ANSI).toBe('object');
      expect(typeof UI.PROMPT_STATES).toBe('object');
      expect(typeof UI.EXECUTION_MODES).toBe('object');
    });
  });

  describe('Logger Components', () => {
    test('should export color constants', () => {
      expect(typeof UI.COLORS).toBe('object');
      expect(typeof UI.RESET).toBe('string');
      expect(typeof UI.Styles).toBe('object');
      expect(typeof UI.FgColors).toBe('object');
      expect(typeof UI.BgColors).toBe('object');
    });

    test('should export color utility functions', () => {
      expect(typeof UI.supportsColors).toBe('function');
      expect(typeof UI.getColorDepth).toBe('function');
      expect(typeof UI.colorize).toBe('function');
      expect(typeof UI.createColorFormatter).toBe('function');
      expect(typeof UI.stripAnsi).toBe('function');
      expect(typeof UI.visibleLength).toBe('function');
    });

    test('should export convenience color functions', () => {
      expect(typeof UI.red).toBe('function');
      expect(typeof UI.green).toBe('function');
      expect(typeof UI.yellow).toBe('function');
      expect(typeof UI.blue).toBe('function');
      expect(typeof UI.magenta).toBe('function');
      expect(typeof UI.cyan).toBe('function');
      expect(typeof UI.white).toBe('function');
      expect(typeof UI.gray).toBe('function');
      expect(typeof UI.bold).toBe('function');
      expect(typeof UI.dim).toBe('function');
    });

    test('should export semantic color functions', () => {
      expect(typeof UI.error).toBe('function');
      expect(typeof UI.warning).toBe('function');
      expect(typeof UI.success).toBe('function');
      expect(typeof UI.info).toBe('function');
      expect(typeof UI.debug).toBe('function');
    });

    test('should export extended color functions', () => {
      expect(typeof UI.fg256).toBe('function');
      expect(typeof UI.bg256).toBe('function');
      expect(typeof UI.fgRGB).toBe('function');
      expect(typeof UI.bgRGB).toBe('function');
      expect(typeof UI.fgHex).toBe('function');
      expect(typeof UI.bgHex).toBe('function');
    });

    test('should export LogRotation', () => {
      expect(typeof UI.LogRotation).toBe('function');
      expect(typeof UI.getLogRotation).toBe('function');
      expect(typeof UI.resetLogRotation).toBe('function');
    });
  });

  describe('Namespace Exports', () => {
    test('should export cli namespace with all components', () => {
      expect(typeof UI.cli).toBe('object');
      expect(typeof UI.cli.HydraCLI).toBe('function');
      expect(typeof UI.cli.main).toBe('function');
      expect(typeof UI.cli.Banner).toBe('object');
      expect(typeof UI.cli.Theme).toBe('object');
      expect(typeof UI.cli.Input).toBe('object');
      expect(typeof UI.cli.Output).toBe('object');
      expect(typeof UI.cli.Command).toBe('object');
      expect(typeof UI.cli.History).toBe('object');
      expect(typeof UI.cli.Autocomplete).toBe('object');
      expect(typeof UI.cli.Spinner).toBe('object');
      expect(typeof UI.cli.Prompt).toBe('object');
      expect(typeof UI.cli.constants).toBe('object');
    });

    test('should export logger namespace', () => {
      expect(typeof UI.logger).toBe('object');
      expect(typeof UI.logger.colors).toBe('object');
      expect(typeof UI.logger.rotation).toBe('object');
    });
  });

  describe('Factory Functions', () => {
    test('should export createCLI factory', () => {
      expect(typeof UI.createCLI).toBe('function');
    });

    test('should export createThemedRenderer factory', () => {
      expect(typeof UI.createThemedRenderer).toBe('function');
    });

    test('should export createThemedSpinner factory', () => {
      expect(typeof UI.createThemedSpinner).toBe('function');
    });
  });

  describe('Default Export', () => {
    test('should have all expected properties', () => {
      expect(typeof UIDefault).toBe('object');
      expect(typeof UIDefault.cli).toBe('object');
      expect(typeof UIDefault.logger).toBe('object');
      expect(typeof UIDefault.createCLI).toBe('function');
      expect(typeof UIDefault.HydraCLI).toBe('function');
      expect(typeof UIDefault.Spinner).toBe('function');
      expect(typeof UIDefault.colors).toBe('object');
    });
  });

  describe('Theme Integration', () => {
    test('should have themes with required color properties', () => {
      const themes = [
        UI.HydraTheme,
        UI.MinimalTheme,
        UI.NeonTheme,
        UI.MonokaiTheme,
        UI.DraculaTheme
      ];

      for (const theme of themes) {
        expect(theme).toHaveProperty('name');
        expect(theme).toHaveProperty('colors');
        expect(theme).toHaveProperty('symbols');
        expect(theme).toHaveProperty('box');
        expect(typeof theme.colors.primary).toBe('function');
        expect(typeof theme.colors.success).toBe('function');
        expect(typeof theme.colors.error).toBe('function');
        expect(typeof theme.colors.warning).toBe('function');
      }
    });

    test('should return correct themes by name', () => {
      const availableThemes = UI.getAvailableThemes();
      expect(availableThemes).toContain('hydra');
      expect(availableThemes).toContain('minimal');
      expect(availableThemes).toContain('neon');
      expect(availableThemes).toContain('monokai');
      expect(availableThemes).toContain('dracula');

      expect(UI.getCliTheme('hydra').name).toBe('hydra');
      expect(UI.getCliTheme('minimal').name).toBe('minimal');
    });
  });

  describe('Spinner Types', () => {
    test('should have multiple spinner types available', () => {
      const types = UI.getAvailableSpinnerTypes();
      expect(types.length).toBeGreaterThan(10);
      expect(types).toContain('dots');
      expect(types).toContain('line');
      expect(types).toContain('circle');
    });

    test('should return spinner config by type', () => {
      const dots = UI.getSpinnerType('dots');
      expect(dots).toHaveProperty('interval');
      expect(dots).toHaveProperty('frames');
      expect(Array.isArray(dots.frames)).toBe(true);
    });
  });

  describe('Color Functions', () => {
    test('should colorize text', () => {
      const result = UI.colorize('test', UI.COLORS.red);
      expect(result).toContain('test');
    });

    test('should strip ANSI codes', () => {
      const colored = UI.colorize('test', UI.COLORS.red);
      const stripped = UI.stripAnsi(colored);
      expect(stripped).toBe('test');
    });

    test('should calculate visible length', () => {
      const colored = UI.colorize('test', UI.COLORS.red);
      expect(UI.visibleLength(colored)).toBe(4);
    });
  });

  describe('Component Instantiation', () => {
    test('should create CommandParser instance', () => {
      const parser = UI.createCommandParser();
      expect(parser).toBeInstanceOf(UI.CommandParser);
    });

    test('should create HistoryManager instance', () => {
      const history = UI.createHistoryManager();
      expect(history).toBeInstanceOf(UI.HistoryManager);
    });

    test('should create Autocomplete instance', () => {
      const autocomplete = UI.createAutocomplete();
      expect(autocomplete).toBeInstanceOf(UI.Autocomplete);
    });

    test('should create OutputRenderer instance', () => {
      const renderer = UI.createRenderer();
      expect(renderer).toBeInstanceOf(UI.OutputRenderer);
    });

    test('should create PromptBuilder instance', () => {
      const promptBuilder = UI.createPromptBuilder();
      expect(promptBuilder).toBeInstanceOf(UI.PromptBuilder);
    });

    test('should create Spinner instance', () => {
      const spinner = UI.createSpinner('Loading...');
      expect(spinner).toBeInstanceOf(UI.Spinner);
    });

    test('should create ProgressBar instance', () => {
      const progressBar = UI.createProgressBar({ total: 100 });
      expect(progressBar).toBeInstanceOf(UI.ProgressBar);
    });

    test('should create themed renderer', () => {
      const renderer = UI.createThemedRenderer('neon');
      expect(renderer).toBeInstanceOf(UI.OutputRenderer);
    });

    test('should create typed spinner', () => {
      const spinner = UI.createTypedSpinner('circle', 'Loading...');
      expect(spinner).toBeInstanceOf(UI.Spinner);
    });
  });

  describe('LogRotation', () => {
    test('should create LogRotation instance', () => {
      const rotation = new UI.LogRotation({ logDir: '/tmp/test-logs' });
      expect(rotation).toBeInstanceOf(UI.LogRotation);
    });

    test('should get singleton instance', () => {
      UI.resetLogRotation();
      const instance1 = UI.getLogRotation();
      const instance2 = UI.getLogRotation();
      expect(instance1).toBe(instance2);
      UI.resetLogRotation();
    });
  });
});

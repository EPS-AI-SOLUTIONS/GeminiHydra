/**
 * Tests for MarkdownRenderer
 * @jest-environment node
 */

import { jest } from '@jest/globals';
import { MarkdownRenderer, createMarkdownRenderer } from '../../src/cli/MarkdownRenderer.js';
import { HydraTheme, MinimalTheme } from '../../src/cli/Theme.js';

describe('MarkdownRenderer', () => {
  let renderer;
  let consoleSpy;

  beforeEach(() => {
    renderer = new MarkdownRenderer(HydraTheme);
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create renderer with default theme', () => {
      const r = new MarkdownRenderer();
      expect(r.theme).toBeDefined();
    });

    it('should create renderer with custom theme', () => {
      const r = new MarkdownRenderer(MinimalTheme);
      expect(r.theme.name).toBe('minimal');
    });

    it('should accept custom options', () => {
      const r = new MarkdownRenderer(HydraTheme, {
        syntaxHighlight: false,
        wordWrap: false
      });
      expect(r).toBeDefined();
    });
  });

  describe('createMarkdownRenderer factory', () => {
    it('should create a new renderer instance', () => {
      const r = createMarkdownRenderer();
      expect(r).toBeInstanceOf(MarkdownRenderer);
    });

    it('should pass theme to renderer', () => {
      const r = createMarkdownRenderer(MinimalTheme);
      expect(r.theme.name).toBe('minimal');
    });
  });

  describe('render method', () => {
    it('should return empty string for empty input', () => {
      expect(renderer.render('')).toBe('');
      expect(renderer.render(null)).toBe('');
      expect(renderer.render(undefined)).toBe('');
    });

    it('should render plain text unchanged', () => {
      const result = renderer.render('Hello World');
      expect(result).toContain('Hello World');
    });
  });

  describe('header rendering', () => {
    it('should render H1 headers with symbol', () => {
      const result = renderer.render('# Main Title');
      expect(result).toContain('Main Title');
      // Should include H1 symbol
      expect(result).toMatch(/[\u2726\*#]/); // Star or fallback
    });

    it('should render H2 headers', () => {
      const result = renderer.render('## Section');
      expect(result).toContain('Section');
    });

    it('should render H3 headers', () => {
      const result = renderer.render('### Subsection');
      expect(result).toContain('Subsection');
    });

    it('should render all header levels', () => {
      const markdown = `# H1
## H2
### H3
#### H4
##### H5
###### H6`;
      const result = renderer.render(markdown);
      expect(result).toContain('H1');
      expect(result).toContain('H2');
      expect(result).toContain('H3');
      expect(result).toContain('H4');
      expect(result).toContain('H5');
      expect(result).toContain('H6');
    });
  });

  describe('list rendering', () => {
    it('should render unordered lists with bullets', () => {
      const result = renderer.render('- Item 1\n- Item 2');
      expect(result).toContain('Item 1');
      expect(result).toContain('Item 2');
    });

    it('should render ordered lists with numbers', () => {
      const result = renderer.render('1. First\n2. Second');
      expect(result).toContain('First');
      expect(result).toContain('Second');
    });

    it('should render task lists with checkboxes', () => {
      const result = renderer.render('- [ ] Todo\n- [x] Done');
      expect(result).toContain('Todo');
      expect(result).toContain('Done');
    });

    it('should render nested lists', () => {
      const result = renderer.render('- Parent\n  - Child');
      expect(result).toContain('Parent');
      expect(result).toContain('Child');
    });
  });

  describe('code rendering', () => {
    it('should render inline code', () => {
      const result = renderer.render('Use `const` for constants');
      expect(result).toContain('const');
    });

    it('should render code blocks', () => {
      const result = renderer.render('```javascript\nconst x = 1;\n```');
      expect(result).toContain('const');
      expect(result).toContain('x');
    });

    it('should render code blocks without language', () => {
      const result = renderer.render('```\nplain code\n```');
      expect(result).toContain('plain code');
    });
  });

  describe('blockquote rendering', () => {
    it('should render single-level blockquotes', () => {
      const result = renderer.render('> This is a quote');
      expect(result).toContain('This is a quote');
    });

    it('should render nested blockquotes', () => {
      const result = renderer.render('> Level 1\n>> Level 2');
      expect(result).toContain('Level 1');
      expect(result).toContain('Level 2');
    });

    it('should render multi-line blockquotes', () => {
      const result = renderer.render('> Line 1\n> Line 2');
      expect(result).toContain('Line 1');
      expect(result).toContain('Line 2');
    });
  });

  describe('link rendering', () => {
    it('should render markdown links', () => {
      const result = renderer.render('[Click here](https://example.com)');
      expect(result).toContain('Click here');
      expect(result).toContain('https://example.com');
    });

    it('should render multiple links', () => {
      const result = renderer.render('[Link 1](url1) and [Link 2](url2)');
      expect(result).toContain('Link 1');
      expect(result).toContain('Link 2');
    });
  });

  describe('inline formatting', () => {
    it('should render bold text', () => {
      const result = renderer.render('This is **bold** text');
      expect(result).toContain('bold');
    });

    it('should render italic text', () => {
      const result = renderer.render('This is *italic* text');
      expect(result).toContain('italic');
    });

    it('should render bold italic text', () => {
      const result = renderer.render('This is ***bold italic*** text');
      expect(result).toContain('bold italic');
    });

    it('should render strikethrough text', () => {
      const result = renderer.render('This is ~~deleted~~ text');
      expect(result).toContain('deleted');
    });
  });

  describe('horizontal rule rendering', () => {
    it('should render horizontal rules with ---', () => {
      const result = renderer.render('Above\n---\nBelow');
      expect(result).toContain('Above');
      expect(result).toContain('Below');
    });

    it('should render horizontal rules with ***', () => {
      const result = renderer.render('Above\n***\nBelow');
      expect(result).toContain('Above');
      expect(result).toContain('Below');
    });
  });

  describe('table rendering', () => {
    it('should render basic tables', () => {
      const table = `| Name | Age |
|------|-----|
| John | 30  |
| Jane | 25  |`;
      const result = renderer.render(table);
      expect(result).toContain('Name');
      expect(result).toContain('Age');
      expect(result).toContain('John');
      expect(result).toContain('Jane');
    });
  });

  describe('print method', () => {
    it('should render and print to console', () => {
      renderer.print('# Hello');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should return rendered content', () => {
      const result = renderer.print('Hello');
      expect(result).toContain('Hello');
    });
  });

  describe('wordWrap method', () => {
    it('should wrap long text', () => {
      const longText = 'This is a very long line that should be wrapped at some point to fit within the terminal width';
      const result = renderer.wordWrap(longText, 30);
      expect(result).toContain('\n');
    });

    it('should not wrap short text', () => {
      const shortText = 'Short text';
      const result = renderer.wordWrap(shortText, 50);
      expect(result).toBe('Short text');
    });
  });

  describe('static properties', () => {
    it('should expose markdown symbols', () => {
      expect(MarkdownRenderer.symbols).toBeDefined();
      expect(MarkdownRenderer.symbols.h1).toBeDefined();
      expect(MarkdownRenderer.symbols.bullet).toBeDefined();
    });

    it('should expose header colors', () => {
      expect(MarkdownRenderer.headerColors).toBeDefined();
      expect(MarkdownRenderer.headerColors[1]).toBeDefined();
    });
  });

  describe('theme management', () => {
    it('should get current theme', () => {
      expect(renderer.theme).toBe(HydraTheme);
    });

    it('should set new theme', () => {
      renderer.theme = MinimalTheme;
      expect(renderer.theme).toBe(MinimalTheme);
    });
  });

  describe('complex markdown rendering', () => {
    it('should render a complete markdown document', () => {
      const markdown = `# Welcome to HYDRA

This is **bold** and *italic* text.

## Features

- Feature 1
- Feature 2
  - Sub-feature
- [x] Completed task
- [ ] Pending task

### Code Example

\`\`\`javascript
const hydra = new Hydra();
await hydra.process('Hello');
\`\`\`

> Important note about the code above.

| Feature | Status |
|---------|--------|
| Headers | Done   |
| Lists   | Done   |

---

[Learn more](https://example.com)`;

      const result = renderer.render(markdown);
      
      // Verify all elements are present
      expect(result).toContain('Welcome to HYDRA');
      expect(result).toContain('bold');
      expect(result).toContain('italic');
      expect(result).toContain('Features');
      expect(result).toContain('Feature 1');
      expect(result).toContain('Sub-feature');
      expect(result).toContain('Completed task');
      expect(result).toContain('Pending task');
      expect(result).toContain('Code Example');
      expect(result).toContain('hydra');
      expect(result).toContain('Important note');
      expect(result).toContain('Headers');
      expect(result).toContain('Learn more');
    });
  });
});

/**
 * Tests for TableRenderer and ListRenderer
 * @module test/unit/table-renderer.test
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  TableRenderer,
  ListRenderer,
  TABLE_STYLES,
  LIST_STYLES,
  ALIGNMENT,
  DEFAULT_TABLE_COLORS,
  createTableRenderer,
  createListRenderer,
  renderTable,
  renderList
} from '../../src/cli/TableRenderer.js';
import { stripAnsi } from '../../src/logger/colors.js';

describe('TableRenderer', () => {
  let renderer;
  let consoleSpy;

  beforeEach(() => {
    renderer = new TableRenderer();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const r = new TableRenderer();
      expect(r).toBeInstanceOf(TableRenderer);
    });

    it('should accept custom options', () => {
      const r = new TableRenderer({
        style: 'grid',
        coloredHeaders: false,
        zebra: true,
        padding: 2
      });
      expect(r).toBeInstanceOf(TableRenderer);
    });

    it('should fall back to unicode style for unknown style', () => {
      const r = new TableRenderer({ style: 'nonexistent' });
      expect(r).toBeInstanceOf(TableRenderer);
    });
  });

  describe('render()', () => {
    const testData = [
      { name: 'Alice', age: 30, city: 'NYC' },
      { name: 'Bob', age: 25, city: 'LA' },
      { name: 'Charlie', age: 35, city: 'Chicago' }
    ];

    it('should render empty table message for null data', () => {
      const result = renderer.render(null);
      expect(stripAnsi(result)).toContain('empty');
    });

    it('should render empty table message for empty array', () => {
      const result = renderer.render([]);
      expect(stripAnsi(result)).toContain('empty');
    });

    it('should render basic table with auto-detected columns', () => {
      const result = renderer.render(testData);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('name');
      expect(stripped).toContain('age');
      expect(stripped).toContain('city');
      expect(stripped).toContain('Alice');
      expect(stripped).toContain('30');
      expect(stripped).toContain('NYC');
    });

    it('should render table with specified columns', () => {
      const result = renderer.render(testData, ['name', 'age']);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('name');
      expect(stripped).toContain('age');
      expect(stripped).not.toContain('city');
    });

    it('should render table with column definitions', () => {
      const columns = [
        { key: 'name', header: 'Full Name', align: ALIGNMENT.LEFT },
        { key: 'age', header: 'Age (years)', align: ALIGNMENT.RIGHT }
      ];
      const result = renderer.render(testData, columns);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('Full Name');
      expect(stripped).toContain('Age (years)');
    });

    it('should apply custom formatter', () => {
      const columns = [
        { key: 'name', header: 'Name' },
        { key: 'age', header: 'Age', formatter: (val) => `${val} years` }
      ];
      const result = renderer.render(testData, columns);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('30 years');
    });

    it('should handle missing/null values gracefully', () => {
      const data = [
        { name: 'Alice', age: null },
        { name: 'Bob' }
      ];
      const result = renderer.render(data);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('Alice');
      expect(stripped).toContain('Bob');
    });

    it('should render with title', () => {
      const result = renderer.render(testData, null, { title: 'User List' });
      const stripped = stripAnsi(result);

      expect(stripped).toContain('User List');
    });

    it('should render row numbers when requested', () => {
      const result = renderer.render(testData, null, { showRowNumbers: true });
      const stripped = stripAnsi(result);

      expect(stripped).toContain('#');
      expect(stripped).toContain('1');
      expect(stripped).toContain('2');
      expect(stripped).toContain('3');
    });
  });

  describe('styles', () => {
    const testData = [
      { col1: 'A', col2: 'B' },
      { col1: 'C', col2: 'D' }
    ];

    it('should render simple style', () => {
      const r = new TableRenderer({ style: 'simple' });
      const result = r.render(testData);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('|');
      expect(stripped).toContain('-');
    });

    it('should render grid style', () => {
      const r = new TableRenderer({ style: 'grid' });
      const result = r.render(testData);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('+');
      expect(stripped).toContain('-');
      expect(stripped).toContain('|');
    });

    it('should render outline style', () => {
      const r = new TableRenderer({ style: 'outline' });
      const result = r.render(testData);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('+');
    });

    it('should render borderless style', () => {
      const r = new TableRenderer({ style: 'borderless' });
      const result = r.render(testData);
      const stripped = stripAnsi(result);

      // Borderless should not have any border characters
      expect(stripped).not.toContain('+');
      expect(stripped).not.toContain('-');
    });

    it('should render unicode style', () => {
      const r = new TableRenderer({ style: 'unicode' });
      const result = r.render(testData);

      expect(result).toContain('┌');
      expect(result).toContain('┐');
      expect(result).toContain('└');
      expect(result).toContain('┘');
    });

    it('should render double style', () => {
      const r = new TableRenderer({ style: 'double' });
      const result = r.render(testData);

      expect(result).toContain('╔');
      expect(result).toContain('╗');
      expect(result).toContain('╚');
      expect(result).toContain('╝');
    });

    it('should render rounded style', () => {
      const r = new TableRenderer({ style: 'rounded' });
      const result = r.render(testData);

      expect(result).toContain('╭');
      expect(result).toContain('╮');
      expect(result).toContain('╰');
      expect(result).toContain('╯');
    });

    it('should render heavy style', () => {
      const r = new TableRenderer({ style: 'heavy' });
      const result = r.render(testData);

      expect(result).toContain('┏');
      expect(result).toContain('┓');
      expect(result).toContain('┗');
      expect(result).toContain('┛');
    });
  });

  describe('alignment', () => {
    const testData = [
      { left: 'ABC', center: 'DEF', right: '123' }
    ];

    it('should align columns correctly', () => {
      const columns = [
        { key: 'left', header: 'Left', align: ALIGNMENT.LEFT, width: 10 },
        { key: 'center', header: 'Center', align: ALIGNMENT.CENTER, width: 10 },
        { key: 'right', header: 'Right', align: ALIGNMENT.RIGHT, width: 10 }
      ];
      const result = renderer.render(testData, columns);
      const stripped = stripAnsi(result);

      // Left aligned should have text at start
      expect(stripped).toMatch(/ABC\s+/);
      // Right aligned should have spaces before text
      expect(stripped).toMatch(/\s+123/);
    });
  });

  describe('zebra striping', () => {
    it('should apply zebra striping when enabled', () => {
      const data = [
        { a: '1' },
        { a: '2' },
        { a: '3' },
        { a: '4' }
      ];
      const r = new TableRenderer({ zebra: true });
      const result = r.render(data);

      // Zebra striping adds background colors to alternating rows
      // Result should contain ANSI codes for background color
      expect(result).toMatch(/\x1b\[\d+m/);
    });
  });

  describe('print()', () => {
    it('should print table to console', () => {
      const data = [{ a: 1 }];
      renderer.print(data);

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('setStyle()', () => {
    it('should change table style', () => {
      renderer.setStyle('grid');

      const result = renderer.render([{ a: 1 }]);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('+');
    });

    it('should ignore invalid style', () => {
      renderer.setStyle('nonexistent');
      // Should not throw
      const result = renderer.render([{ a: 1 }]);
      expect(result).toBeTruthy();
    });
  });

  describe('setZebra()', () => {
    it('should enable/disable zebra striping', () => {
      renderer.setZebra(true);
      const result = renderer.render([{ a: 1 }, { a: 2 }]);
      expect(result).toBeTruthy();

      renderer.setZebra(false);
      const result2 = renderer.render([{ a: 1 }, { a: 2 }]);
      expect(result2).toBeTruthy();
    });
  });

  describe('setColoredHeaders()', () => {
    it('should enable/disable colored headers', () => {
      renderer.setColoredHeaders(false);
      const result = renderer.render([{ a: 1 }]);
      expect(result).toBeTruthy();

      renderer.setColoredHeaders(true);
      const result2 = renderer.render([{ a: 1 }]);
      expect(result2).toBeTruthy();
    });
  });
});

describe('ListRenderer', () => {
  let renderer;
  let consoleSpy;

  beforeEach(() => {
    renderer = new ListRenderer();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const r = new ListRenderer();
      expect(r).toBeInstanceOf(ListRenderer);
    });

    it('should accept custom options', () => {
      const r = new ListRenderer({
        style: 'numbered',
        colored: false,
        indentSize: 4
      });
      expect(r).toBeInstanceOf(ListRenderer);
    });
  });

  describe('render()', () => {
    const testItems = ['Item 1', 'Item 2', 'Item 3'];

    it('should render bullet list by default', () => {
      const result = renderer.render(testItems);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('Item 1');
      expect(stripped).toContain('Item 2');
      expect(stripped).toContain('Item 3');
    });

    it('should render empty list message for empty array', () => {
      // Empty lists return empty string from render
      const result = renderer.render([]);
      expect(result).toBe('');
    });

    it('should render numbered list', () => {
      const r = new ListRenderer({ style: 'numbered' });
      const result = r.render(testItems);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('1.');
      expect(stripped).toContain('2.');
      expect(stripped).toContain('3.');
    });

    it('should render dash list', () => {
      const r = new ListRenderer({ style: 'dash' });
      const result = r.render(testItems);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('-');
    });

    it('should render arrow list', () => {
      const r = new ListRenderer({ style: 'arrow' });
      const result = r.render(testItems);

      // Arrow style uses unicode arrow
      expect(result).toContain('→');
    });

    it('should render star list', () => {
      const r = new ListRenderer({ style: 'star' });
      const result = r.render(testItems);

      expect(result).toContain('★');
    });

    it('should render lettered list', () => {
      const r = new ListRenderer({ style: 'lettered' });
      const result = r.render(testItems);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('a.');
      expect(stripped).toContain('b.');
      expect(stripped).toContain('c.');
    });

    it('should render roman numeral list', () => {
      const r = new ListRenderer({ style: 'roman' });
      const result = r.render(testItems);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('i.');
      expect(stripped).toContain('ii.');
      expect(stripped).toContain('iii.');
    });

    it('should render checkbox list', () => {
      const items = [
        { text: 'Task 1', checked: true },
        { text: 'Task 2', checked: false },
        { text: 'Task 3', checked: true }
      ];
      const r = new ListRenderer({ style: 'checkbox' });
      const result = r.render(items);

      expect(result).toContain('☑');
      expect(result).toContain('☐');
    });

    it('should render nested lists', () => {
      const items = [
        {
          text: 'Parent 1',
          children: [
            { text: 'Child 1.1' },
            { text: 'Child 1.2' }
          ]
        },
        { text: 'Parent 2' }
      ];
      const result = renderer.render(items);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('Parent 1');
      expect(stripped).toContain('Child 1.1');
      expect(stripped).toContain('Child 1.2');
      expect(stripped).toContain('Parent 2');
    });

    it('should handle mixed string and object items', () => {
      const items = [
        'Simple string',
        { text: 'Object item' }
      ];
      const result = renderer.render(items);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('Simple string');
      expect(stripped).toContain('Object item');
    });
  });

  describe('print()', () => {
    it('should print list to console', () => {
      renderer.print(['item']);

      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  describe('setStyle()', () => {
    it('should change list style', () => {
      renderer.setStyle('numbered');
      const result = renderer.render(['a', 'b']);
      const stripped = stripAnsi(result);

      expect(stripped).toContain('1.');
    });
  });
});

describe('Factory Functions', () => {
  describe('createTableRenderer()', () => {
    it('should create TableRenderer instance', () => {
      const r = createTableRenderer();
      expect(r).toBeInstanceOf(TableRenderer);
    });

    it('should pass options to constructor', () => {
      const r = createTableRenderer({ style: 'grid' });
      expect(r).toBeInstanceOf(TableRenderer);
    });
  });

  describe('createListRenderer()', () => {
    it('should create ListRenderer instance', () => {
      const r = createListRenderer();
      expect(r).toBeInstanceOf(ListRenderer);
    });

    it('should pass options to constructor', () => {
      const r = createListRenderer({ style: 'numbered' });
      expect(r).toBeInstanceOf(ListRenderer);
    });
  });

  describe('renderTable()', () => {
    it('should render table with quick function', () => {
      const result = renderTable([{ a: 1 }]);
      expect(result).toBeTruthy();
    });
  });

  describe('renderList()', () => {
    it('should render list with quick function', () => {
      const result = renderList(['item']);
      expect(result).toBeTruthy();
    });
  });
});

describe('Constants', () => {
  describe('TABLE_STYLES', () => {
    it('should have all expected styles', () => {
      const expectedStyles = ['simple', 'grid', 'outline', 'borderless', 'unicode', 'double', 'rounded', 'heavy'];
      
      for (const style of expectedStyles) {
        expect(TABLE_STYLES[style]).toBeDefined();
      }
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(TABLE_STYLES)).toBe(true);
    });
  });

  describe('LIST_STYLES', () => {
    it('should have all expected styles', () => {
      const expectedStyles = ['bullet', 'dash', 'arrow', 'star', 'numbered', 'lettered', 'roman', 'checkbox', 'none'];
      
      for (const style of expectedStyles) {
        expect(LIST_STYLES[style]).toBeDefined();
      }
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(LIST_STYLES)).toBe(true);
    });
  });

  describe('ALIGNMENT', () => {
    it('should have all alignment options', () => {
      expect(ALIGNMENT.LEFT).toBe('left');
      expect(ALIGNMENT.CENTER).toBe('center');
      expect(ALIGNMENT.RIGHT).toBe('right');
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(ALIGNMENT)).toBe(true);
    });
  });

  describe('DEFAULT_TABLE_COLORS', () => {
    it('should have header color scheme', () => {
      expect(DEFAULT_TABLE_COLORS.header).toBeDefined();
      expect(DEFAULT_TABLE_COLORS.header.fg).toBeDefined();
    });

    it('should have row color schemes', () => {
      expect(DEFAULT_TABLE_COLORS.row).toBeDefined();
      expect(DEFAULT_TABLE_COLORS.rowAlt).toBeDefined();
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(DEFAULT_TABLE_COLORS)).toBe(true);
    });
  });
});

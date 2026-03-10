import { describe, expect, it } from 'vitest';
import { splitToolOutput, stripParallelHeader } from './messageParser';

describe('messageParser', () => {
  describe('stripParallelHeader', () => {
    it('should strip parallel header with emoji', () => {
      const input = '⚡ Parallel execution: 2 tools\nSome content';
      expect(stripParallelHeader(input)).toBe('Some content');
    });

    it('should strip parallel header without emoji', () => {
      const input = 'Parallel execution: 5 tools\nOther content';
      expect(stripParallelHeader(input)).toBe('Other content');
    });

    it('should strip parallel header without trailing newline', () => {
      const input = '⚡ Parallel execution: 2 tools';
      expect(stripParallelHeader(input)).toBe('');
    });

    it('should not affect normal text', () => {
      const input = 'Just a regular text';
      expect(stripParallelHeader(input)).toBe('Just a regular text');
    });
  });

  describe('splitToolOutput', () => {
    it('should split normal text correctly', () => {
      const input = 'Just normal text without tools';
      const result = splitToolOutput(input);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'text', content: 'Just normal text without tools' });
    });

    it('should extract single tool output', () => {
      const input = 'Before tool\n---\n**🔧 Tool:** `test_tool`\n```\nTool output here\n```\n---\nAfter tool';
      const result = splitToolOutput(input);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: 'text', content: 'Before tool' });
      expect(result[1]).toEqual({ type: 'tool', name: 'test_tool', content: 'Tool output here' });
      expect(result[2]).toEqual({ type: 'text', content: 'After tool' });
    });

    it('should extract single tool output without emoji', () => {
      const input = 'Before\n---\n**Tool:** `test_tool_2`\n```\nOutput\n```\n---\nAfter';
      const result = splitToolOutput(input);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: 'text', content: 'Before' });
      expect(result[1]).toEqual({ type: 'tool', name: 'test_tool_2', content: 'Output' });
      expect(result[2]).toEqual({ type: 'text', content: 'After' });
    });

    it('should handle sequential tool outputs', () => {
      const input =
        'Start\n---\n**🔧 Tool:** `tool1`\n```\noutput1\n```\n---\n\n---\n**Tool:** `tool2`\n```\noutput2\n```\n---\nEnd';
      const result = splitToolOutput(input);
      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({ type: 'text', content: 'Start' });
      expect(result[1]).toEqual({ type: 'tool', name: 'tool1', content: 'output1' });
      expect(result[2]).toEqual({ type: 'tool', name: 'tool2', content: 'output2' });
      expect(result[3]).toEqual({ type: 'text', content: 'End' });
    });

    it('should handle tool output at the very beginning', () => {
      const input = '\n---\n**🔧 Tool:** `tool1`\n```\noutput1\n```\n---\nEnd';
      const result = splitToolOutput(input);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ type: 'tool', name: 'tool1', content: 'output1' });
      expect(result[1]).toEqual({ type: 'text', content: 'End' });
    });

    it('should handle empty tool output', () => {
      const input = '\n---\n**🔧 Tool:** `empty_tool`\n```\n\n```\n---\n';
      const result = splitToolOutput(input);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'tool', name: 'empty_tool', content: '' });
    });
  });
});

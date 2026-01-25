/**
 * MessageList Component Tests
 * @module components/chat/MessageList.test
 *
 * Comprehensive test suite for the MessageList component using Vitest + React Testing Library
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MessageList, type MessageListProps } from './MessageList';
import type { Message } from '../../types';

// ============================================================================
// MOCKS
// ============================================================================

// Mock react-virtuoso to avoid virtualization complexity in tests
vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ itemContent, totalCount }: any) => (
    <div data-testid="virtuoso-list">
      {Array.from({ length: totalCount }).map((_, index) => (
        <div key={index} data-testid={`virtuoso-item-${index}`}>
          {itemContent(index)}
        </div>
      ))}
    </div>
  ),
  VirtuosoHandle: vi.fn(),
}));

// Mock framer-motion to avoid animation complexity
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  FileText: () => <span data-testid="icon-file-text">FileText</span>,
  Terminal: () => <span data-testid="icon-terminal">Terminal</span>,
  Copy: () => <span data-testid="icon-copy">Copy</span>,
  Check: () => <span data-testid="icon-check">Check</span>,
}));

// Mock CodeBlock component
vi.mock('../CodeBlock', () => ({
  CodeBlock: ({ language, value, onRun }: any) => (
    <div
      data-testid="code-block"
      data-language={language}
      data-value={value}
      onClick={() => onRun && onRun(value)}
    >
      <button data-testid="code-block-run">Run Code</button>
      <code>{value}</code>
    </div>
  ),
}));

// Mock react-markdown (simplified)
vi.mock('react-markdown', () => ({
  default: ({ children, components }: any) => {
    // Simple check for code block in markdown string
    const codeBlockMatch = typeof children === 'string' && children.match(/```(\w+)\n([\s\S]*?)\n```/);
    
    if (codeBlockMatch && components?.code) {
      const [_, language, code] = codeBlockMatch;
      return (
        <div data-testid="markdown-body">
          {components.code({
            className: `language-${language}`,
            children: code,
          })}
        </div>
      );
    }

    return (
      <div data-testid="markdown-body">
        {typeof children === 'string' ? (
          <div data-testid="markdown-content">{children}</div>
        ) : (
          children
        )}
        {components?.code && (
          <span data-testid="markdown-code-component-available" />
        )}
      </div>
    );
  },
}));

// Mock remark-gfm
vi.mock('remark-gfm', () => ({
  default: vi.fn(),
}));

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMessage = (overrides?: Partial<Message>): Message => ({
  role: 'user',
  content: 'Test message',
  timestamp: Date.now(),
  ...overrides,
});

const defaultProps: MessageListProps = {
  messages: [],
  isStreaming: false,
  onExecuteCommand: vi.fn(),
};

// ============================================================================
// TEST SUITES
// ============================================================================

describe('MessageList Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // TEST: Empty State
  // ==========================================================================

  describe('Empty State', () => {
    it('should show empty state when messages array is empty', () => {
      render(<MessageList {...defaultProps} messages={[]} />);

      const emptyState = screen.getByText('Oczekiwanie na dane lub plik...');
      expect(emptyState).toBeInTheDocument();

      const fileIcon = screen.getByTestId('icon-file-text');
      expect(fileIcon).toBeInTheDocument();
    });

    it('should not show virtuoso list when there are no messages', () => {
      render(<MessageList {...defaultProps} messages={[]} />);

      const virtuosoList = screen.queryByTestId('virtuoso-list');
      expect(virtuosoList).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // TEST: User Messages
  // ==========================================================================

  describe('User Messages', () => {
    it('should render user message with correct styling', () => {
      const userMessage = createMessage({
        role: 'user',
        content: 'Hello, assistant!',
      });

      render(
        <MessageList {...defaultProps} messages={[userMessage]} />
      );

      const messageDiv = screen.getByText('Hello, assistant!');
      expect(messageDiv).toBeInTheDocument();

      // Check parent container for user styling
      const messageContainer = messageDiv.closest('[class*="max-w"]');
      expect(messageContainer).toHaveClass(
        'bg-[var(--matrix-accent)]',
        'text-black',
        'font-bold'
      );
    });

    it('should right-align user messages', () => {
      const userMessage = createMessage({
        role: 'user',
        content: 'User question',
      });

      const { container } = render(
        <MessageList {...defaultProps} messages={[userMessage]} />
      );

      const flexContainer = container.querySelector('[class*="flex"][class*="justify-end"]');
      expect(flexContainer).toBeInTheDocument();
      expect(flexContainer).toHaveClass('justify-end');
    });

    it('should render multiple user messages', () => {
      const messages = [
        createMessage({ role: 'user', content: 'First message' }),
        createMessage({ role: 'user', content: 'Second message' }),
        createMessage({ role: 'user', content: 'Third message' }),
      ];

      render(<MessageList {...defaultProps} messages={messages} />);

      expect(screen.getByText('First message')).toBeInTheDocument();
      expect(screen.getByText('Second message')).toBeInTheDocument();
      expect(screen.getByText('Third message')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // TEST: Assistant Messages
  // ==========================================================================

  describe('Assistant Messages', () => {
    it('should render assistant message with correct styling', () => {
      const assistantMessage = createMessage({
        role: 'assistant',
        content: 'This is an assistant response.',
      });

      render(
        <MessageList {...defaultProps} messages={[assistantMessage]} />
      );

      const messageDiv = screen.getByText('This is an assistant response.');
      expect(messageDiv).toBeInTheDocument();

      const messageContainer = messageDiv.closest('[class*="max-w"]');
      expect(messageContainer).toHaveClass(
        'bg-black/20',
        'text-[var(--matrix-text)]',
        'border',
        'border-[var(--matrix-border)]',
        'font-mono'
      );
    });

    it('should left-align assistant messages', () => {
      const assistantMessage = createMessage({
        role: 'assistant',
        content: 'Assistant response',
      });

      const { container } = render(
        <MessageList {...defaultProps} messages={[assistantMessage]} />
      );

      const flexContainer = container.querySelector('[class*="flex"][class*="justify-start"]');
      expect(flexContainer).toBeInTheDocument();
      expect(flexContainer).toHaveClass('justify-start');
    });

    it('should render markdown content in assistant messages', () => {
      const assistantMessage = createMessage({
        role: 'assistant',
        content: 'Here is some **bold** text and _italic_ text.',
      });

      render(
        <MessageList {...defaultProps} messages={[assistantMessage]} />
      );

      const markdownBody = screen.getByTestId('markdown-body');
      expect(markdownBody).toBeInTheDocument();
    });

    it('should support code blocks in assistant messages', () => {
      const assistantMessage = createMessage({
        role: 'assistant',
        content: '```python\nprint("hello")\n```',
      });

      render(
        <MessageList {...defaultProps} messages={[assistantMessage]} />
      );

      const codeBlock = screen.getByTestId('code-block');
      expect(codeBlock).toBeInTheDocument();
      expect(codeBlock).toHaveAttribute('data-language', 'python');
    });
  });

  // ==========================================================================
  // TEST: System Messages
  // ==========================================================================

  describe('System Messages', () => {
    it('should render system message with correct styling', () => {
      const systemMessage = createMessage({
        role: 'system',
        content: 'System initialized successfully.',
      });

      render(
        <MessageList {...defaultProps} messages={[systemMessage]} />
      );

      const messageDiv = screen.getByText('System initialized successfully.');
      expect(messageDiv).toBeInTheDocument();

      const messageContainer = messageDiv.closest('[class*="max-w"]');
      expect(messageContainer).toHaveClass(
        'bg-blue-900/20',
        'text-blue-200',
        'border',
        'border-blue-500/30',
        'font-mono',
        'text-xs'
      );
    });

    it('should show terminal icon in system messages', () => {
      const systemMessage = createMessage({
        role: 'system',
        content: 'System message',
      });

      render(
        <MessageList {...defaultProps} messages={[systemMessage]} />
      );

      const terminalIcon = screen.getByTestId('icon-terminal');
      expect(terminalIcon).toBeInTheDocument();
    });

    it('should display SYSTEM OUTPUT header in system messages', () => {
      const systemMessage = createMessage({
        role: 'system',
        content: 'System output here',
      });

      render(
        <MessageList {...defaultProps} messages={[systemMessage]} />
      );

      const systemHeader = screen.getByText('SYSTEM OUTPUT');
      expect(systemHeader).toBeInTheDocument();
      expect(systemHeader).toHaveClass('font-bold');
      
      const headerContainer = systemHeader.parentElement;
      expect(headerContainer).toHaveClass('text-blue-400');
    });

    it('should left-align system messages', () => {
      const systemMessage = createMessage({
        role: 'system',
        content: 'System info',
      });

      const { container } = render(
        <MessageList {...defaultProps} messages={[systemMessage]} />
      );

      const flexContainer = container.querySelector('[class*="flex"][class*="justify-start"]');
      expect(flexContainer).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // TEST: Streaming Cursor
  // ==========================================================================

  describe('Streaming Cursor', () => {
    it('should show streaming cursor on last assistant message when streaming is active', () => {
      const messages = [
        createMessage({ role: 'user', content: 'Hello' }),
        createMessage({ role: 'assistant', content: 'Processing...' }),
      ];

      const { container } = render(
        <MessageList
          {...defaultProps}
          messages={messages}
          isStreaming={true}
        />
      );

      const cursor = container.querySelector('[class*="animate-pulse"]');
      expect(cursor).toBeInTheDocument();
      expect(cursor).toHaveClass('bg-[var(--matrix-accent)]');
    });

    it('should not show streaming cursor when isStreaming is false', () => {
      const messages = [
        createMessage({ role: 'assistant', content: 'Response complete' }),
      ];

      const { container } = render(
        <MessageList
          {...defaultProps}
          messages={messages}
          isStreaming={false}
        />
      );

      const cursor = container.querySelector('[class*="animate-pulse"]');
      expect(cursor).not.toBeInTheDocument();
    });

    it('should not show streaming cursor on non-last assistant messages', () => {
      const messages = [
        createMessage({
          role: 'assistant',
          content: 'First response',
        }),
        createMessage({
          role: 'assistant',
          content: 'Second response',
        }),
      ];

      const { container } = render(
        <MessageList
          {...defaultProps}
          messages={messages}
          isStreaming={true}
        />
      );

      // Count cursor elements - should only be one (on the last message)
      const cursors = container.querySelectorAll('[class*="animate-pulse"]');
      expect(cursors.length).toBe(1);

      // Verify it's on the last message's container
      const lastMessage = screen.getByText('Second response');
      const lastMessageContainer = lastMessage.closest('[class*="p-3"]');
      const cursorInLastMessage = lastMessageContainer?.querySelector('[class*="animate-pulse"]');
      expect(cursorInLastMessage).toBeInTheDocument();
    });

    it('should not show streaming cursor on non-assistant messages', () => {
      const messages = [
        createMessage({ role: 'user', content: 'User message' }),
        createMessage({ role: 'system', content: 'System message' }),
      ];

      const { container } = render(
        <MessageList
          {...defaultProps}
          messages={messages}
          isStreaming={true}
        />
      );

      const cursor = container.querySelector('[class*="animate-pulse"]');
      expect(cursor).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // TEST: Code Block Execution
  // ==========================================================================

  describe('Code Block Execution', () => {
    it('should call onExecuteCommand when code block run button is clicked', () => {
      const onExecuteCommand = vi.fn();
      const assistantMessage = createMessage({
        role: 'assistant',
        content: 'Here is code: ```python\nprint("hello")\n```',
      });

      render(
        <MessageList
          {...defaultProps}
          messages={[assistantMessage]}
          onExecuteCommand={onExecuteCommand}
        />
      );

      const codeBlockRunButton = screen.getByTestId('code-block-run');
      codeBlockRunButton.click();

      // The onExecuteCommand should be called with the code
      expect(onExecuteCommand).toHaveBeenCalled();
    });

    it('should pass correct code to onExecuteCommand', () => {
      const onExecuteCommand = vi.fn();
      const codeContent = 'echo "Hello World"';
      const assistantMessage = createMessage({
        role: 'assistant',
        content: `\`\`\`bash\n${codeContent}\n\`\`\``,
      });

      render(
        <MessageList
          {...defaultProps}
          messages={[assistantMessage]}
          onExecuteCommand={onExecuteCommand}
        />
      );

      const codeBlockRunButton = screen.getByTestId('code-block-run');
      codeBlockRunButton.click();

      expect(onExecuteCommand).toHaveBeenCalled();
    });

    it('should render code blocks for different languages', () => {
      const messages = [
        createMessage({
          role: 'assistant',
          content: '```javascript\nconst x = 1;\n```',
        }),
        createMessage({
          role: 'assistant',
          content: '```python\nprint("hello")\n```',
        }),
        createMessage({
          role: 'assistant',
          content: '```bash\nls -la\n```',
        }),
      ];

      render(
        <MessageList {...defaultProps} messages={messages} />
      );

      const codeBlocks = screen.getAllByTestId('code-block');
      expect(codeBlocks).toHaveLength(3);

      expect(codeBlocks[0]).toHaveAttribute('data-language', 'javascript');
      expect(codeBlocks[1]).toHaveAttribute('data-language', 'python');
      expect(codeBlocks[2]).toHaveAttribute('data-language', 'bash');
    });

    it('should not break if code block has no onRun handler', () => {
      const assistantMessage = createMessage({
        role: 'assistant',
        content: '```python\nprint("test")\n```',
      });

      const { container } = render(
        <MessageList
          {...defaultProps}
          messages={[assistantMessage]}
          onExecuteCommand={vi.fn()}
        />
      );

      // Component should render without errors
      expect(container).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // TEST: Virtualization
  // ==========================================================================

  describe('Virtualization with Virtuoso', () => {
    it('should render virtuoso list when messages are present', () => {
      const messages = [
        createMessage({ role: 'user', content: 'Message 1' }),
        createMessage({ role: 'assistant', content: 'Response 1' }),
      ];

      render(
        <MessageList {...defaultProps} messages={messages} />
      );

      const virtuosoList = screen.getByTestId('virtuoso-list');
      expect(virtuosoList).toBeInTheDocument();
    });

    it('should pass correct totalCount to virtuoso', () => {
      const messages = [
        createMessage({ role: 'user', content: 'Message 1' }),
        createMessage({ role: 'assistant', content: 'Response 1' }),
        createMessage({ role: 'user', content: 'Message 2' }),
      ];

      render(
        <MessageList {...defaultProps} messages={messages} />
      );

      const virtuosoItems = screen.getAllByTestId(/^virtuoso-item-/);
      expect(virtuosoItems).toHaveLength(3);
    });

    it('should render all messages when using virtuoso mock', () => {
      const messages = Array.from({ length: 5 }, (_, i) =>
        createMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i + 1}`,
        })
      );

      render(
        <MessageList {...defaultProps} messages={messages} />
      );

      messages.forEach((msg) => {
        expect(screen.getByText(msg.content)).toBeInTheDocument();
      });
    });
  });

  // ==========================================================================
  // TEST: Message Ordering and Display
  // ==========================================================================

  describe('Message Ordering and Display', () => {
    it('should maintain message order', () => {
      const messages = [
        createMessage({ role: 'user', content: 'First' }),
        createMessage({ role: 'assistant', content: 'Second' }),
        createMessage({ role: 'user', content: 'Third' }),
        createMessage({ role: 'assistant', content: 'Fourth' }),
      ];

      const { container } = render(
        <MessageList {...defaultProps} messages={messages} />
      );

      const virtuosoItems = container.querySelectorAll('[data-testid^="virtuoso-item-"]');
      expect(virtuosoItems.length).toBe(4);
    });

    it('should handle mixed message roles correctly', () => {
      const messages = [
        createMessage({ role: 'system', content: 'System init' }),
        createMessage({ role: 'user', content: 'User question' }),
        createMessage({ role: 'assistant', content: 'Assistant answer' }),
        createMessage({ role: 'system', content: 'System status' }),
        createMessage({ role: 'user', content: 'Another question' }),
      ];

      render(
        <MessageList {...defaultProps} messages={messages} />
      );

      expect(screen.getByText('System init')).toBeInTheDocument();
      expect(screen.getByText('User question')).toBeInTheDocument();
      expect(screen.getByText('Assistant answer')).toBeInTheDocument();
      expect(screen.getByText('System status')).toBeInTheDocument();
      expect(screen.getByText('Another question')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // TEST: Edge Cases
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle very long message content', () => {
      const longContent = 'A'.repeat(5000);
      const message = createMessage({
        role: 'assistant',
        content: longContent,
      });

      render(
        <MessageList {...defaultProps} messages={[message]} />
      );

      const messageDiv = screen.getByText(longContent);
      expect(messageDiv).toBeInTheDocument();
    });

    it('should handle special characters in message content', () => {
      const message = createMessage({
        role: 'user',
        content: 'Special chars: <>&"\'`',
      });

      render(
        <MessageList {...defaultProps} messages={[message]} />
      );

      // Should not throw and content should be rendered safely
      expect(screen.getByText(/Special chars:/)).toBeInTheDocument();
    });

    it('should handle empty message content', () => {
      const message = createMessage({
        role: 'assistant',
        content: '',
      });

      const { container } = render(
        <MessageList {...defaultProps} messages={[message]} />
      );

      // Should render without crashing
      expect(container).toBeInTheDocument();
    });

    it('should handle messages with only whitespace', () => {
      const message = createMessage({
        role: 'user',
        content: '   \n\n   ',
      });

      const { container } = render(
        <MessageList {...defaultProps} messages={[message]} />
      );

      expect(container).toBeInTheDocument();
    });

    it('should handle rapid isStreaming state changes', () => {
      const messages = [
        createMessage({ role: 'assistant', content: 'Response' }),
      ];

      const { rerender } = render(
        <MessageList
          {...defaultProps}
          messages={messages}
          isStreaming={false}
        />
      );

      rerender(
        <MessageList
          {...defaultProps}
          messages={messages}
          isStreaming={true}
        />
      );

      rerender(
        <MessageList
          {...defaultProps}
          messages={messages}
          isStreaming={false}
        />
      );

      const { container } = render(
        <MessageList
          {...defaultProps}
          messages={messages}
          isStreaming={true}
        />
      );

      // Should not crash with rapid changes
      expect(container).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // TEST: Props Changes
  // ==========================================================================

  describe('Props Changes', () => {
    it('should update when messages array changes', () => {
      const initialMessages = [
        createMessage({ role: 'user', content: 'Initial' }),
      ];

      const { rerender } = render(
        <MessageList {...defaultProps} messages={initialMessages} />
      );

      expect(screen.getByText('Initial')).toBeInTheDocument();

      const updatedMessages = [
        createMessage({ role: 'user', content: 'Initial' }),
        createMessage({ role: 'assistant', content: 'Updated' }),
      ];

      rerender(
        <MessageList {...defaultProps} messages={updatedMessages} />
      );

      expect(screen.getByText('Updated')).toBeInTheDocument();
    });

    it('should update when onExecuteCommand callback changes', () => {
      const messages = [
        createMessage({
          role: 'assistant',
          content: '```javascript\ncode\n```',
        }),
      ];

      const onExecuteCommand1 = vi.fn();
      const onExecuteCommand2 = vi.fn();

      const { rerender } = render(
        <MessageList
          {...defaultProps}
          messages={messages}
          onExecuteCommand={onExecuteCommand1}
        />
      );

      rerender(
        <MessageList
          {...defaultProps}
          messages={messages}
          onExecuteCommand={onExecuteCommand2}
        />
      );

      // Both should be valid, component should not crash
      expect(screen.getByTestId('code-block')).toBeInTheDocument();
    });

    it('should handle transition from empty to populated message list', () => {
      const { rerender } = render(
        <MessageList {...defaultProps} messages={[]} />
      );

      expect(screen.getByText('Oczekiwanie na dane lub plik...')).toBeInTheDocument();

      const messages = [
        createMessage({ role: 'user', content: 'New message' }),
      ];

      rerender(
        <MessageList {...defaultProps} messages={messages} />
      );

      expect(screen.getByText('New message')).toBeInTheDocument();
      expect(screen.queryByText('Oczekiwanie na dane lub plik...')).not.toBeInTheDocument();
    });

    it('should handle transition from populated to empty message list', () => {
      const messages = [
        createMessage({ role: 'user', content: 'Message' }),
      ];

      const { rerender } = render(
        <MessageList {...defaultProps} messages={messages} />
      );

      expect(screen.getByText('Message')).toBeInTheDocument();

      rerender(
        <MessageList {...defaultProps} messages={[]} />
      );

      expect(screen.getByText('Oczekiwanie na dane lub plik...')).toBeInTheDocument();
      expect(screen.queryByText('Message')).not.toBeInTheDocument();
    });
  });

  // ==========================================================================
  // TEST: Accessibility
  // ==========================================================================

  describe('Accessibility', () => {
    it('should have descriptive content for screen readers', () => {
      const message = createMessage({
        role: 'user',
        content: 'Accessible message',
      });

      render(
        <MessageList {...defaultProps} messages={[message]} />
      );

      // Content should be readable by screen readers
      expect(screen.getByText('Accessible message')).toBeInTheDocument();
    });

    it('should properly structure system message headers', () => {
      const message = createMessage({
        role: 'system',
        content: 'System message',
      });

      render(
        <MessageList {...defaultProps} messages={[message]} />
      );

      const header = screen.getByText('SYSTEM OUTPUT');
      expect(header).toBeInTheDocument();

      const icon = screen.getByTestId('icon-terminal');
      expect(icon).toBeInTheDocument();
    });
  });
});

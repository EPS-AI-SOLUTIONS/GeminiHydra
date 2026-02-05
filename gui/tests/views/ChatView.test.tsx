/**
 * ChatView Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatView } from '../../src/views/ChatView';
import { createMockAppState, type MockAppState } from '../mocks/store';

// Mock framer-motion
vi.mock('framer-motion', async () => {
  const actual = await import('../mocks/framer-motion');
  return actual;
});

// Create mock state
let mockState: MockAppState;

// Mock zustand store
vi.mock('../../src/stores/appStore', () => ({
  useAppStore: vi.fn((selector) => {
    if (selector) return selector(mockState);
    return mockState;
  }),
}));

describe('ChatView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = createMockAppState();
  });

  describe('empty state', () => {
    it('shows welcome message when no messages', () => {
      render(<ChatView />);
      expect(screen.getByText('Witaj w GeminiHydra')).toBeInTheDocument();
    });

    it('shows description text', () => {
      render(<ChatView />);
      expect(screen.getByText(/System multi-agentowy/)).toBeInTheDocument();
    });
  });

  describe('with messages', () => {
    beforeEach(() => {
      mockState = createMockAppState({
        messages: [
          {
            id: '1',
            role: 'user',
            content: 'Hello there',
            timestamp: new Date(),
          },
          {
            id: '2',
            role: 'assistant',
            content: 'Hi! How can I help?',
            agent: 'geralt',
            timestamp: new Date(),
            tokens: 150,
          },
        ],
      });
    });

    it('renders user messages', () => {
      render(<ChatView />);
      expect(screen.getByText('Hello there')).toBeInTheDocument();
    });

    it('renders assistant messages', () => {
      render(<ChatView />);
      expect(screen.getByText('Hi! How can I help?')).toBeInTheDocument();
    });

    it('shows agent badge for assistant messages', () => {
      render(<ChatView />);
      expect(screen.getByText('geralt')).toBeInTheDocument();
    });

    it('hides welcome message when messages exist', () => {
      render(<ChatView />);
      expect(screen.queryByText('Witaj w GeminiHydra')).not.toBeInTheDocument();
    });
  });

  describe('input handling', () => {
    it('renders input textarea', () => {
      render(<ChatView />);
      expect(screen.getByPlaceholderText(/Napisz wiadomość/)).toBeInTheDocument();
    });

    it('handles text input', () => {
      render(<ChatView />);
      const textarea = screen.getByPlaceholderText(/Napisz wiadomość/);
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      expect(textarea).toHaveValue('Test message');
    });

    it('renders send button', () => {
      render(<ChatView />);
      expect(screen.getByRole('button', { name: /Wyślij/ })).toBeInTheDocument();
    });

    it('send button is disabled when input is empty', () => {
      render(<ChatView />);
      const button = screen.getByRole('button', { name: /Wyślij/ });
      expect(button).toBeDisabled();
    });

    it('send button is enabled when input has text', () => {
      render(<ChatView />);
      const textarea = screen.getByPlaceholderText(/Napisz wiadomość/);
      fireEvent.change(textarea, { target: { value: 'Test' } });
      const button = screen.getByRole('button', { name: /Wyślij/ });
      expect(button).not.toBeDisabled();
    });
  });

  describe('message submission', () => {
    it('calls addMessage on submit', () => {
      render(<ChatView />);
      const textarea = screen.getByPlaceholderText(/Napisz wiadomość/);
      fireEvent.change(textarea, { target: { value: 'Test message' } });

      const button = screen.getByRole('button', { name: /Wyślij/ });
      fireEvent.click(button);

      expect(mockState.addMessage).toHaveBeenCalled();
    });

    it('clears input after submit', () => {
      render(<ChatView />);
      const textarea = screen.getByPlaceholderText(/Napisz wiadomość/) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'Test message' } });

      const button = screen.getByRole('button', { name: /Wyślij/ });
      fireEvent.click(button);

      expect(textarea.value).toBe('');
    });

    it('sets streaming state on submit', () => {
      render(<ChatView />);
      const textarea = screen.getByPlaceholderText(/Napisz wiadomość/);
      fireEvent.change(textarea, { target: { value: 'Test' } });

      const button = screen.getByRole('button', { name: /Wyślij/ });
      fireEvent.click(button);

      expect(mockState.setIsStreaming).toHaveBeenCalledWith(true);
    });
  });

  describe('keyboard events', () => {
    it('submits on Enter key', () => {
      render(<ChatView />);
      const textarea = screen.getByPlaceholderText(/Napisz wiadomość/);
      fireEvent.change(textarea, { target: { value: 'Test' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

      expect(mockState.addMessage).toHaveBeenCalled();
    });

    it('does not submit on Shift+Enter', () => {
      render(<ChatView />);
      const textarea = screen.getByPlaceholderText(/Napisz wiadomość/);
      fireEvent.change(textarea, { target: { value: 'Test' } });
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

      expect(mockState.addMessage).not.toHaveBeenCalled();
    });
  });

  describe('streaming state', () => {
    beforeEach(() => {
      mockState = createMockAppState({ isStreaming: true });
    });

    it('shows loading indicator when streaming', () => {
      render(<ChatView />);
      expect(screen.getByText('Agenci myślą...')).toBeInTheDocument();
    });

    it('disables input when streaming', () => {
      render(<ChatView />);
      const textarea = screen.getByPlaceholderText(/Napisz wiadomość/);
      expect(textarea).toBeDisabled();
    });

    it('disables send button when streaming', () => {
      mockState = createMockAppState({ isStreaming: true });
      render(<ChatView />);
      const textarea = screen.getByPlaceholderText(/Napisz wiadomość/);
      // Force enable by setting value directly
      Object.defineProperty(textarea, 'value', { value: 'Test' });
      const button = screen.getByRole('button', { name: /Wyślij/ });
      expect(button).toBeDisabled();
    });
  });

  describe('helper text', () => {
    it('shows keyboard shortcut help', () => {
      render(<ChatView />);
      expect(screen.getByText(/Shift \+ Enter dla nowej linii/)).toBeInTheDocument();
    });
  });
});

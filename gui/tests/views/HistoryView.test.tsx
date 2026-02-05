/**
 * HistoryView Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HistoryView } from '../../src/views/HistoryView';
import { createMockAppState, type MockAppState } from '../mocks/store';

// Mock framer-motion
vi.mock('framer-motion', async () => {
  const actual = await import('../mocks/framer-motion');
  return actual;
});

// Mock window.confirm
vi.stubGlobal('confirm', vi.fn(() => true));

// Create mock state
let mockState: MockAppState;

// Mock zustand store
vi.mock('../../src/stores/appStore', () => ({
  useAppStore: vi.fn((selector) => {
    if (selector) return selector(mockState);
    return mockState;
  }),
}));

describe('HistoryView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = createMockAppState();
  });

  describe('empty state', () => {
    it('shows empty state message', () => {
      render(<HistoryView />);
      expect(screen.getByText('Brak historii')).toBeInTheDocument();
    });

    it('shows instruction to start conversation', () => {
      render(<HistoryView />);
      expect(screen.getByText(/Rozpocznij konwersację/)).toBeInTheDocument();
    });

    it('does not show clear button when empty', () => {
      render(<HistoryView />);
      expect(screen.queryByText('Wyczyść')).not.toBeInTheDocument();
    });
  });

  describe('with messages', () => {
    beforeEach(() => {
      mockState = createMockAppState({
        messages: [
          {
            id: '1',
            role: 'user',
            content: 'First message',
            timestamp: new Date('2024-01-15T10:00:00'),
          },
          {
            id: '2',
            role: 'assistant',
            content: 'Response message',
            agent: 'geralt',
            timestamp: new Date('2024-01-15T10:01:00'),
          },
        ],
      });
    });

    it('shows message count', () => {
      render(<HistoryView />);
      expect(screen.getByText('2 wiadomości')).toBeInTheDocument();
    });

    it('shows clear button', () => {
      render(<HistoryView />);
      expect(screen.getByText('Wyczyść')).toBeInTheDocument();
    });

    it('renders messages', () => {
      render(<HistoryView />);
      expect(screen.getByText('First message')).toBeInTheDocument();
      expect(screen.getByText('Response message')).toBeInTheDocument();
    });

    it('shows user label for user messages', () => {
      render(<HistoryView />);
      expect(screen.getByText('Ty')).toBeInTheDocument();
    });

    it('shows assistant label for assistant messages', () => {
      render(<HistoryView />);
      expect(screen.getByText('Asystent')).toBeInTheDocument();
    });

    it('shows agent badge', () => {
      render(<HistoryView />);
      expect(screen.getByText('geralt')).toBeInTheDocument();
    });
  });

  describe('clear functionality', () => {
    beforeEach(() => {
      mockState = createMockAppState({
        messages: [
          { id: '1', role: 'user', content: 'Message', timestamp: new Date() },
        ],
      });
    });

    it('shows confirmation dialog on clear', () => {
      render(<HistoryView />);
      fireEvent.click(screen.getByText('Wyczyść'));
      expect(window.confirm).toHaveBeenCalledWith('Czy na pewno chcesz wyczyścić historię?');
    });

    it('calls clearMessages when confirmed', () => {
      render(<HistoryView />);
      fireEvent.click(screen.getByText('Wyczyść'));
      expect(mockState.clearMessages).toHaveBeenCalled();
    });

    it('does not clear when cancelled', () => {
      vi.mocked(window.confirm).mockReturnValueOnce(false);
      render(<HistoryView />);
      fireEvent.click(screen.getByText('Wyczyść'));
      expect(mockState.clearMessages).not.toHaveBeenCalled();
    });
  });

  describe('search functionality', () => {
    beforeEach(() => {
      mockState = createMockAppState({
        messages: [
          { id: '1', role: 'user', content: 'Hello world', timestamp: new Date() },
          { id: '2', role: 'assistant', content: 'Goodbye moon', timestamp: new Date() },
        ],
      });
    });

    it('renders search input', () => {
      render(<HistoryView />);
      expect(screen.getByPlaceholderText('Szukaj w historii...')).toBeInTheDocument();
    });

    it('filters messages by search query', () => {
      render(<HistoryView />);
      const searchInput = screen.getByPlaceholderText('Szukaj w historii...');
      fireEvent.change(searchInput, { target: { value: 'Hello' } });

      expect(screen.getByText('Hello world')).toBeInTheDocument();
      expect(screen.queryByText('Goodbye moon')).not.toBeInTheDocument();
    });

    it('shows no results message when search matches nothing', () => {
      render(<HistoryView />);
      const searchInput = screen.getByPlaceholderText('Szukaj w historii...');
      fireEvent.change(searchInput, { target: { value: 'xyz123' } });

      expect(screen.getByText('Brak wyników')).toBeInTheDocument();
    });

    it('shows search query in no results message', () => {
      render(<HistoryView />);
      const searchInput = screen.getByPlaceholderText('Szukaj w historii...');
      fireEvent.change(searchInput, { target: { value: 'xyz123' } });

      expect(screen.getByText(/xyz123/)).toBeInTheDocument();
    });

    it('is case insensitive', () => {
      render(<HistoryView />);
      const searchInput = screen.getByPlaceholderText('Szukaj w historii...');
      fireEvent.change(searchInput, { target: { value: 'HELLO' } });

      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });
  });

  describe('date grouping', () => {
    beforeEach(() => {
      mockState = createMockAppState({
        messages: [
          { id: '1', role: 'user', content: 'Day 1 message', timestamp: new Date('2024-01-15T10:00:00') },
          { id: '2', role: 'user', content: 'Day 2 message', timestamp: new Date('2024-01-16T10:00:00') },
        ],
      });
    });

    it('groups messages by date', () => {
      render(<HistoryView />);
      // Both messages should be visible in separate groups
      expect(screen.getByText('Day 1 message')).toBeInTheDocument();
      expect(screen.getByText('Day 2 message')).toBeInTheDocument();
    });
  });
});

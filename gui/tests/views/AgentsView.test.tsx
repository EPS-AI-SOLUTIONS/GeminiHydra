/**
 * AgentsView Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentsView } from '../../src/views/AgentsView';
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

describe('AgentsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = createMockAppState();
  });

  describe('rendering', () => {
    it('renders page title', () => {
      render(<AgentsView />);
      expect(screen.getByText('Agenci Hydry')).toBeInTheDocument();
    });

    it('renders page description', () => {
      render(<AgentsView />);
      expect(screen.getByText(/System multi-agentowy inspirowany postaciami z Wiedźmina/)).toBeInTheDocument();
    });
  });

  describe('agent cards', () => {
    it('renders all 6 agents', () => {
      render(<AgentsView />);
      expect(screen.getByText('Geralt')).toBeInTheDocument();
      expect(screen.getByText('Dijkstra')).toBeInTheDocument();
      expect(screen.getByText('Yennefer')).toBeInTheDocument();
      expect(screen.getByText('Regis')).toBeInTheDocument();
      expect(screen.getByText('Triss')).toBeInTheDocument();
      expect(screen.getByText('Vesemir')).toBeInTheDocument();
    });

    it('shows agent descriptions', () => {
      render(<AgentsView />);
      expect(screen.getByText(/Główny koordynator i syntezator/)).toBeInTheDocument();
      expect(screen.getByText(/Strateg i planista/)).toBeInTheDocument();
    });

    it('shows agent specialties', () => {
      render(<AgentsView />);
      expect(screen.getByText('Koordynacja i Synteza')).toBeInTheDocument();
      expect(screen.getByText('Planowanie Strategiczne')).toBeInTheDocument();
      expect(screen.getByText('Analiza Krytyczna')).toBeInTheDocument();
    });
  });

  describe('status badges', () => {
    it('shows idle status by default', () => {
      render(<AgentsView />);
      const statusBadges = screen.getAllByText('Gotowy');
      expect(statusBadges.length).toBe(6);
    });

    it('shows thinking status when agent is thinking', () => {
      mockState = createMockAppState({
        agents: {
          ...createMockAppState().agents,
          geralt: { id: 'geralt', name: 'geralt', status: 'thinking' },
        },
      });
      render(<AgentsView />);
      expect(screen.getByText('Myśli...')).toBeInTheDocument();
    });

    it('shows done status when agent completed', () => {
      mockState = createMockAppState({
        agents: {
          ...createMockAppState().agents,
          dijkstra: { id: 'dijkstra', name: 'dijkstra', status: 'done' },
        },
      });
      render(<AgentsView />);
      expect(screen.getByText('Ukończono')).toBeInTheDocument();
    });

    it('shows error status when agent has error', () => {
      mockState = createMockAppState({
        agents: {
          ...createMockAppState().agents,
          yennefer: { id: 'yennefer', name: 'yennefer', status: 'error' },
        },
      });
      render(<AgentsView />);
      expect(screen.getByText('Błąd')).toBeInTheDocument();
    });
  });

  describe('stats', () => {
    it('shows task count placeholder', () => {
      render(<AgentsView />);
      const taskCounts = screen.getAllByText('Zadania: 0');
      expect(taskCounts.length).toBe(6);
    });

    it('shows token count placeholder', () => {
      render(<AgentsView />);
      const tokenCounts = screen.getAllByText('Tokeny: 0');
      expect(tokenCounts.length).toBe(6);
    });
  });
});

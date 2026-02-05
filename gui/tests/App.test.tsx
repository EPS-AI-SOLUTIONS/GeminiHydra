/**
 * App Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App';
import { createMockAppState } from './mocks/store';
import { mockUseHealthCheck } from './mocks/query';

// Mock framer-motion
vi.mock('framer-motion', async () => {
  const actual = await import('./mocks/framer-motion');
  return actual;
});

// Mock zustand store
const mockState = createMockAppState();
vi.mock('../src/stores/appStore', () => ({
  useAppStore: vi.fn((selector) => {
    if (selector) return selector(mockState);
    return mockState;
  }),
}));

// Mock useApi hooks
vi.mock('../src/hooks/useApi', () => ({
  useHealthCheck: vi.fn(() => mockUseHealthCheck()),
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.classList.remove('light');
    localStorage.clear();
  });

  describe('rendering', () => {
    it('renders without crashing', () => {
      render(<App />);
      expect(document.body).toBeDefined();
    });

    it('renders main layout', () => {
      render(<App />);
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('renders sidebar with logo', () => {
      render(<App />);
      expect(screen.getByText('GeminiHydra')).toBeInTheDocument();
    });

    it('renders header', () => {
      render(<App />);
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });
  });

  describe('default view', () => {
    it('shows chat view by default', () => {
      render(<App />);
      // ChatView shows welcome message when no messages
      expect(screen.getByText('Witaj w GeminiHydra')).toBeInTheDocument();
    });
  });

  describe('providers', () => {
    it('provides theme context', () => {
      render(<App />);
      // Theme toggle should be visible in sidebar
      expect(screen.getByText('Jasny motyw')).toBeInTheDocument();
    });

    it('provides query client', () => {
      render(<App />);
      // Health check should be running, showing connection status
      expect(screen.getByText('Połączono')).toBeInTheDocument();
    });
  });

  describe('navigation', () => {
    it('renders navigation items', () => {
      render(<App />);
      // Chat appears in both sidebar and header, so use getAllByText
      expect(screen.getAllByText('Chat').length).toBeGreaterThan(0);
      expect(screen.getByText('Agenci')).toBeInTheDocument();
      expect(screen.getByText('Historia')).toBeInTheDocument();
      expect(screen.getByText('Ustawienia')).toBeInTheDocument();
    });
  });
});

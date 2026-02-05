/**
 * Header Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from '../../../src/components/layout/Header';
import { QueryWrapper, mockUseHealthCheck } from '../../mocks/query';

// Mock the useApi hook
vi.mock('../../../src/hooks/useApi', () => ({
  useHealthCheck: vi.fn(),
}));

import { useHealthCheck } from '../../../src/hooks/useApi';

const renderHeader = (props = {}) => {
  return render(
    <QueryWrapper>
      <Header title="Test Title" {...props} />
    </QueryWrapper>
  );
};

describe('Header', () => {
  beforeEach(() => {
    vi.mocked(useHealthCheck).mockReturnValue(mockUseHealthCheck() as ReturnType<typeof useHealthCheck>);
  });

  describe('rendering', () => {
    it('renders title', () => {
      renderHeader({ title: 'Dashboard' });
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('renders subtitle when provided', () => {
      renderHeader({ title: 'Dashboard', subtitle: 'Welcome back' });
      expect(screen.getByText('Welcome back')).toBeInTheDocument();
    });

    it('does not render subtitle when not provided', () => {
      renderHeader({ title: 'Dashboard' });
      expect(screen.queryByText('Welcome back')).not.toBeInTheDocument();
    });
  });

  describe('health status - connected', () => {
    beforeEach(() => {
      vi.mocked(useHealthCheck).mockReturnValue(mockUseHealthCheck({
        data: { status: 'ok', version: '16.0.0' },
        isError: false,
        isFetching: false,
      }) as ReturnType<typeof useHealthCheck>);
    });

    it('shows connected status', () => {
      renderHeader();
      expect(screen.getByText('Połączono')).toBeInTheDocument();
    });

    it('shows version badge', () => {
      renderHeader();
      expect(screen.getByText('v16.0.0')).toBeInTheDocument();
    });
  });

  describe('health status - disconnected', () => {
    beforeEach(() => {
      vi.mocked(useHealthCheck).mockReturnValue(mockUseHealthCheck({
        data: undefined,
        isError: true,
        isFetching: false,
      }) as ReturnType<typeof useHealthCheck>);
    });

    it('shows disconnected status', () => {
      renderHeader();
      expect(screen.getByText('Rozłączono')).toBeInTheDocument();
    });

    it('does not show version badge when disconnected', () => {
      renderHeader();
      expect(screen.queryByText(/^v\d/)).not.toBeInTheDocument();
    });
  });

  describe('health status - fetching', () => {
    beforeEach(() => {
      vi.mocked(useHealthCheck).mockReturnValue(mockUseHealthCheck({
        data: undefined,
        isError: false,
        isFetching: true,
      }) as ReturnType<typeof useHealthCheck>);
    });

    it('shows loading status', () => {
      renderHeader();
      expect(screen.getByText('Łączenie...')).toBeInTheDocument();
    });
  });

  describe('structure', () => {
    it('renders as header element', () => {
      renderHeader();
      expect(screen.getByRole('banner')).toBeInTheDocument();
    });
  });
});

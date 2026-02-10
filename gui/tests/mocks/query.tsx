/**
 * TanStack Query Mock Utilities
 */

import React, { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';

// Create test query client with disabled retries
export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });

// Query wrapper for tests
export const QueryWrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

// Mock query hooks
export const mockUseHealthCheck = (overrides = {}) => ({
  data: { status: 'ok', version: '16.0.0' },
  isError: false,
  isFetching: false,
  isLoading: false,
  ...overrides,
});

export const mockUseAgents = (overrides = {}) => ({
  data: {
    agents: [
      { name: 'geralt', description: 'Coordinator' },
      { name: 'dijkstra', description: 'Strategist' },
    ],
  },
  isLoading: false,
  isError: false,
  ...overrides,
});

export const mockUseSettings = (overrides = {}) => ({
  data: {
    theme: 'dark',
    streaming: true,
    verbose: false,
    language: 'pl',
    model: 'gemini-3-pro-preview',
    temperature: 0.7,
    maxTokens: 8192,
  },
  isLoading: false,
  isError: false,
  ...overrides,
});

export const mockUseExecute = () => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  isSuccess: false,
});

export const mockUseHistory = (overrides = {}) => ({
  data: { messages: [] },
  isLoading: false,
  isError: false,
  ...overrides,
});

export const mockUseClearHistory = () => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
});

export const mockUseUpdateSettings = () => ({
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
});

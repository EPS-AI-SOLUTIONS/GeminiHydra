/**
 * Custom render utilities for testing
 */

import React, { type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../../src/contexts/ThemeContext';
import { createTestQueryClient } from '../mocks/query';

interface WrapperProps {
  children: ReactNode;
}

// Full app wrapper with all providers
const AllProviders = ({ children }: WrapperProps) => {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
};

// Query-only wrapper (no theme)
const QueryOnlyWrapper = ({ children }: WrapperProps) => {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

// Custom render with all providers
export const renderWithProviders = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: AllProviders, ...options });

// Custom render with query client only
export const renderWithQuery = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => render(ui, { wrapper: QueryOnlyWrapper, ...options });

// Re-export everything from testing-library
export * from '@testing-library/react';
export { renderWithProviders as render };

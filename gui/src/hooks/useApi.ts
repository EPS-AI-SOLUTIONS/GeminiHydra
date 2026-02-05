/**
 * TanStack Query hooks for API communication
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Message, ExecutionPlan, Settings } from '../types';

const API_BASE = '/api';

// API functions
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// Health check
export function useHealthCheck() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => fetchJson<{ status: string; version: string }>('/health'),
    refetchInterval: 30000,
    retry: 1,
  });
}

// Get available agents
export function useAgents() {
  return useQuery({
    queryKey: ['agents'],
    queryFn: () =>
      fetchJson<{ agents: Array<{ name: string; description: string }> }>('/agents'),
  });
}

// Get settings
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => fetchJson<Settings>('/settings'),
  });
}

// Update settings
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Partial<Settings>) =>
      fetchJson<Settings>('/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

// Send message / execute task
interface ExecuteRequest {
  objective: string;
  streaming?: boolean;
}

interface ExecuteResponse {
  plan: ExecutionPlan;
  result: string;
}

export function useExecute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ExecuteRequest) =>
      fetchJson<ExecuteResponse>('/execute', {
        method: 'POST',
        body: JSON.stringify(request),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

// Execute with streaming - returns async generator for SSE
export async function* executeStream(request: ExecuteRequest) {
  const response = await fetch(`${API_BASE}/execute/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter((line) => line.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') return;
      try {
        yield JSON.parse(data);
      } catch {
        // Skip invalid JSON
      }
    }
  }
}

// Get execution history
export function useHistory(limit = 50) {
  return useQuery({
    queryKey: ['history', limit],
    queryFn: () =>
      fetchJson<{ messages: Message[] }>(`/history?limit=${limit}`),
  });
}

// Clear history
export function useClearHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchJson<{ success: boolean }>('/history', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
  });
}

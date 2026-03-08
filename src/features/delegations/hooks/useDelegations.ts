// src/features/delegations/hooks/useDelegations.ts
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/shared/api/client';

export interface DelegationTask {
  id: string;
  agent_name: string;
  agent_tier: string;
  agent_id: string;
  caller_agent_id: string | null;
  task_prompt: string;
  model_used: string;
  status: string;
  result_preview: string | null;
  is_error: boolean;
  error_message: string | null;
  duration_ms: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  call_depth: number;
  created_at: string;
  completed_at: string | null;
}

export interface DelegationStats {
  total: number;
  completed: number;
  errors: number;
  avg_duration_ms: number | null;
  total_tokens: number;
}

interface DelegationsResponse {
  tasks: DelegationTask[];
  stats: DelegationStats;
}

export function useDelegations(autoRefresh: boolean) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['delegations'],
    queryFn: () => apiGet<DelegationsResponse>('/api/agents/delegations'),
    refetchInterval: false, // Replaced by SSE
    retry: 1,
    staleTime: 5000,
  });

  useEffect(() => {
    if (!autoRefresh) return;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout;
    
    // We get the base URL to construct a full SSE path
    const connect = () => {
      // Create EventSource directly to the backend
      const backendUrl =
        import.meta.env.VITE_BACKEND_URL ??
        (import.meta.env.PROD && window.location.hostname !== 'localhost'
          ? 'https://geminihydra-v15-backend.fly.dev'
          : '');
      
      eventSource = new EventSource(`${backendUrl}/api/agents/delegations/stream`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Directly update the React Query cache
          queryClient.setQueryData(['delegations'], data);
        } catch (e) {
          console.error('Failed to parse SSE delegation event', e);
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        reconnectTimeout = setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      eventSource?.close();
      clearTimeout(reconnectTimeout);
    };
  }, [autoRefresh, queryClient]);

  return query;
}

export function useCancelDelegation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => apiPost(`/a2a/tasks/${taskId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delegations'] });
    },
  });
}

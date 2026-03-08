// src/features/delegations/hooks/useDelegations.ts
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
  return useQuery({
    queryKey: ['delegations'],
    queryFn: () => apiGet<DelegationsResponse>('/api/agents/delegations'),
    refetchInterval: autoRefresh ? 5000 : false,
    retry: 1,
    staleTime: 2000,
  });
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

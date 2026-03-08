// src/features/delegations/hooks/useDelegations.ts
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';

export interface DelegationTask {
  id: string;
  agent_name: string;
  agent_tier: string;
  agent_id: string;
  caller_agent_id: string | null;
  task_prompt: string;
  status: string;
  result_preview: string | null;
  is_error: boolean;
  error_message: string | null;
  duration_ms: number | null;
  call_depth: number;
  created_at: string;
  completed_at: string | null;
}

export interface DelegationStats {
  total: number;
  completed: number;
  errors: number;
  avg_duration_ms: number | null;
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

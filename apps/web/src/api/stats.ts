import { useQuery } from '@tanstack/react-query';
import type { ActivityRange } from '@sb/shared';
import { api } from './client';
import { POLL, queryKeys } from './keys';

export function useStats() {
  return useQuery({ queryKey: queryKeys.stats, queryFn: api.getStats, refetchInterval: POLL.stats });
}

export function useActivity(range: ActivityRange = '24h') {
  return useQuery({
    queryKey: queryKeys.activity(range),
    queryFn: () => api.getActivity(range),
    refetchInterval: POLL.stats,
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
import { POLL, queryKeys } from '@/lib/query-keys';

export function useStats() {
  return useQuery({ queryKey: queryKeys.stats, queryFn: api.getStats, refetchInterval: POLL.stats });
}

export function useGatewayHealth() {
  return useQuery({
    queryKey: queryKeys.gateway,
    queryFn: api.getGatewayHealth,
    refetchInterval: POLL.gateway,
  });
}

export function useMessages(status?: string) {
  return useQuery({
    queryKey: queryKeys.messages(status),
    queryFn: () => api.listMessages(status),
    refetchInterval: POLL.queue,
  });
}

export function useMessageDetail(id: string | null) {
  return useQuery({
    queryKey: queryKeys.message(id ?? ''),
    queryFn: () => api.getMessage(id as string),
    enabled: !!id,
    refetchInterval: POLL.detail,
  });
}

export function useRetryMessage() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: api.retryMessage,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['messages'] });
      void client.invalidateQueries({ queryKey: queryKeys.stats });
      toast.success('Message requeued');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not retry that message');
    },
  });
}

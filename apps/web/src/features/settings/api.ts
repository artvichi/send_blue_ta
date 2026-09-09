import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: api.getSettings });
}

export function useUpdateSettings() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: api.updateSettings,
    onSuccess: (settings) => {
      void client.invalidateQueries({ queryKey: queryKeys.settings });
      // Changing the interval re-times every projected send in the queue.
      void client.invalidateQueries({ queryKey: queryKeys.queue });
      void client.invalidateQueries({ queryKey: queryKeys.stats });
      toast.success(
        settings.paused ? 'Queue paused' : `Sending one message every ${settings.sendIntervalSeconds}s`,
      );
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not update settings');
    },
  });
}

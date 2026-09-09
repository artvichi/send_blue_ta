import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api-client';
import { POLL, queryKeys } from '@/lib/query-keys';

export function useQueue() {
  return useQuery({
    queryKey: queryKeys.queue,
    queryFn: api.listQueue,
    refetchInterval: POLL.queue,
  });
}

export function useScheduleMessage() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: api.scheduleMessage,
    onSuccess: () => {
      // The projected send times of everything already queued shift when a new
      // message lands, so the whole queue is refetched rather than patched.
      void client.invalidateQueries({ queryKey: queryKeys.queue });
      void client.invalidateQueries({ queryKey: queryKeys.stats });
      toast.success('Message scheduled');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not schedule that message');
    },
  });
}

export function useCancelMessage() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: api.cancelMessage,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.queue });
      void client.invalidateQueries({ queryKey: queryKeys.stats });
      toast.success('Message cancelled');
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not cancel that message');
    },
  });
}

export function useSendNow() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: api.sendNow,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.queue });
      void client.invalidateQueries({ queryKey: queryKeys.stats });
      toast.success('Sending now', { description: 'The queue will pick it up immediately.' });
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : 'Could not send that message');
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './client';
import { POLL, queryKeys } from './keys';
import { toastFailure } from './toast';

export function useQueue() {
  return useQuery({
    queryKey: queryKeys.queue,
    queryFn: api.listQueue,
    refetchInterval: POLL.queue,
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

/**
 * Anything that changes the queue also changes every projected send time behind
 * it, so mutations refetch the queue rather than patching a row.
 */
function useQueueMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  onSuccess: (result: TResult) => void,
  fallback: string,
) {
  const client = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: queryKeys.queue });
      void client.invalidateQueries({ queryKey: queryKeys.stats });
      onSuccess(result);
    },
    onError: toastFailure(fallback),
  });
}

export function useScheduleMessage() {
  return useQueueMutation(
    api.scheduleMessage,
    () => toast.success('Message scheduled'),
    'Could not schedule that message',
  );
}

export function useCancelMessage() {
  return useQueueMutation(
    api.cancelMessage,
    () => toast.success('Message cancelled'),
    'Could not cancel that message',
  );
}

export function useSendNow() {
  return useQueueMutation(
    api.sendNow,
    () => toast.success('Sending now', { description: 'The queue will pick it up immediately.' }),
    'Could not send that message',
  );
}

export function useRetryMessage() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: api.retryMessage,
    onSuccess: () => {
      // Retry moves a row from the history back into the queue, so both lists
      // are stale -- `['messages']` is the prefix both keys share.
      void client.invalidateQueries({ queryKey: ['messages'] });
      void client.invalidateQueries({ queryKey: queryKeys.stats });
      toast.success('Message requeued');
    },
    onError: toastFailure('Could not retry that message'),
  });
}

export function useClearHistory() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: api.clearHistory,
    onSuccess: ({ deleted, kept }) => {
      void client.invalidateQueries();
      toast.success(
        `Cleared ${deleted} message${deleted === 1 ? '' : 's'}`,
        kept > 0 ? { description: `${kept} queued or in flight left alone.` } : undefined,
      );
    },
    onError: toastFailure('Could not clear the history'),
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from './client';
import { queryKeys } from './keys';
import { toastFailure } from './toast';

export function useRecipients(q?: string) {
  return useQuery({
    queryKey: queryKeys.recipients(q),
    queryFn: () => api.listRecipients(q),
    // Names are stable; a search box does not need the list re-fetched on a timer.
    staleTime: 30_000,
  });
}

/**
 * Message rows carry the recipient's name, so any change to the address book
 * also invalidates every message list.
 */
function useRecipientMutation<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  onSuccess: (result: TResult) => void,
  fallback: string,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ['recipients'] });
      void client.invalidateQueries({ queryKey: ['messages'] });
      onSuccess(result);
    },
    onError: toastFailure(fallback),
  });
}

export function useCreateRecipient() {
  return useRecipientMutation(
    api.createRecipient,
    (r) => toast.success(`Added ${r.name}`),
    'Could not add that recipient',
  );
}

export function useUpdateRecipient() {
  return useRecipientMutation(
    api.updateRecipient,
    (r) => toast.success(`Saved ${r.name}`),
    'Could not save that recipient',
  );
}

export function useDeleteRecipient() {
  return useRecipientMutation(
    api.deleteRecipient,
    () => toast.success('Recipient removed', { description: 'Their message history is kept.' }),
    'Could not remove that recipient',
  );
}

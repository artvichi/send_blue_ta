import { toast } from 'sonner';
import { ApiError } from './client';

/**
 * Mutation error handler. The server already writes a human-readable `message`
 * for the failures a user can act on (a malformed handle, a message that is no
 * longer cancelable); anything else is a network or 500 and gets the fallback.
 */
export function toastFailure(fallback: string) {
  return (error: unknown) => {
    toast.error(error instanceof ApiError ? error.message : fallback);
  };
}

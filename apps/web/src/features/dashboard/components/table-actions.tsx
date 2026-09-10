import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useClearHistory, useStats } from '../api';

/**
 * Actions belonging to the table as a whole.
 *
 * Clearing is confirmed in a dialog: it cannot be undone, and the confirmation
 * needs room to say precisely what goes and what stays.
 */
export function TableActions() {
  const { data: stats } = useStats();
  const clear = useClearHistory();
  const [open, setOpen] = useState(false);

  const finished = stats ? stats.delivered + stats.failed + stats.canceled : 0;
  const live = stats ? stats.queued + stats.inFlight : 0;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {finished > 0 && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="secondary">
              <Trash2 />
              <span className="hidden sm:inline">Clear history</span>
              <span className="sm:hidden">Clear</span>
            </Button>
          </DialogTrigger>

          <DialogContent>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <DialogTitle>Clear message history?</DialogTitle>
                <DialogDescription>
                  This permanently deletes{' '}
                  <strong className="font-semibold text-ink">
                    {finished} finished message{finished === 1 ? '' : 's'}
                  </strong>{' '}
                  and their event timelines. It cannot be undone.
                </DialogDescription>
              </div>

              {live > 0 && (
                <p className="rounded-lg border border-rule bg-sunk px-3 py-2 text-sm text-ink-soft">
                  {live} queued or in-flight message{live === 1 ? '' : 's'} will be left alone —
                  deleting those would cancel a send you scheduled.
                </p>
              )}

              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="secondary" size="sm">
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={clear.isPending}
                  onClick={() => clear.mutate(undefined, { onSettled: () => setOpen(false) })}
                >
                  <Trash2 />
                  Delete {finished}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Button size="sm" variant="primary" asChild>
        <Link to="/schedule">
          <Send />
          <span className="hidden sm:inline">Schedule message</span>
          <span className="sm:hidden">Schedule</span>
        </Link>
      </Button>
    </div>
  );
}

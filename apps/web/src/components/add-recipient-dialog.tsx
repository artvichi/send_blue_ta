import { useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { RecipientForm } from '@/components/recipient-form';
import { formatPhone } from '@/lib/format';

/**
 * Name a handle without leaving the screen: the same RecipientForm the
 * Recipients tab uses, with the handle fixed. Because messages join to
 * recipients by handle, saving labels every message to it, past and future.
 */
export function AddRecipientDialog({ handle, trigger }: { handle: string; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <DialogTitle>Add to recipients</DialogTitle>
            <DialogDescription>
              Name <span className="font-medium tabular-nums text-ink">{formatPhone(handle)}</span>.
              The name shows on every message to this {handle.includes('@') ? 'address' : 'number'},
              including ones already sent.
            </DialogDescription>
          </div>
          <RecipientForm initialTo={handle} lockHandle stacked onSaved={() => setOpen(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AtSign, Check, Pencil, Phone, Send, Trash2, X } from 'lucide-react';
import type { RecipientDto } from '@sb/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useDeleteRecipient, useUpdateRecipient } from '@/api/recipients';
import { formatPhone } from '@/lib/format';

export function RecipientRow({ recipient }: { recipient: RecipientDto }) {
  const update = useUpdateRecipient();
  const remove = useDeleteRecipient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(recipient.name);
  const [to, setTo] = useState(recipient.handle);
  const [confirm, setConfirm] = useState(false);

  const startEdit = () => {
    setName(recipient.name);
    setTo(recipient.handle);
    setEditing(true);
  };

  const save = () => {
    const patch: { id: string; name?: string; to?: string } = { id: recipient.id };
    if (name.trim() !== recipient.name) patch.name = name.trim();
    if (to.trim() !== recipient.handle) patch.to = to.trim();
    if (!patch.name && !patch.to) return setEditing(false);
    update.mutate(patch, { onSuccess: () => setEditing(false) });
  };

  const Icon = recipient.kind === 'email' ? AtSign : Phone;

  return (
    <li className="flex items-center gap-4 px-4 py-3 sm:px-5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
        <Icon className="size-4" />
      </span>

      {editing ? (
        <form
          className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            aria-label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 text-sm"
            autoFocus
          />
          <Input
            aria-label="Phone number or email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-10 text-sm"
          />
          <div className="flex shrink-0 gap-1">
            <Button type="submit" size="icon" variant="ghost" title="Save" disabled={update.isPending}>
              <Check />
            </Button>
            <Button type="button" size="icon" variant="ghost" title="Cancel" onClick={() => setEditing(false)}>
              <X />
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-ink">{recipient.name}</p>
            <p className="truncate text-sm tabular-nums text-ink-mute">
              {formatPhone(recipient.handle)}
              <span className="mx-2 text-rule">·</span>
              {recipient.messageCount === 0
                ? 'no messages yet'
                : `${recipient.messageCount} message${recipient.messageCount === 1 ? '' : 's'}`}
            </p>
          </div>

          <div className="flex shrink-0 gap-1">
            <Button size="icon" variant="ghost" title={`Schedule a message to ${recipient.name}`} asChild>
              <Link to={`/schedule?to=${encodeURIComponent(recipient.handle)}`}>
                <Send />
              </Link>
            </Button>
            <Button size="icon" variant="ghost" title="Edit" onClick={startEdit}>
              <Pencil />
            </Button>

            <Dialog open={confirm} onOpenChange={setConfirm}>
              <DialogTrigger asChild>
                <Button size="icon" variant="ghost" title="Remove">
                  <Trash2 />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <DialogTitle>Remove {recipient.name}?</DialogTitle>
                    <DialogDescription>
                      Only the name is forgotten. Messages already sent to{' '}
                      <span className="font-medium text-ink">{formatPhone(recipient.handle)}</span> stay
                      in the history.
                    </DialogDescription>
                  </div>
                  <div className="flex justify-end gap-2">
                    <DialogClose asChild>
                      <Button variant="secondary" size="sm">
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(recipient.id, { onSettled: () => setConfirm(false) })}
                    >
                      <Trash2 />
                      Remove
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </>
      )}
    </li>
  );
}

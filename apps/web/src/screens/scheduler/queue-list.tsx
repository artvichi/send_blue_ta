import { Clock, Phone, Inbox, X, Zap } from 'lucide-react';
import type { MessageDto } from '@sb/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { formatCountdown, formatDateTime, formatPhone } from '@/lib/format';
import { useCancelMessage, useQueue, useSendNow } from '@/api/messages';
import { useNow } from '@/hooks/use-now';

function QueueRow({ message, now }: { message: MessageDto; now: number }) {
  const cancel = useCancelMessage();
  const sendNow = useSendNow();
  const isNext = message.position === 0;

  return (
    <Card className="group relative overflow-hidden p-5">
      {/* The head of the queue is the one going out next; it earns the accent. */}
      {isNext && <span className="absolute inset-y-0 left-0 w-1 bg-brand" aria-hidden />}

      <div className="flex items-start gap-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <Phone className="size-4" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-medium tracking-tight text-ink">{formatPhone(message.to)}</span>
            {isNext && (
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
                Next
              </span>
            )}
          </div>

          <p className="break-words text-ink-soft">{message.body}</p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-mute">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" />
              <span className="tabular-nums">{formatDateTime(message.etaAt)}</span>
            </span>
            <span className="tabular-nums font-medium text-brand">
              {formatCountdown(message.etaAt, now)}
            </span>
          </div>
        </div>

        {/* Visible by default; hidden-until-hover only where a real pointer
            exists. Hover-gating alone made these unreachable on touch. */}
        <div className="flex shrink-0 gap-1 transition-opacity focus-within:opacity-100 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            title="Send now"
            aria-label={`Send message to ${formatPhone(message.to)} now`}
            disabled={sendNow.isPending}
            onClick={() => sendNow.mutate(message.id)}
          >
            <Zap />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Cancel"
            aria-label={`Cancel message to ${formatPhone(message.to)}`}
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(message.id)}
          >
            <X />
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function QueueList() {
  const { data, isPending, isError } = useQueue();
  const now = useNow();

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<Inbox />}
        title="Cannot reach the server"
        description="Check that the API is running on port 3000, then this will refresh on its own."
      />
    );
  }

  const items = data?.items ?? [];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span className="size-1.5 rounded-full bg-brand" aria-hidden />
          Scheduled Messages
        </h2>
        <span className="tabular-nums text-sm text-ink-mute">({items.length})</span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="Nothing scheduled"
          description="Messages you schedule appear here in the order they will be sent."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((message) => (
            <QueueRow key={message.id} message={message} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}

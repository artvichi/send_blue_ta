import { MESSAGE_STATUSES } from '@sb/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/status-badge';
import { formatTime } from '@/lib/format';
import { useMessageDetail } from '@/api/messages';

/**
 * The append-only event log for one message.
 *
 * This is what "overall visibility into the system" actually means in practice:
 * not just where a message ended up, but every step it took and when -- which
 * is the only way to explain a stuck or failed send after the fact.
 */
export function MessageTimeline({ id }: { id: string }) {
  const { data, isPending } = useMessageDetail(id);

  if (isPending) return <Skeleton className="h-24 rounded-xl" />;
  if (!data) return null;

  const ordered = [...data.events].sort(
    (a, b) => MESSAGE_STATUSES.indexOf(a.status) - MESSAGE_STATUSES.indexOf(b.status),
  );

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-0">
        {ordered.map((event, index) => (
          <li key={event.id} className="flex items-center gap-3 py-1">
            <div className="flex flex-col items-center self-stretch">
              <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden />
              {index < ordered.length - 1 && <span className="w-px flex-1 bg-rule" aria-hidden />}
            </div>
            <StatusBadge status={event.status} />
            <span className="tabular-nums text-xs text-ink-mute">
              {formatTime(event.occurredAt)}
            </span>
          </li>
        ))}
      </ol>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-ink-mute">Attempts</dt>
          <dd className="tabular-nums font-medium">{data.attempts}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-ink-mute">Provider GUID</dt>
          <dd className="truncate font-mono text-[11px]">{data.providerGuid ?? '--'}</dd>
        </div>
        {data.lastError && (
          <div className="col-span-full">
            <dt className="text-ink-mute">Last error</dt>
            <dd className="text-bad">{data.lastError}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

import { Fragment, useState } from 'react';
import { MESSAGE_STATUSES, type MessageStatus } from '@sb/shared';
import { RotateCw, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/empty-state';
import { cn } from '@/lib/utils';
import { formatCompactDateTime, formatPhone } from '@/lib/format';
import { useMessages, useRetryMessage } from '../api';
import { MessageTimeline } from './message-timeline';

const FILTERS: { label: string; value: MessageStatus | undefined }[] = [
  { label: 'All', value: undefined },
  ...MESSAGE_STATUSES.filter((s) => s !== 'DISPATCHING').map((s) => ({
    label: s.charAt(0) + s.slice(1).toLowerCase(),
    value: s,
  })),
];

export function MessageTable() {
  const [filter, setFilter] = useState<MessageStatus | undefined>(undefined);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data, isPending } = useMessages(filter);
  const retry = useRetryMessage();

  const items = data?.items ?? [];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => setFilter(option.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              filter === option.value
                ? 'border-brand bg-brand-soft text-brand'
                : 'border-rule text-ink-mute hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="No messages here"
          description={
            filter
              ? 'Nothing matches this filter yet. Try another one.'
              : 'Schedule a message and it will show up here.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-rule bg-surface">
          {/* The table scrolls inside its own container so the page never does. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-rule text-left text-xs uppercase tracking-wide text-ink-mute">
                  <th className="px-4 py-3 font-medium">Recipient</th>
                  <th className="px-4 py-3 font-medium">Message</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {items.map((message) => (
                  <Fragment key={message.id}>
                    <tr
                      onClick={() => setExpanded(expanded === message.id ? null : message.id)}
                      className="cursor-pointer border-b border-rule-soft last:border-0 hover:bg-sunk/60"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">
                        {formatPhone(message.to)}
                      </td>
                      <td className="max-w-[280px] truncate px-4 py-3 text-ink-soft">
                        {message.body}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={message.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-mute">
                        {formatCompactDateTime(message.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {message.status === 'FAILED' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={retry.isPending}
                            onClick={(e) => {
                              e.stopPropagation();
                              retry.mutate(message.id);
                            }}
                          >
                            <RotateCw />
                            Retry
                          </Button>
                        )}
                      </td>
                    </tr>
                    {expanded === message.id && (
                      <tr className="border-b border-rule-soft">
                        <td colSpan={5} className="bg-sunk/40 px-4 py-4">
                          <MessageTimeline id={message.id} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

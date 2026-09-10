import { Clock, CheckCheck, AlertTriangle, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatCountdown } from '@/lib/format';
import { useStats } from '../api';

function Tile({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'good' | 'bad' | 'brand';
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-rule bg-surface p-4">
      <span className="flex items-center gap-2 text-xs font-medium text-ink-mute [&_svg]:size-3.5">
        {icon}
        {label}
      </span>
      <span
        className={cn(
          'text-2xl font-semibold tabular-nums tracking-tight',
          tone === 'good' && 'text-good',
          tone === 'bad' && 'text-bad',
          tone === 'brand' && 'text-brand',
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-ink-mute">{hint}</span>}
    </div>
  );
}

export function StatTiles() {
  const { data, isPending } = useStats();

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile
        icon={<Clock />}
        label="Queued"
        value={data.queued}
        hint={data.nextDueAt ? `Next ${formatCountdown(data.nextDueAt)}` : 'Paused'}
        tone="brand"
      />
      <Tile icon={<Send />} label="In flight" value={data.inFlight} hint="Handed to the gateway" />
      <Tile
        icon={<CheckCheck />}
        label="Delivered"
        value={data.delivered}
        hint="Confirmed by chat.db"
        tone="good"
      />
      <Tile
        icon={<AlertTriangle />}
        label="Failed"
        value={data.failed}
        // The hint described cancellations, so a tile reading "4 / None" was
        // possible. Say something true about the number above it.
        hint={
          data.failed === 0
            ? data.canceled
              ? `${data.canceled} cancelled`
              : 'None'
            : data.canceled
              ? `plus ${data.canceled} cancelled`
              : 'Retry from the table'
        }
        tone={data.failed > 0 ? 'bad' : undefined}
      />
    </div>
  );
}

import { Timer } from 'lucide-react';
import { formatInterval } from '@/lib/format';
import { useSettings } from './api';

/**
 * Explains the one thing about this screen that is otherwise invisible: there
 * is no date picker because the send time is a consequence of the drain rate.
 */
export function IntervalNotice() {
  const { data } = useSettings();
  if (!data) return null;

  return (
    <p className="flex items-center gap-2 text-sm text-ink-mute">
      <Timer className="size-4 shrink-0" />
      {data.paused ? (
        <span>
          The queue is <strong className="font-medium text-warn">paused</strong>. Nothing will be
          sent until it is resumed from the dashboard.
        </span>
      ) : (
        <span>
          Messages leave the queue one at a time, every{' '}
          <strong className="font-medium text-ink">
            {formatInterval(data.sendIntervalSeconds)}
          </strong>
          . Change the rate on the dashboard.
        </span>
      )}
    </p>
  );
}

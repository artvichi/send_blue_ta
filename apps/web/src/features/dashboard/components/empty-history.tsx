import { Link } from 'react-router-dom';
import { Inbox, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** The first thing a new install shows, so it points at the only useful action. */
export function EmptyHistory() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-rule bg-surface/50 px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-sunk text-ink-mute">
        <Inbox className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">No messages yet</p>
        <p className="max-w-sm text-sm text-ink-mute">
          Schedule one and it will appear here, draining one at a time at the configured send rate.
        </p>
      </div>
      <Button variant="primary" asChild>
        <Link to="/schedule">
          <Send />
          Schedule your first message
        </Link>
      </Button>
    </div>
  );
}

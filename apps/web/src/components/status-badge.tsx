import type { MessageStatus } from '@sb/shared';
import { cn } from '@/lib/utils';

/**
 * Status shown as colour *and* shape, never colour alone.
 *
 * The two success states are deliberately not identical: DELIVERED is the
 * realistic end of the line, because RECEIVED only ever arrives when the
 * recipient has read receipts enabled.
 */
const STYLES: Record<MessageStatus, { label: string; className: string }> = {
  QUEUED: { label: 'Queued', className: 'bg-sunk text-ink-mute border-rule' },
  DISPATCHING: { label: 'Dispatching', className: 'bg-brand-soft text-brand border-brand/25' },
  ACCEPTED: { label: 'Accepted', className: 'bg-brand-soft text-brand border-brand/25' },
  SENT: { label: 'Sent', className: 'bg-brand-soft text-brand border-brand/30' },
  DELIVERED: { label: 'Delivered', className: 'bg-good-soft text-good border-good/25' },
  RECEIVED: { label: 'Read', className: 'bg-good-soft text-good border-good/40' },
  FAILED: { label: 'Failed', className: 'bg-bad-soft text-bad border-bad/25' },
  CANCELED: { label: 'Canceled', className: 'bg-sunk text-ink-mute border-rule line-through' },
};

export function StatusBadge({ status, className }: { status: MessageStatus; className?: string }) {
  const style = STYLES[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        style.className,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {style.label}
    </span>
  );
}

import { MESSAGE_STATUSES, type MessageStatus } from '@sb/shared';
import { cn } from '@/lib/utils';

export type StatusFilter = MessageStatus | undefined;

const FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: undefined },
  // DISPATCHING is an internal, sub-second state; filtering by it shows nothing.
  ...MESSAGE_STATUSES.filter((s) => s !== 'DISPATCHING').map((s) => ({
    label: s.charAt(0) + s.slice(1).toLowerCase(),
    value: s as StatusFilter,
  })),
];

export function StatusFilterPills({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {FILTERS.map((option) => (
        <button
          key={option.label}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            value === option.value
              ? 'border-brand bg-brand-soft text-brand'
              : 'border-rule text-ink-mute hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

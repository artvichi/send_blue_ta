import { ChevronDown } from 'lucide-react';
import { MESSAGE_STATUSES, type MessageStatus } from '@sb/shared';
import { cn } from '@/lib/utils';

export type StatusFilter = MessageStatus | undefined;

const ALL = '__all__';

const FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: undefined },
  // DISPATCHING is an internal, sub-second state; filtering by it shows nothing.
  ...MESSAGE_STATUSES.filter((s) => s !== 'DISPATCHING').map((s) => ({
    label: s.charAt(0) + s.slice(1).toLowerCase(),
    value: s as StatusFilter,
  })),
];

/**
 * Eight pills do not fit beside the table's actions on a narrow screen, and
 * wrapping them pushes the actions onto a second line. Below `lg` this becomes
 * a native select instead -- which on a phone opens the platform picker, a
 * better control than a row of small targets.
 */
export function StatusFilterPills({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
}) {
  return (
    <>
      <div className="relative lg:hidden">
        <select
          aria-label="Filter by status"
          value={value ?? ALL}
          onChange={(e) => onChange(e.target.value === ALL ? undefined : (e.target.value as MessageStatus))}
          className="h-9 w-full min-w-[9.5rem] appearance-none rounded-lg border border-rule bg-surface pl-3 pr-9 text-sm text-ink transition-colors hover:bg-sunk focus-visible:border-brand focus-visible:outline-none"
        >
          {FILTERS.map((option) => (
            <option key={option.label} value={option.value ?? ALL}>
              {option.value ? option.label : 'All statuses'}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink-mute"
          aria-hidden
        />
      </div>

      <div className="hidden flex-wrap items-center gap-2 lg:flex">
        {FILTERS.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium',
              'transition-[background-color,color,border-color,transform] duration-150 ease-out',
              'hover:-translate-y-px active:translate-y-0',
              value === option.value
                ? 'border-brand bg-brand-soft text-brand'
                : 'border-rule text-ink-mute hover:border-ink-mute/40 hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  );
}

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AtSign, BookUser, Phone, UserPlus } from 'lucide-react';
import { parseHandle, type RecipientDto } from '@sb/shared';
import { Input } from '@/components/ui/input';
import { useRecipients } from '@/api/recipients';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/lib/utils';

interface RecipientPickerProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  describedBy?: string;
}

/**
 * A recipient field that searches the address book as you type.
 *
 * Typing a name, a few digits or part of an email lists matches; choosing one
 * fills the field with that recipient's handle. The field always holds a plain
 * handle, so the form submits exactly what it did before the address book
 * existed -- the picker is a convenience over the input, not a new data path.
 *
 * The match back to a name is by normalized handle, the same key the server
 * uses, so what is shown under the field is what the message row will show.
 */
export function RecipientPicker({ id, value, onChange, onBlur, invalid, describedBy }: RecipientPickerProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const query = useDebouncedValue(value.trim(), 150);
  const { data } = useRecipients(query.length >= 1 ? query : undefined);
  const suggestions = useMemo(() => (data?.items ?? []).slice(0, 6), [data]);

  // What the current value resolves to, if anything: exact handle match wins.
  const parsed = parseHandle(value);
  const known = useMemo(
    () => (parsed.ok ? suggestions.find((r) => r.handle === parsed.handle) ?? null : null),
    [parsed, suggestions],
  );

  const showList = open && value.trim().length > 0 && suggestions.length > 0 && !known;

  useEffect(() => {
    setActive(0);
  }, [suggestions]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const choose = (r: RecipientDto) => {
    onChange(r.handle);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      const r = suggestions[active];
      if (r) {
        e.preventDefault();
        choose(r);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5">
      <Input
        id={id}
        type="text"
        inputMode="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        placeholder="Name, +1 (555) 000-0000 or name@icloud.com"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-rule bg-surface py-1 shadow-lg"
        >
          {suggestions.map((r, i) => (
            <li
              key={r.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()} // keep focus in the input
              onClick={() => choose(r)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center gap-3 px-3 py-2 text-sm',
                i === active ? 'bg-sunk text-ink' : 'text-ink-soft',
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                {r.kind === 'email' ? <AtSign className="size-3.5" /> : <Phone className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink">{r.name}</span>
                <span className="block truncate text-xs text-ink-mute">{r.handle}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Who this resolves to, or an offer to remember them. */}
      {known ? (
        <p className="flex items-center gap-1.5 text-xs text-ink-mute">
          <BookUser className="size-3.5 text-brand" aria-hidden />
          Sending to <span className="font-medium text-ink">{known.name}</span>
        </p>
      ) : parsed.ok && query.length > 0 && data ? (
        <p className="flex items-center gap-1.5 text-xs text-ink-mute">
          <UserPlus className="size-3.5" aria-hidden />
          Not in your recipients.{' '}
          <Link
            to={`/recipients?to=${encodeURIComponent(parsed.handle)}`}
            className="font-medium text-brand underline-offset-2 hover:underline"
          >
            Add them
          </Link>
        </p>
      ) : null}
    </div>
  );
}

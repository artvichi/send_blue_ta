import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookUser, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { useRecipients } from '@/api/recipients';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { RecipientForm } from './recipient-form';
import { RecipientRow } from './recipient-row';

export function RecipientsPage() {
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 150);
  const { data, isPending } = useRecipients(q || undefined);
  const items = data?.items ?? [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Recipients</h1>
        <p className="mt-1 text-sm text-ink-mute">
          Names for the numbers and addresses you message. A recipient is matched to their
          messages by the number or email itself, so history is never lost by editing here.
        </p>
      </div>

      <RecipientForm initialTo={params.get('to') ?? undefined} />

      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
        <Input
          type="search"
          aria-label="Search recipients"
          placeholder="Search by name, number or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 pl-11 text-sm"
        />
      </div>

      {isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BookUser />}
          title={q ? 'No one matches' : 'No recipients yet'}
          description={
            q
              ? 'Try a different name, number or email.'
              : 'Add someone above, and their name will show wherever their number does.'
          }
        />
      ) : (
        <ul className="divide-y divide-rule-soft overflow-hidden rounded-2xl border border-rule bg-surface">
          {items.map((r) => (
            <RecipientRow key={r.id} recipient={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

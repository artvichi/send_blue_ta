import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, UserPlus } from 'lucide-react';
import { createRecipientSchema, type CreateRecipientInput } from '@sb/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateRecipient } from '@/api/recipients';
import { cn } from '@/lib/utils';

interface RecipientFormProps {
  /** Prefill the handle -- from the compose field, a message row, or a URL. */
  initialTo?: string;
  /** The handle is given, not asked for: only the name is editable. */
  lockHandle?: boolean;
  /** Stack the fields (a dialog) instead of the one-line layout (the Recipients tab). */
  stacked?: boolean;
  onSaved?: () => void;
}

/**
 * The one form that adds a recipient, wherever it is opened from. The
 * Recipients tab renders it inline; the compose field and an expanded message
 * row open it in a dialog with the handle already fixed.
 */
export function RecipientForm({ initialTo, lockHandle = false, stacked = false, onSaved }: RecipientFormProps) {
  const create = useCreateRecipient();
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<CreateRecipientInput>({
    resolver: zodResolver(createRecipientSchema),
    defaultValues: { name: '', to: initialTo ?? '' },
  });

  useEffect(() => {
    if (initialTo) setFocus('name');
  }, [initialTo, setFocus]);

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync(values);
    reset({ name: '', to: lockHandle ? (initialTo ?? '') : '' });
    onSaved?.();
  });

  return (
    // Three explicit rows -- label, input, error -- shared across the columns
    // via subgrid, so an error message (or anything a browser extension injects
    // under one field) can never push that field out of line.
    <form
      onSubmit={onSubmit}
      noValidate
      className={cn(
        'grid gap-4',
        !stacked && 'sm:grid-cols-[1fr_1fr_auto] sm:grid-rows-[auto_auto_auto] sm:gap-y-0',
      )}
    >
      <Field
        stacked={stacked}
        label="Name"
        id="recipient-name"
        error={errors.name?.message}
      >
        <Input
          id="recipient-name"
          placeholder="Ada Lovelace"
          autoComplete="name"
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'recipient-name-error' : undefined}
          {...register('name')}
        />
      </Field>

      <Field
        stacked={stacked}
        label="Phone number or email"
        id="recipient-to"
        error={errors.to?.message}
      >
        <Input
          id="recipient-to"
          placeholder="+1 (555) 000-0000  ·  name@icloud.com"
          autoComplete="off"
          readOnly={lockHandle}
          aria-invalid={!!errors.to}
          aria-describedby={errors.to ? 'recipient-to-error' : undefined}
          className={cn(lockHandle && 'bg-sunk text-ink-soft')}
          {...register('to')}
        />
      </Field>

      <div className={cn(!stacked && 'sm:grid sm:grid-rows-subgrid sm:row-span-3', stacked && 'flex justify-end')}>
        {!stacked && <span aria-hidden className="hidden sm:block" />}
        <Button
          type="submit"
          variant="primary"
          size="md"
          className={cn('h-12', !stacked && 'w-full sm:w-auto')}
          disabled={create.isPending}
        >
          {create.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
          {lockHandle ? 'Save' : 'Add'}
        </Button>
        {!stacked && <span aria-hidden className="hidden sm:block" />}
      </div>
    </form>
  );
}

function Field({
  stacked,
  label,
  id,
  error,
  children,
}: {
  stacked: boolean;
  label: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-2', !stacked && 'sm:gap-0 sm:grid sm:grid-rows-subgrid sm:row-span-3')}>
      <Label htmlFor={id} className={cn(!stacked && 'sm:mb-2')}>
        {label}
      </Label>
      {children}
      <p id={`${id}-error`} role="alert" className={cn('text-sm text-bad empty:hidden', !stacked && 'sm:mt-2')}>
        {error}
      </p>
    </div>
  );
}

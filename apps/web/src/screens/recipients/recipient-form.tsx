import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, UserPlus } from 'lucide-react';
import { createRecipientSchema, type CreateRecipientInput } from '@sb/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateRecipient } from '@/api/recipients';

/** Add one recipient. `initialTo` arrives from the compose form's "Add them" link. */
export function RecipientForm({ initialTo }: { initialTo?: string }) {
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
    reset({ name: '', to: '' });
  });

  return (
    <Card className="p-5 sm:p-6">
      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="flex flex-col gap-2">
          <Label htmlFor="recipient-name">Name</Label>
          <Input
            id="recipient-name"
            placeholder="Ada Lovelace"
            autoComplete="name"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'recipient-name-error' : undefined}
            {...register('name')}
          />
          {errors.name && (
            <p id="recipient-name-error" role="alert" className="text-sm text-bad">
              {errors.name.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="recipient-to">Phone number or email</Label>
          <Input
            id="recipient-to"
            placeholder="+1 (555) 000-0000  ·  name@icloud.com"
            autoComplete="off"
            aria-invalid={!!errors.to}
            aria-describedby={errors.to ? 'recipient-to-error' : undefined}
            {...register('to')}
          />
          {errors.to && (
            <p id="recipient-to-error" role="alert" className="text-sm text-bad">
              {errors.to.message}
            </p>
          )}
        </div>

        <Button type="submit" variant="primary" size="md" className="h-12" disabled={create.isPending}>
          {create.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Add
        </Button>
      </form>
    </Card>
  );
}

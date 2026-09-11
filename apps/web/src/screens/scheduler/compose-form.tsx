import { Controller, useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send, Loader2 } from 'lucide-react';
import { createMessageSchema, MAX_BODY_LENGTH, type CreateMessageInput } from '@sb/shared';
import { Button } from '@/components/ui/button';
import { RecipientPicker } from '@/components/recipient-picker';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useScheduleMessage } from '@/api/messages';

/**
 * The compose form.
 *
 * There is no date picker, and that is the design rather than an omission: the
 * queue is FIFO and drains at a fixed rate, so a message's send time is decided
 * by its position, not by the sender. The queue below shows what that works out to.
 *
 * Validation runs against the schema shared with the server, so the rules
 * cannot drift between the two.
 */
export function ComposeForm() {
  const schedule = useScheduleMessage();
  const [params] = useSearchParams();

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CreateMessageInput>({
    resolver: zodResolver(createMessageSchema),
    defaultValues: { to: params.get('to') ?? '', body: '' },
  });

  const body = watch('body') ?? '';

  const onSubmit = handleSubmit(async (values) => {
    await schedule.mutateAsync(values);
    reset();
  });

  return (
    <Card className="p-6 sm:p-8">
      <form onSubmit={onSubmit} className="flex flex-col gap-6" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="to">Recipient</Label>
          <Controller
            control={control}
            name="to"
            render={({ field }) => (
              <RecipientPicker
                id="to"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                invalid={!!errors.to}
                describedBy={errors.to ? 'to-error' : undefined}
              />
            )}
          />
          {errors.to && (
            <p id="to-error" role="alert" className="text-sm text-bad">
              {errors.to.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="body">Message</Label>
            <span className="text-xs tabular-nums text-ink-mute">
              {body.length}/{MAX_BODY_LENGTH}
            </span>
          </div>
          <Textarea
            id="body"
            placeholder="Enter your message here..."
            aria-invalid={!!errors.body}
            aria-describedby={errors.body ? 'body-error' : undefined}
            {...register('body')}
          />
          {errors.body && (
            <p id="body-error" role="alert" className="text-sm text-bad">
              {errors.body.message}
            </p>
          )}
        </div>

        <Button type="submit" variant="primary" size="lg" disabled={schedule.isPending}>
          {schedule.isPending ? (
            <>
              <Loader2 className="animate-spin" />
              Scheduling...
            </>
          ) : (
            <>
              <Send />
              Schedule Message
            </>
          )}
        </Button>
      </form>
    </Card>
  );
}

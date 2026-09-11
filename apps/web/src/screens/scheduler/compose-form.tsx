import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Send } from 'lucide-react';
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
/** Long enough for the plane to leave before the check lands, then to be seen. */
const FLY_MS = 550;
const SENT_MS = 1000;

type SubmitPhase = 'idle' | 'sending' | 'sent';

export function ComposeForm() {
  const schedule = useScheduleMessage();
  const [params] = useSearchParams();
  const [phase, setPhase] = useState<SubmitPhase>('idle');
  const sentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (sentTimer.current) clearTimeout(sentTimer.current);
  }, []);

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
    setPhase('sending');
    try {
      // The plane always finishes leaving, even when the server answers faster.
      await Promise.all([
        schedule.mutateAsync(values),
        new Promise((resolve) => setTimeout(resolve, FLY_MS)),
      ]);
    } catch {
      setPhase('idle'); // the toast has already said why
      return;
    }
    reset();
    setPhase('sent');
    sentTimer.current = setTimeout(() => setPhase('idle'), SENT_MS);
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

        <Button
          type="submit"
          variant={phase === 'sent' ? 'success' : 'primary'}
          size="lg"
          disabled={phase !== 'idle'}
          aria-live="polite"
          className="relative overflow-hidden disabled:opacity-100"
        >
          {phase === 'idle' && (
            <>
              <Send />
              Schedule Message
            </>
          )}
          {phase === 'sending' && (
            <>
              <Send className="absolute animate-fly-off" aria-hidden />
              <span className="sr-only">Scheduling</span>
            </>
          )}
          {phase === 'sent' && (
            <>
              <Check className="animate-pop-in" strokeWidth={3} aria-hidden />
              <span className="sr-only">Scheduled</span>
            </>
          )}
        </Button>
      </form>
    </Card>
  );
}

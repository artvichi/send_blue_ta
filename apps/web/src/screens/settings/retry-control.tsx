import { RotateCw } from 'lucide-react';
import { MAX_ATTEMPTS, MIN_ATTEMPTS } from '@sb/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSettings, useUpdateSettings } from '@/api/settings';

/**
 * How many times a message is dispatched before it stays failed. There is no
 * backoff setting because there is no backoff: the send interval already spaces
 * attempts, so a retry inherits it.
 */
export function RetryControl() {
  const { data } = useSettings();
  const update = useUpdateSettings();

  if (!data) return null;

  const options = [1, 2, 3, 5];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCw className="size-4 text-ink-mute" />
          Retries
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">
          A failed send is requeued automatically up to{' '}
          <strong className="font-semibold text-ink">
            {data.maxAttempts} attempt{data.maxAttempts === 1 ? '' : 's'}
          </strong>
          , then left failed for you to retry by hand.
        </p>

        <div className="flex flex-wrap gap-2">
          {options.map((n) => (
            <Button
              key={n}
              size="sm"
              variant={data.maxAttempts === n ? 'primary' : 'secondary'}
              disabled={update.isPending || n < MIN_ATTEMPTS || n > MAX_ATTEMPTS}
              onClick={() => update.mutate({ maxAttempts: n })}
            >
              {n === 1 ? 'No retry' : `${n} attempts`}
            </Button>
          ))}
        </div>

        <p className="text-xs text-ink-mute">
          Attempts are spaced by the send rate above, so retries never burst.
        </p>
      </CardContent>
    </Card>
  );
}

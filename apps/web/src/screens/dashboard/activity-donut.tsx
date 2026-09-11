import type { ActivityDto } from '@sb/shared';

/**
 * Composition over the range: the same three outcomes as the bars, answering
 * "what proportion" rather than "when".
 *
 * A donut rather than a pie -- the hole carries the total, which is the number
 * people actually want, and it keeps the slices thin enough to compare by angle.
 * Three slices is the upper end of what a circle reads well; a fourth outcome
 * would go back to bars.
 */
const SIZE = 180;
const R = 70;
const STROKE = 26;
const C = 2 * Math.PI * R;

export function ActivityDonut({ data }: { data: ActivityDto }) {
  const totals = data.buckets.reduce(
    (acc, b) => ({
      delivered: acc.delivered + b.delivered,
      inFlight: acc.inFlight + b.inFlight,
      failed: acc.failed + b.failed,
    }),
    { delivered: 0, inFlight: 0, failed: 0 },
  );

  const total = totals.delivered + totals.inFlight + totals.failed;

  const slices = [
    { key: 'delivered', label: 'Delivered', value: totals.delivered, fill: 'url(#donut-delivered)' },
    { key: 'inFlight', label: 'In flight', value: totals.inFlight, fill: 'url(#donut-inflight)' },
    { key: 'failed', label: 'Failed', value: totals.failed, fill: 'url(#donut-failed)' },
  ].filter((s) => s.value > 0);

  if (total === 0) {
    return (
      <p className="py-14 text-center text-sm text-ink-mute">
        Nothing has been dispatched in this range.
      </p>
    );
  }

  let offset = 0;

  return (
    <div className="flex flex-col items-center gap-6 py-2 sm:flex-row sm:justify-center sm:gap-10">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`${total} messages: ${slices.map((s) => `${s.value} ${s.label.toLowerCase()}`).join(', ')}`}
      >
        <defs>
          <linearGradient id="donut-delivered" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--color-good)" stopOpacity="1" />
            <stop offset="1" stopColor="var(--color-good)" stopOpacity="0.65" />
          </linearGradient>
          <linearGradient id="donut-inflight" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--color-brand)" stopOpacity="1" />
            <stop offset="1" stopColor="var(--color-brand)" stopOpacity="0.65" />
          </linearGradient>
          <linearGradient id="donut-failed" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--color-chart-fail)" stopOpacity="1" />
            <stop offset="1" stopColor="var(--color-chart-fail)" stopOpacity="0.65" />
          </linearGradient>
        </defs>

        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {slices.map((s) => {
            const fraction = s.value / total;
            // A 2px surface gap keeps adjacent slices from bleeding together.
            const dash = Math.max(C * fraction - 2, 1);
            const el = (
              <circle
                key={s.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={s.fill}
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += C * fraction;
            return el;
          })}
        </g>

        <text
          x={SIZE / 2}
          y={SIZE / 2 - 4}
          textAnchor="middle"
          className="fill-ink text-2xl font-semibold tabular-nums"
        >
          {total}
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 16}
          textAnchor="middle"
          className="fill-ink-mute text-xs"
        >
          dispatched
        </text>
      </svg>

      {/* Values are labelled, so identity never rests on colour alone. */}
      <dl className="flex w-full max-w-[220px] flex-col gap-2">
        {slices.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-3 text-sm">
            <dt className="flex items-center gap-2 text-ink-soft">
              <span
                aria-hidden
                className="size-2.5 rounded-[3px]"
                style={{
                  background:
                    s.key === 'failed'
                      ? 'var(--color-chart-fail)'
                      : s.key === 'delivered'
                        ? 'var(--color-good)'
                        : 'var(--color-brand)',
                }}
              />
              {s.label}
            </dt>
            <dd className="tabular-nums font-medium">
              {s.value}
              <span className="ml-1 text-xs text-ink-mute">
                {Math.round((s.value / total) * 100)}%
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { ACTIVITY_RANGES, type ActivityDto, type ActivityRange } from '@sb/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useActivity } from '@/api/stats';
import { ActivityDonut } from './activity-donut';

/**
 * What the queue pushed out, hour by hour.
 *
 * At the app's own status colours, green and red measure ΔE 3.4 under
 * deuteranopia in light mode -- effectively the same mark. The chart therefore
 * uses a darker failure red (--color-chart-fail), which separates them by
 * lightness, a channel colour blindness leaves intact: measured ΔE 10.8. Stack
 * position and the legend carry it the rest of the way.
 */
const H = 132;
const PAD_TOP = 10;
const PAD_BOTTOM = 20;
const PLOT = H - PAD_TOP - PAD_BOTTOM;
const GAP = 2;

type Segment = { key: 'delivered' | 'inFlight' | 'failed'; label: string; value: number };

const RANGE_LABEL: Record<ActivityRange, string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

export function ActivityChart() {
  const [range, setRange] = useState<ActivityRange>('24h');
  const [view, setView] = useState<'bars' | 'donut'>('bars');
  const { data, isPending } = useActivity(range);
  const [hover, setHover] = useState<number | null>(null);

  const buckets = data?.buckets ?? [];
  const max = useMemo(
    () => Math.max(1, ...buckets.map((b) => b.delivered + b.inFlight + b.failed)),
    [buckets],
  );
  const total = useMemo(
    () => buckets.reduce((n, b) => n + b.delivered + b.inFlight + b.failed, 0),
    [buckets],
  );

  if (isPending) return <Skeleton className="h-[190px] rounded-2xl" />;

  const count = buckets.length || 24;
  const slot = 100 / count;
  const barW = Math.max(slot * 0.62, 0.9);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-rule bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">Last {RANGE_LABEL[range]}</h2>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            options={ACTIVITY_RANGES.map((r) => ({ value: r, label: r }))}
            value={range}
            onChange={setRange}
            label="Time range"
          />
          <Segmented
            options={[
              { value: 'bars', label: 'Over time' },
              { value: 'donut', label: 'Share' },
            ]}
            value={view}
            onChange={setView}
            label="Chart type"
          />
        </div>
      </div>

      {view === 'bars' && <Legend />}

      {view === 'donut' && data ? (
        <ActivityDonut data={data} />
      ) : total === 0 ? (
        <p className="py-10 text-center text-sm text-ink-mute">
          Nothing has been dispatched in the last 24 hours.
        </p>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 100 ${H}`}
            preserveAspectRatio="none"
            className="h-[132px] w-full"
            role="img"
            aria-label={`Messages dispatched per hour over the last 24 hours: ${total} total`}
          >
            <defs>
              {/*
                Same-hue vertical gradients. Decoration only: the value is the
                bar's height, and a single hue per series keeps the gradient
                from reading as a second encoding.
              */}
              <linearGradient id="grad-delivered" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--color-good)" stopOpacity="1" />
                <stop offset="1" stopColor="var(--color-good)" stopOpacity="0.6" />
              </linearGradient>
              <linearGradient id="grad-inflight" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--color-brand)" stopOpacity="1" />
                <stop offset="1" stopColor="var(--color-brand)" stopOpacity="0.6" />
              </linearGradient>
              <linearGradient id="grad-failed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--color-chart-fail)" stopOpacity="1" />
                <stop offset="1" stopColor="var(--color-chart-fail)" stopOpacity="0.6" />
              </linearGradient>

            </defs>

            {[0.5, 1].map((f) => (
              <line
                key={f}
                x1="0"
                x2="100"
                y1={PAD_TOP + PLOT * (1 - f)}
                y2={PAD_TOP + PLOT * (1 - f)}
                stroke="var(--color-rule)"
                strokeWidth="0.5"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <line
              x1="0"
              x2="100"
              y1={PAD_TOP + PLOT}
              y2={PAD_TOP + PLOT}
              stroke="var(--color-rule)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {buckets.map((b, i) => {
              const segs: Segment[] = [
                { key: 'delivered', label: 'Delivered', value: b.delivered },
                { key: 'inFlight', label: 'In flight', value: b.inFlight },
                { key: 'failed', label: 'Failed', value: b.failed },
              ].filter((s) => s.value > 0) as Segment[];

              const x = i * slot + (slot - barW) / 2;
              let cursor = PAD_TOP + PLOT;

              return (
                <g
                  key={b.bucket}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                >
                  {/* A full-height hit area: the bars themselves are too small to aim at. */}
                  <rect x={i * slot} y={0} width={slot} height={H} fill="transparent" />
                  {segs.map((s) => {
                    const h = (s.value / max) * PLOT;
                    cursor -= h;
                    const y = cursor;
                    cursor -= GAP;
                    return (
                      <rect
                        key={s.key}
                        x={x}
                        y={y}
                        width={barW}
                        height={Math.max(h - GAP, 0.6)}
                        rx="1"
                        fill={
                          s.key === 'failed'
                            ? 'url(#grad-failed)'
                            : s.key === 'delivered'
                              ? 'url(#grad-delivered)'
                              : 'url(#grad-inflight)'
                        }
                        opacity={hover === null || hover === i ? 1 : 0.4}
                        style={{ transition: 'opacity 150ms ease-out' }}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>

          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-ink-mute">
            <span>{label(buckets[0]?.bucket, data?.unit)}</span>
            <span>now</span>
          </div>

          {hover !== null && buckets[hover] && (
            <Tooltip bucket={buckets[hover]} count={count} index={hover} unit={data?.unit} />
          )}
        </div>
      )}
    </section>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-lg border border-rule bg-sunk/60 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150 ease-out',
            value === o.value
              ? 'bg-surface text-ink shadow-sm'
              : 'text-ink-mute hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Tooltip({
  bucket,
  count,
  index,
  unit,
}: {
  bucket: ActivityDto['buckets'][number];
  count: number;
  index: number;
  unit?: 'hour' | 'day';
}) {
  const rows = [
    { label: 'Delivered', value: bucket.delivered },
    { label: 'In flight', value: bucket.inFlight },
    { label: 'Failed', value: bucket.failed },
  ].filter((r) => r.value > 0);

  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-rule bg-surface px-3 py-2 text-xs shadow-lg"
      style={{ left: `${((index + 0.5) / count) * 100}%` }}
    >
      <p className="mb-1 font-medium tabular-nums">{label(bucket.bucket, unit)}</p>
      {rows.length === 0 ? (
        <p className="text-ink-mute">Nothing sent</p>
      ) : (
        rows.map((r) => (
          <p key={r.label} className="tabular-nums text-ink-soft">
            {r.value} {r.label.toLowerCase()}
          </p>
        ))
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-mute">
      <Swatch className="bg-linear-to-b from-good to-good/60" label="Delivered" />
      <Swatch className="bg-linear-to-b from-brand to-brand/60" label="In flight" />
      <Swatch label="Failed" className="bg-linear-to-b from-[var(--color-chart-fail)] to-[var(--color-chart-fail)]/60" />
    </div>
  );
}

function Swatch({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2.5 rounded-[3px] ${className}`} aria-hidden />
      {label}
    </span>
  );
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function label(iso?: string, unit: 'hour' | 'day' = 'hour'): string {
  if (!iso) return '';
  return (unit === 'day' ? dayFmt : timeFmt).format(new Date(iso));
}

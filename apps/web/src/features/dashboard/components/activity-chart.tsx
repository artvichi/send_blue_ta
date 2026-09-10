import { useMemo, useState } from 'react';
import type { ActivityDto } from '@sb/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { useActivity } from '../api';

/**
 * What the queue pushed out, hour by hour.
 *
 * The status colours (green delivered, red failed) measure ΔE 3.4 under
 * deuteranopia -- effectively identical to a red-green colourblind reader. They
 * are kept because they are the platform's own language for normal vision, and
 * the difference is carried by three encodings that do not depend on hue:
 * failures are hatched, always sit at the top of the stack, and are labelled.
 */
const H = 132;
const PAD_TOP = 10;
const PAD_BOTTOM = 20;
const PLOT = H - PAD_TOP - PAD_BOTTOM;
const GAP = 2;

type Segment = { key: 'delivered' | 'inFlight' | 'failed'; label: string; value: number };

export function ActivityChart() {
  const { data, isPending } = useActivity();
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
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Last 24 hours</h2>
        <Legend />
      </div>

      {total === 0 ? (
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
              {/* Secondary encoding: failures read as failures without colour. */}
              <pattern
                id="hatch-fail"
                width="4"
                height="4"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="4" height="4" fill="var(--color-bad)" />
                <line x1="0" y1="0" x2="0" y2="4" stroke="var(--color-surface)" strokeWidth="1.6" />
              </pattern>
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
                  key={b.hour}
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
                            ? 'url(#hatch-fail)'
                            : s.key === 'delivered'
                              ? 'var(--color-good)'
                              : 'var(--color-brand)'
                        }
                        opacity={hover === null || hover === i ? 1 : 0.45}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>

          <div className="mt-1 flex justify-between text-[10px] tabular-nums text-ink-mute">
            <span>{label(buckets[0]?.hour)}</span>
            <span>now</span>
          </div>

          {hover !== null && buckets[hover] && <Tooltip bucket={buckets[hover]} count={count} index={hover} />}
        </div>
      )}
    </section>
  );
}

function Tooltip({
  bucket,
  count,
  index,
}: {
  bucket: ActivityDto['buckets'][number];
  count: number;
  index: number;
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
      <p className="mb-1 font-medium tabular-nums">{label(bucket.hour)}</p>
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
      <Swatch className="bg-good" label="Delivered" />
      <Swatch className="bg-brand" label="In flight" />
      <Swatch
        label="Failed"
        className="bg-bad"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, transparent 0 2px, var(--color-surface) 2px 3px)',
        }}
      />
    </div>
  );
}

function Swatch({
  className,
  label,
  style,
}: {
  className: string;
  label: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2.5 rounded-[3px] ${className}`} style={style} aria-hidden />
      {label}
    </span>
  );
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
function label(iso?: string): string {
  return iso ? timeFmt.format(new Date(iso)) : '';
}

import { useEffect, useMemo, useState } from 'react';
import { ACTIVITY_RANGES, type ActivityDto, type ActivityRange } from '@sb/shared';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useActivity } from '@/api/stats';
import { useElementWidth } from '@/hooks/use-element-width';
import { ActivityDonut } from './activity-donut';

/**
 * What the queue pushed out, per hour or per day, as a stacked bar per bucket.
 *
 * Drawn in real pixels from a measured width rather than a stretched viewBox,
 * so bar widths, corner radii and the 2px gaps between segments are exactly
 * what they say. At the app's own status colours, green and red measure ΔE 3.4
 * under deuteranopia in light mode; the chart uses a darker failure red
 * (--color-chart-fail) that separates by lightness, measured ΔE 10.8.
 */
const PLOT_H = 150;
const PAD_TOP = 14; // room for the hovered bar's value label
const AXIS_LEFT = 28;
const AXIS_BOTTOM = 22;
const BAR_MAX_W = 22;
const SEGMENT_GAP = 2;
const RADIUS = 3;

type SeriesKey = 'delivered' | 'inFlight' | 'failed';
const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: 'delivered', label: 'Delivered', color: 'var(--color-good)' },
  { key: 'inFlight', label: 'In flight', color: 'var(--color-brand)' },
  { key: 'failed', label: 'Failed', color: 'var(--color-chart-fail)' },
];

const RANGE_LABEL: Record<ActivityRange, string> = {
  '24h': '24 hours',
  '7d': '7 days',
  '30d': '30 days',
};

/** Which buckets get an x label: every 6th hour, every day, every 5th day. */
const LABEL_EVERY: Record<ActivityRange, number> = { '24h': 6, '7d': 1, '30d': 5 };

export function ActivityChart() {
  const [range, setRange] = useState<ActivityRange>('24h');
  const [view, setView] = useState<'bars' | 'donut'>('bars');
  const { data, isPending } = useActivity(range);

  const buckets = data?.buckets ?? [];
  const total = useMemo(
    () => buckets.reduce((n, b) => n + b.delivered + b.inFlight + b.failed, 0),
    [buckets],
  );

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

      {isPending ? (
        <Skeleton className="h-[186px] rounded-xl" />
      ) : view === 'donut' && data ? (
        <ActivityDonut data={data} />
      ) : total === 0 ? (
        <p className="py-10 text-center text-sm text-ink-mute">
          Nothing has been dispatched in the last {RANGE_LABEL[range]}.
        </p>
      ) : (
        <Bars key={range} buckets={buckets} unit={data?.unit ?? 'hour'} range={range} total={total} />
      )}
    </section>
  );
}

function Bars({
  buckets,
  unit,
  range,
  total,
}: {
  buckets: ActivityDto['buckets'];
  unit: 'hour' | 'day';
  range: ActivityRange;
  total: number;
}) {
  const [box, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  // Bars start flat and grow on the frame after mount. `key={range}` on this
  // component remounts it per range, so a range change replays the entrance.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const max = Math.max(1, ...buckets.map((b) => b.delivered + b.inFlight + b.failed));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] ?? max;

  const plotW = Math.max(width - AXIS_LEFT, 0);
  const plotH = PLOT_H - PAD_TOP - AXIS_BOTTOM;
  const baseline = PAD_TOP + plotH;
  const count = buckets.length || 1;
  const slot = plotW / count;
  const barW = Math.min(BAR_MAX_W, Math.max(slot * 0.55, 3));
  const yOf = (value: number) => baseline - (value / top) * plotH;

  const hovered = hover !== null ? buckets[hover] : null;

  return (
    <div ref={box} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={PLOT_H}
          role="img"
          aria-label={`Messages dispatched per ${unit} over the last ${RANGE_LABEL[range]}: ${total} total`}
          className="block overflow-visible"
          onMouseLeave={() => setHover(null)}
        >
          {/* Grid + y axis. Recessive: the bars are the data. */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={AXIS_LEFT}
                x2={width}
                y1={yOf(t)}
                y2={yOf(t)}
                stroke={t === 0 ? 'var(--color-rule)' : 'var(--color-rule-soft)'}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={AXIS_LEFT - 8}
                y={yOf(t)}
                dy="0.35em"
                textAnchor="end"
                className="fill-ink-mute text-[10px] tabular-nums"
              >
                {t}
              </text>
            </g>
          ))}

          {/* Hovered column band, behind the bar. */}
          {hover !== null && (
            <rect
              x={AXIS_LEFT + hover * slot}
              y={PAD_TOP - 4}
              width={slot}
              height={plotH + 4}
              rx={4}
              className="fill-sunk"
            />
          )}

          {buckets.map((b, i) => {
            const segments = SERIES.map((s) => ({ ...s, value: b[s.key] })).filter(
              (s) => s.value > 0,
            );
            const sum = segments.reduce((n, s) => n + s.value, 0);
            const x = AXIS_LEFT + i * slot + (slot - barW) / 2;
            const stackTop = yOf(sum);
            const stackH = baseline - stackTop;
            const clipId = `bar-${range}-${i}`;
            const dimmed = hover !== null && hover !== i;

            return (
              <g
                key={b.bucket}
                onMouseEnter={() => setHover(i)}
                style={{ opacity: dimmed ? 0.45 : 1, transition: 'opacity 150ms ease-out' }}
              >
                {/* Full-height hit area: the bars are too thin to aim at. */}
                <rect x={AXIS_LEFT + i * slot} y={0} width={slot} height={PLOT_H} fill="transparent" />

                {sum === 0 ? (
                  // An empty bucket still marks its place on the axis.
                  <rect
                    x={x + barW / 2 - 1.5}
                    y={baseline - 1}
                    width={3}
                    height={2}
                    rx={1}
                    className="fill-rule"
                  />
                ) : (
                  <>
                    {/* The whole stack shares one rounded top; segments are
                        plain rects clipped to it, separated by surface gaps. */}
                    <clipPath id={clipId}>
                      <path d={roundedTop(x, stackTop, barW, stackH, RADIUS)} />
                    </clipPath>
                    <g
                      clipPath={`url(#${clipId})`}
                      style={{
                        transform: grown ? 'scaleY(1)' : 'scaleY(0)',
                        transformOrigin: `${x + barW / 2}px ${baseline}px`,
                        transition: `transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1) ${i * 14}ms`,
                      }}
                    >
                      {(() => {
                        let cursor = baseline;
                        return segments.map((s, j) => {
                          const h = (s.value / top) * plotH;
                          const y = cursor - h;
                          cursor = y;
                          const gap = j < segments.length - 1 ? SEGMENT_GAP : 0;
                          return (
                            <rect
                              key={s.key}
                              x={x}
                              y={y}
                              width={barW}
                              height={Math.max(h - gap, 1)}
                              fill={s.color}
                              style={{ transition: 'y 400ms ease-out, height 400ms ease-out' }}
                            />
                          );
                        });
                      })()}
                    </g>

                    {/* The value, on the hovered bar only. */}
                    {hover === i && (
                      <text
                        x={x + barW / 2}
                        y={stackTop - 5}
                        textAnchor="middle"
                        className="fill-ink text-[10px] font-medium tabular-nums"
                      >
                        {sum}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}

          {/* X labels: periodic, plus "now" pinned to the right edge. */}
          {buckets.map((b, i) =>
            i % LABEL_EVERY[range] === 0 && i < count - 1 ? (
              <text
                key={b.bucket}
                x={AXIS_LEFT + i * slot + slot / 2}
                y={PLOT_H - 6}
                textAnchor="middle"
                className="fill-ink-mute text-[10px] tabular-nums"
              >
                {label(b.bucket, unit)}
              </text>
            ) : null,
          )}
          <text x={width} y={PLOT_H - 6} textAnchor="end" className="fill-ink-mute text-[10px]">
            now
          </text>
        </svg>
      )}

      {hovered && hover !== null && (
        <Tooltip
          bucket={hovered}
          unit={unit}
          left={AXIS_LEFT + (hover + 0.5) * slot}
          flip={hover > count / 2}
        />
      )}
    </div>
  );
}

/** A rect path with only the top corners rounded, sitting flat on the baseline. */
function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, w / 2, h);
  return [
    `M${x},${y + h}`,
    `V${y + radius}`,
    `a${radius},${radius} 0 0 1 ${radius},-${radius}`,
    `H${x + w - radius}`,
    `a${radius},${radius} 0 0 1 ${radius},${radius}`,
    `V${y + h}`,
    'Z',
  ].join(' ');
}

/** Integer ticks from 0 to a round number at or above max, at most five of them. */
function niceTicks(max: number): number[] {
  if (max <= 4) return Array.from({ length: max + 1 }, (_, i) => i);
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? pow * 10;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
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
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-mute hover:text-ink',
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
  unit,
  left,
  flip,
}: {
  bucket: ActivityDto['buckets'][number];
  unit: 'hour' | 'day';
  left: number;
  flip: boolean;
}) {
  const rows = SERIES.map((s) => ({ ...s, value: bucket[s.key] })).filter((r) => r.value > 0);

  return (
    <div
      className={cn(
        'pointer-events-none absolute top-0 z-10 min-w-28 rounded-lg border border-rule bg-surface px-3 py-2 text-xs shadow-lg',
        flip ? '-translate-x-full' : '',
      )}
      style={{ left: flip ? left - 8 : left + 8 }}
    >
      <p className="mb-1 font-medium tabular-nums text-ink">{label(bucket.bucket, unit)}</p>
      {rows.length === 0 ? (
        <p className="text-ink-mute">Nothing sent</p>
      ) : (
        rows.map((r) => (
          <p key={r.key} className="flex items-center gap-1.5 tabular-nums text-ink-soft">
            <span className="size-2 rounded-[2px]" style={{ background: r.color }} aria-hidden />
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
      {SERIES.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden />
          {s.label}
        </span>
      ))}
    </div>
  );
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function label(iso?: string, unit: 'hour' | 'day' = 'hour'): string {
  if (!iso) return '';
  return (unit === 'day' ? dayFmt : timeFmt).format(new Date(iso));
}

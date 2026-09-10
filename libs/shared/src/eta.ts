/**
 * Send times are derived, not chosen -- the queue is FIFO at a fixed rate, so a
 * message's ETA follows from its position:
 *
 *     anchor = max(lastDispatchedAt + interval, now)
 *     eta(i) = anchor + i * interval
 *
 * Computed server-side on every read, so it recalculates for free when the queue
 * drains, a message is cancelled, or the interval changes.
 */

export interface EtaInput {
  /** When the most recent message was dispatched, or null if none ever has been. */
  lastDispatchedAt: Date | null;
  /** Current drain interval in seconds. */
  intervalSeconds: number;
  /** Injected so the calculation stays pure. */
  now: Date;
}

/**
 * Earliest moment the next message may leave. Collapses to `now` once an interval
 * has elapsed, so an idle queue does not believe it owes a backlog of sends.
 */
export function projectAnchor({ lastDispatchedAt, intervalSeconds, now }: EtaInput): Date {
  if (!lastDispatchedAt) return now;
  const due = new Date(lastDispatchedAt.getTime() + intervalSeconds * 1000);
  return due.getTime() > now.getTime() ? due : now;
}

/** Projected send time for the message at 0-indexed queue `position`. */
export function projectEta(position: number, input: EtaInput): Date {
  const anchor = projectAnchor(input);
  return new Date(anchor.getTime() + position * input.intervalSeconds * 1000);
}

export function projectQueueEtas(count: number, input: EtaInput): Date[] {
  const anchor = projectAnchor(input);
  return Array.from(
    { length: count },
    (_, i) => new Date(anchor.getTime() + i * input.intervalSeconds * 1000),
  );
}

/** Whether the queue is due to release a message right now. */
export function isDue({ lastDispatchedAt, intervalSeconds, now }: EtaInput): boolean {
  if (!lastDispatchedAt) return true;
  return now.getTime() - lastDispatchedAt.getTime() >= intervalSeconds * 1000;
}

/** Milliseconds until the queue is next due; 0 when it is due already. */
export function msUntilDue(input: EtaInput): number {
  return Math.max(0, projectAnchor(input).getTime() - input.now.getTime());
}

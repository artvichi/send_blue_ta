/**
 * Projected send times.
 *
 * The scheduler mockup has no date picker, yet every queued row shows a
 * timestamp. That timestamp is not user input -- it is derived from queue
 * position and the drain interval:
 *
 *     anchor = max(lastDispatchedAt + interval, now)
 *     eta(i) = anchor + i * interval
 *
 * Deriving it server-side means it recalculates for free as the queue drains,
 * as messages are cancelled, and when the interval is changed at runtime. The
 * client never computes a schedule, it only renders one.
 */
/**
 * The earliest moment the next message may leave the queue. When nothing has
 * been dispatched yet -- or the last dispatch is already older than one full
 * interval -- the queue is due immediately and the anchor is simply `now`.
 */
export function projectAnchor({ lastDispatchedAt, intervalSeconds, now }) {
    if (!lastDispatchedAt)
        return now;
    const due = new Date(lastDispatchedAt.getTime() + intervalSeconds * 1000);
    return due.getTime() > now.getTime() ? due : now;
}
/** Projected send time for the message at 0-indexed queue `position`. */
export function projectEta(position, input) {
    const anchor = projectAnchor(input);
    return new Date(anchor.getTime() + position * input.intervalSeconds * 1000);
}
/** Projected send times for a whole queue, in order. */
export function projectQueueEtas(count, input) {
    const anchor = projectAnchor(input);
    return Array.from({ length: count }, (_, i) => new Date(anchor.getTime() + i * input.intervalSeconds * 1000));
}
/** Whether the queue is due to release a message right now. */
export function isDue({ lastDispatchedAt, intervalSeconds, now }) {
    if (!lastDispatchedAt)
        return true;
    return now.getTime() - lastDispatchedAt.getTime() >= intervalSeconds * 1000;
}
/** Milliseconds until the queue is next due; 0 when it is due already. */
export function msUntilDue(input) {
    return Math.max(0, projectAnchor(input).getTime() - input.now.getTime());
}

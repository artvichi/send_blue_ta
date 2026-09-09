/**
 * The message lifecycle.
 *
 * The five statuses the assessment names -- QUEUED, ACCEPTED, SENT, DELIVERED,
 * RECEIVED -- are kept verbatim. DISPATCHING, FAILED and CANCELED are internal
 * additions: DISPATCHING marks the window between claiming a message and the
 * gateway acknowledging it, which is what makes the lease/reaper recovery
 * possible.
 */
export const MESSAGE_STATUSES = [
    'QUEUED',
    'DISPATCHING',
    'ACCEPTED',
    'SENT',
    'DELIVERED',
    'RECEIVED',
    'FAILED',
    'CANCELED',
];
/**
 * Progress ranks. Status updates arrive out of order -- a `SENT` observed by
 * one chat.db poll can reach the server after the `DELIVERED` from the next --
 * so every write is guarded by a rank comparison rather than applied blindly.
 *
 * FAILED and CANCELED sit outside the progression: they are terminal and are
 * reached by rule, not by rank.
 */
const PROGRESS_RANK = {
    QUEUED: 0,
    DISPATCHING: 1,
    ACCEPTED: 2,
    SENT: 3,
    DELIVERED: 4,
    RECEIVED: 5,
    FAILED: -1,
    CANCELED: -1,
};
/** Statuses that admit no further transition. */
export const TERMINAL_STATUSES = ['RECEIVED', 'FAILED', 'CANCELED'];
/**
 * DELIVERED is *effectively* terminal in practice: RECEIVED only ever fires
 * when the recipient has read receipts enabled, which frequently they do not.
 * The UI and the stats therefore treat DELIVERED as a success end-state rather
 * than as a message still in flight.
 */
export const SUCCESS_STATUSES = ['DELIVERED', 'RECEIVED'];
/** Statuses that mean the message is still moving through the system. */
export const IN_FLIGHT_STATUSES = ['DISPATCHING', 'ACCEPTED', 'SENT'];
export function isTerminal(status) {
    return TERMINAL_STATUSES.includes(status);
}
export function isSuccess(status) {
    return SUCCESS_STATUSES.includes(status);
}
export function isInFlight(status) {
    return IN_FLIGHT_STATUSES.includes(status);
}
export function progressRank(status) {
    return PROGRESS_RANK[status];
}
/**
 * Whether `to` may be applied on top of `from`.
 *
 * The rules, in order of precedence:
 *   1. Nothing leaves a terminal status.
 *   2. CANCELED is only reachable from QUEUED -- once a message has been handed
 *      to the gateway it is too late to cancel it, because the send may already
 *      have happened.
 *   3. FAILED is reachable from any non-terminal status.
 *   4. A message may be requeued from FAILED via an explicit retry, which is
 *      modelled as its own operation rather than as a transition.
 *   5. Otherwise the move must strictly advance the progress rank.
 */
export function canTransition(from, to) {
    if (isTerminal(from))
        return false;
    if (to === 'CANCELED')
        return from === 'QUEUED';
    if (to === 'FAILED')
        return true;
    if (to === 'QUEUED')
        return false;
    return progressRank(to) > progressRank(from);
}
/**
 * Resolve a reported status against the one already stored. Returns the status
 * that should be persisted -- which is the existing one whenever the report is
 * stale, duplicated or out of order.
 */
export function reconcileStatus(current, reported) {
    return canTransition(current, reported) ? reported : current;
}

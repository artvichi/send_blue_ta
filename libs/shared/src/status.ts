/**
 * DISPATCHING marks the window between claiming a message and the gateway
 * acknowledging it, which is what makes lease/reaper recovery possible.
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
] as const;

export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/**
 * Reports arrive out of order -- a SENT observed by one chat.db poll can reach
 * the server after the DELIVERED from the next -- so every write is rank-guarded.
 * FAILED and CANCELED sit outside the progression: terminal, reached by rule.
 */
const PROGRESS_RANK: Record<MessageStatus, number> = {
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
export const TERMINAL_STATUSES = ['RECEIVED', 'FAILED', 'CANCELED'] as const;

/** RECEIVED only fires with read receipts enabled, so DELIVERED counts as success. */
export const SUCCESS_STATUSES = ['DELIVERED', 'RECEIVED'] as const;

export const IN_FLIGHT_STATUSES = ['DISPATCHING', 'ACCEPTED', 'SENT'] as const;

export function isTerminal(status: MessageStatus): boolean {
  return (TERMINAL_STATUSES as readonly MessageStatus[]).includes(status);
}

export function isSuccess(status: MessageStatus): boolean {
  return (SUCCESS_STATUSES as readonly MessageStatus[]).includes(status);
}

export function isInFlight(status: MessageStatus): boolean {
  return (IN_FLIGHT_STATUSES as readonly MessageStatus[]).includes(status);
}

export function progressRank(status: MessageStatus): number {
  return PROGRESS_RANK[status];
}

/**
 * Nothing leaves a terminal status. CANCELED only from QUEUED -- once the
 * gateway holds a message the send may already have happened. FAILED from any
 * non-terminal status. QUEUED is never reachable: retry is its own operation, so
 * no gateway report can resurrect a sent message. Otherwise the rank must advance.
 */
export function canTransition(from: MessageStatus, to: MessageStatus): boolean {
  if (isTerminal(from)) return false;
  if (to === 'CANCELED') return from === 'QUEUED';
  if (to === 'FAILED') return true;
  if (to === 'QUEUED') return false;
  return progressRank(to) > progressRank(from);
}

/** Returns the status to persist: the existing one if the report is stale. */
export function reconcileStatus(current: MessageStatus, reported: MessageStatus): MessageStatus {
  return canTransition(current, reported) ? reported : current;
}

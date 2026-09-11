/**
 * Every key in one place: a mutation invalidates a named key rather than an
 * ad-hoc literal that quietly stops matching. Also the seam that would confine a
 * future swap to SSE.
 */
export const queryKeys = {
  queue: ['messages', 'queue'] as const,
  messages: (status?: string) => ['messages', 'list', status ?? 'all'] as const,
  message: (id: string) => ['messages', 'detail', id] as const,
  stats: ['stats'] as const,
  activity: (range: string) => ['stats', 'activity', range] as const,
  settings: ['settings'] as const,
  gateway: ['gateway', 'health'] as const,
};

/** The queue is what people watch drain; settings change only on demand. */
export const POLL = {
  queue: 2000,
  stats: 3000,
  gateway: 5000,
  /** While a permission is missing, the user is watching for it to clear. */
  gatewayBlocked: 1500,
  detail: 2000,
} as const;

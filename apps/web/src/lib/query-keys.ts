/**
 * Every React Query key in one place.
 *
 * Centralizing them keeps invalidation honest -- a mutation invalidates a named
 * key rather than an ad-hoc array literal that quietly stops matching. It is
 * also the seam that would confine a future swap from polling to SSE to this
 * layer alone.
 */
export const queryKeys = {
  queue: ['messages', 'queue'] as const,
  messages: (status?: string) => ['messages', 'list', status ?? 'all'] as const,
  message: (id: string) => ['messages', 'detail', id] as const,
  stats: ['stats'] as const,
  settings: ['settings'] as const,
  gateway: ['gateway', 'health'] as const,
};

/**
 * Poll intervals.
 *
 * The queue is the live surface a person actually watches drain, so it refreshes
 * briskly. Settings change only when someone changes them, so it does not poll
 * at all and relies on invalidation instead.
 */
export const POLL = {
  queue: 2000,
  stats: 3000,
  gateway: 5000,
  detail: 2000,
} as const;

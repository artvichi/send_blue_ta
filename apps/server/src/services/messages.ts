import type { MessageDetailDto, StatsDto } from '@sb/shared';
import { prisma } from '../db/prisma.js';
import type { Message, MessageEvent, MessageStatus } from '../db/generated/client.js';
import { queueProjection, toDto } from './message-dto.js';
import { countsByStatus, findMessage } from '../repositories/messages.js';
import { queueState } from '../scheduler/queue-state.js';

export interface ListOptions {
  status?: MessageStatus | undefined;
  limit: number;
  cursor?: string | undefined;
}

export async function listMessages(options: ListOptions) {
  const projection = await queueProjection();

  const messages = await prisma.message.findMany({
    where: options.status ? { status: options.status } : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: options.limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
  });

  const hasMore = messages.length > options.limit;
  const page = hasMore ? messages.slice(0, options.limit) : messages;

  return {
    items: page.map((m) => toDto(m, projection)),
    nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/**
 * The scheduler screen shows the queue in send order -- the order messages will
 * actually go out -- rather than newest-first like the dashboard table.
 */
export async function listQueue(limit: number) {
  const state = await queueState();
  const projection = await queueProjection();

  const messages = await prisma.message.findMany({
    where: { status: 'QUEUED' },
    orderBy: state.policy.name === 'TIMESTAMPED'
      ? [{ scheduledAt: 'asc' }, { priority: 'desc' }, { queueSeq: 'asc' }]
      : [{ queueSeq: 'asc' }],
    take: limit,
  });

  return { items: messages.map((m) => toDto(m, projection)), nextCursor: null };
}

export async function getMessageDetail(id: string): Promise<MessageDetailDto | null> {
  const message = await findMessage(id);
  if (!message) return null;

  const projection = await queueProjection();
  const events = (message as Message & { events: MessageEvent[] }).events;

  return {
    ...toDto(message, projection),
    events: events.map((e) => ({
      id: e.id,
      status: e.status,
      detail: (e.detail ?? null) as unknown,
      occurredAt: e.occurredAt.toISOString(),
    })),
  };
}

export async function getStats(): Promise<StatsDto> {
  const [counts, state] = await Promise.all([countsByStatus(), queueState()]);

  const inFlight = counts.DISPATCHING + counts.ACCEPTED + counts.SENT;
  // DELIVERED counts as success: RECEIVED only ever arrives when the recipient
  // has read receipts enabled, so treating it as the only success state would
  // permanently understate delivery.
  const delivered = counts.DELIVERED + counts.RECEIVED;
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  const nextDueAt = state.settings.paused
    ? null
    : new Date(state.now.getTime() + state.msUntilNext).toISOString();

  return {
    queued: counts.QUEUED,
    inFlight,
    delivered,
    failed: counts.FAILED,
    canceled: counts.CANCELED,
    total,
    lastDispatchedAt: state.lastDispatchedAt?.toISOString() ?? null,
    nextDueAt,
  };
}

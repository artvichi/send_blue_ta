import type { MessageDto, MessageDetailDto, StatsDto } from '@sb/shared';
import { projectQueueEtas } from '@sb/shared';
import { prisma } from '../db/prisma.js';
import type { Message, MessageEvent, MessageStatus } from '../db/generated/client.js';
import { countsByStatus, findMessage, listQueued } from '../repositories/messages.js';
import { queueState } from '../scheduler/ticker.js';

/**
 * Queue position and projected send time are derived on read, never stored.
 *
 * Storing them would mean rewriting every row behind a cancelled message, and
 * every row in the queue whenever the interval changes. Deriving them means
 * both are always correct and neither can drift.
 */
async function queueProjection(): Promise<Map<string, { position: number; etaAt: Date }>> {
  const state = await queueState();
  const queued = await listQueued(state.policy);
  const etas = projectQueueEtas(queued.length, state.etaInput);

  const projection = new Map<string, { position: number; etaAt: Date }>();
  queued.forEach((row, index) => {
    const etaAt = etas[index];
    if (etaAt) projection.set(row.id, { position: index, etaAt });
  });
  return projection;
}

function toDto(
  message: Message,
  projection: Map<string, { position: number; etaAt: Date }>,
): MessageDto {
  const projected = projection.get(message.id);
  return {
    id: message.id,
    queueSeq: message.queueSeq.toString(),
    to: message.toE164,
    body: message.body,
    status: message.status,
    attempts: message.attempts,
    lastError: message.lastError,
    providerGuid: message.providerGuid,
    createdAt: message.createdAt.toISOString(),
    dispatchedAt: message.dispatchedAt?.toISOString() ?? null,
    sentAt: message.sentAt?.toISOString() ?? null,
    deliveredAt: message.deliveredAt?.toISOString() ?? null,
    receivedAt: message.receivedAt?.toISOString() ?? null,
    position: projected?.position ?? null,
    etaAt: projected?.etaAt.toISOString() ?? null,
  };
}

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

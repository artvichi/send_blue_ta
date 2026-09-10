import type { MessageDto } from '@sb/shared';
import { projectQueueEtas } from '@sb/shared';
import type { Message } from '../db/generated/client.js';
import { listQueued } from '../repositories/message-queue.js';
import { queueState } from '../scheduler/ticker.js';

/** Where a queued message sits, and when it is projected to go out. */
export type QueueProjection = Map<string, { position: number; etaAt: Date }>;

/**
 * Queue position and projected send time are derived on read, never stored.
 *
 * Storing them would mean rewriting every row behind a cancelled message, and
 * every row in the queue whenever the interval changes. Deriving them means
 * both are always correct and neither can drift.
 */
export async function queueProjection(): Promise<QueueProjection> {
  const state = await queueState();
  const queued = await listQueued(state.policy);
  const etas = projectQueueEtas(queued.length, state.etaInput);

  const projection: QueueProjection = new Map();
  queued.forEach((row, index) => {
    const etaAt = etas[index];
    if (etaAt) projection.set(row.id, { position: index, etaAt });
  });
  return projection;
}

export function toDto(message: Message, projection: QueueProjection): MessageDto {
  const projected = projection.get(message.id);
  return {
    id: message.id,
    queueSeq: message.queueSeq.toString(),
    to: message.toHandle,
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

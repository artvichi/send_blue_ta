import type { RecipientDto } from '@sb/shared';
import { handleKind } from '@sb/shared';
import type { Recipient } from '../db/generated/client.js';
import { messageCountsByHandle, searchRecipients } from '../repositories/recipients.js';

export function toRecipientDto(recipient: Recipient, messageCount: number): RecipientDto {
  return {
    id: recipient.id,
    name: recipient.name,
    handle: recipient.handle,
    kind: handleKind(recipient.handle),
    messageCount,
    createdAt: recipient.createdAt.toISOString(),
    updatedAt: recipient.updatedAt.toISOString(),
  };
}

export async function listRecipients(q: string | undefined, limit: number) {
  const recipients = await searchRecipients(q, limit);
  const counts = await messageCountsByHandle(recipients.map((r) => r.handle));
  return { items: recipients.map((r) => toRecipientDto(r, counts.get(r.handle) ?? 0)) };
}

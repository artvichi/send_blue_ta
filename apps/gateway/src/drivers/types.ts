import type { MessageStatus } from '@sb/shared';

export interface StatusEvent {
  status: Extract<MessageStatus, 'SENT' | 'DELIVERED' | 'RECEIVED' | 'FAILED'>;
  occurredAt: Date;
  error?: string;
}

export interface SendResult {
  /** Stable identifier for the sent message. For iMessage this is the chat.db GUID. */
  providerGuid: string;
  sentAt: Date;
}

export type Unsubscribe = () => void;

/**
 * How a message reaches the wire. `applescript` and `mock` ship; a hosted
 * provider would be a third implementation, changing nothing above it.
 */
export interface MessageDriver {
  readonly name: string;

  /** Verify the driver can actually operate; throws with a fixable message. */
  preflight(): Promise<void>;

  send(to: string, body: string): Promise<SendResult>;

  /** Implementations must tolerate never seeing RECEIVED. */
  watch(providerGuid: string, onStatus: (event: StatusEvent) => void): Unsubscribe;
}

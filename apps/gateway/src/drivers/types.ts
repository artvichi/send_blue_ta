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
 * How the system actually puts a message on the wire.
 *
 * Two implementations ship: `applescript` (real iMessage via Messages.app plus
 * chat.db polling for delivery) and `mock` (the same lifecycle on timers).
 * A hosted provider -- the SendBlue API, BlueBubbles -- would be a third
 * implementation of this same interface, changing nothing above it.
 */
export interface MessageDriver {
  readonly name: string;

  /** Verify the driver can actually operate; throws with a fixable message. */
  preflight(): Promise<void>;

  send(to: string, body: string): Promise<SendResult>;

  /**
   * Watch an already-sent message for delivery and read receipts.
   *
   * Returns an unsubscribe function. Implementations must tolerate never seeing
   * RECEIVED: it only arrives when the recipient has read receipts enabled.
   */
  watch(providerGuid: string, onStatus: (event: StatusEvent) => void): Unsubscribe;
}

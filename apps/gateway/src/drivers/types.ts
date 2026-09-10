import type { MessageStatus } from '@sb/shared';

export interface DriverCapabilities {
  /** Can claim and send. */
  ready: boolean;
  /** Null where the permission does not apply, as with the mock driver. */
  fullDiskAccess: boolean | null;
  automation: boolean | null;
  hostApp: string | null;
}

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

  /**
   * What the driver can currently do. Reported rather than thrown: macOS
   * permissions are granted by a human at an unpredictable moment, so the
   * gateway stays up and starts working when they appear.
   */
  capabilities(): Promise<DriverCapabilities>;

  send(to: string, body: string): Promise<SendResult>;

  /** Implementations must tolerate never seeing RECEIVED. */
  watch(providerGuid: string, onStatus: (event: StatusEvent) => void): Unsubscribe;
}

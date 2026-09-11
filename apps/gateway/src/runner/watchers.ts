import type { LeaseDto } from '@sb/shared';
import type { MessageDriver, Unsubscribe } from '../drivers/types.js';
import type { StatusReport } from '../server/client.js';
import { logger } from '../logger.js';

export interface WatcherRegistry {
  /** Follow one sent message for delivery in the background. */
  watch(lease: LeaseDto, providerGuid: string): void;
  stopAll(): void;
  readonly size: number;
}

/**
 * Background delivery watchers, one per sent message.
 *
 * Kept as a registry rather than fire-and-forget closures so that shutdown can
 * cancel every poll timer, and so the count is observable in a test.
 */
export function createWatchers(
  driver: MessageDriver,
  reportStatus: (report: StatusReport) => Promise<void>,
): WatcherRegistry {
  const active = new Set<Unsubscribe>();

  return {
    get size() {
      return active.size;
    },

    watch(lease, providerGuid) {
      const unsubscribe = driver.watch(providerGuid, (event) => {
        void reportStatus({
          messageId: lease.messageId,
          dispatchToken: lease.dispatchToken,
          status: event.status,
          occurredAt: event.occurredAt,
          ...(event.error ? { error: event.error } : {}),
        }).catch((err) =>
          logger.warn('failed to report watched status', { error: String(err) }),
        );

        // Nothing can follow either of these, so release the timer.
        if (event.status === 'RECEIVED' || event.status === 'FAILED') {
          unsubscribe();
          active.delete(unsubscribe);
        }
      });

      active.add(unsubscribe);
    },

    stopAll() {
      for (const unsubscribe of active) unsubscribe();
      active.clear();
    },
  };
}

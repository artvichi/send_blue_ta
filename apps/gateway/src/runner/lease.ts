import type { LeaseDto } from '@sb/shared';
import type { MessageDriver } from '../drivers/types.js';
import type { StatusReport } from '../server/client.js';
import type { WatcherRegistry } from './watchers.js';
import { logger } from '../logger.js';

export interface LeaseDeps {
  driver: MessageDriver;
  reportStatus: (report: StatusReport) => Promise<void>;
  watchers: WatcherRegistry;
}

/**
 * One leased message, from acknowledgement to hand-off.
 *
 * Pure with respect to its dependencies so the double-send guard -- the one
 * piece of gateway logic that must never regress -- can be tested against a
 * fake driver without a server or a Mac.
 */
export async function handleLease(lease: LeaseDto, deps: LeaseDeps): Promise<void> {
  const { driver, reportStatus, watchers } = deps;
  const { messageId, dispatchToken } = lease;
  logger.info('lease received', { messageId, to: lease.to });

  await reportStatus({ messageId, dispatchToken, status: 'ACCEPTED', occurredAt: new Date() });

  // The double-send guard. A non-null GUID means a previous attempt already
  // sent this message and only its status report was lost -- so re-sending
  // would text a real person twice. Sending an iMessage cannot be undone, so
  // this check comes before the driver, not after it.
  if (lease.providerGuid) {
    logger.warn('message already sent on a previous attempt; re-attaching instead of re-sending', {
      messageId,
      providerGuid: lease.providerGuid,
    });
    await reportStatus({
      messageId,
      dispatchToken,
      status: 'SENT',
      occurredAt: new Date(),
      providerGuid: lease.providerGuid,
    });
    watchers.watch(lease, lease.providerGuid);
    return;
  }

  try {
    const result = await driver.send(lease.to, lease.body);

    // The GUID travels with ACCEPTED rather than SENT: it is the double-send
    // guard and must be persisted the instant the message exists, but SENT
    // should mean Messages actually sent it. The watcher reports that when
    // chat.db sets is_sent, so a message that Messages creates and then fails
    // to deliver is never recorded as having gone out.
    await reportStatus({
      messageId,
      dispatchToken,
      status: 'ACCEPTED',
      occurredAt: result.sentAt,
      providerGuid: result.providerGuid,
    });

    watchers.watch(lease, result.providerGuid);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('send failed', { messageId, error: message });
    await reportStatus({
      messageId,
      dispatchToken,
      status: 'FAILED',
      occurredAt: new Date(),
      error: message,
    });
  }
}

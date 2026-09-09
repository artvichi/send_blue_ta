import type { LeaseDto } from '@sb/shared';
import { logger } from './logger.js';
import { config } from './config.js';
import type { MessageDriver, Unsubscribe } from './drivers/index.js';
import { claimLease, reportStatus, sendHeartbeat, ServerUnavailableError } from './server-client.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The gateway loop.
 *
 * Claim a message, acknowledge it, send it, then keep watching it for delivery
 * while going back for the next one. Watching is deliberately not awaited: a
 * read receipt can take minutes or never arrive, and blocking the loop on it
 * would stall the queue behind a message nobody is going to open.
 */
export class GatewayRunner {
  private running = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private readonly watchers = new Set<Unsubscribe>();

  constructor(private readonly driver: MessageDriver) {}

  async start(): Promise<void> {
    this.running = true;

    this.heartbeatTimer = setInterval(
      () => void sendHeartbeat(this.driver.name).catch(() => undefined),
      config().HEARTBEAT_INTERVAL_MS,
    );
    await sendHeartbeat(this.driver.name).catch(() => undefined);

    logger.info('gateway running', {
      driver: this.driver.name,
      server: config().SERVER_URL,
      gatewayId: config().GATEWAY_ID,
    });

    while (this.running) {
      try {
        const lease = await claimLease();
        if (lease) await this.handleLease(lease);
      } catch (err) {
        if (err instanceof ServerUnavailableError) {
          // The server being down is expected during a restart or deploy. Keep
          // trying quietly rather than crashing the gateway.
          logger.warn('server unreachable, retrying in 5s', { error: err.message });
          await sleep(5000);
        } else {
          logger.error('gateway loop error', { error: String(err) });
          await sleep(2000);
        }
      }
    }
  }

  stop(): void {
    this.running = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const unsubscribe of this.watchers) unsubscribe();
    this.watchers.clear();
  }

  private async handleLease(lease: LeaseDto): Promise<void> {
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
      this.watch(lease, lease.providerGuid);
      return;
    }

    try {
      const result = await this.driver.send(lease.to, lease.body);

      await reportStatus({
        messageId,
        dispatchToken,
        status: 'SENT',
        occurredAt: result.sentAt,
        providerGuid: result.providerGuid,
      });

      this.watch(lease, result.providerGuid);
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

  /** Watch for delivery in the background; never block the loop on a receipt. */
  private watch(lease: LeaseDto, providerGuid: string): void {
    const unsubscribe = this.driver.watch(providerGuid, (event) => {
      void reportStatus({
        messageId: lease.messageId,
        dispatchToken: lease.dispatchToken,
        status: event.status,
        occurredAt: event.occurredAt,
        ...(event.error ? { error: event.error } : {}),
      }).catch((err) => logger.warn('failed to report watched status', { error: String(err) }));

      if (event.status === 'RECEIVED' || event.status === 'FAILED') {
        unsubscribe();
        this.watchers.delete(unsubscribe);
      }
    });

    this.watchers.add(unsubscribe);
  }
}

import type { LeaseDto } from '@sb/shared';
import { logger } from './logger.js';
import { config } from './config.js';
import type { MessageDriver, Unsubscribe } from './drivers/index.js';
import { claimLease, reportStatus, sendHeartbeat, ServerUnavailableError } from './server-client.js';
import type { DriverCapabilities } from './drivers/index.js';

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
  private caps: DriverCapabilities = {
    ready: false,
    fullDiskAccess: null,
    automation: null,
    hostApp: null,
  };
  private warnedNotReady = false;

  constructor(private readonly driver: MessageDriver) {}

  async start(): Promise<void> {
    this.running = true;

    const beat = async () => {
      await this.refreshCapabilities();
      await sendHeartbeat(this.driver.name, this.caps).catch(() => undefined);
    };

    this.heartbeatTimer = setInterval(() => void beat(), config().HEARTBEAT_INTERVAL_MS);
    await beat();

    logger.info('gateway running', {
      driver: this.driver.name,
      server: config().SERVER_URL,
      gatewayId: config().GATEWAY_ID,
    });

    while (this.running) {
      try {
        // Claiming without the permissions to send would just fail every
        // message it took. Wait, and keep publishing why through the heartbeat.
        if (!this.caps.ready) {
          if (!this.warnedNotReady) {
            this.warnedNotReady = true;
            logger.warn('waiting on macOS permissions before claiming any messages', {
              fullDiskAccess: this.caps.fullDiskAccess,
              automation: this.caps.automation,
              hostApp: this.caps.hostApp,
            });
          }
          await sleep(3000);
          await this.refreshCapabilities();
          continue;
        }

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

  /** Cheap while granted, brisk while missing, so the UI clears promptly. */
  private async refreshCapabilities(): Promise<void> {
    const previous = this.caps.ready;
    this.caps = await this.driver.capabilities();
    if (this.caps.ready && !previous) {
      this.warnedNotReady = false;
      logger.info('macOS permissions granted -- claiming messages', {
        driver: this.driver.name,
      });
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

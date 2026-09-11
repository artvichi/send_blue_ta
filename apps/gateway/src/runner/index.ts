import { logger } from '../logger.js';
import { config } from '../config.js';
import type { DriverCapabilities, MessageDriver } from '../drivers/types.js';
import {
  claimLease,
  reportStatus,
  sendHeartbeat,
  ServerUnavailableError,
} from '../server/client.js';
import { handleLease } from './lease.js';
import { createWatchers } from './watchers.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How long a blocked gateway waits between permission probes. */
const BLOCKED_PROBE_MS = 3000;

export interface Runner {
  /** Resolves when the loop has exited. */
  start(): Promise<void>;
  /** Ask the loop to finish its current lease and exit; resolves when it has. */
  stop(): Promise<void>;
}

/**
 * The gateway loop.
 *
 * Claim a message, acknowledge it, send it, then keep watching it for delivery
 * while going back for the next one. Watching is deliberately not awaited: a
 * read receipt can take minutes or never arrive, and blocking the loop on it
 * would stall the queue behind a message nobody is going to open.
 */
export function createRunner(driver: MessageDriver): Runner {
  const cfg = config();
  const watchers = createWatchers(driver, reportStatus);

  let running = false;
  let loop: Promise<void> | null = null;
  // Aborts an idle long-poll on stop. A send in progress is never aborted.
  let polling = new AbortController();
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let caps: DriverCapabilities = {
    ready: false,
    fullDiskAccess: null,
    automation: null,
    hostApp: null,
  };
  let warnedNotReady = false;

  /** Cheap while granted, brisk while missing, so the UI clears promptly. */
  async function refreshCapabilities(): Promise<void> {
    const wasReady = caps.ready;
    caps = await driver.capabilities();
    if (caps.ready && !wasReady) {
      warnedNotReady = false;
      logger.info('macOS permissions granted -- claiming messages', { driver: driver.name });
    }
  }

  async function beat(): Promise<void> {
    await refreshCapabilities();
    await sendHeartbeat(driver.name, caps).catch(() => undefined);
  }

  async function waitForPermissions(): Promise<void> {
    if (!warnedNotReady) {
      warnedNotReady = true;
      logger.warn('waiting on macOS permissions before claiming any messages', {
        fullDiskAccess: caps.fullDiskAccess,
        automation: caps.automation,
        hostApp: caps.hostApp,
      });
    }
    await sleep(BLOCKED_PROBE_MS);

    // Publish every blocked-state probe rather than waiting for the heartbeat
    // timer. This is the only state the dashboard actively watches -- someone
    // is sitting in System Settings waiting for the banner to clear -- and it
    // is also when the gateway has nothing else to do.
    await beat();
  }

  async function run(): Promise<void> {
    while (running) {
      try {
        // Claiming without the permissions to send would just fail every
        // message it took. Wait, and keep publishing why through the heartbeat.
        if (!caps.ready) {
          await waitForPermissions();
          continue;
        }

        const lease = await claimLease(polling.signal);
        if (lease && running) await handleLease(lease, { driver, reportStatus, watchers });
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

  return {
    async start() {
      running = true;
      polling = new AbortController();
      heartbeatTimer = setInterval(() => void beat(), cfg.HEARTBEAT_INTERVAL_MS);
      await beat();

      logger.info('gateway running', {
        driver: driver.name,
        server: cfg.SERVER_URL,
        gatewayId: cfg.GATEWAY_ID,
      });

      loop = run();
      await loop;
    },

    async stop() {
      running = false;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      // Drop an idle long-poll immediately, but let an in-progress send finish:
      // cutting osascript off halfway is how a message goes out with no GUID
      // recorded against it.
      polling.abort();
      await loop;
      watchers.stopAll();
    },
  };
}

import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { MessageDriver, StatusEvent, Unsubscribe } from './types.js';

/**
 * Simulates the real driver's lifecycle on timers.
 *
 * This is not a test stub bolted on afterwards -- it is what makes the whole
 * system runnable by a reviewer who is not on a Mac, has not granted Full Disk
 * Access, and would rather not send real texts to a real phone. It also lets
 * the integration suite exercise the full path in CI.
 *
 * `MOCK_FAILURE_RATE` injects send failures so the unhappy path -- FAILED, then
 * retry from the dashboard -- can be demonstrated on demand.
 */
export function createMockDriver(): MessageDriver {
  return {
    name: 'mock',

    async preflight() {
      logger.info('mock driver ready -- no messages will actually be sent');
    },

    async send(to: string) {
      const { MOCK_STEP_MS, MOCK_FAILURE_RATE } = config();
      await sleep(MOCK_STEP_MS);

      if (Math.random() < MOCK_FAILURE_RATE) {
        throw new Error('Simulated send failure (MOCK_FAILURE_RATE)');
      }

      const providerGuid = `mock-${randomUUID()}`;
      logger.debug('mock send complete', { to, providerGuid });
      return { providerGuid, sentAt: new Date() };
    },

    watch(_providerGuid: string, onStatus: (event: StatusEvent) => void): Unsubscribe {
      const { MOCK_STEP_MS } = config();
      let cancelled = false;

      const timers: NodeJS.Timeout[] = [];
      const emit = (event: StatusEvent, delay: number) => {
        const timer = setTimeout(() => {
          if (!cancelled) onStatus(event);
        }, delay);
        timers.push(timer);
      };

      emit({ status: 'DELIVERED', occurredAt: new Date() }, MOCK_STEP_MS);
      // Read receipts are the exception in reality, so the mock only sometimes
      // produces one. A driver that always reached RECEIVED would paint a
      // rosier picture than the real thing ever does.
      if (Math.random() < 0.5) {
        emit({ status: 'RECEIVED', occurredAt: new Date() }, MOCK_STEP_MS * 3);
      }

      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

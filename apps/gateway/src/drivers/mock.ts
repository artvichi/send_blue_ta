import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../logger.js';
import type { MessageDriver, StatusEvent, Unsubscribe } from './types.js';

/**
 * The real lifecycle on timers. Not a test stub: it is what lets the system run
 * without a Mac, without Full Disk Access, and without texting a real person --
 * and it powers CI. MOCK_FAILURE_RATE exercises the unhappy path on demand.
 */
export function createMockDriver(): MessageDriver {
  return {
    name: 'mock',

    async capabilities() {
      return { ready: true, fullDiskAccess: null, automation: null, hostApp: null };
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
      // Only sometimes: a mock that always reached RECEIVED would flatter itself.
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

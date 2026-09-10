import { config } from '../config.js';
import { createMockDriver } from './mock.js';
import { createAppleScriptDriver } from './applescript.js';
import type { MessageDriver } from './types.js';

export type {
  MessageDriver,
  StatusEvent,
  SendResult,
  Unsubscribe,
  DriverCapabilities,
} from './types.js';

export function createDriver(name = config().GATEWAY_DRIVER): MessageDriver {
  switch (name) {
    case 'applescript':
      return createAppleScriptDriver();
    case 'mock':
      return createMockDriver();
    default: {
      // Exhaustiveness: adding a driver to the enum without handling it here
      // becomes a compile error rather than a runtime surprise.
      const unreachable: never = name;
      throw new Error(`Unknown gateway driver: ${String(unreachable)}`);
    }
  }
}

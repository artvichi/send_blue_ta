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

export function createDriver(name = config().GATEWAY_DRIVER, platform = process.platform): MessageDriver {
  switch (name) {
    case 'applescript':
      // Messages.app, osascript and ~/Library/Messages/chat.db exist only on
      // macOS. Say so up front rather than failing on the first send with
      // "osascript: command not found".
      if (platform !== 'darwin') {
        throw new Error(
          `GATEWAY_DRIVER=applescript needs macOS (this is ${platform}). ` +
            'The gateway must run natively on a Mac signed in to Messages; ' +
            'use GATEWAY_DRIVER=mock elsewhere.',
        );
      }
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

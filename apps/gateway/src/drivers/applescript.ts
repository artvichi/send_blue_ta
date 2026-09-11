import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { ChatDbAccessError, findSentMessage, getMessageState } from '../macos/chatdb.js';
import { appleTimeToDate } from '../macos/apple-time.js';
import { hasAutomationAccess, hasFullDiskAccess } from '../macos/permissions.js';
import { detectHostApp } from '../macos/host-app.js';
import type { MessageDriver, StatusEvent, Unsubscribe } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Send an iMessage through Messages.app.
 *
 * The buddy lookup targets the iMessage service explicitly rather than letting
 * Messages choose, so a number with an SMS route does not silently go out green.
 * The handle may be a phone number or an Apple ID email -- `participant` accepts
 * either. If the recipient has no iMessage account the send fails, which is the
 * honest outcome for an iMessage scheduler.
 */
const SEND_SCRIPT = `
on run {targetHandle, messageBody}
  tell application "Messages"
    set targetService to 1st account whose service type = iMessage
    set targetBuddy to participant targetHandle of targetService
    send messageBody to targetBuddy
  end tell
end run
`;

export function createAppleScriptDriver(): MessageDriver {
  return {
    name: 'applescript',

    /**
     * Report the two macOS permissions rather than demanding them. They are
     * granted by a human in System Settings at an unpredictable moment, so the
     * gateway stays up, publishes what is missing, and starts claiming the
     * instant both appear.
     */
    async capabilities() {
      const [fullDiskAccess, automation] = await Promise.all([
        hasFullDiskAccess(),
        hasAutomationAccess(),
      ]);
      return {
        ready: fullDiskAccess && automation,
        fullDiskAccess,
        automation,
        hostApp: detectHostApp().name,
      };
    },

    async send(to: string, body: string) {
      // Captured before the send so the correlation window cannot miss the row.
      // Two seconds of slack absorbs clock skew between the send and the write.
      const sentAfter = new Date(Date.now() - 2000);

      try {
        await execFileAsync('osascript', ['-e', SEND_SCRIPT, to, body], { timeout: 30_000 });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`osascript send failed: ${detail.split('\n')[0]}`);
      }

      // AppleScript returns nothing useful, so the message is located by
      // correlation. A few retries cover the lag before Messages commits the row.
      for (let attempt = 0; attempt < 10; attempt++) {
        await sleep(500);
        const row = await findSentMessage(to, body, sentAfter);
        if (row) {
          logger.debug('correlated sent message', { guid: row.guid });
          return { providerGuid: row.guid, sentAt: appleTimeToDate(row.date) ?? new Date() };
        }
      }

      // The send very likely succeeded; we simply could not find the row. Failing
      // here is the safe choice -- the message is marked FAILED rather than
      // silently tracked as delivered, and the double-send guard stays intact
      // because no GUID was recorded.
      throw new Error(
        'Sent via AppleScript but could not correlate the message in chat.db within 5s',
      );
    },

    /**
     * Poll chat.db for delivery and read receipts.
     *
     * Polling rather than watching: chat.db offers no change notification, and
     * a filesystem watcher on a WAL database fires constantly without telling
     * you what changed.
     */
    watch(providerGuid: string, onStatus: (event: StatusEvent) => void): Unsubscribe {
      const { CHATDB_POLL_MS, CHATDB_WATCH_TIMEOUT_MS } = config();
      let cancelled = false;
      let reportedSent = false;
      let reportedDelivered = false;
      const startedAt = Date.now();

      const tick = async (): Promise<void> => {
        if (cancelled) return;

        try {
          const row = await getMessageState(providerGuid);

          if (row) {
            if (row.error && row.error !== 0) {
              onStatus({
                status: 'FAILED',
                occurredAt: new Date(),
                error: `Messages reported error code ${row.error}`,
              });
              return;
            }

            // Only once Messages says it actually left the machine.
            if (!reportedSent && row.is_sent === 1) {
              reportedSent = true;
              onStatus({ status: 'SENT', occurredAt: appleTimeToDate(row.date) ?? new Date() });
            }

            if (!reportedDelivered && (row.is_delivered === 1 || row.date_delivered)) {
              reportedDelivered = true;
              onStatus({
                status: 'DELIVERED',
                occurredAt: appleTimeToDate(row.date_delivered) ?? new Date(),
              });
            }

            if (row.is_read === 1 || row.date_read) {
              onStatus({
                status: 'RECEIVED',
                occurredAt: appleTimeToDate(row.date_read) ?? new Date(),
              });
              return; // Terminal: nothing further can arrive.
            }
          }
        } catch (err) {
          if (err instanceof ChatDbAccessError) {
            logger.error('lost access to chat.db while watching', { error: err.message });
            return;
          }
          logger.warn('chat.db poll failed, will retry', { error: String(err) });
        }

        // Stop watching eventually. RECEIVED requires the recipient to have read
        // receipts enabled, so for most messages it never arrives at all and
        // watching forever would leak a timer per message.
        if (Date.now() - startedAt > CHATDB_WATCH_TIMEOUT_MS) {
          logger.debug('stopped watching message', { providerGuid, reportedDelivered });
          return;
        }

        timer = setTimeout(() => void tick(), CHATDB_POLL_MS);
      };

      let timer: NodeJS.Timeout = setTimeout(() => void tick(), CHATDB_POLL_MS);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    },
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

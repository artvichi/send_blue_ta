import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { CHAT_DB_PATH, queryChatDb } from './chatdb.js';
import { logger } from './logger.js';
import type { HostApp } from './host-app.js';

export { detectHostApp, type HostApp } from './host-app.js';

const execFileAsync = promisify(execFile);

/**
 * Neither permission can be granted programmatically -- TCC requires a human
 * click. What is automated is everything around it: naming the exact app,
 * opening the exact pane, and detecting the moment access appears.
 */

export type Permission = 'full-disk-access' | 'automation';

/** The only honest test is to read it. */
export async function hasFullDiskAccess(): Promise<boolean> {
  if (!existsSync(CHAT_DB_PATH)) return false;
  try {
    await queryChatDb('SELECT 1 AS ok FROM message LIMIT 1;');
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether AppleScript may drive Messages. The first attempt triggers the system
 * consent dialog, which is the happy path.
 *
 * The probe asks for the application's own `version` -- a property that always
 * exists. An earlier version asked for `name of first account`; accounts do not
 * expose `name`, so it failed with -1728 on a perfectly authorised machine and
 * the UI insisted the permission was missing. A probe must only be able to fail
 * for the reason it is testing.
 */
export async function hasAutomationAccess(): Promise<boolean> {
  try {
    await execFileAsync('osascript', ['-e', 'tell application "Messages" to return version'], {
      timeout: 20_000,
    });
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // -1743 is "Not authorized to send Apple events" -- the case we are testing.
    // Anything else is logged rather than silently reported as denied.
    if (!/-1743|not authori[sz]ed/i.test(detail)) {
      logger.warn('automation probe failed for an unexpected reason', {
        error: detail.split('\n')[0],
      });
    }
    return false;
  }
}

const SETTINGS_PANE: Record<Permission, string> = {
  'full-disk-access':
    'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
};

/** Open System Settings at the exact pane, so nobody has to go hunting. */
export async function openSettings(permission: Permission): Promise<boolean> {
  try {
    await execFileAsync('open', [SETTINGS_PANE[permission]]);
    return true;
  } catch {
    return false;
  }
}

/** Reveal the host app in Finder, so it can be dragged into the list. */
export async function revealHostApp(app: HostApp): Promise<boolean> {
  if (!app.appPath) return false;
  try {
    await execFileAsync('open', ['-R', app.appPath]);
    return true;
  } catch {
    return false;
  }
}

export interface WaitResult {
  granted: boolean;
  waitedMs: number;
}

/**
 * A grant sometimes reaches an already-running process and sometimes does not,
 * depending on TCC's cache. Polling settles it by observation.
 */
export async function waitForPermission(
  check: () => Promise<boolean>,
  { timeoutMs = 180_000, intervalMs = 2000, onTick }: {
    timeoutMs?: number;
    intervalMs?: number;
    onTick?: (elapsedMs: number) => void;
  } = {},
): Promise<WaitResult> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) return { granted: true, waitedMs: Date.now() - startedAt };
    onTick?.(Date.now() - startedAt);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return { granted: await check(), waitedMs: Date.now() - startedAt };
}

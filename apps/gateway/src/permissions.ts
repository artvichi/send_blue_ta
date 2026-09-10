import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { CHAT_DB_PATH, queryChatDb } from './chatdb.js';

const execFileAsync = promisify(execFile);

/**
 * Neither permission can be granted programmatically -- TCC requires a human
 * click. What is automated is everything around it: naming the exact app,
 * opening the exact pane, and detecting the moment access appears.
 */

export type Permission = 'full-disk-access' | 'automation';

export interface HostApp {
  /** What the user will see in the Full Disk Access list. */
  name: string;
  bundleId: string | null;
  appPath: string | null;
}

/**
 * TCC attributes a child process's access to the *responsible* application, so
 * adding `node` grants nothing -- the user must add whatever hosts the shell.
 * Naming the wrong app is the most common way this setup silently fails.
 */
export function detectHostApp(): HostApp {
  const bundleId = process.env.__CFBundleIdentifier ?? null;

  // Walk up the process tree looking for something living in an .app bundle.
  let pid = process.pid;
  for (let depth = 0; depth < 12; depth++) {
    let line: string;
    try {
      line = execFileSync('ps', ['-o', 'ppid=,comm=', '-p', String(pid)], {
        encoding: 'utf8',
      }).trim();
    } catch {
      break;
    }
    if (!line) break;

    const match = /^(\d+)\s+(.*)$/.exec(line);
    if (!match) break;

    const parent = Number(match[1]);
    const command = match[2] ?? '';

    const app = /\/((?:[^/]+)\.app)\//.exec(command);
    if (app?.[1]) {
      const full = /^(.*?\.app)\//.exec(command)?.[1] ?? null;
      return {
        name: app[1].replace(/\.app$/, ''),
        bundleId,
        appPath: full,
      };
    }

    if (parent <= 1) break;
    pid = parent;
  }

  // Fall back to what the terminal advertises about itself.
  const termProgram = process.env.TERM_PROGRAM;
  if (termProgram) return { name: termProgram, bundleId, appPath: null };
  if (bundleId) return { name: bundleId, bundleId, appPath: null };

  return { name: 'your terminal application', bundleId: null, appPath: null };
}

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

/** The first attempt triggers the system consent dialog -- the happy path. */
export async function hasAutomationAccess(): Promise<boolean> {
  try {
    await execFileAsync(
      'osascript',
      ['-e', 'tell application "Messages" to return name of first account'],
      { timeout: 20_000 },
    );
    return true;
  } catch {
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

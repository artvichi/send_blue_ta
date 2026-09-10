import { execFileSync } from 'node:child_process';

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

    const parsed = appFromCommand(command);
    if (parsed) return { ...parsed, bundleId };

    if (parent <= 1) break;
    pid = parent;
  }

  // Fall back to what the terminal advertises about itself.
  const termProgram = process.env.TERM_PROGRAM;
  if (termProgram) return { name: termProgram, bundleId, appPath: null };
  if (bundleId) return { name: bundleId, bundleId, appPath: null };

  return { name: 'your terminal application', bundleId: null, appPath: null };
}

/**
 * The application a process path belongs to, or null if it is not inside a
 * bundle. Split out from the ancestry walk so it can be tested against the real
 * shapes macOS produces -- this is the piece that decides which name the user is
 * told to tick, and naming the wrong one sends them to grant nothing.
 *
 * The first `.app` in the path wins deliberately: helper processes live inside
 * their parent bundle (Orca.app/.../Orca Helper.app) and TCC attributes the
 * permission to the outer application.
 */
export function appFromCommand(command: string): { name: string; appPath: string } | null {
  const match = /^(.*?\/([^/]+)\.app)\//.exec(command);
  if (!match?.[1] || !match?.[2]) return null;
  return { name: match[2], appPath: match[1] };
}

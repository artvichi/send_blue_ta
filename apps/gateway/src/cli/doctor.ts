import {
  detectHostApp,
  hasAutomationAccess,
  hasFullDiskAccess,
  openSettings,
  revealHostApp,
  waitForPermission,
  type HostApp,
} from '../macos/permissions.js';

/**
 * The guided permission setup.
 *
 * macOS will not let any program grant itself these permissions -- that is the
 * entire point of TCC. What this removes is the guesswork around the click:
 * which application to add (not `node`), which pane it lives in, and whether it
 * actually took effect.
 */

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

const say = (line = '') => console.warn(line);

function heading(text: string): void {
  say();
  say(`${BOLD}${text}${RESET}`);
}

function ok(text: string): void {
  say(`  ${GREEN}✓${RESET} ${text}`);
}

function warn(text: string): void {
  say(`  ${YELLOW}!${RESET} ${text}`);
}

function fail(text: string): void {
  say(`  ${RED}✗${RESET} ${text}`);
}

/**
 * Whether to actually guide the user rather than just report.
 *
 * Deliberately not a TTY check: task runners pipe stdout, which would silently
 * downgrade the guided flow to a wall of text at exactly the moment it is most
 * needed. Opening a settings pane is harmless for a human and wrong only in
 * automation, so CI is the thing to detect.
 */
function interactive(): boolean {
  return !process.env.CI && process.env.SBTA_NO_GUIDE !== '1';
}

/**
 * Walk one permission: report it, open the right pane, then watch for it to
 * appear rather than asking the user to confirm it themselves.
 */
async function resolveFullDiskAccess(app: HostApp): Promise<boolean> {
  if (await hasFullDiskAccess()) {
    ok('Full Disk Access — chat.db is readable');
    return true;
  }

  fail('Full Disk Access — cannot read chat.db');
  say();
  say(`  Delivery status is read from ${DIM}~/Library/Messages/chat.db${RESET}, which macOS`);
  say('  protects. Without this the gateway can send, but can never report');
  say(`  ${BOLD}SENT${RESET}, ${BOLD}DELIVERED${RESET} or ${BOLD}RECEIVED${RESET}.`);
  say();
  say(`  Add ${BOLD}${app.name}${RESET} to the list — not "node", not "npm".`);
  say(`  ${DIM}The permission belongs to the app hosting this terminal.${RESET}`);

  if (!interactive()) {
    say();
    say('  Run `npm run gateway:setup` from a terminal to be walked through it.');
    return false;
  }

  say();
  if (await openSettings('full-disk-access')) {
    say(`  ${DIM}Opening System Settings → Privacy & Security → Full Disk Access...${RESET}`);
  } else {
    say('  Open System Settings → Privacy & Security → Full Disk Access.');
  }

  if (app.appPath && (await revealHostApp(app))) {
    say(`  ${DIM}Revealing ${app.name} in Finder so you can drag it into the list.${RESET}`);
  }

  say();
  say(`  ${DIM}Waiting for the permission (up to 3 minutes)...${RESET}`);

  let lastReport = 0;
  const result = await waitForPermission(hasFullDiskAccess, {
    onTick: (elapsed) => {
      if (elapsed - lastReport >= 20_000) {
        lastReport = elapsed;
        say(`  ${DIM}still waiting — ${Math.round(elapsed / 1000)}s${RESET}`);
      }
    },
  });

  if (result.granted) {
    say();
    ok('Full Disk Access granted');
    return true;
  }

  say();
  warn('Still no access.');
  say(`  If ${app.name} is already ticked, quit it completely (${BOLD}Cmd-Q${RESET}) and`);
  say('  reopen — the permission only reaches processes started afterwards.');
  return false;
}

async function resolveAutomation(app: HostApp): Promise<boolean> {
  say(`  ${DIM}Checking AppleScript access to Messages (may prompt)...${RESET}`);

  if (await hasAutomationAccess()) {
    ok('Automation — AppleScript can drive Messages.app');
    return true;
  }

  fail('Automation — AppleScript cannot drive Messages.app');
  say();
  say('  This is how messages are actually sent. macOS normally asks the first');
  say('  time; if it was declined once, it has to be re-enabled by hand.');
  say();
  say(`  Enable ${BOLD}${app.name} → Messages${RESET}.`);

  if (!interactive()) return false;

  say();
  if (await openSettings('automation')) {
    say(`  ${DIM}Opening System Settings → Privacy & Security → Automation...${RESET}`);
  }

  say(`  ${DIM}Waiting for the permission (up to 2 minutes)...${RESET}`);
  const result = await waitForPermission(hasAutomationAccess, { timeoutMs: 120_000 });

  if (result.granted) {
    say();
    ok('Automation granted');
    return true;
  }

  say();
  warn('Still blocked.');
  return false;
}

export interface DoctorResult {
  fullDiskAccess: boolean;
  automation: boolean;
  ready: boolean;
}

/**
 * Check both permissions, guiding through whichever is missing.
 *
 * Returns rather than exiting, so the caller decides what to do -- `gateway:setup`
 * reports and stops; the real driver's preflight continues once satisfied.
 */
export async function runDoctor(): Promise<DoctorResult> {
  const app = detectHostApp();

  heading('macOS permissions');
  say(`  ${DIM}Host application: ${app.name}${app.bundleId ? ` (${app.bundleId})` : ''}${RESET}`);
  say();

  const fullDiskAccess = await resolveFullDiskAccess(app);
  say();
  const automation = await resolveAutomation(app);

  const ready = fullDiskAccess && automation;

  heading(ready ? 'Ready' : 'Not ready');
  if (ready) {
    say(`  ${GREEN}Both permissions are in place.${RESET} Real iMessages can be sent.`);
    say(`  ${DIM}Start the gateway with: npm run gateway:real${RESET}`);
  } else {
    say('  The gateway cannot send real iMessages yet.');
    say(`  ${DIM}Everything still works with: npm run gateway:mock${RESET}`);
  }
  say();

  return { fullDiskAccess, automation, ready };
}

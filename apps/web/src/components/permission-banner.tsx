import { ShieldAlert, ExternalLink } from 'lucide-react';
import { useGatewayHealth } from '@/features/dashboard/api';

/**
 * macOS will not let any program grant itself Full Disk Access or Automation --
 * TCC exists to require a human. So the gateway reports what it is missing and
 * this asks for it in the one place the user is already looking.
 *
 * The links use the `x-apple.systempreferences:` scheme, which opens the exact
 * pane rather than dropping someone at the top of System Settings. The banner
 * disappears on its own: gateway health is polled, so granting the permission
 * clears it without a reload.
 */
const PANES = {
  fullDiskAccess: 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
} as const;

export function PermissionBanner() {
  const { data } = useGatewayHealth();

  // Nothing to say when there is no gateway, when it is the mock (which needs
  // no permissions), or when everything is already granted.
  if (!data || !data.online || data.ready) return null;

  const missing = [
    data.fullDiskAccess === false && {
      key: 'fullDiskAccess' as const,
      name: 'Full Disk Access',
      why: 'to read delivery status from chat.db',
    },
    data.automation === false && {
      key: 'automation' as const,
      name: 'Automation',
      why: 'to send through Messages',
    },
  ].filter(Boolean) as { key: keyof typeof PANES; name: string; why: string }[];

  if (missing.length === 0) return null;

  const app = data.hostApp ?? 'the app running the gateway';

  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-2xl border border-warn/30 bg-warn-soft p-4 sm:flex-row sm:items-start sm:gap-4"
    >
      <ShieldAlert className="size-5 shrink-0 text-warn" aria-hidden />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm font-semibold text-ink">
          The gateway cannot send yet — macOS is blocking it
        </p>

        <p className="text-sm text-ink-soft">
          Grant {missing.length === 2 ? 'these permissions' : 'this permission'} to{' '}
          <strong className="font-semibold text-ink">{app}</strong> — not to <code>node</code>. The
          permission belongs to the app running the gateway. Messages stay queued until then.
        </p>

        <ul className="flex flex-col gap-1.5">
          {missing.map((m) => (
            <li key={m.key} className="text-sm text-ink-soft">
              <a
                href={PANES[m.key]}
                className="inline-flex items-center gap-1.5 font-medium text-warn underline underline-offset-2 hover:no-underline"
              >
                Open {m.name}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>{' '}
              <span className="text-ink-mute">— {m.why}</span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-ink-mute">
          This clears itself the moment access is granted. If {app} is already ticked, quit it
          completely and reopen — the permission only reaches processes started afterwards.
        </p>
      </div>
    </div>
  );
}

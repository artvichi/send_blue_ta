import { useState } from 'react';
import { ShieldAlert, ExternalLink, RefreshCw, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useGatewayHealth, useRecheckPermissions } from '@/api/gateway';
import { Button } from '@/components/ui/button';
import { useNow } from '@/hooks/use-now';
import { formatAgo } from '@/lib/format';

/**
 * macOS will not let any program grant itself Full Disk Access or Automation --
 * TCC exists to require a human. So the gateway reports what it is missing and
 * this asks for it in the one place the user is already looking.
 *
 * The links use the `x-apple.systempreferences:` scheme, which opens the exact
 * pane rather than dropping someone at the top of System Settings.
 *
 * There is deliberately no "dismiss" or "mark resolved": the banner is a
 * rendering of a live probe, not a notification. Dismissing it would hide the
 * only explanation for a queue that never drains, and the messages would stack
 * up silently. Instead the state is falsifiable -- "checked 2s ago" plus a
 * re-check that waits for a genuinely fresh probe -- so it can be trusted to
 * clear itself, and cannot sit there stale.
 */
const PANES = {
  fullDiskAccess: 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles',
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
} as const;

export function PermissionBanner() {
  const { data } = useGatewayHealth();
  const recheck = useRecheckPermissions();
  const now = useNow(1000);

  // A re-check that came back still-blocked. That is the TCC cache: the grant
  // reached the system but not the already-running process, and only a restart
  // of the gateway will pick it up. Worth saying explicitly, because from the
  // user's side they ticked the box and nothing happened.
  const [staleGrant, setStaleGrant] = useState(false);

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

  const onRecheck = () => {
    recheck.mutate(undefined, {
      onSuccess: ({ health, fresh }) => {
        if (!fresh) {
          toast.error('The gateway did not report back', {
            description: 'It may have stopped. Check that it is still running.',
          });
          return;
        }
        if (health.ready) {
          setStaleGrant(false);
          toast.success('Permissions granted', { description: 'The gateway is claiming messages.' });
          return;
        }
        setStaleGrant(true);
        toast.error('Still blocked', {
          description: `macOS is not reporting access for ${app} yet.`,
        });
      },
      onError: () => toast.error('Could not reach the server'),
    });
  };

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

        {staleGrant ? (
          <p className="text-xs text-ink-soft">
            Already ticked the box? Then macOS granted it to the system but not to the running
            process — quit <strong className="font-semibold text-ink">{app}</strong> completely and
            reopen it. TCC only hands the permission to processes started afterwards.
          </p>
        ) : (
          <p className="text-xs text-ink-mute">
            This clears itself the moment access is granted — no need to reload.
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={onRecheck}
            disabled={recheck.isPending}
            className="gap-1.5"
          >
            {recheck.isPending ? (
              <RefreshCw className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="size-3.5" aria-hidden />
            )}
            {recheck.isPending ? 'Checking…' : "I've granted it — re-check"}
          </Button>

          {/* Proof the probe is live. A timestamp that stops advancing is itself
              the signal that the gateway, not the permission, is the problem. */}
          {data.lastSeenAt ? (
            <span className="text-xs tabular-nums text-ink-mute">
              Last checked {formatAgo(data.lastSeenAt, now)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

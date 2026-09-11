import { cn } from '@/lib/utils';
import { useGatewayHealth } from '@/api/gateway';

/**
 * Whether a gateway is out there.
 *
 * The server never connects to the gateway -- the gateway dials out -- so
 * "online" genuinely means "asked for work recently", and the label says so.
 */
export function GatewayIndicator() {
  const { data, isPending } = useGatewayHealth();

  const online = data?.online ?? false;
  const label = isPending
    ? 'Checking gateway'
    : online
      ? `Gateway online${data?.driver ? ` (${data.driver})` : ''}`
      : 'Gateway offline';

  return (
    <span
      className="flex items-center gap-2 text-xs font-medium text-ink-mute"
      title={
        data?.lastSeenAt
          ? `Last seen ${new Date(data.lastSeenAt).toLocaleTimeString()}`
          : 'No gateway has ever connected'
      }
    >
      <span className="relative flex size-2">
        {online && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />
        )}
        <span
          className={cn(
            'relative inline-flex size-2 rounded-full',
            isPending ? 'bg-ink-mute' : online ? 'bg-good' : 'bg-bad',
          )}
        />
      </span>
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

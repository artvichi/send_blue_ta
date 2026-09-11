import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GatewayHealthDto } from '@sb/shared';
import { api } from './client';
import { POLL, queryKeys } from './keys';

/**
 * Poll harder while the gateway is blocked. That is exactly when the page has
 * news worth having (a permission the user just granted) and exactly when the
 * gateway is otherwise idle, so the extra requests cost nothing.
 */
export function useGatewayHealth() {
  return useQuery({
    queryKey: queryKeys.gateway,
    queryFn: api.getGatewayHealth,
    refetchInterval: (query) =>
      query.state.data && query.state.data.online && !query.state.data.ready
        ? POLL.gatewayBlocked
        : POLL.gateway,
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Long enough to outlast a couple of blocked-state heartbeats. */
const RECHECK_TIMEOUT_MS = 15_000;

export interface RecheckResult {
  health: GatewayHealthDto;
  /** False when we gave up waiting -- the gateway never reported back in time. */
  fresh: boolean;
}

/**
 * Re-run the permission probe.
 *
 * The server cannot ask the gateway anything: the gateway dials out, which is
 * the whole reason it works from behind a NAT. So "re-check" is not a command --
 * it waits for the gateway's own next probe to land.
 *
 * The wait is for a `lastSeenAt` strictly newer than the one on screen when the
 * button was pressed, because the gateway re-probes immediately before every
 * heartbeat. A newer timestamp is therefore proof of a probe that ran *after*
 * the click, which is the only thing that makes this button honest rather than
 * a refresh dressed up as a check.
 */
export function useRecheckPermissions() {
  const client = useQueryClient();

  return useMutation<RecheckResult>({
    mutationFn: async () => {
      const before = client.getQueryData<GatewayHealthDto>(queryKeys.gateway)?.lastSeenAt ?? null;
      const deadline = Date.now() + RECHECK_TIMEOUT_MS;

      for (;;) {
        const health = await client.fetchQuery({
          queryKey: queryKeys.gateway,
          queryFn: api.getGatewayHealth,
          staleTime: 0,
        });

        if (health.lastSeenAt !== before) return { health, fresh: true };
        if (Date.now() >= deadline) return { health, fresh: false };
        await sleep(1000);
      }
    },
  });
}

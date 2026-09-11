import { leaseSchema, type LeaseDto, type MessageStatus } from '@sb/shared';
import { config, VERSION } from '../config.js';
import type { DriverCapabilities } from '../drivers/types.js';
import { logger } from '../logger.js';

export class ServerUnavailableError extends Error {}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const { SERVER_URL, GATEWAY_TOKEN } = config();

  try {
    return await fetch(`${SERVER_URL}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${GATEWAY_TOKEN}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    throw new ServerUnavailableError(
      `Cannot reach the server at ${SERVER_URL}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

/**
 * Ask for the next message, blocking until one is available or the wait
 * elapses.
 *
 * The gateway always dials out. Nothing ever connects *to* this process, which
 * is what lets it sit on a laptop behind NAT with no inbound rules -- and the
 * same property is what makes the production topology work, where the server is
 * in AWS and the Mac is not.
 */
export async function claimLease(): Promise<LeaseDto | null> {
  const wait = config().GATEWAY_POLL_WAIT_SECONDS;
  const response = await request(`/api/gateway/lease?wait=${wait}`);

  if (response.status === 204) return null;

  if (response.status === 401) {
    throw new Error('Server rejected GATEWAY_TOKEN. Check it matches the server configuration.');
  }

  if (!response.ok) {
    throw new Error(`Lease request failed: HTTP ${response.status}`);
  }

  return leaseSchema.parse(await response.json());
}

export interface StatusReport {
  messageId: string;
  dispatchToken: string;
  status: MessageStatus;
  occurredAt: Date;
  providerGuid?: string;
  error?: string;
}

/**
 * Report an observed status change.
 *
 * Reports are fire-and-log: the server treats duplicates, stale tokens and
 * out-of-order arrivals as expected input and answers 202 for all of them, so
 * there is nothing here for the gateway to retry or reconcile.
 */
export async function reportStatus(report: StatusReport): Promise<void> {
  const response = await request(`/api/gateway/messages/${report.messageId}/status`, {
    method: 'POST',
    body: JSON.stringify({
      dispatchToken: report.dispatchToken,
      status: report.status,
      occurredAt: report.occurredAt.toISOString(),
      ...(report.providerGuid ? { providerGuid: report.providerGuid } : {}),
      ...(report.error ? { error: report.error } : {}),
    }),
  });

  if (!response.ok) {
    logger.warn('status report rejected', {
      messageId: report.messageId,
      status: report.status,
      http: response.status,
    });
    return;
  }

  logger.debug('status reported', { messageId: report.messageId, status: report.status });
}

/**
 * Liveness plus what the driver can currently do. A null permission means the
 * driver never needed it (the mock), and is sent as granted so the dashboard
 * does not ask for something that does not apply.
 */
export async function sendHeartbeat(
  driver: string,
  capabilities?: DriverCapabilities,
): Promise<void> {
  const response = await request('/api/gateway/heartbeat', {
    method: 'POST',
    body: JSON.stringify({
      gatewayId: config().GATEWAY_ID,
      driver,
      version: VERSION,
      ...(capabilities
        ? {
            capabilities: {
              fullDiskAccess: capabilities.fullDiskAccess ?? true,
              automation: capabilities.automation ?? true,
              hostApp: capabilities.hostApp,
            },
          }
        : {}),
    }),
  });
  if (!response.ok && response.status !== 204) {
    logger.debug('heartbeat rejected', { http: response.status });
  }
}

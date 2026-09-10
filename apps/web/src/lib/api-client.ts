import type {
  GatewayHealthDto,
  MessageDetailDto,
  MessageDto,
  SettingsDto,
  StatsDto,
} from '@sb/shared';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4310';

/** An error carrying the server's machine-readable code and field details. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Is it running on port 3000?');
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? `Request failed with status ${response.status}`,
      error?.details,
    );
  }

  return payload as T;
}

export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}

export type SettingsResponse = SettingsDto & { availablePolicies: string[] };

export const api = {
  scheduleMessage: (input: { to: string; body: string }) =>
    request<MessageDetailDto>('/api/messages', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  /** The queue in the order it will actually be sent. */
  listQueue: () => request<Paged<MessageDto>>('/api/messages/queue?limit=100'),

  /** Everything, newest first, for the dashboard table. */
  listMessages: (status?: string) =>
    request<Paged<MessageDto>>(
      `/api/messages?limit=100${status ? `&status=${encodeURIComponent(status)}` : ''}`,
    ),

  getMessage: (id: string) => request<MessageDetailDto>(`/api/messages/${id}`),

  cancelMessage: (id: string) =>
    request<MessageDetailDto>(`/api/messages/${id}`, { method: 'DELETE' }),

  retryMessage: (id: string) =>
    request<MessageDetailDto>(`/api/messages/${id}/retry`, { method: 'POST' }),

  sendNow: (id: string) =>
    request<MessageDetailDto>(`/api/messages/${id}/send-now`, { method: 'POST' }),

  getStats: () => request<StatsDto>('/api/stats'),

  getSettings: () => request<SettingsResponse>('/api/settings'),

  updateSettings: (patch: { sendIntervalSeconds?: number; paused?: boolean }) =>
    request<SettingsResponse>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  getGatewayHealth: () => request<GatewayHealthDto>('/api/system/gateway'),
};

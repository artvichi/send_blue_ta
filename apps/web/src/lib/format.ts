import { formatPhone } from '@sb/shared';

export { formatPhone };

const dateTime = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const timeOnly = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

const compact = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** Drops the year: a scheduler's table is almost always about right now. */
export function formatCompactDateTime(iso: string | null): string {
  if (!iso) return '--';
  return compact.format(new Date(iso));
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '--';
  return dateTime.format(new Date(iso));
}

export function formatTime(iso: string | null): string {
  if (!iso) return '--';
  return timeOnly.format(new Date(iso));
}

/**
 * A short, human countdown: "in 45m", "in 8s", "now".
 *
 * Deliberately coarse. A queued message showing "in 59m 58s" ticking down to
 * the second reads as noise, but a message about to go out wants the seconds.
 */
export function formatCountdown(iso: string | null, now: number = Date.now()): string {
  if (!iso) return '--';
  const deltaMs = new Date(iso).getTime() - now;
  if (deltaMs <= 0) return 'now';

  const seconds = Math.round(deltaMs / 1000);
  if (seconds < 60) return `in ${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    return minutes < 5 && rest ? `in ${minutes}m ${rest}s` : `in ${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes ? `in ${hours}h ${restMinutes}m` : `in ${hours}h`;

  const days = Math.floor(hours / 24);
  return `in ${days}d ${hours % 24}h`;
}

/** "3600" -> "1 hour", for the interval control. */
export function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  if (seconds < 3600) {
    const m = Math.round(seconds / 60);
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  const h = seconds / 3600;
  const rounded = Number.isInteger(h) ? h : h.toFixed(1);
  return `${rounded} hour${h === 1 ? '' : 's'}`;
}

/**
 * The mirror of `formatCountdown`, for something that already happened:
 * "just now", "8s ago", "3m ago".
 *
 * Used where a timestamp is evidence that something is still running -- a value
 * that stops advancing is itself the signal.
 */
export function formatAgo(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'never';
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  if (seconds < 2) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

import { useEffect, useState } from 'react';

/**
 * A clock that ticks on an interval, so every countdown on a page is driven by
 * one timer instead of one per row.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}

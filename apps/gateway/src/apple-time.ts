/**
 * Apple timestamps are nanoseconds since 2001-01-01 UTC, not Unix. Very old rows
 * store seconds, so magnitude decides the unit. Getting this wrong shifts every
 * delivery time by 31 years, which is why it lives on its own and is tested.
 */
const APPLE_EPOCH_OFFSET_SECONDS = 978_307_200;

/** Nanoseconds above this cannot plausibly be a seconds value. */
const NANOSECOND_THRESHOLD = 1e11;

export function appleTimeToDate(value: number | null): Date | null {
  if (!value) return null;
  const seconds = value > NANOSECOND_THRESHOLD ? value / 1e9 : value;
  return new Date((seconds + APPLE_EPOCH_OFFSET_SECONDS) * 1000);
}

export function dateToAppleNs(date: Date): number {
  return (date.getTime() / 1000 - APPLE_EPOCH_OFFSET_SECONDS) * 1e9;
}

/** Escape a value for inline use in a SQL literal. */
export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

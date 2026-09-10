import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export const DEFAULT_COUNTRY: CountryCode = 'US';

export type PhoneParseResult =
  | { ok: true; e164: string; national: string; valid: boolean }
  | { ok: false; reason: string };

/**
 * Normalize to E.164 once, at the edge, so the queue, the gateway and chat.db
 * correlation all compare the same string.
 *
 * Acceptance uses `isPossible()`, not `isValid()`. isValid() rejects every 555
 * area code -- including +1 (555) 123-4567, the number in the assessment's own
 * mockup -- and wrongly rejecting a deliverable number is worse than accepting
 * an undeliverable one, since FAILED is already a visible, retryable outcome.
 * isPossible() still rejects unparseable and wrong-length input; `valid` is
 * carried through so a caller can warn without blocking.
 */
export function parsePhone(input: string, country: CountryCode = DEFAULT_COUNTRY): PhoneParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: 'Enter a phone number' };

  const parsed = parsePhoneNumberFromString(trimmed, country);
  if (!parsed) return { ok: false, reason: 'That does not look like a phone number' };
  if (!parsed.isPossible()) return { ok: false, reason: 'That phone number is the wrong length' };

  return {
    ok: true,
    e164: parsed.number,
    national: parsed.formatNational(),
    valid: parsed.isValid(),
  };
}

/**
 * Format a handle for display. Email handles are shown as-is; phone numbers are
 * formatted internationally, falling back to the raw value.
 */
export function formatPhone(handle: string): string {
  if (handle.includes('@')) return handle;
  const parsed = parsePhoneNumberFromString(handle);
  return parsed ? parsed.formatInternational() : handle;
}

import { parsePhoneNumberFromString } from 'libphonenumber-js';
export const DEFAULT_COUNTRY = 'US';
/**
 * Normalize user input to E.164 once, at the edge, so that everything
 * downstream -- the queue, the gateway, chat.db correlation -- compares the
 * same string. The mockup's placeholder is a US number, so US is the default
 * region for input that omits a country code.
 *
 * Acceptance is deliberately based on `isPossible()` rather than `isValid()`:
 *
 *  - `isValid()` checks the number against a numbering-plan database that goes
 *    stale, and it rejects every 555 area code -- including `+1 (555) 123-4567`,
 *    the example in the assessment's own mockup. Anyone testing the app with the
 *    obvious number would be blocked by a validation error.
 *  - Wrongly rejecting a deliverable number is worse than accepting an
 *    undeliverable one, because failure is already a first-class outcome here:
 *    the gateway reports FAILED and the dashboard surfaces it.
 *
 * `isPossible()` still rejects unparseable input and anything of the wrong
 * length. The `valid` flag is carried through so callers can warn without
 * blocking.
 */
export function parsePhone(input, country = DEFAULT_COUNTRY) {
    const trimmed = input.trim();
    if (!trimmed)
        return { ok: false, reason: 'Enter a phone number' };
    const parsed = parsePhoneNumberFromString(trimmed, country);
    if (!parsed)
        return { ok: false, reason: 'That does not look like a phone number' };
    if (!parsed.isPossible())
        return { ok: false, reason: 'That phone number is the wrong length' };
    return {
        ok: true,
        e164: parsed.number,
        national: parsed.formatNational(),
        valid: parsed.isValid(),
    };
}
/** Format an E.164 number for display, falling back to the raw value. */
export function formatPhone(e164) {
    const parsed = parsePhoneNumberFromString(e164);
    return parsed ? parsed.formatInternational() : e164;
}

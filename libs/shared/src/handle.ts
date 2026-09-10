import { parsePhone } from './phone.js';

/**
 * An iMessage recipient is either a phone number or an Apple ID email address.
 * Both are "handles" in Messages.app and in chat.db, so the system stores and
 * compares one normalized string rather than two shapes.
 */
export type HandleKind = 'phone' | 'email';

export type HandleParseResult =
  | { ok: true; handle: string; kind: HandleKind; display: string; valid: boolean }
  | { ok: false; reason: string };

/** Deliberately permissive: Apple IDs are ordinary addresses, not a strict grammar. */
const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/**
 * Normalize a recipient once, at the edge. Phone numbers become E.164; email
 * addresses are lowercased. Everything downstream -- the queue, the gateway,
 * chat.db correlation -- then compares the same string.
 */
export function parseHandle(input: string): HandleParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, reason: 'Enter a phone number or email' };

  if (trimmed.includes('@')) {
    if (!EMAIL.test(trimmed)) return { ok: false, reason: 'That email address is not valid' };
    const handle = trimmed.toLowerCase();
    return { ok: true, handle, kind: 'email', display: handle, valid: true };
  }

  const phone = parsePhone(trimmed);
  if (!phone.ok) return { ok: false, reason: phone.reason };
  return {
    ok: true,
    handle: phone.e164,
    kind: 'phone',
    display: phone.national,
    valid: phone.valid,
  };
}

export function handleKind(handle: string): HandleKind {
  return handle.includes('@') ? 'email' : 'phone';
}

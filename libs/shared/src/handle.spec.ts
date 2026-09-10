import { describe, it, expect } from 'vitest';
import { parseHandle, handleKind } from './handle.js';

describe('parseHandle', () => {
  it('accepts an Apple ID email and lowercases it', () => {
    const r = parseHandle('  Koprivanesselrodt0551@Hotmail.com ');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.handle).toBe('koprivanesselrodt0551@hotmail.com');
      expect(r.kind).toBe('email');
    }
  });

  it('still normalizes phone numbers to E.164', () => {
    const r = parseHandle('206 345 6789');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.handle).toBe('+12063456789');
      expect(r.kind).toBe('phone');
    }
  });

  it('rejects a malformed address', () => {
    expect(parseHandle('not@an').ok).toBe(false);
    expect(parseHandle('@nope.com').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(parseHandle('   ').ok).toBe(false);
  });

  it('classifies a stored handle without reparsing', () => {
    expect(handleKind('a@b.com')).toBe('email');
    expect(handleKind('+12063456789')).toBe('phone');
  });
});

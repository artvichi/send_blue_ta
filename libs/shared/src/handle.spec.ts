import { describe, it, expect } from 'vitest';
import { parseHandle, handleKind } from './handle.js';
import { createMessageSchema } from './schemas/message.js';

describe('parseHandle', () => {
  it('accepts an Apple ID email and lowercases it', () => {
    const r = parseHandle('  Koprivanesselrodt0551@Hotmail.com ');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.handle).toBe('koprivanesselrodt0551@hotmail.com');
      expect(r.kind).toBe('email');
      expect(r.display).toBe('koprivanesselrodt0551@hotmail.com');
    }
  });

  it('accepts subdomains and plus-addressing', () => {
    expect(parseHandle('first.last+tag@mail.example.co.uk').ok).toBe(true);
  });

  it('still normalizes phone numbers to E.164', () => {
    const r = parseHandle('206 345 6789');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.handle).toBe('+12063456789');
      expect(r.kind).toBe('phone');
      expect(r.display).toBe('(206) 345-6789');
    }
  });

  it('carries the soft validity flag through for phone numbers', () => {
    const real = parseHandle('+1 206 345 6789');
    const mockup = parseHandle('+1 (555) 123-4567');
    expect(real.ok && real.valid).toBe(true);
    // 555 is accepted (it is deliverable in principle) but flagged.
    expect(mockup.ok && mockup.valid).toBe(false);
  });

  describe('says specifically what is wrong', () => {
    it('for empty input', () => {
      expect(parseHandle('   ')).toEqual({ ok: false, reason: 'Enter a phone number or email' });
    });

    it('for a malformed address', () => {
      for (const bad of ['not@an', '@nope.com', 'two@@at.com', 'a b@c.com']) {
        const r = parseHandle(bad);
        expect(r.ok, bad).toBe(false);
        if (!r.ok) expect(r.reason).toBe('That email address is not valid');
      }
    });

    it('for a number with the wrong number of digits', () => {
      const r = parseHandle('206 345');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/wrong length/);
    });

    it('for input that is neither kind', () => {
      const r = parseHandle('hello there');
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('Enter a phone number or an Apple ID email');
    });
  });

  it('classifies a stored handle without reparsing', () => {
    expect(handleKind('a@b.com')).toBe('email');
    expect(handleKind('+12063456789')).toBe('phone');
  });
});

describe('createMessageSchema', () => {
  it('surfaces the specific recipient reason to the form, not a generic line', () => {
    const r = createMessageSchema.safeParse({ to: 'not@an', body: 'hi' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === 'to');
      expect(issue?.message).toBe('That email address is not valid');
    }
  });

  it('accepts either kind of recipient', () => {
    expect(createMessageSchema.safeParse({ to: '+1 206 345 6789', body: 'hi' }).success).toBe(true);
    expect(createMessageSchema.safeParse({ to: 'me@icloud.com', body: 'hi' }).success).toBe(true);
  });

  it('trims the body before checking it is present', () => {
    expect(createMessageSchema.safeParse({ to: 'me@icloud.com', body: '   ' }).success).toBe(false);
  });
});

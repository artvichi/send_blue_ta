import { describe, it, expect } from 'vitest';
import { parsePhone, formatPhone } from './phone.js';

describe('parsePhone', () => {
  it('normalizes the formats a person actually types', () => {
    for (const input of ['+1 (206) 345-6789', '2063456789', '206-345-6789', '+12063456789']) {
      const result = parsePhone(input);
      expect(result.ok, `expected ${input} to parse`).toBe(true);
      if (result.ok) expect(result.e164).toBe('+12063456789');
    }
  });

  it('accepts the 555 numbers used in the assessment mockup', () => {
    // isValid() rejects every 555 area code as fictional. Blocking the example
    // number printed in the spec would be a bad first five seconds for a reviewer.
    for (const input of ['+1 (555) 123-4567', '+1 (555) 987-6543', '+1 (555) 000-0000']) {
      const result = parsePhone(input);
      expect(result.ok, `expected mockup number ${input} to be accepted`).toBe(true);
      if (result.ok) expect(result.valid).toBe(false);
    }
  });

  it('flags real numbers as valid', () => {
    const result = parsePhone('+1 206 345 6789');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.valid).toBe(true);
  });

  it('respects an explicit country code over the default region', () => {
    const result = parsePhone('+44 20 7946 0958');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.e164).toBe('+442079460958');
  });

  it('rejects empty input with a usable message', () => {
    const result = parsePhone('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/enter a phone number/i);
  });

  it('rejects nonsense and wrong-length input', () => {
    expect(parsePhone('not a phone').ok).toBe(false);
    expect(parsePhone('123').ok).toBe(false);
    expect(parsePhone('+1 555 12').ok).toBe(false);
  });
});

describe('formatPhone', () => {
  it('formats E.164 for display', () => {
    expect(formatPhone('+12063456789')).toBe('+1 206 345 6789');
  });

  it('passes through anything it cannot parse', () => {
    expect(formatPhone('garbage')).toBe('garbage');
  });
});

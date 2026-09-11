import { describe, it, expect } from 'vitest';
import { handleMatchSql } from './chatdb.js';

/**
 * The correlation predicate decides which chat.db row is "ours" after a send.
 * Getting it wrong either loses the GUID (message shows FAILED though it went
 * out) or attaches to someone else's message.
 */
describe('handleMatchSql', () => {
  it('compares an email handle exactly, case-insensitively', () => {
    const sql = handleMatchSql('Me@ICloud.com');
    expect(sql).toBe(`LOWER(COALESCE(h.id,'')) = 'me@icloud.com'`);
  });

  it('matches a phone number on its last ten digits, whatever punctuation Messages stored', () => {
    const sql = handleMatchSql('+1 (206) 345-6789');
    expect(sql).toContain(`LIKE '%2063456789'`);
    // Every shape Messages has been seen to store is normalized in SQL first.
    expect(sql).toMatch(/REPLACE\(.*'\+'.*'-'.*' '/s);
  });

  it('escapes quotes so a handle cannot break out of the literal', () => {
    const sql = handleMatchSql(`o'brien@example.com`);
    expect(sql).toContain(`'o''brien@example.com'`);
  });
});

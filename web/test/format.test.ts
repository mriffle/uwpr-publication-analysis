/**
 * One number format and one date format for the whole page (docs/06 §8).
 */
import { describe, expect, it } from 'vitest';
import { formatDate } from '../src/format/date';
import {
  formatCount,
  formatDecimal,
  formatOptional,
  formatShare,
  pluralize,
} from '../src/format/number';

describe('numbers', () => {
  it('groups thousands, so 29,575 reads as it does in the spec', () => {
    expect(formatCount(29575)).toBe('29,575');
    expect(formatCount(0)).toBe('0');
  });

  it('shows two places for a field-weighted impact', () => {
    expect(formatDecimal(2.68)).toBe('2.68');
    expect(formatDecimal(2.6)).toBe('2.60');
  });

  it('shows a share as a whole percentage, always alongside its counts', () => {
    expect(formatShare(0.9056)).toBe('91%');
  });

  it('says "not available" rather than showing a null as a zero', () => {
    expect(formatOptional(null, formatDecimal)).toBe('not available');
    expect(formatOptional(2.68, formatDecimal)).toBe('2.68');
  });

  it('agrees with English on one', () => {
    expect(pluralize(1, 'publication')).toBe('1 publication');
    expect(pluralize(0, 'publication')).toBe('0 publications');
    expect(pluralize(339, 'publication')).toBe('339 publications');
    expect(pluralize(2, 'entry', 'entries')).toBe('2 entries');
  });
});

describe('dates', () => {
  it('is unambiguous to a reader on either side of the Atlantic', () => {
    expect(formatDate('2026-09-20')).toBe('20 September 2026');
    expect(formatDate('2026-09-20T17:07:00Z')).toBe('20 September 2026');
  });

  it('shows an unparseable value as stored rather than as "Invalid Date"', () => {
    expect(formatDate('not a date')).toBe('not a date');
  });
});

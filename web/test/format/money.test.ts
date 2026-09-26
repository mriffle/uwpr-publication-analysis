/**
 * Money formats (docs/06 §7, §8: one number format for the page, exact values wherever a
 * rounded one is shown).
 *
 * The strings are pinned under Node's ICU. The compact form is the one likeliest to differ
 * between engines, which is why only these unit tests pin it and end-to-end tests do not.
 */
import { describe, expect, it } from 'vitest';
import { formatMoney, formatUsd, formatUsdCompact } from '../../src/format/number';

const NBSP = ' ';

describe('formatUsd: the exact figure', () => {
  it('groups thousands and shows no cents', () => {
    expect(formatUsd(6219845123)).toBe('$6,219,845,123');
    expect(formatUsd(1234)).toBe('$1,234');
    expect(formatUsd(999)).toBe('$999');
  });

  it('shows zero as zero', () => {
    expect(formatUsd(0)).toBe('$0');
  });

  it('is exact across the compact boundaries', () => {
    expect(formatUsd(1e3)).toBe('$1,000');
    expect(formatUsd(1e6)).toBe('$1,000,000');
    expect(formatUsd(1e9)).toBe('$1,000,000,000');
    expect(formatUsd(999_999)).toBe('$999,999');
  });

  it('reads a negative amount correctly, and never writes "-$0"', () => {
    expect(formatUsd(-5)).toBe('-$5');
    expect(formatUsd(-0)).toBe('$0');
    expect(formatUsd(-0.4)).toBe('$0');
  });

  it('rounds a fraction to whole dollars', () => {
    expect(formatUsd(1234.6)).toBe('$1,235');
  });
});

describe('formatUsdCompact: axes and large figures only', () => {
  it('gives three significant figures', () => {
    expect(formatUsdCompact(6219845123)).toBe('$6.22B');
    expect(formatUsdCompact(1234567)).toBe('$1.23M');
    expect(formatUsdCompact(1234)).toBe('$1.23K');
  });

  it('shows zero and small amounts as they are', () => {
    expect(formatUsdCompact(0)).toBe('$0');
    expect(formatUsdCompact(999)).toBe('$999');
  });

  it('changes unit exactly at 1e3, 1e6 and 1e9', () => {
    expect(formatUsdCompact(1e3)).toBe('$1K');
    expect(formatUsdCompact(1e6)).toBe('$1M');
    expect(formatUsdCompact(1e9)).toBe('$1B');
  });

  it('rounds up into the next unit rather than showing "$1000K"', () => {
    expect(formatUsdCompact(999_999)).toBe('$1M');
    expect(formatUsdCompact(999_499)).toBe('$999K');
  });

  it('reads a negative amount correctly, and never writes "-$0"', () => {
    expect(formatUsdCompact(-1.5e9)).toBe('-$1.5B');
    expect(formatUsdCompact(-0)).toBe('$0');
  });
});

describe('formatMoney: the currency a grant was awarded in', () => {
  it('uses the currency’s symbol where English has an unambiguous one', () => {
    expect(formatMoney(1234567, 'GBP')).toBe('£1,234,567');
    expect(formatMoney(1234567, 'EUR')).toBe('€1,234,567');
    expect(formatMoney(1234567, 'USD')).toBe('$1,234,567');
    expect(formatMoney(1234567, 'CAD')).toBe('CA$1,234,567');
  });

  it('uses the ISO code where it has not, kept to its number by a no-break space', () => {
    expect(formatMoney(2000000, 'SEK')).toBe(`SEK${NBSP}2,000,000`);
    expect(formatMoney(2000000, 'CHF')).toBe(`CHF${NBSP}2,000,000`);
  });

  it('accepts a lower-case code', () => {
    expect(formatMoney(5, 'gbp')).toBe('£5');
  });

  it('shows zero, and a negative, and never "-£0"', () => {
    expect(formatMoney(0, 'GBP')).toBe('£0');
    expect(formatMoney(-5, 'GBP')).toBe('-£5');
    expect(formatMoney(-0.2, 'GBP')).toBe('£0');
  });

  it('shows a code the platform rejects beside the number, rather than throwing', () => {
    expect(formatMoney(1234, 'US')).toBe('US 1,234');
    expect(formatMoney(-0.2, 'not a code')).toBe('not a code 0');
  });

  it('gives the same answer from its cache as the first time', () => {
    expect(formatMoney(7, 'JPY')).toBe('¥7');
    expect(formatMoney(7, 'JPY')).toBe('¥7');
  });
});

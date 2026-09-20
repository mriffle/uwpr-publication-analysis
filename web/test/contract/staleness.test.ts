import { describe, expect, it } from 'vitest';
import { dataAgeInDays, isStale, STALE_AFTER_DAYS } from '../../src/contract/staleness';

const generated = '2026-09-20T17:07:00Z';
const daysAfter = (days: number) => new Date(Date.parse(generated) + days * 86_400_000);

describe('how current the data is (docs/06 §7, docs/07 O3)', () => {
  it('is not stale within two weekly runs', () => {
    expect(isStale(generated, daysAfter(0))).toBe(false);
    expect(isStale(generated, daysAfter(7))).toBe(false);
    expect(isStale(generated, daysAfter(STALE_AFTER_DAYS))).toBe(false);
  });

  it('is stale once two weekly runs have been missed', () => {
    expect(isStale(generated, daysAfter(STALE_AFTER_DAYS + 1))).toBe(true);
    expect(dataAgeInDays(generated, daysAfter(21))).toBe(21);
  });

  it('counts whole days', () => {
    expect(dataAgeInDays(generated, daysAfter(1.9))).toBe(1);
  });

  it('never reports a negative age from a clock that is behind', () => {
    expect(dataAgeInDays(generated, daysAfter(-5))).toBe(0);
    expect(isStale(generated, daysAfter(-5))).toBe(false);
  });

  it('treats an unreadable timestamp as current rather than crying wolf', () => {
    expect(dataAgeInDays('not a date', new Date())).toBe(0);
    expect(isStale('not a date', new Date())).toBe(false);
  });
});

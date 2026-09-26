import { describe, expect, it } from 'vitest';
import {
  activeCount,
  clearAll,
  EMPTY_FILTER,
  isUnfiltered,
  setOfficialList,
  STRING_DIMENSIONS,
  setSearch,
  toggleCriterion,
  toggleString,
  toggleYear,
} from '../../src/filter/state';

describe('filter state', () => {
  it('starts unfiltered', () => {
    expect(isUnfiltered(EMPTY_FILTER)).toBe(true);
    expect(activeCount(EMPTY_FILTER)).toBe(0);
  });

  it('toggles a value on and off, which is what a chart click does', () => {
    const once = toggleYear(EMPTY_FILTER, 2019);
    expect(once.year).toEqual([2019]);
    expect(toggleYear(once, 2019).year).toEqual([]);
  });

  it('accumulates within a dimension, because values there combine with OR', () => {
    const state = toggleString(
      toggleString(EMPTY_FILTER, 'field', 'Chemistry'),
      'field',
      'Medicine',
    );
    expect(state.field).toEqual(['Chemistry', 'Medicine']);
  });

  it('never mutates the state it is given', () => {
    const before = EMPTY_FILTER;
    toggleYear(before, 2019);
    expect(before.year).toEqual([]);
  });

  it('counts every individual selection', () => {
    let state = toggleYear(EMPTY_FILTER, 2019);
    state = toggleYear(state, 2020);
    state = toggleString(state, 'country', 'US');
    state = toggleCriterion(state, 2);
    state = setOfficialList(state, true);
    state = setSearch(state, 'casanovo');
    expect(activeCount(state)).toBe(6);
    expect(isUnfiltered(state)).toBe(false);
  });

  it('treats whitespace-only search as no search', () => {
    expect(activeCount(setSearch(EMPTY_FILTER, '   '))).toBe(0);
  });

  it('clears everything at once', () => {
    expect(clearAll()).toEqual(EMPTY_FILTER);
  });

  it('un-sets the official-list filter with null', () => {
    const state = setOfficialList(EMPTY_FILTER, false);
    expect(activeCount(state)).toBe(1);
    expect(activeCount(setOfficialList(state, null))).toBe(0);
  });
});

describe('the funding dimensions (docs/09 §12.4)', () => {
  it('are string dimensions, empty in the empty filter', () => {
    expect(STRING_DIMENSIONS).toContain('agency');
    expect(STRING_DIMENSIONS).toContain('grant');
    expect(EMPTY_FILTER.agency).toEqual([]);
    expect(EMPTY_FILTER.grant).toEqual([]);
  });

  it('toggle, accumulate and count like any other', () => {
    let state = toggleString(EMPTY_FILTER, 'agency', 'NIH');
    state = toggleString(state, 'agency', 'NSF');
    state = toggleString(state, 'grant', 'NIH:R01GM086688');
    expect(state.agency).toEqual(['NIH', 'NSF']);
    expect(state.grant).toEqual(['NIH:R01GM086688']);
    expect(activeCount(state)).toBe(3);
    expect(toggleString(state, 'agency', 'NIH').agency).toEqual(['NSF']);
    expect(isUnfiltered(toggleString(state, 'grant', 'NIH:R01GM086688'))).toBe(false);
  });
});

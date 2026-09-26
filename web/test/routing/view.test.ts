/**
 * The whole query string: the filter (docs/06 B5) and the explorer's ordering.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SORT } from '../../src/aggregate/explorer';
import { EMPTY_FILTER } from '../../src/filter/state';
import { decodeView, encodeViewToQuery } from '../../src/routing/view';

describe('encoding', () => {
  it('produces an empty query for an unfiltered, unsorted view', () => {
    expect(encodeViewToQuery({ filter: EMPTY_FILTER, sort: DEFAULT_SORT })).toBe('');
  });

  it('carries the filter exactly as filter/url.ts encodes it', () => {
    const query = encodeViewToQuery({
      filter: { ...EMPTY_FILTER, year: [2019], country: ['DE'] },
      sort: DEFAULT_SORT,
    });
    expect(query).toBe('?year=2019&country=DE');
  });

  it('adds the ordering only when it differs from the default', () => {
    expect(
      encodeViewToQuery({ filter: EMPTY_FILTER, sort: { key: 'citations', direction: 'desc' } }),
    ).toBe('?sort=citations');
    expect(
      encodeViewToQuery({ filter: EMPTY_FILTER, sort: { key: 'year', direction: 'asc' } }),
    ).toBe('?dir=asc');
  });
});

describe('decoding', () => {
  it('round-trips a filter and an ordering', () => {
    const view = {
      filter: { ...EMPTY_FILTER, year: [2019, 2020], journal: ['1535-3893'] },
      sort: { key: 'title' as const, direction: 'asc' as const },
    };
    expect(decodeView(encodeViewToQuery(view))).toEqual(view);
  });

  it('falls back to the default ordering for anything it does not recognise', () => {
    expect(decodeView('?sort=venue&dir=sideways').sort).toEqual(DEFAULT_SORT);
  });

  it('reads an empty query as the unfiltered default', () => {
    expect(decodeView('')).toEqual({ filter: EMPTY_FILTER, sort: DEFAULT_SORT });
  });
});

describe('the institution-wide position (docs/09 §12.4, F4)', () => {
  it('is written only when excluded, after the filter and before the ordering', () => {
    expect(
      encodeViewToQuery({ filter: EMPTY_FILTER, sort: DEFAULT_SORT, institutionWide: 'include' }),
    ).toBe('');
    expect(
      encodeViewToQuery({
        filter: { ...EMPTY_FILTER, year: [2020] },
        sort: { key: 'citations', direction: 'desc' },
        institutionWide: 'exclude',
      }),
    ).toBe('?year=2020&institution_wide=exclude&sort=citations');
  });

  it('round-trips an exclusion', () => {
    const view = {
      filter: { ...EMPTY_FILTER, agency: ['NIH'], grant: ['NIH:R01GM086688'] },
      sort: DEFAULT_SORT,
      institutionWide: 'exclude' as const,
    };
    expect(decodeView(encodeViewToQuery(view))).toEqual(view);
  });

  it('is absent when included, so the default view is one value however it was reached', () => {
    expect(decodeView('?institution_wide=include')).toEqual({
      filter: EMPTY_FILTER,
      sort: DEFAULT_SORT,
    });
    expect('institutionWide' in decodeView('?year=2020')).toBe(false);
  });
});

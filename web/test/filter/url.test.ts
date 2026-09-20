import { describe, expect, it } from 'vitest';
import {
  decodeFilter,
  decodeFilterFromQuery,
  encodeFilter,
  encodeFilterToQuery,
} from '../../src/filter/url';
import { EMPTY_FILTER, type FilterState } from '../../src/filter/state';

const full: FilterState = {
  year: [2020, 2019],
  domain: ['Physical Sciences'],
  field: ['Chemistry', 'Medicine'],
  subfield: ['Spectroscopy'],
  topic: ['Advanced Proteomics Techniques and Applications'],
  journal: ['1535-3893'],
  institution: ['00cvxb145'],
  country: ['US'],
  author: ['A5011565192'],
  oa: ['gold', 'hybrid'],
  kind: ['preprint'],
  criterion: [2, 1],
  onOfficialList: true,
  search: 'casanovo',
};

describe('filter state in the URL (docs/06 B5)', () => {
  it('round-trips every dimension', () => {
    expect(decodeFilter(encodeFilter(full))).toEqual({
      ...full,
      year: [2019, 2020],
      criterion: [1, 2],
    });
  });

  it('produces the same URL whatever order the reader clicked in', () => {
    const a = encodeFilterToQuery({ ...EMPTY_FILTER, field: ['Medicine', 'Chemistry'] });
    const b = encodeFilterToQuery({ ...EMPTY_FILTER, field: ['Chemistry', 'Medicine'] });
    expect(a).toBe(b);
  });

  it('is empty when nothing is selected', () => {
    expect(encodeFilterToQuery(EMPTY_FILTER)).toBe('');
    expect(decodeFilterFromQuery('')).toEqual(EMPTY_FILTER);
  });

  it('round-trips a value containing a comma, which a joined parameter could not', () => {
    // Real venue and institution names carry commas; this is why values ride as repeated
    // parameters rather than one comma-joined one.
    const state: FilterState = {
      ...EMPTY_FILTER,
      journal: ['Biochimica et Biophysica Acta, Molecular Basis of Disease'],
    };
    expect(decodeFilter(encodeFilter(state)).journal).toEqual(state.journal);
  });

  it('round-trips a search term with spaces and punctuation', () => {
    const state = { ...EMPTY_FILTER, search: 'von Haller, P. D.' };
    expect(decodeFilterFromQuery(encodeFilterToQuery(state)).search).toBe(state.search);
  });

  it('carries the official-list filter in both directions', () => {
    expect(decodeFilterFromQuery('?list=yes').onOfficialList).toBe(true);
    expect(decodeFilterFromQuery('?list=no').onOfficialList).toBe(false);
    expect(decodeFilterFromQuery('?list=maybe').onOfficialList).toBeNull();
  });

  it('drops values a hand-edited URL cannot mean, rather than rendering NaN', () => {
    expect(decodeFilterFromQuery('?year=2019&year=twenty&year=').year).toEqual([2019]);
    expect(decodeFilterFromQuery('?criterion=9&criterion=2').criterion).toEqual([9, 2].sort());
  });

  it('de-duplicates repeated values', () => {
    expect(decodeFilterFromQuery('?field=Chemistry&field=Chemistry').field).toEqual(['Chemistry']);
    expect(decodeFilterFromQuery('?year=2019&year=2019').year).toEqual([2019]);
  });

  it('ignores parameters that are not filter dimensions', () => {
    expect(decodeFilterFromQuery('?utm_source=x&year=2019')).toEqual({
      ...EMPTY_FILTER,
      year: [2019],
    });
  });
});

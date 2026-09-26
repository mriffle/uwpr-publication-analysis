import { describe, expect, it } from 'vitest';
import {
  decodeFilter,
  decodeFilterFromQuery,
  decodeInstitutionWide,
  encodeFilter,
  encodeFilterToQuery,
  encodeInstitutionWide,
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
  agency: ['MISC', 'NIGMS'],
  grant: ['NIH-contract:HHSN272209900002I:75N99099F00001', 'NIH:R01GM999001'],
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

describe('the funding dimensions in the URL (docs/09 §12.4)', () => {
  it('round-trips agencies and grants as repeated parameters, sorted', () => {
    const state: FilterState = {
      ...EMPTY_FILTER,
      agency: ['NSF', 'MISC', 'NIH'],
      grant: ['NIH:R01GM086688', 'MISC:S10OD032290', 'NIH-contract:HHSN272201700059C'],
    };
    const decoded = decodeFilterFromQuery(encodeFilterToQuery(state));
    expect(decoded).toEqual({
      ...state,
      agency: ['MISC', 'NIH', 'NSF'],
      grant: ['MISC:S10OD032290', 'NIH-contract:HHSN272201700059C', 'NIH:R01GM086688'],
    });
  });

  it('percent-encodes the colon of a grant key, as the entity paths do', () => {
    const query = encodeFilterToQuery({ ...EMPTY_FILTER, grant: ['NIH:R01GM086688'] });
    expect(query).toBe('?grant=NIH%3AR01GM086688');
  });

  it('reads back a colon typed raw', () => {
    expect(decodeFilterFromQuery('?grant=NIH:R01GM086688&agency=NIH').grant).toEqual([
      'NIH:R01GM086688',
    ]);
  });

  it('round-trips a task order’s three-part key', () => {
    const grant = ['NIH-contract:HHSN272209900002I:75N99099F00001'];
    expect(decodeFilterFromQuery(encodeFilterToQuery({ ...EMPTY_FILTER, grant })).grant).toEqual(
      grant,
    );
  });

  it('writes them after the publication dimensions, so existing URLs keep their order', () => {
    const query = encodeFilterToQuery({
      ...EMPTY_FILTER,
      year: [2020],
      kind: ['article'],
      agency: ['NIH'],
      grant: ['NIH:R01GM086688'],
      criterion: [2],
    });
    expect(query).toBe('?year=2020&kind=article&agency=NIH&grant=NIH%3AR01GM086688&criterion=2');
  });

  it('tolerates values it cannot know: kept as given, de-duplicated, empty ones dropped', () => {
    const decoded = decodeFilterFromQuery('?agency=NOPE&agency=NOPE&agency=&grant=not-a-key');
    expect(decoded.agency).toEqual(['NOPE']);
    expect(decoded.grant).toEqual(['not-a-key']);
  });

  it('leaves the default URL empty', () => {
    expect(encodeFilterToQuery(EMPTY_FILTER)).toBe('');
  });
});

describe('the institution-wide position in the URL (docs/09 §12.4, F4)', () => {
  const written = (value: 'include' | 'exclude') => {
    const params = new URLSearchParams();
    encodeInstitutionWide(params, value);
    return params.toString();
  };

  it('is written only when the reader excludes them', () => {
    expect(written('exclude')).toBe('institution_wide=exclude');
    expect(written('include')).toBe('');
  });

  it('reads back exactly what it writes', () => {
    expect(decodeInstitutionWide(new URLSearchParams(written('exclude')))).toBe('exclude');
    expect(decodeInstitutionWide(new URLSearchParams(written('include')))).toBe('include');
  });

  it('takes anything else a URL holds as the default, included', () => {
    for (const query of [
      '',
      'institution_wide=include',
      'institution_wide=EXCLUDE',
      'institution_wide=',
    ]) {
      expect(decodeInstitutionWide(new URLSearchParams(query))).toBe('include');
    }
  });

  it('is not a filter dimension: the filter neither reads nor writes it', () => {
    expect(decodeFilterFromQuery('?institution_wide=exclude')).toEqual(EMPTY_FILTER);
  });
});

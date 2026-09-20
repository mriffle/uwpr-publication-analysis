/**
 * Every metric in docs/05 §5, tested against its definition.
 *
 * docs/06 §12.2: "Every function in `aggregate/` and `filter/`, exhaustively, against the
 * definitions in docs/05 §5. This is where correctness lives."
 *
 * The sample export proves these agree with the pipeline on real rows
 * (`summary-crosscheck.test.ts`); these pin the edges the sample cannot vary one at a time.
 */
import { describe, expect, it } from 'vitest';
import {
  beyondOfficialList,
  citationsInWindow,
  citationsInYear,
  distinctCountries,
  distinctInstitutions,
  distinctJournals,
  distinctLastAuthors,
  fwciMean,
  fwciMedian,
  hIndex,
  journalKey,
  onOfficialList,
  openAccessCount,
  openAccessShare,
  percentileMedian,
  preprintOnly,
  publications,
  researchGroups,
  summarize,
  totalCitations,
  worksWithStaffAuthor,
  yearSpan,
} from '../../src/aggregate/metrics';
import type { Work } from '../../src/contract/types';
import { author, work } from '../support/works';

const cited = (total: number, byYear: Record<string, number> = {}): Partial<Work> => ({
  citations: { total, by_year: byYear, fwci: null, percentile: null, as_of: '2026-09-20' },
});

describe('publications — "count of works; a preprint and its journal article count once"', () => {
  it('counts rows, because the export already merged versions into one row', () => {
    expect(publications([])).toBe(0);
    expect(publications([work(), work({ versions: [] })])).toBe(2);
  });
});

describe('year span', () => {
  it('is null with nothing to span', () => {
    expect(yearSpan([])).toBeNull();
  });

  it('is the first and last year of a canonical record', () => {
    expect(yearSpan([work({ year: 2015 }), work({ year: 2008 }), work({ year: 2026 })])).toEqual({
      first: 2008,
      last: 2026,
    });
  });
});

describe('citations', () => {
  const works = [
    work(cited(10, { '2020': 4, '2021': 6 })),
    work(cited(5, { '2021': 3 })), // two citations predate the by-year window
  ];

  it('totals the canonical record’s cited_by', () => {
    expect(totalCitations(works)).toBe(15);
  });

  it('totals the by-year window separately, which is what leaves 458 outside it', () => {
    expect(citationsInWindow(works)).toBe(13);
    expect(totalCitations(works) - citationsInWindow(works)).toBe(2);
  });

  it('sums a single year across works', () => {
    expect(citationsInYear(works, 2021)).toBe(9);
    expect(citationsInYear(works, 2012)).toBe(0);
  });
});

describe('field-weighted citation impact', () => {
  const withFwci = (fwci: number | null): Work =>
    work({
      citations: { total: 0, by_year: {}, fwci, percentile: null, as_of: '2026-09-20' },
    });

  it('is reported over the works that have one, ignoring those that do not', () => {
    const works = [withFwci(1), withFwci(3), withFwci(null)];
    expect(fwciMedian(works)).toBe(2);
    expect(fwciMean(works)).toBe(2);
  });

  it('is null when no work has one — 16 of 339 show neither', () => {
    expect(fwciMedian([withFwci(null)])).toBeNull();
    expect(fwciMean([withFwci(null)])).toBeNull();
    expect(fwciMedian([])).toBeNull();
  });

  it('rounds to four places, as the pipeline does', () => {
    expect(fwciMedian([withFwci(1.23456), withFwci(1.23456)])).toBe(1.2346);
  });
});

describe('citation percentile — detail view only (docs/05 §2.2)', () => {
  const withPercentile = (percentile: number | null): Work =>
    work({
      citations: { total: 0, by_year: {}, fwci: null, percentile, as_of: '2026-09-20' },
    });

  it('is the median over the works that have one, unrounded', () => {
    expect(percentileMedian([withPercentile(0.9), withPercentile(0.8)])).toBeCloseTo(0.85, 10);
    expect(percentileMedian([withPercentile(null)])).toBeNull();
  });
});

describe('corpus h-index — "largest h with h works cited at least h times"', () => {
  it('is zero with nothing, and zero when nothing is cited', () => {
    expect(hIndex([])).toBe(0);
    expect(hIndex([work(cited(0)), work(cited(0))])).toBe(0);
  });

  it('is 3 for 6, 5, 3, 1, 0', () => {
    expect(hIndex([6, 5, 3, 1, 0].map((n) => work(cited(n))))).toBe(3);
  });

  it('is bounded by the number of works, not by the citation counts', () => {
    expect(hIndex([work(cited(1000)), work(cited(1000))])).toBe(2);
  });
});

describe('open access — "a status other than closed"', () => {
  it('counts every status but closed, including unknown', () => {
    const works = [
      work({ oa: { status: 'gold', url: null, license: null } }),
      work({ oa: { status: 'unknown', url: null, license: null } }),
      work({ oa: { status: 'closed', url: null, license: null } }),
    ];
    expect(openAccessCount(works)).toBe(2);
    expect(openAccessShare(works)).toBeCloseTo(2 / 3, 10);
  });

  it('has no share to report over nothing', () => {
    expect(openAccessShare([])).toBeNull();
  });
});

describe('distinct journals — "keyed by ISSN-L where present, else by name"', () => {
  it('merges two names under one ISSN-L, and separates two ISSN-Ls', () => {
    const works = [
      work({ venue: { name: 'J. Proteome Res.', issn_l: '1535-3893' } }),
      work({ venue: { name: 'Journal of Proteome Research', issn_l: '1535-3893' } }),
      work({ venue: { name: 'Nature', issn_l: '0028-0836' } }),
    ];
    expect(distinctJournals(works)).toBe(2);
  });

  it('falls back to the name when there is no ISSN-L, which is how preprint servers count', () => {
    const works = [
      work({ venue: { name: 'bioRxiv (Cold Spring Harbor Laboratory)', issn_l: null } }),
      work({ venue: { name: 'bioRxiv (Cold Spring Harbor Laboratory)', issn_l: null } }),
    ];
    expect(distinctJournals(works)).toBe(1);
    expect(journalKey(works[0] as Work)).toBe('bioRxiv (Cold Spring Harbor Laboratory)');
  });

  it('counts a work with no venue as no journal rather than as one', () => {
    expect(distinctJournals([work({ venue: null })])).toBe(0);
    expect(journalKey(work({ venue: null }))).toBeNull();
  });
});

describe('distinct institutions and countries — a floor, by ROR ID', () => {
  const ror = (id: string, country: string) => ({ ror: id, name: id, country });

  it('counts each ROR once across works, never once per author', () => {
    const works = [
      work({ institutions: [ror('00cvxb145', 'US'), ror('02w0trx84', 'US')], countries: ['US'] }),
      work({ institutions: [ror('00cvxb145', 'US')], countries: ['US'] }),
    ];
    expect(distinctInstitutions(works)).toBe(2);
    expect(distinctCountries(works)).toBe(1);
  });

  it('is zero where no affiliation resolved — which is why the figure is labelled a floor', () => {
    expect(distinctInstitutions([work({ institutions: [], countries: [] })])).toBe(0);
  });
});

describe('research groups — "distinct corresponding authors, by OpenAlex ID"', () => {
  it('keys by OpenAlex ID, so one person under two spellings is one group', () => {
    const works = [
      work({ corresponding_authors: [{ name: 'J. Smith', openalex: 'A9' }] }),
      work({ corresponding_authors: [{ name: 'Jane Smith', openalex: 'A9' }] }),
    ];
    expect(researchGroups(works)).toBe(1);
  });

  it('falls back to the name where OpenAlex has no ID, as the pipeline does', () => {
    const works = [
      work({ corresponding_authors: [{ name: 'Jane Smith', openalex: null }] }),
      work({ corresponding_authors: [{ name: 'Other Person', openalex: null }] }),
    ];
    expect(researchGroups(works)).toBe(2);
  });

  it('counts nothing for a work that marks no corresponding author — 56 of 339 do not', () => {
    expect(researchGroups([work({ corresponding_authors: [] })])).toBe(0);
  });
});

describe('distinct last authors — the second view on research groups', () => {
  it('takes the last author of each work', () => {
    const works = [
      work({ authors: [author({ openalex: 'A1' }), author({ openalex: 'A2' })] }),
      work({ authors: [author({ openalex: 'A3' }), author({ openalex: 'A2' })] }),
    ];
    expect(distinctLastAuthors(works)).toBe(1);
  });

  it('skips a work with no authors rather than counting an absent one', () => {
    expect(distinctLastAuthors([work({ authors: [] })])).toBe(0);
  });
});

describe('the counts the method page reports', () => {
  it('counts works with a staff author, which is never evidence on its own (D2)', () => {
    expect(worksWithStaffAuthor([work({ staff_authors: ['eng'] }), work()])).toBe(1);
  });

  it('splits the corpus by UWPR’s own list', () => {
    const works = [work({ on_official_list: true }), work({ on_official_list: false })];
    expect(onOfficialList(works)).toBe(1);
    expect(beyondOfficialList(works)).toBe(1);
  });

  it('counts preprint-only works by the flag, not by the kind', () => {
    expect(preprintOnly([work({ is_preprint: true }), work()])).toBe(1);
  });
});

describe('summarize', () => {
  it('produces every key of the summary block, with zeros over an empty corpus', () => {
    expect(summarize([])).toEqual({
      publications: 0,
      first_year: 0,
      last_year: 0,
      citations: 0,
      citations_in_window: 0,
      fwci_median: null,
      fwci_mean: null,
      h_index: 0,
      open_access: 0,
      journals: 0,
      institutions: 0,
      countries: 0,
      research_groups: 0,
      last_authors: 0,
      on_official_list: 0,
      beyond_official_list: 0,
      preprint_only: 0,
    });
  });
});

import { describe, expect, it } from 'vitest';
import { applyFilter, authorKey, buildPredicate, matches } from '../../src/filter/predicate';
import { EMPTY_FILTER, type FilterState } from '../../src/filter/state';
import { fundingOf } from '../../src/contract/funding';
import type { Topic } from '../../src/contract/types';
import { summarize } from '../../src/aggregate/metrics';
import { sampleExport } from '../support/fixture';
import { legacyDocument, listing } from '../support/funding';
import {
  FOUNDATION_GRANT,
  GRFP,
  grantsIndex,
  listings,
  NSF_PROJECT,
  P01,
  R01,
  UNMATCHED,
} from '../support/grants';
import { author, work } from '../support/works';

const topic = (over: Partial<Topic> = {}): Topic => ({
  domain: 'Physical Sciences',
  field: 'Chemistry',
  subfield: 'Spectroscopy',
  topic: 'Advanced Proteomics Techniques and Applications',
  score: 0.9,
  primary: true,
  ...over,
});

const filter = (over: Partial<FilterState>): FilterState => ({ ...EMPTY_FILTER, ...over });

describe('an empty filter selects everything', () => {
  it('matches every work in the sample', () => {
    const doc = sampleExport();
    expect(applyFilter(doc.works, EMPTY_FILTER)).toHaveLength(doc.works.length);
  });
});

describe('values within one dimension combine with OR', () => {
  it('matches either of two years', () => {
    const works = [work({ year: 2019 }), work({ year: 2020 }), work({ year: 2021 })];
    expect(applyFilter(works, filter({ year: [2019, 2021] }))).toHaveLength(2);
  });

  it('matches any of a work’s topics, not only the primary one', () => {
    const subject = work({
      topics: [topic(), topic({ field: 'Medicine', primary: false })],
    });
    expect(matches(subject, filter({ field: ['Medicine'] }))).toBe(true);
  });
});

describe('dimensions combine with AND', () => {
  it('requires a journal and a year together', () => {
    const works = [
      work({ year: 2019, venue: { name: 'A', issn_l: '1111-1111' } }),
      work({ year: 2020, venue: { name: 'A', issn_l: '1111-1111' } }),
    ];
    const state = filter({ year: [2019], journal: ['1111-1111'] });
    expect(applyFilter(works, state)).toHaveLength(1);
  });

  it('can select nothing at all, which is a state the page must design for', () => {
    const works = [work({ year: 2019, countries: ['US'] })];
    expect(applyFilter(works, filter({ year: [2019], country: ['DE'] }))).toHaveLength(0);
  });
});

describe('each dimension of docs/05 §9', () => {
  it('filters by research area at all four levels', () => {
    const subject = work({ topics: [topic()] });
    expect(matches(subject, filter({ domain: ['Physical Sciences'] }))).toBe(true);
    expect(matches(subject, filter({ field: ['Chemistry'] }))).toBe(true);
    expect(matches(subject, filter({ subfield: ['Spectroscopy'] }))).toBe(true);
    expect(
      matches(subject, filter({ topic: ['Advanced Proteomics Techniques and Applications'] })),
    ).toBe(true);
    expect(matches(subject, filter({ domain: ['Life Sciences'] }))).toBe(false);
  });

  it('filters by journal on the same key the metrics count', () => {
    const named = work({ venue: { name: 'bioRxiv', issn_l: null } });
    expect(matches(named, filter({ journal: ['bioRxiv'] }))).toBe(true);
    expect(matches(work({ venue: null }), filter({ journal: ['bioRxiv'] }))).toBe(false);
  });

  it('filters by institution by ROR ID and by country', () => {
    const subject = work({
      institutions: [{ ror: '00cvxb145', name: 'University of Washington', country: 'US' }],
      countries: ['US'],
    });
    expect(matches(subject, filter({ institution: ['00cvxb145'] }))).toBe(true);
    expect(matches(subject, filter({ institution: ['02w0trx84'] }))).toBe(false);
    expect(matches(subject, filter({ country: ['US'] }))).toBe(true);
  });

  it('filters by author, keyed by OpenAlex ID and falling back to the name', () => {
    const byId = work({ authors: [author({ openalex: 'A5011565192' })] });
    const byName = work({ authors: [author({ openalex: null, name: 'Unindexed Person' })] });
    expect(matches(byId, filter({ author: ['A5011565192'] }))).toBe(true);
    expect(matches(byName, filter({ author: ['Unindexed Person'] }))).toBe(true);
    expect(authorKey({ openalex: null, name: 'Unindexed Person' })).toBe('Unindexed Person');
  });

  it('filters by open-access status', () => {
    expect(
      matches(work({ oa: { status: 'gold', url: null, license: null } }), filter({ oa: ['gold'] })),
    ).toBe(true);
    expect(
      matches(
        work({ oa: { status: 'closed', url: null, license: null } }),
        filter({ oa: ['gold'] }),
      ),
    ).toBe(false);
  });

  it('filters by kind, with is_preprint folded in', () => {
    const preprint = work({ kind: 'preprint', is_preprint: true });
    const article = work({ kind: 'article', is_preprint: false });
    expect(matches(preprint, filter({ kind: ['preprint'] }))).toBe(true);
    expect(matches(article, filter({ kind: ['preprint'] }))).toBe(false);
    expect(matches(article, filter({ kind: ['article'] }))).toBe(true);
    // A work whose canonical record is an article but which the export still flags a preprint
    // would otherwise be labelled a preprint and filtered as an article.
    expect(
      matches(work({ kind: 'article', is_preprint: true }), filter({ kind: ['preprint'] })),
    ).toBe(true);
  });

  it('filters by how the publication is known, which overlaps by design', () => {
    const both = work({ criteria: [1, 2] });
    expect(matches(both, filter({ criterion: [1] }))).toBe(true);
    expect(matches(both, filter({ criterion: [2] }))).toBe(true);
    expect(matches(both, filter({ criterion: [3] }))).toBe(false);
  });

  it('filters by whether the work is on UWPR’s own list', () => {
    expect(matches(work({ on_official_list: true }), filter({ onOfficialList: true }))).toBe(true);
    expect(matches(work({ on_official_list: true }), filter({ onOfficialList: false }))).toBe(
      false,
    );
    expect(matches(work({ on_official_list: false }), filter({ onOfficialList: null }))).toBe(true);
  });
});

describe('the explorer’s free-text search (docs/06 §4.8)', () => {
  const subject = work({
    title: 'Improvements to Casanovo',
    venue: { name: 'Journal of Proteome Research', issn_l: '1535-3893' },
    authors: [author({ name: 'Priska D. von Haller' })],
  });

  it('matches on title, author and venue, case-insensitively', () => {
    expect(matches(subject, filter({ search: 'casanovo' }))).toBe(true);
    expect(matches(subject, filter({ search: 'von haller' }))).toBe(true);
    expect(matches(subject, filter({ search: 'Proteome' }))).toBe(true);
  });

  it('matches nothing it does not contain, and everything on an empty term', () => {
    expect(matches(subject, filter({ search: 'ctenophore' }))).toBe(false);
    expect(matches(subject, filter({ search: '   ' }))).toBe(true);
  });
});

describe('every figure recomputes under the filter (docs/05 §1.1)', () => {
  it('a filtered aggregate is over the filtered rows, and is not the summary block', () => {
    const doc = sampleExport();
    const year = doc.works[0]?.year ?? 2026;
    const selected = applyFilter(doc.works, filter({ year: [year] }));
    const summary = summarize(selected);
    expect(summary.publications).toBe(selected.length);
    expect(summary.publications).toBeLessThan(doc.summary.publications);
    expect(summary.citations).toBeLessThanOrEqual(doc.summary.citations);
  });

  it('buildPredicate gives the same answer as matches', () => {
    const doc = sampleExport();
    const state = filter({ onOfficialList: true });
    const predicate = buildPredicate(state);
    expect(doc.works.filter(predicate)).toEqual(applyFilter(doc.works, state));
  });
});

describe('the funding dimensions (docs/09 §12.4)', () => {
  const index = grantsIndex();
  const nigmsWork = work({ grants: listings(index, R01) });
  const nhlbiWork = work({ grants: listings(index, P01) });
  const nsfWork = work({ grants: listings(index, NSF_PROJECT, GRFP) });
  const mixedWork = work({ grants: listings(index, R01, NSF_PROJECT) });
  const miscWork = work({ grants: listings(index, UNMATCHED) });
  const foundationWork = work({ grants: listings(index, FOUNDATION_GRANT) });
  const bare = work({ grants: [] });
  const works = [nigmsWork, nhlbiWork, nsfWork, mixedWork, miscWork, foundationWork, bare];
  const selected = (state: Partial<FilterState>) => applyFilter(works, filter(state), index);

  it('matches an agency anywhere in a listing’s chain: NIH matches every institute’s grant', () => {
    expect(selected({ agency: ['NIH'] })).toEqual([nigmsWork, nhlbiWork, mixedWork]);
    expect(selected({ agency: ['NIGMS'] })).toEqual([nigmsWork, mixedWork]);
    expect(selected({ agency: ['NHLBI'] })).toEqual([nhlbiWork]);
  });

  it('makes Miscellaneous selectable like any agency', () => {
    expect(selected({ agency: ['MISC'] })).toEqual([miscWork]);
  });

  it('matches a grant when the work lists it', () => {
    expect(selected({ grant: [R01.key] })).toEqual([nigmsWork, mixedWork]);
    expect(selected({ grant: [UNMATCHED.key] })).toEqual([miscWork]);
    expect(selected({ grant: ['NIH:R01GM777777'] })).toEqual([]);
  });

  it('combines values within a dimension with OR', () => {
    expect(selected({ agency: ['NHLBI', 'F4399999999'] })).toEqual([nhlbiWork, foundationWork]);
    expect(selected({ grant: [P01.key, GRFP.key] })).toEqual([nhlbiWork, nsfWork]);
  });

  it('combines dimensions with AND, with each other and with the rest', () => {
    expect(selected({ agency: ['NSF'], grant: [R01.key] })).toEqual([mixedWork]);
    expect(selected({ agency: ['NSF'], grant: [P01.key] })).toEqual([]);
    const dated = work({ year: 2015, grants: listings(index, R01) });
    expect(
      applyFilter([...works, dated], filter({ agency: ['NIGMS'], year: [2015] }), index),
    ).toEqual([dated]);
  });

  it('matches a work that lists no grant to no agency or grant selection', () => {
    expect(matches(bare, filter({ agency: ['NIH'] }), index)).toBe(false);
    expect(matches(bare, filter({ grant: [R01.key] }), index)).toBe(false);
    expect(matches(bare, EMPTY_FILTER, index)).toBe(true);
  });

  it('ignores a listing whose grant the index does not hold', () => {
    const stray = work({ grants: [listing({ grant: 'NIH:R01GM777777' })] });
    expect(matches(stray, filter({ agency: ['NIH'] }), index)).toBe(false);
  });

  it('matches nothing without the index, and leaves every other dimension alone', () => {
    expect(matches(nigmsWork, filter({ agency: ['NIH'] }))).toBe(false);
    expect(matches(nigmsWork, filter({ grant: [R01.key] }), null)).toBe(false);
    expect(matches(nigmsWork, filter({ year: [nigmsWork.year] }), null)).toBe(true);
  });

  it('buildPredicate gives the same answer as matches, index and all', () => {
    const state = filter({ agency: ['NSF'] });
    expect(works.filter(buildPredicate(state, index))).toEqual(applyFilter(works, state, index));
  });
});

describe('the funding dimensions on real rows', () => {
  it('selects, on the sample, exactly the works whose listings carry the agency', () => {
    const doc = sampleExport();
    const funding = fundingOf(doc);
    for (const code of doc.funding.agencies.map((item) => item.code)) {
      const expected = doc.works.filter((item) =>
        item.grants.some((entry) => (entry.agencies as readonly string[]).includes(code)),
      );
      expect(applyFilter(doc.works, filter({ agency: [code] }), funding)).toEqual(expected);
    }
  });

  it('does not break on a 1.0 export: the selection matches nothing, the empty filter all', () => {
    const doc = legacyDocument();
    const funding = fundingOf(doc);
    expect(funding).toBeNull();
    expect(applyFilter(doc.works, filter({ agency: ['NIH'] }), funding)).toEqual([]);
    expect(applyFilter(doc.works, filter({ grant: ['NIH:R01GM999001'] }), funding)).toEqual([]);
    expect(applyFilter(doc.works, EMPTY_FILTER, funding)).toEqual(doc.works);
  });
});

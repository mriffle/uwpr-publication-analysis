import { describe, expect, it } from 'vitest';
import { applyFilter, authorKey, buildPredicate, matches } from '../../src/filter/predicate';
import { EMPTY_FILTER, type FilterState } from '../../src/filter/state';
import type { Topic } from '../../src/contract/types';
import { summarize } from '../../src/aggregate/metrics';
import { sampleExport } from '../support/fixture';
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

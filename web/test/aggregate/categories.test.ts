/**
 * The ranked-category aggregates of docs/05 §7.6–§7.9, §7.13 and §7.14.
 *
 * Each of these charts has one measured constraint that would be got wrong without it, and each
 * one is asserted here as arithmetic rather than through a rendered chart.
 */
import { describe, expect, it } from 'vitest';
import {
  criteriaBars,
  dominantCountry,
  dominantInstitution,
  rankCountries,
  rankInstitutions,
  rankJournals,
  rankResearchers,
  rankSubfields,
  worksOutside,
} from '../../src/aggregate/categories';
import type { Institution, Topic } from '../../src/contract/types';
import { author, work } from '../support/works';
import { isSampleExport, sampleExport } from '../support/fixture';

const uw: Institution = { ror: '00cvxb145', name: 'University of Washington', country: 'US' };
const isb: Institution = { ror: '02tpgw303', name: 'Institute for Systems Biology', country: 'US' };
const other: Institution = { ror: '000000001', name: 'Somewhere Else', country: 'DE' };

const topic = (overrides: Partial<Topic> = {}): Topic => ({
  domain: 'Physical Sciences',
  field: 'Chemistry',
  subfield: 'Spectroscopy',
  topic: 'Advanced Proteomics Techniques and Applications',
  score: 0.9,
  primary: true,
  ...overrides,
});

describe('the dominant institution and country are derived, never named (docs/05 §1.1 principle 5)', () => {
  it('finds the one value on more than half the works', () => {
    const works = [
      work({ institutions: [uw, isb] }),
      work({ institutions: [uw] }),
      work({ institutions: [uw] }),
      work({ institutions: [isb] }),
    ];
    expect(dominantInstitution(works)?.key).toBe(uw.ror);
    expect(dominantInstitution(works)?.count).toBe(3);
  });

  it('finds nothing when no value dominates, so no chart silently drops a category', () => {
    const works = [work({ institutions: [uw] }), work({ institutions: [isb] })];
    expect(dominantInstitution(works)).toBeNull();
  });

  it('finds nothing in an empty corpus', () => {
    expect(dominantInstitution([])).toBeNull();
    expect(dominantCountry([])).toBeNull();
  });

  it('does the same for countries, which is what the geography sentence counts "outside"', () => {
    const works = [
      work({ countries: ['US'] }),
      work({ countries: ['US', 'DE'] }),
      work({ countries: ['CN'] }),
    ];
    expect(dominantCountry(works)?.key).toBe('US');
    expect(worksOutside(works, 'US')).toBe(2);
    expect(worksOutside(works, null)).toBe(3);
  });

  it('matches the measured shape of the real corpus when run against it', () => {
    const doc = sampleExport();
    const home = dominantInstitution(doc.works);
    // The sample is small and may have no dominant institution; the real export does.
    if (home !== null) expect(home.count / doc.works.length).toBeGreaterThan(0.5);
  });
});

describe('institutions (docs/05 §7.8)', () => {
  const works = [
    work({ institutions: [uw, isb] }),
    work({ institutions: [uw, isb] }),
    work({ institutions: [uw, other] }),
  ];

  it('excludes the institution it is told to, and counts a work once per institution', () => {
    const ranked = rankInstitutions(works, { exclude: uw.ror });
    expect(ranked.items.map((item) => item.key)).toEqual([isb.ror, other.ror]);
    expect(ranked.items[0]?.count).toBe(2);
  });

  it('states how many are not shown, which is the chart’s honesty constraint', () => {
    const ranked = rankInstitutions(works, { exclude: uw.ror, limit: 1 });
    expect(ranked.items).toHaveLength(1);
    expect(ranked.distinct).toBe(2);
    expect(ranked.notShown).toBe(1);
  });

  it('counts a repeated affiliation once per work, never once per author', () => {
    const repeated = work({ institutions: [uw], authors: [author(), author({ name: 'B' })] });
    expect(rankInstitutions([repeated]).items[0]?.count).toBe(1);
  });
});

describe('journals (docs/05 §7.9)', () => {
  it('keys a venue by ISSN-L where present, else by name — the same key the metrics count', () => {
    const works = [
      work({ venue: { name: 'Journal of Proteome Research', issn_l: '1535-3893' } }),
      work({ venue: { name: 'J. Proteome Res.', issn_l: '1535-3893' } }),
    ];
    const ranked = rankJournals(works);
    expect(ranked.items).toHaveLength(1);
    expect(ranked.items[0]?.count).toBe(2);
  });

  it('labels a venue whose works are all preprints as a preprint server', () => {
    const works = [
      work({ kind: 'preprint', is_preprint: true, venue: { name: 'bioRxiv', issn_l: null } }),
      work({ venue: { name: 'Nature', issn_l: '0028-0836' } }),
    ];
    const ranked = rankJournals(works);
    expect(ranked.items.find((item) => item.label === 'bioRxiv')?.preprintServer).toBe(true);
    expect(ranked.items.find((item) => item.label === 'Nature')?.preprintServer).toBe(false);
  });

  it('does not call a venue a preprint server when it also carries an article', () => {
    const works = [
      work({ kind: 'preprint', is_preprint: true, venue: { name: 'Mixed', issn_l: 'X' } }),
      work({ venue: { name: 'Mixed', issn_l: 'X' } }),
    ];
    expect(rankJournals(works).items[0]?.preprintServer).toBe(false);
  });

  it('skips a work with no venue rather than inventing one', () => {
    expect(rankJournals([work({ venue: null })]).distinct).toBe(0);
  });
});

describe('researchers (docs/05 §7.7)', () => {
  const staffAuthor = author({ name: 'J. Eng', openalex: 'A-staff', staff: 'eng' });
  const outside = author({ name: 'E. Investigator', openalex: 'A-out' });
  const works = [
    work({ authors: [staffAuthor, outside] }),
    work({ authors: [staffAuthor] }),
    work({ authors: [outside] }),
  ];

  it('defaults to non-staff researchers', () => {
    const ranked = rankResearchers(works);
    expect(ranked.items.map((item) => item.key)).toEqual(['A-out']);
  });

  it('includes staff on request, and marks them distinctly', () => {
    const ranked = rankResearchers(works, { includeStaff: true });
    expect(ranked.items.map((item) => item.key).sort()).toEqual(['A-out', 'A-staff']);
    expect(ranked.items.find((item) => item.key === 'A-staff')?.staff).toBe('eng');
    expect(ranked.items.find((item) => item.key === 'A-out')?.staff).toBeNull();
  });

  it('keys identity on the OpenAlex ID, falling back to the name where there is none', () => {
    const noId = author({ name: 'No Identifier', openalex: null });
    const ranked = rankResearchers([work({ authors: [noId] }), work({ authors: [noId] })]);
    expect(ranked.items[0]?.key).toBe('No Identifier');
    expect(ranked.items[0]?.count).toBe(2);
  });

  it('counts one work once for an author listed on it twice', () => {
    const twice = work({ authors: [outside, { ...outside }] });
    expect(rankResearchers([twice]).items[0]?.count).toBe(1);
  });

  it('marks a person as staff if any of their authorship rows does', () => {
    const unmarked = author({ name: 'J. Eng', openalex: 'A-staff', staff: null });
    const ranked = rankResearchers(
      [work({ authors: [unmarked] }), work({ authors: [staffAuthor] })],
      { includeStaff: true },
    );
    expect(ranked.items[0]?.staff).toBe('eng');
  });
});

describe('research areas overall, at subfield level (docs/05 §7.6)', () => {
  it('counts a publication once per distinct subfield it touches', () => {
    const works = [
      work({
        topics: [
          topic({ subfield: 'Spectroscopy' }),
          topic({ subfield: 'Spectroscopy', primary: false }),
          topic({ subfield: 'Molecular Biology', primary: false }),
        ],
      }),
    ];
    const ranked = rankSubfields(works);
    expect(ranked.items.find((item) => item.key === 'Spectroscopy')?.count).toBe(1);
    expect(ranked.distinct).toBe(2);
  });

  it('ranks by count and breaks ties on the label, so the order never moves on its own', () => {
    const works = [work({ topics: [topic({ subfield: 'B' }), topic({ subfield: 'A' })] })];
    expect(rankSubfields(works).items.map((item) => item.key)).toEqual(['A', 'B']);
  });
});

describe('countries (docs/05 §7.14)', () => {
  it('excludes the dominant country and ranks the rest', () => {
    const works = [
      work({ countries: ['US', 'DE'] }),
      work({ countries: ['US', 'DE'] }),
      work({ countries: ['US', 'CN'] }),
    ];
    const ranked = rankCountries(works, { exclude: 'US' });
    expect(ranked.items.map((item) => item.key)).toEqual(['DE', 'CN']);
  });
});

describe('how each publication is known (docs/05 §7.13)', () => {
  const labels = { 1: 'Listed', 2: 'Funding code', 3: 'Staff', 4: 'Facilities' };

  it('sums to more than the number of works, and says how many overlap', () => {
    const works = [work({ criteria: [1, 2] }), work({ criteria: [1] }), work({ criteria: [4] })];
    const bars = criteriaBars(works, labels);
    expect(bars.works).toBe(3);
    expect(bars.total).toBe(4);
    expect(bars.overlapping).toBe(1);
    expect(bars.total).toBeGreaterThan(bars.works);
  });

  it('uses the plain-language label, never the criterion number, as the bar’s name', () => {
    const bars = criteriaBars([work({ criteria: [1] })], labels);
    expect(bars.items[0]?.label).toBe('Listed');
    expect(bars.items[0]?.criterion).toBe(1);
  });

  it('falls back to a readable name for a criterion the app has no label for', () => {
    const bars = criteriaBars([work({ criteria: [4] })], {});
    expect(bars.items[0]?.label).toBe('Criterion 4');
  });
});

describe.skipIf(!isSampleExport)('against the committed sample export', () => {
  const doc = sampleExport();

  it('never counts an institution more times than there are works', () => {
    for (const item of rankInstitutions(doc.works, { limit: 100 }).items) {
      expect(item.count).toBeLessThanOrEqual(doc.works.length);
    }
  });

  it('agrees with the summary block on the number of distinct venues', () => {
    expect(rankJournals(doc.works, doc.works.length).distinct).toBe(doc.summary.journals);
  });

  it('agrees with the summary block on the number of distinct institutions', () => {
    expect(rankInstitutions(doc.works, { limit: doc.works.length * 10 }).distinct).toBe(
      doc.summary.institutions,
    );
  });

  it('agrees with the summary block on the number of distinct countries', () => {
    expect(rankCountries(doc.works, { limit: 1000 }).distinct).toBe(doc.summary.countries);
  });
});

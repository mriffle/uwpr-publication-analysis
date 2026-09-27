/**
 * Every figure and series of Funding impact (`aggregate/funding.ts`, docs/09 §12.5–12.7), as
 * arithmetic over a small hand-built world where each number can be worked out on paper.
 *
 * The world: NIH (NIGMS, NHLBI and one grant of its own), NSF, a foundation learned from
 * OpenAlex, and Miscellaneous. Six works:
 *
 * | work  | year | lists                                   |
 * |-------|------|-----------------------------------------|
 * | W2019 | 2019 | R01 ($1.0M), UNMATCHED                  |
 * | W2020 | 2020 | UNMATCHED only                          |
 * | W2021 | 2021 | R01, P01 ($2.5M, by override), GRFP ($4.0M, institution-wide) |
 * | W2022 | 2022 | NSF_PROJECT, NIH_DIRECT, FOREIGN — no amount known for any |
 * | W2023 | 2023 | nothing                                 |
 * | W2026 | 2026 | GRFP only (2026 is the partial year)    |
 *
 * The sample export's agreement with the pipeline is `funding-crosscheck.test.ts`'s.
 */
import { describe, expect, it } from 'vitest';
import {
  GRANTS_BUCKET_YEARS,
  GRANT_CATEGORIES,
  NIH_ROOT,
  UNFILTERED,
  VALUE_BUCKET_YEARS,
  agencyDetail,
  agencyLabel,
  coverage,
  cumulativeDollars,
  dollarTotal,
  firstYearDisagreements,
  fundingFigures,
  fundingScope,
  grantDetail,
  grantKinds,
  investigatorKey,
  keptUnmatched,
  knownAmount,
  newGrantsByAgency,
  normalisedName,
  otherKind,
  rankAgencies,
  summarizeFunding,
  valueByAgency,
  type FundingScope,
} from '../../src/aggregate/funding';
import { OTHER_SERIES } from '../../src/aggregate/stack';
import { buildFundingIndex, type FundingIndex } from '../../src/contract/funding';
import type { Agency, Grant, Period, Work } from '../../src/contract/types';
import type { GrantSelection } from '../../src/filter/funding';
import {
  FUNDING_AS_OF,
  agency,
  fundingBlock,
  grant,
  listing,
  miscellaneous,
  nigms,
  reporterSource,
  unresolvedGrant,
} from '../support/funding';
import { FOUNDATION, NHLBI, NSF, RESOURCE, listings } from '../support/grants';
import { work } from '../support/works';

const period: Period = {
  first_year: 2018,
  last_year: 2026,
  complete_through: 2025,
  current_year_partial: true,
  citation_years_from: 2012,
  citations_before_window: 0,
};

const noAmount = {
  amount_usd: null,
  amount_original: null,
  currency: null,
  amount_source: null,
  fiscal_years: null,
} as const;

const R01 = grant({
  first_year: 2019,
  amount_usd: 1_000_000,
  pis: [{ name: 'A. Investigator', id: '10000001' }],
  organization: 'University of Washington',
  flags: ['active'],
});
const P01 = grant({
  key: 'NIH:P01HL000002',
  agency: 'NHLBI',
  number: 'P01HL000002',
  category: 'center',
  first_year: 2021,
  amount_usd: 2_500_000,
  fiscal_years: { '2026': 500_000, '2023': null, '2024': 1_000_000, '2025': 1_000_000 },
  // The same person as R01's, by ID, under another spelling; and a second one.
  pis: [
    { name: 'B. Investigator', id: '10000002' },
    { name: 'A. INVESTIGATOR', id: '10000001' },
  ],
  organization: 'UNIVERSITY  OF WASHINGTON',
  flags: ['starts_before_fy1985'],
});
const NIH_DIRECT = grant({
  ...noAmount,
  key: 'NIH:OT2OD000003',
  agency: 'NIH',
  number: 'OT2OD000003',
  category: 'other',
  first_year: 2022,
  fiscal_years: { '2021': null },
  pis: [],
  organization: null,
  flags: ['no_amount_reported'],
});
const GRFP = grant({
  key: 'NSF:0718124',
  agency: 'NSF',
  number: '0718124',
  category: 'training',
  scope: 'institution-wide',
  scope_reason: 'NSF GRFP institutional award',
  first_year: 2021,
  amount_usd: 4_000_000,
  fiscal_years: null,
  amount_source: {
    name: 'NSF Award API',
    url: 'https://www.nsf.gov/awardsearch/show-award/?AWD_ID=0718124',
    as_of: FUNDING_AS_OF,
    basis: 'nsf_obligated',
  },
  // Named without an ID: keyed by the name normalised.
  pis: [{ name: 'C.  Person', id: null }],
  organization: 'University of Washington',
});
const NSF_PROJECT = grant({
  ...noAmount,
  key: 'NSF:1443474',
  agency: 'NSF',
  number: '1443474',
  first_year: 2022,
  // An empty ID is as absent as a null: keyed by name, the same person as GRFP's.
  pis: [{ name: 'c. person', id: '' }],
  organization: '',
  flags: ['amount_not_found'],
});
const FOREIGN = grant({
  ...noAmount,
  key: 'F4399999999:UA99001',
  agency: 'F4399999999',
  number: 'UA-99001',
  category: 'other',
  first_year: 2022,
  currency: 'UAH',
  pis: [],
  organization: 'Kyiv Institute',
  flags: ['amount_from_openalex', 'unconverted_currency'],
});
const UNMATCHED = unresolvedGrant({ first_year: 2019 });
/** Held by the block, listed by no work: the validator refuses it, and the check reports it. */
const ORPHAN = grant({ key: 'NIH:R21GM000009', number: 'R21GM000009', first_year: 2020 });

const AGENCIES: Agency[] = [agency(), nigms(), NHLBI, NSF, FOUNDATION, miscellaneous()];
const GRANTS: Grant[] = [R01, P01, NIH_DIRECT, GRFP, NSF_PROJECT, FOREIGN, UNMATCHED, ORPHAN];
const NSF_SOURCE = {
  id: 'nsf' as const,
  name: 'NSF Award API',
  url: 'https://www.nsf.gov/',
  as_of: FUNDING_AS_OF,
  amounts_from: null,
  partial_year: null,
};

const index: FundingIndex = buildFundingIndex(
  fundingBlock({ agencies: AGENCIES, grants: GRANTS, sources: [reporterSource(), NSF_SOURCE] }),
  RESOURCE,
);

const OVERRIDE = {
  reason: 'SAMPLE ONLY: a serial a digit short.',
  by: 'tester',
  date: '2026-09-26',
};

const W2019 = work({ id: 'W-009019', year: 2019, grants: listings(index, R01, UNMATCHED) });
const W2020 = work({ id: 'W-009020', year: 2020, grants: listings(index, UNMATCHED) });
const W2021 = work({
  id: 'W-009021',
  year: 2021,
  grants: [
    ...listings(index, R01),
    listing({
      grant: P01.key,
      how: 'override',
      cited_as: ['P01 HL00000'],
      override: OVERRIDE,
      agencies: ['NIH', 'NHLBI'],
    }),
    ...listings(index, GRFP),
  ],
});
const W2022 = work({
  id: 'W-009022',
  year: 2022,
  grants: listings(index, NSF_PROJECT, NIH_DIRECT, FOREIGN),
});
const W2023 = work({ id: 'W-009023', year: 2023, grants: [] });
const W2026 = work({ id: 'W-009026', year: 2026, grants: listings(index, GRFP) });
const WORKS: Work[] = [W2019, W2020, W2021, W2022, W2023, W2026];

const selection = (over: Partial<GrantSelection> = {}): GrantSelection => ({
  ...UNFILTERED,
  ...over,
});
const scopeOf = (works: readonly Work[] = WORKS, over: Partial<GrantSelection> = {}) =>
  fundingScope(works, index, selection(over));
const keys = (scope: FundingScope) => scope.grants.map((entry) => entry.grant.key);

const all = scopeOf();
const excluded = scopeOf(WORKS, { institutionWide: 'exclude' });
const nothing = scopeOf(WORKS, { agencies: ['NOPE'] });
const unknownOnly = scopeOf([W2022]);

describe('the scope: each grant once, with what the filter changes', () => {
  it('holds every grant the works list, each once, sorted by key', () => {
    expect(keys(all)).toEqual([
      'F4399999999:UA99001',
      'MISC:R01GM999999',
      'NIH:OT2OD000003',
      'NIH:P01HL000002',
      'NIH:R01GM000001',
      'NSF:0718124',
      'NSF:1443474',
    ]);
  });

  it('counts a grant listed by two works once, at its earliest year, with both works', () => {
    const r01 = all.grants.find((entry) => entry.grant.key === R01.key);
    expect(r01).toMatchObject({ firstYear: 2019, works: [W2019.id, W2021.id], root: 'NIH' });
  });

  it('recomputes the first year under a filter', () => {
    const r01 = scopeOf([W2021, W2026]).grants.find((entry) => entry.grant.key === R01.key);
    expect(r01?.firstYear).toBe(2021);
    expect(r01?.works).toEqual([W2021.id]);
  });

  it('counts a work once however often it lists the same grant', () => {
    const twice = work({ year: 2020, grants: listings(index, R01, R01) });
    expect(scopeOf([twice]).grants[0]?.works).toEqual([twice.id]);
  });

  it('marks Miscellaneous by its group, and the root agency by the chain', () => {
    const byKey = new Map(all.grants.map((entry) => [entry.grant.key, entry]));
    expect(byKey.get(UNMATCHED.key)?.miscellaneous).toBe(true);
    expect(byKey.get(P01.key)?.root).toBe('NIH');
    expect(byKey.get(P01.key)?.miscellaneous).toBe(false);
    expect(byKey.get(FOREIGN.key)?.root).toBe('F4399999999');
  });

  it('counts the publications: N shown, K listing anything, and those listing a grant', () => {
    expect(all.publications).toBe(6);
    expect(all.withListings).toBe(5);
    expect(all.withGrants).toBe(4);
  });

  it('leaves nothing out while institution-wide awards are included', () => {
    expect(all.leftOut).toEqual([]);
  });

  it('says what the exclusion left out, and drops a work listing only that', () => {
    expect(excluded.leftOut.map((item) => item.key)).toEqual([GRFP.key]);
    expect(keys(excluded)).not.toContain(GRFP.key);
    expect(excluded.withListings).toBe(4);
    expect(excluded.withGrants).toBe(3);
  });

  it('leaves nothing out while a grant is selected, since the selection overrides the toggle', () => {
    const selected = scopeOf(WORKS, { grants: [GRFP.key], institutionWide: 'exclude' });
    expect(keys(selected)).toEqual([GRFP.key]);
    expect(selected.leftOut).toEqual([]);
  });

  it('keeps nothing without funding data, and still counts the publications', () => {
    const none = fundingScope(WORKS, null, UNFILTERED);
    expect(none).toMatchObject({ grants: [], leftOut: [], publications: 6, withListings: 0 });
  });

  it('keeps nothing when the selection matches nothing', () => {
    expect(nothing.grants).toEqual([]);
    expect(nothing.withListings).toBe(0);
  });
});

describe('dollars: a known sum beside an unknown count', () => {
  it('sums only the known amounts and counts the rest', () => {
    expect(dollarTotal([R01, NIH_DIRECT, P01])).toEqual({
      amountUsd: 3_500_000,
      withAmount: 2,
      withoutAmount: 1,
    });
  });

  it('reads as not known — null, never $0 — when every amount is unknown', () => {
    const total = dollarTotal([NIH_DIRECT, NSF_PROJECT]);
    expect(total).toEqual({ amountUsd: 0, withAmount: 0, withoutAmount: 2 });
    expect(knownAmount(total)).toBeNull();
  });

  it('reads as nothing — null — for no grant at all', () => {
    expect(knownAmount(dollarTotal([]))).toBeNull();
  });

  it('reads as the sum when any amount is known', () => {
    expect(knownAmount(dollarTotal([R01, NIH_DIRECT]))).toBe(1_000_000);
  });
});

describe('names, keyed as the pipeline keys them (docs/09 §11.6)', () => {
  const c = (...points: number[]) => String.fromCodePoint(...points);

  // Each expected value is Python's `" ".join(unicodedata.normalize("NFKC", s).casefold().split())`.
  it.each([
    ['  Sample  Investigator K ', 'sample investigator k'],
    ['STRAUSS', 'strauss'],
    [`Strau${c(0xdf)}`, 'strauss'],
    [`STRAU${c(0x1e9e)}`, 'strauss'],
    [c(0x39f, 0x394, 0x39f, 0x3a3), c(0x3bf, 0x3b4, 0x3bf, 0x3c3)],
    [c(0x3bf, 0x3b4, 0x3bf, 0x3c2), c(0x3bf, 0x3b4, 0x3bf, 0x3c3)],
    [`Y${c(0x131)}ld${c(0x131)}z`, `y${c(0x131)}ld${c(0x131)}z`],
    [c(0xff26, 0xff55, 0xff4c, 0xff4c), 'full'],
    [`a${c(0xa0)}b`, 'a b'],
    [`a${c(0x2003)}b`, 'a b'],
    [`a${c(0x1c)}b`, 'a b'],
    [`a${c(0x85)}b`, 'a b'],
    [`a${c(0xfeff)}b`, `a${c(0xfeff)}b`],
    [`a${c(9)}b${c(10)}c`, 'a b c'],
    [`${c(0xfb01)}nn`, 'finn'],
  ])('%j → %j', (name, expected) => {
    expect(normalisedName(name)).toBe(expected);
  });

  it('keys an investigator by ID when there is one, else by name', () => {
    expect(investigatorKey({ name: 'A. Investigator', id: '10000001' })).toBe('10000001');
    expect(investigatorKey({ name: 'C.  Person', id: null })).toBe('c. person');
    expect(investigatorKey({ name: 'C. PERSON', id: '' })).toBe('c. person');
  });
});

describe('headline figures', () => {
  const figures = fundingFigures(all);

  it('totals the known amounts of the grants listed, and counts the unknown beside it', () => {
    expect(figures.amountUsd).toBe(7_500_000);
    expect(figures.withAmount).toBe(3);
    expect(figures.withoutAmount).toBe(3);
    expect(knownAmount(figures)).toBe(7_500_000);
  });

  it('counts every grant, the grants listed, and the unmatched numbers apart', () => {
    expect(figures.grants).toBe(7);
    expect(figures.listed).toBe(6);
    expect(figures.miscellaneous).toBe(1);
    expect(figures.withAmount + figures.withoutAmount).toBe(figures.listed);
  });

  it('counts distinct root agencies, not Miscellaneous', () => {
    expect(figures.agencies).toBe(3);
  });

  it('counts investigators by ID or name, and organisations by name, as §11.6 keys them', () => {
    // 10000001 (twice, two spellings), 10000002, and "c. person" (a null ID and an empty one).
    expect(figures.investigators).toBe(3);
    // "university of washington" three ways, and Kyiv; a null and an empty one count nothing.
    expect(figures.organizations).toBe(2);
  });

  it('counts K of N publications', () => {
    expect(figures).toMatchObject({ publications: 6, withListings: 5, withGrants: 4 });
  });

  it('states the institution-wide awards included, and their value', () => {
    expect(figures.institutionWide).toEqual({
      included: true,
      grants: 1,
      amountUsd: 4_000_000,
      withAmount: 1,
      withoutAmount: 0,
    });
  });

  it('states what the exclusion left out, and leaves it out of the total', () => {
    const without = fundingFigures(excluded);
    expect(without.amountUsd).toBe(3_500_000);
    expect(without.listed).toBe(5);
    expect(without.institutionWide).toMatchObject({
      included: false,
      grants: 1,
      amountUsd: 4_000_000,
    });
  });

  it('counts a selected institution-wide award as included, whatever the position', () => {
    const selected = fundingFigures(
      scopeOf(WORKS, { grants: [GRFP.key], institutionWide: 'exclude' }),
    );
    expect(selected.amountUsd).toBe(4_000_000);
    expect(selected.institutionWide).toMatchObject({ included: true, grants: 1 });
  });

  it('says "not known", never $0, when every amount in view is unknown', () => {
    const unknown = fundingFigures(unknownOnly);
    expect(unknown).toMatchObject({ listed: 3, withAmount: 0, withoutAmount: 3, amountUsd: 0 });
    expect(knownAmount(unknown)).toBeNull();
  });

  it('is empty, and not known, for an empty scope', () => {
    const empty = fundingFigures(nothing);
    expect(empty).toMatchObject({
      grants: 0,
      listed: 0,
      miscellaneous: 0,
      agencies: 0,
      investigators: 0,
      organizations: 0,
      withAmount: 0,
      withoutAmount: 0,
      withListings: 0,
    });
    expect(knownAmount(empty)).toBeNull();
  });

  it('counts only unmatched numbers when Miscellaneous alone is selected', () => {
    const misc = fundingFigures(scopeOf(WORKS, { agencies: ['MISC'] }));
    expect(misc).toMatchObject({ grants: 1, listed: 0, miscellaneous: 1, agencies: 0 });
    expect(misc).toMatchObject({ withListings: 2, withGrants: 0 });
  });
});

describe('value over time: each grant’s full amount in its first year (F3)', () => {
  const series = cumulativeDollars(all, period);
  const at = (year: number) => series.points.find((point) => point.year === year);

  it('spans the export’s period', () => {
    expect(series.points.map((point) => point.year)).toEqual([
      2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026,
    ]);
  });

  it('enters each grant once, in its first year, and ends exactly at the total', () => {
    expect(at(2019)).toMatchObject({ count: 1_000_000, cumulative: 1_000_000, grants: 1 });
    expect(at(2021)).toMatchObject({ count: 6_500_000, cumulative: 7_500_000, grants: 2 });
    expect(series.points.at(-1)?.cumulative).toBe(fundingFigures(all).amountUsd);
    expect(series.amountUsd).toBe(7_500_000);
    expect(series.grants).toBe(6);
  });

  it('counts the grants of unknown amount in the year they enter, beside the value', () => {
    expect(at(2022)).toMatchObject({ count: 0, grants: 3, withAmount: 0, withoutAmount: 3 });
    expect(series.withoutAmount).toBe(3);
    const perYear = series.points.reduce((sum, point) => sum + point.withoutAmount, 0);
    expect(perYear).toBe(series.withoutAmount);
  });

  it('leaves unmatched numbers out of the grants entering', () => {
    expect(at(2019)?.grants).toBe(1);
    expect(at(2020)?.grants).toBe(0);
  });

  it('marks the partial year', () => {
    expect(series.points.filter((point) => point.partial).map((point) => point.year)).toEqual([
      2026,
    ]);
  });

  it('moves a grant’s value to its first year under the filter', () => {
    const later = cumulativeDollars(scopeOf([W2021, W2026]), period);
    expect(later.points.find((point) => point.year === 2019)?.count).toBe(0);
    expect(later.points.find((point) => point.year === 2021)?.count).toBe(7_500_000);
  });

  it('draws a flat zero with every grant counted unknown when no amount is known', () => {
    const unknown = cumulativeDollars(unknownOnly, period);
    expect(unknown.points.every((point) => point.cumulative === 0)).toBe(true);
    expect(unknown.withoutAmount).toBe(3);
    expect(knownAmount(unknown)).toBeNull();
  });

  it('draws the frame with nothing in it for an empty scope', () => {
    const empty = cumulativeDollars(nothing, period);
    expect(empty.points).toHaveLength(9);
    expect(empty.grants).toBe(0);
  });
});

describe('value by agency and new grants by agency', () => {
  it('stacks known value by root agency in single years, summing to the total', () => {
    const stack = valueByAgency(all, period);
    expect(stack.bucketYears).toBe(VALUE_BUCKET_YEARS);
    // NSF $4.0M, NIH $3.5M; the foundation and Miscellaneous have no known value, so no $0 series.
    expect(stack.series.map((series) => [series.key, series.label, series.total])).toEqual([
      ['NSF', 'NSF', 4_000_000],
      ['NIH', 'NIH', 3_500_000],
    ]);
    expect(stack.total).toBe(fundingFigures(all).amountUsd);
  });

  it('counts new grants by root agency in three-year buckets, Miscellaneous pinned', () => {
    const stack = newGrantsByAgency(all, period);
    expect(stack.bucketYears).toBe(GRANTS_BUCKET_YEARS);
    expect(stack.series.map((series) => [series.key, series.role, series.total])).toEqual([
      ['NIH', 'ranked', 3],
      ['NSF', 'ranked', 2],
      ['F4399999999', 'ranked', 1],
      ['MISC', 'pinned', 1],
    ]);
    expect(stack.series[2]?.label).toBe('SAMPLE Research Foundation');
    // 2018–2020: R01 and the unmatched number; 2021–2023: the other five.
    expect(stack.buckets.map((bucket) => bucket.total)).toEqual([2, 5, 0]);
    expect(stack.total).toBe(fundingFigures(all).grants);
  });

  it('offers single years', () => {
    const stack = newGrantsByAgency(all, period, { bucketYears: 1 });
    expect(stack.buckets).toHaveLength(9);
    expect(stack.buckets.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(7);
  });

  it('keeps the top five, pins Miscellaneous, and never merges it into Other', () => {
    // Seven root agencies with 7…1 grants, and Miscellaneous with more than any of them.
    const roots = Array.from({ length: 7 }, (_, at) =>
      agency({ code: `AG${String(at + 1)}`, name: `Agency ${String(at + 1)}`, short_name: null }),
    );
    const grants = roots.flatMap((root, at) =>
      Array.from({ length: 7 - at }, (_, n) =>
        grant({ key: `${root.code}:G${String(n)}`, agency: root.code, number: `G${String(n)}` }),
      ),
    );
    const unmatched = Array.from({ length: 9 }, (_, n) =>
      unresolvedGrant({ key: `MISC:X${String(n)}`, number: `X${String(n)}` }),
    );
    const big = buildFundingIndex(
      fundingBlock({ agencies: [...roots, miscellaneous()], grants: [...grants, ...unmatched] }),
      RESOURCE,
    );
    const works = [...grants, ...unmatched].map((item) =>
      work({ year: 2020, grants: listings(big, item) }),
    );
    const stack = newGrantsByAgency(fundingScope(works, big, UNFILTERED), period);
    expect(stack.series.map((series) => series.key)).toEqual([
      'AG1',
      'AG2',
      'AG3',
      'AG4',
      'AG5',
      'MISC',
      OTHER_SERIES,
    ]);
    const other = stack.series.at(-1);
    expect(other?.members).toEqual(['AG6', 'AG7']);
    expect(other?.members).not.toContain('MISC');
    expect(stack.series.find((series) => series.key === 'MISC')?.total).toBe(9);
    expect(stack.total).toBe(grants.length + unmatched.length);
  });

  it('stacks nothing for an empty scope, or without funding data', () => {
    expect(valueByAgency(nothing, period).series).toEqual([]);
    const none = newGrantsByAgency(fundingScope(WORKS, null, UNFILTERED), period);
    expect(none.series).toEqual([]);
    expect(none.total).toBe(0);
  });
});

describe('agency ranking', () => {
  it('ranks root agencies by known value, with grants, unknowns and publications', () => {
    const ranking = rankAgencies(all);
    expect(
      ranking.items.map((row) => [row.code, row.amountUsd, row.grants, row.withoutAmount]),
    ).toEqual([
      ['NSF', 4_000_000, 2, 1],
      ['NIH', 3_500_000, 3, 1],
      ['F4399999999', 0, 1, 1],
    ]);
    expect(ranking.items.map((row) => row.publications)).toEqual([3, 3, 1]);
    expect(ranking).toMatchObject({ distinct: 3, notShown: 0 });
  });

  it('ranks by grants, value breaking the tie', () => {
    const ranking = rankAgencies(all, { by: 'grants' });
    expect(ranking.items.map((row) => row.code)).toEqual(['NIH', 'NSF', 'F4399999999']);
  });

  it('keeps Miscellaneous apart from the ranking, with its numbers and publications', () => {
    const ranking = rankAgencies(all);
    expect(ranking.items.map((row) => row.code)).not.toContain('MISC');
    expect(ranking.miscellaneous).toMatchObject({
      code: 'MISC',
      label: 'Miscellaneous',
      grants: 1,
      publications: 2,
      withAmount: 0,
      withoutAmount: 1,
    });
  });

  it('shows up to the limit and counts what it does not show', () => {
    const ranking = rankAgencies(all, { limit: 2 });
    expect(ranking.items).toHaveLength(2);
    expect(ranking).toMatchObject({ distinct: 3, notShown: 1 });
  });

  it('describes each agency for the table', () => {
    const nsf = rankAgencies(all).items[0];
    expect(nsf).toMatchObject({
      code: 'NSF',
      label: 'NSF',
      name: 'U.S. National Science Foundation',
      shortName: 'NSF',
      parent: null,
      country: 'US',
      group: 'us_federal',
    });
    const foundation = rankAgencies(all).items[2];
    expect(foundation).toMatchObject({ label: 'SAMPLE Research Foundation', shortName: null });
  });

  it('ranks each grant’s own agency, with its parent, at the agency level', () => {
    const ranking = rankAgencies(all, { level: 'agency', limit: Infinity });
    expect(ranking.items.map((row) => [row.code, row.parent])).toEqual([
      ['NSF', null],
      ['NHLBI', 'NIH'],
      ['NIGMS', 'NIH'],
      // Both have no known value and one grant each: the label decides.
      ['NIH', null],
      ['F4399999999', null],
    ]);
    expect(ranking.distinct).toBe(5);
  });

  it('breaks a tie of both measures by label', () => {
    // One grant of unknown amount each: "NIH", "NSF", "SAMPLE Research Foundation".
    const tied = rankAgencies(unknownOnly);
    expect(tied.items.map((row) => row.code)).toEqual(['NIH', 'NSF', 'F4399999999']);
    expect(tied.items.map((row) => row.label)).toEqual([
      'NIH',
      'NSF',
      agencyLabel(index, 'F4399999999'),
    ]);
  });

  it('ranks nothing for an empty scope or without funding data', () => {
    expect(rankAgencies(nothing)).toEqual({
      items: [],
      distinct: 0,
      notShown: 0,
      miscellaneous: null,
    });
    expect(rankAgencies(fundingScope(WORKS, null, UNFILTERED)).items).toEqual([]);
  });

  it('orders agencies of the same name by code', () => {
    const twins = ['F2', 'F1'].map((code) =>
      agency({ code, name: 'SAMPLE Twin Foundation', short_name: null, group: 'non_us' }),
    );
    const grants = twins.map((item) =>
      grant({ key: `${item.code}:G1`, agency: item.code, number: 'G1' }),
    );
    const twinIndex = buildFundingIndex(fundingBlock({ agencies: twins, grants }), RESOURCE);
    const works = [work({ grants: listings(twinIndex, ...grants) })];
    const ranking = rankAgencies(fundingScope(works, twinIndex, UNFILTERED));
    expect(ranking.items.map((row) => row.code)).toEqual(['F1', 'F2']);
  });

  it('names an agency the export lacks by its code', () => {
    const ghost = grant({ key: 'GHOST:G1', agency: 'GHOST', number: 'G1' });
    const lacking = buildFundingIndex(fundingBlock({ agencies: [], grants: [ghost] }), RESOURCE);
    const works = [work({ grants: [listing({ grant: ghost.key, agencies: ['GHOST'] })] })];
    const ranking = rankAgencies(fundingScope(works, lacking, UNFILTERED));
    expect(ranking.items[0]).toMatchObject({
      code: 'GHOST',
      label: 'GHOST',
      name: 'GHOST',
      parent: null,
      country: null,
      group: null,
    });
    expect(agencyLabel(lacking, 'GHOST')).toBe('GHOST');
    expect(agencyLabel(null, 'NIH')).toBe('NIH');
  });
});

describe('grant types', () => {
  it('shows every category in its fixed order, zeros included', () => {
    expect(grantKinds(all).map((row) => row.category)).toEqual([...GRANT_CATEGORIES]);
    expect(grantKinds(nothing).every((row) => row.grants === 0)).toBe(true);
  });

  it('counts the grants listed with their known value and unknown count', () => {
    expect(
      grantKinds(all).map((row) => [row.category, row.grants, row.amountUsd, row.withoutAmount]),
    ).toEqual([
      ['research', 2, 1_000_000, 1],
      ['center', 1, 2_500_000, 0],
      ['training', 1, 4_000_000, 0],
      ['instrument', 0, 0, 0],
      ['contract', 0, 0, 0],
      ['other', 2, 0, 2],
    ]);
  });

  it('leaves unmatched numbers out of "other"', () => {
    const total = grantKinds(all).reduce((sum, row) => sum + row.grants, 0);
    expect(total).toBe(fundingFigures(all).listed);
  });

  // R1b: every one of the real export's 208 "other" grants is outside NIH and NSF, whose grants
  // alone are typed; the page says so, so that "Other" is not read as a kind of award.
  it('counts the "other" grants, and those of agencies whose grants are not typed', () => {
    // NIH's OT2 is "other" and typed by NIH's table; the foundation's is not typed at all.
    expect(otherKind(all)).toEqual({ grants: 2, untyped: 1 });
    expect(otherKind(all).grants).toBe(grantKinds(all).at(-1)?.grants);
    expect(otherKind(nothing)).toEqual({ grants: 0, untyped: 0 });
  });
});

describe('unmatched numbers a decision kept apart (R1b)', () => {
  it('names only a Miscellaneous number some listing reaches through an override', () => {
    // W2021's override decides a real grant, P01, which is not an unmatched number.
    expect(keptUnmatched(WORKS, index).size).toBe(0);
    const decided = work({
      id: 'W-009030',
      year: 2020,
      grants: [
        listing({ grant: UNMATCHED.key, agencies: ['MISC'], how: 'override', override: OVERRIDE }),
      ],
    });
    expect([...keptUnmatched([...WORKS, decided], index)]).toEqual([UNMATCHED.key]);
    expect(keptUnmatched([decided], null).size).toBe(0);
  });
});

describe('coverage', () => {
  it('splits the publications three ways, adding up to N', () => {
    expect(coverage(all).publications).toEqual({
      total: 6,
      withGrant: 4,
      onlyUnmatched: 1,
      none: 1,
    });
  });

  it('counts the grants with and without an amount, unconverted, pre-FY1985 and active', () => {
    expect(coverage(all).grants).toEqual({
      listed: 6,
      withAmount: 3,
      withoutAmount: 3,
      unconverted: 1,
      startsBeforeFy1985: 1,
      active: 1,
    });
  });

  it('counts the unmatched numbers and the publications listing them', () => {
    expect(coverage(all).miscellaneous).toEqual({ grants: 1, publications: 2 });
  });

  it('follows the scope, so it adds up with the figures', () => {
    expect(coverage(excluded).publications).toEqual({
      total: 6,
      withGrant: 3,
      onlyUnmatched: 1,
      none: 2,
    });
    expect(coverage(nothing).publications.none).toBe(6);
  });
});

describe('the agency page: one agency over the whole corpus', () => {
  const nih = agencyDetail('NIH', WORKS, index, period);

  it('holds its whole subtree, with its figures', () => {
    expect(nih?.agency.code).toBe('NIH');
    expect(nih?.chain.map((item) => item.code)).toEqual(['NIH']);
    expect(nih?.miscellaneous).toBe(false);
    expect(keys(nih?.scope as FundingScope)).toEqual([NIH_DIRECT.key, P01.key, R01.key]);
    expect(nih?.figures).toMatchObject({ amountUsd: 3_500_000, listed: 3, withoutAmount: 1 });
  });

  it('breaks it down by child agency, largest value first, with the remainder assigned to none', () => {
    expect(
      nih?.children.map((row) => [row.code, row.grants, row.amountUsd, row.publications]),
    ).toEqual([
      ['NHLBI', 1, 2_500_000, 1],
      ['NIGMS', 1, 1_000_000, 2],
    ]);
    expect(nih?.unassigned).toMatchObject({
      code: 'NIH',
      grants: 1,
      amountUsd: 0,
      withoutAmount: 1,
      publications: 1,
    });
  });

  it('draws its value over time, ending at its total', () => {
    expect(nih?.overTime.points.at(-1)?.cumulative).toBe(3_500_000);
  });

  it('lists its publications newest first', () => {
    expect(nih?.publications.map((item) => item.id)).toEqual([W2022.id, W2021.id, W2019.id]);
  });

  it('has no breakdown for an agency with no children', () => {
    const nigmsDetail = agencyDetail('NIGMS', WORKS, index, period);
    expect(nigmsDetail?.chain.map((item) => item.code)).toEqual(['NIH', 'NIGMS']);
    expect(nigmsDetail?.children).toEqual([]);
    expect(nigmsDetail?.unassigned).toBeNull();
  });

  it('has no remainder when every grant is under a child', () => {
    const children = buildFundingIndex(
      fundingBlock({ agencies: AGENCIES, grants: [R01, P01] }),
      RESOURCE,
    );
    expect(agencyDetail('NIH', [W2021], children, period)?.unassigned).toBeNull();
  });

  it('orders children of equal value and count by label', () => {
    const even = { ...P01, amount_usd: 1_000_000 };
    const tied = buildFundingIndex(
      fundingBlock({ agencies: AGENCIES, grants: [R01, even] }),
      RESOURCE,
    );
    const works = [work({ year: 2021, grants: listings(tied, R01, even) })];
    const detail = agencyDetail('NIH', works, tied, period);
    expect(detail?.children.map((row) => row.code)).toEqual(['NHLBI', 'NIGMS']);
  });

  it('includes institution-wide awards', () => {
    const nsf = agencyDetail('NSF', WORKS, index, period);
    expect(nsf?.figures.institutionWide).toMatchObject({ included: true, grants: 1 });
    expect(nsf?.figures.amountUsd).toBe(4_000_000);
  });

  it('shows Miscellaneous as its unmatched numbers', () => {
    const misc = agencyDetail('MISC', WORKS, index, period);
    expect(misc?.miscellaneous).toBe(true);
    expect(misc?.figures).toMatchObject({ listed: 0, miscellaneous: 1 });
    expect(misc?.publications.map((item) => item.id)).toEqual([W2020.id, W2019.id]);
  });

  it('is not found for an unknown code, or without funding data', () => {
    expect(agencyDetail('NOPE', WORKS, index, period)).toBeNull();
    expect(agencyDetail('NIH', WORKS, null, period)).toBeNull();
  });
});

describe('the grant page', () => {
  const p01 = grantDetail(P01.key, WORKS, index);

  it('gives its agency, chain and source', () => {
    expect(p01?.agency?.code).toBe('NHLBI');
    expect(p01?.chain.map((item) => item.code)).toEqual(['NIH', 'NHLBI']);
    expect(p01?.miscellaneous).toBe(false);
    expect(p01?.source?.id).toBe('reporter');
  });

  it('draws its fiscal years in order, a null year as no amount reported, never 0', () => {
    expect(p01?.fiscalYears).toEqual([
      { year: 2023, amountUsd: null, partial: false },
      { year: 2024, amountUsd: 1_000_000, partial: false },
      { year: 2025, amountUsd: 1_000_000, partial: false },
      { year: 2026, amountUsd: 500_000, partial: true },
    ]);
  });

  it('marks the partial fiscal year from RePORTER’s source', () => {
    expect(p01?.partialFiscalYear).toBe(2026);
  });

  it('lists the works listing it, with what the paper wrote and the override', () => {
    expect(p01?.listings).toHaveLength(1);
    expect(p01?.listings[0]?.work.id).toBe(W2021.id);
    expect(p01?.listings[0]?.listing).toMatchObject({
      how: 'override',
      cited_as: ['P01 HL00000'],
      override: OVERRIDE,
    });
  });

  it('lists several works newest first, and gives the first year', () => {
    const r01 = grantDetail(R01.key, WORKS, index);
    expect(r01?.listings.map((entry) => entry.work.id)).toEqual([W2021.id, W2019.id]);
    expect(r01?.firstYear).toBe(2019);
  });

  it('lists an institution-wide award too', () => {
    const grfp = grantDetail(GRFP.key, WORKS, index);
    expect(grfp?.listings.map((entry) => entry.work.id)).toEqual([W2026.id, W2021.id]);
    expect(grfp?.source?.id).toBe('nsf');
    expect(grfp?.fiscalYears).toBeNull();
  });

  it('has no source for a grant with no amount', () => {
    const direct = grantDetail(NIH_DIRECT.key, WORKS, index);
    expect(direct?.source).toBeNull();
    expect(direct?.fiscalYears).toEqual([{ year: 2021, amountUsd: null, partial: false }]);
  });

  it('has no source when the export does not list the one its amount names', () => {
    const bare = buildFundingIndex(
      fundingBlock({ agencies: AGENCIES, grants: [R01], sources: [] }),
      RESOURCE,
    );
    const detail = grantDetail(R01.key, WORKS, bare);
    expect(detail?.source).toBeNull();
    expect(detail?.partialFiscalYear).toBeNull();
    expect(detail?.fiscalYears?.every((point) => !point.partial)).toBe(true);
  });

  it('marks an unmatched number', () => {
    const unmatched = grantDetail(UNMATCHED.key, WORKS, index);
    expect(unmatched?.miscellaneous).toBe(true);
    expect(unmatched?.chain.map((item) => item.code)).toEqual(['MISC']);
  });

  it('has no listings and no first year for a grant no work lists', () => {
    const orphan = grantDetail(ORPHAN.key, WORKS, index);
    expect(orphan?.listings).toEqual([]);
    expect(orphan?.firstYear).toBeNull();
  });

  it('has no agency for one the export lacks', () => {
    const ghost = grant({ key: 'GHOST:G1', agency: 'GHOST', number: 'G1' });
    const lacking = buildFundingIndex(fundingBlock({ agencies: [], grants: [ghost] }), RESOURCE);
    const detail = grantDetail(ghost.key, [], lacking);
    expect(detail?.agency).toBeNull();
    expect(detail?.chain).toEqual([]);
  });

  it('is not found for an unknown key, or without funding data', () => {
    expect(grantDetail('NIH:NOPE', WORKS, index)).toBeNull();
    expect(grantDetail(R01.key, WORKS, null)).toBeNull();
  });
});

describe('summarizeFunding over the hand-built world', () => {
  it('computes every field of funding.summary', () => {
    expect(summarizeFunding(WORKS, index)).toEqual({
      grants: 7,
      grants_resolved: 6,
      grants_with_amount: 3,
      grants_unconverted: 1,
      grants_institution_wide: 1,
      agencies: 3,
      investigators: 3,
      organizations: 2,
      amount_usd: 7_500_000,
      amount_usd_institution_wide: 4_000_000,
      amount_usd_nih: 3_500_000,
      nih_grants: 3,
      works_with_grants: 4,
      works_with_listings: 5,
      first_year: 2019,
      last_year: 2022,
      by_first_year: {
        '2019': {
          grants: 1,
          grants_institution_wide: 0,
          amount_usd: 1_000_000,
          amount_usd_institution_wide: 0,
        },
        '2021': {
          grants: 2,
          grants_institution_wide: 1,
          amount_usd: 6_500_000,
          amount_usd_institution_wide: 4_000_000,
        },
        '2022': {
          grants: 3,
          grants_institution_wide: 0,
          amount_usd: 0,
          amount_usd_institution_wide: 0,
        },
      },
    });
  });

  it('counts nothing for NIH when no NIH grant is listed', () => {
    expect(summarizeFunding([W2026], index)).toMatchObject({
      amount_usd_nih: 0,
      nih_grants: 0,
      agencies: 1,
    });
    expect(NIH_ROOT).toBe('NIH');
  });

  it('has null years when nothing is listed', () => {
    expect(summarizeFunding([W2023], index)).toMatchObject({
      grants: 0,
      first_year: null,
      last_year: null,
      by_first_year: {},
    });
  });
});

describe('the first-year check', () => {
  it('reports a grant no work lists', () => {
    expect(firstYearDisagreements(WORKS, index)).toEqual([
      { key: ORPHAN.key, exported: 2020, computed: null },
    ]);
  });

  it('reports every first year a subset of the works would move', () => {
    const moved = firstYearDisagreements([W2021, W2022, W2026], index).map((item) => item.key);
    expect(moved).toContain(R01.key);
    expect(moved).toContain(UNMATCHED.key);
    expect(moved).not.toContain(P01.key);
  });
});

describe('every dollar figure is a safe integer', () => {
  const huge = grant({ key: 'NIH:P41GM000010', number: 'P41GM000010', amount_usd: 2 ** 52 });
  const big = buildFundingIndex(
    fundingBlock({ agencies: AGENCIES, grants: [R01, P01, GRFP, huge] }),
    RESOURCE,
  );
  const works = [
    work({ year: 2019, grants: listings(big, R01, huge) }),
    work({ year: 2021, grants: listings(big, P01, GRFP) }),
  ];
  const scope = fundingScope(works, big, UNFILTERED);

  const dollars = (): number[] => {
    const figures = fundingFigures(scope);
    const series = cumulativeDollars(scope, period);
    const value = valueByAgency(scope, period);
    const detail = agencyDetail('NIH', works, big, period);
    return [
      figures.amountUsd,
      figures.institutionWide.amountUsd,
      series.amountUsd,
      ...series.points.flatMap((point) => [point.count, point.cumulative]),
      value.total,
      ...value.series.map((series) => series.total),
      ...value.buckets.flatMap((bucket) => [bucket.total, ...bucket.values]),
      ...rankAgencies(scope, { limit: Infinity }).items.map((row) => row.amountUsd),
      ...grantKinds(scope).map((row) => row.amountUsd),
      ...(detail?.children ?? []).map((row) => row.amountUsd),
      detail?.figures.amountUsd ?? 0,
      summarizeFunding(works, big).amount_usd,
    ];
  };

  it('sums exactly, well above a billion', () => {
    expect(fundingFigures(scope).amountUsd).toBe(2 ** 52 + 7_500_000);
  });

  it.each(dollars().map((value, at) => [at, value]))('figure %i (%d)', (_, value) => {
    expect(Number.isSafeInteger(value)).toBe(true);
  });
});

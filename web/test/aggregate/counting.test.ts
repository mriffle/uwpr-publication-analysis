/**
 * The counting rule, as arithmetic (docs/09 F17, §7.4): `aggregate/counting.ts`, held to the same
 * table as its Python original, `tests/test_funding_counting.py`.
 *
 * Each rule, the order they are tried in, a null fiscal year, an empty `fiscal_years`, the
 * exported spread, and where each counted dollar lands on the award-year axis. The spread itself
 * is the pipeline's: a grant here carries the `spread_years` the export would, never one worked
 * out in TypeScript. Last, the sample's synthetic grants, counted as M1's test worked them out by
 * hand.
 */
import { describe, expect, it } from 'vitest';
import {
  COUNTED_RULES,
  awardYears,
  counted,
  countedYears,
  yearly,
  type Counted,
} from '../../src/aggregate/counting';
import { UNFILTERED, fundingScope } from '../../src/aggregate/funding';
import { fundingOf } from '../../src/contract/funding';
import type { Grant } from '../../src/contract/types';
import { isSampleExport, sampleExport } from '../support/fixture';
import { counting, grant } from '../support/funding';

const COUNTING = counting();

/** A grant row holding only what the rule reads, as `row()` in the Python test builds one. */
const row = (fields: Partial<Grant> = {}): Grant =>
  grant({
    category: 'research',
    amount_usd: null,
    start_year: null,
    end_year: null,
    amount_source: null,
    fiscal_years: null,
    spread_years: null,
    ...fields,
  });

const byYear = <T>(amounts: Record<number, T>): Record<string, T> =>
  Object.fromEntries(Object.entries(amounts).map(([year, value]) => [String(year), value]));

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, at) => from + at);

/** FY1996–2003, $100 … $107. */
const FY_1996_2003 = byYear(Object.fromEntries(range(1996, 2003).map((y) => [y, 100 + y - 1996])));

const ENDED = row({ amount_usd: 828, fiscal_years: FY_1996_2003 });

const count = (item: Grant, first: number, last: number): Counted =>
  counted(item, first, last, COUNTING);
const award = (item: Grant, first: number, last: number) =>
  Object.fromEntries(awardYears(item, first, last, COUNTING));

describe('the constants come from funding.counting', () => {
  it('names the rules in the order they are tried', () => {
    expect(COUNTED_RULES).toEqual([
      'full_amount',
      'undated',
      'ended_before',
      'began_after',
      'window',
    ]);
  });

  it('moves the floor, the look-back and the categories with the block, hard-coding none', () => {
    const grant10 = row({ amount_usd: 70, fiscal_years: byYear({ 2004: 10, 2006: 20, 2010: 40 }) });
    expect(counted(grant10, 2012, 2012, counting({ from_year: 2010 }))).toEqual({
      usd: 40,
      rule: 'window',
    });
    expect(counted(ENDED, 2019, 2019, counting({ last_years: 2 }))).toEqual({
      usd: 106 + 107,
      rule: 'ended_before',
    });
    const training = row({
      category: 'training',
      amount_usd: 70,
      fiscal_years: byYear({ 2004: 70 }),
    });
    expect(
      counted(training, 2019, 2019, counting({ full_amount_categories: ['training'] })),
    ).toEqual({ usd: 70, rule: 'full_amount' });
    expect(counted(training, 2019, 2019, counting({ full_amount_categories: [] })).rule).toBe(
      'ended_before',
    );
  });
});

describe('the rule table', () => {
  it.each<[string, Grant, number, number, Counted]>([
    [
      'an instrument, in full',
      row({ category: 'instrument', amount_usd: 782028, fiscal_years: { '2003': 782028 } }),
      2008,
      2012,
      { usd: 782028, rule: 'full_amount' },
    ],
    [
      'no end year: undated',
      row({ amount_usd: 300, start_year: 2018 }),
      2021,
      2021,
      { usd: 300, rule: 'undated' },
    ],
    [
      'no years at all: undated',
      row({ amount_usd: 300 }),
      2021,
      2021,
      { usd: 300, rule: 'undated' },
    ],
    [
      'ended before 2006: its last five years',
      ENDED,
      2019,
      2019,
      { usd: 103 + 104 + 105 + 106 + 107, rule: 'ended_before' },
    ],
    [
      'began after its latest listing work: nothing',
      row({ amount_usd: 30, fiscal_years: { '2022': 10, '2023': 20 } }),
      2019,
      2019,
      { usd: 0, rule: 'began_after' },
    ],
    [
      'the window: 2006 to the latest listing year',
      row({
        amount_usd: 70,
        fiscal_years: byYear(Object.fromEntries(range(2004, 2010).map((y) => [y, 10]))),
      }),
      2007,
      2008,
      { usd: 30, rule: 'window' },
    ],
    [
      'the ceiling is the latest listing year, inclusive',
      row({ amount_usd: 30, fiscal_years: { '2019': 10, '2020': 20 } }),
      2019,
      2019,
      { usd: 10, rule: 'window' },
    ],
    [
      'an unknown amount is unknown, never 0',
      row({ amount_usd: null, category: 'instrument', fiscal_years: { '2019': null } }),
      2019,
      2019,
      { usd: null, rule: null },
    ],
  ])('%s', (_, item, first, last, expected) => {
    expect(count(item, first, last)).toEqual(expected);
  });

  it('counts an instrument in full before any other rule', () => {
    // S10RR017262's shape: its only year is FY2003, so it also ended before 2006.
    const old = row({
      category: 'instrument',
      amount_usd: 782028,
      fiscal_years: { '2003': 782028 },
    });
    expect(count(old, 2008, 2008)).toEqual({ usd: 782028, rule: 'full_amount' });
    // Bought after the paper that lists it, so it also began after it.
    const later = row({ category: 'instrument', amount_usd: 500, fiscal_years: { '2021': 500 } });
    expect(count(later, 2019, 2019)).toEqual({ usd: 500, rule: 'full_amount' });
    const undated = row({ category: 'instrument', amount_usd: 500, start_year: 2021 });
    expect(count(undated, 2019, 2019)).toEqual({ usd: 500, rule: 'full_amount' });
  });

  it('tries ended_before before began_after', () => {
    const item = row({ amount_usd: 10, fiscal_years: { '2001': 4, '2003': 6 } });
    // A listing year no real work has.
    expect(count(item, 1999, 1999)).toEqual({ usd: 10, rule: 'ended_before' });
  });

  it('counts the last five years by year, not by row', () => {
    // A gap inside the last five years is not filled from earlier: 1998 is six years before 2003.
    const item = row({ amount_usd: 36, fiscal_years: { '1998': 1, '2000': 5, '2003': 30 } });
    expect(count(item, 2010, 2010)).toEqual({ usd: 35, rule: 'ended_before' });
  });

  it('counts a null fiscal year as 0, and still dates the grant by it', () => {
    // P01HL999001's shape: FY2016 reports no amount. Its first year is still 2016.
    const item = row({
      amount_usd: 2_100_000,
      fiscal_years: { '2016': null, '2017': 1_000_000, '2018': 1_100_000 },
    });
    expect(yearly(item)).toEqual(
      new Map([
        [2016, 0],
        [2017, 1_000_000],
        [2018, 1_100_000],
      ]),
    );
    // Not began_after: the grant had begun.
    expect(count(item, 2016, 2016)).toEqual({ usd: 0, rule: 'window' });
    expect(count(item, 2019, 2021)).toEqual({ usd: 2_100_000, rule: 'window' });
    expect(award(item, 2016, 2016)).toEqual({});
  });

  it('counts every year from 2006, and none before', () => {
    const item = row({ amount_usd: 30, fiscal_years: { '2005': 10, '2006': 20 } });
    expect(count(item, 2010, 2010)).toEqual({ usd: 20, rule: 'window' });
  });
});

describe('the yearly breakdown: fiscal years, else the exported spread', () => {
  it('counts an exported spread by the same window, its remainder where the pipeline put it', () => {
    // $1,000,003 over 2017–2023: the earliest four years take the remainder's dollars.
    const spread = byYear({
      2017: 142858,
      2018: 142858,
      2019: 142858,
      2020: 142858,
      2021: 142857,
      2022: 142857,
      2023: 142857,
    });
    const item = row({
      amount_usd: 1_000_003,
      start_year: 2017,
      end_year: 2023,
      spread_years: spread,
    });
    expect([...(yearly(item)?.values() ?? [])].reduce((a, b) => a + b, 0)).toBe(1_000_003);
    expect(count(item, 2019, 2021)).toEqual({ usd: 4 * 142858 + 142857, rule: 'window' });
  });

  it('takes the fiscal years before the exported spread', () => {
    const both = row({ amount_usd: 9, fiscal_years: { '2018': 9 }, spread_years: { '2017': 9 } });
    expect(yearly(both)).toEqual(new Map([[2018, 9]]));
    expect(yearly(row({ amount_usd: 9, spread_years: { '2017': 9 } }))).toEqual(
      new Map([[2017, 9]]),
    );
    expect(yearly(row({ amount_usd: null, fiscal_years: { '2018': null } }))).toBeNull();
  });

  it('reads an empty fiscal_years as none, as Python tests the dict’s truth', () => {
    const spread = row({ amount_usd: 9, fiscal_years: {}, spread_years: { '2017': 9 } });
    expect(yearly(spread)).toEqual(new Map([[2017, 9]]));
    const neither = row({ amount_usd: 9, fiscal_years: {}, spread_years: {} });
    expect(yearly(neither)).toBeNull();
    expect(count(neither, 2019, 2019)).toEqual({ usd: 9, rule: 'undated' });
  });

  it('reads a grant with no spread_years at all — an export older than 1.2 — as undated', () => {
    const legacy: Partial<Grant> = { ...row({ amount_usd: 9, start_year: 2017, end_year: 2020 }) };
    delete legacy.spread_years;
    expect(yearly(legacy as Grant)).toBeNull();
    expect(count(legacy as Grant, 2019, 2019)).toEqual({ usd: 9, rule: 'undated' });
  });
});

describe('award years: where each counted dollar lands', () => {
  it('clamps an instrument’s years into the window', () => {
    // A year before 2006 goes to the first listing year; one after the latest, to that year.
    const item = row({
      category: 'instrument',
      amount_usd: 600,
      fiscal_years: { '2005': 100, '2010': 200, '2023': 300 },
    });
    expect(award(item, 2012, 2021)).toEqual({ 2010: 200, 2012: 100, 2021: 300 });
    expect([...awardYears(item, 2012, 2021, COUNTING).keys()]).toEqual([2010, 2012, 2021]);
    const same = row({
      category: 'instrument',
      amount_usd: 750,
      fiscal_years: { '2020': 600, '2023': 150 },
    });
    // 2020 is inside the window.
    expect(award(same, 2021, 2021)).toEqual({ 2020: 600, 2021: 150 });
  });

  it('puts an instrument with no years in its first listing year', () => {
    expect(award(row({ category: 'instrument', amount_usd: 500 }), 2015, 2020)).toEqual({
      2015: 500,
    });
  });

  it('puts undated and ended_before amounts in the first listing year', () => {
    expect(award(row({ amount_usd: 300, start_year: 2018 }), 2019, 2021)).toEqual({ 2019: 300 });
    expect(award(ENDED, 2019, 2021)).toEqual({ 2019: 525 });
  });

  it('keeps a window grant’s own years, and gives began_after none', () => {
    const item = row({
      amount_usd: 70,
      fiscal_years: byYear(Object.fromEntries(range(2004, 2010).map((y) => [y, 10]))),
    });
    expect(award(item, 2009, 2009)).toEqual({ 2006: 10, 2007: 10, 2008: 10, 2009: 10 });
    expect(
      award(row({ amount_usd: 30, fiscal_years: { '2022': 10, '2023': 20 } }), 2019, 2019),
    ).toEqual({});
  });

  const CASES: [string, Grant, number, number][] = [
    [
      'an instrument with years on both sides',
      row({
        category: 'instrument',
        amount_usd: 600,
        fiscal_years: { '2005': 100, '2010': 200, '2023': 300 },
      }),
      2012,
      2021,
    ],
    ['undated', row({ amount_usd: 300, start_year: 2018 }), 2019, 2021],
    ['ended before', ENDED, 2019, 2019],
    ['began after', row({ amount_usd: 30, fiscal_years: { '2022': 10, '2023': 20 } }), 2019, 2019],
    [
      'a spread',
      row({
        amount_usd: 1_000_003,
        spread_years: byYear({
          2017: 142858,
          2018: 142858,
          2019: 142858,
          2020: 142858,
          2021: 142857,
          2022: 142857,
          2023: 142857,
        }),
      }),
      2019,
      2021,
    ],
    [
      'a null fiscal year',
      row({
        amount_usd: 2_100_000,
        fiscal_years: { '2016': null, '2017': 1_000_000, '2018': 1_100_000 },
      }),
      2019,
      2021,
    ],
    ['an unknown amount', row({ amount_usd: null, fiscal_years: { '2016': null } }), 2019, 2021],
  ];

  it.each(CASES)(
    '%s: the award years sum to the counted amount, in the window, none empty, in order',
    (_, item, first, last) => {
      const { usd } = count(item, first, last);
      const allocated = awardYears(item, first, last, COUNTING);
      expect([...allocated.values()].reduce((a, b) => a + b, 0)).toBe(usd ?? 0);
      for (const [year, value] of allocated) {
        expect(year).toBeGreaterThanOrEqual(Math.min(COUNTING.from_year, first));
        expect(year).toBeLessThanOrEqual(last);
        expect(value).not.toBe(0);
      }
      const years = [...allocated.keys()];
      expect(years).toEqual([...years].sort((a, b) => a - b));
    },
  );

  it.each(CASES)(
    '%s: the years counted hold exactly the counted dollars where the rule counts by year',
    (_, item, first, last) => {
      const { usd, rule } = count(item, first, last);
      const years = countedYears(item, first, last, COUNTING);
      const breakdown = yearly(item) ?? new Map<number, number>();
      const held = [...years].reduce((sum, year) => sum + (breakdown.get(year) ?? 0), 0);
      if (
        rule === 'window' ||
        rule === 'ended_before' ||
        (rule === 'full_amount' && breakdown.size > 0)
      ) {
        expect(held).toBe(usd);
      } else {
        expect(years.size).toBe(0);
      }
    },
  );

  it('marks the years counted by each rule', () => {
    const years = (item: Grant, first: number, last: number) => [
      ...countedYears(item, first, last, COUNTING),
    ];
    expect(years(ENDED, 2019, 2019)).toEqual([1999, 2000, 2001, 2002, 2003]);
    const window = row({ amount_usd: 30, fiscal_years: { '2005': 10, '2006': 10, '2020': 10 } });
    expect(years(window, 2010, 2010)).toEqual([2006]);
    const instrument = row({
      category: 'instrument',
      amount_usd: 3,
      fiscal_years: { '2023': 1, '2005': 2 },
    });
    expect(years(instrument, 2010, 2010)).toEqual([2005, 2023]);
    expect(years(row({ amount_usd: 30, fiscal_years: { '2022': 30 } }), 2019, 2019)).toEqual([]);
    expect(years(row({ amount_usd: 30, start_year: 2018 }), 2019, 2019)).toEqual([]);
    expect(years(row({ amount_usd: null, fiscal_years: { '2019': null } }), 2019, 2019)).toEqual(
      [],
    );
  });

  it('counts nothing anywhere for an unknown amount', () => {
    const item = row({
      amount_usd: null,
      category: 'instrument',
      start_year: 2017,
      end_year: 2020,
    });
    expect(yearly(item)).toBeNull();
    expect(count(item, 2019, 2021)).toEqual({ usd: null, rule: null });
    expect(award(item, 2019, 2021)).toEqual({});
    expect(countedYears(item, 2019, 2021, COUNTING).size).toBe(0);
  });
});

/**
 * M1's hand-worked values (`test_each_synthetic_grant_is_counted_as_worked_out_by_hand`): each
 * synthetic grant's first and last listing years, counted amount and rule, as the app counts them
 * over the sample's works — the exported fields, and the app's own scope.
 */
describe.runIf(isSampleExport)(
  'the sample’s synthetic grants, counted as worked out by hand',
  () => {
    const doc = sampleExport();
    const index = fundingOf(doc);
    const scope = fundingScope(doc.works, index, UNFILTERED);

    it.each<[string, [number, number, number | null, Counted['rule']]]>([
      ['ANID:1599A0999', [2024, 2024, 1_146_790, 'window']],
      ['F4399999998:SMRF99901', [2019, 2021, 714_289, 'window']],
      ['F4399999998:SMRF99902', [2021, 2021, 300_000, 'undated']],
      ['F4399999999:UA99001', [2024, 2024, null, null]],
      ['MISC:R01GM999999', [2019, 2019, null, null]],
      ['NIH:P01HL999001', [2019, 2021, 2_100_000, 'window']],
      ['NIH:R01GM999004', [2019, 2019, 0, 'began_after']],
      ['NIH:S10OD999001', [2021, 2021, 750_000, 'full_amount']],
      ['NIH:T32GM999003', [2019, 2019, 575_000, 'ended_before']],
      ['NSF:2299901', [2024, 2024, 1_500_002, 'window']],
    ])('%s', (key, [first, last, usd, rule]) => {
      const exported = index?.grants.get(key) as Grant;
      expect([exported.first_year, exported.last_listed_year]).toEqual([first, last]);
      expect(counted(exported, first, last, doc.funding.counting)).toEqual({ usd, rule });
      const entry = scope.grants.find((item) => item.grant.key === key);
      expect([entry?.firstYear, entry?.lastYear, entry?.counted.usd, entry?.counted.rule]).toEqual([
        first,
        last,
        usd,
        rule,
      ]);
    });
  },
);

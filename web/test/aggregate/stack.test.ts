/**
 * The generic stack over buckets of years (`aggregate/stack.ts`): the top five, one pinned
 * series never ranked and never merged into "Other", then "Other"; buckets of three years by
 * default or single years; the partial year marked; bucket sums equal to everything stacked.
 */
import { describe, expect, it } from 'vitest';
import { OTHER_SERIES, TOP_SERIES, stackByYear } from '../../src/aggregate/stack';
import type { Period } from '../../src/contract/types';

const period: Period = {
  first_year: 2018,
  last_year: 2026,
  complete_through: 2025,
  current_year_partial: true,
  citation_years_from: 2012,
  citations_before_window: 0,
};

interface Item {
  series: string;
  year: number;
  value: number;
}

const item = (series: string, year: number, value = 1): Item => ({ series, year, value });

const options = {
  year: (entry: Item) => entry.year,
  series: (entry: Item) => entry.series,
  value: (entry: Item) => entry.value,
  label: (key: string) => `Label ${key}`,
};

/** Series A has 8 items, B 7, … H 1; P, the pinned one, has 20 — more than any. */
const many = [
  ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].flatMap((series, rank) =>
    Array.from({ length: 8 - rank }, (_, at) => item(series, 2018 + (at % 9))),
  ),
  ...Array.from({ length: 20 }, () => item('P', 2020)),
];

describe('series', () => {
  const stack = stackByYear(many, period, { ...options, pinned: 'P' });

  it('ranks the five largest, then the pinned series, then "Other"', () => {
    expect(stack.series.map((series) => series.key)).toEqual([
      'A',
      'B',
      'C',
      'D',
      'E',
      'P',
      OTHER_SERIES,
    ]);
    expect(stack.series.map((series) => series.role)).toEqual([
      'ranked',
      'ranked',
      'ranked',
      'ranked',
      'ranked',
      'pinned',
      'other',
    ]);
    expect(stack.series.filter((series) => series.role === 'ranked')).toHaveLength(TOP_SERIES);
  });

  it('never ranks the pinned series, however large, and never folds it into "Other"', () => {
    const other = stack.series.find((series) => series.key === OTHER_SERIES);
    expect(other?.members).toEqual(['F', 'G', 'H']);
    expect(other?.members).not.toContain('P');
    expect(other?.total).toBe(3 + 2 + 1);
  });

  it('labels each series from its key, and "Other" as itself', () => {
    expect(stack.series[0]?.label).toBe('Label A');
    expect(stack.series.find((series) => series.role === 'pinned')?.label).toBe('Label P');
    expect(stack.series.at(-1)?.label).toBe(OTHER_SERIES);
  });

  it('adds no "Other" when everything fits, and no pinned series when it has nothing', () => {
    const small = stackByYear([item('A', 2020), item('B', 2021)], period, {
      ...options,
      pinned: 'P',
    });
    expect(small.series.map((series) => series.key)).toEqual(['A', 'B']);
  });

  it('breaks ties by label, then by key, so the same data always stacks the same way', () => {
    const tied = stackByYear([item('Z', 2020), item('Y', 2020), item('X', 2020)], period, {
      ...options,
      label: (key: string) => (key === 'X' ? 'Same' : key === 'Y' ? 'Same' : 'Alpha'),
    });
    expect(tied.series.map((series) => series.key)).toEqual(['Z', 'X', 'Y']);
  });

  it('draws no series whose total is zero: nothing to stack, and never a $0 legend entry', () => {
    const zero = stackByYear([item('A', 2020, 5), item('B', 2020, 0), item('P', 2020, 0)], period, {
      ...options,
      pinned: 'P',
    });
    expect(zero.series.map((series) => series.key)).toEqual(['A']);
    expect(zero.total).toBe(5);
  });

  it('takes the number ranked from the caller', () => {
    const two = stackByYear(many, period, { ...options, top: 2 });
    expect(two.series.map((series) => series.key)).toEqual(['P', 'A', OTHER_SERIES]);
  });
});

describe('buckets', () => {
  it('buckets three years by default, the last one shorter, over the whole period', () => {
    const stack = stackByYear([item('A', 2019)], period, options);
    expect(stack.bucketYears).toBe(3);
    expect(stack.buckets.map((bucket) => bucket.label)).toEqual([
      '2018–2020',
      '2021–2023',
      '2024–2026',
    ]);
    expect(stack.buckets[0]).toMatchObject({ key: '2018-2020', startYear: 2018, endYear: 2020 });
  });

  it('offers single years', () => {
    const stack = stackByYear([item('A', 2019)], period, { ...options, bucketYears: 1 });
    expect(stack.buckets).toHaveLength(9);
    expect(stack.buckets[1]).toMatchObject({ label: '2019', values: [1], total: 1 });
  });

  it('marks a bucket holding the partial year', () => {
    const stack = stackByYear([item('A', 2019)], period, { ...options, bucketYears: 4 });
    expect(stack.buckets.map((bucket) => [bucket.label, bucket.partial])).toEqual([
      ['2018–2021', false],
      ['2022–2025', false],
      ['2026', true],
    ]);
  });

  it('puts each value in its series and its bucket, and the buckets sum to everything', () => {
    const stack = stackByYear(many, period, { ...options, pinned: 'P' });
    const sum = stack.buckets.reduce((total, bucket) => total + bucket.total, 0);
    expect(sum).toBe(many.length);
    expect(stack.total).toBe(many.length);
    for (const bucket of stack.buckets) {
      expect(bucket.values.reduce((a, b) => a + b, 0)).toBe(bucket.total);
    }
    const pinned = stack.series.findIndex((series) => series.key === 'P');
    expect(stack.buckets[0]?.values[pinned]).toBe(20);
    stack.series.forEach((series, at) => {
      expect(stack.buckets.reduce((total, bucket) => total + (bucket.values[at] ?? 0), 0)).toBe(
        series.total,
      );
    });
  });

  it('widens the axis to a year outside the period rather than dropping it', () => {
    const stack = stackByYear([item('A', 2030)], period, { ...options, bucketYears: 1 });
    expect(stack.buckets.at(-1)).toMatchObject({ label: '2030', total: 1 });
  });

  it('starts the axis where it is told, before the period, and buckets from there', () => {
    const stack = stackByYear([item('A', 2019)], period, { ...options, firstYear: 2006 });
    expect(stack.buckets.map((bucket) => bucket.label)).toEqual([
      '2006–2008',
      '2009–2011',
      '2012–2014',
      '2015–2017',
      '2018–2020',
      '2021–2023',
      '2024–2026',
    ]);
    expect(stack.buckets[4]).toMatchObject({ total: 1 });
    // An item earlier still widens it, as without the option.
    const earlier = stackByYear([item('A', 2004)], period, {
      ...options,
      firstYear: 2006,
      bucketYears: 1,
    });
    expect(earlier.buckets[0]).toMatchObject({ label: '2004', total: 1 });
  });

  it('stacks nothing over the period when there is nothing', () => {
    const stack = stackByYear([], period, options);
    expect(stack.series).toEqual([]);
    expect(stack.total).toBe(0);
    expect(stack.buckets.every((bucket) => bucket.total === 0 && bucket.values.length === 0)).toBe(
      true,
    );
  });

  it('treats a bucket size below one as single years', () => {
    expect(stackByYear([], period, { ...options, bucketYears: 0 }).bucketYears).toBe(1);
  });
});

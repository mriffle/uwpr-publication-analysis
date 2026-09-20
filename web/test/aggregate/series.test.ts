import { describe, expect, it } from 'vitest';
import {
  citationsBeforeWindow,
  citationsPerYear,
  openAccessPerYear,
  publicationsPerYear,
} from '../../src/aggregate/series';
import type { Period } from '../../src/contract/types';
import { work } from '../support/works';

const period: Period = {
  first_year: 2008,
  last_year: 2026,
  complete_through: 2025,
  current_year_partial: true,
  citation_years_from: 2012,
  citations_before_window: 458,
};

describe('publications per year (docs/05 §7.1, §7.2)', () => {
  it('spans the whole recorded period, filling the years with no publications', () => {
    const points = publicationsPerYear([work({ year: 2010 })], period);
    expect(points).toHaveLength(2026 - 2008 + 1);
    expect(points[0]?.year).toBe(2008);
    expect(points[0]?.count).toBe(0);
    expect(points.at(-1)?.year).toBe(2026);
  });

  it('never starts before the first recorded year, so 2006 and 2007 are not implied', () => {
    const points = publicationsPerYear([work({ year: 2010 })], period);
    expect(points.some((point) => point.year < 2008)).toBe(false);
  });

  it('accumulates to the number of works', () => {
    const works = [work({ year: 2010 }), work({ year: 2010 }), work({ year: 2020 })];
    const points = publicationsPerYear(works, period);
    expect(points.find((point) => point.year === 2010)?.count).toBe(2);
    expect(points.find((point) => point.year === 2010)?.cumulative).toBe(2);
    expect(points.at(-1)?.cumulative).toBe(3);
  });

  it('marks every year after the last complete one as partial', () => {
    const points = publicationsPerYear([], period);
    expect(points.find((point) => point.year === 2025)?.partial).toBe(false);
    expect(points.find((point) => point.year === 2026)?.partial).toBe(true);
  });

  it('marks nothing partial when the export says the current year is complete', () => {
    const complete: Period = { ...period, current_year_partial: false };
    const points = publicationsPerYear([], complete);
    expect(points.every((point) => !point.partial)).toBe(true);
  });

  it('extends the axis to reach a work outside the stated period rather than dropping it', () => {
    // A defensive case: a work dated outside `period` would silently vanish from the chart while
    // still being counted in the figures beside it, which is the kind of quiet disagreement
    // docs/05 §7.3 exists to prevent.
    const points = publicationsPerYear([work({ year: 2030 })], period);
    expect(points.at(-1)?.year).toBe(2030);
    expect(points.at(-1)?.cumulative).toBe(1);
  });

  it('returns the full frame under a filter that selects nothing', () => {
    const points = publicationsPerYear([], period);
    expect(points).toHaveLength(19);
    expect(points.every((point) => point.count === 0 && point.cumulative === 0)).toBe(true);
  });
});

describe('citations per year (docs/05 §7.3, §7.4)', () => {
  const cited = (year: number, byYear: Record<string, number>, total?: number) =>
    work({
      year,
      citations: {
        total: total ?? Object.values(byYear).reduce((sum, value) => sum + value, 0),
        by_year: byYear,
        fwci: null,
        percentile: null,
        as_of: '2026-09-20',
      },
    });

  it('cannot begin before the window the export states, whatever the publications do', () => {
    const points = citationsPerYear([cited(2008, { '2012': 5, '2013': 7 })], period);
    expect(points[0]?.year).toBe(2012);
    expect(points.some((point) => point.year < 2012)).toBe(false);
  });

  it('sums every work’s citations for the year and accumulates them', () => {
    const points = citationsPerYear(
      [cited(2008, { '2012': 5, '2013': 7 }), cited(2010, { '2013': 3 })],
      period,
    );
    expect(points.find((point) => point.year === 2012)?.count).toBe(5);
    expect(points.find((point) => point.year === 2013)?.count).toBe(10);
    expect(points.at(-1)?.cumulative).toBe(15);
  });

  it('runs to the end of the period and marks the partial year', () => {
    const points = citationsPerYear([cited(2020, { '2020': 1 })], period);
    expect(points.at(-1)?.year).toBe(2026);
    expect(points.at(-1)?.partial).toBe(true);
  });

  it('falls back to the observed years when the export states no window', () => {
    const open: Period = { ...period, citation_years_from: null };
    const points = citationsPerYear([cited(2008, { '2015': 2 })], open);
    expect(points[0]?.year).toBe(2015);
  });

  it('draws nothing rather than a broken frame when there is no window and no data', () => {
    const open: Period = { ...period, citation_years_from: null, last_year: 2000 };
    expect(citationsPerYear([], open)).toEqual([]);
  });

  it('ignores a non-numeric year key rather than drawing a NaN band', () => {
    const points = citationsPerYear([cited(2008, { '2012': 4, unknown: 9 })], period);
    expect(points.find((point) => point.year === 2012)?.count).toBe(4);
    expect(points.every((point) => Number.isInteger(point.year))).toBe(true);
  });
});

describe('citations outside the by-year window (docs/05 §4.2)', () => {
  it('is the difference between the total and what the by-year series accounts for', () => {
    const works = [
      work({
        citations: {
          total: 10,
          by_year: { '2012': 4 },
          fwci: null,
          percentile: null,
          as_of: '2026-09-20',
        },
      }),
    ];
    expect(citationsBeforeWindow(works)).toBe(6);
  });

  it('is zero when every citation is inside the window', () => {
    const works = [
      work({
        citations: {
          total: 4,
          by_year: { '2012': 4 },
          fwci: null,
          percentile: null,
          as_of: '2026-09-20',
        },
      }),
    ];
    expect(citationsBeforeWindow(works)).toBe(0);
  });
});

describe('open access over time (docs/05 §7.12)', () => {
  const oa = (year: number, status: 'gold' | 'closed') =>
    work({ year, oa: { status, url: null, license: null } });

  it('carries the counts alongside the share, because a share over six works is one paper', () => {
    const points = openAccessPerYear([oa(2010, 'gold'), oa(2010, 'closed')], period);
    const year = points.find((point) => point.year === 2010);
    expect(year).toMatchObject({ open: 1, closed: 1, total: 2, share: 0.5 });
  });

  it('has no share at all for a year with no publications, rather than a share of zero', () => {
    const points = openAccessPerYear([], period);
    expect(points[0]?.share).toBeNull();
    expect(points[0]?.total).toBe(0);
  });

  it('counts every status other than closed as open (docs/05 §5)', () => {
    const statuses = ['gold', 'green', 'hybrid', 'bronze', 'diamond', 'unknown'] as const;
    const works = statuses.map((status) =>
      work({ year: 2015, oa: { status, url: null, license: null } }),
    );
    expect(openAccessPerYear(works, period).find((p) => p.year === 2015)?.open).toBe(
      statuses.length,
    );
  });

  it('marks the partial year, like every other year-indexed series', () => {
    const points = openAccessPerYear([oa(2026, 'gold')], period);
    expect(points.at(-1)?.partial).toBe(true);
  });
});

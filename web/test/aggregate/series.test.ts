import { describe, expect, it } from 'vitest';
import { publicationsPerYear } from '../../src/aggregate/series';
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

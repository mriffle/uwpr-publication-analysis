/**
 * Research areas over time (docs/05 §7.5) — "the chart the measurements changed".
 *
 * The three things the measurements forced are each asserted: the top five fields plus "Other",
 * three-year buckets by default, and **all** of a work's topics counted rather than only the
 * primary one.
 */
import { describe, expect, it } from 'vitest';
import { OTHER_FIELD, TOP_FIELDS, researchAreasOverTime } from '../../src/aggregate/areas';
import type { Period, Topic } from '../../src/contract/types';
import { work } from '../support/works';
import { isSampleExport, sampleExport } from '../support/fixture';

const period: Period = {
  first_year: 2008,
  last_year: 2016,
  complete_through: 2015,
  current_year_partial: true,
  citation_years_from: 2012,
  citations_before_window: 0,
};

const topic = (field: string, primary = false): Topic => ({
  domain: 'D',
  field,
  subfield: `${field} subfield`,
  topic: `${field} topic`,
  score: 0.5,
  primary,
});

describe('grouping', () => {
  it('keeps the five largest fields and folds the rest into "Other"', () => {
    const works = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].flatMap((field, index) =>
      // A has 7 topics, B 6, … G 1, so the top five are A–E.
      Array.from({ length: 7 - index }, () => work({ year: 2010, topics: [topic(field, true)] })),
    );
    const areas = researchAreasOverTime(works, period);
    expect(areas.fields).toEqual(['A', 'B', 'C', 'D', 'E', OTHER_FIELD]);
    expect(areas.fields).toHaveLength(TOP_FIELDS + 1);
    expect(areas.hasOther).toBe(true);
  });

  it('adds no "Other" series when everything already fits', () => {
    const areas = researchAreasOverTime([work({ year: 2010, topics: [topic('A', true)] })], period);
    expect(areas.fields).toEqual(['A']);
    expect(areas.hasOther).toBe(false);
  });

  it('picks the five from the data, so the ranking moves with the corpus and the filter', () => {
    const before = researchAreasOverTime(
      [work({ year: 2010, topics: [topic('A', true)] })],
      period,
    );
    const after = researchAreasOverTime([work({ year: 2010, topics: [topic('Z', true)] })], period);
    expect(before.fields[0]).toBe('A');
    expect(after.fields[0]).toBe('Z');
  });
});

describe('counting', () => {
  it('counts all of a work’s topics, not only the primary one', () => {
    const areas = researchAreasOverTime(
      [work({ year: 2010, topics: [topic('A', true), topic('B'), topic('B')] })],
      period,
    );
    expect(areas.assignments).toBe(3);
    expect(areas.works).toBe(1);
    // Two assignments to B from one work: the unit is the assignment, which is why the axis says
    // "topic assignments" and not "publications".
    const bucket = areas.buckets.find((item) => item.startYear === 2008);
    const indexOfB = areas.fields.indexOf('B');
    expect(bucket?.values[indexOfB]).toBe(2);
    expect(bucket?.works).toBe(1);
  });

  it('produces a total that exceeds the number of works, which is the axis label’s reason', () => {
    const works = Array.from({ length: 4 }, () =>
      work({ year: 2010, topics: [topic('A', true), topic('B'), topic('C')] }),
    );
    const areas = researchAreasOverTime(works, period);
    expect(areas.assignments).toBe(12);
    expect(areas.assignments).toBeGreaterThan(areas.works);
  });

  it('counts a work with no topics as a publication but no assignment', () => {
    const areas = researchAreasOverTime([work({ year: 2010, topics: [] })], period);
    expect(areas.works).toBe(1);
    expect(areas.assignments).toBe(0);
  });
});

describe('bucketing', () => {
  it('buckets years in threes by default', () => {
    const areas = researchAreasOverTime([], period);
    expect(areas.bucketYears).toBe(3);
    expect(areas.buckets.map((bucket) => bucket.label)).toEqual([
      '2008–2010',
      '2011–2013',
      '2014–2016',
    ]);
  });

  it('offers single years, where a bucket is one year and reads as one', () => {
    const areas = researchAreasOverTime([], period, { bucketYears: 1 });
    expect(areas.buckets).toHaveLength(9);
    expect(areas.buckets[0]?.label).toBe('2008');
  });

  it('clamps the last bucket to the last year rather than inventing future years', () => {
    const shorter: Period = { ...period, last_year: 2014 };
    const areas = researchAreasOverTime([], shorter);
    expect(areas.buckets.at(-1)?.label).toBe('2014');
    expect(areas.buckets.at(-1)?.endYear).toBe(2014);
  });

  it('marks a bucket containing an unfinished year as partial (docs/05 §4.2)', () => {
    const areas = researchAreasOverTime([], period);
    expect(areas.buckets.at(-1)?.partial).toBe(true);
    expect(areas.buckets[0]?.partial).toBe(false);
  });

  it('puts a work in the bucket its year falls in', () => {
    const areas = researchAreasOverTime([work({ year: 2012, topics: [topic('A', true)] })], period);
    expect(areas.buckets.find((bucket) => bucket.startYear === 2011)?.total).toBe(1);
    expect(areas.buckets.find((bucket) => bucket.startYear === 2008)?.total).toBe(0);
  });

  it('refuses a bucket size below one rather than dividing by zero', () => {
    const areas = researchAreasOverTime([], period, { bucketYears: 0 });
    expect(areas.bucketYears).toBe(1);
  });
});

describe.skipIf(!isSampleExport)('against the committed sample export', () => {
  const doc = sampleExport();

  it('accounts for every work and never more topics than the rows carry', () => {
    const areas = researchAreasOverTime(doc.works, doc.period);
    expect(areas.buckets.reduce((sum, bucket) => sum + bucket.works, 0)).toBe(doc.works.length);
    expect(areas.assignments).toBe(doc.works.reduce((sum, item) => sum + item.topics.length, 0));
  });

  it('never draws more than six series, which is the palette’s limit (docs/06 §8)', () => {
    expect(researchAreasOverTime(doc.works, doc.period).fields.length).toBeLessThanOrEqual(6);
  });
});

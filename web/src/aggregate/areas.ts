/**
 * docs/05 §7.5, research areas over time — "the chart the measurements changed".
 *
 * At the natural granularity, one year and all fifteen fields, "the matrix is 285 cells of which
 * only 103 are non-zero, and the largest is 14. A 15-series stacked area over that is noise
 * presented as a trend." Three things were specified instead, and all three are implemented
 * here rather than left to the component:
 *
 * 1. **Group at the field level, the top five by volume plus "Other"** — and pick the five from
 *    the data, "since the ranking moves as the corpus grows". Under a filter it moves again,
 *    which is the same argument.
 * 2. **Bucket years in threes by default,** with single years available. "Buckets take the
 *    typical cell from about 3 works to about 9, which is enough for the shape to mean
 *    something."
 * 3. **Count all of a work's topics, not only the primary one** — measured, this raises non-zero
 *    cells from 103 to 158. A work therefore contributes to several areas, "and the axis is
 *    labelled 'topic assignments', not 'publications', because the total exceeds the number of
 *    works".
 *
 * Pure (docs/06 B4): no React, no rendering, no colour.
 */
import type { Period, Work } from '../contract/types';
import { isPartialYear } from './series';

/** The label the residual series carries. It is never one of the five named fields. */
export const OTHER_FIELD = 'Other';

/** Years per bucket by default (docs/05 §7.5); 1 gives the single-year view. */
export const DEFAULT_BUCKET_YEARS = 3;

/** The five of "the top five by volume plus Other" (docs/06 §8 caps the palette at six). */
export const TOP_FIELDS = 5;

export interface AreaBucket {
  key: string;
  /** "2008–2010", or "2008" where the bucket covers one year. */
  label: string;
  startYear: number;
  endYear: number;
  /** True when the bucket contains a year the calendar has not finished (docs/05 §4.2). */
  partial: boolean;
  /** Topic assignments per series, in the same order as `fields`. */
  values: number[];
  /** The bucket's total assignments, which is the height of the stack. */
  total: number;
  /** Distinct works falling in the bucket — the denominator the tooltip needs. */
  works: number;
}

export interface AreasOverTime {
  /** The five largest fields in descending order, then "Other" where anything fell into it. */
  fields: string[];
  /** True when the last series is the residual one. */
  hasOther: boolean;
  buckets: AreaBucket[];
  /** Total topic assignments, which **exceeds** the number of works. That is the point. */
  assignments: number;
  works: number;
  bucketYears: number;
}

function bucketLabel(start: number, end: number): string {
  return start === end ? String(start) : `${String(start)}–${String(end)}`;
}

export function researchAreasOverTime(
  works: readonly Work[],
  period: Period,
  options: { bucketYears?: number } = {},
): AreasOverTime {
  const bucketYears = Math.max(1, Math.trunc(options.bucketYears ?? DEFAULT_BUCKET_YEARS));

  // The ranking is over topic assignments, which is also the unit the chart draws, so the five
  // largest series really are the five largest bands.
  const byField = new Map<string, number>();
  for (const work of works) {
    for (const topic of work.topics) {
      byField.set(topic.field, (byField.get(topic.field) ?? 0) + 1);
    }
  }
  const ranked = [...byField.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([field]) => field);
  const top = ranked.slice(0, TOP_FIELDS);
  const index = new Map(top.map((field, position) => [field, position]));
  const hasOther = ranked.length > top.length;
  const fields = hasOther ? [...top, OTHER_FIELD] : [...top];

  const first = Math.min(period.first_year, ...works.map((work) => work.year));
  const last = Math.max(period.last_year, ...works.map((work) => work.year));

  const buckets: AreaBucket[] = [];
  for (let start = first; start <= last; start += bucketYears) {
    const end = Math.min(start + bucketYears - 1, last);
    let partial = false;
    for (let year = start; year <= end; year += 1) partial ||= isPartialYear(year, period);
    buckets.push({
      key: `${String(start)}-${String(end)}`,
      label: bucketLabel(start, end),
      startYear: start,
      endYear: end,
      partial,
      values: fields.map(() => 0),
      total: 0,
      works: 0,
    });
  }

  const bucketFor = (year: number): AreaBucket | undefined =>
    buckets[Math.floor((year - first) / bucketYears)];

  let assignments = 0;
  for (const work of works) {
    const bucket = bucketFor(work.year);
    if (bucket === undefined) continue;
    bucket.works += 1;
    for (const topic of work.topics) {
      const position = index.get(topic.field) ?? (hasOther ? fields.length - 1 : -1);
      if (position < 0) continue;
      bucket.values[position] = (bucket.values[position] ?? 0) + 1;
      bucket.total += 1;
      assignments += 1;
    }
  }

  return { fields, hasOther, buckets, assignments, works: works.length, bucketYears };
}

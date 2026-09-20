/**
 * The citation profile of docs/05 §7.10 and §7.11.
 *
 * Pure (docs/06 B4): no React, no rendering.
 */
import type { Work } from '../contract/types';

/**
 * docs/05 §7.10: "Ranked list or lollipop, top 10–20, each row linking to its detail."
 *
 * Ties break on year then title, so the list is stable between runs; citation counts refresh
 * weekly and a list that reshuffles under equal values reads as noise.
 */
export const mostCited = (works: readonly Work[], limit = 15): Work[] =>
  [...works]
    .sort(
      (a, b) =>
        b.citations.total - a.citations.total || b.year - a.year || a.title.localeCompare(b.title),
    )
    .slice(0, limit);

export interface CitationBucket {
  key: string;
  /** What the axis shows: "0", "1–2", "3–9", … */
  label: string;
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound; `null` for the open-ended top bucket. */
  max: number | null;
  count: number;
  /** True only for the explicit zero bucket, which is drawn apart from the log bands. */
  zero: boolean;
}

/**
 * Half-decade boundaries: 1, 3, 10, 31, 100, 316, 1000, … Each band is the same width on a
 * logarithmic axis, which is what makes the bars comparable.
 */
const HALF_DECADE = [1, 3, 10, 31, 100, 316, 1000, 3162, 10000];

const formatBand = (min: number, max: number | null): string =>
  max === null ? `${String(min)}+` : min === max ? String(min) : `${String(min)}–${String(max)}`;

/**
 * docs/05 §7.11: the citation distribution, **logarithmic**.
 *
 * "Measured: median 35, maximum 1,650, and 17 works with no citations yet. A linear axis renders
 * this as one bar at zero and a hundred-fold empty span; the log axis is a requirement, and **the
 * zero-citation works need their own bucket since a log axis has no zero**."
 *
 * The zero bucket is therefore a bucket in its own right and is flagged as one, so the chart can
 * draw it apart from the bands rather than pretending it sits on the same scale. Bands run only
 * as far as the data reaches, so an empty tail is never drawn as a row of empty bars.
 */
export function citationBuckets(works: readonly Work[]): CitationBucket[] {
  const totals = works.map((work) => work.citations.total);
  const zero = totals.filter((total) => total <= 0).length;
  const highest = Math.max(0, ...totals);

  const buckets: CitationBucket[] = [
    { key: 'zero', label: '0', min: 0, max: 0, count: zero, zero: true },
  ];
  for (const [index, min] of HALF_DECADE.entries()) {
    if (min > highest) break;
    const next = HALF_DECADE[index + 1];
    const last = next === undefined || next > highest;
    const max = last ? null : next - 1;
    buckets.push({
      key: `band-${String(min)}`,
      label: formatBand(min, max),
      min,
      max,
      count: totals.filter((total) => total >= min && (max === null || total <= max)).length,
      zero: false,
    });
    if (last) break;
  }
  return buckets;
}

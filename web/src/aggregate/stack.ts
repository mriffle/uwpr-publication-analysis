/**
 * A stack over buckets of years: the few largest series, one pinned series, and the rest as
 * "Other" (docs/06 §8, docs/09 §12.5).
 *
 * Research areas over time settled the shape — the top five plus "Other", three-year buckets by
 * default with single years available, the partial year marked (docs/05 §7.5) — and
 * `aggregate/areas.ts` keeps its own copy, which is left alone. The funding charts need the same
 * shape twice (value by agency, new grants by agency) with one thing areas never had: **a pinned
 * series**. Miscellaneous holds the numbers nothing matched, so it is never one of the five and
 * never folded into "Other" (docs/09 §4): merged, it would pass off unmatched numbers as some
 * other agency's grants, and ranked, it would take a place an agency should have. So it stands
 * between the five and "Other", which keeps the palette at six plus "Other" (docs/06 §8).
 *
 * Generic over what is stacked: the caller says, per item, its year, its series and its value.
 * **A series whose total is zero is not drawn.** It has no marks, and for a stack of dollars it
 * would put an agency in the legend at $0 when its amounts are only unknown (docs/09 §12.11
 * rule 3) — so the unknown count is the caller's to state beside the chart.
 *
 * Pure (docs/06 B4): no React, no rendering, no colour.
 */
import type { Period } from '../contract/types';
import { isPartialYear } from './series';

/** The key and label of the residual series. Never a series key the caller supplies. */
export const OTHER_SERIES = 'Other';

/** The five of "the top five plus Other" (docs/06 §8 caps the palette at six plus "Other"). */
export const TOP_SERIES = 5;

/**
 * - `ranked`: one of the largest few, by the stacked value.
 * - `pinned`: kept as its own series whatever its size, never merged into "Other".
 * - `other`: the residue — whatever fell outside the largest few. It changes as the corpus and
 *   the filter change, so it is never a filter value.
 */
export type StackRole = 'ranked' | 'pinned' | 'other';

export interface StackSeries {
  key: string;
  label: string;
  role: StackRole;
  /** The series' sum over every bucket. */
  total: number;
  /** The caller's series keys this one draws: itself, or every key folded into "Other". */
  members: readonly string[];
}

export interface StackBucket {
  key: string;
  /** "2008–2010", or "2008" where the bucket covers one year. */
  label: string;
  startYear: number;
  endYear: number;
  /** True when the bucket contains a year the calendar has not finished (docs/05 §4.2). */
  partial: boolean;
  /** One value per series, in the order of `series`. */
  values: number[];
  /** The height of the stack. */
  total: number;
}

export interface YearStack {
  /** The ranked series, largest first; then the pinned one; then "Other" when anything is in it. */
  series: StackSeries[];
  buckets: StackBucket[];
  bucketYears: number;
  /** Everything stacked: the sum of every bucket's total. */
  total: number;
}

export interface StackOptions<T> {
  year: (item: T) => number;
  /** The item's series key. */
  series: (item: T) => string;
  /** What the item adds to its series in its year: 1 to count, an amount to sum. */
  value: (item: T) => number;
  /** A series' label, from its key. */
  label: (key: string) => string;
  /** A series kept apart whatever its rank: Miscellaneous. */
  pinned?: string | null;
  /** How many series are ranked before "Other"; five by default. */
  top?: number;
  /** Years per bucket; three by default (docs/05 §7.5), 1 for single years. */
  bucketYears?: number;
  /**
   * Where the axis starts, unless an item's year is earlier; the export's `period.first_year` by
   * default. The counted-funding stack starts at 2006, when UWPR began, before the first
   * publication (docs/09 F17).
   */
  firstYear?: number;
}

function bucketLabel(start: number, end: number): string {
  return start === end ? String(start) : `${String(start)}–${String(end)}`;
}

/**
 * Stack items by year and series. The axis spans the export's `period` whatever is shown, as the
 * publication charts' does (or starts at `firstYear` when one is given), so a filtered stack is
 * read against the same frame; a bucket keeps a partial year's flag, and the last bucket may be
 * shorter than the rest.
 */
export function stackByYear<T>(
  items: readonly T[],
  period: Period,
  options: StackOptions<T>,
): YearStack {
  const bucketYears = Math.max(1, Math.trunc(options.bucketYears ?? 3));
  const top = Math.max(0, Math.trunc(options.top ?? TOP_SERIES));
  const pinned = options.pinned ?? null;

  const totals = new Map<string, number>();
  for (const item of items) {
    const key = options.series(item);
    totals.set(key, (totals.get(key) ?? 0) + options.value(item));
  }

  // Largest first, then by label and key, so the same data always stacks the same way.
  const ranked = [...totals.entries()]
    .filter(([key, total]) => key !== pinned && total !== 0)
    .map(([key, total]) => ({ key, total, label: options.label(key) }))
    .sort(
      (a, b) => b.total - a.total || a.label.localeCompare(b.label) || (a.key < b.key ? -1 : 1),
    );

  const series: StackSeries[] = ranked
    .slice(0, top)
    .map(({ key, label, total }) => ({ key, label, role: 'ranked', total, members: [key] }));
  const pinnedTotal = pinned === null ? 0 : (totals.get(pinned) ?? 0);
  if (pinned !== null && pinnedTotal !== 0) {
    series.push({
      key: pinned,
      label: options.label(pinned),
      role: 'pinned',
      total: pinnedTotal,
      members: [pinned],
    });
  }
  const rest = ranked.slice(top);
  if (rest.length > 0) {
    series.push({
      key: OTHER_SERIES,
      label: OTHER_SERIES,
      role: 'other',
      total: rest.reduce((sum, entry) => sum + entry.total, 0),
      members: rest.map((entry) => entry.key),
    });
  }

  const position = new Map<string, number>();
  for (const [at, entry] of series.entries()) {
    for (const member of entry.members) position.set(member, at);
  }

  const years = items.map(options.year);
  const first = Math.min(options.firstYear ?? period.first_year, ...years);
  const last = Math.max(period.last_year, ...years);

  const buckets: StackBucket[] = [];
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
      values: series.map(() => 0),
      total: 0,
    });
  }

  let total = 0;
  for (const item of items) {
    const at = position.get(options.series(item));
    // Only a zero-total series has no position, and it adds nothing.
    if (at === undefined) continue;
    // Every year lies between `first` and `last`, so its bucket exists.
    const bucket = buckets[Math.floor((options.year(item) - first) / bucketYears)] as StackBucket;
    const value = options.value(item);
    bucket.values[at] = (bucket.values[at] ?? 0) + value;
    bucket.total += value;
    total += value;
  }

  return { series, buckets, bucketYears, total };
}

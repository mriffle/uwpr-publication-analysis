/**
 * Chart series, derived from the rows (docs/05 §7).
 *
 * "Every chart recomputes under every filter — none of them reads the summary block."
 *
 * Everything in this file is indexed by year, and every year-indexed series in the app carries
 * the same partial-period flag, because docs/05 §4.2 makes marking it a requirement rather than
 * a suggestion: "Drawn without a flag, every time-series chart shows a sharp decline in the
 * current year that is an artifact of the calendar."
 */
import type { Period, Work } from '../contract/types';

export interface YearPoint {
  year: number;
  /** Publications whose canonical record is dated in this year (docs/05 §5, "Year of a work"). */
  count: number;
  /** The running total over the years shown, which is docs/05 §7.2's cumulative series. */
  cumulative: number;
  /**
   * True for a year the calendar has not finished (docs/05 §4.2).
   *
   * "Drawn without a flag, every time-series chart shows a sharp decline in the current year
   * that is an artifact of the calendar. The app must mark the current year as partial in every
   * chart that includes it. This is a requirement, not a suggestion."
   */
  partial: boolean;
}

/** True for a year the calendar has not finished, from the export's own `period` block. */
export const isPartialYear = (year: number, period: Period): boolean =>
  period.current_year_partial && year > period.complete_through;

/** Accumulate a year→value map into a contiguous series with its running total. */
function toSeries(
  counts: ReadonlyMap<number, number>,
  first: number,
  last: number,
  period: Period,
): YearPoint[] {
  const points: YearPoint[] = [];
  let cumulative = 0;
  for (let year = first; year <= last; year += 1) {
    const count = counts.get(year) ?? 0;
    cumulative += count;
    points.push({ year, count, cumulative, partial: isPartialYear(year, period) });
  }
  return points;
}

/**
 * docs/05 §7.1 and §7.2: publications per year over the whole recorded period, with the running
 * total alongside.
 *
 * The axis spans `period.first_year`..`period.last_year` whatever the filter selects, so that a
 * filtered view is read against the same frame as the unfiltered one, and so that the two years
 * before the first publication are never implied to exist (docs/05 §4.2: "Nothing is recorded
 * for 2006 or 2007. The app either starts its axis at 2008 or marks the two years explicitly;
 * it must not imply the resource did not exist.").
 */
export function publicationsPerYear(works: readonly Work[], period: Period): YearPoint[] {
  const counts = new Map<number, number>();
  for (const work of works) counts.set(work.year, (counts.get(work.year) ?? 0) + 1);

  const first = Math.min(period.first_year, ...counts.keys());
  const last = Math.max(period.last_year, ...counts.keys());
  return toSeries(counts, first, last, period);
}

/**
 * docs/05 §7.3 and §7.4: citations received per year, with the running total.
 *
 * **The series cannot begin before `period.citation_years_from`.** OpenAlex reports citations
 * received by year only from 2012, while the publications start in 2008, so this chart starts
 * four years after §7.1's — a difference docs/05 §4.2 requires the page to state rather than
 * "left as an apparent discrepancy between two charts on the same page". The figure that
 * reconciles them is `citationsBeforeWindow` below, recomputed from the rows so that it, too,
 * responds to the filter.
 */
export function citationsPerYear(works: readonly Work[], period: Period): YearPoint[] {
  const counts = new Map<number, number>();
  for (const work of works) {
    for (const [key, value] of Object.entries(work.citations.by_year)) {
      const year = Number(key);
      if (!Number.isInteger(year)) continue;
      counts.set(year, (counts.get(year) ?? 0) + value);
    }
  }

  // `citation_years_from` is derived from the data — it is the earliest year any work's by-year
  // series covers — so no observed year can precede it, and starting there is safe as well as
  // required. It is nullable, for a corpus whose works have no by-year series at all.
  const observed = [...counts.keys()];
  const fallback = observed.length > 0 ? Math.min(...observed) : period.first_year;
  const first = period.citation_years_from ?? fallback;
  const last = Math.max(period.last_year, ...observed);
  if (last < first) return [];
  return toSeries(counts, first, last, period);
}

/**
 * The citations that fall outside the by-year window — 458 over the whole corpus (docs/05 §4.2).
 *
 * Recomputed from the rows rather than read from `period.citations_before_window`, so that the
 * figure stated beside a filtered chart is the figure for what is shown. The two agree exactly
 * when nothing is filtered, which is what the summary cross-check asserts.
 */
export const citationsBeforeWindow = (works: readonly Work[]): number =>
  works.reduce((before, work) => {
    // Everything the by-year series does not account for predates the window by definition: the
    // series covers every year OpenAlex reports, and `total` is the whole citation count. This
    // is the same identity the summary cross-check asserts against
    // `period.citations_before_window`.
    const inWindow = Object.values(work.citations.by_year).reduce((sum, value) => sum + value, 0);
    return before + work.citations.total - inWindow;
  }, 0);

export interface OpenAccessPoint {
  year: number;
  /** Works whose open-access status is anything other than `closed` (docs/05 §5). */
  open: number;
  closed: number;
  total: number;
  /** `null` for a year with no publications, which is not the same as 0%. */
  share: number | null;
  partial: boolean;
}

/**
 * docs/05 §7.12: open access over time.
 *
 * **Counts are carried alongside the share**, because "the early years have 6 to 15 works each,
 * so a percentage from 2008 is one paper either way". A year with no publications has a `null`
 * share rather than a zero one — 0% and "nothing to measure" are different facts.
 */
export function openAccessPerYear(works: readonly Work[], period: Period): OpenAccessPoint[] {
  const open = new Map<number, number>();
  const total = new Map<number, number>();
  for (const work of works) {
    total.set(work.year, (total.get(work.year) ?? 0) + 1);
    if (work.oa.status !== 'closed') open.set(work.year, (open.get(work.year) ?? 0) + 1);
  }

  const first = Math.min(period.first_year, ...total.keys());
  const last = Math.max(period.last_year, ...total.keys());

  const points: OpenAccessPoint[] = [];
  for (let year = first; year <= last; year += 1) {
    const all = total.get(year) ?? 0;
    const yes = open.get(year) ?? 0;
    points.push({
      year,
      open: yes,
      closed: all - yes,
      total: all,
      share: all === 0 ? null : yes / all,
      partial: isPartialYear(year, period),
    });
  }
  return points;
}

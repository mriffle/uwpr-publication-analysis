/**
 * Chart series, derived from the rows (docs/05 §7).
 *
 * "Every chart recomputes under every filter — none of them reads the summary block."
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

  const points: YearPoint[] = [];
  let cumulative = 0;
  for (let year = first; year <= last; year += 1) {
    const count = counts.get(year) ?? 0;
    cumulative += count;
    points.push({
      year,
      count,
      cumulative,
      partial: period.current_year_partial && year > period.complete_through,
    });
  }
  return points;
}

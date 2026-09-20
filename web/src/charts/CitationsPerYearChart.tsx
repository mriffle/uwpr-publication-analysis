/**
 * Citations received per year, with cumulative citations on a second axis.
 *
 * docs/05 §7.3 and §7.4, drawn on the same frame as publications per year (docs/06 §4.3: "A
 * toggle switches the same frame to citations received per year with cumulative citations").
 *
 * **Two constraints, both measured** (docs/05 §7.3):
 *
 * - "The series cannot begin before 2012, four years after the publications begin" — it begins
 *   at `period.citation_years_from`, which is where OpenAlex's by-year reporting starts.
 * - "458 citations fall outside it — the chart must say so rather than let a reader reconcile it
 *   against §7.1 themselves." That figure is stated by the caller from
 *   `citationsBeforeWindow`, recomputed from the rows so it responds to the filter.
 */
import { citationsPerYear, type YearPoint } from '../aggregate/series';
import type { Period, Work } from '../contract/types';
import {
  YearSeriesChart,
  YearSeriesTable,
  yearMarkLabel,
  type SeriesUnit,
} from './YearSeriesChart';

const UNIT: SeriesUnit = { one: 'citation', many: 'citations' };

export interface CitationsPerYearProps {
  works: readonly Work[];
  period: Period;
  width: number;
  height: number;
  selectedYears?: readonly number[];
  onSelectYear?: (year: number) => void;
}

export const citationBarLabel = (point: YearPoint, selected: boolean): string =>
  yearMarkLabel(point, selected, UNIT);

export function CitationsPerYearChart({
  works,
  period,
  width,
  height,
  selectedYears = [],
  onSelectYear,
}: CitationsPerYearProps) {
  const points = citationsPerYear(works, period);
  const first = points[0]?.year ?? period.first_year;
  const last = points.at(-1)?.year ?? period.last_year;
  return (
    <YearSeriesChart
      points={points}
      width={width}
      height={height}
      label={`Citations received per year, ${String(first)} to ${String(last)}, with cumulative citations`}
      unit={UNIT}
      valueAxisLabel="Citations received"
      selectedYears={selectedYears}
      {...(onSelectYear ? { onSelectYear } : {})}
    />
  );
}

export function CitationsPerYearTable({
  works,
  period,
}: {
  works: readonly Work[];
  period: Period;
}) {
  return (
    <YearSeriesTable
      points={citationsPerYear(works, period)}
      caption="Citations received per year, with the running total. A partial year is marked."
      valueHeader="Citations received"
    />
  );
}

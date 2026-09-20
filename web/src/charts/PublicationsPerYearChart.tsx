/**
 * Publications per year, with cumulative publications on a second axis.
 *
 * docs/06 §4.3, docs/05 §7.1 and §7.2. The drawing is `YearSeriesChart`'s, shared with the
 * citations series that the same frame toggles to; this module is the publications reading of
 * it — which series, which nouns, which axis titles.
 */
import { publicationsPerYear, type YearPoint } from '../aggregate/series';
import type { Period, Work } from '../contract/types';
import {
  YearSeriesChart,
  YearSeriesTable,
  yearMarkLabel,
  type SeriesUnit,
} from './YearSeriesChart';

const UNIT: SeriesUnit = { one: 'publication', many: 'publications' };

export interface PublicationsPerYearProps {
  works: readonly Work[];
  period: Period;
  width: number;
  height: number;
  /** Years currently selected in the filter, so a drawn bar can show it is selected. */
  selectedYears?: readonly number[];
  onSelectYear?: (year: number) => void;
}

/** The accessible name of one bar, which is also what the tooltip shows (docs/06 §7, §9). */
export const barLabel = (point: YearPoint, selected: boolean): string =>
  yearMarkLabel(point, selected, UNIT);

export function PublicationsPerYearChart({
  works,
  period,
  width,
  height,
  selectedYears = [],
  onSelectYear,
}: PublicationsPerYearProps) {
  return (
    <YearSeriesChart
      points={publicationsPerYear(works, period)}
      width={width}
      height={height}
      label={`Publications per year, ${String(period.first_year)} to ${String(period.last_year)}, with cumulative publications`}
      unit={UNIT}
      valueAxisLabel="Publications"
      selectedYears={selectedYears}
      {...(onSelectYear ? { onSelectYear } : {})}
    />
  );
}

/** The same series the chart draws, as numbers (docs/06 §7: "Every chart has a table"). */
export function PublicationsPerYearTable({
  works,
  period,
}: {
  works: readonly Work[];
  period: Period;
}) {
  return (
    <YearSeriesTable
      points={publicationsPerYear(works, period)}
      caption="Publications per year, with the running total. A partial year is marked."
      valueHeader="Publications"
    />
  );
}

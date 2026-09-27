/**
 * The over-time readings of Funding impact (docs/09 §12.5 items 3 and 4): grant funding counted,
 * by the year it was awarded, with its running total (`CountedOverTimeChart`), which the agency
 * page draws too (§12.6); and the by-agency stacks — counted funding by agency, the "By agency"
 * view of the same frame, and new grants by agency.
 *
 * Everything that makes the figures honest is decided in `aggregate/funding.ts`; the drawing is
 * the kit's (`YearSeriesChart`, `StackedBucketChart`). What is decided here is how these charts
 * read, and four things the spec states about the drawing:
 *
 * - **The year bars are static** (`role="img"`). An award year is not a publication year, so a
 *   click applying the publication-year filter would change the very amounts being drawn (§12.5
 *   item 3).
 * - **Counted funding is drawn by the year awarded** (F17): each grant's counted dollars in the
 *   years its funder awarded them, from 2006, when the resource began, whatever the filter, so a
 *   filtered chart is read against the same frame. A year with none awarded is a dash, and the
 *   running total before the first is "nothing counted yet", never "$0 cumulative".
 * - **Unknown is never $0** (§12.11 rule 3). Grants with no known amount are not in the chart and
 *   are counted once beside it.
 * - **An agency's segments apply the agency filter** — their series *is* an agency, whatever
 *   their year — while "Other" is a residue and never a filter. Miscellaneous is pinned, its own
 *   colour, and selectable like any agency (§12.4).
 */
import type { CountedOverTime, CountedYearPoint } from '../aggregate/funding';
import type { YearPoint } from '../aggregate/series';
import type { StackBucket, YearStack } from '../aggregate/stack';
import { formatCount, formatUsd, formatUsdCompact, pluralize } from '../format/number';
import { WIDE_MARGIN } from './ChartFrame';
import { ChartTable } from './ChartTable';
import { otherColour, seriesColour } from './palette';
import { StackedBucketChart, StackedBucketTable, type StackedSeries } from './StackedBucketChart';
import { YearSeriesChart } from './YearSeriesChart';

const compactTick = (value: unknown): string => formatUsdCompact(Number(value));

/** A running total, or a stack's cell, as a table cell: a dash with nothing in it, never "$0". */
const cumulativeCell = (value: number): string => (value === 0 ? '—' : formatUsd(value));

/* ------------------------------------------------------------------------------------------------
 * Counted funding by the year awarded (docs/09 F17).
 * --------------------------------------------------------------------------------------------- */

/** One award year in words: what was awarded, from how many grants; or that none was. */
export function describeAwardYear(point: CountedYearPoint): string {
  if (point.grants === 0) return 'no counted funding awarded';
  return `${formatUsd(point.count)} awarded, from ${pluralize(point.grants, 'grant')}`;
}

/** An award year's value as a table cell: a dash with none awarded, never "$0". */
export const awardYearCell = (point: CountedYearPoint): string =>
  point.grants === 0 ? '—' : formatUsd(point.count);

/**
 * The counted running total in a bar's accessible name: "nothing counted yet" before the first
 * year anything counted was awarded — not "$0 cumulative" — and the sum after it.
 */
function describeCountedTotal(over: CountedOverTime, point: CountedYearPoint): string {
  const first = over.points.find((entry) => entry.grants > 0)?.year;
  return first === undefined || point.year < first
    ? 'nothing counted yet'
    : `${formatUsd(point.cumulative)} cumulative`;
}

export interface CountedOverTimeChartProps {
  over: CountedOverTime;
  width: number;
  height: number;
}

/**
 * The Total view: the counted funding awarded each year as static bars, from 2006 whatever the
 * filter, and the running total as a line ending at the headline's figure.
 */
export function CountedOverTimeChart({ over, width, height }: CountedOverTimeChartProps) {
  const byYear = new Map(over.points.map((point) => [point.year, point]));
  // Every point drawn is one of `over`'s; the fallback only satisfies the kit's wider type.
  const of = (point: YearPoint): CountedYearPoint =>
    byYear.get(point.year) ?? { ...point, grants: 0, institutionWide: 0 };
  return (
    <YearSeriesChart
      points={over.points}
      width={width}
      height={height}
      label="Grant funding by year awarded: the counted funding of the grants listed, in the year it was awarded, with the running total"
      valueAxisLabel="Awarded in the year"
      cumulativeAxisLabel="Cumulative"
      formatValue={formatUsd}
      describeValue={(_, point) => describeAwardYear(of(point))}
      describeCumulative={(_, point) => describeCountedTotal(over, of(point))}
      yTickFormat={compactTick}
      rightTickFormat={compactTick}
      margin={WIDE_MARGIN}
      // A dash, not "$0", for a year with nothing awarded, and for a running total before any.
      tooltipValue={(point) => awardYearCell(of(point))}
      tooltipCumulative={(point) => cumulativeCell(point.cumulative)}
      tooltipRows={(point) => [
        { label: 'Grants contributing', value: formatCount(of(point).grants) },
      ]}
    />
  );
}

/** The same award years as numbers, with how many grants contributed to each. */
export function CountedOverTimeTable({ over }: { over: CountedOverTime }) {
  return (
    <ChartTable<CountedYearPoint>
      caption="The counted funding of the grants listed, by the year it was awarded, with the running total and how many grants contributed in each year. A dash is a year with no counted funding awarded."
      rows={over.points}
      rowKey={(point) => String(point.year)}
      columns={[
        {
          key: 'year',
          header: 'Year',
          value: (point) =>
            point.partial ? `${String(point.year)} (partial)` : String(point.year),
        },
        { key: 'value', header: 'Awarded in the year', numeric: true, value: awardYearCell },
        {
          key: 'cumulative',
          header: 'Cumulative',
          numeric: true,
          value: (point) => cumulativeCell(point.cumulative),
        },
        {
          key: 'grants',
          header: 'Grants contributing',
          numeric: true,
          value: (point) => formatCount(point.grants),
        },
      ]}
    />
  );
}

/** Why "Other" is not a filter, in its segments' accessible names. */
export const OTHER_AGENCIES_REASON =
  'Not a filter: "Other" is whatever falls outside the five largest agencies.';

/**
 * The stack's series as the chart draws them: the ranked agencies in the palette's order,
 * Miscellaneous in the sixth colour whatever its place, and "Other" in the residue's grey. Every
 * agency is a filter value; "Other" is not.
 */
export function agencySeries(stack: YearStack): StackedSeries[] {
  let ranked = 0;
  return stack.series.map((item): StackedSeries => {
    if (item.role === 'other') {
      return {
        key: item.key,
        label: item.label,
        colour: otherColour(),
        selectable: false,
        notSelectableReason: OTHER_AGENCIES_REASON,
      };
    }
    const colour = item.role === 'pinned' ? seriesColour(5) : seriesColour(ranked++);
    return { key: item.key, label: item.label, colour, selectable: true };
  });
}

/**
 * What the stack adds up: counted dollars by the year awarded (`countedByAgency`), or grants
 * counted once in their first year (`newGrantsByAgency`).
 */
export type StackMeasure = 'value' | 'grants';

const measureText = {
  value: {
    axis: 'Awarded in the year',
    format: formatUsd,
    describe: (value: number) => `${formatUsd(value)} awarded`,
    total: 'All agencies',
  },
  grants: {
    axis: 'Grants first listed',
    format: formatCount,
    describe: (value: number) => `${pluralize(value, 'grant')} first listed`,
    total: 'All grants',
  },
} as const;

const periodText = (bucketYears: number) =>
  bucketYears === 1 ? 'by year' : `in ${String(bucketYears)}-year periods`;

export interface AgencyStackChartProps {
  stack: YearStack;
  measure: StackMeasure;
  width: number;
  height: number;
  /** The agencies in the filter, shown as pressed. */
  selectedAgencies?: readonly string[];
  /** Apply or remove an agency; omitted, the chart is static. */
  onSelectAgency?: (code: string) => void;
}

export function AgencyStackChart({
  stack,
  measure,
  width,
  height,
  selectedAgencies = [],
  onSelectAgency,
}: AgencyStackChartProps) {
  const text = measureText[measure];
  return (
    <StackedBucketChart<StackBucket>
      buckets={stack.buckets}
      series={agencySeries(stack)}
      width={width}
      height={height}
      label={
        measure === 'value'
          ? `Grant funding counted, by agency and the year awarded${stack.bucketYears === 1 ? '' : `, in ${String(stack.bucketYears)}-year periods`}`
          : `New grants by agency over time, ${periodText(stack.bucketYears)}, each grant counted once in its first year`
      }
      xLabel={stack.bucketYears === 1 ? 'Year' : `Period (${String(stack.bucketYears)} years)`}
      yLabel={text.axis}
      legendLabel="Agencies"
      partialNoun={stack.bucketYears === 1 ? 'year' : 'period'}
      selectedSeries={selectedAgencies}
      {...(onSelectAgency ? { onSelectSeries: onSelectAgency } : {})}
      selectVerb="filter by this agency"
      formatValue={text.format}
      describeValue={text.describe}
      {...(measure === 'value' ? { yTickFormat: compactTick, margin: WIDE_MARGIN } : {})}
      totalLabel={text.total}
    />
  );
}

export function AgencyStackTable({ stack, measure }: { stack: YearStack; measure: StackMeasure }) {
  const text = measureText[measure];
  return (
    <StackedBucketTable<StackBucket>
      buckets={stack.buckets}
      series={agencySeries(stack)}
      caption={
        measure === 'value'
          ? `The counted funding of the grants listed, by agency and the ${stack.bucketYears === 1 ? 'year' : 'period'} it was awarded. A dash is none awarded then.`
          : 'New grants by agency and period, each grant counted once in the period it is first listed.'
      }
      bucketHeader={stack.bucketYears === 1 ? 'Year' : 'Period'}
      totalHeader={text.total}
      // A cell with nothing awarded is a dash: a stack of dollars has no "$0" to show.
      formatValue={measure === 'value' ? cumulativeCell : formatCount}
    />
  );
}

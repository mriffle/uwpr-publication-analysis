/**
 * The over-time readings of Funding impact (docs/09 §12.5 items 3 and 4): grant funding counted,
 * by the year it was awarded, with its running total (`CountedOverTimeChart`); the by-agency
 * stacks — counted funding by agency, the "By agency" view of the same frame, and new grants by
 * agency; and, until the agency page moves to counted funding, the value first listed each year
 * (`FundingOverTimeChart`, docs/09 F3), which it still draws.
 *
 * Everything that makes the figures honest is decided in `aggregate/funding.ts`; the drawing is
 * the kit's (`YearSeriesChart`, `StackedBucketChart`). What is decided here is how these charts
 * read, and four things the spec states about the drawing:
 *
 * - **The year bars are static** (`role="img"`). An award year is not a publication year, and a
 *   first year is a grant's under the filter; either way a click applying the publication-year
 *   filter would change the very years being drawn (§12.5 item 3).
 * - **Counted funding is drawn by the year awarded** (F17): each grant's counted dollars in the
 *   years its funder awarded them, from 2006, when the resource began, whatever the filter, so a
 *   filtered chart is read against the same frame. A year with none awarded is a dash, and the
 *   running total before the first is "nothing counted yet", never "$0 cumulative".
 * - **Unknown is never $0** (§12.11 rule 3). Grants with no known amount are not in the chart and
 *   are counted once beside it; in the first-listed chart a year whose grants all lack an amount
 *   says so in words, and its row and its tooltip say "not known".
 * - **An agency's segments apply the agency filter** — their series *is* an agency, whatever
 *   their year — while "Other" is a residue and never a filter. Miscellaneous is pinned, its own
 *   colour, and selectable like any agency (§12.4).
 */
import type {
  CountedOverTime,
  CountedYearPoint,
  CumulativeDollars,
  FundingYearPoint,
} from '../aggregate/funding';
import type { YearPoint } from '../aggregate/series';
import type { StackBucket, YearStack } from '../aggregate/stack';
import { formatCount, formatUsd, formatUsdCompact, pluralize } from '../format/number';
import { WIDE_MARGIN } from './ChartFrame';
import { ChartTable } from './ChartTable';
import { otherColour, seriesColour } from './palette';
import { StackedBucketChart, StackedBucketTable, type StackedSeries } from './StackedBucketChart';
import { YearSeriesChart } from './YearSeriesChart';

const compactTick = (value: unknown): string => formatUsdCompact(Number(value));

/** One year's value in words: what entered, from how many grants, and what is not known. */
export function describeYear(point: FundingYearPoint): string {
  if (point.grants === 0) return 'no grant first listed';
  if (point.withAmount === 0) {
    const none = point.grants === 1 ? 'with no known amount' : 'none with a known amount';
    return `${pluralize(point.grants, 'grant')} first listed, ${none}`;
  }
  const unknown =
    point.withoutAmount === 0
      ? ''
      : ` and ${formatCount(point.withoutAmount)} more with no known amount`;
  return `${formatUsd(point.count)} from ${pluralize(point.withAmount, 'grant')} first listed${unknown}`;
}

/** A year's value as a table cell: a dash with nothing entering, "not known" with no amount. */
export function yearValueCell(point: FundingYearPoint): string {
  if (point.grants === 0) return '—';
  return point.withAmount === 0 ? 'not known' : formatUsd(point.count);
}

/** A running total of known amounts: a dash until one is known, never "$0". */
const cumulativeCell = (value: number): string => (value === 0 ? '—' : formatUsd(value));

/**
 * The running total in a bar's accessible name. Until the first year a known amount enters, it
 * holds nothing known, which is not "$0": the years before are "no known amount yet". After it,
 * it is the sum, as any running total is.
 */
export function describeRunningTotal(over: CumulativeDollars, point: FundingYearPoint): string {
  const first = over.points.find((entry) => entry.withAmount > 0)?.year;
  return first === undefined || point.year < first
    ? 'no known amount yet in the running total'
    : `${formatUsd(point.cumulative)} cumulative`;
}

export interface FundingOverTimeChartProps {
  over: CumulativeDollars;
  width: number;
  height: number;
}

/** The Total view: value entering each year as static bars, the running total as a line. */
export function FundingOverTimeChart({ over, width, height }: FundingOverTimeChartProps) {
  const byYear = new Map(over.points.map((point) => [point.year, point]));
  const of = (year: number): FundingYearPoint | undefined => byYear.get(year);
  return (
    <YearSeriesChart
      points={over.points}
      width={width}
      height={height}
      label="Grant funding over time: the known value of the grants first listed in each year, with the running total"
      valueAxisLabel="Value first listed"
      cumulativeAxisLabel="Cumulative"
      formatValue={formatUsd}
      describeValue={(value, point) => {
        const year = of(point.year);
        return year === undefined ? formatUsd(value) : describeYear(year);
      }}
      describeCumulative={(value, point) => {
        const year = of(point.year);
        return year === undefined
          ? `${formatUsd(value)} cumulative`
          : describeRunningTotal(over, year);
      }}
      yTickFormat={compactTick}
      rightTickFormat={compactTick}
      margin={WIDE_MARGIN}
      // The table's words, not "$0", for a year whose grants all lack an amount or with none.
      tooltipValue={(point) => {
        const year = of(point.year);
        return year === undefined ? formatUsd(point.count) : yearValueCell(year);
      }}
      // …and the table's dash, not "$0", for a running total with nothing known in it yet.
      tooltipCumulative={(point) => cumulativeCell(point.cumulative)}
      tooltipRows={(point) => {
        const year = of(point.year);
        if (year === undefined) return [];
        return [
          { label: 'Grants first listed', value: formatCount(year.grants) },
          ...(year.withoutAmount === 0
            ? []
            : [{ label: 'With no known amount', value: formatCount(year.withoutAmount) }]),
        ];
      }}
    />
  );
}

/** The same years as numbers, with the grants entering and how many have no known amount. */
export function FundingOverTimeTable({ over }: { over: CumulativeDollars }) {
  return (
    <ChartTable<FundingYearPoint>
      caption="The known value of the grants first listed in each year, the running total, and how many grants entered with no known amount. Each grant's whole lifetime total enters in its first year. A dash is no known amount, which is not $0."
      rows={over.points}
      rowKey={(point) => String(point.year)}
      columns={[
        {
          key: 'year',
          header: 'Year',
          value: (point) =>
            point.partial ? `${String(point.year)} (partial)` : String(point.year),
        },
        { key: 'value', header: 'Value first listed', numeric: true, value: yearValueCell },
        {
          key: 'cumulative',
          header: 'Cumulative',
          numeric: true,
          value: (point) => cumulativeCell(point.cumulative),
        },
        {
          key: 'grants',
          header: 'Grants first listed',
          numeric: true,
          value: (point) => formatCount(point.grants),
        },
        {
          key: 'unknown',
          header: 'With no known amount',
          numeric: true,
          value: (point) => formatCount(point.withoutAmount),
        },
      ]}
    />
  );
}

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
export function describeCountedTotal(over: CountedOverTime, point: CountedYearPoint): string {
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

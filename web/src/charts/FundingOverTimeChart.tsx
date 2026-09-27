/**
 * The two over-time readings of Funding impact (docs/09 §12.5 items 3 and 4): grant funding
 * entering each year with its running total, and the by-agency stacks — value by agency, the
 * "By agency" view of the same frame, and new grants by agency.
 *
 * Everything that makes the figures honest is decided in `aggregate/funding.ts`; the drawing is
 * the kit's (`YearSeriesChart`, `StackedBucketChart`). What is decided here is how these charts
 * read, and three things the spec states about the drawing:
 *
 * - **The year bars are static** (`role="img"`). Their year is a grant's first year under the
 *   filter — the year of the first publication shown that lists it — and a click applying the
 *   publication-year filter would change the very first years being drawn (§12.5 item 3).
 * - **Unknown is never $0** (§12.11 rule 3). A year whose grants all lack an amount says so in
 *   words, and its row says "not known"; a year or a bucket with nothing entering is a dash. The
 *   count of grants with no known amount stands beside each year's value.
 * - **An agency's segments apply the agency filter** — their series *is* an agency, whatever
 *   their year — while "Other" is a residue and never a filter. Miscellaneous is pinned, its own
 *   colour, and selectable like any agency (§12.4).
 */
import type { CumulativeDollars, FundingYearPoint } from '../aggregate/funding';
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
      yTickFormat={compactTick}
      rightTickFormat={compactTick}
      margin={WIDE_MARGIN}
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
      caption="The known value of the grants first listed in each year, the running total, and how many grants entered with no known amount. Each grant's whole lifetime total enters in its first year."
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

/** What the stack adds up: known dollars, or grants counted once in their first year. */
export type StackMeasure = 'value' | 'grants';

const measureText = {
  value: {
    axis: 'Value first listed',
    format: formatUsd,
    describe: (value: number) => `${formatUsd(value)} first listed`,
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
          ? `Grant funding by agency over time, ${periodText(stack.bucketYears)}, as the known value of the grants first listed`
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
          ? 'The known value of the grants first listed, by agency and period. A dash is no known amount, which is not $0.'
          : 'New grants by agency and period, each grant counted once in the period it is first listed.'
      }
      bucketHeader={stack.bucketYears === 1 ? 'Year' : 'Period'}
      totalHeader={text.total}
      // A cell with no known amount is a dash: a stack of dollars has no "$0" to show.
      formatValue={measure === 'value' ? cumulativeCell : formatCount}
    />
  );
}

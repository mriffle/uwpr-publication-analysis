/**
 * A stacked bar over buckets of years, with its legend and its table: the shape of research
 * areas over time (docs/05 §7.5, docs/06 §4.4), generalised so that any "the few largest series
 * plus the rest, over time" chart is the same component rather than a second copy of it.
 *
 * What the component owns, so that no caller has to remember it:
 *
 * - **The partial period** (docs/05 §4.2): a bucket holding an unfinished year is hatched *over*
 *   its stack, so the segments keep their colours, and the sentence under the chart says so.
 * - **Selectable and non-selectable series.** Clicking a segment or a legend entry applies that
 *   series as a filter (docs/06 §6) — but only where the series *is* a filter value. A residue
 *   such as "Other" never is: it is whatever fell outside the largest few, and it changes as the
 *   corpus and the filter change. A pinned series with a stable identity, such as a
 *   "Miscellaneous" agency, can be. The caller says which with `selectable`.
 * - **Exact values** (docs/06 §7): `formatValue` is the exact figure in the tooltip, the legend
 *   and the table, and `describeValue` the figure in a sentence, for the accessible name. Only
 *   the axis (`yTickFormat`) may round.
 */
import { useId, useState, type ReactNode } from 'react';
import { Bar } from '@visx/shape';
import { scaleBand, scaleLinear } from 'd3-scale';
import { formatCount } from '../format/number';
import { ChartFrame, DEFAULT_MARGIN } from './ChartFrame';
import { ChartLegend, type LegendEntry } from './ChartLegend';
import { ChartTable, type ChartTableColumn } from './ChartTable';
import { ChartTooltip } from './ChartTooltip';
import { PartialKey, PartialPattern } from './partial';

export interface StackedBucket {
  key: string;
  /** "2008–2010", or "2008" where the bucket covers one year. */
  label: string;
  /** True when the bucket contains a year the calendar has not finished (docs/05 §4.2). */
  partial: boolean;
  /** One value per series, in the order of the chart's `series`. */
  values: readonly number[];
  /** The height of the stack. */
  total: number;
}

export interface StackedSeries {
  key: string;
  label: string;
  /** A `palette.ts` colour: `seriesColour(i)`, or `otherColour()` for the residue. */
  colour: string;
  /** Whether the series is a filter value. "Other" never is; see the module comment. */
  selectable: boolean;
  /**
   * Why a non-selectable series is not a filter, said in its segments' accessible names when
   * the chart is otherwise interactive: 'Not a filter: "Other" is whatever falls outside the
   * five largest agencies.'
   */
  notSelectableReason?: string;
}

/** Everything a segment's accessible name may need. */
export interface StackedSegment<B extends StackedBucket> {
  bucket: B;
  series: StackedSeries;
  value: number;
  selected: boolean;
  /** True when activating this segment applies a filter. */
  selectable: boolean;
  /** True when the chart has a filter behind it at all. */
  interactive: boolean;
}

/**
 * The default accessible name of one segment, which the tooltip repeats in parts:
 * "NIH, 2014–2016, which includes a partial year: 12 grants. Activate to filter by this."
 */
export function stackedSegmentLabel<B extends StackedBucket>(
  { bucket, series, value, selected, selectable, interactive }: StackedSegment<B>,
  describeValue: (value: number) => string = formatCount,
  selectVerb = 'filter by this',
): string {
  const partial = bucket.partial ? ', which includes a partial year' : '';
  const action = !interactive
    ? ''
    : !selectable
      ? series.notSelectableReason === undefined
        ? ''
        : ` ${series.notSelectableReason}`
      : selected
        ? ' Selected. Activate to remove this from the filter.'
        : ` Activate to ${selectVerb}.`;
  return `${series.label}, ${bucket.label}${partial}: ${describeValue(value)}.${action}`;
}

export interface StackedBucketChartProps<B extends StackedBucket> {
  buckets: readonly B[];
  /** Stacked bottom to top in this order, which is also the legend's order. */
  series: readonly StackedSeries[];
  width: number;
  height: number;
  /** The chart's accessible name (docs/06 §9). */
  label: string;
  xLabel: string;
  yLabel: string;
  /** The legend's accessible name: "Research fields", "Agencies". */
  legendLabel: string;
  /** What a partial bucket is called in the sentence under the chart: "year" or "period". */
  partialNoun?: string;
  selectedSeries?: readonly string[];
  /** Omitted, no segment and no legend entry is a control. */
  onSelectSeries?: (key: string) => void;
  /** What activating a segment does, in the default accessible name: "filter by this agency". */
  selectVerb?: string;
  /** The exact value in the tooltip, the legend and the table. Defaults to a grouped integer. */
  formatValue?: (value: number) => string;
  /** A value in a sentence, for the default accessible name. Defaults to `formatValue`. */
  describeValue?: (value: number) => string;
  /** Replaces the default accessible name entirely, for a chart whose wording is pinned. */
  describeSegment?: (segment: StackedSegment<B>) => string;
  /** The value axis's tick labels, e.g. `formatUsdCompact`. */
  yTickFormat?: (value: unknown) => string;
  /** The tooltip row for the whole stack: "All fields". */
  totalLabel?: string;
  /** Further tooltip rows for a bucket, after the segment's value and the total. */
  tooltipRows?: (bucket: B) => readonly { label: string; value: string }[];
}

export function StackedBucketChart<B extends StackedBucket>({
  buckets,
  series,
  width,
  height,
  label,
  xLabel,
  yLabel,
  legendLabel,
  partialNoun = 'year',
  selectedSeries = [],
  onSelectSeries,
  selectVerb = 'filter by this',
  formatValue = formatCount,
  describeValue = formatValue,
  describeSegment,
  yTickFormat,
  totalLabel = 'Total',
  tooltipRows,
}: StackedBucketChartProps<B>) {
  const patternId = useId();
  const [hovered, setHovered] = useState<{ bucket: B; index: number } | null>(null);
  const interactive = onSelectSeries !== undefined;
  const describe =
    describeSegment ??
    ((segment: StackedSegment<B>) => stackedSegmentLabel(segment, describeValue, selectVerb));

  const margin = DEFAULT_MARGIN;
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const xScale = scaleBand<string>()
    .domain(buckets.map((bucket) => bucket.key))
    .range([0, innerWidth])
    .padding(0.2);
  const yScale = scaleLinear()
    .domain([0, Math.max(1, ...buckets.map((bucket) => bucket.total))])
    .range([innerHeight, 0])
    .nice();

  const step = innerWidth < 420 ? 3 : innerWidth < 640 ? 2 : 1;
  const tickValues = buckets.filter((_, index) => index % step === 0).map((b) => b.key);
  const bucketLabels = new Map(buckets.map((bucket) => [bucket.key, bucket.label]));

  const totals = series.map((_, index) =>
    buckets.reduce((sum, bucket) => sum + (bucket.values[index] ?? 0), 0),
  );

  const entries: LegendEntry[] = series.map((item, index) => ({
    key: item.key,
    label: item.label,
    colour: item.colour,
    selected: selectedSeries.includes(item.key),
    value: formatValue(totals[index] ?? 0),
  }));
  const selectableKeys = new Set(series.filter((item) => item.selectable).map((item) => item.key));

  const hoveredSeries = hovered ? series[hovered.index] : undefined;

  return (
    <div className="chart-plot">
      <ChartFrame
        width={width}
        height={height}
        margin={margin}
        label={label}
        xScale={xScale}
        yScale={yScale}
        xLabel={xLabel}
        yLabel={yLabel}
        xTickValues={tickValues}
        xTickFormat={(value) => bucketLabels.get(String(value)) ?? String(value)}
        {...(yTickFormat === undefined ? {} : { yTickFormat })}
      >
        {() => (
          <>
            {/* Hatched over the stack, so the segments keep their colours (docs/05 §4.2 still
                requires the mark: a bucket holding an unfinished year is not comparable with a
                complete one). */}
            <PartialPattern id={patternId} filled={false} />
            {buckets.map((bucket) => {
              const x = xScale(bucket.key) ?? 0;
              const bandWidth = xScale.bandwidth();
              let top = 0;
              return series.map((item, index) => {
                const value = bucket.values[index] ?? 0;
                const bottom = top + value;
                const yTop = yScale(bottom);
                const yBottom = yScale(top);
                top = bottom;
                if (value === 0) return null;
                const selectable = interactive && item.selectable;
                const selected = selectedSeries.includes(item.key);
                return (
                  <g
                    key={`${bucket.key}-${item.key}`}
                    {...(selectable
                      ? { role: 'button', tabIndex: 0, 'aria-pressed': selected }
                      : { role: 'img' })}
                    aria-label={describe({
                      bucket,
                      series: item,
                      value,
                      selected,
                      selectable,
                      interactive,
                    })}
                    className={`chart-bar${selected ? ' is-selected' : ''}${selectable ? '' : ' is-static'}`}
                    onClick={() => {
                      if (selectable) onSelectSeries?.(item.key);
                    }}
                    onKeyDown={(event) => {
                      if (selectable && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        onSelectSeries?.(item.key);
                      }
                    }}
                    onMouseEnter={() => {
                      setHovered({ bucket, index });
                    }}
                    onMouseLeave={() => {
                      setHovered(null);
                    }}
                    onFocus={() => {
                      setHovered({ bucket, index });
                    }}
                    onBlur={() => {
                      setHovered(null);
                    }}
                  >
                    <Bar
                      x={x}
                      y={yTop}
                      width={bandWidth}
                      height={Math.max(0, yBottom - yTop)}
                      fill={item.colour}
                      stroke="var(--panel-bg)"
                      strokeWidth={1}
                      data-testid={`segment-${bucket.key}-${item.key}`}
                    />
                  </g>
                );
              });
            })}
            {buckets
              .filter((bucket) => bucket.partial && bucket.total > 0)
              .map((bucket) => (
                <Bar
                  key={`partial-${bucket.key}`}
                  x={xScale(bucket.key) ?? 0}
                  y={yScale(bucket.total)}
                  width={xScale.bandwidth()}
                  height={Math.max(0, innerHeight - yScale(bucket.total))}
                  fill={`url(#${patternId})`}
                  stroke="var(--chart-partial-line)"
                  strokeWidth={1}
                  pointerEvents="none"
                  aria-hidden="true"
                  data-testid={`partial-${bucket.key}`}
                />
              ))}
          </>
        )}
      </ChartFrame>
      {hovered ? (
        <ChartTooltip
          x={margin.left + (xScale(hovered.bucket.key) ?? 0) + xScale.bandwidth() / 2}
          y={margin.top + yScale(hovered.bucket.total)}
          title={
            hovered.bucket.partial
              ? `${hovered.bucket.label} (includes a partial year)`
              : hovered.bucket.label
          }
          rows={[
            {
              label: hoveredSeries?.label ?? '',
              value: formatValue(hovered.bucket.values[hovered.index] ?? 0),
            },
            { label: totalLabel, value: formatValue(hovered.bucket.total) },
            ...(tooltipRows?.(hovered.bucket) ?? []),
          ]}
        />
      ) : null}
      <PartialKey
        labels={buckets.filter((bucket) => bucket.partial).map((bucket) => bucket.label)}
        noun={partialNoun}
      />
      <ChartLegend
        entries={entries}
        label={legendLabel}
        {...(onSelectSeries
          ? {
              onSelect: (entry) => {
                if (selectableKeys.has(entry.key)) onSelectSeries(entry.key);
              },
            }
          : {})}
      />
    </div>
  );
}

export interface StackedBucketTableProps<B extends StackedBucket> {
  buckets: readonly B[];
  series: readonly StackedSeries[];
  caption: string;
  /** The first column's header: "Period", "Year". */
  bucketHeader: string;
  /** The stack's total: "Topic assignments", "Grants". */
  totalHeader: string;
  formatValue?: (value: number) => string;
  /** Further numeric columns after the total, e.g. the bucket's publications. */
  extraColumns?: readonly { key: string; header: string; value: (bucket: B) => ReactNode }[];
}

/**
 * The same buckets the chart draws, as numbers (docs/06 §7): one row per bucket, one column per
 * series, then the total. A partial bucket says so in its row header.
 */
export function StackedBucketTable<B extends StackedBucket>({
  buckets,
  series,
  caption,
  bucketHeader,
  totalHeader,
  formatValue = formatCount,
  extraColumns = [],
}: StackedBucketTableProps<B>) {
  const columns: ChartTableColumn<B>[] = [
    {
      key: 'period',
      header: bucketHeader,
      value: (bucket) =>
        bucket.partial ? `${bucket.label} (includes a partial year)` : bucket.label,
    },
    ...series.map((item, index) => ({
      key: item.key,
      header: item.label,
      numeric: true,
      value: (bucket: B) => formatValue(bucket.values[index] ?? 0),
    })),
    {
      key: 'total',
      header: totalHeader,
      numeric: true,
      value: (bucket) => formatValue(bucket.total),
    },
    ...extraColumns.map((column) => ({ ...column, numeric: true })),
  ];
  return (
    <ChartTable<B>
      caption={caption}
      rows={buckets}
      rowKey={(bucket) => bucket.key}
      columns={columns}
    />
  );
}

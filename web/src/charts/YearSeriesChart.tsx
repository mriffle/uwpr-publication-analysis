/**
 * A year series drawn as bars, with its running total as a line on a second axis.
 *
 * This is the shape docs/06 §4.3 specifies twice: publications per year with cumulative
 * publications, and — on the same frame, behind a toggle — citations received per year with
 * cumulative citations. It is one component rather than two so that the toggle really does
 * switch "the same frame", and so that the honesty constraints are implemented once:
 *
 * - **The current year is partial** and is drawn hatched and muted, never as a full bar, with a
 *   label saying so. "Without it the page shows a decline that is an artifact of the calendar."
 * - **Nothing is recorded before 2008.** The axis starts where the caller's series starts, which
 *   is the export's own `period`, so the two empty years of the search window are never implied
 *   to be years with no output.
 *
 * Clicking or activating a bar toggles that year in the filter (docs/06 §6).
 */
import { useId, useState } from 'react';
import { Bar, LinePath } from '@visx/shape';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from 'd3-scale';
import type { YearPoint } from '../aggregate/series';
import { formatCount } from '../format/number';
import { ChartFrame, DEFAULT_MARGIN } from './ChartFrame';
import { ChartTable } from './ChartTable';
import { ChartTooltip } from './ChartTooltip';
import { seriesColour } from './palette';
import { PartialKey, PartialPattern } from './partial';

/** What one bar counts, so the accessible names read "2 publications" or "469 citations". */
export interface SeriesUnit {
  one: string;
  many: string;
}

export interface YearSeriesChartProps {
  points: readonly YearPoint[];
  width: number;
  height: number;
  /** The chart's accessible name (docs/06 §9). */
  label: string;
  unit: SeriesUnit;
  /** The left axis title: "Publications", "Citations received". */
  valueAxisLabel: string;
  /** The right axis title: "Cumulative". */
  cumulativeAxisLabel?: string;
  selectedYears?: readonly number[];
  onSelectYear?: (year: number) => void;
}

const plural = (count: number, unit: SeriesUnit): string => (count === 1 ? unit.one : unit.many);

/** The accessible name of one bar, which is also what the tooltip shows (docs/06 §7, §9). */
export function yearMarkLabel(point: YearPoint, selected: boolean, unit: SeriesUnit): string {
  const partial = point.partial ? ', a partial year' : '';
  const action = selected
    ? 'Selected. Activate to remove this year from the filter'
    : 'Activate to filter by this year';
  return (
    `${String(point.year)}${partial}: ${formatCount(point.count)} ${plural(point.count, unit)}, ` +
    `${formatCount(point.cumulative)} cumulative. ${action}.`
  );
}

export function YearSeriesChart({
  points,
  width,
  height,
  label,
  unit,
  valueAxisLabel,
  cumulativeAxisLabel = 'Cumulative',
  selectedYears = [],
  onSelectYear,
}: YearSeriesChartProps) {
  const patternId = useId();
  const [hovered, setHovered] = useState<YearPoint | null>(null);

  const margin = DEFAULT_MARGIN;
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const years = points.map((point) => String(point.year));
  const xScale = scaleBand<string>().domain(years).range([0, innerWidth]).padding(0.25);
  const maxCount = Math.max(1, ...points.map((point) => point.count));
  const maxCumulative = Math.max(1, ...points.map((point) => point.cumulative));
  const yScale = scaleLinear().domain([0, maxCount]).range([innerHeight, 0]).nice();
  const cumulativeScale = scaleLinear().domain([0, maxCumulative]).range([innerHeight, 0]).nice();

  // At narrow widths the year labels collide; thinning them is docs/06 §8's "reflow to fewer
  // categories rather than shrinking into illegibility".
  const step = innerWidth < 420 ? 4 : innerWidth < 640 ? 2 : 1;
  const tickValues = years.filter((_, index) => index % step === 0);

  const partialYears = points.filter((point) => point.partial).map((point) => point.year);

  return (
    <div className="chart-plot">
      <ChartFrame
        width={width}
        height={height}
        margin={margin}
        label={label}
        xScale={xScale}
        yScale={yScale}
        rightScale={cumulativeScale}
        xLabel="Year"
        yLabel={valueAxisLabel}
        rightLabel={cumulativeAxisLabel}
        xTickValues={tickValues}
      >
        {() => (
          <>
            <PartialPattern id={patternId} />
            {points.map((point) => {
              const selected = selectedYears.includes(point.year);
              const x = xScale(String(point.year)) ?? 0;
              const barWidth = xScale.bandwidth();
              const y = yScale(point.count);
              return (
                <Group key={point.year}>
                  <g
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected}
                    aria-label={yearMarkLabel(point, selected, unit)}
                    className={`chart-bar${selected ? ' is-selected' : ''}`}
                    onClick={() => onSelectYear?.(point.year)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectYear?.(point.year);
                      }
                    }}
                    onMouseEnter={() => {
                      setHovered(point);
                    }}
                    onMouseLeave={() => {
                      setHovered(null);
                    }}
                    onFocus={() => {
                      setHovered(point);
                    }}
                    onBlur={() => {
                      setHovered(null);
                    }}
                  >
                    {/* A full-height hit area, so a year with no publications is still reachable. */}
                    <Bar x={x} y={0} width={barWidth} height={innerHeight} fill="transparent" />
                    <Bar
                      x={x}
                      y={y}
                      width={barWidth}
                      height={Math.max(0, innerHeight - y)}
                      fill={point.partial ? `url(#${patternId})` : seriesColour(0)}
                      stroke={point.partial ? 'var(--chart-partial-line)' : 'none'}
                      strokeWidth={point.partial ? 1 : 0}
                      data-testid={`bar-${String(point.year)}`}
                      data-partial={point.partial ? 'true' : 'false'}
                    />
                  </g>
                </Group>
              );
            })}
            <LinePath<YearPoint>
              data={[...points]}
              x={(point) => (xScale(String(point.year)) ?? 0) + xScale.bandwidth() / 2}
              y={(point) => cumulativeScale(point.cumulative)}
              stroke={seriesColour(1)}
              strokeWidth={2}
              fill="none"
              aria-hidden="true"
              data-testid="cumulative-line"
            />
          </>
        )}
      </ChartFrame>
      {hovered ? (
        <ChartTooltip
          x={margin.left + (xScale(String(hovered.year)) ?? 0) + xScale.bandwidth() / 2}
          y={margin.top + yScale(hovered.count)}
          title={hovered.partial ? `${String(hovered.year)} (partial year)` : String(hovered.year)}
          rows={[
            { label: valueAxisLabel, value: formatCount(hovered.count) },
            { label: cumulativeAxisLabel, value: formatCount(hovered.cumulative) },
          ]}
        />
      ) : null}
      <PartialKey labels={partialYears.map(String)} />
    </div>
  );
}

export interface YearSeriesTableProps {
  points: readonly YearPoint[];
  caption: string;
  valueHeader: string;
  cumulativeHeader?: string;
}

/** The same series the chart draws, as numbers (docs/06 §7: "Every chart has a table"). */
export function YearSeriesTable({
  points,
  caption,
  valueHeader,
  cumulativeHeader = 'Cumulative',
}: YearSeriesTableProps) {
  return (
    <ChartTable<YearPoint>
      caption={caption}
      rows={points}
      rowKey={(point) => String(point.year)}
      columns={[
        {
          key: 'year',
          header: 'Year',
          value: (point) =>
            point.partial ? `${String(point.year)} (partial)` : String(point.year),
        },
        { key: 'count', header: valueHeader, numeric: true, value: (p) => formatCount(p.count) },
        {
          key: 'cumulative',
          header: cumulativeHeader,
          numeric: true,
          value: (p) => formatCount(p.cumulative),
        },
      ]}
    />
  );
}

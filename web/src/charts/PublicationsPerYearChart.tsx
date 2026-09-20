/**
 * Publications per year, with cumulative publications on a second axis.
 *
 * docs/06 §4.3, docs/05 §7.1 and §7.2. This is the first chart through the shared kit, and the
 * section docs/06 calls out as the one that "most needs the honesty constraints":
 *
 * - **The current year is partial** and is drawn hatched and muted, never as a full bar, with a
 *   label saying so. "Without it the page shows a decline that is an artifact of the calendar."
 * - **Nothing is recorded before 2008.** The axis starts at the export's `period.first_year`,
 *   so the two empty years of the search window are never implied to be years with no output.
 *
 * Clicking or activating a bar toggles that year in the filter (docs/06 §6).
 */
import { useId, useMemo, useState } from 'react';
import { Bar, LinePath } from '@visx/shape';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear } from 'd3-scale';
import { publicationsPerYear, type YearPoint } from '../aggregate/series';
import type { Period, Work } from '../contract/types';
import { formatCount } from '../format/number';
import { ChartFrame, DEFAULT_MARGIN } from './ChartFrame';
import { ChartTable } from './ChartTable';
import { ChartTooltip } from './ChartTooltip';
import { seriesColour } from './palette';

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
export function barLabel(point: YearPoint, selected: boolean): string {
  const partial = point.partial ? ', a partial year' : '';
  const action = selected
    ? 'Selected. Activate to remove this year from the filter'
    : 'Activate to filter by this year';
  return (
    `${String(point.year)}${partial}: ${formatCount(point.count)} ` +
    `${point.count === 1 ? 'publication' : 'publications'}, ` +
    `${formatCount(point.cumulative)} cumulative. ${action}.`
  );
}

export function PublicationsPerYearChart({
  works,
  period,
  width,
  height,
  selectedYears = [],
  onSelectYear,
}: PublicationsPerYearProps) {
  const patternId = useId();
  const points = useMemo(() => publicationsPerYear(works, period), [works, period]);
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
        label={`Publications per year, ${String(period.first_year)} to ${String(period.last_year)}, with cumulative publications`}
        xScale={xScale}
        yScale={yScale}
        rightScale={cumulativeScale}
        xLabel="Year"
        yLabel="Publications"
        rightLabel="Cumulative"
        xTickValues={tickValues}
      >
        {() => (
          <>
            <defs>
              <pattern
                id={patternId}
                width={6}
                height={6}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width={6} height={6} fill="var(--chart-partial-bg)" />
                <line
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={6}
                  stroke="var(--chart-partial-line)"
                  strokeWidth={3}
                />
              </pattern>
            </defs>
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
                    aria-label={barLabel(point, selected)}
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
            { label: 'Publications', value: formatCount(hovered.count) },
            { label: 'Cumulative', value: formatCount(hovered.cumulative) },
          ]}
        />
      ) : null}
      {partialYears.length > 0 ? (
        <p className="chart-partial-key">
          <span className="chart-partial-swatch" aria-hidden="true" />
          {partialYears.map(String).join(', ')} {partialYears.length === 1 ? 'is' : 'are'} partial:
          the {partialYears.length === 1 ? 'year is' : 'years are'} not over, so the{' '}
          {partialYears.length === 1 ? 'bar is' : 'bars are'} hatched and will grow.
        </p>
      ) : null}
    </div>
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
  const points = publicationsPerYear(works, period);
  return (
    <ChartTable<YearPoint>
      caption="Publications per year, with the running total. A partial year is marked."
      rows={points}
      rowKey={(point) => String(point.year)}
      columns={[
        {
          key: 'year',
          header: 'Year',
          value: (point) =>
            point.partial ? `${String(point.year)} (partial)` : String(point.year),
        },
        { key: 'count', header: 'Publications', numeric: true, value: (p) => formatCount(p.count) },
        {
          key: 'cumulative',
          header: 'Cumulative',
          numeric: true,
          value: (p) => formatCount(p.cumulative),
        },
      ]}
    />
  );
}

/**
 * Open access over time (docs/05 §7.12, docs/06 §4.6).
 *
 * > Measured: 91% overall, rising from about two-thirds in the early years to consistently above
 * > 85%. **Constraint:** the early years have 6 to 15 works each, so a percentage from 2008 is
 * > one paper either way. **Show counts alongside the share**, or bucket the early years.
 *
 * The counts are shown: each year is a stacked bar of open and closed publications — so the
 * height of the bar is the year's output and the reader can see how few papers a share is
 * computed over — with the share drawn as a line on the right-hand axis. A year with no
 * publications has no share at all rather than a share of zero, and the line breaks there.
 *
 * Clicking a year's bar toggles that year in the filter (docs/06 §6).
 */
import { useState } from 'react';
import { Bar, LinePath } from '@visx/shape';
import { scaleBand, scaleLinear } from 'd3-scale';
import { openAccessPerYear, type OpenAccessPoint } from '../aggregate/series';
import type { Period, Work } from '../contract/types';
import { formatCount, formatShare, pluralize } from '../format/number';
import { ChartFrame, DEFAULT_MARGIN } from './ChartFrame';
import { ChartLegend } from './ChartLegend';
import { ChartTable } from './ChartTable';
import { ChartTooltip } from './ChartTooltip';
import { otherColour, seriesColour } from './palette';

export function openAccessMarkLabel(point: OpenAccessPoint, selected: boolean): string {
  const partial = point.partial ? ', a partial year' : '';
  const share =
    point.share === null
      ? 'no publications, so no share'
      : `${formatShare(point.share)} open access — ${formatCount(point.open)} of ${pluralize(point.total, 'publication')}, ${formatCount(point.closed)} closed`;
  const action = selected
    ? 'Selected. Activate to remove this year from the filter'
    : 'Activate to filter by this year';
  return `${String(point.year)}${partial}: ${share}. ${action}.`;
}

export interface OpenAccessOverTimeChartProps {
  works: readonly Work[];
  period: Period;
  width: number;
  height: number;
  selectedYears?: readonly number[];
  onSelectYear?: (year: number) => void;
}

export function OpenAccessOverTimeChart({
  works,
  period,
  width,
  height,
  selectedYears = [],
  onSelectYear,
}: OpenAccessOverTimeChartProps) {
  const [hovered, setHovered] = useState<OpenAccessPoint | null>(null);
  const points = openAccessPerYear(works, period);

  const margin = DEFAULT_MARGIN;
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const years = points.map((point) => String(point.year));
  const xScale = scaleBand<string>().domain(years).range([0, innerWidth]).padding(0.25);
  const yScale = scaleLinear()
    .domain([0, Math.max(1, ...points.map((point) => point.total))])
    .range([innerHeight, 0])
    .nice();
  const shareScale = scaleLinear().domain([0, 1]).range([innerHeight, 0]);

  const step = innerWidth < 420 ? 4 : innerWidth < 640 ? 2 : 1;
  const tickValues = years.filter((_, index) => index % step === 0);
  const withShare = points.filter((point) => point.share !== null);

  return (
    <div className="chart-plot">
      <ChartFrame
        width={width}
        height={height}
        margin={margin}
        label="Open-access publications per year, as counts, with the open-access share as a line"
        xScale={xScale}
        yScale={yScale}
        rightScale={shareScale}
        xLabel="Year"
        yLabel="Publications"
        rightLabel="Open-access share"
        xTickValues={tickValues}
      >
        {() => (
          <>
            {points.map((point) => {
              const x = xScale(point.year.toString()) ?? 0;
              const bandWidth = xScale.bandwidth();
              const selected = selectedYears.includes(point.year);
              const yOpen = yScale(point.open);
              const yTotal = yScale(point.total);
              return (
                <g
                  key={point.year}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={openAccessMarkLabel(point, selected)}
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
                  <Bar x={x} y={0} width={bandWidth} height={innerHeight} fill="transparent" />
                  <Bar
                    x={x}
                    y={yTotal}
                    width={bandWidth}
                    height={Math.max(0, yOpen - yTotal)}
                    fill={otherColour()}
                    data-testid={`closed-${String(point.year)}`}
                  />
                  <Bar
                    x={x}
                    y={yOpen}
                    width={bandWidth}
                    height={Math.max(0, innerHeight - yOpen)}
                    fill={seriesColour(0)}
                    data-testid={`open-${String(point.year)}`}
                  />
                </g>
              );
            })}
            <LinePath<OpenAccessPoint>
              data={withShare}
              x={(point) => (xScale(String(point.year)) ?? 0) + xScale.bandwidth() / 2}
              y={(point) => shareScale(point.share ?? 0)}
              stroke={seriesColour(1)}
              strokeWidth={2}
              fill="none"
              aria-hidden="true"
              data-testid="share-line"
            />
          </>
        )}
      </ChartFrame>
      {hovered ? (
        <ChartTooltip
          x={margin.left + (xScale(String(hovered.year)) ?? 0) + xScale.bandwidth() / 2}
          y={margin.top + yScale(hovered.total)}
          title={hovered.partial ? `${String(hovered.year)} (partial year)` : String(hovered.year)}
          rows={[
            { label: 'Open access', value: formatCount(hovered.open) },
            { label: 'Closed', value: formatCount(hovered.closed) },
            { label: 'Publications', value: formatCount(hovered.total) },
            {
              label: 'Share',
              value: hovered.share === null ? 'no publications' : formatShare(hovered.share),
            },
          ]}
        />
      ) : null}
      <ChartLegend
        label="Open-access status"
        entries={[
          { key: 'open', label: 'Open access', colour: `var(--chart-1)` },
          { key: 'closed', label: 'Closed', colour: `var(--chart-other)` },
          { key: 'share', label: 'Share (right axis)', colour: `var(--chart-2)` },
        ]}
      />
    </div>
  );
}

export function OpenAccessOverTimeTable({
  works,
  period,
}: {
  works: readonly Work[];
  period: Period;
}) {
  return (
    <ChartTable<OpenAccessPoint>
      caption="Open-access publications per year, with the share and the counts it is computed over. A partial year is marked."
      rows={openAccessPerYear(works, period)}
      rowKey={(point) => String(point.year)}
      columns={[
        {
          key: 'year',
          header: 'Year',
          value: (point) =>
            point.partial ? `${String(point.year)} (partial)` : String(point.year),
        },
        { key: 'open', header: 'Open access', numeric: true, value: (p) => formatCount(p.open) },
        { key: 'closed', header: 'Closed', numeric: true, value: (p) => formatCount(p.closed) },
        { key: 'total', header: 'Publications', numeric: true, value: (p) => formatCount(p.total) },
        {
          key: 'share',
          header: 'Share',
          numeric: true,
          value: (p) => (p.share === null ? '—' : formatShare(p.share)),
        },
      ]}
    />
  );
}

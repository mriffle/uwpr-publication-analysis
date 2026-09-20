/**
 * The shared chart frame (docs/06 §11.2): responsive container taking explicit width and height,
 * axes, grid, and one axis treatment for every chart.
 *
 * Width and height are props rather than measured here, which is the reason visx was chosen over
 * a higher-level library: "tests pass fixed dimensions and assert deterministic SVG"
 * (docs/06 §11.2). `ResponsiveChart` is the wrapper that measures.
 */
import type { ReactNode } from 'react';
import { AxisBottom, AxisLeft, AxisRight, type AxisScale } from '@visx/axis';
import { GridColumns, GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { formatCount } from '../format/number';

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export const DEFAULT_MARGIN: ChartMargin = { top: 8, right: 56, bottom: 44, left: 56 };

export interface ChartFrameProps {
  width: number;
  height: number;
  margin?: ChartMargin;
  /** The chart's accessible name (docs/06 §9: "Every chart has an accessible name"). */
  label: string;
  xScale: AxisScale;
  yScale: AxisScale;
  /** The second axis of docs/06 §4.3, for a cumulative series drawn over per-period bars. */
  rightScale?: AxisScale;
  xLabel?: string;
  yLabel?: string;
  rightLabel?: string;
  xTickValues?: readonly (string | number)[];
  /**
   * Which way the gridlines run. Rows for a vertical chart, columns for a horizontal one, so
   * the lines always cross the value axis and never the category axis.
   */
  grid?: 'rows' | 'columns';
  /** Overridden where an axis carries categories rather than counts. */
  xTickFormat?: (value: unknown) => string;
  yTickFormat?: (value: unknown) => string;
  /** A band axis wants one tick per category, not five. */
  yNumTicks?: number;
  children: (inner: { innerWidth: number; innerHeight: number }) => ReactNode;
}

const tickLabel = { fill: 'var(--chart-axis-text)', fontSize: 11 } as const;
const axisLabel = {
  fill: 'var(--chart-axis-text)',
  fontSize: 11,
  textAnchor: 'middle',
} as const;

export function ChartFrame({
  width,
  height,
  margin = DEFAULT_MARGIN,
  label,
  xScale,
  yScale,
  rightScale,
  xLabel,
  yLabel,
  rightLabel,
  xTickValues,
  grid = 'rows',
  xTickFormat,
  yTickFormat = (value) => formatCount(Number(value)),
  yNumTicks = 5,
  children,
}: ChartFrameProps) {
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  return (
    <svg
      className="chart-svg"
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role="group"
      aria-label={label}
    >
      <Group left={margin.left} top={margin.top}>
        <g aria-hidden="true">
          {grid === 'rows' ? (
            <GridRows
              scale={yScale}
              width={innerWidth}
              height={innerHeight}
              stroke="var(--chart-grid)"
              strokeWidth={1}
              numTicks={5}
            />
          ) : (
            <GridColumns
              scale={xScale}
              width={innerWidth}
              height={innerHeight}
              stroke="var(--chart-grid)"
              strokeWidth={1}
              numTicks={5}
            />
          )}
        </g>
        {children({ innerWidth, innerHeight })}
        {/*
          The axes repeat what the marks' accessible names and the table alternative already
          say, so they are hidden from assistive technology to keep the chart's own reading
          short (docs/06 §7: "Every chart has a table").
        */}
        <g aria-hidden="true">
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            stroke="var(--chart-axis)"
            tickStroke="var(--chart-axis)"
            tickLabelProps={() => ({ ...tickLabel, textAnchor: 'middle', dy: '0.25em' })}
            {...(xTickValues ? { tickValues: [...xTickValues] } : {})}
            {...(xTickFormat ? { tickFormat: (value: unknown) => xTickFormat(value) } : {})}
          />
          <AxisLeft
            scale={yScale}
            numTicks={yNumTicks}
            stroke="var(--chart-axis)"
            tickStroke="var(--chart-axis)"
            tickFormat={(value) => yTickFormat(value)}
            tickLabelProps={() => ({
              ...tickLabel,
              textAnchor: 'end',
              dx: '-0.25em',
              dy: '0.25em',
            })}
          />
          {rightScale ? (
            <AxisRight
              left={innerWidth}
              scale={rightScale}
              numTicks={5}
              stroke="var(--chart-axis)"
              tickStroke="var(--chart-axis)"
              tickFormat={(value) => formatCount(Number(value))}
              tickLabelProps={() => ({
                ...tickLabel,
                textAnchor: 'start',
                dx: '0.25em',
                dy: '0.25em',
              })}
            />
          ) : null}
          {xLabel ? (
            <text x={innerWidth / 2} y={innerHeight + 36} {...axisLabel}>
              {xLabel}
            </text>
          ) : null}
          {yLabel ? (
            <text
              transform={`translate(${String(-margin.left + 12)}, ${String(innerHeight / 2)}) rotate(-90)`}
              {...axisLabel}
            >
              {yLabel}
            </text>
          ) : null}
          {rightLabel ? (
            <text
              transform={`translate(${String(innerWidth + margin.right - 12)}, ${String(innerHeight / 2)}) rotate(90)`}
              {...axisLabel}
            >
              {rightLabel}
            </text>
          ) : null}
        </g>
      </Group>
    </svg>
  );
}

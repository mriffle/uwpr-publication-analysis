/**
 * A ranked horizontal bar chart, shared by every "the things that appear most often" chart:
 * research areas overall (docs/05 §7.6), researchers (§7.7), institutions (§7.8), journals
 * (§7.9), how each publication is known (§7.13) and countries (§7.14).
 *
 * They are one component because they are one chart with six sets of rows, and docs/06 §8
 * requires them to read as one system: "One axis treatment, one tooltip, one legend, one number
 * format, from the shared kit, not per-chart decisions."
 *
 * Two things the shape forces, both handled here rather than per chart:
 *
 * - **Category labels are long** — "Journal of the American Society for Mass Spectrometry" — and
 *   SVG has no text overflow. The axis label is truncated to what the label column holds, and the
 *   full string is carried by the mark's accessible name, its tooltip and the table alternative,
 *   so nothing is only available to a reader who can see it.
 * - **Every mark applies a filter** (docs/06 §6), by click and from the keyboard, and says in its
 *   accessible name what activating it will do.
 */
import { useState } from 'react';
import { Bar } from '@visx/shape';
import { scaleBand, scaleLinear } from 'd3-scale';
import { formatCount, pluralize } from '../format/number';
import { ChartFrame, type ChartMargin } from './ChartFrame';
import { ChartTable } from './ChartTable';
import { ChartTooltip } from './ChartTooltip';
import { seriesColour } from './palette';

export interface BarRow {
  /** The value a click puts into the filter. */
  key: string;
  label: string;
  value: number;
  /**
   * A short word after the label carrying a fact that colour must not carry alone (docs/06 §8):
   * "UWPR staff", "preprint server".
   */
  tag?: string;
  /** Overrides the series colour for this row; used to mark staff distinctly (docs/05 §7.7). */
  colour?: string;
  selected?: boolean;
  /** Extra exact values for the tooltip, e.g. a share and its denominator (docs/06 §7). */
  detail?: readonly { label: string; value: string }[];
}

export interface HorizontalBarChartProps {
  rows: readonly BarRow[];
  width: number;
  /** The chart's accessible name (docs/06 §9). */
  label: string;
  /** What one unit of the value is: "publication" / "publications". */
  unit: { one: string; many: string };
  /** The value axis title. */
  valueAxisLabel: string;
  onSelect?: (row: BarRow) => void;
  /** What activating the mark does, when it is not "filter by this". */
  selectVerb?: string;
  rowHeight?: number;
  formatValue?: (value: number) => string;
}

const ROW_HEIGHT = 26;
const TOP = 8;
const BOTTOM = 44;
const RIGHT = 56;

/** The label column: wide enough to read, never more than a third of a desktop chart. */
export const labelColumnWidth = (width: number): number =>
  Math.round(Math.min(260, Math.max(96, width * 0.36)));

/**
 * Truncation by character budget. SVG cannot measure text before layout, and the alternative —
 * measuring in a hidden canvas — costs a dependency-free but genuinely fiddly code path for a
 * string that is also available in full three other ways.
 */
export function truncate(label: string, columnWidth: number): string {
  const budget = Math.max(6, Math.floor((columnWidth - 12) / 6.4));
  return label.length <= budget ? label : `${label.slice(0, budget - 1).trimEnd()}…`;
}

export function barRowLabel(
  row: BarRow,
  unit: { one: string; many: string },
  selectable: boolean,
  selectVerb: string,
): string {
  const tag = row.tag === undefined ? '' : ` (${row.tag})`;
  const detail = (row.detail ?? []).map((item) => `${item.label} ${item.value}`).join(', ');
  const action = !selectable
    ? ''
    : row.selected
      ? ` Selected. Activate to remove this from the filter.`
      : ` Activate to ${selectVerb}.`;
  return `${row.label}${tag}: ${pluralize(row.value, unit.one, unit.many)}${detail === '' ? '' : `, ${detail}`}.${action}`;
}

export function HorizontalBarChart({
  rows,
  width,
  label,
  unit,
  valueAxisLabel,
  onSelect,
  selectVerb = 'filter by this',
  rowHeight = ROW_HEIGHT,
  formatValue = formatCount,
}: HorizontalBarChartProps) {
  const [hovered, setHovered] = useState<BarRow | null>(null);

  const left = labelColumnWidth(width);
  const margin: ChartMargin = { top: TOP, right: RIGHT, bottom: BOTTOM, left };
  const height = TOP + BOTTOM + Math.max(rowHeight, rows.length * rowHeight);
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const yScale = scaleBand<string>()
    .domain(rows.map((row) => row.key))
    .range([0, innerHeight])
    .padding(0.22);
  const xScale = scaleLinear()
    .domain([0, Math.max(1, ...rows.map((row) => row.value))])
    .range([0, innerWidth])
    .nice();

  const labels = new Map(rows.map((row) => [row.key, row.label]));

  return (
    <div className="chart-plot">
      <ChartFrame
        width={width}
        height={height}
        margin={margin}
        label={label}
        xScale={xScale}
        yScale={yScale}
        grid="columns"
        xLabel={valueAxisLabel}
        xTickFormat={(value) => formatValue(Number(value))}
        yTickFormat={(value) => truncate(labels.get(String(value)) ?? String(value), left)}
        yNumTicks={rows.length}
      >
        {() => (
          <>
            {rows.map((row) => {
              const y = yScale(row.key) ?? 0;
              const barHeight = yScale.bandwidth();
              const barWidth = Math.max(0, xScale(row.value));
              const selectable = onSelect !== undefined;
              return (
                <g
                  key={row.key}
                  {...(selectable
                    ? { role: 'button', tabIndex: 0, 'aria-pressed': row.selected ?? false }
                    : // A mark with no filter behind it is a picture of a number, not a control:
                      // it carries the number in its accessible name and stays out of the tab
                      // order, where the table alternative of docs/06 §7 serves the same reader.
                      { role: 'img' })}
                  aria-label={barRowLabel(row, unit, selectable, selectVerb)}
                  className={`chart-bar${row.selected ? ' is-selected' : ''}${selectable ? '' : ' is-static'}`}
                  onClick={() => onSelect?.(row)}
                  onKeyDown={(event) => {
                    if (selectable && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      onSelect?.(row);
                    }
                  }}
                  onMouseEnter={() => {
                    setHovered(row);
                  }}
                  onMouseLeave={() => {
                    setHovered(null);
                  }}
                  onFocus={() => {
                    setHovered(row);
                  }}
                  onBlur={() => {
                    setHovered(null);
                  }}
                >
                  {/* A full-width hit area, so a short bar is as easy to reach as a long one. */}
                  <Bar x={0} y={y} width={innerWidth} height={barHeight} fill="transparent" />
                  <Bar
                    x={0}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    fill={row.colour ?? seriesColour(0)}
                    data-testid={`bar-${row.key}`}
                  />
                  <text
                    x={barWidth + 6}
                    y={y + barHeight / 2}
                    dy="0.32em"
                    fontSize={11}
                    fill="var(--chart-axis-text)"
                    aria-hidden="true"
                  >
                    {formatValue(row.value)}
                    {row.tag === undefined ? '' : ` · ${row.tag}`}
                  </text>
                  {/* The full label, for the reader whose pointer lands on a truncated axis. */}
                  <title>{barRowLabel(row, unit, false, selectVerb)}</title>
                </g>
              );
            })}
          </>
        )}
      </ChartFrame>
      {hovered ? (
        <ChartTooltip
          x={margin.left + Math.max(0, xScale(hovered.value)) / 2}
          y={margin.top + (yScale(hovered.key) ?? 0)}
          title={hovered.tag === undefined ? hovered.label : `${hovered.label} (${hovered.tag})`}
          rows={[
            { label: valueAxisLabel, value: formatValue(hovered.value) },
            ...(hovered.detail ?? []),
          ]}
        />
      ) : null}
    </div>
  );
}

export interface HorizontalBarTableProps {
  rows: readonly BarRow[];
  caption: string;
  categoryHeader: string;
  valueHeader: string;
  formatValue?: (value: number) => string;
}

/**
 * The same rows the chart draws, as numbers and with **untruncated labels** (docs/06 §7).
 *
 * This is where a reader gets the full name of a journal the axis had to shorten, which is why
 * the table is not an afterthought on these charts in particular.
 */
export function HorizontalBarTable({
  rows,
  caption,
  categoryHeader,
  valueHeader,
  formatValue = formatCount,
}: HorizontalBarTableProps) {
  const hasTag = rows.some((row) => row.tag !== undefined);
  const detailHeaders = rows[0]?.detail?.map((item) => item.label) ?? [];
  return (
    <ChartTable<BarRow>
      caption={caption}
      rows={rows}
      rowKey={(row) => row.key}
      columns={[
        { key: 'label', header: categoryHeader, value: (row) => row.label },
        ...(hasTag ? [{ key: 'tag', header: 'Note', value: (row: BarRow) => row.tag ?? '' }] : []),
        {
          key: 'value',
          header: valueHeader,
          numeric: true,
          value: (row) => formatValue(row.value),
        },
        ...detailHeaders.map((header, index) => ({
          key: `detail-${String(index)}`,
          header,
          numeric: true,
          value: (row: BarRow) => row.detail?.[index]?.value ?? '',
        })),
      ]}
    />
  );
}

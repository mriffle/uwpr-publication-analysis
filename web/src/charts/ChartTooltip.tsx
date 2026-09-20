/**
 * One tooltip for every chart (docs/06 §7 and §8).
 *
 * "Tooltips give exact values, including the denominator for anything shown as a share."
 *
 * It appears on hover *and* on keyboard focus, so a sighted keyboard user gets the same exact
 * value a mouse user does. It is hidden from assistive technology because each mark already
 * carries the same numbers in its accessible name, and announcing them twice is worse than once.
 */
export interface ChartTooltipProps {
  /** Position within the chart's positioned container, in pixels. */
  x: number;
  y: number;
  title: string;
  rows: readonly { label: string; value: string }[];
}

export function ChartTooltip({ x, y, title, rows }: ChartTooltipProps) {
  return (
    <div
      className="chart-tooltip"
      data-testid="chart-tooltip"
      aria-hidden="true"
      style={{ left: `${String(x)}px`, top: `${String(y)}px` }}
    >
      <p className="chart-tooltip-title">{title}</p>
      <dl className="chart-tooltip-rows">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

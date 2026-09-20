/**
 * One legend for every chart that draws more than one series (docs/06 §8).
 *
 * Each entry is a button, so the legend is also how a keyboard reader filters by a series
 * without hunting for the right segment in a stacked bar. Colour is never the only channel: the
 * entry carries the series name as text, the series are always stacked in legend order, and
 * every segment's accessible name repeats the series it belongs to.
 */
export interface LegendEntry {
  key: string;
  label: string;
  colour: string;
  selected?: boolean;
  /** The value shown beside the name, e.g. the series' total. */
  value?: string;
}

export interface ChartLegendProps {
  entries: readonly LegendEntry[];
  /** The legend's accessible name, e.g. "Research fields". */
  label: string;
  onSelect?: (entry: LegendEntry) => void;
  selectVerb?: string;
}

export function ChartLegend({
  entries,
  label,
  onSelect,
  selectVerb = 'filter by',
}: ChartLegendProps) {
  return (
    <ul className="chart-legend" aria-label={label}>
      {entries.map((entry) => (
        <li key={entry.key}>
          {onSelect ? (
            <button
              type="button"
              className={`chart-legend-item${entry.selected ? ' is-selected' : ''}`}
              aria-pressed={entry.selected ?? false}
              onClick={() => {
                onSelect(entry);
              }}
            >
              <span
                className="chart-legend-swatch"
                style={{ background: entry.colour }}
                aria-hidden="true"
              />
              <span>{entry.label}</span>
              {entry.value === undefined ? null : (
                <span className="chart-legend-value">{entry.value}</span>
              )}
              <span className="visually-hidden">
                {entry.selected
                  ? '. Selected. Activate to remove it from the filter'
                  : `. Activate to ${selectVerb} it`}
              </span>
            </button>
          ) : (
            <span className="chart-legend-item">
              <span
                className="chart-legend-swatch"
                style={{ background: entry.colour }}
                aria-hidden="true"
              />
              <span>{entry.label}</span>
              {entry.value === undefined ? null : (
                <span className="chart-legend-value">{entry.value}</span>
              )}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

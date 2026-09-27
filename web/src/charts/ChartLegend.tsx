/**
 * One legend for every chart that draws more than one series (docs/06 §8).
 *
 * Each entry is a button, so the legend is also how a keyboard reader filters by a series
 * without hunting for the right segment in a stacked bar. Colour is never the only channel: the
 * entry carries the series name as text, the series are always stacked in legend order, and
 * every segment's accessible name repeats the series it belongs to.
 *
 * **An entry that is not a filter value is plain text**, even in a legend that filters: a
 * residue such as "Other" is whatever fell outside the largest few, so a button for it would
 * announce "Activate to filter by it" and then do nothing.
 */
export interface LegendEntry {
  key: string;
  label: string;
  colour: string;
  selected?: boolean;
  /** The value shown beside the name, e.g. the series' total. */
  value?: string;
  /**
   * False for a series that is not a filter value ("Other"): drawn as plain text, never as a
   * button that does nothing. Defaults to true, so a legend with `onSelect` is all controls.
   */
  selectable?: boolean;
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
          {onSelect && entry.selectable !== false ? (
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

/**
 * The empty state of the chart kit (docs/06 §11.2, §6).
 *
 * "An empty result is a designed state, naming the filters responsible and offering to clear the
 * last one. It is reachable in a few clicks and will be reached."
 */
export interface ChartEmptyProps {
  /** The active filter, in words, from `filter/describe.ts`. */
  filterSentence: string;
  onClearLast?: () => void;
  clearLastLabel?: string;
}

export function ChartEmpty({ filterSentence, onClearLast, clearLastLabel }: ChartEmptyProps) {
  return (
    <div className="chart-empty" role="status">
      <p>No publications match the current filter.</p>
      <p className="chart-empty-filter">{filterSentence}</p>
      {onClearLast && clearLastLabel ? (
        <button type="button" onClick={onClearLast}>
          Remove {clearLastLabel}
        </button>
      ) : null}
    </div>
  );
}

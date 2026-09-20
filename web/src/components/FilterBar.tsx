/**
 * The sticky filter bar (docs/06 §4 and §6).
 *
 * > **Active filters are always visible** as removable chips in the sticky bar, with the
 * > resulting publication count beside them, and a control that clears them all.
 * > **The active filter is stated in words.** A filtered figure that looks like a total is the
 * > easiest way for an accurate page to mislead.
 *
 * The sentence and the chips are the same data (`filter/describe.ts`), so what a screen reader
 * hears in the live region and what a sighted reader sees can never drift apart. The live region
 * holds only the sentence: a region announces everything inside it on every change, and a reader
 * does not need "Clear all filters" read out each time the count moves.
 */
import type { FilterChip } from '../filter/describe';
import type { FilterState } from '../filter/state';

export interface FilterBarProps {
  chips: readonly FilterChip[];
  sentence: string;
  onChange: (next: FilterState) => void;
  onClearAll: () => void;
}

export function FilterBar({ chips, sentence, onChange, onClearAll }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <p className="filter-sentence" role="status">
        {sentence}
      </p>
      {chips.length > 0 ? (
        <ul className="filter-chips" aria-label="Active filters">
          {chips.map((chip) => (
            <li key={`${chip.dimension}:${chip.label}`}>
              <button
                type="button"
                className="filter-chip"
                onClick={() => {
                  onChange(chip.without);
                }}
              >
                <span>{chip.label}</span>
                <span aria-hidden="true" className="filter-chip-x">
                  ×
                </span>
                <span className="visually-hidden">. Remove this filter</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {chips.length > 0 ? (
        <button type="button" className="filter-clear" onClick={onClearAll}>
          Clear all filters
        </button>
      ) : null}
    </div>
  );
}

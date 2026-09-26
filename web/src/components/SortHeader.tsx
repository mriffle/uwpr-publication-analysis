/**
 * A sortable table's column header: a `<th>` carrying `aria-sort`, holding a real button.
 *
 * The pattern is the WAI-ARIA Authoring Practices' sortable table. The header cell says how the
 * table is sorted — `aria-sort` on the one sorted column only, as ARIA asks — and the button is
 * what a keyboard reader presses to change it. The arrow is decoration: the state is announced
 * from `aria-sort`, so the arrow is hidden rather than read out as "up arrow".
 *
 * Which direction a press moves to is the caller's decision (see `toggleSort` in
 * `aggregate/explorer.ts`), since the natural first direction differs by column: a title sorts
 * A–Z first, a total largest first.
 */
import type { SortDirection } from '../aggregate/explorer';

export interface SortHeaderProps {
  label: string;
  /** This column's sort, or null when the table is sorted by another column. */
  direction: SortDirection | null;
  onSort: () => void;
  /** Right-aligned, like the numbers beneath it. */
  numeric?: boolean;
}

export function SortHeader({ label, direction, onSort, numeric = false }: SortHeaderProps) {
  return (
    <th
      scope="col"
      className={numeric ? 'numeric' : undefined}
      {...(direction === null
        ? {}
        : { 'aria-sort': direction === 'asc' ? 'ascending' : 'descending' })}
    >
      <button type="button" className="sort-header" onClick={onSort}>
        {label}
        <span className="sort-header-arrow" aria-hidden="true">
          {direction === null ? '' : direction === 'asc' ? ' ↑' : ' ↓'}
        </span>
      </button>
    </th>
  );
}

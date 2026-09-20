/**
 * The table alternative every chart has (docs/06 §7).
 *
 * "A control on each chart shows the same data as a table of numbers. This serves screen
 * readers, satisfies the reader who wants the exact value, and costs little because the
 * aggregation layer already produced the rows."
 *
 * It renders the *same* series the chart draws, not a second computation of it.
 */
import type { ReactNode } from 'react';

export interface ChartTableColumn<T> {
  key: string;
  header: string;
  value: (row: T) => ReactNode;
  numeric?: boolean;
}

export interface ChartTableProps<T> {
  caption: string;
  columns: readonly ChartTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
}

export function ChartTable<T>({ caption, columns, rows, rowKey }: ChartTableProps<T>) {
  return (
    <table className="chart-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col" className={column.numeric ? 'numeric' : undefined}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((column, index) =>
              index === 0 ? (
                <th key={column.key} scope="row">
                  {column.value(row)}
                </th>
              ) : (
                <td key={column.key} className={column.numeric ? 'numeric' : undefined}>
                  {column.value(row)}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

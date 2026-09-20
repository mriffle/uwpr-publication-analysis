/**
 * A ranked horizontal bar chart in its card: heading, description, honesty note, the responsive
 * chart, and the table alternative (docs/06 §7 and §11.2).
 *
 * Six of the twelve charts are this shape. Composing the card once is what keeps docs/06 §8's
 * "charts read as one system" true by construction rather than by six chart modules each
 * remembering to pass the same props.
 */
import type { ReactNode } from 'react';
import { ChartCard } from './ChartCard';
import { ResponsiveChart } from './ResponsiveChart';
import { HorizontalBarChart, HorizontalBarTable, type BarRow } from './HorizontalBarChart';

export interface RankedBarCardProps {
  title: string;
  description: string;
  note?: ReactNode;
  /** The chart's accessible name, where it differs from the heading. */
  chartLabel?: string;
  rows: readonly BarRow[];
  unit: { one: string; many: string };
  valueAxisLabel: string;
  categoryHeader: string;
  tableCaption: string;
  onSelect?: (row: BarRow) => void;
  selectVerb?: string;
  /** Rendered instead of the chart when the current filter selects nothing (docs/06 §6). */
  empty?: ReactNode;
  formatValue?: (value: number) => string;
  /** Extra controls in the card, such as §7.7's "include staff" toggle. */
  controls?: ReactNode;
}

export function RankedBarCard({
  title,
  description,
  note,
  chartLabel,
  rows,
  unit,
  valueAxisLabel,
  categoryHeader,
  tableCaption,
  onSelect,
  selectVerb,
  empty,
  formatValue,
  controls,
}: RankedBarCardProps) {
  return (
    <ChartCard
      title={title}
      description={description}
      {...(note === undefined ? {} : { note })}
      {...(empty === undefined ? {} : { empty })}
      {...(controls === undefined ? {} : { controls })}
      chart={
        <ResponsiveChart>
          {({ width }) => (
            <HorizontalBarChart
              rows={rows}
              width={width}
              label={chartLabel ?? title}
              unit={unit}
              valueAxisLabel={valueAxisLabel}
              {...(onSelect ? { onSelect } : {})}
              {...(selectVerb === undefined ? {} : { selectVerb })}
              {...(formatValue === undefined ? {} : { formatValue })}
            />
          )}
        </ResponsiveChart>
      }
      table={
        <HorizontalBarTable
          rows={rows}
          caption={tableCaption}
          categoryHeader={categoryHeader}
          valueHeader={valueAxisLabel}
          {...(formatValue === undefined ? {} : { formatValue })}
        />
      }
    />
  );
}

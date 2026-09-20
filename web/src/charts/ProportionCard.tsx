/**
 * A proportion bar in its card: heading, description, honesty note, the responsive chart, and
 * the table alternative (docs/06 §7 and §11.2).
 *
 * The same composition `RankedBarCard` does for the six ranked charts, so the method page's two
 * proportions read as part of the same system as the overview's charts rather than as a visual
 * style of their own.
 */
import type { ReactNode } from 'react';
import { ChartCard } from './ChartCard';
import { ResponsiveChart } from './ResponsiveChart';
import { ProportionBar, ProportionTable, type ProportionSegment } from './ProportionBar';

export interface ProportionCardProps {
  title: string;
  description: string;
  note?: ReactNode;
  /** The chart's accessible name, where it differs from the heading. */
  chartLabel?: string;
  segments: readonly ProportionSegment[];
  total: number;
  unit: { one: string; many: string };
  categoryHeader: string;
  valueHeader: string;
  tableCaption: string;
}

export function ProportionCard({
  title,
  description,
  note,
  chartLabel,
  segments,
  total,
  unit,
  categoryHeader,
  valueHeader,
  tableCaption,
}: ProportionCardProps) {
  return (
    <ChartCard
      title={title}
      description={description}
      {...(note === undefined ? {} : { note })}
      chart={
        <ResponsiveChart>
          {({ width }) => (
            <ProportionBar
              segments={segments}
              total={total}
              width={width}
              label={chartLabel ?? title}
              unit={unit}
            />
          )}
        </ResponsiveChart>
      }
      table={
        <ProportionTable
          segments={segments}
          total={total}
          caption={tableCaption}
          categoryHeader={categoryHeader}
          valueHeader={valueHeader}
        />
      }
    />
  );
}

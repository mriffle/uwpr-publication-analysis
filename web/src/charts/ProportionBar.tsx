/**
 * A single bar divided into its parts: the shape for a figure that is a **proportion of a known
 * whole**, as against `HorizontalBarChart`, whose rows are independent counts that may overlap.
 *
 * The method page has two of these (docs/06 §10) and the difference matters to the reader: the
 * criteria chart's bars sum to more than the corpus and must not be read as a division of it,
 * while these two *are* divisions of a stated whole and are drawn as one. Using the same shape
 * for both would assert a partition in the one place docs/05 §7.13 says there is none.
 *
 * Two honesty constraints are structural here rather than left to each caller:
 *
 * - **Every segment carries its exact count**, in its accessible name, in the legend and in the
 *   table. The share is shown beside the count, never instead of it — a picture can overstate a
 *   precision as easily as a sentence can (docs/05 §11.3).
 * - **The scale is the larger of the stated total and the segments**, so a contract whose parts
 *   ever exceeded its whole would draw a bar that is visibly wrong rather than one that silently
 *   rescales to look correct.
 *
 * Colour is never the only channel (docs/06 §8): the legend names every segment in text, the
 * wide ones are labelled in place, and the table alternative carries all of it.
 */
import { scaleLinear } from 'd3-scale';
import { formatCount, formatShare, pluralize } from '../format/number';
import { ChartLegend } from './ChartLegend';
import { ChartTable } from './ChartTable';

export interface ProportionSegment {
  key: string;
  label: string;
  value: number;
  /** A `var(--chart-n)` token from `palette.ts`. */
  colour: string;
  /** One sentence saying what this part is, shown in the table alternative. */
  meaning?: string;
}

export interface ProportionBarProps {
  segments: readonly ProportionSegment[];
  /** The whole the segments divide. */
  total: number;
  width: number;
  /** The chart's accessible name (docs/06 §9). */
  label: string;
  /** What one unit of the value is: "publication" / "publications". */
  unit: { one: string; many: string };
  height?: number;
}

const HEIGHT = 56;
/** Below this a segment has no room for a legible number, and carries it in the legend only. */
const LABEL_MIN_WIDTH = 46;

export const share = (value: number, total: number): number => (total > 0 ? value / total : 0);

/** "Read, no trace found: 44 of 306 publications, 14%." */
export function segmentLabel(
  segment: ProportionSegment,
  total: number,
  unit: { one: string; many: string },
): string {
  return `${segment.label}: ${formatCount(segment.value)} of ${pluralize(total, unit.one, unit.many)}, ${formatShare(share(segment.value, total))}.`;
}

export function ProportionBar({
  segments,
  total,
  width,
  label,
  unit,
  height = HEIGHT,
}: ProportionBarProps) {
  const sum = segments.reduce((running, segment) => running + segment.value, 0);
  const scale = scaleLinear()
    .domain([0, Math.max(1, total, sum)])
    .range([0, width]);

  let offset = 0;
  const placed = segments.map((segment) => {
    const x = scale(offset);
    const segmentWidth = Math.max(0, scale(offset + segment.value) - x);
    offset += segment.value;
    return { segment, x, width: segmentWidth };
  });

  return (
    <div className="chart-plot">
      <svg
        className="chart-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        role="group"
        aria-label={label}
      >
        {placed.map(({ segment, x, width: segmentWidth }) => (
          <g
            key={segment.key}
            role="img"
            aria-label={segmentLabel(segment, total, unit)}
            className="chart-proportion-segment"
          >
            <rect
              x={x}
              y={0}
              width={segmentWidth}
              height={height}
              fill={segment.colour}
              data-testid={`segment-${segment.key}`}
            />
            {segmentWidth >= LABEL_MIN_WIDTH ? (
              <text
                x={x + segmentWidth / 2}
                y={height / 2}
                dy="0.32em"
                textAnchor="middle"
                fontSize={13}
                className="chart-proportion-value"
                aria-hidden="true"
              >
                {formatCount(segment.value)}
              </text>
            ) : null}
            <title>{segmentLabel(segment, total, unit)}</title>
          </g>
        ))}
      </svg>
      <ChartLegend
        label={`${label}: parts`}
        entries={segments.map((segment) => ({
          key: segment.key,
          label: segment.label,
          colour: segment.colour,
          value: `${formatCount(segment.value)} · ${formatShare(share(segment.value, total))}`,
        }))}
      />
    </div>
  );
}

export interface ProportionTableProps {
  segments: readonly ProportionSegment[];
  total: number;
  caption: string;
  categoryHeader: string;
  valueHeader: string;
}

/** The same parts as numbers, with each one's exact count, its share and what it means. */
export function ProportionTable({
  segments,
  total,
  caption,
  categoryHeader,
  valueHeader,
}: ProportionTableProps) {
  const hasMeaning = segments.some((segment) => segment.meaning !== undefined);
  return (
    <ChartTable<ProportionSegment>
      caption={caption}
      rows={segments}
      rowKey={(segment) => segment.key}
      columns={[
        { key: 'label', header: categoryHeader, value: (segment) => segment.label },
        {
          key: 'value',
          header: valueHeader,
          numeric: true,
          value: (segment) => formatCount(segment.value),
        },
        {
          key: 'share',
          header: `Share of ${formatCount(total)}`,
          numeric: true,
          value: (segment) => formatShare(share(segment.value, total)),
        },
        ...(hasMeaning
          ? [
              {
                key: 'meaning',
                header: 'What it is',
                value: (segment: ProportionSegment) => segment.meaning ?? '',
              },
            ]
          : []),
      ]}
    />
  );
}

/**
 * The citation distribution (docs/05 §7.11, docs/06 §4.7).
 *
 * > Histogram, **logarithmic** on the citation axis. Measured: median 35, maximum 1,650, and 17
 * > works with no citations yet. A linear axis renders this as one bar at zero and a hundred-fold
 * > empty span; the log axis is a requirement, and **the zero-citation works need their own
 * > bucket since a log axis has no zero**.
 *
 * The bands are half-decades — 1–2, 3–9, 10–30, 31–99, … — so each bar covers the same distance
 * on a logarithmic scale and the bars really are comparable. The zero bucket sits to their left,
 * separated by a gap and drawn in the neutral "Other" colour, because it is not on that scale at
 * all; drawing it flush with the bands would assert that it is.
 *
 * **These marks are not filters.** docs/05 §9 lists ten filter dimensions and a citation count is
 * not one of them, so there is nothing for a click to apply. The bars carry their exact values in
 * their accessible names and in the table alternative instead.
 */
import { useState } from 'react';
import { Bar } from '@visx/shape';
import { scaleBand, scaleLinear } from 'd3-scale';
import { citationBuckets, type CitationBucket } from '../aggregate/citations';
import type { Work } from '../contract/types';
import { formatCount, pluralize } from '../format/number';
import { ChartFrame, DEFAULT_MARGIN } from './ChartFrame';
import { ChartTable } from './ChartTable';
import { ChartTooltip } from './ChartTooltip';
import { otherColour, seriesColour } from './palette';

export function bucketLabel(bucket: CitationBucket): string {
  const range = bucket.zero
    ? 'no citations yet'
    : bucket.max === null
      ? `${formatCount(bucket.min)} citations or more`
      : `${formatCount(bucket.min)} to ${formatCount(bucket.max)} citations`;
  return `${range}: ${pluralize(bucket.count, 'publication')}.`;
}

export interface CitationDistributionChartProps {
  works: readonly Work[];
  width: number;
  height: number;
}

export function CitationDistributionChart({
  works,
  width,
  height,
}: CitationDistributionChartProps) {
  const [hovered, setHovered] = useState<CitationBucket | null>(null);
  const buckets = citationBuckets(works);

  const margin = DEFAULT_MARGIN;
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const xScale = scaleBand<string>()
    .domain(buckets.map((bucket) => bucket.key))
    .range([0, innerWidth])
    .padding(0.2);
  const yScale = scaleLinear()
    .domain([0, Math.max(1, ...buckets.map((bucket) => bucket.count))])
    .range([innerHeight, 0])
    .nice();
  const labels = new Map(buckets.map((bucket) => [bucket.key, bucket.label]));

  return (
    <div className="chart-plot">
      <ChartFrame
        width={width}
        height={height}
        margin={margin}
        label="Publications by number of citations, in logarithmic bands, with works that have no citations in a bucket of their own"
        xScale={xScale}
        yScale={yScale}
        xLabel="Citations (logarithmic bands)"
        yLabel="Publications"
        xTickFormat={(value) => labels.get(String(value)) ?? String(value)}
      >
        {() => (
          <>
            {buckets.map((bucket) => {
              const x = xScale(bucket.key) ?? 0;
              const y = yScale(bucket.count);
              return (
                <g
                  key={bucket.key}
                  role="img"
                  aria-label={bucketLabel(bucket)}
                  className="chart-bar is-static"
                  onMouseEnter={() => {
                    setHovered(bucket);
                  }}
                  onMouseLeave={() => {
                    setHovered(null);
                  }}
                >
                  <Bar
                    x={x}
                    y={0}
                    width={xScale.bandwidth()}
                    height={innerHeight}
                    fill="transparent"
                  />
                  <Bar
                    x={x}
                    y={y}
                    width={xScale.bandwidth()}
                    height={Math.max(0, innerHeight - y)}
                    fill={bucket.zero ? otherColour() : seriesColour(0)}
                    data-testid={`bucket-${bucket.key}`}
                    data-zero={bucket.zero ? 'true' : 'false'}
                  />
                </g>
              );
            })}
          </>
        )}
      </ChartFrame>
      {hovered ? (
        <ChartTooltip
          x={margin.left + (xScale(hovered.key) ?? 0) + xScale.bandwidth() / 2}
          y={margin.top + yScale(hovered.count)}
          title={hovered.zero ? 'No citations yet' : `${hovered.label} citations`}
          rows={[{ label: 'Publications', value: formatCount(hovered.count) }]}
        />
      ) : null}
    </div>
  );
}

export function CitationDistributionTable({ works }: { works: readonly Work[] }) {
  return (
    <ChartTable<CitationBucket>
      caption="Publications by number of citations. Works with no citations yet have their own row, because a logarithmic scale has no zero."
      rows={citationBuckets(works)}
      rowKey={(bucket) => bucket.key}
      columns={[
        {
          key: 'band',
          header: 'Citations',
          value: (bucket) => (bucket.zero ? '0 (no citations yet)' : bucket.label),
        },
        {
          key: 'count',
          header: 'Publications',
          numeric: true,
          value: (bucket) => formatCount(bucket.count),
        },
      ]}
    />
  );
}

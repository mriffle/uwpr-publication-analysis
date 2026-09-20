/**
 * Research areas over time (docs/05 §7.5, docs/06 §4.4) — a stacked bar over bucketed years.
 *
 * Everything that makes this chart honest is decided in `aggregate/areas.ts`; what is decided
 * here is how it is drawn, and one thing the spec states as a requirement about the drawing:
 *
 * > The over-time chart's axis is labelled **topic assignments**, not publications, because a
 * > work contributes to each of its topics and the total therefore exceeds the number of
 * > publications.
 *
 * Clicking a segment or a legend entry toggles that field in the filter (docs/06 §6: "an area's
 * band"). The residual "Other" series is not a filter value — it is whatever did not make the
 * top five, and it changes as the corpus and the filter change — so it is drawn but not
 * clickable, and its accessible name says so.
 */
import { useState } from 'react';
import { Bar } from '@visx/shape';
import { scaleBand, scaleLinear } from 'd3-scale';
import { OTHER_FIELD, type AreaBucket, type AreasOverTime } from '../aggregate/areas';
import { formatCount, pluralize } from '../format/number';
import { ChartFrame, DEFAULT_MARGIN } from './ChartFrame';
import { ChartLegend, type LegendEntry } from './ChartLegend';
import { ChartTable } from './ChartTable';
import { ChartTooltip } from './ChartTooltip';
import { otherColour, seriesColour } from './palette';

export const AXIS_LABEL = 'Topic assignments';

export const fieldColour = (field: string, index: number): string =>
  field === OTHER_FIELD ? otherColour() : seriesColour(index);

export function segmentLabel(
  bucket: AreaBucket,
  field: string,
  value: number,
  selected: boolean,
  selectable: boolean,
): string {
  const partial = bucket.partial ? ', which includes a partial year' : '';
  const action = !selectable
    ? ' Not a filter: "Other" is whatever falls outside the five largest fields.'
    : selected
      ? ' Selected. Activate to remove this field from the filter.'
      : ' Activate to filter by this field.';
  return (
    `${field}, ${bucket.label}${partial}: ` +
    `${pluralize(value, 'topic assignment')} over ${pluralize(bucket.works, 'publication')}.${action}`
  );
}

export interface ResearchAreasOverTimeChartProps {
  areas: AreasOverTime;
  width: number;
  height: number;
  selectedFields?: readonly string[];
  onSelectField?: (field: string) => void;
}

export function ResearchAreasOverTimeChart({
  areas,
  width,
  height,
  selectedFields = [],
  onSelectField,
}: ResearchAreasOverTimeChartProps) {
  const [hovered, setHovered] = useState<{ bucket: AreaBucket; index: number } | null>(null);

  const margin = DEFAULT_MARGIN;
  const innerWidth = Math.max(0, width - margin.left - margin.right);
  const innerHeight = Math.max(0, height - margin.top - margin.bottom);

  const xScale = scaleBand<string>()
    .domain(areas.buckets.map((bucket) => bucket.key))
    .range([0, innerWidth])
    .padding(0.2);
  const yScale = scaleLinear()
    .domain([0, Math.max(1, ...areas.buckets.map((bucket) => bucket.total))])
    .range([innerHeight, 0])
    .nice();

  const step = innerWidth < 420 ? 3 : innerWidth < 640 ? 2 : 1;
  const tickValues = areas.buckets.filter((_, index) => index % step === 0).map((b) => b.key);
  const bucketLabels = new Map(areas.buckets.map((bucket) => [bucket.key, bucket.label]));

  const totals = areas.fields.map((_, index) =>
    areas.buckets.reduce((sum, bucket) => sum + (bucket.values[index] ?? 0), 0),
  );

  const entries: LegendEntry[] = areas.fields.map((field, index) => ({
    key: field,
    label: field,
    colour: fieldColour(field, index),
    selected: selectedFields.includes(field),
    value: formatCount(totals[index] ?? 0),
  }));

  return (
    <div className="chart-plot">
      <ChartFrame
        width={width}
        height={height}
        margin={margin}
        label={`Research areas over time, ${areas.bucketYears === 1 ? 'by year' : `in ${String(areas.bucketYears)}-year periods`}, as topic assignments by field`}
        xScale={xScale}
        yScale={yScale}
        xLabel={areas.bucketYears === 1 ? 'Year' : `Period (${String(areas.bucketYears)} years)`}
        yLabel={AXIS_LABEL}
        xTickValues={tickValues}
        xTickFormat={(value) => bucketLabels.get(String(value)) ?? String(value)}
      >
        {() => (
          <>
            {areas.buckets.map((bucket) => {
              const x = xScale(bucket.key) ?? 0;
              const bandWidth = xScale.bandwidth();
              let top = 0;
              return areas.fields.map((field, index) => {
                const value = bucket.values[index] ?? 0;
                const bottom = top + value;
                const yTop = yScale(bottom);
                const yBottom = yScale(top);
                top = bottom;
                if (value === 0) return null;
                const selectable = onSelectField !== undefined && field !== OTHER_FIELD;
                const selected = selectedFields.includes(field);
                return (
                  <g
                    key={`${bucket.key}-${field}`}
                    {...(selectable
                      ? { role: 'button', tabIndex: 0, 'aria-pressed': selected }
                      : { role: 'img' })}
                    aria-label={segmentLabel(bucket, field, value, selected, selectable)}
                    className={`chart-bar${selected ? ' is-selected' : ''}${selectable ? '' : ' is-static'}`}
                    onClick={() => {
                      if (selectable) onSelectField?.(field);
                    }}
                    onKeyDown={(event) => {
                      if (selectable && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        onSelectField?.(field);
                      }
                    }}
                    onMouseEnter={() => {
                      setHovered({ bucket, index });
                    }}
                    onMouseLeave={() => {
                      setHovered(null);
                    }}
                    onFocus={() => {
                      setHovered({ bucket, index });
                    }}
                    onBlur={() => {
                      setHovered(null);
                    }}
                  >
                    <Bar
                      x={x}
                      y={yTop}
                      width={bandWidth}
                      height={Math.max(0, yBottom - yTop)}
                      fill={fieldColour(field, index)}
                      stroke="var(--panel-bg)"
                      strokeWidth={1}
                      data-testid={`segment-${bucket.key}-${field}`}
                    />
                  </g>
                );
              });
            })}
          </>
        )}
      </ChartFrame>
      {hovered ? (
        <ChartTooltip
          x={margin.left + (xScale(hovered.bucket.key) ?? 0) + xScale.bandwidth() / 2}
          y={margin.top + yScale(hovered.bucket.total)}
          title={
            hovered.bucket.partial
              ? `${hovered.bucket.label} (includes a partial year)`
              : hovered.bucket.label
          }
          rows={[
            {
              label: areas.fields[hovered.index] ?? '',
              value: formatCount(hovered.bucket.values[hovered.index] ?? 0),
            },
            { label: 'All fields', value: formatCount(hovered.bucket.total) },
            { label: 'Publications', value: formatCount(hovered.bucket.works) },
          ]}
        />
      ) : null}
      <ChartLegend
        entries={entries}
        label="Research fields"
        {...(onSelectField
          ? {
              onSelect: (entry) => {
                if (entry.key !== OTHER_FIELD) onSelectField(entry.key);
              },
            }
          : {})}
      />
    </div>
  );
}

interface AreaRow {
  key: string;
  label: string;
  values: number[];
  total: number;
  works: number;
}

export function ResearchAreasOverTimeTable({ areas }: { areas: AreasOverTime }) {
  const rows: AreaRow[] = areas.buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.partial ? `${bucket.label} (includes a partial year)` : bucket.label,
    values: bucket.values,
    total: bucket.total,
    works: bucket.works,
  }));
  return (
    <ChartTable<AreaRow>
      caption={`Topic assignments by research field and period. A work counts once for each of its topics, so the totals exceed the number of publications.`}
      rows={rows}
      rowKey={(row) => row.key}
      columns={[
        { key: 'period', header: 'Period', value: (row) => row.label },
        ...areas.fields.map((field, index) => ({
          key: field,
          header: field,
          numeric: true,
          value: (row: AreaRow) => formatCount(row.values[index] ?? 0),
        })),
        { key: 'total', header: AXIS_LABEL, numeric: true, value: (row) => formatCount(row.total) },
        {
          key: 'works',
          header: 'Publications',
          numeric: true,
          value: (row) => formatCount(row.works),
        },
      ]}
    />
  );
}

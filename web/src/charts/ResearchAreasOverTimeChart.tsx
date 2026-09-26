/**
 * Research areas over time (docs/05 §7.5, docs/06 §4.4) — a stacked bar over bucketed years.
 *
 * Everything that makes this chart honest is decided in `aggregate/areas.ts`; the drawing is
 * `StackedBucketChart`'s. What is decided here is this chart's reading of it, including one thing
 * the spec states as a requirement about the drawing:
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
import { OTHER_FIELD, type AreaBucket, type AreasOverTime } from '../aggregate/areas';
import { formatCount, pluralize } from '../format/number';
import { otherColour, seriesColour } from './palette';
import { StackedBucketChart, StackedBucketTable, type StackedSeries } from './StackedBucketChart';

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

const fieldSeries = (areas: AreasOverTime): StackedSeries[] =>
  areas.fields.map((field, index) => ({
    key: field,
    label: field,
    colour: fieldColour(field, index),
    selectable: field !== OTHER_FIELD,
  }));

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
  return (
    <StackedBucketChart<AreaBucket>
      buckets={areas.buckets}
      series={fieldSeries(areas)}
      width={width}
      height={height}
      label={`Research areas over time, ${areas.bucketYears === 1 ? 'by year' : `in ${String(areas.bucketYears)}-year periods`}, as topic assignments by field`}
      xLabel={areas.bucketYears === 1 ? 'Year' : `Period (${String(areas.bucketYears)} years)`}
      yLabel={AXIS_LABEL}
      legendLabel="Research fields"
      partialNoun={areas.bucketYears === 1 ? 'year' : 'period'}
      selectedSeries={selectedFields}
      {...(onSelectField ? { onSelectSeries: onSelectField } : {})}
      describeSegment={({ bucket, series, value, selected, selectable }) =>
        segmentLabel(bucket, series.key, value, selected, selectable)
      }
      totalLabel="All fields"
      tooltipRows={(bucket) => [{ label: 'Publications', value: formatCount(bucket.works) }]}
    />
  );
}

export function ResearchAreasOverTimeTable({ areas }: { areas: AreasOverTime }) {
  return (
    <StackedBucketTable<AreaBucket>
      buckets={areas.buckets}
      series={fieldSeries(areas)}
      caption={`Topic assignments by research field and period. A work counts once for each of its topics, so the totals exceed the number of publications.`}
      bucketHeader="Period"
      totalHeader={AXIS_LABEL}
      extraColumns={[
        { key: 'works', header: 'Publications', value: (bucket) => formatCount(bucket.works) },
      ]}
    />
  );
}

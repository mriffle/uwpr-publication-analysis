/**
 * One grant's amount by fiscal year (docs/09 §12.7): a static chart and its table, "Fiscal year
 * (October to September)", the fiscal year in progress marked.
 *
 * Only NIH RePORTER reports by fiscal year, so only its grants have one (§11.4). The years are
 * the ones the export holds, in order, and none is invented (docs/09, W5): a year the source has
 * no row for is no year here, and a year whose rows report no amount is shown as "no amount
 * reported" — never as $0 (§12.11 rule 3). So the chart draws no running total, whose "$0 so
 * far" before the first reported amount would read as a figure; the grant's lifetime total is
 * stated above it, and the years with an amount add up to it (§11.7).
 *
 * **The years the totals count are marked** (docs/09 F17): the table has a column saying which,
 * and each bar's description and tooltip say whether its year is counted. The bars themselves are
 * drawn alike, so the chart's picture is unchanged.
 *
 * The bars are static (`role="img"`): a fiscal year is not the publication year the year filter
 * selects, and a click applying it would mean something else (§12.5 item 3's reasoning).
 */
import type { FiscalYearPoint } from '../aggregate/funding';
import type { YearPoint } from '../aggregate/series';
import { fiscalYearAmount } from '../format/funding';
import { formatUsd, formatUsdCompact } from '../format/number';
import { WIDE_MARGIN } from './ChartFrame';
import { ChartTable } from './ChartTable';
import { YearSeriesChart } from './YearSeriesChart';

/** The axis title the spec gives, since a fiscal year is not the calendar year it is named by. */
export const FISCAL_YEAR_LABEL = 'Fiscal year (October to September)';

/**
 * The fiscal years as the kit's points. A year with no amount reported draws no bar; its value
 * is 0 only to the drawing, and every word about it comes from the point it was built from.
 */
function toPoints(years: readonly FiscalYearPoint[]): YearPoint[] {
  return years.map((year) => ({
    year: year.year,
    count: year.amountUsd ?? 0,
    cumulative: 0,
    partial: year.partial,
  }));
}

/**
 * A fiscal year in a sentence: "$1,000,000 awarded", "no amount reported", and if partial. Given
 * the years the totals count (F17), it says whether this one is: "…, counted in the totals".
 */
export function describeFiscalYear(year: FiscalYearPoint, counted?: ReadonlySet<number>): string {
  const amount =
    year.amountUsd === null ? 'no amount reported' : `${formatUsd(year.amountUsd)} awarded`;
  const described = year.partial ? `${amount} so far` : amount;
  if (counted === undefined) return described;
  return `${described}, ${counted.has(year.year) ? 'counted' : 'not counted'} in the totals`;
}

/** A fiscal year's place in the totals, as a table cell and a tooltip row. */
const inTheTotals = (counted: ReadonlySet<number>, year: number): string =>
  counted.has(year) ? 'Counted' : 'Not counted';

/** The column and tooltip row that mark the years counted in the totals. */
const IN_THE_TOTALS = 'In the totals';

export interface FiscalYearChartProps {
  years: readonly FiscalYearPoint[];
  width: number;
  height: number;
  /** The source's name, for the chart's accessible name: "NIH RePORTER". */
  sourceName: string;
  /**
   * The fiscal years the totals count (`GrantDetail.countedYears`, F17): each bar's description
   * and tooltip say whether its year is one. Left out, they say nothing of it.
   */
  counted?: ReadonlySet<number> | undefined;
}

export function FiscalYearChart({
  years,
  width,
  height,
  sourceName,
  counted,
}: FiscalYearChartProps) {
  const byYear = new Map(years.map((year) => [year.year, year]));
  const of = (point: YearPoint): FiscalYearPoint | undefined => byYear.get(point.year);
  return (
    <YearSeriesChart
      points={toPoints(years)}
      width={width}
      height={height}
      label={`The grant’s amount by fiscal year, as ${sourceName} records it`}
      valueAxisLabel="Awarded in the fiscal year"
      xLabel={FISCAL_YEAR_LABEL}
      partialNoun="fiscal year"
      cumulative={false}
      formatValue={formatUsd}
      describeValue={(value, point) => {
        const year = of(point);
        return year === undefined ? formatUsd(value) : describeFiscalYear(year, counted);
      }}
      tooltipValue={(point) => {
        const year = of(point);
        return year === undefined ? formatUsd(point.count) : fiscalYearAmount(year.amountUsd);
      }}
      {...(counted === undefined
        ? {}
        : {
            tooltipRows: (point: YearPoint) => [
              { label: IN_THE_TOTALS, value: inTheTotals(counted, point.year) },
            ],
          })}
      yTickFormat={(value) => formatUsdCompact(Number(value))}
      margin={WIDE_MARGIN}
    />
  );
}

/**
 * The same years as numbers: each year's amount, or "no amount reported". Given the years the
 * totals count (F17), a column marks each "Counted" or "Not counted".
 */
export function FiscalYearTable({
  years,
  sourceName,
  counted,
}: {
  years: readonly FiscalYearPoint[];
  sourceName: string;
  counted?: ReadonlySet<number> | undefined;
}) {
  const sums = years.some((year) => year.amountUsd !== null)
    ? ' The years with an amount add up to its lifetime total.'
    : '';
  const marked =
    counted === undefined
      ? ''
      : ' The years counted in the totals are marked: the site’s totals count only those.';
  return (
    <ChartTable<FiscalYearPoint>
      caption={`The grant’s amount by fiscal year, October to September, named by the year it ends in, as ${sourceName} records it.${sums} A year with no amount reported is not $0.${marked}`}
      rows={years}
      rowKey={(year) => String(year.year)}
      columns={[
        {
          key: 'year',
          header: 'Fiscal year',
          value: (year) => (year.partial ? `${String(year.year)} (partial)` : String(year.year)),
        },
        {
          key: 'amount',
          header: 'Awarded',
          numeric: true,
          value: (year) => fiscalYearAmount(year.amountUsd),
        },
        ...(counted === undefined
          ? []
          : [
              {
                key: 'counted',
                header: IN_THE_TOTALS,
                value: (year: FiscalYearPoint) => inTheTotals(counted, year.year),
              },
            ]),
      ]}
    />
  );
}

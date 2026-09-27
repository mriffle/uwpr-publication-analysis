/**
 * How much of a grant's funding the totals count (docs/09 F17, §7.4): the app's twin of
 * `uwpr_pubs.funding.counting`, line for line.
 *
 * A grant's `amount_usd` is its lifetime total, which can run from long before UWPR began to long
 * after the last paper that lists it. The totals count only the part UWPR could have touched:
 *
 * - **the floor:** nothing from before `from_year`, when UWPR began;
 * - **the ceiling:** nothing after the year of the latest publication listing the grant — under
 *   a filter, the latest publication *shown*, which is why the app computes this at all rather
 *   than reading the exported `counted_usd`, which is unfiltered;
 * - **instruments** (`full_amount_categories`) count in full: bought once and used for years;
 * - **a grant whose funding ended before `from_year`** counts its last `last_years` years;
 * - **a grant that began after its latest listing publication** counts nothing, with that reason;
 * - **an amount with no fiscal years** is counted by its exported `spread_years`, an even spread
 *   the pipeline computed once; one with no end year counts whole. **The spread is never
 *   re-derived here**: the export's is the one both sides read.
 *
 * Pure and in whole dollars (docs/06 B4): no React, no clock, no floats. Every sum is of safe
 * integers, as `dollarTotal` already assumes. The constants come from the export's
 * `funding.counting`, passed in, so the app hard-codes none; the pipeline's cross-check holds this
 * to the exported `counted_usd`, `counted_rule` and `counted_by_year` (funding-crosscheck.test.ts).
 */
import type { CountedRule, FundingCounting, Grant } from '../contract/types';

/** The rules, in the order they are tried: the first that applies decides (docs/09 §7.4). */
export const COUNTED_RULES = [
  'full_amount',
  'undated',
  'ended_before',
  'began_after',
  'window',
] as const satisfies readonly CountedRule[];

/** What the totals count of a grant, and why. Null and null exactly for an unknown amount. */
export interface Counted {
  usd: number | null;
  rule: CountedRule | null;
}

/** A year→dollars record with at least one year; the Python side tests the dict's truth. */
function nonEmpty<T>(
  record: Readonly<Record<string, T>> | null | undefined,
): record is Readonly<Record<string, T>> {
  return record !== null && record !== undefined && Object.keys(record).length > 0;
}

/**
 * The grant's yearly breakdown: its fiscal years (a null year is 0), else its exported
 * `spread_years`, else null. Null too when the amount is unknown. An empty `fiscal_years` counts
 * as absent. A missing `spread_years` — an export older than 1.2 — reads as none.
 */
export function yearly(grant: Grant): Map<number, number> | null {
  if (grant.amount_usd === null) return null;
  const fiscal: Readonly<Record<string, number | null>> | null | undefined = grant.fiscal_years;
  if (nonEmpty(fiscal)) {
    return new Map(Object.entries(fiscal).map(([year, value]) => [Number(year), value ?? 0]));
  }
  const spread: Readonly<Record<string, number>> | null | undefined = grant.spread_years;
  if (nonEmpty(spread)) {
    return new Map(Object.entries(spread).map(([year, value]) => [Number(year), value]));
  }
  return null;
}

/**
 * Whether the grant's yearly breakdown is the pipeline's even spread (`spread_years`) rather than
 * its funder's own years: its counted amount is then an estimate, and is marked as one wherever it
 * is shown. Not in the Python module; it reads the same choice `yearly` makes.
 */
export const isSpread = (grant: Grant): boolean =>
  grant.amount_usd !== null && !nonEmpty(grant.fiscal_years) && nonEmpty(grant.spread_years);

/** The sum of the years' dollars for which `keep` holds. */
function sumOf(years: ReadonlyMap<number, number>, keep: (year: number) => boolean): number {
  let total = 0;
  for (const [year, value] of years) if (keep(year)) total += value;
  return total;
}

/**
 * What the totals count of a grant, and why, given the earliest (`_first`) and latest (`last`)
 * years of the publications listing it. The first rule that applies decides.
 *
 * `_first` changes no amount; it is taken so that this and `awardYears` read the same arguments.
 * An unknown amount counts as unknown: `{usd: null, rule: null}`, never 0.
 */
export function counted(
  grant: Grant,
  _first: number,
  last: number,
  counting: FundingCounting,
): Counted {
  const amount = grant.amount_usd;
  if (amount === null) return { usd: null, rule: null };
  const years = yearly(grant);
  if (counting.full_amount_categories.includes(grant.category)) {
    return { usd: amount, rule: 'full_amount' };
  }
  if (years === null) return { usd: amount, rule: 'undated' };
  const latest = Math.max(...years.keys());
  if (latest < counting.from_year) {
    return {
      usd: sumOf(years, (year) => year > latest - counting.last_years),
      rule: 'ended_before',
    };
  }
  if (Math.min(...years.keys()) > last) return { usd: 0, rule: 'began_after' };
  return {
    usd: sumOf(years, (year) => counting.from_year <= year && year <= last),
    rule: 'window',
  };
}

/**
 * The counted amount by the year it was awarded, clamped into `[from_year, last]`, for the
 * value-over-time chart. Sums to the counted amount; a year with nothing is left out; in year
 * order.
 *
 * - `full_amount`: each year's dollars to that year, except that a year before `from_year` goes
 *   to `first` and a year after `last` to `last`; with no years, all of it to `first`;
 * - `undated` and `ended_before`: all to `first`, for want of a year inside the window;
 * - `began_after`: nothing;
 * - `window`: each year in `[from_year, last]` to itself.
 */
export function awardYears(
  grant: Grant,
  first: number,
  last: number,
  counting: FundingCounting,
): Map<number, number> {
  const { usd, rule } = counted(grant, first, last, counting);
  const years = yearly(grant);
  const allocated = new Map<number, number>();
  if (usd === null || rule === 'began_after') return allocated;
  if (rule === 'full_amount' && years !== null) {
    for (const [year, value] of years) {
      const into = year < counting.from_year ? first : Math.min(year, last);
      allocated.set(into, (allocated.get(into) ?? 0) + value);
    }
  } else if (rule === 'window' && years !== null) {
    for (const [year, value] of years) {
      if (counting.from_year <= year && year <= last) allocated.set(year, value);
    }
  } else {
    allocated.set(first, usd);
  }
  return new Map([...allocated].filter(([, value]) => value !== 0).sort(([a], [b]) => a - b));
}

/**
 * The years of the grant's breakdown whose dollars the counted amount adds up — what a grant
 * page's fiscal-year table marks as counted. Not in the Python module: it is read off the same
 * rule, so the marked years' dollars sum to the counted amount wherever the rule counts by year
 * (`window`, `ended_before`, and `full_amount` with years). Empty for `undated`, `began_after`
 * and an unknown amount.
 */
export function countedYears(
  grant: Grant,
  first: number,
  last: number,
  counting: FundingCounting,
): Set<number> {
  const { rule } = counted(grant, first, last, counting);
  const years = yearly(grant);
  if (years === null || rule === null || rule === 'undated' || rule === 'began_after') {
    return new Set();
  }
  const all = [...years.keys()].sort((a, b) => a - b);
  if (rule === 'full_amount') return new Set(all);
  if (rule === 'ended_before') {
    const latest = Math.max(...all);
    return new Set(all.filter((year) => year > latest - counting.last_years));
  }
  return new Set(all.filter((year) => counting.from_year <= year && year <= last));
}

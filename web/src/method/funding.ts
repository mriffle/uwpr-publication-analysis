/**
 * The facts the method page's funding section states (docs/09 §12.9), over the whole corpus.
 *
 * Every count the section gives is one of two kinds, and each comes from the one place that
 * holds it:
 *
 * - **What happened to the numbers the publications give as funding** is the pipeline's alone:
 *   the `method` block counts distinct (publication, string) pairs by outcome and by how a grant
 *   was reached (docs/09 §11.3). The app cannot recount them, because the export carries the
 *   grants each string became, not the strings.
 * - **What the grants are** — how many carry each flag, each source's basis, the institution-wide
 *   awards — is counted from the grants listed, unfiltered and with institution-wide awards
 *   included, by the same scope the Funding impact view draws (`fundingScope`), so a count here
 *   and a count there cannot disagree. Miscellaneous is counted apart, as everywhere (§4).
 *
 * Null when the export has no funding data (§12.10): the section then says so and states nothing.
 */
import {
  UNFILTERED,
  coverage,
  fundingFigures,
  fundingScope,
  type FundingCoverage,
  type InstitutionWideFigures,
} from '../aggregate/funding';
import { fundingOf } from '../contract/funding';
import type {
  AmountSource,
  ExchangeRates,
  ExportDocument,
  FundingMethod,
  FundingSource,
} from '../contract/types';

export type AmountBasis = AmountSource['basis'];

export interface FundingMethodFacts {
  /** The last full refresh: every amount was read then or later (docs/09 §11.3). */
  asOf: string | null;
  /** The export's `sources[]`, in its order. */
  sources: readonly FundingSource[];
  /** The export's `exchange_rates[]`, in its order. */
  exchangeRates: readonly ExchangeRates[];
  /** The pipeline's counts of (publication, string) pairs. */
  method: FundingMethod;
  /** Every pair the method block counts, whatever it became. */
  strings: number;
  /** Grants listed, their amounts, and the flags the coverage counts (docs/09 §12.5 item 7). */
  grants: FundingCoverage['grants'];
  /** Unmatched numbers, and the publications giving them. */
  miscellaneous: FundingCoverage['miscellaneous'];
  /** Grants listed whose amount is from a USAspending award begun before its records do. */
  startsBeforeFy2008: number;
  /** Grants listed converted from another currency, and how many of those estimated the rate year. */
  converted: number;
  rateYearEstimated: number;
  /** Grants listed with an amount, by the basis of its source (docs/09 §7.1); absent bases omitted. */
  byBasis: ReadonlyMap<AmountBasis, number>;
  /** The institution-wide awards among the grants listed, included, as the summary counts them. */
  institutionWide: InstitutionWideFigures;
}

/** The source a fact comes from, by the contract's id, or undefined when the export has none. */
export const sourceById = (
  facts: Pick<FundingMethodFacts, 'sources'>,
  id: FundingSource['id'],
): FundingSource | undefined => facts.sources.find((source) => source.id === id);

export function fundingMethodFacts(doc: ExportDocument): FundingMethodFacts | null {
  const index = fundingOf(doc);
  if (index === null) return null;

  const scope = fundingScope(doc.works, index, UNFILTERED);
  const listed = scope.grants.filter((entry) => !entry.miscellaneous).map((entry) => entry.grant);
  const covered = coverage(scope);

  const byBasis = new Map<AmountBasis, number>();
  for (const grant of listed) {
    const basis = grant.amount_source?.basis;
    if (basis !== undefined) byBasis.set(basis, (byBasis.get(basis) ?? 0) + 1);
  }

  const converted = listed.filter(
    (grant) =>
      grant.amount_usd !== null &&
      grant.currency !== null &&
      grant.currency.toUpperCase() !== 'USD',
  );

  const { method } = index.funding;
  return {
    asOf: index.funding.as_of,
    sources: index.funding.sources,
    exchangeRates: index.funding.exchange_rates,
    method,
    strings: Object.values(method.strings).reduce((sum, count) => sum + count, 0),
    grants: covered.grants,
    miscellaneous: covered.miscellaneous,
    startsBeforeFy2008: listed.filter((grant) => grant.flags.includes('starts_before_fy2008'))
      .length,
    converted: converted.length,
    rateYearEstimated: converted.filter((grant) => grant.flags.includes('rate_year_estimated'))
      .length,
    byBasis,
    institutionWide: fundingFigures(scope).institutionWide,
  };
}

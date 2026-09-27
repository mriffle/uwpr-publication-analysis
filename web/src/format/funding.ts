/**
 * A grant in words (docs/09 §11.4, §12.11): its type, its tags, its years and its amount, as the
 * grants table, the publication's Funding section and the downloads all say them.
 *
 * One module, so that the table and its CSV cannot tag a grant differently, and so that the
 * honesty rules that govern how an amount reads are kept in one place:
 *
 * - **Unknown is never $0** (rule 3). An amount with no known US-dollar value reads as null here,
 *   and the caller says "not known".
 * - **A converted amount shows its original and the rate year** (rule 5).
 * - **Active grants are marked** (rule 6): their totals still grow.
 */
import type { AmountSource, Grant } from '../contract/types';
import { formatMoney, formatUsd } from './number';

/** docs/09 §11.4's categories as a reader reads them. `center` covers programmes and resources. */
export const CATEGORY_LABELS: Readonly<Record<Grant['category'], string>> = {
  research: 'Research',
  center: 'Centre or programme',
  training: 'Training',
  instrument: 'Instrument',
  contract: 'Contract',
  other: 'Other',
};

/**
 * The tags a grant carries wherever it is listed, in a fixed order. Each changes how its total
 * reads, so each is words, never a colour alone (docs/06 §8):
 *
 * - **unmatched number** — kept in Miscellaneous: no agency, kind or amount is known (§6.11);
 * - **institution-wide** — an award to run a programme for many projects (§4, Appendix B);
 * - **active** — the total still grows (§12.11 rule 6);
 * - **amounts from FY1985** / **FY2008** — the source's amounts begin then, so an older grant's
 *   total misses its earlier years (§11.4's flags);
 * - **not converted** — in a currency no rate table covers, so with no amount in dollars.
 */
export function grantTags(grant: Grant, miscellaneous: boolean): string[] {
  const tags: string[] = [];
  if (miscellaneous) tags.push('unmatched number');
  if (grant.scope === 'institution-wide') tags.push('institution-wide');
  if (grant.flags.includes('active')) tags.push('active');
  if (grant.flags.includes('starts_before_fy1985')) tags.push('amounts from FY1985');
  if (grant.flags.includes('starts_before_fy2008')) tags.push('amounts from FY2008');
  if (grant.flags.includes('unconverted_currency')) tags.push('not converted');
  return tags;
}

/** "2019–2023", "from 2019", "until 2023", or null when the source gives neither year. */
export function grantYears(grant: Pick<Grant, 'start_year' | 'end_year'>): string | null {
  const { start_year: start, end_year: end } = grant;
  if (start === null && end === null) return null;
  if (start === null) return `until ${String(end)}`;
  if (end === null) return `from ${String(start)}`;
  return start === end ? String(start) : `${String(start)}–${String(end)}`;
}

/** "$1,234,567", or null when no amount is known in US dollars — never "$0" (rule 3). */
export const grantAmount = (grant: Pick<Grant, 'amount_usd'>): string | null =>
  grant.amount_usd === null ? null : formatUsd(grant.amount_usd);

/**
 * What an amount in another currency was (rule 5): "converted from SEK 2,000,000 at the 2021
 * rate", or, with no rate to convert it, "SEK 2,000,000, not converted to US dollars". Null for
 * an amount awarded in US dollars, or with no amount at all.
 */
export function originalAmount(
  grant: Pick<Grant, 'amount_usd' | 'amount_original' | 'currency' | 'rate_year' | 'flags'>,
): string | null {
  const { amount_original: amount, currency } = grant;
  if (amount === null || currency === null || currency.toUpperCase() === 'USD') return null;
  const original = formatMoney(amount, currency);
  if (grant.amount_usd === null) return `${original}, not converted to US dollars`;
  if (grant.rate_year === null) return `converted from ${original}`;
  const estimated = grant.flags.includes('rate_year_estimated') ? ' (the rate year estimated)' : '';
  return `converted from ${original} at the ${String(grant.rate_year)} rate${estimated}`;
}

/** Why a grant has no amount, in a clause: what the page may say beside "not known". */
export function unknownAmountReason(grant: Pick<Grant, 'flags' | 'status'>): string {
  if (grant.status === 'unresolved') return 'no funder’s record matched this number';
  if (grant.flags.includes('unconverted_currency')) return 'no exchange rate covers its currency';
  if (grant.flags.includes('no_amount_reported'))
    return 'the funder’s record holds the grant but reports no amount';
  return 'no source read here reports an amount for it';
}

/** The principal investigators as the funder publishes them (rule 9), or null for none. */
export const investigatorNames = (grant: Pick<Grant, 'pis'>): string | null =>
  grant.pis.length === 0 ? null : grant.pis.map((person) => person.name).join('; ');

/**
 * What a lifetime total is, by the basis its source gives it (docs/09 §7.1), as a clause after
 * "the total is": each source adds up a different thing, and the grant page says which.
 */
export const AMOUNT_BASIS_TEXT: Readonly<Record<AmountSource['basis'], string>> = {
  reporter_fiscal_years:
    'the sum of the grant’s award actions over every fiscal year NIH RePORTER holds, its sub-projects left out so that nothing is counted twice',
  reporter_contract: 'the sum of the contract’s line items in NIH RePORTER',
  reporter_task_order: 'the task order’s own total in NIH RePORTER, apart from the larger contract',
  nsf_obligated: 'what NSF obligated to the award',
  nsf_estimated: 'NSF’s estimated total for the award, larger than what it has obligated so far',
  usaspending_obligation: 'the award’s total obligation, as USAspending records it',
  openalex_amount: 'the amount OpenAlex records for the award',
};

/**
 * One fiscal year's amount in words: "$1,000,000", or "no amount reported" for a year whose
 * source rows report none — never "$0" (§12.11 rule 3).
 */
export const fiscalYearAmount = (amount: number | null): string =>
  amount === null ? 'no amount reported' : formatUsd(amount);

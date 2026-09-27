/**
 * The grants table as a CSV (docs/09 §12.5 item 6; docs/06 §7).
 *
 * **Every row the search matches, in the order shown**: the caller passes the array the table
 * draws its rows from — searched and sorted — so the file cannot hold a grant the search left out,
 * or miss one it kept. The table draws the first 50 until asked for all (docs/09 R1b); the file
 * holds them all, and its button says how many. Each
 * cell obeys `csv.ts`: RFC 4180, CRLF, the formula-injection guard, and an unknown value as an
 * empty cell, never 0 — above all the total, where a 0 would be a false figure someone later
 * adds up. Numeric columns carry numbers, so a spreadsheet can sum them.
 *
 * **With a byte-order mark**, because Excel reads a CSV without one in the system's legacy code
 * page, and the investigators, organisations and agencies here are full of accented names.
 */
import { agencyLabel, type ScopedGrant } from '../aggregate/funding';
import type { FundingIndex } from '../contract/funding';
import { CATEGORY_LABELS, grantTags } from '../format/funding';
import { toCsv, type CsvColumn } from './csv';

/** The columns, in order: identity, facts, amount and its provenance, then what the view counts. */
export function grantCsvColumns(index: FundingIndex | null): CsvColumn<ScopedGrant>[] {
  return [
    { header: 'Key', value: (entry) => entry.grant.key },
    { header: 'Number', value: (entry) => entry.grant.number },
    { header: 'Title', value: (entry) => entry.grant.title },
    { header: 'Agency', value: (entry) => agencyLabel(index, entry.grant.agency) },
    { header: 'Agency code', value: (entry) => entry.grant.agency },
    { header: 'Top-level agency', value: (entry) => entry.root },
    {
      header: 'Principal investigators',
      value: (entry) =>
        entry.grant.pis.length === 0
          ? null
          : entry.grant.pis.map((person) => person.name).join('; '),
    },
    { header: 'Organisation', value: (entry) => entry.grant.organization },
    { header: 'Start year', value: (entry) => entry.grant.start_year },
    { header: 'End year', value: (entry) => entry.grant.end_year },
    // An unmatched number is no kind of award (docs/09 §4): an empty cell, as the table's "not known".
    {
      header: 'Type',
      value: (entry) => (entry.miscellaneous ? null : CATEGORY_LABELS[entry.grant.category]),
    },
    {
      header: 'Tags',
      value: (entry) => grantTags(entry.grant, entry.miscellaneous).join('; ') || null,
    },
    { header: 'Total (USD)', value: (entry) => entry.grant.amount_usd },
    { header: 'Original amount', value: (entry) => entry.grant.amount_original },
    { header: 'Original currency', value: (entry) => entry.grant.currency },
    { header: 'Exchange rate year', value: (entry) => entry.grant.rate_year },
    { header: 'Amount source', value: (entry) => entry.grant.amount_source?.name ?? null },
    { header: 'Amount as of', value: (entry) => entry.grant.amount_source?.as_of ?? null },
    { header: 'First listed', value: (entry) => entry.firstYear },
    { header: 'Publications', value: (entry) => entry.works.length },
    { header: 'Link', value: (entry) => entry.grant.url },
  ];
}

/** The CSV of the given rows, in the given order, with a byte-order mark. */
export const grantsCsv = (rows: readonly ScopedGrant[], index: FundingIndex | null): string =>
  toCsv(grantCsvColumns(index), rows, { bom: true });

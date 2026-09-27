/**
 * The orderings and the search of the grants table and the agency table (docs/09 §12.5 items 4
 * and 6), as pure functions over the rows `aggregate/funding.ts` already produced.
 *
 * View state, like the explorer's sort (`explorer.ts`), and **out of the URL** (§12.4): a
 * shared link carries the filter and the institution-wide position, not how a reader last sorted
 * a table. Kept here rather than in the components so that the rule the spec states — **unknown
 * amounts last in both directions** — is tested as arithmetic, and so that the CSV, which must
 * hold exactly the visible rows, is built from the very array the table renders.
 *
 * Every ordering is total: a tie falls back to the grant's key (or, for agencies, to the
 * ranking's own order), so rows never reshuffle between renders.
 */
import type { FundingIndex } from '../contract/funding';
import { countryName } from '../format/country';
import type { SortDirection } from './explorer';
import { agencyLabel, knownAmount, type AgencyRow, type ScopedGrant } from './funding';

/* ------------------------------------------------------------------------------------------------
 * Shared: a value that may be missing, which sorts last whichever way the column runs.
 * --------------------------------------------------------------------------------------------- */

type Cell = string | number | null;

/** Numbers as numbers, text in `en` with its digits read as numbers ("R01GM2" before "R01GM10"). */
function compareCells(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

/**
 * Compare two cells under a direction, **a missing one last in both directions**: reversing the
 * sort reverses the known values and leaves the unknowns at the bottom, where "not known" can
 * never be read as the smallest (or the largest) amount (docs/09 §12.5 item 6, §12.11 rule 3).
 * Zero when both are missing or both equal, so the caller breaks the tie.
 */
function compareMissingLast(a: Cell, b: Cell, direction: SortDirection): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  return (direction === 'asc' ? 1 : -1) * compareCells(a, b);
}

/* ------------------------------------------------------------------------------------------------
 * The grants table.
 * --------------------------------------------------------------------------------------------- */

export const GRANT_SORT_KEYS = [
  'number',
  'title',
  'agency',
  'total',
  'first',
  'publications',
] as const;
export type GrantSortKey = (typeof GRANT_SORT_KEYS)[number];

export interface GrantSort {
  key: GrantSortKey;
  direction: SortDirection;
}

/** Total, largest first (docs/09 §12.5 item 6). */
export const DEFAULT_GRANT_SORT: GrantSort = { key: 'total', direction: 'desc' };

/** Words read A–Z first; totals, years and counts largest (or newest) first. */
export const naturalGrantDirection = (key: GrantSortKey): SortDirection =>
  key === 'number' || key === 'title' || key === 'agency' ? 'asc' : 'desc';

/** The sorted column reverses; another column starts from its natural direction. */
export function toggleGrantSort(current: GrantSort, key: GrantSortKey): GrantSort {
  if (current.key !== key) return { key, direction: naturalGrantDirection(key) };
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

function grantCell(entry: ScopedGrant, key: GrantSortKey, index: FundingIndex | null): Cell {
  switch (key) {
    case 'number':
      return entry.grant.number;
    case 'title':
      return entry.grant.title;
    case 'agency':
      return agencyLabel(index, entry.grant.agency);
    case 'total':
      return entry.grant.amount_usd;
    case 'first':
      return entry.firstYear;
    case 'publications':
      return entry.works.length;
  }
}

/**
 * The rows in the order asked for. **A grant with no known amount sorts after every grant with
 * one, ascending or descending**, and a grant with no title after every titled one; ties fall
 * back to the key, so the order is total.
 */
export function sortGrants(
  rows: readonly ScopedGrant[],
  sort: GrantSort,
  index: FundingIndex | null,
): ScopedGrant[] {
  return [...rows].sort(
    (a, b) =>
      compareMissingLast(
        grantCell(a, sort.key, index),
        grantCell(b, sort.key, index),
        sort.direction,
      ) || (a.grant.key < b.grant.key ? -1 : a.grant.key > b.grant.key ? 1 : 0),
  );
}

/** Case, width and accent forms folded as NFKC and lower case: what a reader types matches. */
const fold = (text: string): string => text.normalize('NFKC').toLowerCase();

/** Letters and digits alone, so "R01 GM-086688" finds "R01GM086688". */
const packed = (text: string): string => fold(text).replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Everything a reader may search a grant by: its number and key, its title, every agency on its
 * chain (so "NIH" finds an institute's grants), its investigators and its organisation.
 */
function grantText(entry: ScopedGrant, index: FundingIndex | null): string {
  const grant = entry.grant;
  const chain = index?.chains.get(grant.agency) ?? [grant.agency];
  const agencies = chain.flatMap((code) => {
    const agency = index?.agencies.get(code);
    return [code, agency?.name ?? '', agency?.short_name ?? ''];
  });
  return fold(
    [
      grant.number,
      grant.key,
      grant.title ?? '',
      ...agencies,
      ...grant.pis.map((person) => person.name),
      grant.organization ?? '',
    ].join('\n'),
  );
}

/**
 * The rows matching a local search: every word of the query must appear somewhere in the grant's
 * text, or — for a number typed with other spacing — in its number or key with the punctuation
 * taken out. An empty query matches every row. **It narrows this table only** (§12.4): it never
 * touches the filter, the publications or any figure.
 */
export function searchGrants(
  rows: readonly ScopedGrant[],
  query: string,
  index: FundingIndex | null,
): ScopedGrant[] {
  const terms = fold(query)
    .split(/\s+/u)
    .filter((term) => term !== '');
  if (terms.length === 0) return [...rows];
  return rows.filter((entry) => {
    const text = grantText(entry, index);
    const number = packed(`${entry.grant.number} ${entry.grant.key}`);
    return terms.every((term) => {
      if (text.includes(term)) return true;
      const bare = packed(term);
      return bare !== '' && number.includes(bare);
    });
  });
}

/* ------------------------------------------------------------------------------------------------
 * The agency table.
 * --------------------------------------------------------------------------------------------- */

export const AGENCY_SORT_KEYS = [
  'agency',
  'parent',
  'country',
  'grants',
  'total',
  'unknown',
  'publications',
] as const;
export type AgencySortKey = (typeof AGENCY_SORT_KEYS)[number];

export interface AgencySort {
  key: AgencySortKey;
  direction: SortDirection;
}

/** Known total, largest first: the ranking's own order (`rankAgencies`, by value). */
export const DEFAULT_AGENCY_SORT: AgencySort = { key: 'total', direction: 'desc' };

export const naturalAgencyDirection = (key: AgencySortKey): SortDirection =>
  key === 'agency' || key === 'parent' || key === 'country' ? 'asc' : 'desc';

export function toggleAgencySort(current: AgencySort, key: AgencySortKey): AgencySort {
  if (current.key !== key) return { key, direction: naturalAgencyDirection(key) };
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

function agencyCell(row: AgencyRow, key: AgencySortKey, index: FundingIndex | null): Cell {
  switch (key) {
    case 'agency':
      return row.label;
    case 'parent':
      return row.parent === null ? null : agencyLabel(index, row.parent);
    case 'country':
      return row.country === null ? null : countryName(row.country);
    case 'grants':
      return row.grants;
    case 'total':
      // Null, not 0, for an agency none of whose grants has a known amount.
      return knownAmount(row);
    case 'unknown':
      return row.withoutAmount;
    case 'publications':
      return row.publications;
  }
}

/**
 * The agencies in the order asked for: an unknown total, a missing parent or country last in
 * both directions. The sort is stable, so ties keep the ranking's order — the other measure,
 * then the label, then the code.
 */
export function sortAgencies(
  rows: readonly AgencyRow[],
  sort: AgencySort,
  index: FundingIndex | null,
): AgencyRow[] {
  return [...rows].sort((a, b) =>
    compareMissingLast(
      agencyCell(a, sort.key, index),
      agencyCell(b, sort.key, index),
      sort.direction,
    ),
  );
}

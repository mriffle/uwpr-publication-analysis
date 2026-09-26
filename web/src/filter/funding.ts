/**
 * Which grants a filtered view shows (docs/09 §12.4, F15).
 *
 * The filter picks publications, and the Funding impact view shows the grants they list. That
 * alone would be wrong the moment an agency is selected: as a pure publication filter,
 * `agency=NSF` keeps a paper that lists NSF *and* NIH grants, and the view would add up NIH's
 * dollars under a heading about NSF. So an agency or grant selection narrows the grants shown as
 * well as the publications — **the scope rule**, which lives here, once, so the figures, the
 * charts, the grants table and the live-region sentence cannot each read it differently.
 *
 * Pure, like the rest of `filter/`: it takes the already filtered works, the funding index and a
 * `GrantSelection`, and returns grants. It never sees a `FilterState` beyond `grantSelection`,
 * so an aggregate built on it is tested as arithmetic over explicit inputs.
 */
import { listingsOf, type FundingIndex } from '../contract/funding';
import type { Grant, GrantListing, Work } from '../contract/types';
import type { FilterState } from './state';

/**
 * Whether institution-wide awards (docs/09 §4, Appendix B) count. **Included by default** (F4):
 * the maintainer's decision, so the default URL carries nothing and a reader who excludes them
 * makes one deliberate, shareable choice (`institution_wide=exclude`, `filter/url.ts`).
 */
export type InstitutionWide = 'include' | 'exclude';

export const DEFAULT_INSTITUTION_WIDE: InstitutionWide = 'include';

/** What the scope rule reads: the funding selections and the institution-wide position. */
export interface GrantSelection {
  /** Selected agency codes; empty means no agency restriction. */
  readonly agencies: readonly string[];
  /** Selected grant keys; empty means no grant restriction. */
  readonly grants: readonly string[];
  readonly institutionWide: InstitutionWide;
}

/**
 * The selection a filter state and the institution-wide position make. The position is view
 * state (`routing/view.ts`), not a filter: it narrows no publication, so it is passed beside the
 * filter rather than kept in it. Left out, it is the default.
 */
export function grantSelection(
  state: FilterState,
  institutionWide: InstitutionWide = DEFAULT_INSTITUTION_WIDE,
): GrantSelection {
  return { agencies: state.agency, grants: state.grant, institutionWide };
}

/** Miscellaneous is found by its `group`, through the index — never by a key (docs/09 §11.5). */
export function isMiscellaneous(grant: Grant, index: FundingIndex): boolean {
  return index.miscellaneous !== null && grant.agency === index.miscellaneous.code;
}

/**
 * Whether one listing's grant is in scope (docs/09 §12.4). Every clause, in the spec's words:
 *
 * - **Restricted to the selected grants** when any are selected.
 * - **Restricted to the selected agencies** when any are selected, by the listing's chain — the
 *   same test the publication predicate applies, so `agency=NIH` keeps every institute's grants
 *   and every grant kept comes from a listing that made its publication match.
 * - **An explicit grant selection overrides the institution-wide toggle**: with a grant selected,
 *   the toggle does not apply, so a selected institution-wide award is shown even while they are
 *   excluded.
 * - **Miscellaneous grants are kept only when no grant is selected and the agency selection, if
 *   any, includes Miscellaneous** — unless the grant is itself selected. The first two clauses
 *   already say as much for valid data; this one is stated by group so that it holds whatever
 *   chain a listing carries. A selected Miscellaneous grant is kept, as a selected
 *   institution-wide award is: read literally, the clause would give a view of the publications
 *   listing an unmatched number with no grant in it (docs/09, Changes since agreement).
 *
 * The two restrictions combine with AND, as dimensions do: `agency=NSF&grant=NIH:…` selects the
 * publications listing both, and shows the grants that are both, which is none.
 */
export function listingInScope(
  listing: GrantListing,
  grant: Grant,
  index: FundingIndex,
  selection: GrantSelection,
): boolean {
  const grantSelected = selection.grants.length > 0;
  if (grantSelected && !selection.grants.includes(grant.key)) return false;

  const agencySelected = selection.agencies.length > 0;
  if (agencySelected && !listing.agencies.some((code) => selection.agencies.includes(code))) {
    return false;
  }

  if (grantSelected) return true;

  if (selection.institutionWide === 'exclude' && grant.scope === 'institution-wide') return false;

  const miscellaneous = index.miscellaneous;
  if (agencySelected && miscellaneous !== null && grant.agency === miscellaneous.code) {
    return selection.agencies.includes(miscellaneous.code);
  }
  return true;
}

/** A work's in-scope listings, each with its grant, looked up once. */
function scoped(
  work: Work,
  index: FundingIndex,
  selection: GrantSelection,
): { listing: GrantListing; grant: Grant }[] {
  const kept: { listing: GrantListing; grant: Grant }[] = [];
  // `listingsOf` keeps only listings whose grant the index holds; the lookup cannot miss.
  for (const listing of listingsOf(work, index)) {
    const grant = index.grants.get(listing.grant);
    if (grant !== undefined && listingInScope(listing, grant, index, selection)) {
      kept.push({ listing, grant });
    }
  }
  return kept;
}

/**
 * A work's listings whose grants are in scope, in the work's order. What a per-publication
 * figure needs — "listed on *K* of *N* publications" counts the works with at least one, and a
 * grant's first year under the filter is the earliest such work's year (docs/09 §4).
 */
export function listingsInScope(
  work: Work,
  index: FundingIndex | null,
  selection: GrantSelection,
): GrantListing[] {
  if (index === null) return [];
  return scoped(work, index, selection).map((entry) => entry.listing);
}

/**
 * **The scope rule** (docs/09 §12.4): the distinct grants listed on the given works — already
 * filtered by the publication predicate — that are in scope under the selection. Each grant
 * appears once however many works list it (§12.11 rule 7), sorted by key, as the export sorts
 * them, so every figure and table built on it is deterministic. None without funding data.
 */
export function grantsInScope(
  works: readonly Work[],
  index: FundingIndex | null,
  selection: GrantSelection,
): Grant[] {
  if (index === null) return [];
  const kept = new Map<string, Grant>();
  for (const work of works) {
    for (const { grant } of scoped(work, index, selection)) kept.set(grant.key, grant);
  }
  // Keys are distinct here, so no two compare equal.
  return [...kept.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

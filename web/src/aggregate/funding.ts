/**
 * Every figure and series of Funding impact (docs/09 §12.5–12.7), and the app's half of the
 * funding cross-check (§11.6, §11.7).
 *
 * Pure (docs/06 B4), and built on the scope rule rather than beside it: which grants a filtered
 * view shows is decided once, in `filter/funding.ts` (`grantsInScope`, `listingsInScope`), and
 * everything here starts from `fundingScope`, which asks it. Each function takes explicit inputs —
 * the filtered works, the funding index, a `GrantSelection`, the export's `period` — and none
 * reads a `FilterState`, so each is tested as arithmetic.
 *
 * **What the figures count, in docs/09's words:**
 *
 * - **A grant is counted once** (§12.11 rule 7), however many works list it, and its **first
 *   year is recomputed under the filter**: the year of the earliest work shown that lists it
 *   (§4). Unfiltered, that is the exported `first_year`, which the cross-check asserts.
 * - **Unknown is never $0** (rule 3). Every dollar figure is a `DollarTotal`: the sum of the
 *   amounts that are known, beside the count of grants whose amount is not. `knownAmount` is
 *   how a view reads one, and it is null, never 0, when no amount is known.
 * - **Miscellaneous is counted apart** (§4). It holds the numbers nothing matched, found by its
 *   `group` (`isMiscellaneous`), so an unmatched number is not known to be a grant of any agency,
 *   kind or value. "Grants listed", every dollar figure and its unknown count, the agencies, the
 *   investigators and organisations, the kinds and the value over time are all over the grants
 *   listed — the ones in scope that are not in Miscellaneous — and the unmatched numbers stand
 *   beside them: `miscellaneous` in the figures and the coverage, their own row in the agency
 *   ranking, and their own pinned series in new grants by agency. A Miscellaneous grant never
 *   has an amount (§6.11, refused otherwise by the validator, §11.7), so nothing is lost.
 * - **The institution-wide position is stated** (rule 4): while they are included, how many
 *   are in view and their value; while they are excluded, how many the exclusion left out and
 *   theirs.
 */
import { listingsOf, type FundingIndex } from '../contract/funding';
import type {
  Agency,
  FundingSource,
  FundingSummary,
  FundingYear,
  Grant,
  GrantListing,
  Investigator,
  Period,
  Work,
} from '../contract/types';
import {
  grantsInScope,
  isMiscellaneous,
  listingsInScope,
  type GrantSelection,
} from '../filter/funding';
import { DEFAULT_SORT, sortWorks } from './explorer';
import { accumulate, type YearPoint } from './series';
import { stackByYear, type YearStack } from './stack';

/**
 * Nothing selected and institution-wide awards included: the unfiltered view, and the
 * convention `funding.summary` is computed under (docs/09 §11.6).
 */
export const UNFILTERED: GrantSelection = { agencies: [], grants: [], institutionWide: 'include' };

/* ------------------------------------------------------------------------------------------------
 * The scope: the grants a view shows, each once, with what the filter changes about it.
 * --------------------------------------------------------------------------------------------- */

export interface ScopedGrant {
  readonly grant: Grant;
  /** The top of its agency's chain (NIH, not NIGMS; docs/09 §4). */
  readonly root: string;
  /** An unmatched number, kept in Miscellaneous: counted apart, never as a grant listed. */
  readonly miscellaneous: boolean;
  /** Its first year under the filter: the year of the earliest work shown that lists it. */
  readonly firstYear: number;
  /** The IDs of the works shown that list it in scope, in the order given. */
  readonly works: readonly string[];
}

export interface FundingScope {
  /** What the scope was read from; null when the export has no funding data. */
  readonly index: FundingIndex | null;
  readonly selection: GrantSelection;
  /** The grants in scope, each once, sorted by key (`grantsInScope`). */
  readonly grants: readonly ScopedGrant[];
  /** *N*: the works given — the publications the filter selected. */
  readonly publications: number;
  /** *K*: works listing at least one grant in scope, Miscellaneous included. */
  readonly withListings: number;
  /** Works listing at least one grant in scope that is not in Miscellaneous. */
  readonly withGrants: number;
  /**
   * The grants the institution-wide exclusion left out: those the `include` position would add.
   * Empty while they are included, and while a grant is selected, since the selection overrides
   * the toggle (docs/09 §12.4).
   */
  readonly leftOut: readonly Grant[];
}

/** An agency's chain as agencies, root first, ending with it; empty for a code the export lacks. */
function chainOf(code: string, index: FundingIndex): Agency[] {
  return (index.chains.get(code) ?? [])
    .map((link) => index.agencies.get(link))
    .filter((link): link is Agency => link !== undefined);
}

/** The root agency of a grant, through the index's chains; its own agency if it has no chain. */
function rootOf(grant: Grant, index: FundingIndex): string {
  return index.chains.get(grant.agency)?.[0] ?? grant.agency;
}

/**
 * The grants a view shows (docs/09 §12.4) and the facts the filter changes: each grant's first
 * year and the works listing it, and how many of the works list anything in scope. `works` are
 * the publications the filter already selected; with no funding data nothing is in scope.
 */
export function fundingScope(
  works: readonly Work[],
  index: FundingIndex | null,
  selection: GrantSelection,
): FundingScope {
  const scope = {
    index,
    selection,
    publications: works.length,
    withListings: 0,
    withGrants: 0,
  };
  if (index === null) return { ...scope, grants: [], leftOut: [] };

  const facts = new Map<string, { firstYear: number; works: string[] }>();
  for (const work of works) {
    const listings = listingsInScope(work, index, selection);
    if (listings.length === 0) continue;
    scope.withListings += 1;
    let identified = false;
    for (const listing of listings) {
      // `listingsInScope` keeps only listings whose grant the index holds.
      const grant = index.grants.get(listing.grant) as Grant;
      identified ||= !isMiscellaneous(grant, index);
      const fact = facts.get(grant.key);
      if (fact === undefined) {
        facts.set(grant.key, { firstYear: work.year, works: [work.id] });
      } else {
        fact.firstYear = Math.min(fact.firstYear, work.year);
        if (fact.works.at(-1) !== work.id) fact.works.push(work.id);
      }
    }
    if (identified) scope.withGrants += 1;
  }

  // The scope rule's own answer is the set and its order; the facts above are the same listings
  // read per work, so every grant it returns has them.
  const grants = grantsInScope(works, index, selection).map((grant): ScopedGrant => {
    const fact = facts.get(grant.key) as { firstYear: number; works: string[] };
    return {
      grant,
      root: rootOf(grant, index),
      miscellaneous: isMiscellaneous(grant, index),
      firstYear: fact.firstYear,
      works: fact.works,
    };
  });

  const kept = new Set(grants.map((entry) => entry.grant.key));
  const leftOut =
    selection.institutionWide === 'exclude'
      ? grantsInScope(works, index, { ...selection, institutionWide: 'include' }).filter(
          (grant) => !kept.has(grant.key),
        )
      : [];

  return { ...scope, grants, leftOut };
}

/** The grants listed: in scope and not in Miscellaneous. */
const listedOf = (scope: FundingScope): ScopedGrant[] =>
  scope.grants.filter((entry) => !entry.miscellaneous);

/* ------------------------------------------------------------------------------------------------
 * Dollars: a known sum beside an unknown count, always together.
 * --------------------------------------------------------------------------------------------- */

export interface DollarTotal {
  /** The sum of the amounts that are known, in whole US dollars: a safe integer. */
  amountUsd: number;
  /** Grants whose amount is known, and so in `amountUsd`. */
  withAmount: number;
  /** Grants with no known amount: counted here, never in `amountUsd` as $0 (§12.11 rule 3). */
  withoutAmount: number;
}

export function dollarTotal(grants: Iterable<Grant>): DollarTotal {
  const total: DollarTotal = { amountUsd: 0, withAmount: 0, withoutAmount: 0 };
  for (const grant of grants) {
    if (grant.amount_usd === null) {
      total.withoutAmount += 1;
    } else {
      total.amountUsd += grant.amount_usd;
      total.withAmount += 1;
    }
  }
  return total;
}

/**
 * A total as a view may print it: the known sum, or null when no amount is known — for no grant
 * at all, or for grants whose every amount is unknown. **Never 0 for "not known"** (§12.11 rule
 * 3); a view shows "not known" or "—" for null, as docs/09 §12.5 says.
 */
export const knownAmount = (total: DollarTotal): number | null =>
  total.withAmount === 0 ? null : total.amountUsd;

/* ------------------------------------------------------------------------------------------------
 * Headline figures (docs/09 §12.5 item 2).
 * --------------------------------------------------------------------------------------------- */

/**
 * Whitespace to Python's `str.split()` that `\s` does not match: the information separators
 * U+001C–U+001F and NEL, U+0085.
 */
const PYTHON_ONLY_WHITESPACE = new Set([0x1c, 0x1d, 0x1e, 0x1f, 0x85]);

/** `\s` less U+FEFF, which `\s` matches and Python does not count as whitespace. */
const WHITESPACE_BUT_BOM = /[^\S\ufeff]+/u;

/**
 * A name as the pipeline keys it (docs/09 §11.6): NFKC, casefolded, whitespace collapsed —
 * `uwpr_pubs.funding.summary.normalised_name`, character for character where it matters.
 * JavaScript has no `casefold`, so the full foldings a name plausibly carries are added to
 * `toLowerCase`: ß (and ẞ, which lowers to ß) to "ss", and final sigma to σ. Whitespace is
 * Python's, which is not quite `\s`.
 */
export function normalisedName(name: string): string {
  const folded = [...name.normalize('NFKC').toLowerCase()]
    .map((char) => (PYTHON_ONLY_WHITESPACE.has(char.charCodeAt(0)) ? ' ' : char))
    .join('')
    .replace(/ß/g, 'ss')
    .replace(/ς/g, 'σ');
  return folded
    .split(WHITESPACE_BUT_BOM)
    .filter((part) => part !== '')
    .join(' ');
}

/**
 * A principal investigator's key (docs/09 §11.6): the funder's `id` when it gives one, else the
 * name normalised. So one person under two spellings, or once with an `id` and once without,
 * counts twice — the method page says so.
 */
export const investigatorKey = (person: Investigator): string =>
  // `||`, not `??`: the pipeline tests the ID's truth, so an empty ID is as absent as a null.
  person.id || normalisedName(person.name);

export interface InstitutionWideFigures extends DollarTotal {
  /**
   * Whether institution-wide awards are in the view and its total: the position is `include`,
   * or a grant is selected, which overrides the toggle (docs/09 §12.4).
   */
  included: boolean;
  /** Included: the institution-wide awards in view. Excluded: those the exclusion left out. */
  grants: number;
}

export interface FundingFigures extends DollarTotal {
  /** Every grant in scope, Miscellaneous included: what the funding sentence counts. */
  grants: number;
  /** Grants listed: in scope and not in Miscellaneous. `withAmount + withoutAmount`. */
  listed: number;
  /** Unmatched numbers in scope, in Miscellaneous: "and *M* more are unmatched numbers". */
  miscellaneous: number;
  /** Distinct root agencies of the grants listed; Miscellaneous is not one (docs/09 §4). */
  agencies: number;
  /** Distinct principal investigators of the grants listed, keyed as §11.6 keys them. */
  investigators: number;
  /** Distinct organisations of the grants listed, by name normalised; a null counts nothing. */
  organizations: number;
  /** *N*: the publications shown. */
  publications: number;
  /** *K*: publications listing a grant in scope, Miscellaneous included. */
  withListings: number;
  /** Publications listing a grant in scope that is not in Miscellaneous. */
  withGrants: number;
  institutionWide: InstitutionWideFigures;
}

/** The headline figures of a scope (docs/09 §12.5 item 2). */
export function fundingFigures(scope: FundingScope): FundingFigures {
  const listed = listedOf(scope).map((entry) => entry.grant);

  const investigators = new Set<string>();
  const organizations = new Set<string>();
  for (const grant of listed) {
    for (const person of grant.pis) investigators.add(investigatorKey(person));
    // Tested for truth, as the pipeline does: a null or empty organisation counts for nothing.
    if (grant.organization) organizations.add(normalisedName(grant.organization));
  }

  const included =
    scope.selection.institutionWide === 'include' || scope.selection.grants.length > 0;
  const wide = included
    ? listed.filter((grant) => grant.scope === 'institution-wide')
    : scope.leftOut;

  return {
    ...dollarTotal(listed),
    grants: scope.grants.length,
    listed: listed.length,
    miscellaneous: scope.grants.length - listed.length,
    agencies: new Set(listedOf(scope).map((entry) => entry.root)).size,
    investigators: investigators.size,
    organizations: organizations.size,
    publications: scope.publications,
    withListings: scope.withListings,
    withGrants: scope.withGrants,
    institutionWide: { included, grants: wide.length, ...dollarTotal(wide) },
  };
}

/* ------------------------------------------------------------------------------------------------
 * Value over time (docs/09 §12.5 item 3; F3, the cumulative rule).
 * --------------------------------------------------------------------------------------------- */

interface FirstYearEntry extends DollarTotal {
  grants: number;
  institutionWide: DollarTotal & { grants: number };
}

/** The grants listed, by their first year under the filter: the cumulative rule's increments. */
function byFirstYear(scope: FundingScope): Map<number, FirstYearEntry> {
  const grouped = new Map<number, Grant[]>();
  for (const entry of listedOf(scope)) {
    const year = grouped.get(entry.firstYear);
    if (year === undefined) grouped.set(entry.firstYear, [entry.grant]);
    else year.push(entry.grant);
  }
  const years = new Map<number, FirstYearEntry>();
  for (const [year, grants] of grouped) {
    const wide = grants.filter((grant) => grant.scope === 'institution-wide');
    years.set(year, {
      ...dollarTotal(grants),
      grants: grants.length,
      institutionWide: { grants: wide.length, ...dollarTotal(wide) },
    });
  }
  return years;
}

/**
 * One year of value entering. `count` is the known dollars of the grants whose first year this
 * is, and `cumulative` their running total, so the publication charts' frame draws it
 * (`YearSeriesChart`); `partial` marks an unfinished publication year (docs/05 §4.2).
 */
export interface FundingYearPoint extends YearPoint {
  /** Grants listed whose first year this is. */
  grants: number;
  /** …of which with a known amount, in `count`. */
  withAmount: number;
  /** …of which with no known amount: not in this year's value, never as $0. */
  withoutAmount: number;
}

export interface CumulativeDollars extends DollarTotal {
  points: FundingYearPoint[];
  /** Grants listed: the sum of every point's `grants`. */
  grants: number;
}

/**
 * docs/09 F3: **each grant's full amount enters in its first year** — under the filter, the year
 * of the first publication shown that lists it, which is a publication year and not an award
 * year. The last point's `cumulative` is exactly the figures' total. Grants with no known amount
 * are counted in the year they enter, beside the value, never in it.
 *
 * The axis spans the export's `period` whatever is shown, as the publication charts' does.
 */
export function cumulativeDollars(scope: FundingScope, period: Period): CumulativeDollars {
  const years = byFirstYear(scope);
  const dollars = new Map([...years].map(([year, entry]) => [year, entry.amountUsd]));
  const first = Math.min(period.first_year, ...years.keys());
  const last = Math.max(period.last_year, ...years.keys());
  const points = accumulate(dollars, first, last, period).map((point): FundingYearPoint => {
    const entry = years.get(point.year);
    return {
      ...point,
      grants: entry?.grants ?? 0,
      withAmount: entry?.withAmount ?? 0,
      withoutAmount: entry?.withoutAmount ?? 0,
    };
  });
  const listed = listedOf(scope);
  return { points, grants: listed.length, ...dollarTotal(listed.map((entry) => entry.grant)) };
}

/* ------------------------------------------------------------------------------------------------
 * By agency: two stacks and a ranking (docs/09 §12.5 items 3 and 4).
 * --------------------------------------------------------------------------------------------- */

/** Single years by default for value by agency, the Total view's frame. */
export const VALUE_BUCKET_YEARS = 1;
/** Three-year buckets by default for new grants by agency, as research areas (docs/05 §7.5). */
export const GRANTS_BUCKET_YEARS = 3;

/** An agency's name as a chart labels it: its short name, else its name, else its code. */
export function agencyLabel(index: FundingIndex | null, code: string): string {
  const agency = index?.agencies.get(code);
  return agency === undefined ? code : (agency.short_name ?? agency.name);
}

const stackOptions = (scope: FundingScope) => ({
  year: (entry: ScopedGrant) => entry.firstYear,
  series: (entry: ScopedGrant) => entry.root,
  label: (code: string) => agencyLabel(scope.index, code),
  pinned: scope.index?.miscellaneous?.code ?? null,
});

/**
 * Value entering each year by root agency: the "By agency" view of value over time. The five
 * largest agencies by known value, then "Other". Miscellaneous would be pinned, but it has no
 * amounts, and an agency whose every amount is unknown has no value to stack — neither is drawn
 * at $0; the chart states the unknown count beside it. Bucket totals sum to the figures' total.
 */
export function valueByAgency(
  scope: FundingScope,
  period: Period,
  options: { bucketYears?: number } = {},
): YearStack {
  return stackByYear(scope.grants, period, {
    ...stackOptions(scope),
    value: (entry) => entry.grant.amount_usd ?? 0,
    bucketYears: options.bucketYears ?? VALUE_BUCKET_YEARS,
  });
}

/**
 * New grants by root agency over time (docs/09 §12.5 item 4): each grant counted once, in its
 * first year. The five agencies with the most grants, **Miscellaneous pinned** — its own series,
 * never one of the five and never folded into "Other" — then "Other". Three-year buckets by
 * default. Bucket totals sum to every grant in scope, Miscellaneous included.
 */
export function newGrantsByAgency(
  scope: FundingScope,
  period: Period,
  options: { bucketYears?: number } = {},
): YearStack {
  return stackByYear(scope.grants, period, {
    ...stackOptions(scope),
    value: () => 1,
    bucketYears: options.bucketYears ?? GRANTS_BUCKET_YEARS,
  });
}

export interface AgencyRow extends DollarTotal {
  /** The agency code: what the agency filter takes, and the agency page's key. */
  code: string;
  /** Its short name, else its name. */
  label: string;
  name: string;
  shortName: string | null;
  parent: string | null;
  country: string | null;
  group: Agency['group'] | null;
  /** Grants in scope under it. */
  grants: number;
  /** Publications shown listing one of them, each once. */
  publications: number;
}

export interface AgencyRanking {
  /** The agencies, by the measure asked for, up to the limit. */
  items: AgencyRow[];
  /** Agencies ranked before the cut; Miscellaneous is not one (docs/09 §4). */
  distinct: number;
  /** `distinct - items.length`: what a chart must say it is not showing. */
  notShown: number;
  /** Miscellaneous, apart from the ranking: its unmatched numbers and their publications. */
  miscellaneous: AgencyRow | null;
}

export type AgencyMeasure = 'value' | 'grants';
/** `root`: NIH with every institute's grants. `agency`: each grant's own, most specific agency. */
export type AgencyLevel = 'root' | 'agency';

function agencyRow(code: string, entries: readonly ScopedGrant[], index: FundingIndex): AgencyRow {
  const agency = index.agencies.get(code);
  const name = agency?.name ?? code;
  const shortName = agency?.short_name ?? null;
  return {
    code,
    label: shortName ?? name,
    name,
    shortName,
    parent: agency?.parent ?? null,
    country: agency?.country ?? null,
    group: agency?.group ?? null,
    grants: entries.length,
    publications: new Set(entries.flatMap((entry) => entry.works)).size,
    ...dollarTotal(entries.map((entry) => entry.grant)),
  };
}

/**
 * docs/09 §12.5 item 4: agencies ranked by known value or by grants, the other measure then the
 * label breaking ties, so the same data always ranks the same way. Root agencies by default,
 * whose bars apply the agency filter; `level: 'agency'` gives each grant's own agency, with its
 * parent, for the table. Up to `limit` (15) with the rest counted; `Infinity` for every one.
 */
export function rankAgencies(
  scope: FundingScope,
  options: { by?: AgencyMeasure; level?: AgencyLevel; limit?: number } = {},
): AgencyRanking {
  const index = scope.index;
  if (index === null) return { items: [], distinct: 0, notShown: 0, miscellaneous: null };
  const by = options.by ?? 'value';
  const level = options.level ?? 'root';
  const limit = options.limit ?? 15;

  const groups = new Map<string, ScopedGrant[]>();
  for (const entry of scope.grants) {
    const code = level === 'root' ? entry.root : entry.grant.agency;
    const group = groups.get(code);
    if (group === undefined) groups.set(code, [entry]);
    else group.push(entry);
  }

  const miscellaneousCode = index.miscellaneous?.code;
  let miscellaneous: AgencyRow | null = null;
  const rows: AgencyRow[] = [];
  for (const [code, entries] of groups) {
    const row = agencyRow(code, entries, index);
    if (code === miscellaneousCode) miscellaneous = row;
    else rows.push(row);
  }

  const measure = (row: AgencyRow) => (by === 'value' ? row.amountUsd : row.grants);
  const other = (row: AgencyRow) => (by === 'value' ? row.grants : row.amountUsd);
  rows.sort(
    (a, b) =>
      measure(b) - measure(a) ||
      other(b) - other(a) ||
      a.label.localeCompare(b.label) ||
      (a.code < b.code ? -1 : 1),
  );
  return {
    items: rows.slice(0, limit),
    distinct: rows.length,
    notShown: Math.max(0, rows.length - limit),
    miscellaneous,
  };
}

/* ------------------------------------------------------------------------------------------------
 * Grant types and coverage (docs/09 §12.5 items 5 and 7).
 * --------------------------------------------------------------------------------------------- */

/** docs/09 §11.4's categories, in the order the chart and table show them — fixed, not ranked. */
export const GRANT_CATEGORIES = [
  'research',
  'center',
  'training',
  'instrument',
  'contract',
  'other',
] as const satisfies readonly Grant['category'][];

export interface GrantKindRow extends DollarTotal {
  category: Grant['category'];
  grants: number;
}

/**
 * The grants listed by category, every category in its fixed order, zeros included. An
 * unmatched number is not known to be a grant of any kind, so Miscellaneous (whose category the
 * export writes as `other`) is left to the figures' own count, not added to "other".
 */
export function grantKinds(scope: FundingScope): GrantKindRow[] {
  const listed = listedOf(scope).map((entry) => entry.grant);
  return GRANT_CATEGORIES.map((category) => {
    const grants = listed.filter((grant) => grant.category === category);
    return { category, grants: grants.length, ...dollarTotal(grants) };
  });
}

/** The root agencies whose grants the pipeline types from their records (docs/09 §11.4). */
const TYPED_ROOTS: ReadonlySet<string> = new Set(['NIH', 'NSF']);

export interface OtherKind {
  /** Grants listed whose category is `other`. */
  grants: number;
  /** …of which under a root agency other than NIH and NSF, whose grants are not typed. */
  untyped: number;
}

/**
 * What "Other" holds (docs/09 §11.4): NIH's grants are typed by activity code and NSF's by
 * programme, and every other agency's are `other` unless its configuration says more. So "Other"
 * is mostly grants whose kind is not known, not a kind of award — 208 of the real export's 748,
 * every one outside NIH and NSF (R1b). Unmatched numbers are no kind at all, and not counted.
 */
export function otherKind(scope: FundingScope): OtherKind {
  const other = listedOf(scope).filter((entry) => entry.grant.category === 'other');
  return {
    grants: other.length,
    untyped: other.filter((entry) => !TYPED_ROOTS.has(entry.root)).length,
  };
}

/**
 * The unmatched numbers a recorded decision kept apart (docs/09 B9), by key: those some listing
 * in the works given reaches through an override. The real export's `MISC:1780131` is one:
 * OpenAlex matched it to an unrelated grant, and an override keeps it out. The rest of
 * Miscellaneous matched no funder's record at all, and a page saying why a number is unmatched
 * must tell the two apart (R1b).
 */
export function keptUnmatched(works: readonly Work[], index: FundingIndex | null): Set<string> {
  const kept = new Set<string>();
  if (index === null) return kept;
  for (const work of works) {
    for (const listing of listingsOf(work, index)) {
      // `listingsOf` keeps only listings whose grant the index holds.
      const grant = index.grants.get(listing.grant) as Grant;
      if (listing.override !== undefined && isMiscellaneous(grant, index)) kept.add(grant.key);
    }
  }
  return kept;
}

export interface FundingCoverage {
  /** The publications shown, split three ways; the three sum to `total`. */
  publications: {
    total: number;
    /** Listing at least one grant in scope that is not in Miscellaneous. */
    withGrant: number;
    /** Listing only unmatched numbers in scope. */
    onlyUnmatched: number;
    /** Listing nothing in scope. */
    none: number;
  };
  /** The grants listed. `withAmount + withoutAmount = listed`. */
  grants: {
    listed: number;
    withAmount: number;
    withoutAmount: number;
    /** In a currency neither rate table covers, so with no amount in dollars. */
    unconverted: number;
    /** NIH's amounts begin at FY1985; these started earlier, so their totals miss years. */
    startsBeforeFy1985: number;
    /** Still active: their totals still grow. */
    active: number;
  };
  /** The unmatched numbers in scope, and the publications listing them. */
  miscellaneous: { grants: number; publications: number };
}

/** docs/09 §12.5 item 7, over the scope, so that it adds up with the figures above it. */
export function coverage(scope: FundingScope): FundingCoverage {
  const listed = listedOf(scope).map((entry) => entry.grant);
  const flagged = (flag: Grant['flags'][number]) =>
    listed.filter((grant) => grant.flags.includes(flag)).length;
  const unmatched = scope.grants.filter((entry) => entry.miscellaneous);
  const total = dollarTotal(listed);
  return {
    publications: {
      total: scope.publications,
      withGrant: scope.withGrants,
      onlyUnmatched: scope.withListings - scope.withGrants,
      none: scope.publications - scope.withListings,
    },
    grants: {
      listed: listed.length,
      withAmount: total.withAmount,
      withoutAmount: total.withoutAmount,
      unconverted: flagged('unconverted_currency'),
      startsBeforeFy1985: flagged('starts_before_fy1985'),
      active: flagged('active'),
    },
    miscellaneous: {
      grants: unmatched.length,
      publications: new Set(unmatched.flatMap((entry) => entry.works)).size,
    },
  };
}

/* ------------------------------------------------------------------------------------------------
 * The agency page and the grant page (docs/09 §12.6, §12.7): whole corpus, not the filter.
 * --------------------------------------------------------------------------------------------- */

export interface AgencyShare extends DollarTotal {
  /** The child agency's code, or the agency's own for the "assigned to no institute" remainder. */
  code: string;
  label: string;
  grants: number;
  publications: number;
}

export interface AgencyDetail {
  agency: Agency;
  /** Root first, ending with the agency itself. */
  chain: Agency[];
  miscellaneous: boolean;
  /** Its grants, across its whole subtree, institution-wide included. */
  scope: FundingScope;
  figures: FundingFigures;
  /** Each child agency with a grant, its whole subtree counted, largest value first. */
  children: AgencyShare[];
  /**
   * "Assigned to no institute": grants whose agency is this one itself, when it has children to
   * be assigned to. Null when it has no children, or when every grant is under one.
   */
  unassigned: AgencyShare | null;
  /** Value over time, as the Funding view draws it; static on the page. */
  overTime: CumulativeDollars;
  /** The publications listing one of its grants, newest first. */
  publications: Work[];
}

function share(code: string, label: string, entries: readonly ScopedGrant[]): AgencyShare {
  return {
    code,
    label,
    grants: entries.length,
    publications: new Set(entries.flatMap((entry) => entry.works)).size,
    ...dollarTotal(entries.map((entry) => entry.grant)),
  };
}

/**
 * One agency over the whole corpus (docs/09 §12.6): pass every exported work, not the filtered
 * ones, since the page states its figures as "not affected by the filter". Institution-wide
 * awards are included. Null for a code the export does not have, or with no funding data.
 */
export function agencyDetail(
  code: string,
  works: readonly Work[],
  index: FundingIndex | null,
  period: Period,
): AgencyDetail | null {
  const agency = index?.agencies.get(code);
  if (index === null || agency === undefined) return null;

  // The scope rule with this agency selected keeps exactly its subtree's grants, by the chain
  // each listing carries — the test the publication predicate applies.
  const scope = fundingScope(works, index, { ...UNFILTERED, agencies: [code] });

  const childCodes = index.children.get(code) ?? [];
  const children = childCodes
    .map((child) =>
      share(
        child,
        agencyLabel(index, child),
        scope.grants.filter((entry) => index.chains.get(entry.grant.agency)?.includes(child)),
      ),
    )
    .filter((row) => row.grants > 0)
    .sort(
      (a, b) => b.amountUsd - a.amountUsd || b.grants - a.grants || a.label.localeCompare(b.label),
    );
  const direct = scope.grants.filter((entry) => entry.grant.agency === code);
  const unassigned =
    childCodes.length > 0 && direct.length > 0
      ? share(code, agencyLabel(index, code), direct)
      : null;

  const listing = new Set(scope.grants.flatMap((entry) => entry.works));
  return {
    agency,
    chain: chainOf(code, index),
    miscellaneous: agency.code === index.miscellaneous?.code,
    scope,
    figures: fundingFigures(scope),
    children,
    unassigned,
    overTime: cumulativeDollars(scope, period),
    publications: sortWorks(
      works.filter((work) => listing.has(work.id)),
      DEFAULT_SORT,
    ),
  };
}

/** One fiscal year of a grant's amount (docs/09 §4: October to September, named by its end). */
export interface FiscalYearPoint {
  year: number;
  /** Null when the source's rows for that year report no amount: "no amount reported", never 0. */
  amountUsd: number | null;
  /** The fiscal year in progress on the source's date: its amount is still growing. */
  partial: boolean;
}

export interface GrantListingEntry {
  work: Work;
  /** How the work lists it, what the paper wrote (`cited_as`) and any `override`. */
  listing: GrantListing;
}

export interface GrantDetail {
  grant: Grant;
  /** Its most specific agency; null only for one the export lacks. */
  agency: Agency | null;
  /** Root first, ending with its agency. */
  chain: Agency[];
  miscellaneous: boolean;
  /** The source its amount comes from, with that source's date and where its amounts begin. */
  source: FundingSource | null;
  /** Its fiscal years in order, or null when the export has none for it (RePORTER only). */
  fiscalYears: FiscalYearPoint[] | null;
  /** RePORTER's fiscal year in progress (`sources[].partial_year`), or null. */
  partialFiscalYear: number | null;
  /** The year of the earliest work listing it; its exported `first_year` on valid data. */
  firstYear: number | null;
  /** The works listing it, newest first, each with its listing. */
  listings: GrantListingEntry[];
}

/**
 * One grant (docs/09 §12.7), over the works given — every exported work, for the page. Null
 * for a key the export does not have, or with no funding data.
 */
export function grantDetail(
  key: string,
  works: readonly Work[],
  index: FundingIndex | null,
): GrantDetail | null {
  const grant = index?.grants.get(key);
  if (index === null || grant === undefined) return null;

  // With the grant selected, the scope rule keeps exactly the listings of it, whatever its
  // scope or agency: a selection overrides the institution-wide toggle (§12.4).
  const selection: GrantSelection = { ...UNFILTERED, grants: [key] };
  const byWork = new Map<string, GrantListing>();
  for (const work of works) {
    const [listing] = listingsInScope(work, index, selection);
    if (listing !== undefined) byWork.set(work.id, listing);
  }
  const listed = sortWorks(
    works.filter((work) => byWork.has(work.id)),
    DEFAULT_SORT,
  );

  const sources = index.funding.sources;
  // Only RePORTER reports by fiscal year, and `fiscal_years` is RePORTER's alone (§11.4).
  const partialFiscalYear =
    sources.find((source) => source.id === 'reporter')?.partial_year ?? null;
  const fiscalYears =
    grant.fiscal_years === null
      ? null
      : Object.entries(grant.fiscal_years)
          .map(([year, amountUsd]) => ({
            year: Number(year),
            amountUsd,
            partial: Number(year) === partialFiscalYear,
          }))
          .sort((a, b) => a.year - b.year);
  const amountSource = grant.amount_source;

  return {
    grant,
    agency: index.agencies.get(grant.agency) ?? null,
    chain: chainOf(grant.agency, index),
    miscellaneous: isMiscellaneous(grant, index),
    source:
      amountSource === null
        ? null
        : (sources.find((source) => source.name === amountSource.name) ?? null),
    fiscalYears,
    partialFiscalYear,
    firstYear: listed.length === 0 ? null : Math.min(...listed.map((work) => work.year)),
    listings: listed.map((work) => ({ work, listing: byWork.get(work.id) as GrantListing })),
  };
}

/* ------------------------------------------------------------------------------------------------
 * The cross-check (docs/06 §12.1, docs/09 §11.6–11.7).
 * --------------------------------------------------------------------------------------------- */

/** The root agency `amount_usd_nih` and `nih_grants` count: the pipeline's own constant. */
export const NIH_ROOT = 'NIH';

/** What `funding.summary` is with no funding data: every count zero, both years null. */
export const noFundingSummary = (): FundingSummary => ({
  grants: 0,
  grants_resolved: 0,
  grants_with_amount: 0,
  grants_unconverted: 0,
  grants_institution_wide: 0,
  agencies: 0,
  investigators: 0,
  organizations: 0,
  amount_usd: 0,
  amount_usd_institution_wide: 0,
  amount_usd_nih: 0,
  nih_grants: 0,
  works_with_grants: 0,
  works_with_listings: 0,
  first_year: null,
  last_year: null,
  by_first_year: {},
});

/**
 * `funding.summary`, recomputed by the app (docs/09 §11.6): unfiltered, institution-wide awards
 * included. **Built from the same functions the views use** — the scope, the figures, the
 * coverage, the agency ranking and the first-year increments of the value over time — so that
 * equality with the pipeline's independent computation checks the definitions the page shows,
 * not a second copy of them. With no funding data, the summary of none.
 */
export function summarizeFunding(
  works: readonly Work[],
  index: FundingIndex | null,
): FundingSummary {
  if (index === null) return noFundingSummary();
  const scope = fundingScope(works, index, UNFILTERED);
  const figures = fundingFigures(scope);
  const nih = rankAgencies(scope, { limit: Infinity }).items.find((row) => row.code === NIH_ROOT);

  const years = [...byFirstYear(scope)].sort((a, b) => a[0] - b[0]);
  const byYear: Record<string, FundingYear> = {};
  for (const [year, entry] of years) {
    byYear[String(year)] = {
      grants: entry.grants,
      grants_institution_wide: entry.institutionWide.grants,
      amount_usd: entry.amountUsd,
      amount_usd_institution_wide: entry.institutionWide.amountUsd,
    };
  }

  return {
    grants: figures.grants,
    grants_resolved: figures.listed,
    grants_with_amount: figures.withAmount,
    grants_unconverted: coverage(scope).grants.unconverted,
    grants_institution_wide: figures.institutionWide.grants,
    agencies: figures.agencies,
    investigators: figures.investigators,
    organizations: figures.organizations,
    amount_usd: figures.amountUsd,
    amount_usd_institution_wide: figures.institutionWide.amountUsd,
    amount_usd_nih: nih?.amountUsd ?? 0,
    nih_grants: nih?.grants ?? 0,
    works_with_grants: figures.withGrants,
    works_with_listings: figures.withListings,
    first_year: years[0]?.[0] ?? null,
    last_year: years.at(-1)?.[0] ?? null,
    by_first_year: byYear,
  };
}

export interface FirstYearDisagreement {
  key: string;
  exported: number | null;
  /** Null for a grant no work lists, which the validator refuses (§11.7). */
  computed: number | null;
}

/**
 * The first-year half of the cross-check (docs/09 §11.7): every grant whose first year,
 * recomputed over the unfiltered works, is not its exported `first_year`. Empty on agreement,
 * and with no funding data.
 */
export function firstYearDisagreements(
  works: readonly Work[],
  index: FundingIndex | null,
): FirstYearDisagreement[] {
  if (index === null) return [];
  const computed = new Map(
    fundingScope(works, index, UNFILTERED).grants.map((entry) => [
      entry.grant.key,
      entry.firstYear,
    ]),
  );
  const disagreements: FirstYearDisagreement[] = [];
  for (const grant of index.grants.values()) {
    const year = computed.get(grant.key) ?? null;
    if (year !== grant.first_year) {
      disagreements.push({ key: grant.key, exported: grant.first_year, computed: year });
    }
  }
  return disagreements;
}

/**
 * The one way the app reads the export's funding data (docs/09).
 *
 * **An export may carry none.** Data and app are published separately (docs/07 O2), so the app
 * meets exports older than itself: for a while after every deploy, and after any rollback of the
 * data. `load.ts` accepts any 1.x export, so a missing funding block reaches the views, and every
 * funding read goes through here so that "this export has no funding data" is one designed state
 * rather than a crash wherever a view first reaches for it. That state has two shapes (docs/09
 * §12.10): a 1.0 export with no `funding` block at all, and a 1.1 export whose block has a null
 * `version`, which is what the pipeline writes while a store holds no funding.
 *
 * **The generated types cannot say this.** They describe contract 1.2, where the block and each
 * work's `grants` are required, and the loader checks only the major version. So the checks here
 * read the document as `unknown` first, and a work's listings are read through `listingsOf`,
 * never off the work. The same goes for 1.2's `funding.counting`, which a 1.0 or 1.1 export
 * lacks: it is read through `countingOf`, and every counted figure is unknown without it.
 *
 * What comes back is an index over the block (docs/09 §11.3–11.5): grants by key, agencies by
 * code, each agency's children and its chain root first, and Miscellaneous — found by its
 * `group`, never by a key, because the key is the pipeline's to choose. Building it tolerates
 * what the pipeline's validator already refuses (docs/09 §11.7): a cycle among the agencies'
 * parents, or a parent that is not there, shortens a chain but never hangs or throws, and a
 * grant that carries the resource's own identifier is dropped. On valid data neither does
 * anything, and the tests hold it to that.
 *
 * **Built once per document** and remembered, so the Router, every view and every aggregate can
 * ask for it without it being passed down, and all of them see the same index.
 */
import type {
  Agency,
  ExportDocument,
  Funding,
  FundingCounting,
  Grant,
  GrantListing,
  Resource,
  Work,
} from './types';

export interface FundingIndex {
  /**
   * The export's block, with `grants` as kept below: sorted by key, as exported, less any the
   * identifier guard dropped. Its `summary`, `method`, `sources` and dates are the pipeline's.
   */
  readonly funding: Funding;
  /** Every kept grant, by key. */
  readonly grants: ReadonlyMap<string, Grant>;
  /** Every agency, by code. */
  readonly agencies: ReadonlyMap<string, Agency>;
  /** Each agency's own children, by code and sorted by code; empty for one with none. */
  readonly children: ReadonlyMap<string, readonly string[]>;
  /**
   * Each agency's chain, root first and ending with the agency itself (`NIGMS` → `["NIH",
   * "NIGMS"]`), the order a listing's `agencies` has. A chain stops below a parent the block
   * does not have, and before an agency it has already passed, so a cycle cannot loop.
   */
  readonly chains: ReadonlyMap<string, readonly string[]>;
  /** The agency whose `group` is `miscellaneous`: where unresolved numbers are kept. */
  readonly miscellaneous: Agency | null;
  /** Keys of grants dropped for carrying the resource's identifier. Empty on valid data. */
  readonly dropped: readonly string[];
}

/** NFKC, upper case, letters and digits only: the normalisation the pipeline's validator uses. */
function lettersAndDigits(text: string): string {
  return text
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function chainOf(code: string, agencies: ReadonlyMap<string, Agency>): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current: Agency | undefined = agencies.get(code);
  while (current !== undefined && !seen.has(current.code)) {
    seen.add(current.code);
    chain.push(current.code);
    current = current.parent === null ? undefined : agencies.get(current.parent);
  }
  return chain.reverse();
}

/**
 * Index an export's funding block.
 *
 * `resource.identifier` is the resource's own award code. docs/09 §6.13 keeps it out of the
 * grants — it is the evidence that a paper counts, not a grant that funded it — and the pipeline
 * refuses an export where it appears (§11.7). A grant whose key or number contains it anyway is
 * left out here, so that a figure never counts the resource as its own funder.
 */
export function buildFundingIndex(
  funding: Funding,
  resource: Pick<Resource, 'identifier'>,
): FundingIndex {
  const resourceCode = lettersAndDigits(resource.identifier);
  const carriesCode = (grant: Grant): boolean =>
    resourceCode !== '' &&
    [grant.key, grant.number].some((text) => lettersAndDigits(text).includes(resourceCode));

  const kept: Grant[] = [];
  const dropped: string[] = [];
  for (const grant of funding.grants) {
    if (carriesCode(grant)) dropped.push(grant.key);
    else kept.push(grant);
  }

  const agencies = new Map<string, Agency>();
  for (const agency of funding.agencies) agencies.set(agency.code, agency);

  const children = new Map<string, string[]>();
  for (const code of agencies.keys()) children.set(code, []);
  for (const agency of agencies.values()) {
    if (agency.parent !== null) children.get(agency.parent)?.push(agency.code);
  }
  for (const list of children.values()) list.sort();

  const chains = new Map<string, readonly string[]>();
  for (const code of agencies.keys()) chains.set(code, chainOf(code, agencies));

  return {
    funding: { ...funding, grants: kept },
    grants: new Map(kept.map((grant) => [grant.key, grant])),
    agencies,
    children,
    chains,
    miscellaneous: funding.agencies.find((agency) => agency.group === 'miscellaneous') ?? null,
    dropped,
  };
}

/** One index per document object, dropped with it. */
const indexes = new WeakMap<ExportDocument, FundingIndex | null>();

function readFunding(doc: ExportDocument): Funding | null {
  const value: unknown = (doc as { funding?: unknown }).funding;
  if (typeof value !== 'object' || value === null) return null;
  const block = value as Partial<Record<keyof Funding, unknown>>;
  if (block.version === null || block.version === undefined) return null;
  if (!Array.isArray(block.grants) || !Array.isArray(block.agencies)) return null;
  return value as Funding;
}

/**
 * The export's funding, indexed, or null when this export has no funding data: a 1.0 export with
 * no block, a block whose `version` is null, or one without its `grants` or `agencies`. Built
 * once per document.
 */
export function fundingOf(doc: ExportDocument): FundingIndex | null {
  if (indexes.has(doc)) return indexes.get(doc) ?? null;
  const funding = readFunding(doc);
  const index = funding === null ? null : buildFundingIndex(funding, doc.resource);
  indexes.set(doc, index);
  return index;
}

/**
 * A work's grant listings (docs/09 §11.2), as the index knows them: none when the export has no
 * funding data — a 1.0 work has no `grants` at all — and none naming a grant the index does not
 * hold, which on valid data is none.
 */
export function listingsOf(work: Work, index: FundingIndex | null): readonly GrantListing[] {
  if (index === null) return [];
  const listings: unknown = (work as { grants?: unknown }).grants;
  if (!Array.isArray(listings)) return [];
  return (listings as GrantListing[]).filter((listing) => index.grants.has(listing.grant));
}

/**
 * The counting rule's constants (docs/09 F17, §7.4), or null when the export has none: no funding
 * data, or an export older than contract 1.2 (a 1.1 export, or a rollback of the data), whose
 * block has no `funding.counting` whatever the generated types say. Without them every counted
 * amount is unknown and every counted total 0 (`aggregate/funding.ts`); nothing throws.
 */
export function countingOf(index: FundingIndex | null): FundingCounting | null {
  if (index === null) return null;
  const value: unknown = (index.funding as { counting?: unknown }).counting;
  if (typeof value !== 'object' || value === null) return null;
  const block = value as Partial<Record<keyof FundingCounting, unknown>>;
  if (
    !Number.isInteger(block.from_year) ||
    !Number.isInteger(block.last_years) ||
    !Array.isArray(block.full_amount_categories)
  ) {
    return null;
  }
  return value as FundingCounting;
}

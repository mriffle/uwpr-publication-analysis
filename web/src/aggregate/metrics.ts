/**
 * Every metric in docs/05 §5, as a pure function over the exported rows.
 *
 * docs/06 B4: "All aggregation is pure functions in a layer of its own, with no React in it."
 * Nothing here reads the `summary` block — the app recomputes from rows so that every figure
 * responds to the filter (docs/05 §1.1), and `summarize()` reproduces the block exactly so that
 * the unfiltered case can be checked against the pipeline's independent computation (§1.2).
 *
 * The definitions are quoted from docs/05 §5 where they are not obvious. Each measured value is
 * the figure over the real store on 2026-09-20; the sample export's figures are smaller and the
 * tests read them from whichever export is loaded rather than hard-coding either.
 */
import type { Summary, Work } from '../contract/types';
import { distinct, mean, median, round4 } from './numeric';

/** "Count of works. A preprint and its journal article count once." (339) */
export const publications = (works: readonly Work[]): number => works.length;

/** "First and last publication year of a canonical record." (2008–2026) */
export function yearSpan(works: readonly Work[]): { first: number; last: number } | null {
  if (works.length === 0) return null;
  let first = Infinity;
  let last = -Infinity;
  for (const work of works) {
    if (work.year < first) first = work.year;
    if (work.year > last) last = work.year;
  }
  return { first, last };
}

/** "Sum over works" of OpenAlex `cited_by` on the canonical record. (29,575) */
export const totalCitations = (works: readonly Work[]): number =>
  works.reduce((sum, work) => sum + work.citations.total, 0);

/**
 * Citations falling inside OpenAlex's by-year window, which opens in 2012. (29,117)
 * The difference from `totalCitations` is `period.citations_before_window` — 458 citations that
 * predate the window, which docs/05 §7.3 requires the page to state rather than leave as an
 * unexplained discrepancy between two charts.
 */
export const citationsInWindow = (works: readonly Work[]): number =>
  works.reduce(
    (sum, work) => sum + Object.values(work.citations.by_year).reduce((a, b) => a + b, 0),
    0,
  );

/** "Citations received in year Y: sum of each work's citations received in Y." */
export function citationsInYear(works: readonly Work[], year: number): number {
  const key = String(year);
  return works.reduce((sum, work) => sum + (work.citations.by_year[key] ?? 0), 0);
}

/** The non-null field-weighted impacts; 323 of 339 works have one. */
const fwciValues = (works: readonly Work[]): number[] =>
  works.map((work) => work.citations.fwci).filter((value): value is number => value !== null);

/** "Reported as the median over works that have one." (median 2.68) */
export function fwciMedian(works: readonly Work[]): number | null {
  const value = median(fwciValues(works));
  return value === null ? null : round4(value);
}

/** Exported alongside the median, and deliberately not shown: one work at 345 drags it (§2.2). */
export function fwciMean(works: readonly Work[]): number | null {
  const value = mean(fwciValues(works));
  return value === null ? null : round4(value);
}

/**
 * "OpenAlex percentile within field and year. Detail view only." (median 0.901)
 * Not a headline figure: half the corpus sits at or above the 90th percentile, which is an
 * artifact of OpenAlex's denominator rather than a fact about this corpus (docs/05 §2.2).
 */
export function percentileMedian(works: readonly Work[]): number | null {
  return median(
    works
      .map((work) => work.citations.percentile)
      .filter((value): value is number => value !== null),
  );
}

/** "Largest h with h works cited at least h times." (83) */
export function hIndex(works: readonly Work[]): number {
  const ordered = works.map((work) => work.citations.total).sort((a, b) => b - a);
  let h = 0;
  for (const [index, count] of ordered.entries()) if (count >= index + 1) h += 1;
  return h;
}

/** "Works whose canonical record has an open-access status other than `closed`." (307) */
export const openAccessCount = (works: readonly Work[]): number =>
  works.filter((work) => work.oa.status !== 'closed').length;

/** The share the same count expresses, over all works. (91%) */
export function openAccessShare(works: readonly Work[]): number | null {
  return works.length === 0 ? null : openAccessCount(works) / works.length;
}

/**
 * "Distinct venues, keyed by ISSN-L where present, else by name. Preprint servers are venues and
 * are counted as such." (130)
 */
export const journalKey = (work: Work): string | null =>
  work.venue === null ? null : (work.venue.issn_l ?? work.venue.name);

export const distinctJournals = (works: readonly Work[]): number => distinct(works, journalKey);

/**
 * "Distinct ROR IDs across all authors of all works. A floor, and labelled as one: 898 of 4,907
 * affiliation strings carry no ROR ID." (243)
 */
export const distinctInstitutions = (works: readonly Work[]): number =>
  distinct(
    works.flatMap((work) => work.institutions),
    (institution) => institution.ror,
  );

/** "Distinct countries across ROR-resolved affiliations. Same floor caveat." (34) */
export const distinctCountries = (works: readonly Work[]): number =>
  distinct(
    works.flatMap((work) => work.countries),
    (country) => country,
  );

/**
 * "Distinct corresponding authors, by OpenAlex ID. A proxy, and labelled as one: 283 of 339
 * works mark a corresponding author, and a group may publish under several." (215)
 */
export const researchGroups = (works: readonly Work[]): number =>
  distinct(
    works.flatMap((work) => work.corresponding_authors),
    // Falls back to the name where OpenAlex has no ID for the author, exactly as the pipeline
    // does; `||` rather than `??` because an empty ID is as absent as a missing one.
    (person) => person.openalex || person.name,
  );

/** "Distinct last authors is exported as a second view." (155) */
export const distinctLastAuthors = (works: readonly Work[]): number =>
  distinct(
    works.map((work) => work.authors.at(-1)).filter((author) => author !== undefined),
    (author) => author.openalex || author.name,
  );

/**
 * "Works with at least one author identified as UWPR staff. Reported on the method page, never
 * as evidence — staff co-authorship alone never includes a paper (D2)." (104)
 */
export const worksWithStaffAuthor = (works: readonly Work[]): number =>
  works.filter((work) => work.staff_authors.length > 0).length;

/** "Works whose evidence includes the site listing." (306) */
export const onOfficialList = (works: readonly Work[]): number =>
  works.filter((work) => work.on_official_list).length;

/** "Works included on evidence but absent from UWPR's own list." (33) */
export const beyondOfficialList = (works: readonly Work[]): number =>
  works.filter((work) => !work.on_official_list).length;

/** "Works with no journal version yet." (14) */
export const preprintOnly = (works: readonly Work[]): number =>
  works.filter((work) => work.is_preprint).length;

/**
 * The `summary` block, recomputed from the rows.
 *
 * This is the function docs/06 §12.1's cross-check targets: over the unfiltered corpus it must
 * equal the block the pipeline wrote, field for field. "A mismatch is a bug in one of the two,
 * and the test says which."
 */
export function summarize(works: readonly Work[]): Summary {
  const span = yearSpan(works);
  return {
    publications: publications(works),
    first_year: span?.first ?? 0,
    last_year: span?.last ?? 0,
    citations: totalCitations(works),
    citations_in_window: citationsInWindow(works),
    fwci_median: fwciMedian(works),
    fwci_mean: fwciMean(works),
    h_index: hIndex(works),
    open_access: openAccessCount(works),
    journals: distinctJournals(works),
    institutions: distinctInstitutions(works),
    countries: distinctCountries(works),
    research_groups: researchGroups(works),
    last_authors: distinctLastAuthors(works),
    on_official_list: onOfficialList(works),
    beyond_official_list: beyondOfficialList(works),
    preprint_only: preprintOnly(works),
  };
}

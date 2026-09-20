/**
 * The ranked-category series of docs/05 §7.6 to §7.9, §7.13 and §7.14 — every chart that is a
 * horizontal bar of "the things that appear most often".
 *
 * They share one shape, `RankedList`, because they share one honesty problem: the tail is long
 * and thin, so every one of them shows a top *n* and has to say how much it is not showing.
 * docs/05 §7.8 states it for institutions ("the chart shows the top 15 and states how many
 * institutions are not shown"); the same reasoning applies to journals, researchers and
 * subfields, so the count of what is omitted is part of the returned value rather than something
 * each chart works out for itself.
 *
 * Pure (docs/06 B4): no React, no rendering, no colour.
 */
import type { Work } from '../contract/types';
import { authorKey } from '../filter/predicate';

export interface RankedItem {
  /** The value a click puts into the filter: a ROR ID, an OpenAlex author ID, a venue key. */
  key: string;
  /** What the reader sees. */
  label: string;
  /** Works, counted once each — never once per author or once per affiliation (docs/05 §4.3). */
  count: number;
}

export interface RankedList<T extends RankedItem = RankedItem> {
  items: T[];
  /** Distinct values before the top-*n* cut, and after any deliberate exclusion. */
  distinct: number;
  /** `distinct - items.length`: what the chart must state it is not showing. */
  notShown: number;
  /** The works the ranking was computed over, which is the denominator of any share. */
  works: number;
}

/** Descending by count, then by label, so the same data always ranks the same way. */
function rank<T extends RankedItem>(items: T[], limit: number, works: number): RankedList<T> {
  const ordered = [...items].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return {
    items: ordered.slice(0, limit),
    distinct: ordered.length,
    notShown: Math.max(0, ordered.length - limit),
    works,
  };
}

/** Count works once per distinct key, collecting the first label seen for each. */
function tally(
  works: readonly Work[],
  keysOf: (work: Work) => Iterable<{ key: string; label: string }>,
): Map<string, RankedItem> {
  const counts = new Map<string, RankedItem>();
  for (const work of works) {
    const seen = new Set<string>();
    for (const { key, label } of keysOf(work)) {
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { key, label, count: 1 });
    }
  }
  return counts;
}

/**
 * The one institution, or country, that is on so many works that charting it flattens everything
 * else (docs/05 §7.8: the University of Washington "appears on 316 of 339 works and would flatten
 * the chart to one bar and a fringe"; §7.14: "the United States appears on 322 of 339 works").
 *
 * **It is derived, not named.** The contract carries no "home institution" or "home country"
 * field, and docs/05 §1.1 principle 5 forbids the app holding UWPR knowledge of its own, so the
 * dominant value is found in the data: the most frequent one, when it is on more than half the
 * works. The chart then states which value it excluded and why, in terms of the number that
 * justified it, rather than asserting a fact about the resource that the file never told it.
 */
export const DOMINANCE_THRESHOLD = 0.5;

export function dominant(
  counts: ReadonlyMap<string, RankedItem>,
  works: number,
): RankedItem | null {
  if (works === 0) return null;
  let best: RankedItem | null = null;
  for (const item of counts.values()) {
    if (
      best === null ||
      item.count > best.count ||
      (item.count === best.count && item.label < best.label)
    ) {
      best = item;
    }
  }
  return best !== null && best.count / works > DOMINANCE_THRESHOLD ? best : null;
}

const institutionEntries = (work: Work) =>
  work.institutions.map((institution) => ({
    key: institution.ror,
    label: institution.name ?? institution.ror,
  }));

/** The institution the institution chart excludes, taken from the **unfiltered** corpus. */
export const dominantInstitution = (works: readonly Work[]): RankedItem | null =>
  dominant(tally(works, institutionEntries), works.length);

const countryEntries = (work: Work) =>
  work.countries.map((country) => ({ key: country, label: country }));

/** The country the geography section counts "outside", taken from the **unfiltered** corpus. */
export const dominantCountry = (works: readonly Work[]): RankedItem | null =>
  dominant(tally(works, countryEntries), works.length);

/**
 * docs/05 §7.8: institutions, "excluding the University of Washington … The tail is long and
 * thin, so the chart shows the top 15 and states how many institutions are not shown."
 */
export function rankInstitutions(
  works: readonly Work[],
  options: { exclude?: string | null; limit?: number } = {},
): RankedList {
  const { exclude = null, limit = 15 } = options;
  const counts = tally(works, institutionEntries);
  if (exclude !== null) counts.delete(exclude);
  return rank([...counts.values()], limit, works.length);
}

export interface JournalItem extends RankedItem {
  /**
   * docs/05 §7.9: "Preprint servers appear here and are labelled as such — bioRxiv is currently
   * among the most frequent venues with 12, which is a fact about how the corpus is built and
   * should not be hidden."
   *
   * A venue is read as a preprint server when every work it carries is a preprint. Nothing in
   * the contract names preprint servers, and nothing needs to: a preprint-only work's canonical
   * record *is* the preprint, so its venue is the server.
   */
  preprintServer: boolean;
}

/** docs/05 §7.9: the most frequent venues, with the distinct total (130 over the whole corpus). */
export function rankJournals(works: readonly Work[], limit = 15): RankedList<JournalItem> {
  const counts = new Map<string, JournalItem>();
  for (const work of works) {
    if (work.venue === null) continue;
    const key = work.venue.issn_l ?? work.venue.name;
    const preprint = work.kind === 'preprint';
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      existing.preprintServer = existing.preprintServer && preprint;
    } else {
      counts.set(key, { key, label: work.venue.name, count: 1, preprintServer: preprint });
    }
  }
  return rank([...counts.values()], limit, works.length);
}

export interface ResearcherItem extends RankedItem {
  /** The staff identifier from `authors[].staff`, or `null` for anyone else. */
  staff: string | null;
}

/**
 * docs/05 §7.7: researchers appearing most often.
 *
 * "**Default to non-staff researchers, and mark staff distinctly where shown.** A staff member on
 * 60 papers and an external investigator on 37 are different facts — the first describes staff
 * contribution, the second describes sustained use of the facility — and a single
 * undifferentiated ranking conflates them."
 *
 * Identity is the OpenAlex ID, falling back to the name for the 2% of slots without one — the
 * same key the author filter and the chips use, so a click and a chip always name one person.
 */
export function rankResearchers(
  works: readonly Work[],
  options: { includeStaff?: boolean; limit?: number } = {},
): RankedList<ResearcherItem> {
  const { includeStaff = false, limit = 15 } = options;
  const counts = new Map<string, ResearcherItem>();
  for (const work of works) {
    const seen = new Set<string>();
    for (const person of work.authors) {
      const key = authorKey(person);
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
        // Staff membership is a property of the person, not of one authorship slot: if any row
        // marks them, the chart marks them.
        existing.staff ??= person.staff;
      } else {
        counts.set(key, { key, label: person.name, count: 1, staff: person.staff });
      }
    }
  }
  const items = [...counts.values()].filter((item) => includeStaff || item.staff === null);
  return rank(items, limit, works.length);
}

/**
 * docs/05 §7.6: research areas overall at the **subfield** level, "which is the level dense
 * enough to be informative: 46 distinct values, led by Spectroscopy (97 works)".
 *
 * A work is counted once per distinct subfield it touches, not once per topic: this chart asks
 * how many *publications* are in an area, unlike §7.5's, whose unit is the topic assignment.
 */
export const rankSubfields = (works: readonly Work[], limit = 15): RankedList =>
  rank(
    [
      ...tally(works, (work) =>
        work.topics.map((topic) => ({ key: topic.subfield, label: topic.subfield })),
      ).values(),
    ],
    limit,
    works.length,
  );

/**
 * docs/05 §7.14: geography.
 *
 * "A choropleth is not recommended for v1 — it would be one saturated country and a scattering,
 * which conveys less than a sentence does." What the data supports is the count of works with an
 * author outside the dominant country (82 of 339) and a short bar of the others.
 */
export const rankCountries = (
  works: readonly Work[],
  options: { exclude?: string | null; limit?: number } = {},
): RankedList => {
  const { exclude = null, limit = 10 } = options;
  const counts = tally(works, countryEntries);
  if (exclude !== null) counts.delete(exclude);
  return rank([...counts.values()], limit, works.length);
};

/** Works with at least one author outside `country`; the whole corpus when it is null. */
export const worksOutside = (works: readonly Work[], country: string | null): number =>
  country === null
    ? works.length
    : works.filter((work) => work.countries.some((code) => code !== country)).length;

export interface CriterionBar extends RankedItem {
  criterion: number;
}

export interface CriteriaBars {
  items: CriterionBar[];
  works: number;
  /** The sum of the bars, which exceeds `works` and which the chart has to say exceeds it. */
  total: number;
  /** Works satisfying more than one criterion: 224 of 339 (docs/05 §7.13). */
  overlapping: number;
}

/**
 * docs/05 §7.13: how each publication is known. **A bar chart, not a pie.**
 *
 * "These overlap by design — 224 of 339 works satisfy more than one — so the bars sum to more
 * than 339 and the chart must say so. A pie chart would assert a partition that does not exist."
 *
 * `labels` comes from the app's plain-language names for the four criteria (docs/05 §11.7); this
 * function takes them rather than holding them, so the same strings serve the chart and the
 * filter chips.
 */
export function criteriaBars(
  works: readonly Work[],
  labels: Readonly<Record<number, string>>,
): CriteriaBars {
  const counts = new Map<number, number>();
  let overlapping = 0;
  for (const work of works) {
    for (const criterion of work.criteria) counts.set(criterion, (counts.get(criterion) ?? 0) + 1);
    if (work.criteria.length > 1) overlapping += 1;
  }
  const items = [...counts.entries()]
    .map(([criterion, count]) => ({
      criterion,
      key: String(criterion),
      label: labels[criterion] ?? `Criterion ${String(criterion)}`,
      count,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return {
    items,
    works: works.length,
    total: items.reduce((sum, item) => sum + item.count, 0),
    overlapping,
  };
}

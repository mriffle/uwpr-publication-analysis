/**
 * Turning filter state into a predicate over the exported rows (docs/06 §6).
 *
 * "Filters are combined with AND across dimensions and OR within one — two selected journals
 * mean either, a journal and a year mean both."
 */
import type { Work } from '../contract/types';
import type { FilterState } from './state';

/** The journal key, identical to the one `aggregate/metrics.ts` counts distinct venues by. */
function journalKey(work: Work): string | null {
  return work.venue === null ? null : (work.venue.issn_l ?? work.venue.name);
}

/** The author key, identical to the one the researcher chart groups by. */
export function authorKey(author: { openalex: string | null; name: string }): string {
  return author.openalex || author.name;
}

function anyOf<T>(selected: readonly T[], values: Iterable<T>): boolean {
  if (selected.length === 0) return true;
  for (const value of values) if (selected.includes(value)) return true;
  return false;
}

/**
 * docs/06 §4.8: the explorer's box "filters on title, author and venue". Case-insensitive
 * substring, which is what a reader typing half a surname expects.
 */
function matchesSearch(work: Work, needle: string): boolean {
  const term = needle.trim().toLowerCase();
  if (term === '') return true;
  if (work.title.toLowerCase().includes(term)) return true;
  if (work.venue !== null && work.venue.name.toLowerCase().includes(term)) return true;
  return work.authors.some((author) => author.name.toLowerCase().includes(term));
}

export function matches(work: Work, state: FilterState): boolean {
  if (!anyOf(state.year, [work.year])) return false;
  if (
    !anyOf(
      state.domain,
      work.topics.map((topic) => topic.domain),
    )
  )
    return false;
  if (
    !anyOf(
      state.field,
      work.topics.map((topic) => topic.field),
    )
  )
    return false;
  if (
    !anyOf(
      state.subfield,
      work.topics.map((topic) => topic.subfield),
    )
  )
    return false;
  if (
    !anyOf(
      state.topic,
      work.topics.map((topic) => topic.topic),
    )
  )
    return false;

  if (state.journal.length > 0) {
    const key = journalKey(work);
    if (key === null || !state.journal.includes(key)) return false;
  }

  if (
    !anyOf(
      state.institution,
      work.institutions.map((institution) => institution.ror),
    )
  ) {
    return false;
  }
  if (!anyOf(state.country, work.countries)) return false;
  if (!anyOf(state.author, work.authors.map(authorKey))) return false;
  if (!anyOf(state.oa, [work.oa.status])) return false;

  // docs/05 §9 lists Kind as `kind` *and* `is_preprint`. They agree today — a preprint-only
  // work's canonical record is the preprint — but the flag is what Phase 1 §1 requires the label
  // to follow, so selecting "preprint" means either.
  if (state.kind.length > 0) {
    const preprint = state.kind.includes('preprint') && work.is_preprint;
    if (!preprint && !state.kind.includes(work.kind)) return false;
  }

  if (!anyOf(state.criterion, work.criteria)) return false;
  if (state.onOfficialList !== null && work.on_official_list !== state.onOfficialList) return false;

  return matchesSearch(work, state.search);
}

export const buildPredicate =
  (state: FilterState) =>
  (work: Work): boolean =>
    matches(work, state);

export const applyFilter = (works: readonly Work[], state: FilterState): Work[] =>
  works.filter((work) => matches(work, state));

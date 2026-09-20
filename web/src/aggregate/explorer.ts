/**
 * The publication explorer's ordering (docs/06 §4.8: "Sortable by year, citations and title").
 *
 * View state, but pure view state: an ordering is a function of the rows and a key, and keeping
 * it here means the URL encoding, the column headers and the list all agree by construction
 * rather than by three separate implementations.
 */
import type { Work } from '../contract/types';

export const SORT_KEYS = ['year', 'citations', 'title'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = 'asc' | 'desc';

export interface Sort {
  key: SortKey;
  direction: SortDirection;
}

/** Newest first: the question a reader opens this list with is "what is recent?". */
export const DEFAULT_SORT: Sort = { key: 'year', direction: 'desc' };

/** Year and citations read most usefully descending; a title reads most usefully A–Z. */
export const naturalDirection = (key: SortKey): SortDirection => (key === 'title' ? 'asc' : 'desc');

export const isSortKey = (value: string): value is SortKey =>
  (SORT_KEYS as readonly string[]).includes(value);

/**
 * Clicking the column that is already sorted reverses it; clicking another starts from that
 * column's natural direction.
 */
export function toggleSort(current: Sort, key: SortKey): Sort {
  if (current.key !== key) return { key, direction: naturalDirection(key) };
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

/**
 * Every comparison falls back to the title and then to the work ID, so the list is a total order
 * and never reshuffles between renders — citation counts refresh weekly and ties are common.
 */
function compare(a: Work, b: Work, key: SortKey): number {
  switch (key) {
    case 'year':
      return a.year - b.year;
    case 'citations':
      return a.citations.total - b.citations.total;
    case 'title':
      return a.title.localeCompare(b.title);
  }
}

export function sortWorks(works: readonly Work[], sort: Sort): Work[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...works].sort(
    (a, b) =>
      sign * compare(a, b, sort.key) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
  );
}

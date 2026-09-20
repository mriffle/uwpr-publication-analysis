/**
 * The filter state (docs/06 §6, dimensions from docs/05 §9).
 *
 * Pure: no React, no URL, no rendering. "One filter state drives every figure, every chart and
 * the explorer." Filters combine with AND across dimensions and OR within one — two selected
 * journals mean either, a journal and a year mean both.
 */

/** The multi-select dimensions whose values are strings. */
export const STRING_DIMENSIONS = [
  'domain',
  'field',
  'subfield',
  'topic',
  'journal',
  'institution',
  'country',
  'author',
  'oa',
  'kind',
] as const;

export type StringDimension = (typeof STRING_DIMENSIONS)[number];

export interface FilterState {
  /** docs/05 §9: `year`, 2008–2026. */
  readonly year: readonly number[];
  /** Research area at all four levels, from `topics`. */
  readonly domain: readonly string[];
  readonly field: readonly string[];
  readonly subfield: readonly string[];
  readonly topic: readonly string[];
  /** `venue`, keyed by ISSN-L where present, else by name — the same key the metrics count. */
  readonly journal: readonly string[];
  /** Work-level `institutions`, by ROR ID. */
  readonly institution: readonly string[];
  /** Work-level `countries`. */
  readonly country: readonly string[];
  /** `authors[].openalex`, falling back to the name where OpenAlex has no ID. */
  readonly author: readonly string[];
  /** `oa.status`. */
  readonly oa: readonly string[];
  /** `kind`, with `is_preprint` folded in (docs/05 §9). */
  readonly kind: readonly string[];
  /** "How it is known": the inclusion criteria, which overlap by design. */
  readonly criterion: readonly number[];
  /** "On UWPR's list": true, false, or unset. */
  readonly onOfficialList: boolean | null;
  /** The explorer's free-text box over title, author and venue (docs/06 §4.8). */
  readonly search: string;
}

export const EMPTY_FILTER: FilterState = {
  year: [],
  domain: [],
  field: [],
  subfield: [],
  topic: [],
  journal: [],
  institution: [],
  country: [],
  author: [],
  oa: [],
  kind: [],
  criterion: [],
  onOfficialList: null,
  search: '',
};

function toggleIn<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

/** Add a value to a dimension, or remove it if already selected. This is what a chart click does. */
export function toggleString(
  state: FilterState,
  dimension: StringDimension,
  value: string,
): FilterState {
  return { ...state, [dimension]: toggleIn(state[dimension], value) };
}

export function toggleYear(state: FilterState, year: number): FilterState {
  return { ...state, year: toggleIn(state.year, year) };
}

export function toggleCriterion(state: FilterState, criterion: number): FilterState {
  return { ...state, criterion: toggleIn(state.criterion, criterion) };
}

export function setOfficialList(state: FilterState, value: boolean | null): FilterState {
  return { ...state, onOfficialList: value };
}

export function setSearch(state: FilterState, search: string): FilterState {
  return { ...state, search };
}

/** The number of individual selections, which is what the sticky bar's chips count. */
export function activeCount(state: FilterState): number {
  let count = state.year.length + state.criterion.length;
  for (const dimension of STRING_DIMENSIONS) count += state[dimension].length;
  if (state.onOfficialList !== null) count += 1;
  if (state.search.trim() !== '') count += 1;
  return count;
}

export const isUnfiltered = (state: FilterState): boolean => activeCount(state) === 0;

export const clearAll = (): FilterState => EMPTY_FILTER;

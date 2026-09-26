/**
 * Filter state in the URL (docs/06 B5).
 *
 * "A filtered view is the unit people cite in reports. It must be linkable and reproducible."
 *
 * Values are carried as *repeated* parameters rather than one comma-joined parameter, because
 * journal and institution names contain commas ("Biochimica et Biophysica Acta, Molecular …")
 * and a separator that appears inside values cannot round-trip. Encoding sorts each dimension so
 * that the same selection always produces the same URL, whatever order the reader clicked in.
 *
 * Agency codes and grant keys (docs/09 §8.2) ride as they are, like every other value:
 * `URLSearchParams` percent-encodes the `:` of `NIH:R01GM086688`, as the entity paths do
 * (`routing/route.ts`), and a hand-typed raw `:` reads back the same.
 */
import type { InstitutionWide } from './funding';
import { EMPTY_FILTER, STRING_DIMENSIONS, type FilterState } from './state';

/** `list=yes` / `list=no` for "on UWPR's own publications list". */
const LIST_PARAM = 'list';
const YEAR_PARAM = 'year';
const CRITERION_PARAM = 'criterion';
const SEARCH_PARAM = 'q';
/**
 * docs/09 §12.4: the institution-wide position, written **only** when the reader excludes them.
 * Included is the default (F4), so the default URL, and every URL shared before this parameter
 * existed, means what it always did.
 */
const INSTITUTION_WIDE_PARAM = 'institution_wide';
const INSTITUTION_WIDE_EXCLUDED = 'exclude';

export function encodeFilter(state: FilterState): URLSearchParams {
  const params = new URLSearchParams();
  for (const year of [...state.year].sort((a, b) => a - b)) {
    params.append(YEAR_PARAM, String(year));
  }
  for (const dimension of STRING_DIMENSIONS) {
    for (const value of [...state[dimension]].sort()) params.append(dimension, value);
  }
  for (const criterion of [...state.criterion].sort((a, b) => a - b)) {
    params.append(CRITERION_PARAM, String(criterion));
  }
  if (state.onOfficialList !== null) params.set(LIST_PARAM, state.onOfficialList ? 'yes' : 'no');
  if (state.search.trim() !== '') params.set(SEARCH_PARAM, state.search);
  return params;
}

/** The query string as it appears in the address bar, `''` when nothing is selected. */
export function encodeFilterToQuery(state: FilterState): string {
  const query = encodeFilter(state).toString();
  return query === '' ? '' : `?${query}`;
}

function integers(params: URLSearchParams, name: string): number[] {
  const seen = new Set<number>();
  for (const raw of params.getAll(name)) {
    // A hand-edited or truncated URL is a normal thing to receive; an unreadable value is
    // dropped rather than rendered as NaN.
    if (/^-?\d+$/.test(raw)) seen.add(Number(raw));
  }
  return [...seen].sort((a, b) => a - b);
}

function strings(params: URLSearchParams, name: string): string[] {
  const seen = new Set<string>();
  for (const raw of params.getAll(name)) if (raw !== '') seen.add(raw);
  return [...seen].sort();
}

export function decodeFilter(params: URLSearchParams): FilterState {
  const list = params.get(LIST_PARAM);
  return {
    ...EMPTY_FILTER,
    year: integers(params, YEAR_PARAM),
    domain: strings(params, 'domain'),
    field: strings(params, 'field'),
    subfield: strings(params, 'subfield'),
    topic: strings(params, 'topic'),
    journal: strings(params, 'journal'),
    institution: strings(params, 'institution'),
    country: strings(params, 'country'),
    author: strings(params, 'author'),
    oa: strings(params, 'oa'),
    kind: strings(params, 'kind'),
    agency: strings(params, 'agency'),
    grant: strings(params, 'grant'),
    criterion: integers(params, CRITERION_PARAM),
    onOfficialList: list === 'yes' ? true : list === 'no' ? false : null,
    search: params.get(SEARCH_PARAM) ?? '',
  };
}

export const decodeFilterFromQuery = (query: string): FilterState =>
  decodeFilter(new URLSearchParams(query));

/**
 * Add the institution-wide position to a query. It is view state rather than a filter — it
 * narrows no publication — so `routing/view.ts` composes it, as it does the sort; the parameter
 * is spelled here, beside the filter's, so one module owns every name the funding view reads.
 */
export function encodeInstitutionWide(params: URLSearchParams, value: InstitutionWide): void {
  if (value === 'exclude') params.set(INSTITUTION_WIDE_PARAM, INSTITUTION_WIDE_EXCLUDED);
}

/** Excluded only when the URL says exactly so; anything else a hand-edited URL holds is the default. */
export function decodeInstitutionWide(params: URLSearchParams): InstitutionWide {
  return params.get(INSTITUTION_WIDE_PARAM) === INSTITUTION_WIDE_EXCLUDED ? 'exclude' : 'include';
}

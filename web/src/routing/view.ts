/**
 * The whole of the query string: the filter (docs/06 B5) and the explorer's ordering.
 *
 * "Filter and view state live in the URL. A filtered view is the unit people cite in reports. It
 * must be linkable and reproducible." The explorer's sort is view state by the same argument —
 * a link to "the most cited publications under this filter" is worth as much as the filter — so
 * it travels in the same query string rather than being lost on reload.
 *
 * `filter/url.ts` stays the sole owner of the filter's encoding; this module composes it with
 * the two sort parameters and never reaches inside it.
 */
import { DEFAULT_SORT, isSortKey, type Sort } from '../aggregate/explorer';
import { decodeFilter, encodeFilter } from '../filter/url';
import type { FilterState } from '../filter/state';

const SORT_PARAM = 'sort';
const DIRECTION_PARAM = 'dir';

export interface ViewState {
  filter: FilterState;
  sort: Sort;
}

export function encodeView(view: ViewState): URLSearchParams {
  const params = encodeFilter(view.filter);
  // The default ordering is left out, so an unfiltered, unsorted view has an empty query and the
  // page's own URL is the one people share.
  if (view.sort.key !== DEFAULT_SORT.key) params.set(SORT_PARAM, view.sort.key);
  if (view.sort.direction !== DEFAULT_SORT.direction)
    params.set(DIRECTION_PARAM, view.sort.direction);
  return params;
}

export function encodeViewToQuery(view: ViewState): string {
  const query = encodeView(view).toString();
  return query === '' ? '' : `?${query}`;
}

export function decodeView(search: string): ViewState {
  const params = new URLSearchParams(search);
  const key = params.get(SORT_PARAM);
  const direction = params.get(DIRECTION_PARAM);
  return {
    filter: decodeFilter(params),
    sort: {
      key: key !== null && isSortKey(key) ? key : DEFAULT_SORT.key,
      direction: direction === 'asc' || direction === 'desc' ? direction : DEFAULT_SORT.direction,
    },
  };
}

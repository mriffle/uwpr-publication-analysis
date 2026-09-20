/**
 * Filter state in the URL, through the History API (docs/06 B5, §3).
 *
 * The React half of `filter/url.ts`, which stays pure. State "survives reload, back and forward,
 * and sharing" (docs/06 §6), so back and forward are wired to `popstate` rather than left to
 * reset the page.
 */
import { useCallback, useEffect, useState } from 'react';
import { decodeFilterFromQuery, encodeFilterToQuery } from '../filter/url';
import type { FilterState } from '../filter/state';

export interface FilterUrl {
  filter: FilterState;
  setFilter: (next: FilterState) => void;
}

export function useFilterUrl(): FilterUrl {
  const [filter, setState] = useState<FilterState>(() =>
    decodeFilterFromQuery(window.location.search),
  );

  useEffect(() => {
    const onPop = () => {
      setState(decodeFilterFromQuery(window.location.search));
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  const setFilter = useCallback((next: FilterState) => {
    setState(next);
    const query = encodeFilterToQuery(next);
    window.history.pushState(
      null,
      '',
      `${window.location.pathname}${query}${window.location.hash}`,
    );
  }, []);

  return { filter, setFilter };
}

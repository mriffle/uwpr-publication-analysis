/**
 * The browser location as React state (docs/06 §3, B5).
 *
 * The React half of `route.ts` and `view.ts`, which stay pure. One hook owns the History API for
 * the whole app, because the route and the filter share a URL: two hooks each pushing their own
 * half would drop the other's on every navigation — the filter would vanish on opening a
 * publication, which is precisely what docs/06 §3 says must not happen ("so the reader does not
 * lose a filter they spent a minute building").
 *
 * State "survives reload, back and forward, and sharing" (docs/06 §6), so `popstate` is wired
 * rather than left to reset the page. The entry's `history.state` is part of the location for
 * the same reason: it is where the way back lives (`routing/navigation.ts`), and it too has to
 * come back with the entry.
 */
import { useCallback, useEffect, useState } from 'react';

export interface AppLocation {
  pathname: string;
  search: string;
  /**
   * The entry's `history.state`: what the app pushed with it (`routing/navigation.ts`), or null
   * for an entry the browser made. Read, never trusted — anything can be there.
   */
  state: unknown;
}

export interface NavigateOptions {
  /** Replace the entry on screen rather than push one: a correction, not a step. */
  replace?: boolean;
  /**
   * Stored with the entry. A push without it stores null, so a peer step — the view switch, a
   * filter change — has no way "back" to offer. A replace without it keeps the entry's own, so
   * correcting a URL does not forget where its page came from.
   */
  state?: unknown;
}

export type NavigateTo = Partial<Pick<AppLocation, 'pathname' | 'search'>>;

export interface UseLocation extends AppLocation {
  navigate: (to: NavigateTo, options?: NavigateOptions) => void;
}

const current = (): AppLocation => ({
  pathname: window.location.pathname,
  search: window.location.search,
  state: window.history.state as unknown,
});

export function useLocation(): UseLocation {
  const [location, setLocation] = useState<AppLocation>(current);

  useEffect(() => {
    const onPop = () => {
      setLocation(current());
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  // The History API is called here and not inside a state updater: React may run an updater
  // twice (StrictMode does, in development), and a push is not something to do twice. The
  // browser's own location is the current one by definition, so it is what `to` is merged into.
  const navigate = useCallback((to: NavigateTo, options?: NavigateOptions) => {
    const pathname = to.pathname ?? window.location.pathname;
    const search = to.search ?? window.location.search;
    const replace = options?.replace ?? false;
    let state: unknown = null;
    if (options !== undefined && 'state' in options) state = options.state;
    else if (replace) state = window.history.state as unknown;
    const url = `${pathname}${search}${window.location.hash}`;
    if (replace) window.history.replaceState(state, '', url);
    else window.history.pushState(state, '', url);
    setLocation({ pathname, search, state });
  }, []);

  return { ...location, navigate };
}

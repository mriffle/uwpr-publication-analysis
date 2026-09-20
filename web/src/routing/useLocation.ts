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
 * rather than left to reset the page.
 */
import { useCallback, useEffect, useState } from 'react';

export interface AppLocation {
  pathname: string;
  search: string;
}

export interface UseLocation extends AppLocation {
  navigate: (to: Partial<AppLocation>, options?: { replace?: boolean }) => void;
}

const current = (): AppLocation => ({
  pathname: window.location.pathname,
  search: window.location.search,
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

  const navigate = useCallback((to: Partial<AppLocation>, options?: { replace?: boolean }) => {
    setLocation((previous) => {
      const next = {
        pathname: to.pathname ?? previous.pathname,
        search: to.search ?? previous.search,
      };
      const url = `${next.pathname}${next.search}${window.location.hash}`;
      if (options?.replace) window.history.replaceState(null, '', url);
      else window.history.pushState(null, '', url);
      return next;
    });
  }, []);

  return { ...location, navigate };
}

/**
 * The app shell: the loading, failure and version states of docs/06 §7, the router of §3, and
 * the alias resolution of §7.
 *
 * "Loading and failure are designed states, not blank screens."
 *
 * One hook owns the URL (`routing/useLocation`), because the route and the filter share it. A
 * publication opened from the overview keeps the query string, so going back returns to exactly
 * the filtered view the reader built (docs/06 §3); reached cold, there is no query to keep and
 * the detail offers a route to an unfiltered overview instead.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { toggleSort, type SortKey } from './aggregate/explorer';
import { NotIncludedAnswer } from './components/NotIncludedAnswer';
import { basePath, exportUrl, lookupUrl } from './contract/config';
import { parseIdentifier } from './contract/identifier';
import { describeFailure } from './contract/load';
import { buildWorkIndex, resolveFromExport, resolveFromLookup } from './contract/resolve';
import { useExportDocument } from './contract/useExport';
import { useLookupIndex } from './contract/useLookup';
import type { ExportDocument, Work } from './contract/types';
import type { Fetcher } from './contract/load';
import { lookupPath, methodPath, overviewPath, parseRoute, publicationPath } from './routing/route';
import { useLocation } from './routing/useLocation';
import { decodeView, encodeViewToQuery } from './routing/view';
import type { FilterState } from './filter/state';
import { Method } from './views/Method';
import { Lookup } from './views/Lookup';
import { Overview } from './views/Overview';
import { PublicationDetail } from './views/PublicationDetail';

export interface AppProps {
  /** Overridden in tests; the browser's `fetch` otherwise. */
  fetcher?: Fetcher;
  url?: string;
  lookupUrlOverride?: string;
  now?: Date;
  /** 0 in tests, so a keystroke in the explorer's search box lands without a timer. */
  searchDebounceMs?: number;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="page">
      <h1>Publications</h1>
      {children}
    </main>
  );
}

export function App({
  fetcher,
  url = exportUrl(),
  lookupUrlOverride,
  now,
  searchDebounceMs,
}: AppProps) {
  const resolvedFetcher = fetcher ?? fetch;
  const { state, retry } = useExportDocument(url, resolvedFetcher);

  if (state.status === 'loading') {
    // A skeleton layout, not a spinner over an empty page (docs/06 §7).
    return (
      <Shell>
        <div className="chart-skeleton" role="status">
          Loading the publication data…
        </div>
      </Shell>
    );
  }

  if (state.status === 'failed') {
    const { failure } = state;
    return (
      <Shell>
        <div className="notice notice-error" role="alert">
          <p>{describeFailure(failure)}</p>
          {failure.kind === 'schema-version' ? null : (
            <button type="button" onClick={retry}>
              Try again
            </button>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Router
      doc={state.data}
      fetcher={resolvedFetcher}
      lookupHref={lookupUrlOverride ?? lookupUrl()}
      {...(now ? { now } : {})}
      {...(searchDebounceMs === undefined ? {} : { searchDebounceMs })}
    />
  );
}

interface RouterProps {
  doc: ExportDocument;
  fetcher: Fetcher;
  lookupHref: string;
  now?: Date;
  searchDebounceMs?: number;
}

export function Router({ doc, fetcher, lookupHref, now, searchDebounceMs }: RouterProps) {
  const base = basePath();
  const { pathname, search, navigate } = useLocation();
  const route = parseRoute(pathname, base);
  const view = useMemo(() => decodeView(search), [search]);
  const index = useMemo(() => buildWorkIndex(doc), [doc]);

  // Whether there is an overview behind this detail to go back to (docs/06 §3). It becomes true
  // the moment the reader has seen one, and never false again: a reader who opened the overview,
  // opened a publication and pressed back twice is still in a session with an overview in it.
  const [seenOverview, setSeenOverview] = useState(route.kind === 'overview');
  if (route.kind === 'overview' && !seenOverview) setSeenOverview(true);

  // The method page is reached from the overview and from a headline figure's definition link
  // (docs/06 §4.1, §4.2). It carries no filter of its own: it describes how the corpus was
  // assembled, which no filter changes, so the query string is deliberately left behind and the
  // way back is to the unfiltered publication list.
  const methodHref = methodPath(base);

  const setFilter = useCallback(
    (filter: FilterState) => {
      navigate({ search: encodeViewToQuery({ ...view, filter }) });
    },
    [navigate, view],
  );

  const setSort = useCallback(
    (key: SortKey) => {
      navigate({ search: encodeViewToQuery({ ...view, sort: toggleSort(view.sort, key) }) });
    },
    [navigate, view],
  );

  const publicationHref = useCallback(
    (work: Work) => `${publicationPath(work.id, base)}${search}`,
    [base, search],
  );

  // True while the entry on screen is one this app pushed, so closing the detail can pop it
  // rather than push a third entry. Without this, opening and closing five publications leaves
  // ten entries to press Back through, and the detail docs/06 §3 describes as opening "over" the
  // overview would never close again.
  const openedInApp = useRef(false);

  const openPublication = useCallback(
    (work: Work) => {
      openedInApp.current = true;
      navigate({ pathname: publicationPath(work.id, base) });
    },
    [navigate, base],
  );

  const backToOverview = useCallback(() => {
    if (openedInApp.current) {
      openedInApp.current = false;
      window.history.back();
      return;
    }
    navigate({ pathname: overviewPath(base) });
  }, [navigate, base]);

  // The method page carries no filter, so its URL drops the query rather than showing a filter
  // that changes nothing on it. Going back pops the entry, which restores the reader's filtered
  // overview exactly — the same mechanism that keeps the filter across a publication detail.
  const openMethod = useCallback(() => {
    openedInApp.current = true;
    navigate({ pathname: methodHref, search: '' });
  }, [navigate, methodHref]);

  const lookupRoutePath = lookupPath(base);
  const openLookup = useCallback(() => {
    openedInApp.current = true;
    navigate({ pathname: lookupRoutePath, search: '' });
  }, [navigate, lookupRoutePath]);

  // docs/06 §7: the export's own aliases resolve retired work IDs and are already loaded; an
  // external identifier resolves only through the lookup index, which is fetched only when the
  // export could not answer. `needsLookup` is that condition, and nothing else triggers a fetch.
  const fromExport = route.kind === 'publication' ? resolveFromExport(index, route.id) : null;
  const needsLookup = route.kind === 'publication' && fromExport === null;
  const lookup = useLookupIndex(needsLookup, lookupHref, fetcher);

  if (route.kind === 'overview') {
    return (
      <Overview
        doc={doc}
        filter={view.filter}
        onFilter={setFilter}
        sort={view.sort}
        onSort={setSort}
        publicationHref={publicationHref}
        onOpenPublication={openPublication}
        methodHref={methodHref}
        onOpenMethod={openMethod}
        lookupHref={lookupRoutePath}
        onOpenLookup={openLookup}
        {...(now ? { now } : {})}
        {...(searchDebounceMs === undefined ? {} : { searchDebounceMs })}
      />
    );
  }

  if (route.kind === 'method') {
    return (
      <Method
        doc={doc}
        overviewHref={overviewPath(base)}
        {...(seenOverview ? { onClose: backToOverview } : {})}
        {...(now ? { now } : {})}
      />
    );
  }

  if (route.kind === 'lookup') {
    return (
      <Lookup
        doc={doc}
        index={index}
        lookupHref={lookupHref}
        fetcher={fetcher}
        overviewHref={overviewPath(base)}
        methodHref={methodHref}
        publicationHref={publicationHref}
        onOpenPublication={openPublication}
      />
    );
  }

  if (route.kind === 'unknown') {
    return (
      <Shell>
        <div className="notice" role="alert">
          <p>There is no page at this address.</p>
          <a href={`${overviewPath(base)}${search}`}>See all publications</a>
        </div>
      </Shell>
    );
  }

  const detail = (work: Work, resolvedFrom: string | null) => (
    <PublicationDetail
      work={work}
      resource={doc.resource}
      citationsAsOf={doc.sources.citations.as_of}
      standalone={!seenOverview}
      overviewHref={`${overviewPath(base)}${search}`}
      resolvedFrom={resolvedFrom}
      {...(seenOverview ? { onClose: backToOverview } : {})}
    />
  );

  if (fromExport !== null && fromExport.status === 'found') {
    return detail(fromExport.work, fromExport.retiredId);
  }

  if (lookup.status === 'loading' || lookup.status === 'idle') {
    return (
      <Shell>
        <div className="chart-skeleton" role="status">
          Looking up {route.id}…
        </div>
      </Shell>
    );
  }

  if (lookup.status === 'ready') {
    const resolution = resolveFromLookup(index, lookup.data, route.id);
    if (resolution.status === 'found') return detail(resolution.work, resolution.retiredId);
    if (resolution.status === 'not-included') {
      // The same card `/lookup` renders (docs/05 §8, docs/06 §5). This is the likelier way to
      // reach a rejection — it is the URL a colleague pastes into an email — so it gets the
      // fuller answer, not the barer one: the reason, what it does not mean, each near miss with
      // why it is deliberately not evidence, and how to report a correction.
      //
      // It carries the `h1` here, because the card is the page; there is no overview above it to
      // put a heading of its own in front. And it offers the form, which the reader has not seen.
      return (
        <main className="page">
          <NotIncludedAnswer
            row={resolution.row}
            resource={doc.resource}
            methodHref={methodHref}
            query={parseIdentifier(route.id)}
            headingLevel={1}
            arrival="followed"
          >
            <p className="lookup-more answer-ways-on">
              <a href={`${overviewPath(base)}${search}`}>See all publications</a>
              <a
                href={lookupRoutePath}
                onClick={(event) => {
                  if (!event.metaKey && !event.ctrlKey && event.button === 0) {
                    event.preventDefault();
                    openLookup();
                  }
                }}
              >
                Look up another publication
              </a>
            </p>
          </NotIncludedAnswer>
        </main>
      );
    }
  }

  return (
    <Shell>
      <div className="notice" role="alert">
        <p>
          No publication was found for <code>{route.id}</code>.
          {lookup.status === 'failed'
            ? ' The index of everything considered could not be loaded, so this answer is incomplete.'
            : ' Nothing in this project has that identifier, which says nothing about the paper itself.'}
        </p>
        <a href={`${overviewPath(base)}${search}`}>See all publications</a>
      </div>
    </Shell>
  );
}

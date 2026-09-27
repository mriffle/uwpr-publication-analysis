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
 *
 * **The way back is stored with the history entry** (`routing/navigation.ts`). Every in-app open
 * pushes `{ back: <the route being left> }`, and a page offers "Back to …" only when its entry
 * carries one, labelled with the page it returns to. So a publication opened from the lookup
 * says "Back to the lookup", and the offer survives reload, back and forward.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { toggleSort, type SortKey } from './aggregate/explorer';
import type { FundingLinks } from './components/FundingLinks';
import { NotIncludedAnswer } from './components/NotIncludedAnswer';
import type { SiteView, ViewSwitch } from './components/SiteHeader';
import { basePath, exportUrl, fundingEnabled, lookupUrl } from './contract/config';
import { parseIdentifier } from './contract/identifier';
import { describeFailure } from './contract/load';
import { fundingOf } from './contract/funding';
import { buildWorkIndex, resolveFromExport, resolveFromLookup } from './contract/resolve';
import { useExportDocument } from './contract/useExport';
import { useLookupIndex } from './contract/useLookup';
import type { ExportDocument, Work } from './contract/types';
import type { Fetcher } from './contract/load';
import { isPlainLeftClick } from './routing/clicks';
import { backLabel, entryFrom, readBack, shellTitle } from './routing/navigation';
import {
  agencyPath,
  fundingPath,
  grantPath,
  lookupPath,
  methodPath,
  overviewPath,
  parseRoute,
  publicationPath,
} from './routing/route';
import { useLocation, type NavigateOptions, type NavigateTo } from './routing/useLocation';
import { decodeView, encodeViewToQuery } from './routing/view';
import type { InstitutionWide } from './filter/funding';
import type { FilterState } from './filter/state';
import { Agency } from './views/Agency';
import { Funding } from './views/Funding';
import { Grant } from './views/Grant';
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

/** The page frame of a state that has no view of its own, under the route's own name. */
function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="page">
      <h1>{title}</h1>
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

  // The address is known before the data is, so the loading and failure states are titled for
  // the page the reader asked for rather than all claiming to be the publications.
  const title = shellTitle(
    parseRoute(window.location.pathname, basePath(), { funding: fundingEnabled() }),
  );

  if (state.status === 'loading') {
    // A skeleton layout, not a spinner over an empty page (docs/06 §7).
    return (
      <Shell title={title}>
        <div className="chart-skeleton" role="status">
          Loading the publication data…
        </div>
      </Shell>
    );
  }

  if (state.status === 'failed') {
    const { failure } = state;
    return (
      <Shell title={title}>
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
  // Off in the production build until the Funding impact view is released: its routes are then
  // no route at all, and nothing links to it (`contract/config.ts`).
  const funding = fundingEnabled();
  const { pathname, search, state, navigate } = useLocation();
  const route = parseRoute(pathname, base, { funding });
  const view = useMemo(() => decodeView(search), [search]);
  const index = useMemo(() => buildWorkIndex(doc), [doc]);

  // The view the switch has just opened, so that it can take focus (docs/06 §9): the link the
  // reader activated belonged to the page that has gone, and focus would otherwise fall to the
  // document. The funding view always focuses its heading as it opens; the publications view
  // does so only when the switch brought the reader there — or an agency page's way into it,
  // which is the same step — not on a cold load, and not on a return from a publication, where
  // it never has. Every other step the app takes clears it.
  const [switchedTo, setSwitchedTo] = useState<SiteView | null>(null);
  const go = useCallback(
    (to: NavigateTo, options?: NavigateOptions) => {
      setSwitchedTo(null);
      navigate(to, options);
    },
    [navigate],
  );

  // Where this entry goes back to, if the app opened it (docs/06 §3). Closing pops the entry
  // rather than pushing another — "otherwise opening and closing five publications leaves ten
  // entries to press Back through" (docs/06 §6) — which is also what restores the exact view the
  // reader left, query string and all.
  const back = readBack(state);
  const goBack = useCallback(() => {
    window.history.back();
  }, []);
  const close: { onClose?: () => void; backLabel?: string } =
    back === null ? {} : { onClose: goBack, backLabel: backLabel(back) };

  // What an open from this page stores with the entry it pushes.
  const leaving = route.kind;

  // The method page is reached from the overview and from a headline figure's definition link
  // (docs/06 §4.1, §4.2). It carries no filter of its own: it describes how the corpus was
  // assembled, which no filter changes, so the query string is deliberately left behind and the
  // way back is to the unfiltered publication list.
  const methodHref = methodPath(base);

  const setFilter = useCallback(
    (filter: FilterState) => {
      go({ search: encodeViewToQuery({ ...view, filter }) });
    },
    [go, view],
  );

  const setSort = useCallback(
    (key: SortKey) => {
      go({ search: encodeViewToQuery({ ...view, sort: toggleSort(view.sort, key) }) });
    },
    [go, view],
  );

  // The institution-wide position is view state in the URL (docs/09 §12.4), written only when
  // the reader excludes those awards. A change is a step like a filter change: it pushes.
  const setInstitutionWide = useCallback(
    (position: InstitutionWide) => {
      go({
        search: encodeViewToQuery({
          filter: view.filter,
          sort: view.sort,
          ...(position === 'exclude' ? { institutionWide: position } : {}),
        }),
      });
    },
    [go, view],
  );

  const publicationHref = useCallback(
    (work: Work) => `${publicationPath(work.id, base)}${search}`,
    [base, search],
  );

  const openPublication = useCallback(
    (work: Work) => {
      go({ pathname: publicationPath(work.id, base) }, { state: entryFrom(leaving) });
    },
    [go, base, leaving],
  );

  // An agency or a grant opens the way a publication does (docs/09 §12.3): the query string is
  // kept, so the page's way out returns to the view the reader built, and the entry records the
  // page it was opened from, so its back control names that page. The hrefs carry the same query
  // as the in-app open, so a new tab lands on the same page.
  const fundingLinks: FundingLinks = useMemo(
    () => ({
      agencyHref: (code: string) => `${agencyPath(code, base)}${search}`,
      grantHref: (key: string) => `${grantPath(key, base)}${search}`,
      onOpenAgency: (code: string) => {
        go({ pathname: agencyPath(code, base) }, { state: entryFrom(leaving) });
      },
      onOpenGrant: (key: string) => {
        go({ pathname: grantPath(key, base) }, { state: entryFrom(leaving) });
      },
    }),
    [go, base, search, leaving],
  );

  // The method page carries no filter, so its URL drops the query rather than showing a filter
  // that changes nothing on it. Going back pops the entry, which restores the reader's filtered
  // view exactly — the same mechanism that keeps the filter across a publication detail.
  const openMethod = useCallback(() => {
    go({ pathname: methodHref, search: '' }, { state: entryFrom(leaving) });
  }, [go, methodHref, leaving]);

  const lookupRoutePath = lookupPath(base);
  const openLookup = useCallback(() => {
    go({ pathname: lookupRoutePath, search: '' }, { state: entryFrom(leaving) });
  }, [go, lookupRoutePath, leaving]);

  // The switch between the two views (docs/09): peers, so a switch keeps the query string and
  // stores no way back — neither view opened over the other. It records which view it opened,
  // for the focus (above). An agency page's two ways into a view (§12.6) are the same step with
  // the agency added to the query, so they come here too, with the query they carry.
  const switchView = useCallback(
    (to: SiteView, query?: string) => {
      setSwitchedTo(to);
      navigate({
        pathname: to === 'funding' ? fundingPath(base) : overviewPath(base),
        ...(query === undefined ? {} : { search: query }),
      });
    },
    [navigate, base],
  );
  const views: ViewSwitch | undefined = funding
    ? {
        hrefs: {
          publications: `${overviewPath(base)}${search}`,
          funding: `${fundingPath(base)}${search}`,
        },
        onSwitch: (to) => {
          switchView(to);
        },
      }
    : undefined;

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
        {...(views ? { views } : {})}
        focusHeading={switchedTo === 'publications'}
        {...(now ? { now } : {})}
        {...(searchDebounceMs === undefined ? {} : { searchDebounceMs })}
      />
    );
  }

  if (route.kind === 'funding') {
    return (
      <Funding
        doc={doc}
        filter={view.filter}
        onFilter={setFilter}
        {...(view.institutionWide ? { institutionWide: view.institutionWide } : {})}
        onInstitutionWide={setInstitutionWide}
        filterHref={(filter) => `${pathname}${encodeViewToQuery({ ...view, filter })}`}
        links={fundingLinks}
        methodHref={methodHref}
        onOpenMethod={openMethod}
        lookupHref={lookupRoutePath}
        onOpenLookup={openLookup}
        {...(views ? { views } : {})}
        {...(now ? { now } : {})}
      />
    );
  }

  if (route.kind === 'agency' || route.kind === 'grant') {
    // Entity pages show whole-corpus facts, like a publication; the query string is kept only
    // so the ways out return to the view the reader was looking at. Each is keyed by its code or
    // key, so moving from one agency to another starts the page afresh, its grants table's
    // search and sort with it.
    const fundingHref = `${fundingPath(base)}${search}`;
    if (route.kind === 'grant') {
      return (
        <Grant
          key={route.key}
          doc={doc}
          grantKey={route.key}
          fundingHref={fundingHref}
          links={fundingLinks}
          publicationHref={publicationHref}
          onOpenPublication={openPublication}
          {...close}
        />
      );
    }
    // docs/09 §12.6: "the current filter plus the agency", in either view, the rest of the
    // query (the sort, the institution-wide position) kept.
    const { agency: selected } = view.filter;
    const query = encodeViewToQuery({
      ...view,
      filter: {
        ...view.filter,
        agency: selected.includes(route.key) ? selected : [...selected, route.key],
      },
    });
    const withAgency: ViewSwitch = {
      hrefs: {
        publications: `${overviewPath(base)}${query}`,
        funding: `${fundingPath(base)}${query}`,
      },
      onSwitch: (to) => {
        switchView(to, query);
      },
    };
    return (
      <Agency
        key={route.key}
        doc={doc}
        agencyKey={route.key}
        fundingHref={fundingHref}
        links={fundingLinks}
        publicationHref={publicationHref}
        onOpenPublication={openPublication}
        withAgency={withAgency}
        methodHref={methodHref}
        {...close}
      />
    );
  }

  if (route.kind === 'method') {
    return (
      <Method doc={doc} overviewHref={overviewPath(base)} {...close} {...(now ? { now } : {})} />
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
        {...close}
      />
    );
  }

  if (route.kind === 'unknown') {
    return (
      <Shell title={shellTitle(route)}>
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
      standalone={back === null}
      overviewHref={`${overviewPath(base)}${search}`}
      resolvedFrom={resolvedFrom}
      // Only a build with the Funding impact view has the section (docs/09 §12.12), and its
      // agency and grant links open as the view's do, recording the publication as the way back.
      {...(funding ? { funding: { index: fundingOf(doc), links: fundingLinks } } : {})}
      {...close}
    />
  );

  if (fromExport !== null && fromExport.status === 'found') {
    return detail(fromExport.work, fromExport.retiredId);
  }

  if (lookup.status === 'loading' || lookup.status === 'idle') {
    return (
      <Shell title={shellTitle(route)}>
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
                  if (isPlainLeftClick(event)) {
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
    <Shell title={shellTitle(route)}>
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

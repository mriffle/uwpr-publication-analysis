/**
 * The header the site's two views share (docs/06 §4.1; docs/09): the page's only `h1`, what the
 * page is, when its data was read, and the links to the method page and the lookup.
 *
 * **The view switch is navigation, not tabs** (docs/06 §9). Publications and Funding impact are
 * two pages with two addresses, each linkable and each with its own history entry, so the switch
 * is a `<nav>` of two links with `aria-current="page"` on the one being read. ARIA tabs would
 * promise panels on this page and arrow-key movement between them, and neither is true.
 *
 * Each link carries the reader's query string, so the filter survives a switch in both
 * directions. A plain left click stays in the app as a peer step: it pushes an entry, and the
 * view it opens offers no "back", because it did not open over anything. A modified click is
 * the browser's, which is why the switch is made of links at all.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import type { ExportDocument } from '../contract/types';
import { formatDate } from '../format/date';
import { isPlainLeftClick } from '../routing/clicks';

export type SiteView = 'publications' | 'funding';

/** The two views in the switch's order, with the name each is known by. */
export const SITE_VIEWS: readonly (readonly [SiteView, string])[] = [
  ['publications', 'Publications'],
  ['funding', 'Funding impact'],
];

export interface ViewSwitch {
  /** Each view's address, with the reader's current query string. */
  hrefs: Readonly<Record<SiteView, string>>;
  onSwitch: (view: SiteView) => void;
}

export interface SiteHeaderProps {
  /** The page's one `h1` (docs/06 §9). */
  title: string;
  /** One or two sentences on what the page is. */
  lead: ReactNode;
  current: SiteView;
  /** The dates and the resource's own link come from the export, never from the app. */
  doc: Pick<ExportDocument, 'generated_at' | 'sources' | 'resource'>;
  methodHref: string;
  onOpenMethod: () => void;
  lookupHref: string;
  onOpenLookup: () => void;
  /** The switch between the views, which the app always gives; a test may render without it. */
  views?: ViewSwitch;
  /**
   * Move focus to the heading when the page mounts, so a keyboard or screen-reader user who
   * switched views is told where they now are rather than left on a link that has gone.
   */
  focusHeading?: boolean;
}

export function SiteHeader({
  title,
  lead,
  current,
  doc,
  methodHref,
  onOpenMethod,
  lookupHref,
  onOpenLookup,
  views,
  focusHeading = false,
}: SiteHeaderProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  return (
    <header className="page-header">
      {views ? (
        <nav className="site-views" aria-label="Views">
          <ul>
            {SITE_VIEWS.map(([view, label]) => (
              <li key={view}>
                <a
                  href={views.hrefs[view]}
                  aria-current={view === current ? 'page' : undefined}
                  onClick={(event) => {
                    if (!isPlainLeftClick(event)) return;
                    event.preventDefault();
                    // The page being read is already the one on screen: a second entry for it
                    // would be one more press of Back for nothing.
                    if (view !== current) views.onSwitch(view);
                  }}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      <h1 ref={headingRef} tabIndex={focusHeading ? -1 : undefined}>
        {title}
      </h1>
      <p>{lead}</p>
      <p>
        Data generated {formatDate(doc.generated_at)}. Citations from {doc.sources.citations.name}{' '}
        as of {formatDate(doc.sources.citations.as_of)}.{' '}
        <a href={doc.resource.url}>{doc.resource.short_name}</a>
      </p>
      {/* §4.1: the header links to the method page and to the lookup. */}
      <p>
        <a
          href={methodHref}
          onClick={(event) => {
            if (isPlainLeftClick(event)) {
              event.preventDefault();
              onOpenMethod();
            }
          }}
        >
          How this was assembled
        </a>
        {' · '}
        <a
          href={lookupHref}
          onClick={(event) => {
            if (isPlainLeftClick(event)) {
              event.preventDefault();
              onOpenLookup();
            }
          }}
        >
          Why is a paper not here?
        </a>
      </p>
    </header>
  );
}

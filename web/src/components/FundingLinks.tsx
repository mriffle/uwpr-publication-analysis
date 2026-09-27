/**
 * The in-app links every funding component draws: to a grant's page and to an agency's page
 * (docs/09 §12.1).
 *
 * Each is a real `<a href>`, so a reader can open it in a new tab or copy it, and the app takes
 * over only a plain left click (`routing/clicks.ts`) — when the view gave it a way to open the
 * page in place, which records where the reader came from (docs/09 §12.3). The views own the
 * addresses and the navigation; the components only ask for them, so the same table serves the
 * Funding impact view and an agency page.
 */
import type { ReactNode } from 'react';
import { isPlainLeftClick } from '../routing/clicks';

export interface FundingLinks {
  /**
   * A grant's page, by key. The app's (`App.tsx`) keep the reader's query string, as a
   * publication's link does, so the page's way out returns to the view the reader built.
   */
  grantHref: (key: string) => string;
  /** An agency's page, by code. */
  agencyHref: (code: string) => string;
  /** Open a grant's page in place on a plain left click; without it the link navigates. */
  onOpenGrant?: ((key: string) => void) | undefined;
  onOpenAgency?: ((code: string) => void) | undefined;
}

interface InAppLinkProps {
  href: string;
  onOpen: (() => void) | undefined;
  children: ReactNode;
}

/**
 * A real link the app opens in place on a plain left click, when it has a way to; the entity
 * pages use it for their publications and their ways into a view, as well as for these.
 */
export function InAppLink({ href, onOpen, children }: InAppLinkProps) {
  return (
    <a
      href={href}
      onClick={(event) => {
        if (onOpen === undefined || !isPlainLeftClick(event)) return;
        event.preventDefault();
        onOpen();
      }}
    >
      {children}
    </a>
  );
}

export function GrantLink({
  links,
  grantKey,
  children,
}: {
  links: FundingLinks;
  grantKey: string;
  children: ReactNode;
}) {
  const open = links.onOpenGrant;
  return (
    <InAppLink
      href={links.grantHref(grantKey)}
      onOpen={
        open === undefined
          ? undefined
          : () => {
              open(grantKey);
            }
      }
    >
      {children}
    </InAppLink>
  );
}

export function AgencyLink({
  links,
  code,
  children,
}: {
  links: FundingLinks;
  code: string;
  children: ReactNode;
}) {
  const open = links.onOpenAgency;
  return (
    <InAppLink
      href={links.agencyHref(code)}
      onOpen={
        open === undefined
          ? undefined
          : () => {
              open(code);
            }
      }
    >
      {children}
    </InAppLink>
  );
}

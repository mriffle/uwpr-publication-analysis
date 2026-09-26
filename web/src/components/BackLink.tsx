/**
 * The way out of a page that opens over another (docs/06 §3).
 *
 * Opened in the app, the page's history entry says which page is behind it
 * (`routing/navigation.ts`), and the control is a button that pops the entry — "Closing a detail
 * pops its history entry rather than pushing another" (docs/06 §6) — labelled with the page it
 * returns to. Reached cold there is nothing behind it, so the control is a link to the page's
 * parent instead, and says so rather than promising a "back" that would leave the site.
 */
import { useEffect } from 'react';

export interface BackLinkProps {
  /** Present only when this entry was opened from another page of the app. */
  onBack?: (() => void) | undefined;
  /** "Back to the lookup": the page one press returns to. */
  backLabel: string;
  /** The page's parent, for a reader who arrived cold: `/` for a publication, `/funding` for a grant. */
  parentHref: string;
  /** "See all publications": what the link goes to, not a direction. */
  parentLabel: string;
}

export function BackLink({ onBack, backLabel, parentHref, parentLabel }: BackLinkProps) {
  return onBack ? (
    <button type="button" className="detail-close" onClick={onBack}>
      {backLabel}
    </button>
  ) : (
    <a className="detail-close" href={parentHref}>
      {parentLabel}
    </a>
  );
}

/**
 * Escape closes a page that opened over another, and only then: arriving cold, Escape has
 * nowhere to go back to within the site, and must not take the reader somewhere they never were.
 */
export function useCloseOnEscape(onClose: (() => void) | undefined): void {
  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);
}
